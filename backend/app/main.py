"""Ri'ayah API. Jalankan: uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import admin, auth, common, counselor, ethics, guardian, leader, student, teacher
from .seed import ensure_seeded

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_seeded()
    yield


app = FastAPI(title="Ri'ayah API", version="2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    # Prototipe berdata SIMULASI: jangan diindeks mesin pencari.
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


for r in (auth, common, student, guardian, teacher, counselor, admin, leader, ethics):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"ok": True, "environment": settings.environment, "simulated_data": not settings.is_production}


# Sajikan hasil build frontend bila ada (satu proses untuk demo/deploy sederhana).
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Tidak ditemukan"}, status_code=404)
        f = FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html")
