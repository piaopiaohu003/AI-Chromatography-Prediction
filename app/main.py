"""FastAPI application exposing the chromatography simulation and design API."""

from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import ai_client, auth
from .compounds import CATEGORIES, COMPOUNDS
from .identify import identify
from .pubchem import search_online
from .models import (
    AITestRequest,
    AuthRequest,
    FavoriteRequest,
    IdentifyRequest,
    PasswordChangeRequest,
    PreferencesPayload,
    RecommendRequest,
    SimulateRequest,
)
from .recommend import recommend
from .simulation import simulate

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"

app = FastAPI(
    title="ChromAI · 智能色谱方法平台",
    description="Reversed-phase and normal-phase HPLC retention simulation + AI assisted method design",
    version="1.1.0",
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _set_session_cookie(request: Request, response: Response, token: str, max_age: int) -> None:
    response.set_cookie(
        auth.COOKIE_NAME,
        token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )


def require_user(request: Request) -> dict:
    user = auth.current_user(request.cookies.get(auth.COOKIE_NAME))
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


def _search_local_compounds(query: str, limit: int = 12) -> list[dict]:
    if not query:
        return COMPOUNDS[:limit]
    needle = query.lower()
    return [
        item for item in COMPOUNDS
        if needle in (
            f"{item['name']} {item.get('name_en', '')} {item['id']} {item.get('category', '')}"
        ).lower()
    ][:limit]


@app.get("/api/compounds")
def compounds() -> dict:
    return {"compounds": COMPOUNDS, "categories": CATEGORIES}


@app.get("/api/compounds/search")
def compound_search(q: str = "", limit: int = 6) -> dict:
    query = q.strip()
    local = _search_local_compounds(query)
    if len(query) < 2:
        return {"query": query, "local": local, "online": [], "online_error": None}
    limit = max(1, min(10, limit))
    try:
        online = search_online(query, limit)
        error = None
    except Exception as exc:  # noqa: BLE001 - online lookup is optional
        online = []
        error = str(exc)
    return {"query": query, "local": local, "online": online, "online_error": error}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/register")
def auth_register(payload: AuthRequest, request: Request, response: Response) -> dict:
    try:
        user, token = auth.register(payload.username, payload.password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    _set_session_cookie(request, response, token, auth.SESSION_TTL_SECONDS)
    return {"user": user}


@app.post("/api/auth/login")
def auth_login(payload: AuthRequest, request: Request, response: Response) -> dict:
    try:
        user, token = auth.login(payload.username, payload.password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    _set_session_cookie(request, response, token, auth.SESSION_TTL_SECONDS)
    return {"user": user}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response) -> dict:
    auth.logout(request.cookies.get(auth.COOKIE_NAME))
    _set_session_cookie(request, response, "", 0)
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(require_user)) -> dict:
    return {"user": user}


@app.get("/api/account")
def account_get(user: dict = Depends(require_user)) -> dict:
    return auth.get_account(user["id"])


@app.put("/api/account/preferences")
def account_preferences(
    payload: PreferencesPayload,
    user: dict = Depends(require_user),
) -> dict:
    return {
        "preferences": auth.update_preferences(user["id"], payload.model_dump())
    }


@app.post("/api/account/password")
def account_password(
    payload: PasswordChangeRequest,
    request: Request,
    user: dict = Depends(require_user),
) -> dict:
    try:
        auth.change_password(
            user["id"],
            request.cookies.get(auth.COOKIE_NAME),
            payload.current_password,
            payload.new_password,
        )
    except auth.AuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    return {"ok": True}


@app.post("/api/account/favorites")
def account_favorite_add(
    payload: FavoriteRequest,
    user: dict = Depends(require_user),
) -> dict:
    try:
        return auth.add_favorite(user["id"], payload.model_dump())
    except auth.AuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@app.delete("/api/account/favorites/{favorite_id}")
def account_favorite_delete(
    favorite_id: str,
    user: dict = Depends(require_user),
) -> dict:
    try:
        return auth.delete_favorite(user["id"], favorite_id)
    except auth.AuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@app.post("/api/simulate")
def simulate_endpoint(
    payload: SimulateRequest,
    _user: dict = Depends(require_user),
) -> dict:
    if not payload.compounds:
        raise HTTPException(status_code=400, detail="至少选择一个组分")
    try:
        result = simulate(payload.compounds, payload.conditions)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"模拟失败：{exc}") from exc
    return result


@app.post("/api/recommend")
def recommend_endpoint(
    payload: RecommendRequest,
    _user: dict = Depends(require_user),
) -> dict:
    if not payload.compounds:
        raise HTTPException(status_code=400, detail="至少选择一个组分")
    if len(payload.compounds) > 20:
        raise HTTPException(status_code=400, detail="一次最多分析 20 个组分")
    try:
        return recommend(payload.compounds, payload.constraints, payload.ai)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"条件设计失败：{exc}") from exc


@app.post("/api/identify")
def identify_endpoint(
    payload: IdentifyRequest,
    _user: dict = Depends(require_user),
) -> dict:
    if not payload.observed_peaks:
        raise HTTPException(status_code=400, detail="至少提供一个观测峰")
    try:
        return identify(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"组分识别失败：{exc}") from exc


@app.get("/api/ai/status")
def ai_status() -> dict:
    return ai_client.public_status()


@app.post("/api/ai/status")
def ai_status_with_config(payload: AITestRequest) -> dict:
    return ai_client.public_status(payload.model_dump())


@app.post("/api/ai/test")
def ai_test(payload: AITestRequest, _user: dict = Depends(require_user)) -> dict:
    config = ai_client.resolve_config(payload.model_dump())
    if not config["configured"]:
        raise HTTPException(status_code=400, detail="请先填写 API Key")
    try:
        return ai_client.test_connection(config)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
