"""Audit, persetujuan, penarikan (kriteria 14.4.6), dan persetujuan 4 mata."""
from sqlalchemy import select

from app.audit import verify_chain
from app.db import SessionLocal
from app.models import AuditLog, Case, KeyMapping, User


def test_rantai_audit_utuh_lalu_terdeteksi_bila_diubah(client, as_role, fresh_db):
    with SessionLocal() as db:
        assert verify_chain(db)["ok"]
        e = db.scalars(select(AuditLog).order_by(AuditLog.id).offset(3)).first()
        e.detail = "diubah diam-diam"
        db.commit()
        result = verify_chain(db)
        assert not result["ok"] and e.id in result["broken_ids"]


def test_membuka_kasus_menulis_log_dulu(client, as_role, fresh_db):
    rows = client.get("/api/teacher/cases", headers=as_role("guru")).json()["rows"]
    with SessionLocal() as db:
        before = db.scalar(select(AuditLog.id).order_by(AuditLog.id.desc()))
    client.get(f"/api/teacher/cases/{rows[0]['id']}", headers=as_role("guru"))
    with SessionLocal() as db:
        new = db.scalars(select(AuditLog).where(AuditLog.id > before)).all()
        assert any(e.action == "buka_kasus" and e.object_id == str(rows[0]["id"]) for e in new)


def test_penarikan_menghentikan_pemrosesan_dan_menutup_kasus(client, as_role, fresh_db):
    h = as_role("siswa")
    assert client.get("/api/me/flag", headers=h).json()["zone"] == "kuning"
    r = client.post("/api/me/withdraw", headers=h)
    assert r.status_code == 200 and r.json()["closed_cases"] >= 1
    assert client.get("/api/me/flag", headers=h).json()["zone"] == "hijau"
    priv = client.get("/api/me/privacy", headers=h).json()
    assert not any(i["effective"] for i in priv["consent"]["items"])
    assert any(rq["kind"] == "hapus" for rq in priv["requests"])
    # Check-in ditolak setelah penarikan.
    assert client.post("/api/me/checkin", headers=h, json={"answers": {"lelah": 1}}).status_code == 409
    # Tombol bantuan tetap tersedia (S7).
    assert client.post("/api/me/help", headers=h).status_code == 200


def test_guru_melihat_kasus_ditutup_setelah_penarikan(client, as_role, fresh_db):
    rows = client.get("/api/teacher/cases", headers=as_role("guru")).json()["rows"]
    with SessionLocal() as db:
        nadia = db.scalar(select(User).where(User.email == "nadia@demo.riayah.id"))
        sid = db.scalar(select(KeyMapping.subject_id).where(KeyMapping.user_id == nadia.id))
        case_id = db.scalar(select(Case.id).where(Case.subject_id == sid))
    assert any(r["id"] == case_id for r in rows)
    client.post("/api/me/withdraw", headers=as_role("siswa"))
    d = client.get(f"/api/teacher/cases/{case_id}", headers=as_role("guru")).json()
    assert d["withdrawn"] and d["reasons"] == [] and d["counterfactual"] is None


def test_anak_butuh_persetujuan_wali_dan_asen(client, as_role, fresh_db):
    h = as_role("anak")
    consent = client.get("/api/me/consent", headers=h).json()
    assert consent["needs_guardian"]
    checkin_item = next(i for i in consent["items"] if i["type"] == "checkin")
    # Wali setuju check-in, tetapi Alya belum asen → tidak diproses.
    assert checkin_item["guardian_granted"] and not checkin_item["granted"] and not checkin_item["effective"]
    client.post("/api/me/consent", headers=h, json={"choices": {"checkin": True}})
    after = client.get("/api/me/consent", headers=h).json()
    assert next(i for i in after["items"] if i["type"] == "checkin")["effective"]


def test_wali_harus_menyatakan_wali_sah(client, as_role, fresh_db):
    h = as_role("wali")
    child = client.get("/api/guardian/children", headers=h).json()[0]
    r = client.post(f"/api/guardian/children/{child['id']}/consent", headers=h, json={"choices": {"kuis": True}, "legal_guardian": False})
    assert r.status_code == 422


def test_konfirmasi_ulang_usia_18(client, as_role, fresh_db):
    h = as_role("raka")
    me = client.get("/api/auth/me", headers=h).json()
    assert me["needs_reconfirm"]
    c = client.get("/api/me/consent", headers=h).json()
    assert c["needs_reconfirm"] and not any(i["effective"] for i in c["items"])
    client.post("/api/me/consent", headers=h, json={"choices": {"kehadiran": True, "lms": True}})
    c2 = client.get("/api/me/consent", headers=h).json()
    assert not c2["needs_reconfirm"]
    assert next(i for i in c2["items"] if i["type"] == "kehadiran")["effective"]


def test_aturan_empat_mata(client, as_role, fresh_db):
    draft = client.post(
        "/api/admin/rules/draft",
        headers=as_role("admin"),
        json={"rule_id": "K1", "params": {"min_indicators": 2, "weeks": 4}, "reason": "Uji persetujuan empat mata", "submit": True},
    ).json()
    # Admin tidak punya akses ke endpoint persetujuan komite.
    assert client.post(f"/api/ethics/rules/{draft['id']}/approve", headers=as_role("admin")).status_code == 403
    ok = client.post(f"/api/ethics/rules/{draft['id']}/approve", headers=as_role("komite"))
    assert ok.status_code == 200 and ok.json()["status"] == "aktif"


def test_relasi_tidak_bisa_disetujui_pengusulnya(client, as_role, fresh_db):
    rel = client.get("/api/admin/relations", headers=as_role("admin")).json()["relations"]
    pending = next(r for r in rel if r["status"] == "menunggu_persetujuan")
    # Diusulkan Bu Ratna (admin2): ia sendiri ditolak, Mas Teguh boleh.
    assert client.post(f"/api/admin/relations/{pending['id']}/approve", headers=as_role("admin2")).status_code == 403
    assert client.post(f"/api/admin/relations/{pending['id']}/approve", headers=as_role("admin")).status_code == 200


def test_tombol_bantuan_membuka_antrean_merah(client, as_role, fresh_db):
    before = client.get("/api/counselor/cases?tab=merah", headers=as_role("bk")).json()["stats"]["red_open"]
    client.post("/api/me/help", headers=as_role("dimas"))
    after = client.get("/api/counselor/cases?tab=merah", headers=as_role("bk")).json()["stats"]["red_open"]
    assert after == before + 1


def test_butir_keselamatan_mengalihkan_ke_bantuan(client, as_role, fresh_db):
    r = client.post("/api/me/checkin", headers=as_role("dimas"), json={"answers": {"lelah": 1, "fokus": 0, "sendiri": 0, "tidur": 1}, "safety": True})
    assert r.json()["redirect"] == "bantuan"


def test_keberatan_dan_putusan(client, as_role, fresh_db):
    h = as_role("siswa")
    assert client.post("/api/me/objection", headers=h, json={"statement": "Aku sakit, ada surat dokter."}).status_code == 200
    assert client.get("/api/me/flag", headers=h).json()["objection"]["status"] == "menunggu"
    reqs = client.get("/api/ethics/requests", headers=as_role("komite")).json()["objections"]
    oid = max(o["id"] for o in reqs)
    r = client.post(f"/api/ethics/objections/{oid}/decide", headers=as_role("komite"), json={"decision": "cabut", "reason": "Ketidakhadiran karena sakit dengan surat dokter."})
    assert r.status_code == 200
    assert client.get("/api/me/flag", headers=h).json()["zone"] == "hijau"


def test_impor_membuang_kolom_di_luar_daftar(client, as_role, fresh_db):
    h = as_role("admin")
    sample = client.get("/api/admin/import/sample", headers=h).text
    files = {"file": ("contoh.csv", sample.encode(), "text/csv")}
    prev = client.post("/api/admin/import/preview", headers=h, files=files).json()
    assert set(prev["dropped"]) == {"nama", "agama", "alamat"}
    assert prev["rows_bad"] == 3  # tidak terdaftar, kehadiran 7, pekan bukan angka
    import json

    r = client.post("/api/admin/import/commit", headers=h, files={"file": ("contoh.csv", sample.encode(), "text/csv")}, data={"mapping": json.dumps(prev["mapping"])})
    assert r.status_code == 200 and r.json()["rows_ok"] == 3
