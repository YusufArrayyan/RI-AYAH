"""Tes penjelasan (kriteria 14.4.5): alasan sama dengan aturan yang dijalankan, dan
kontrafaktual benar-benar melepas tanda."""
import random

import pytest

from app import rules
from app.rules import Week

P = rules.DEFAULT_PARAMS


def hist(rows):
    return [Week(i + 1, *r) for i, r in enumerate(rows)]


STABLE = [(5, 12, 0, 80)] * 5


def test_hijau_tanpa_pemicu():
    assert rules.evaluate(hist(STABLE + [(5, 12, 0, 80)] * 3)).zone == "hijau"


def test_m1_didahulukan_dan_tidak_dibatalkan():
    h = hist(STABLE + [(4, 9, 1, 80), (3, 6, 2, 80), (2, 4, 3, 80)])
    ev = rules.evaluate(h, help_pressed=True)
    assert ev.zone == "merah" and ev.rule_id == "M1"
    ev2 = rules.evaluate(hist(STABLE), safety=True)
    assert ev2.rule_id == "M1"


def test_k1_dua_indikator_tiga_pekan():
    h = hist(STABLE + [(4, 9, 0, 80), (3, 6, 0, 80), (2, 4, 0, 80)])
    ev = rules.evaluate(h)
    assert ev.zone == "kuning" and ev.rule_id == "K1"
    assert set(ev.reason_indicators) == {"kehadiran", "lms"}


def test_k1_tidak_terpenuhi_bila_hanya_dua_pekan():
    h = hist(STABLE + [(5, 12, 0, 80), (4, 9, 0, 80), (3, 6, 0, 80)])
    assert rules.evaluate(h).zone == "hijau"


def test_paling_banyak_tiga_alasan_urut_perubahan_terbesar():
    h = hist(STABLE + [(4, 9, 1, 75), (3, 6, 2, 70), (2, 4, 3, 60)])
    ev = rules.evaluate(h)
    assert len(ev.reasons) == 3
    mags = [r.magnitude for r in ev.reasons]
    assert mags == sorted(mags, reverse=True)


def test_tidak_ada_skor_tunggal_dalam_alasan():
    h = hist(STABLE + [(4, 9, 1, 75), (3, 6, 2, 70), (2, 4, 3, 60)])
    for r in rules.evaluate(h).reasons:
        assert "skor" not in r.text.lower() and "%" not in r.text


def test_k2_hanya_bila_ikut_checkin():
    h = hist(STABLE)
    assert rules.evaluate(h, checkin_score=10, checkin_consented=False).zone == "hijau"
    ev = rules.evaluate(h, checkin_score=10, checkin_consented=True)
    assert ev.rule_id == "K2"
    assert rules.evaluate(h, checkin_score=7, checkin_consented=True).zone == "hijau"


def test_k1_didahulukan_atas_k2():
    h = hist(STABLE + [(4, 9, 0, 80), (3, 6, 0, 80), (2, 4, 0, 80)])
    assert rules.evaluate(h, checkin_score=12, checkin_consented=True).rule_id == "K1"


def test_kontrafaktual_melepas_tanda_kasus_contoh():
    h = hist(STABLE + [(4, 9, 1, 80), (3, 6, 2, 80), (2, 4, 3, 80)])
    ev = rules.evaluate(h)
    sim = rules.apply_counterfactual(h, ev.counterfactual, P["L"]["weeks"])
    assert rules.should_release(sim, h[-1].week, ev.triggering)


def test_tanpa_mengikuti_saran_tanda_tidak_dilepas():
    h = hist(STABLE + [(4, 9, 0, 80), (3, 6, 0, 80), (2, 4, 0, 80)])
    ev = rules.evaluate(h)
    worse = h + [Week(9, 1, 2, 0, 80), Week(10, 0, 1, 0, 80)]
    assert not rules.should_release(worse, h[-1].week, ev.triggering)


@pytest.mark.parametrize("seed", range(40))
def test_kontrafaktual_acak(seed):
    """Properti: untuk setiap penandaan K1 acak, mengikuti saran melepas tanda."""
    rng = random.Random(seed)
    base = [5, rng.randint(9, 15), rng.randint(0, 1), rng.randint(70, 90)]
    rows = [tuple(base)] * 4
    inds = rng.sample(range(4), rng.randint(2, 4))
    cur = list(base)
    for _ in range(rng.randint(3, 4)):
        for i in inds:
            if i == 0:
                cur[0] = max(0, cur[0] - 1)
            elif i == 1:
                cur[1] = max(0, cur[1] - 2)
            elif i == 2:
                cur[2] += 1
            else:
                cur[3] -= 5
        rows.append(tuple(cur))
    h = hist(rows)
    ev = rules.evaluate(h)
    if ev.rule_id != "K1":
        pytest.skip("kehadiran mencapai 0 sebelum tiga pekan")
    sim = rules.apply_counterfactual(h, ev.counterfactual, P["L"]["weeks"])
    assert rules.should_release(sim, h[-1].week, ev.triggering)


def test_ringkasan_teks_grafik():
    assert rules.text_summary("kehadiran", [5, 4, 3, 2]) == "Kehadiran: 5 → 4 → 3 → 2"
