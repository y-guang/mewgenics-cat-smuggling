from __future__ import annotations

import base64
import hashlib
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


def hash_payload(value_b64: str) -> str:
    return hashlib.sha256(value_b64.encode("utf-8")).hexdigest()


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
                value_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await conn.commit()


async def find_key_by_hash(db: aiosqlite.Connection, value_hash: str) -> str | None:
    cursor = await db.execute("SELECT key FROM kv_store WHERE value_hash = ?", (value_hash,))
    row = await cursor.fetchone()
    return row["key"] if row else None


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
    value_hash = hash_payload(payload.value_b64)

    existing_key = await find_key_by_hash(db, value_hash)
    if existing_key:
        return CreateKVResponse(key=existing_key)

    for _ in range(MAX_KEY_GENERATION_RETRIES):
        key = generate_short_key()
        try:
            await db.execute(
                "INSERT INTO kv_store(key, value_b64, value_hash) VALUES (?, ?, ?)",
                (key, payload.value_b64, value_hash),
            )
            await db.commit()
            return CreateKVResponse(key=key)
        except aiosqlite.IntegrityError:
            # Either key collided or concurrent insert wrote this payload hash first.
            existing_key = await find_key_by_hash(db, value_hash)
            if existing_key:
                return CreateKVResponse(key=existing_key)
            continue

    raise HTTPException(status_code=500, detail="failed to generate unique key")


@app.get("/kv/{key}", response_model=GetKVResponse)
async def get_kv(key: str, db: aiosqlite.Connection = Depends(get_db)) -> GetKVResponse:
    cursor = await db.execute("SELECT value_b64 FROM kv_store WHERE key = ?", (key,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="key not found")

    return GetKVResponse(key=key, value_b64=row["value_b64"])
