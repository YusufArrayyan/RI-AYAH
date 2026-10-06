"""Ambil dalil (ayat dan hadis) untuk Pustaka bacaan dari sumber Islami daring.

Teks tidak ditulis tangan dan tidak dibuat AI: skrip ini mengunduhnya apa adanya dari
- equran.id API v2 (teks Arab, transliterasi, dan terjemahan Al-Qur'an Kemenag RI)
- HadeethEnc.com API v1 (Ensiklopedia Hadis Terjemahan: teks Arab, terjemahan Indonesia,
  takhrij, derajat, dan pelajaran dari hadis)

Hasilnya ditulis ke backend/app/data/dalil.json dan dipakai seed.py.
Jalankan ulang bila ingin memperbarui:  python scripts/ambil_dalil.py
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "backend" / "app" / "data" / "dalil.json"

# Ayat: (surah, ayat). Untuk potongan ayat, `kata` = rentang kata Arab [awal, akhir) yang diambil
# langsung dari teks sumber, dan `terjemah` = potongan terjemahan yang wajib ada di sumber.
Q = lambda s, a, kata=None, terjemah=None: {"jenis": "ayat", "surah": s, "ayat": a, "kata": kata, "terjemah": terjemah}  # noqa: E731
# Hadis: (id HadeethEnc, nomor pelajaran yang dipakai, potong terjemahan setelah kalimat ini,
# potong teks Arab setelah tanda koma Arab ke-n).
H = lambda i, pelajaran=(), potong=None, potong_ar=None: {"jenis": "hadis", "id": i, "pelajaran": list(pelajaran), "potong": potong, "potong_ar": potong_ar}  # noqa: E731

PETA: dict[str, list[dict]] = {
    "Napas 4-7-8 saat pikiran penuh": [
        Q(13, 28),
        Q(2, 286, (0, 6), "Allah tidak membebani seseorang, kecuali menurut kesanggupannya."),
    ],
    "Tidur yang cukup itu bagian dari belajar": [
        Q(78, 9),
        Q(30, 23),
        H(6076, pelajaran=(1, 5)),
    ],
    "Memecah tugas besar jadi langkah kecil": [
        Q(94, [5, 6, 7, 8]),
        H(5845),
        H(5493, pelajaran=(3, 4)),
    ],
    "Kalau merasa sendirian di keramaian": [
        Q(2, 186),
        Q(49, 10),
        H(4969, pelajaran=(1, 2)),
    ],
    "Mengenal layanan BK di sekolah": [
        Q(16, 43, (8, 15), "Maka, bertanyalah kepada orang-orang yang mempunyai pengetahuan jika kamu tidak mengetahui."),
        H(4309),
        H(3777, pelajaran=(2, 3)),
    ],
    "Menenangkan hati dengan dzikir (pilihan)": [
        Q(13, 28),
        Q(2, 152),
        H(5507, pelajaran=(1, 2)),
    ],
    "Saat nilai turun: bicara dengan guru": [
        Q(58, 11, (17, 26), "Allah niscaya akan mengangkat orang-orang yang beriman di antaramu dan orang-orang yang diberi ilmu beberapa derajat."),
        Q(16, 43, (8, 15), "Maka, bertanyalah kepada orang-orang yang mempunyai pengetahuan jika kamu tidak mengetahui."),
        H(6267, potong="jalan menuju Surga.", potong_ar=1),
        H(5493, pelajaran=(2, 3)),
    ],
    "Mengenali tanda tubuh saat cemas": [
        Q(9, 40, (18, 23), "Janganlah engkau bersedih, sesungguhnya Allah bersama kita."),
        Q(2, 286, (0, 6), "Allah tidak membebani seseorang, kecuali menurut kesanggupannya."),
        H(3298, pelajaran=(1, 3)),
        H(3701, pelajaran=(2,)),
    ],
}

UA = {"User-Agent": "Riayah/1.0 (+https://github.com/YusufArrayyan/RI-AYAH)"}


def get_json(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


_surah: dict[int, dict] = {}


def surah(n: int) -> dict:
    if n not in _surah:
        _surah[n] = get_json(f"https://equran.id/api/v2/surat/{n}")["data"]
    return _surah[n]


def ayat(spec: dict) -> dict:
    s = surah(spec["surah"])
    nomor = spec["ayat"] if isinstance(spec["ayat"], list) else [spec["ayat"]]
    rows = [a for a in s["ayat"] if a["nomorAyat"] in nomor]
    assert len(rows) == len(nomor), f"Ayat {spec} tidak ditemukan"
    arab = " ".join(a["teksArab"].strip() for a in rows)
    latin = " ".join(a["teksLatin"].strip() for a in rows)
    terjemah = " ".join(f"({a['nomorAyat']}) {a['teksIndonesia'].strip()}" if len(rows) > 1 else a["teksIndonesia"].strip() for a in rows)
    potongan = spec["kata"] is not None
    if potongan:
        assert len(rows) == 1 and spec["terjemah"] in terjemah, f"Potongan terjemahan tidak cocok dengan sumber: {spec}"
        awal, akhir = spec["kata"]
        arab, terjemah, latin = " ".join(arab.split()[awal:akhir]), spec["terjemah"], None
    rentang = f"{nomor[0]}-{nomor[-1]}" if len(nomor) > 1 else str(nomor[0])
    return {
        "jenis": "ayat",
        "arab": arab,
        "latin": latin,
        "terjemah": terjemah,
        "rujukan": f"QS. {s['namaLatin']} [{spec['surah']}]: {rentang}" + (" (potongan ayat)" if potongan else ""),
        "derajat": None,
        "sumber": "Al-Qur'an dan Terjemahan Kemenag RI, via equran.id",
        "url": f"https://quran.kemenag.go.id/quran/per-ayat/surah/{spec['surah']}?from={nomor[0]}&to={nomor[-1]}",
        "pelajaran": [],
    }


def potong(teks: str, setelah: str | None) -> str:
    if not setelah:
        return teks
    i = teks.find(setelah)
    assert i >= 0, f"Penanda potong tidak ada di sumber: {setelah}"
    return teks[: i + len(setelah)] + " …"


def potong_ar(teks: str, koma: int | None) -> str:
    if not koma:
        return teks
    bagian = teks.split("،")
    assert len(bagian) > koma, "Tanda koma Arab tidak cukup untuk dipotong"
    return "،".join(bagian[:koma]).rstrip() + " …"


def hadis(spec: dict) -> dict:
    d = get_json(f"https://hadeethenc.com/api/v1/hadeeths/one/?language=id&id={spec['id']}")
    hints = [re.sub(r"^\d+\s*-\s*", "", h).strip() for h in d.get("hints", [])]
    return {
        "jenis": "hadis",
        "arab": potong_ar(d["hadeeth_ar"].strip(), spec["potong_ar"]),
        "latin": None,
        "terjemah": potong(d["hadeeth"].strip(), spec["potong"]),
        "rujukan": d["attribution"].strip(),
        "derajat": d["grade"].strip(),
        "sumber": "Ensiklopedia Hadis Terjemahan, HadeethEnc.com",
        "url": f"https://hadeethenc.com/id/browse/hadith/{spec['id']}",
        "pelajaran": [hints[n - 1] for n in spec["pelajaran"]],
    }


def main() -> None:
    out = {judul: [ayat(s) if s["jenis"] == "ayat" else hadis(s) for s in daftar] for judul, daftar in PETA.items()}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{sum(len(v) for v in out.values())} dalil untuk {len(out)} bacaan ditulis ke {OUT}")


if __name__ == "__main__":
    main()
