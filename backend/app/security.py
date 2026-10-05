"""Autentikasi dan enkripsi.

MVP memakai akun lokal untuk demo. Produksi memakai SSO (OIDC) sehingga tidak ada kata
sandi baru (PRD Bab 10.2); fungsi `current_user` tetap menjadi satu-satunya pintu.
"""
from __future__ import annotations

from datetime import timedelta

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User
from .timeutil import utcnow

_fernet = Fernet(settings.fernet_key.encode())
_bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": utcnow() + timedelta(minutes=settings.token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def encrypt(text: str) -> str:
    return _fernet.encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken as exc:  # pragma: no cover - kunci salah
        raise HTTPException(500, "Data terenkripsi tidak dapat dibuka") from exc


def current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Silakan masuk dulu")
    try:
        data = jwt.decode(cred.credentials, settings.jwt_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi berakhir, silakan masuk lagi") from exc
    user = db.get(User, int(data["sub"]))
    if user is None or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Akun tidak aktif")
    return user


def require_role(*roles: str):
    """Dependensi FastAPI: menolak dengan 403 bila peran tidak cocok."""

    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Peran Anda tidak memiliki akses ke data ini")
        return user

    return dep
