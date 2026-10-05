"""Tes peran (kriteria 14.4.4): untuk setiap pasangan (aktor, objek data) pada matriks Bab 3.2
ada uji yang membuktikan izin atau penolakan, diperiksa di sisi server."""
import pytest

from app.access import ACCESS_MATRIX

# (objek, endpoint, metode) → peran yang BOLEH. Semua peran lain wajib 401/403.
ENDPOINTS = [
    ("zona_alasan", "GET", "/api/me/flag", {"siswa"}),
    ("zona_alasan", "GET", "/api/teacher/cases", {"guru"}),
    ("zona_alasan", "GET", "/api/counselor/cases?tab=merah", {"bk"}),
    ("jawaban_checkin", "GET", "/api/me/checkin", {"siswa"}),
    ("catatan_konseling", "GET", "/api/counselor/cases?tab=kuning", {"bk"}),
    ("log_akses_sendiri", "GET", "/api/me/privacy", {"siswa"}),
    ("log_audit_sistem", "GET", "/api/ethics/audit", {"komite", "admin"}),
    ("agregat", "GET", "/api/leader/dashboard", {"pimpinan", "komite"}),
    ("agregat", "GET", "/api/counselor/load", {"bk"}),
    ("aturan_ambang", "GET", "/api/admin/rules", {"admin"}),
    ("aturan_ambang", "GET", "/api/ethics/rules", {"komite"}),
    ("kontak_pustaka", "GET", "/api/contacts", {"siswa", "wali", "guru", "bk", "admin", "pimpinan", "komite"}),
    ("kontak_pustaka", "GET", "/api/admin/resources", {"admin"}),
    ("indikator_mingguan", "GET", "/api/admin/imports", {"admin"}),
    ("keadilan", "GET", "/api/ethics/fairness", {"komite"}),
]
ROLE_KEYS = {"siswa": "siswa", "wali": "wali", "guru": "guru", "bk": "bk", "admin": "admin", "pimpinan": "pimpinan", "komite": "komite"}


def test_matriks_lengkap_tujuh_peran():
    for obj, row in ACCESS_MATRIX.items():
        assert set(row) == set(ROLE_KEYS), obj


@pytest.mark.parametrize("obj,method,url,allowed", ENDPOINTS)
@pytest.mark.parametrize("role", list(ROLE_KEYS))
def test_izin_atau_penolakan(client, as_role, obj, method, url, allowed, role):
    r = client.request(method, url, headers=as_role(ROLE_KEYS[role]))
    if role in allowed:
        assert r.status_code == 200, (role, url, r.text)
    else:
        assert r.status_code == 403, (role, url, r.status_code)


def test_tanpa_masuk_401(client):
    assert client.get("/api/me/home").status_code == 401


def _red_case_id(client, as_role):
    rows = client.get("/api/counselor/cases?tab=merah", headers=as_role("bk")).json()["rows"]
    return rows[0]["id"]


def test_guru_tidak_bisa_membuka_kasus_merah(client, as_role):
    cid = _red_case_id(client, as_role)
    assert client.get(f"/api/teacher/cases/{cid}", headers=as_role("guru")).status_code == 403


def test_guru_hanya_kelas_binaan(client, as_role):
    sd_rows = client.get("/api/teacher/cases", headers=as_role("guru_sd")).json()["rows"]
    assert sd_rows
    r = client.get(f"/api/teacher/cases/{sd_rows[0]['id']}", headers=as_role("guru"))
    assert r.status_code == 403


def test_daftar_guru_tanpa_nama_dan_tanpa_skor(client, as_role):
    data = client.get("/api/teacher/cases", headers=as_role("guru")).json()
    for row in data["rows"]:
        assert "student_name" not in row and "score" not in row
        assert row["code"].startswith("S-")


def test_guru_melihat_k2_hanya_sebagai_tanda_umum(client, as_role):
    rows = client.get("/api/teacher/cases", headers=as_role("guru")).json()["rows"]
    k2 = [r for r in rows if r["rule_id"] == "K2"]
    assert k2 and k2[0]["reasons"] == ["Ada tanda dari check-in."]
    detail = client.get(f"/api/teacher/cases/{k2[0]['id']}", headers=as_role("guru")).json()
    assert "checkin" not in detail and "score" not in str(detail).lower().replace("skor atau probabilitas", "")


def test_bk_biasa_tidak_membuka_kasus_konselor_lain(client, as_role):
    rows = client.get("/api/counselor/cases?tab=merah", headers=as_role("bk")).json()["rows"]
    owned_by_rahman = [r for r in rows if r["mine"]]
    assert owned_by_rahman
    r = client.get(f"/api/counselor/cases/{owned_by_rahman[0]['id']}", headers=as_role("bk2"))
    assert r.status_code == 403


def test_wali_tidak_bisa_melihat_anak_lain(client, as_role):
    children = client.get("/api/guardian/children", headers=as_role("wali")).json()
    ids = {c["id"] for c in children}
    other = max(ids) + 1
    while other in ids:
        other += 1
    assert client.get(f"/api/guardian/children/{other}/summary", headers=as_role("wali")).status_code == 403


def test_wali_tidak_menerima_zona(client, as_role):
    children = client.get("/api/guardian/children", headers=as_role("wali")).json()
    for c in children:
        body = client.get(f"/api/guardian/children/{c['id']}/summary", headers=as_role("wali")).text.lower()
        assert "kuning" not in body and "merah" not in body and '"zone"' not in body


def test_mode_anak_tanpa_zona_angka_ditandai(client, as_role):
    """Aturan wajib 14.3.10, ditegakkan server."""
    data = client.get("/api/me/flag", headers=as_role("anak")).json()
    assert data["child"] is True
    text = str(data).lower()
    assert "zone" not in data and "kuning" not in text and "ditandai" not in text
    assert not any(ch.isdigit() for ch in data["sentence"])


def test_pimpinan_tanpa_data_individu(client, as_role):
    body = client.get("/api/leader/dashboard", headers=as_role("pimpinan")).text
    assert "S-" not in body and "Nadia" not in body


def test_admin_hanya_log_teknis(client, as_role):
    rows = client.get("/api/ethics/audit", headers=as_role("admin")).json()["rows"]
    assert all(r["action"] in ("masuk", "isi_checkin") for r in rows)


def test_kontak_belum_diverifikasi_tersembunyi_dari_siswa(client, as_role):
    """Aturan wajib 14.3.6."""
    student = client.get("/api/contacts", headers=as_role("siswa")).json()
    assert all(c["phone"] for c in student["contacts"])
    assert all(c["status"] == "aktif" for c in student["contacts"])
    admin = client.get("/api/contacts", headers=as_role("admin")).json()
    assert any(c["status"] == "belum_diisi" for c in admin["contacts"])
    assert admin["missing_count"] >= 1
