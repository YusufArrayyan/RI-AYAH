"""Kode aktivasi siswa, kode undangan orang tua, dan cerita lewat tulisan ke BK."""
from sqlalchemy import select

from app.db import SessionLocal
from app.models import AuditLog, StoryMessage, User

PW = "kata-sandi-baru-1"


def _student_id(nis):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.nis == nis))


def _issue(client, admin, nis, kind):
    sid = _student_id(nis)
    assert client.post("/api/admin/codes", headers=admin, json={"kind": kind, "student_ids": [sid]}).json()["issued"] == 1
    rows = client.get("/api/admin/codes", headers=admin, params={"class_name": client.get("/api/admin/codes", headers=admin).json()["class_name"]}).json()["rows"]
    # Cari di kelas siswa itu.
    with SessionLocal() as db:
        cls = db.get(User, sid).class_name
    rows = client.get("/api/admin/codes", headers=admin, params={"class_name": cls}).json()["rows"]
    row = next(r for r in rows if r["id"] == sid)
    assert row[kind]["status"] == "aktif"
    return row[kind]["code"]


def test_aktivasi_siswa_dan_login_dengan_nis(client, as_role, fresh_db):
    admin = as_role("admin")
    code = _issue(client, admin, "SIM-0010", "aktivasi")
    info = client.get("/api/auth/code-info", params={"code": code.lower().replace("-", "")}).json()
    assert info["valid"] and info["kind"] == "aktivasi"
    assert client.post("/api/auth/activate", json={"nis": "SIM-0011", "code": code, "password": PW}).status_code == 422  # NIS lain
    r = client.post("/api/auth/activate", json={"nis": "sim-0010", "code": code, "password": PW})
    assert r.status_code == 200 and r.json()["user"]["role"] == "siswa"
    assert client.post("/api/auth/login", json={"email": "SIM-0010", "password": PW}).status_code == 200
    # Sekali pakai.
    assert client.post("/api/auth/activate", json={"nis": "SIM-0010", "code": code, "password": PW}).status_code == 409


def test_kode_lama_dicabut_saat_kode_baru_dibuat(client, as_role, fresh_db):
    admin = as_role("admin")
    first = _issue(client, admin, "SIM-0012", "aktivasi")
    _issue(client, admin, "SIM-0012", "aktivasi")
    assert client.post("/api/auth/activate", json={"nis": "SIM-0012", "code": first, "password": PW}).status_code == 422


def test_undangan_orang_tua_langsung_terhubung(client, as_role, fresh_db):
    admin = as_role("admin")
    code = _issue(client, admin, "SIM-0013", "undangan_wali")
    assert client.get("/api/auth/code-info", params={"code": code}).json()["kind"] == "undangan_wali"
    r = client.post("/api/auth/accept-invite", json={"code": code, "name": "Ibu Uji Coba", "email": "ibu.uji@contoh.id", "password": PW})
    assert r.status_code == 201
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    kids = client.get("/api/guardian/children", headers=h).json()
    assert len(kids) == 1  # terverifikasi lewat kode, tanpa menunggu admin
    # Wali yang sama menambahkan anak kedua dengan kode lain.
    code2 = _issue(client, admin, "SIM-0014", "undangan_wali")
    assert client.post("/api/guardian/link", headers=h, json={"code": code2}).status_code == 200
    assert len(client.get("/api/guardian/children", headers=h).json()) == 2


def test_admin_tambah_siswa_mendapat_kode_aktivasi(client, as_role, fresh_db):
    r = client.post("/api/admin/users", headers=as_role("admin"), json={"name": "Siswa Baru Sekali", "role": "siswa", "nis": "BARU-01", "level": "sd", "class_name": "3A", "birth_date": "2018-05-05"})
    code = r.json()["activation_code"]
    act = client.post("/api/auth/activate", json={"nis": "BARU-01", "code": code, "password": PW})
    assert act.status_code == 200 and act.json()["user"]["ui_mode"] == "anak"


def test_cerita_lewat_tulisan_hanya_untuk_siswa_dan_bk(client, as_role, fresh_db):
    h = as_role("dimas")
    assert client.post("/api/me/stories", headers=h, json={"body": "   "}).status_code == 422
    r = client.post("/api/me/stories", headers=h, json={"body": "Aku susah tidur karena kepikiran ujian."})
    tid = r.json()["thread_id"]
    with SessionLocal() as db:
        msg = db.scalar(select(StoryMessage).where(StoryMessage.thread_id == tid))
        assert "ujian" not in msg.body_enc  # tersimpan terenkripsi
        assert not any("ujian" in (a.detail or "") for a in db.scalars(select(AuditLog)))
    # Peran lain tidak bisa membaca.
    for role in ("guru", "wali", "admin", "pimpinan", "komite"):
        assert client.get(f"/api/counselor/stories/{tid}", headers=as_role(role)).status_code == 403
    bk = as_role("bk2")
    lst = client.get("/api/counselor/stories", headers=bk).json()
    assert lst["unread_total"] >= 1
    detail = client.get(f"/api/counselor/stories/{tid}", headers=bk).json()
    assert detail["messages"][0]["body"].startswith("Aku susah tidur")
    assert client.post(f"/api/counselor/stories/{tid}/reply", headers=bk, json={"body": "Terima kasih sudah cerita. Boleh Ibu tanya sedikit?"}).status_code == 200
    mine = client.get("/api/me/stories", headers=h).json()["current"]
    assert mine["counselor"] == "Bu Maya" and mine["messages"][-1]["from"] == "bk"
    # Setelah Bu Maya mengambil, BK biasa lain tidak bisa membuka; koordinator bisa.
    assert client.get(f"/api/counselor/stories/{tid}", headers=as_role("bk")).status_code == 200  # Pak Rahman koordinator


def test_cerita_mendesak_membuka_antrean_merah(client, as_role, fresh_db):
    before = client.get("/api/counselor/cases?tab=merah", headers=as_role("bk")).json()["stats"]["red_open"]
    r = client.post("/api/me/stories", headers=as_role("dimas"), json={"body": "Aku butuh ngobrol hari ini.", "urgent": True})
    assert r.json()["urgent_queued"] is True
    after = client.get("/api/counselor/cases?tab=merah", headers=as_role("bk")).json()["stats"]["red_open"]
    assert after == before + 1


def test_cerita_tetap_bisa_setelah_tarik_persetujuan(client, as_role, fresh_db):
    h = as_role("siswa")
    client.post("/api/me/withdraw", headers=h)
    assert client.post("/api/me/stories", headers=h, json={"body": "Aku tetap mau cerita."}).status_code == 200
