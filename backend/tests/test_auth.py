"""Masuk dan pendaftaran, termasuk alur data baru dari daftar sampai siswa ditandai."""
import json

from app.seed import DEMO_PASSWORD

PW = "kata-sandi-uji-1"


def test_login_salah_ditolak(client):
    r = client.post("/api/auth/login", json={"email": "nadia@demo.riayah.id", "password": "salah-sekali"})
    assert r.status_code == 401


def test_login_demo_satu_klik_sudah_dihapus(client):
    assert client.post("/api/auth/demo-login", json={"email": "nadia@demo.riayah.id"}).status_code in (404, 405)
    assert client.get("/api/auth/demo-accounts").status_code in (404, 405)


def test_login_benar(client):
    r = client.post("/api/auth/login", json={"email": "NADIA@demo.riayah.id ", "password": DEMO_PASSWORD})
    assert r.status_code == 200 and r.json()["user"]["role"] == "siswa"


def test_validasi_daftar(client, fresh_db):
    base = {"role": "siswa", "name": "Uji Coba", "email": "uji@contoh.id", "password": PW, "nis": "UJI-1", "level": "kampus", "class_name": "Informatika", "birth_date": "2005-01-01"}
    assert client.post("/api/auth/register", json={**base, "password": "pendek"}).status_code == 422
    assert client.post("/api/auth/register", json={**base, "email": "bukan-email"}).status_code == 422
    assert client.post("/api/auth/register", json={**base, "email": "nadia@demo.riayah.id"}).status_code == 409
    assert client.post("/api/auth/register", json={**base, "nis": "SIM-0001"}).status_code == 409
    assert client.post("/api/auth/register", json={**base, "level": "tk"}).status_code == 422
    assert client.post("/api/auth/register", json={**base, "role": "superadmin"}).status_code == 422


def test_daftar_siswa_langsung_masuk_tanpa_data(client, fresh_db):
    r = client.post(
        "/api/auth/register",
        json={"role": "siswa", "name": "Rafi Pratama", "email": "rafi@contoh.id", "password": PW, "nis": "MHS-2026-01", "level": "kampus", "class_name": "Teknik Informatika", "birth_date": "2005-03-01"},
    )
    assert r.status_code == 201 and r.json()["pending"] is False
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    home = client.get("/api/me/home", headers=h).json()
    assert home["consent"]["any"] is False and home["message"] is None
    assert client.get("/api/me/flag", headers=h).json()["zone"] == "hijau"
    assert r.json()["user"]["ui_mode"] == "kampus"
    # Bisa masuk ulang dengan kata sandinya.
    assert client.post("/api/auth/login", json={"email": "rafi@contoh.id", "password": PW}).status_code == 200


def test_daftar_siswa_sd_memakai_mode_anak(client, fresh_db):
    r = client.post(
        "/api/auth/register",
        json={"role": "siswa", "name": "Kecil Ceria", "email": "kecil@contoh.id", "password": PW, "nis": "SD-77", "level": "sd", "class_name": "4B", "birth_date": "2016-06-01"},
    )
    assert r.json()["user"]["ui_mode"] == "anak"


def test_staf_menunggu_persetujuan_admin(client, as_role, fresh_db):
    r = client.post("/api/auth/register", json={"role": "guru", "name": "Rina Lestari", "email": "rina.guru@contoh.id", "password": PW, "title": "Bu Rina"})
    assert r.status_code == 201 and r.json()["pending"] is True and "token" not in r.json()
    login = client.post("/api/auth/login", json={"email": "rina.guru@contoh.id", "password": PW})
    assert login.status_code == 403 and "menunggu" in login.json()["detail"]
    users = client.get("/api/admin/users?q=Rina Lestari", headers=as_role("admin")).json()
    u = next(x for x in users["users"] if x["email"] == "rina.guru@contoh.id")
    assert u["status"] == "menunggu_akun" and users["pending_accounts"] >= 1
    assert client.patch(f"/api/admin/users/{u['id']}", headers=as_role("admin"), json={"active": True}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "rina.guru@contoh.id", "password": PW}).status_code == 200


def test_wali_menunggu_verifikasi_hubungan(client, as_role, fresh_db):
    r = client.post("/api/auth/register", json={"role": "wali", "name": "Ayah Dimas", "email": "ayah.dimas@contoh.id", "password": PW, "child_nis": "SIM-0002"})
    assert r.status_code == 201 and r.json()["pending"] is False
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/api/guardian/children", headers=h).json() == []
    assert client.get("/api/guardian/pending", headers=h).json()[0]["name"] == "Dimas Pratama"
    bad = client.post("/api/auth/register", json={"role": "wali", "name": "Salah Nis", "email": "x@contoh.id", "password": PW, "child_nis": "TIDAK-ADA"})
    assert bad.status_code == 422
    rels = client.get("/api/admin/relations", headers=as_role("admin")).json()["relations"]
    rel = next(x for x in rels if x["actor"] == "Ayah" and x["status"] == "menunggu_verifikasi")
    assert client.post(f"/api/admin/relations/{rel['id']}/approve", headers=as_role("admin")).status_code == 200
    assert client.get("/api/guardian/children", headers=h).json()[0]["nickname"] == "Dimas"


def test_admin_tambah_pengguna_dapat_kata_sandi_sementara(client, as_role, fresh_db):
    r = client.post("/api/admin/users", headers=as_role("admin"), json={"name": "Hadi Konselor", "email": "hadi@contoh.id", "role": "bk"})
    temp = r.json()["temp_password"]
    assert client.post("/api/auth/login", json={"email": "hadi@contoh.id", "password": temp}).status_code == 200


def test_alur_data_baru_sampai_ditandai(client, as_role, fresh_db):
    """Daftar mahasiswa → setuju → admin impor templat memburuk → K1 → muncul di antrean BK."""
    r = client.post(
        "/api/auth/register",
        json={"role": "siswa", "name": "Tari Anggun", "email": "tari@contoh.id", "password": PW, "nis": "MHS-99", "level": "kampus", "class_name": "Psikologi", "birth_date": "2004-02-02"},
    )
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    client.post("/api/me/consent", headers=h, json={"choices": {"kehadiran": True, "lms": True, "tugas": True, "kuis": True}})
    admin = as_role("admin")
    csv = client.get("/api/admin/import/template?pattern=memburuk", headers=admin).text
    assert "MHS-99" in csv and len(csv.strip().splitlines()) == 1 + 8
    prev = client.post("/api/admin/import/preview", headers=admin, files={"file": ("t.csv", csv.encode(), "text/csv")}).json()
    assert prev["rows_bad"] == 0 and not prev["missing"]
    res = client.post("/api/admin/import/commit", headers=admin, files={"file": ("t.csv", csv.encode(), "text/csv")}, data={"mapping": json.dumps(prev["mapping"])}).json()
    assert res["new_cases"] == 1
    flag = client.get("/api/me/flag", headers=h).json()
    assert flag["zone"] == "kuning" and len(flag["reasons"]) == 3 and flag["counterfactual"]
    queue = client.get("/api/counselor/cases?tab=kuning", headers=as_role("bk")).json()["rows"]
    assert any(row["class_name"] == "Psikologi" for row in queue)


def test_pesan_tanpa_wali_kelas_memakai_guru_bk(client, as_role, fresh_db):
    r = client.post(
        "/api/auth/register",
        json={"role": "siswa", "name": "Bayu Laksana", "email": "bayu@contoh.id", "password": PW, "nis": "MHS-77", "level": "kampus", "class_name": "Hukum", "birth_date": "2004-04-04"},
    )
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    client.post("/api/me/consent", headers=h, json={"choices": {"kehadiran": True, "lms": True, "tugas": True, "kuis": True}})
    admin = as_role("admin")
    csv = client.get("/api/admin/import/template?pattern=memburuk", headers=admin).text
    prev = client.post("/api/admin/import/preview", headers=admin, files={"file": ("t.csv", csv.encode(), "text/csv")}).json()
    client.post("/api/admin/import/commit", headers=admin, files={"file": ("t.csv", csv.encode(), "text/csv")}, data={"mapping": json.dumps(prev["mapping"])})
    msg = client.get("/api/me/home", headers=h).json()["message"]
    assert msg and "None" not in msg["text"] and msg["from"] == "Guru BK"


def test_reset_data_demo_menghapus_akun_terdaftar(client, as_role, fresh_db):
    client.post("/api/auth/register", json={"role": "siswa", "name": "Akan Hilang", "email": "hilang@contoh.id", "password": PW, "nis": "HLG-1", "level": "kampus", "class_name": "Uji", "birth_date": "2004-01-01"})
    assert client.post("/api/auth/login", json={"email": "hilang@contoh.id", "password": PW}).status_code == 200
    assert client.post("/api/admin/reset-demo", headers=as_role("guru")).status_code == 403
    assert client.post("/api/admin/reset-demo", headers=as_role("admin")).json()["ok"] is True
    assert client.post("/api/auth/login", json={"email": "hilang@contoh.id", "password": PW}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nadia@demo.riayah.id", "password": DEMO_PASSWORD}).status_code == 200
