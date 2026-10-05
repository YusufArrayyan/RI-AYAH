import os
import sys
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["RIAYAH_DATABASE_URL"] = f"sqlite:///{_tmp.as_posix()}"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD, reset_and_seed  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _seeded():
    reset_and_seed()
    yield


@pytest.fixture()
def fresh_db():
    """Untuk tes yang mengubah data: mulai dari seed bersih."""
    reset_and_seed()
    yield


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email: str) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture()
def as_role(client):
    emails = {
        "siswa": "nadia@demo.riayah.id",
        "anak": "alya@demo.riayah.id",
        "raka": "raka@demo.riayah.id",
        "dimas": "dimas@demo.riayah.id",
        "wali": "rina@demo.riayah.id",
        "guru": "sari@demo.riayah.id",
        "guru_sd": "andi@demo.riayah.id",
        "bk": "rahman@demo.riayah.id",
        "bk2": "maya@demo.riayah.id",
        "admin": "teguh@demo.riayah.id",
        "admin2": "ratna@demo.riayah.id",
        "pimpinan": "wulan@demo.riayah.id",
        "komite": "hasan@demo.riayah.id",
    }
    return lambda key: login(client, emails[key])
