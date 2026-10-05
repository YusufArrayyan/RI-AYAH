@echo off
rem Backend Ri'ayah (FastAPI) di port 8010. Basis data SIMULASI dibuat otomatis saat pertama jalan.
cd /d "%~dp0..\backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
