"""Konfigurasi aplikasi. Nilai produksi wajib diisi lewat variabel lingkungan."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
KEY_DIR = BASE_DIR / ".keys"


def _dev_secret(name: str, factory) -> str:
    """Kunci pengembangan disimpan di berkas lokal agar stabil antar restart.

    Di produksi kunci berasal dari KMS/HSM (PRD Bab 10.2) dan berkas ini tidak dipakai.
    """
    KEY_DIR.mkdir(exist_ok=True)
    path = KEY_DIR / name
    if not path.exists():
        path.write_text(factory())
    return path.read_text().strip()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RIAYAH_", env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = f"sqlite:///{(BASE_DIR / 'riayah.db').as_posix()}"
    jwt_secret: str = ""
    fernet_key: str = ""
    token_minutes: int = 60 * 8
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()

if not settings.jwt_secret:
    settings.jwt_secret = _dev_secret("jwt.key", lambda: secrets.token_urlsafe(48))
if not settings.fernet_key:
    from cryptography.fernet import Fernet

    settings.fernet_key = _dev_secret("fernet.key", lambda: Fernet.generate_key().decode())

if settings.is_production and os.environ.get("RIAYAH_JWT_SECRET") is None:
    raise RuntimeError("RIAYAH_JWT_SECRET wajib diisi di produksi")
