from __future__ import annotations

import base64
import secrets
from contextlib import asynccontextmanager
from math import ceil
from pathlib import Path
from typing import AsyncGenerator

import aiosqlite
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DB_PATH = DATA_DIR / "kv.db"
KEY_NBYTES = 6
MAX_KEY_GENERATION_RETRIES = 8
MAX_VALUE_BYTES = 2 * 1024
MAX_VALUE_B64_CHARS = ceil(MAX_VALUE_BYTES / 3) * 4
# Slight overhead for JSON wrapper: {"value_b64":"..."}
MAX_KV_REQUEST_BYTES = MAX_VALUE_B64_CHARS + 128

def generate_short_key() -> str:
    # 6 random bytes map to an 8-char URL-safe token without padding.
    return secrets.token_urlsafe(KEY_NBYTES)


def normalize_and_validate_base64(raw: str) -> str:
    value = raw.strip()
    if not value:
        raise ValueError("value_b64 cannot be empty")

    if len(value) > MAX_VALUE_B64_CHARS:
        raise ValueError(f"value_b64 must be <= {MAX_VALUE_B64_CHARS} characters")

    # Accept URL-safe and standard Base64. Validate that it decodes cleanly.
    padded = value + ("=" * ((4 - len(value) % 4) % 4))
    try:
        decoded = base64.b64decode(padded.replace("-", "+").replace("_", "/"), validate=True)
    except Exception as exc:  # pragma: no cover - exact exception type is implementation detail
        raise ValueError("value_b64 must be valid base64") from exc

    if len(decoded) > MAX_VALUE_BYTES:
        raise ValueError(f"decoded payload must be <= {MAX_VALUE_BYTES} bytes")

    return value


async def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS kv_store (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                value_b64 TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await migrate_db(conn)
        await conn.commit()


async def migrate_db(conn: aiosqlite.Connection) -> None:
    pragma_cursor = await conn.execute("PRAGMA table_info(kv_store)")
    pragma_rows = await pragma_cursor.fetchall()
    columns = {row[1] for row in pragma_rows}

    if "key" not in columns:
        await conn.execute("ALTER TABLE kv_store ADD COLUMN key TEXT")

    missing_cursor = await conn.execute(
        "SELECT id FROM kv_store WHERE key IS NULL OR key = ''"
    )
    missing_key_rows = await missing_cursor.fetchall()
    for row in missing_key_rows:
        row_id = row[0]
        for _ in range(MAX_KEY_GENERATION_RETRIES):
            candidate = generate_short_key()
            try:
                await conn.execute("UPDATE kv_store SET key = ? WHERE id = ?", (candidate, row_id))
                break
            except aiosqlite.IntegrityError:
                continue
        else:
            raise RuntimeError("failed to generate unique key while migrating existing rows")

    await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key)")


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row
    try:
        yield conn
    finally:
        await conn.close()


class CreateKVRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value_b64: str = Field(min_length=1)

    @field_validator("value_b64")
    @classmethod
    def validate_value_b64(cls, v: str) -> str:
        return normalize_and_validate_base64(v)


class CreateKVResponse(BaseModel):
    key: str


class GetKVResponse(BaseModel):
    key: str
    value_b64: str


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(title="KV Short URL API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def limit_kv_request_size(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/kv":
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_KV_REQUEST_BYTES:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={"detail": f"request body must be <= {MAX_KV_REQUEST_BYTES} bytes"},
                    )
            except ValueError:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={"detail": "invalid content-length header"},
                )

    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://y-guang.github.io",
    ],
    allow_origin_regex=(
        r"^https://([A-Za-z0-9-]+\.)?yangguang\.dev$"
        r"|^https?://localhost(?::\d+)?$"
        r"|^https?://127\.0\.0\.1(?::\d+)?$"
    ),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/kv", response_model=CreateKVResponse, status_code=201)
async def create_kv(
    payload: CreateKVRequest, db: aiosqlite.Connection = Depends(get_db)
) -> CreateKVResponse:
    for _ in range(MAX_KEY_GENERATION_RETRIES):
        key = generate_short_key()
        try:
            await db.execute("INSERT INTO kv_store(key, value_b64) VALUES (?, ?)", (key, payload.value_b64))
            await db.commit()
            return CreateKVResponse(key=key)
        except aiosqlite.IntegrityError:
            # Retry if random key collides with an existing one.
            continue

    raise HTTPException(status_code=500, detail="failed to generate unique key")


@app.get("/kv/{key}", response_model=GetKVResponse)
async def get_kv(key: str, db: aiosqlite.Connection = Depends(get_db)) -> GetKVResponse:
    cursor = await db.execute("SELECT value_b64 FROM kv_store WHERE key = ?", (key,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="key not found")

    return GetKVResponse(key=key, value_b64=row["value_b64"])
