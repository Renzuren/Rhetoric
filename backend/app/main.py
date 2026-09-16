"""
Rhetoric API — HTTP wrapper around the Phase 4 pipeline.
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from phase1_classify import (  # noqa: E402
    LLMConfigError,
    get_client,
    segment_text,
)
from phase4_pipeline import (  # noqa: E402
    DEFAULT_SIM_FLOOR,
    DEFAULT_THRESHOLD,
    DEFAULT_TOP_K,
    build_graph,
    cache_key,
    load_cached,
    store_cached,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MIN_TEXT_CHARS = 30
MAX_TEXT_CHARS = 50_000
MAX_UNITS = 200


# ---------------------------------------------------------------------------
# App + middleware
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Rhetoric API",
    version="0.2.0",
)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=MIN_TEXT_CHARS, max_length=MAX_TEXT_CHARS)

    @field_validator("text")
    @classmethod
    def _clean_and_validate(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("text must be a string")

        cleaned = "".join(
            c for c in v
            if c in "\n\r\t" or (c.isprintable() and ord(c) >= 32)
        )
        cleaned = cleaned.strip()

        if len(cleaned) < MIN_TEXT_CHARS:
            raise ValueError(
                f"input too short after cleaning (min {MIN_TEXT_CHARS} chars)"
            )
        if len(cleaned) > MAX_TEXT_CHARS:
            raise ValueError(
                f"input too long (max {MAX_TEXT_CHARS} chars)"
            )
        return cleaned


class HealthResponse(BaseModel):
    status: str
    version: str


# ---------------------------------------------------------------------------
# Response validation
# ---------------------------------------------------------------------------
def _validate_graph(graph: dict) -> None:
    required_top = {"title", "summary", "nodes", "edges", "stats"}
    missing = required_top - graph.keys()
    if missing:
        raise ValueError(f"graph missing fields: {missing}")

    if not isinstance(graph["nodes"], list) or not isinstance(graph["edges"], list):
        raise ValueError("nodes/edges must be lists")

    stats = graph["stats"]
    required_stats = {
        "node_count", "edge_count", "claim_indices", "evidence_indices",
        "orphan_claim_indices", "load_bearing_claim", "evidence_coverage",
    }
    missing_stats = required_stats - stats.keys()
    if missing_stats:
        raise ValueError(f"stats missing fields: {missing_stats}")

    node_ids = {n["id"] for n in graph["nodes"]}
    for e in graph["edges"]:
        if e["source"] not in node_ids or e["target"] not in node_ids:
            raise ValueError(
                f"edge references missing node: {e['source']} → {e['target']}"
            )


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------
@app.exception_handler(ValueError)
async def _value_error_handler(_: Request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={"error": "validation_failed", "detail": str(exc)},
    )


@app.exception_handler(RuntimeError)
async def _runtime_error_handler(_: Request, exc: RuntimeError):
    return JSONResponse(
        status_code=502,
        content={"error": "upstream_failed", "detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=app.version)


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest) -> dict:
    units = segment_text(req.text)
    if not units:
        raise HTTPException(
            status_code=400,
            detail="Could not detect any argumentative units in the input.",
        )
    if len(units) > MAX_UNITS:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Input produced {len(units)} units, which exceeds the "
                f"{MAX_UNITS} unit limit. Trim the input."
            ),
        )

    key = cache_key(req.text, DEFAULT_THRESHOLD, DEFAULT_TOP_K, DEFAULT_SIM_FLOOR)
    cached = load_cached(key)
    if cached is not None:
        try:
            _validate_graph(cached)
            return cached
        except ValueError:
            pass

    try:
        client = get_client()
    except LLMConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        graph = build_graph(client, units)
    finally:
        client.close()

    _validate_graph(graph)
    store_cached(key, graph)
    return graph