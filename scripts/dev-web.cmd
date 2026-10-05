@echo off
rem Frontend Ri'ayah (Vite) di port 5180, proxy /api ke backend port 8010.
cd /d "%~dp0..\frontend"
set RIAYAH_API_PORT=8010
npx vite --host 127.0.0.1 --port 5180 --strictPort
