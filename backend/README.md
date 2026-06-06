# Bloxia Backend

FastAPI backend powering Bloxia v2: accounts, server-side economy (Bux),
the Studio level store, realtime chat, and a mock coin-purchase flow.
It also serves the static frontend (the repo root) from the same origin,
so no CORS configuration is needed.

## Run locally

```bash
cd backend
pip install -r requirements.txt
# Serve API + frontend on http://localhost:8090
BLOXIA_STATIC_DIR=.. uvicorn main:app --host 0.0.0.0 --port 8090
```

Then open http://localhost:8090.

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `BLOXIA_JWT_SECRET` | `dev-secret-change-me` | HMAC secret for signing JWTs. **Set this in production.** |
| `BLOXIA_STATIC_DIR` | `./static` then `../bloxia` | Directory of the frontend to serve. |
| `BLOXIA_DB` | `bloxia.db` | SQLite database path. |

## Auth model

The JWT is sent in the `X-Auth-Token` header (not `Authorization`) so it
survives reverse proxies that consume `Authorization` for HTTP Basic auth.
WebSocket connections pass the token as a `?token=` query parameter.

## Endpoints (summary)

- `POST /api/register`, `POST /api/login`, `GET /api/me`
- `GET/PUT /api/avatar`
- `POST /api/spend`, `POST /api/reward`, `POST /api/coins/purchase`
- `GET/POST /api/games` (Studio publish + list), `POST /api/games/{id}/play`
- `WS /ws/chat?token=...`
