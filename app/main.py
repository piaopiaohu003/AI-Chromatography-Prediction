"""FastAPI application exposing the chromatography simulation and design API."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import ai_client
from .compounds import CATEGORIES, COMPOUNDS
from .models import (
    AITestRequest,
    RecommendRequest,
    SimulateRequest,
)
from .recommend import recommend
from .simulation import simulate

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"

app = FastAPI(
    title="ChromAI · 智能色谱方法平台",
    description="Reversed-phase HPLC retention simulation + AI assisted method design",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/compounds")
def compounds() -> dict:
    return {"compounds": COMPOUNDS, "categories": CATEGORIES}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/simulate")
def simulate_endpoint(payload: SimulateRequest) -> dict:
    if not payload.compounds:
        raise HTTPException(status_code=400, detail="至少选择一个组分")
    try:
        result = simulate(payload.compounds, payload.conditions)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"模拟失败：{exc}") from exc
    return result


@app.post("/api/recommend")
def recommend_endpoint(payload: RecommendRequest) -> dict:
    if not payload.compounds:
        raise HTTPException(status_code=400, detail="至少选择一个组分")
    if len(payload.compounds) > 20:
        raise HTTPException(status_code=400, detail="一次最多分析 20 个组分")
    try:
        return recommend(payload.compounds, payload.constraints, payload.ai)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"条件设计失败：{exc}") from exc


@app.get("/api/ai/status")
def ai_status() -> dict:
    return ai_client.public_status()


@app.post("/api/ai/status")
def ai_status_with_config(payload: AITestRequest) -> dict:
    return ai_client.public_status(payload.model_dump())


@app.post("/api/ai/test")
def ai_test(payload: AITestRequest) -> dict:
    config = ai_client.resolve_config(payload.model_dump())
    if not config["configured"]:
        raise HTTPException(status_code=400, detail="请先填写 API Key")
    try:
        return ai_client.test_connection(config)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
