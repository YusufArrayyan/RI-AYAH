"""Dalil pada pustaka harus berasal dari sumber yang bisa ditelusuri, bukan teks bebas."""
from app.seed import DALIL

SUMBER = ("https://quran.kemenag.go.id/", "https://hadeethenc.com/")


def test_setiap_dalil_bersumber():
    assert DALIL
    for judul, daftar in DALIL.items():
        assert daftar, judul
        for d in daftar:
            assert d["jenis"] in ("ayat", "hadis")
            assert d["arab"] and d["terjemah"] and d["rujukan"], judul
            assert d["url"].startswith(SUMBER), d["url"]
            if d["jenis"] == "hadis":
                assert d["derajat"], judul


def test_bacaan_menampilkan_dalil(client, as_role):
    h = as_role("siswa")
    items = client.get("/api/library", headers=h).json()["items"]
    target = next(i for i in items if i["title"] in DALIL)
    assert target["dalil_count"] == len(DALIL[target["title"]])
    detail = client.get(f"/api/library/{target['id']}", headers=h).json()
    assert detail["dalil"] == DALIL[target["title"]]
