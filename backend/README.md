# FastAPI KV Short URL Service

A minimal REST API with persistent SQLite storage.

Database path: `backend/data/kv.db`.

## Endpoints

- `POST /kv`
  - Request body: `{ "value_b64": "<base64-content>" }`
  - Response: `{ "key": "<short-key>" }` (random URL-safe token, about 8 chars)

- `GET /kv/{key}`
  - Response: `{ "key": "<short-key>", "value_b64": "<base64-content>" }`

## Run

```bash
cd backend
uv venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port 8787 --reload
```

Open API docs at `http://127.0.0.1:8787/docs`.
