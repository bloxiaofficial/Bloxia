"""Bloxia backend — accounts, server-side coins, Studio levels, realtime chat, mock purchases."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

# ---------------------------------------------------------------- config
JWT_SECRET = os.environ.get("BLOXIA_JWT_SECRET", "dev-secret-change-me")
JWT_ALGO = "HS256"
TOKEN_TTL = 60 * 60 * 24 * 30  # 30 days
STARTING_COINS = 12500


def _db_dir() -> str:
    for cand in ("/data", os.path.dirname(os.path.abspath(__file__))):
        try:
            os.makedirs(cand, exist_ok=True)
            test = os.path.join(cand, ".wtest")
            with open(test, "w") as f:
                f.write("ok")
            os.remove(test)
            return cand
        except OSError:
            continue
    return os.getcwd()


DB_PATH = os.path.join(_db_dir(), "bloxia.db")

# ---------------------------------------------------------------- db
@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                coins INTEGER NOT NULL DEFAULT 0,
                avatar TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                emoji TEXT NOT NULL DEFAULT '🎮',
                description TEXT NOT NULL DEFAULT '',
                level TEXT NOT NULL,
                plays INTEGER NOT NULL DEFAULT 0,
                likes INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (owner_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS likes (
                user_id INTEGER NOT NULL,
                game_id INTEGER NOT NULL,
                PRIMARY KEY (user_id, game_id)
            );
            CREATE TABLE IF NOT EXISTS chat (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            """
        )


# ---------------------------------------------------------------- auth helpers
def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


def make_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "iat": int(time.time()), "exp": int(time.time()) + TOKEN_TTL}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


bearer = HTTPBearer(auto_error=False)


def _extract_token(request: Request, creds: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    # 1) Custom header (survives proxies that consume Authorization for Basic auth)
    tok = request.headers.get("x-auth-token")
    if tok:
        return tok
    # 2) Standard Authorization: Bearer (direct / non-proxied access)
    if creds and creds.scheme.lower() == "bearer":
        return creds.credentials
    # 3) Query param (used by WebSocket and as a last resort)
    return request.query_params.get("token")


def _require_user_from_token(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(row)


def current_user(request: Request, creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    return _require_user_from_token(_extract_token(request, creds))


def user_public(row: dict) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "coins": row["coins"],
        "avatar": json.loads(row["avatar"] or "{}"),
    }


# ---------------------------------------------------------------- app
app = FastAPI(title="Bloxia API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/health")
@app.get("/api/health")
def health():
    return {"ok": True, "service": "bloxia", "db": DB_PATH}


# ---------------------------------------------------------------- models
class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=4, max_length=128)


class AvatarIn(BaseModel):
    avatar: dict


class GameIn(BaseModel):
    title: str = Field(min_length=1, max_length=40)
    emoji: str = Field(default="🎮", max_length=8)
    description: str = Field(default="", max_length=200)
    level: dict


class PurchaseIn(BaseModel):
    pack: str


class RewardIn(BaseModel):
    amount: int = Field(ge=0, le=5000)


class SpendIn(BaseModel):
    amount: int = Field(ge=1, le=1_000_000)
    reason: str = Field(default="purchase", max_length=60)


COIN_PACKS = {
    "starter": {"coins": 5000, "usd": 4.99},
    "pro": {"coins": 15000, "usd": 9.99},
    "mega": {"coins": 50000, "usd": 24.99},
    "ultra": {"coins": 150000, "usd": 59.99},
}

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]+$")


# ---------------------------------------------------------------- auth routes
@app.post("/api/register")
def register(body: Credentials):
    if not USERNAME_RE.match(body.username):
        raise HTTPException(status_code=400, detail="Username may only contain letters, numbers, and underscores")
    with db() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE username=?", (body.username,)).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="Username already taken")
        default_avatar = json.dumps({"skin": "#f6c177", "shirt": "#e2231a", "pants": "#2b3a55", "face": ":)", "hat": "none"})
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, coins, avatar, created_at) VALUES (?,?,?,?,?)",
            (body.username, hash_password(body.password), STARTING_COINS, default_avatar, int(time.time())),
        )
        uid = cur.lastrowid
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return {"token": make_token(uid), "user": user_public(dict(row))}


@app.post("/api/login")
def login(body: Credentials):
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (body.username,)).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": make_token(row["id"]), "user": user_public(dict(row))}


@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    return {"user": user_public(user)}


@app.put("/api/me/avatar")
def update_avatar(body: AvatarIn, user: dict = Depends(current_user)):
    with db() as conn:
        conn.execute("UPDATE users SET avatar=? WHERE id=?", (json.dumps(body.avatar), user["id"]))
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"user": user_public(dict(row))}


# ---------------------------------------------------------------- coins
@app.get("/api/coins/packs")
def coin_packs():
    return {"packs": COIN_PACKS}


@app.post("/api/coins/purchase")
def purchase(body: PurchaseIn, user: dict = Depends(current_user)):
    pack = COIN_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown pack")
    # Mock/simulated checkout: instantly credit coins (no real payment).
    with db() as conn:
        conn.execute("UPDATE users SET coins = coins + ? WHERE id=?", (pack["coins"], user["id"]))
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"ok": True, "credited": pack["coins"], "user": user_public(dict(row))}


@app.post("/api/coins/reward")
def reward(body: RewardIn, user: dict = Depends(current_user)):
    with db() as conn:
        conn.execute("UPDATE users SET coins = coins + ? WHERE id=?", (body.amount, user["id"]))
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"user": user_public(dict(row))}


@app.post("/api/coins/spend")
def spend(body: SpendIn, user: dict = Depends(current_user)):
    with db() as conn:
        row = conn.execute("SELECT coins FROM users WHERE id=?", (user["id"],)).fetchone()
        if row["coins"] < body.amount:
            raise HTTPException(status_code=400, detail="Not enough coins")
        conn.execute("UPDATE users SET coins = coins - ? WHERE id=?", (body.amount, user["id"]))
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"user": user_public(dict(row))}


# ---------------------------------------------------------------- games / studio
def game_public(row: dict, owner: str) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "emoji": row["emoji"],
        "description": row["description"],
        "plays": row["plays"],
        "likes": row["likes"],
        "owner": owner,
        "created_at": row["created_at"],
    }


@app.post("/api/games")
def create_game(body: GameIn, user: dict = Depends(current_user)):
    if not isinstance(body.level.get("platforms"), list) or not body.level["platforms"]:
        raise HTTPException(status_code=400, detail="Level must include at least one platform")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO games (owner_id, title, emoji, description, level, created_at) VALUES (?,?,?,?,?,?)",
            (user["id"], body.title, body.emoji or "🎮", body.description, json.dumps(body.level), int(time.time())),
        )
        gid = cur.lastrowid
        row = conn.execute("SELECT * FROM games WHERE id=?", (gid,)).fetchone()
    return {"game": game_public(dict(row), user["username"])}


@app.get("/api/games")
def list_games(sort: str = "new", limit: int = 60):
    order = "g.plays DESC" if sort == "popular" else "g.created_at DESC"
    limit = max(1, min(limit, 200))
    with db() as conn:
        rows = conn.execute(
            f"SELECT g.*, u.username AS owner FROM games g JOIN users u ON u.id=g.owner_id ORDER BY {order} LIMIT ?",
            (limit,),
        ).fetchall()
    return {"games": [game_public(dict(r), r["owner"]) for r in rows]}


@app.get("/api/games/{game_id}")
def get_game(game_id: int):
    with db() as conn:
        row = conn.execute(
            "SELECT g.*, u.username AS owner FROM games g JOIN users u ON u.id=g.owner_id WHERE g.id=?",
            (game_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Game not found")
    out = game_public(dict(row), row["owner"])
    out["level"] = json.loads(row["level"])
    return {"game": out}


@app.post("/api/games/{game_id}/play")
def play_game(game_id: int):
    with db() as conn:
        cur = conn.execute("UPDATE games SET plays = plays + 1 WHERE id=?", (game_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Game not found")
        row = conn.execute("SELECT plays FROM games WHERE id=?", (game_id,)).fetchone()
    return {"plays": row["plays"]}


@app.post("/api/games/{game_id}/like")
def like_game(game_id: int, user: dict = Depends(current_user)):
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM likes WHERE user_id=? AND game_id=?", (user["id"], game_id)
        ).fetchone()
        if exists:
            conn.execute("DELETE FROM likes WHERE user_id=? AND game_id=?", (user["id"], game_id))
            conn.execute("UPDATE games SET likes = MAX(0, likes - 1) WHERE id=?", (game_id,))
            liked = False
        else:
            conn.execute("INSERT INTO likes (user_id, game_id) VALUES (?,?)", (user["id"], game_id))
            conn.execute("UPDATE games SET likes = likes + 1 WHERE id=?", (game_id,))
            liked = True
        row = conn.execute("SELECT likes FROM games WHERE id=?", (game_id,)).fetchone()
    return {"liked": liked, "likes": row["likes"] if row else 0}


# ---------------------------------------------------------------- chat
@app.get("/api/chat/recent")
def chat_recent(limit: int = 50):
    limit = max(1, min(limit, 100))
    with db() as conn:
        rows = conn.execute(
            "SELECT username, body, created_at FROM chat ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return {"messages": [dict(r) for r in reversed(rows)]}


class ChatHub:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


hub = ChatHub()


def _user_from_token(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = int(payload["sub"])
    except Exception:
        return None
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return dict(row) if row else None


@app.websocket("/ws/chat")
async def chat_ws(ws: WebSocket, token: Optional[str] = None):
    user = _user_from_token(token)
    if not user:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await hub.connect(ws)
    # send recent history to the newly connected client
    with db() as conn:
        rows = conn.execute(
            "SELECT username, body, created_at FROM chat ORDER BY id DESC LIMIT 50"
        ).fetchall()
    await ws.send_json({"type": "history", "messages": [dict(r) for r in reversed(rows)]})
    await hub.broadcast({"type": "system", "body": f"{user['username']} joined the chat", "created_at": int(time.time())})
    try:
        while True:
            data = await ws.receive_text()
            body = (data or "").strip()[:300]
            if not body:
                continue
            ts = int(time.time())
            with db() as conn:
                conn.execute(
                    "INSERT INTO chat (username, body, created_at) VALUES (?,?,?)",
                    (user["username"], body, ts),
                )
            await hub.broadcast(
                {"type": "message", "username": user["username"], "body": body, "created_at": ts}
            )
    except WebSocketDisconnect:
        hub.disconnect(ws)
        await hub.broadcast({"type": "system", "body": f"{user['username']} left the chat", "created_at": int(time.time())})


# ---------------------------------------------------------------- static frontend
# Serve the Bloxia frontend from the same origin as the API. This avoids CORS
# (and proxy preflight issues) entirely: the browser handles any reverse-proxy
# Basic auth natively, and the app's JWT travels in the X-Auth-Token header.
_STATIC_DIR = os.environ.get("BLOXIA_STATIC_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "static"
)
if not os.path.isdir(_STATIC_DIR) or not os.path.isfile(
    os.path.join(_STATIC_DIR, "index.html")
):
    _here = os.path.dirname(os.path.abspath(__file__))
    # Candidate frontend locations, in priority order:
    #   ../        -> repo root (backend/ lives inside the frontend repo)
    #   ../bloxia  -> sibling checkout layout
    for _cand in (os.path.join(_here, ".."), os.path.join(_here, "..", "bloxia")):
        if os.path.isfile(os.path.join(_cand, "index.html")):
            _STATIC_DIR = os.path.abspath(_cand)
            break

if os.path.isdir(_STATIC_DIR):
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
