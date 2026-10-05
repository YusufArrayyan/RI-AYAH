"""Mesin aturan Ri'ayah (PRD Bab 4.2–4.3, XAI-1).

Aturan dapat ditafsirkan sejak rancangan: setiap zona berasal dari satu aturan terdokumentasi,
setiap penandaan membawa paling banyak tiga alasan dalam kalimat biasa, dan setiap kuning
membawa kontrafaktual sederhana yang dapat diuji (lihat tests/test_rules.py).

Urutan evaluasi tetap: M1 (merah) → K1 (tren) → K2 (check-in) → H (hijau).
Semua parameter adalah usulan (placeholder) yang ditetapkan psikolog dan komite.
"""
from __future__ import annotations

from dataclasses import dataclass, field

DEFAULT_PARAMS: dict[str, dict] = {
    "M1": {"response_hours": 24},
    "K1": {"min_indicators": 2, "weeks": 3},
    "K2": {"threshold": 8, "max": 12},
    "L": {"weeks": 2},
}

# better: "up" berarti nilai lebih tinggi lebih baik.
# scale: penyebut tetap untuk membandingkan besar perubahan antar indikator.
# step: perubahan terkecil yang dianggap "membaik" untuk kontrafaktual.
# effort: perkiraan usaha siswa untuk satu langkah (usulan perancang, dikalibrasi psikolog).
#   Nilai kuis paling sulit dikendalikan langsung, sehingga diberi usaha tertinggi.
INDICATORS: dict[str, dict] = {
    "kehadiran": {"label": "Kehadiran", "better": "up", "scale": 5.0, "step": 1, "effort": 0.20, "unit": "hari"},
    "lms": {"label": "Aktivitas belajar daring", "better": "up", "scale": 15.0, "step": 2, "effort": 0.15, "unit": "kali"},
    "tugas": {"label": "Tugas terlambat", "better": "down", "scale": 5.0, "step": 1, "effort": 0.20, "unit": "tugas"},
    "kuis": {"label": "Nilai kuis", "better": "up", "scale": 100.0, "step": 5, "effort": 0.30, "unit": ""},
}
IND_ORDER = tuple(INDICATORS)


@dataclass(frozen=True)
class Week:
    week: int
    kehadiran: float
    lms: float
    tugas: float
    kuis: float

    def get(self, ind: str) -> float:
        return float(getattr(self, ind))


@dataclass
class ReasonOut:
    indicator: str
    title: str
    text: str
    detail: str
    series: list[float]
    trigger_from: int | None  # indeks pertama segmen yang memicu pada `series`
    magnitude: float = 0.0


@dataclass
class Evaluation:
    zone: str  # hijau | kuning | merah
    rule_id: str  # M1 | K1 | K2 | H
    reasons: list[ReasonOut] = field(default_factory=list)
    counterfactual: dict | None = None
    triggering: list[str] = field(default_factory=list)

    @property
    def reason_indicators(self) -> list[str]:
        return [r.indicator for r in self.reasons]


def _fmt(ind: str, v: float) -> str:
    return str(int(round(v))) if ind != "kuis" else f"{v:.0f}"


def worsened(ind: str, prev: float, cur: float) -> bool:
    return cur < prev if INDICATORS[ind]["better"] == "up" else cur > prev


def improved_vs(ind: str, ref: float, cur: float) -> bool:
    """Lebih baik dari nilai acuan, setidaknya satu langkah."""
    step = INDICATORS[ind]["step"]
    return cur >= ref + step if INDICATORS[ind]["better"] == "up" else cur <= ref - step


def worsening_streak(history: list[Week], ind: str) -> int:
    streak = 0
    for i in range(len(history) - 1, 0, -1):
        if worsened(ind, history[i - 1].get(ind), history[i].get(ind)):
            streak += 1
        else:
            break
    return streak


def _reason_text(ind: str, start: float, end: float, weeks: int) -> tuple[str, str]:
    a, b = _fmt(ind, start), _fmt(ind, end)
    if ind == "kehadiran":
        text = f"Kehadiran turun dari {a} ke {b} hari per pekan selama {weeks} pekan."
    elif ind == "lms":
        text = f"Membuka materi daring berkurang dari {a} ke {b} kali per pekan."
    elif ind == "tugas":
        text = f"Tugas yang terlambat bertambah dari {a} ke {b} per pekan."
    else:
        text = f"Nilai kuis turun dari {a} ke {b}."
    detail = f"Memburuk {weeks} pekan berturut-turut"
    return text, detail


def _summary(ind: str, series: list[float]) -> str:
    vals = " → ".join(_fmt(ind, v) for v in series)
    return f"{INDICATORS[ind]['label']}: {vals}"


def _k1_reasons(history: list[Week], worsening: dict[str, int], window: int) -> list[ReasonOut]:
    out: list[ReasonOut] = []
    for ind, streak in worsening.items():
        start = history[-1 - streak].get(ind)
        end = history[-1].get(ind)
        mag = abs(end - start) / INDICATORS[ind]["scale"]
        series = [w.get(ind) for w in history[-window:]]
        trigger_from = max(0, len(series) - 1 - streak)
        text, detail = _reason_text(ind, start, end, streak)
        out.append(
            ReasonOut(
                indicator=ind,
                title=INDICATORS[ind]["label"],
                text=text,
                detail=detail,
                series=series,
                trigger_from=trigger_from,
                magnitude=round(mag, 4),
            )
        )
    # Paling besar perubahannya lebih dulu; seri ditiebreak urutan tetap agar stabil.
    out.sort(key=lambda r: (-r.magnitude, IND_ORDER.index(r.indicator)))
    return out[:3]


def _k1_counterfactual(history: list[Week], triggering: list[str], params: dict) -> dict:
    """Perubahan terkecil yang melepas tanda menurut aturan L.

    Agar K1 berhenti terpenuhi, cukup (jumlah indikator memburuk − ambang + 1) indikator
    yang membaik. Dipilih indikator dengan usaha ternormalisasi terkecil.
    """
    min_ind = params["K1"]["min_indicators"]
    need = len(triggering) - min_ind + 1
    l_weeks = params["L"]["weeks"]
    effort = sorted(
        triggering,
        key=lambda i: (INDICATORS[i]["effort"], IND_ORDER.index(i)),
    )
    chosen = effort[:need]
    targets = []
    for ind in chosen:
        meta = INDICATORS[ind]
        last = history[-1].get(ind)
        target = last + meta["step"] if meta["better"] == "up" else max(0.0, last - meta["step"])
        targets.append({"indicator": ind, "target": target, "direction": meta["better"]})
    parts = []
    for t in targets:
        ind, v = t["indicator"], _fmt(t["indicator"], t["target"])
        if ind == "kehadiran":
            parts.append(f"kehadiran kembali ke {v} hari atau lebih per pekan")
        elif ind == "lms":
            parts.append(f"materi daring dibuka {v} kali atau lebih per pekan")
        elif ind == "tugas":
            parts.append(f"tugas terlambat turun ke {v} atau kurang per pekan")
        else:
            parts.append(f"nilai kuis naik ke {v} atau lebih")
    joined = " dan ".join(parts)
    text = f"Bila {joined} selama {l_weeks} pekan berturut-turut, penandaan ini dilepas."
    return {"rule": "L", "weeks": l_weeks, "targets": targets, "triggering": triggering, "text": text}


def evaluate(
    history: list[Week],
    params: dict | None = None,
    *,
    checkin_score: int | None = None,
    checkin_consented: bool = False,
    safety: bool = False,
    help_pressed: bool = False,
    window: int = 6,
) -> Evaluation:
    """Evaluasi satu pekan terakhir. Pemicu pertama yang terpenuhi menentukan zona."""
    p = params or DEFAULT_PARAMS

    # M1: tombol bantuan atau butir keselamatan. Tidak dapat dibatalkan aturan lain.
    if help_pressed or safety:
        if help_pressed:
            text = "Kamu menekan tombol “Butuh bantuan sekarang”."
            detail = "Guru BK siaga diminta menghubungimu."
        else:
            text = "Satu jawaban check-in menyangkut keselamatanmu."
            detail = "Guru BK siaga diminta menghubungimu."
        r = ReasonOut("bantuan", "Permintaan bantuan", text, detail, [], None, 1.0)
        return Evaluation("merah", "M1", [r], None, [])

    # K1: dua indikator atau lebih memburuk N pekan berturut-turut.
    k1 = p["K1"]
    if len(history) > k1["weeks"]:
        streaks = {ind: worsening_streak(history, ind) for ind in IND_ORDER}
        worsening = {i: s for i, s in streaks.items() if s >= k1["weeks"]}
        if len(worsening) >= k1["min_indicators"]:
            reasons = _k1_reasons(history, worsening, window)
            triggering = list(worsening)
            cf = _k1_counterfactual(history, triggering, p)
            return Evaluation("kuning", "K1", reasons, cf, triggering)

    # K2: skor check-in ≥ ambang, hanya bila siswa ikut check-in.
    if checkin_consented and checkin_score is not None and checkin_score >= p["K2"]["threshold"]:
        r = ReasonOut(
            "checkin",
            "Check-in",
            "Beberapa jawaban check-in menunjukkan kamu mungkin sedang lelah.",
            "Dari check-in yang kamu isi dengan sukarela",
            [],
            None,
            0.5,
        )
        cf = {
            "rule": "L",
            "weeks": p["L"]["weeks"],
            "targets": [],
            "text": "Bila jawaban check-in dua pekan ke depan tidak lagi menunjukkan tanda lelah, penandaan ini dilepas.",
        }
        return Evaluation("kuning", "K2", [r], cf, ["checkin"])

    return Evaluation("hijau", "H")


def should_release(
    history: list[Week],
    flag_week: int,
    triggering: list[str],
    params: dict | None = None,
) -> bool:
    """Aturan L: tanda dilepas bila K1 tidak lagi terpenuhi dan cukup banyak indikator
    pemicu membaik dibanding nilai saat ditandai selama L pekan berturut-turut."""
    p = params or DEFAULT_PARAMS
    l_weeks = p["L"]["weeks"]
    idx = next((i for i, w in enumerate(history) if w.week == flag_week), None)
    if idx is None:
        return False
    after = history[idx + 1 :]
    if len(after) < l_weeks:
        return False
    ref = history[idx]
    recent = after[-l_weeks:]
    improved = [i for i in triggering if all(improved_vs(i, ref.get(i), w.get(i)) for w in recent)]
    need = len(triggering) - p["K1"]["min_indicators"] + 1
    still_k1 = evaluate(history, p).rule_id == "K1"
    return len(improved) >= need and not still_k1


_BOUNDS = {"kehadiran": (0.0, 5.0), "lms": (0.0, 99.0), "tugas": (0.0, 20.0), "kuis": (0.0, 100.0)}


def apply_counterfactual(history: list[Week], cf: dict, weeks: int) -> list[Week]:
    """Simulasikan siswa mengikuti saran secara ketat: indikator target memenuhi target,
    indikator pemicu lain TERUS memburuk satu langkah per pekan (skenario terburuk), dan
    indikator di luar penandaan tetap."""
    last = history[-1]
    targets = {t["indicator"]: t["target"] for t in cf["targets"]}
    out = list(history)
    prev = {ind: last.get(ind) for ind in IND_ORDER}
    for n in range(1, weeks + 1):
        vals = {}
        for ind in IND_ORDER:
            if ind in targets:
                vals[ind] = targets[ind]
                continue
            if ind not in cf.get("triggering", []):
                vals[ind] = prev[ind]
                continue
            meta, (lo, hi) = INDICATORS[ind], _BOUNDS[ind]
            delta = -meta["step"] if meta["better"] == "up" else meta["step"]
            vals[ind] = min(hi, max(lo, prev[ind] + delta))
        out.append(Week(week=last.week + n, **vals))
        prev = vals
    return out


def text_summary(ind: str, series: list[float]) -> str:
    """Ringkasan teks grafik tren untuk pembaca layar (PRD 7.7)."""
    return _summary(ind, series)
