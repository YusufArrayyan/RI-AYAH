import { Lock, Play, Send, Share2, SquareCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Banner, Button, ConfirmDialog, ErrorState, LoadingBlock, PageHead, SimTag, StatusChip, XaiBox, ZoneChip } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtDateTime, fmtRemaining, INDICATOR_LABEL } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { ReasonCard, type ReasonJson } from "../student/WhyFlagged";
import { Timeline } from "../teacher/CaseDetail";

interface Detail {
  id: number;
  code: string;
  student_name: string | null;
  student_id: number | null;
  class_name: string;
  zone: string;
  rule: string;
  rule_id: string;
  status: string;
  owner: string;
  student_response: string | null;
  withdrawn: boolean;
  closed_reason: string | null;
  reasons: ReasonJson[];
  counterfactual: string | null;
  params: Record<string, Record<string, number>>;
  indicators: { week: number; kehadiran: number; lms: number; tugas: number; kuis: number }[];
  checkin: null | { week: number; readable: boolean; score?: number; max?: number; threshold?: number; safety?: boolean; answers?: { item: string; answer: string }[] };
  consent: Record<string, { granted: boolean; assent: boolean | null }>;
  guardian: { id: number; name: string } | null;
  notes: { id: number; content: string; label: string | null; at: string; mine: boolean }[];
  history: { action: string; outcome: string | null; at: string; actor: string }[];
  outcomes: string[];
  hours_left: number;
  overdue: boolean;
  flag_week: number | null;
}

const CONSENT_LABEL: Record<string, string> = {
  kehadiran: "Kehadiran",
  lms: "Belajar daring",
  tugas: "Tugas",
  kuis: "Kuis",
  checkin: "Check-in",
  bk_baca_checkin: "BK baca check-in",
};

/** K2 Detail dan catatan. */
export default function CounselorCase() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useResource<Detail>(`/api/counselor/cases/${id}`);
  const protocol = useResource<{ referral_targets: string[] }>("/api/counselor/protocol");
  const toast = useToast();
  const [note, setNote] = useState("");
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<null | "wali" | "rujuk" | "tutup">(params.get("rujuk") ? "rujuk" : null);
  const [slots, setSlots] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "wali" && data?.student_id && !slots.length) {
      api<string[]>(`/api/counselor/students/${data.student_id}/guardian-slots`).then(setSlots).catch(() => {});
    }
  }, [mode, data, slots.length]);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const closed = data.status === "ditutup";

  const saveNote = async () => {
    setBusy("note");
    setErr(null);
    try {
      await api(`/api/counselor/cases/${id}/notes`, { method: "POST", json: { content: note, label: label || null } });
      setNote("");
      setLabel("");
      toast("Catatan tersimpan terenkripsi.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const act = async (action: string, extra: Record<string, unknown> = {}, msg = "Tersimpan.") => {
    setBusy(action);
    setErr(null);
    try {
      await api(`/api/counselor/cases/${id}/action`, { method: "POST", json: { action, ...extra } });
      setMode(null);
      setConfirmClose(false);
      toast(msg);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const startWeek = data.flag_week && data.reasons[0]?.series.length ? data.flag_week - data.reasons[0].series.length + 1 : undefined;
  const k1 = data.params.K1;

  return (
    <>
      <PageHead
        back={{ to: "/bk", label: "Antrean kasus" }}
        title={data.student_name ?? data.code}
        meta={<SimTag />}
        actions={
          <a href="#langkah" className="btn btn-ghost btn-sm only-narrow">
            Ke langkah
          </a>
        }
        sub={
          <span className="row" style={{ gap: 8 }}>
            <span className="mono">{data.code}</span> · {data.class_name} <ZoneChip zone={data.zone} /> <StatusChip status={data.status} />
          </span>
        }
      />
      {data.withdrawn && (
        <Banner kind="info">
          Persetujuan ditarik. Catatan baru tidak dapat ditambahkan. Catatan lama disimpan sesuai prosedur retensi lalu dihapus oleh DPO.
        </Banner>
      )}
      {closed && !data.withdrawn && <Banner kind="info">Kasus ditutup: {data.closed_reason}</Banner>}
      <p className="caption row nowrap-row" style={{ gap: 6, marginTop: -8, marginBottom: 12 }}>
        <Lock aria-hidden style={{ width: 14, height: 14 }} /> Pembukaan halaman ini tercatat di log audit (E1) dan terlihat oleh siswa di riwayat aksesnya.
      </p>

      <div className="layout-2col">
        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack" aria-labelledby="ringkas">
            <h2 id="ringkas">Ringkasan</h2>
            <dl className="dl">
              <dt>Aturan pemicu</dt>
              <dd>{data.rule}</dd>
              <dt>Penanggung jawab</dt>
              <dd>{data.owner}</dd>
              <dt>Tanggapan siswa</dt>
              <dd>{data.student_response === "mau" ? "Mau disapa" : data.student_response === "belum_mau" ? "Belum mau" : "Belum ada"}</dd>
              <dt>Wali</dt>
              <dd>{data.guardian?.name ?? "Tidak ada (mahasiswa atau belum terdaftar)"}</dd>
            </dl>
            <div className="row" style={{ gap: 6 }}>
              {Object.entries(data.consent).map(([k, v]) => (
                <span key={k} className={`chip ${v.granted ? "chip-ok" : "chip-neutral"}`}>
                  {CONSENT_LABEL[k] ?? k}: {v.granted ? "ya" : "tidak"}
                </span>
              ))}
            </div>
          </section>

          {data.reasons.length > 0 && data.reasons[0].indicator !== "bantuan" && (
            <section className="stack" aria-labelledby="alasan">
              <h2 id="alasan">Alasan lengkap</h2>
              {data.reasons.map((r) => (
                <ReasonCard key={r.rank} r={r} startWeek={startWeek} />
              ))}
            </section>
          )}
          {data.reasons[0]?.indicator === "bantuan" && (
            <Banner kind="bad">
              <strong>{data.reasons[0].text}</strong> {data.reasons[0].detail}
            </Banner>
          )}

          <XaiBox title="Jejak aturan dan angka per pekan">
            <p className="small" style={{ marginBottom: 8 }}>
              K1 aktif: {k1.min_indicators} indikator atau lebih memburuk {k1.weeks} pekan berturut-turut. K2: skor check-in ≥ {data.params.K2.threshold}.
            </p>
            <div className="table-wrap" style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--hairline)" }}>
              <table className="table">
                <caption className="sr-only">Indikator mingguan</caption>
                <thead>
                  <tr>
                    <th scope="col">Pekan</th>
                    {(["kehadiran", "lms", "tugas", "kuis"] as const).map((k) => (
                      <th key={k} scope="col">
                        {INDICATOR_LABEL[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.indicators.map((w) => (
                    <tr key={w.week}>
                      <td className="cell-main">P{w.week}</td>
                      <td className="tnum">{w.kehadiran} hari</td>
                      <td className="tnum">{w.lms}×</td>
                      <td className="tnum">{w.tugas}</td>
                      <td className="tnum">{Math.round(w.kuis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.counterfactual && <p className="small" style={{ marginTop: 8 }}>{data.counterfactual}</p>}
          </XaiBox>

          <section className="card stack" aria-labelledby="ci">
            <h2 id="ci">Check-in terakhir</h2>
            {!data.checkin ? (
              <p className="small muted">Siswa belum mengisi check-in.</p>
            ) : !data.checkin.readable ? (
              <p className="small row nowrap-row" style={{ gap: 8 }}>
                <Lock aria-hidden style={{ width: 16, height: 16, flex: "none" }} /> Siswa tidak mengizinkan guru BK membaca jawaban check-in. Hormati pilihan ini.
              </p>
            ) : (
              <>
                <p className="small">
                  Pekan {data.checkin.week} · skor {data.checkin.score} dari {data.checkin.max} (ambang {data.checkin.threshold})
                  {data.checkin.safety && <strong style={{ color: "var(--bad)" }}> · butir keselamatan: Ya</strong>}
                </p>
                <ul className="list">
                  {data.checkin.answers!.map((a) => (
                    <li key={a.item} className="row between nowrap-row" style={{ alignItems: "flex-start" }}>
                      <span className="small">{a.item}</span>
                      <span className="chip chip-neutral">{a.answer}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card stack" aria-labelledby="catatan">
            <div className="row between">
              <h2 id="catatan">Catatan sesi</h2>
              <span className="caption row nowrap-row" style={{ gap: 4 }}>
                <Lock aria-hidden style={{ width: 14, height: 14 }} /> Terenkripsi, hanya Anda
              </span>
            </div>
            {data.notes.length === 0 && <p className="small muted">Belum ada catatan.</p>}
            <ul className="list">
              {data.notes.map((n) => (
                <li key={n.id}>
                  <p style={{ whiteSpace: "pre-wrap" }}>{n.content}</p>
                  <p className="caption">
                    {fmtDateTime(n.at)}
                    {n.label ? ` · ${n.label}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            {!data.withdrawn && (
              <>
                <label className="label" htmlFor="note">
                  Catatan baru
                </label>
                <p className="hint">Catatan tidak pernah terbaca guru, wali, atau admin.</p>
                <textarea id="note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ringkas dan faktual…" />
                <div className="filter-chips" role="radiogroup" aria-label="Label hasil">
                  {data.outcomes.map((o) => (
                    <button key={o} type="button" role="radio" aria-checked={label === o} className="filter-chip" aria-pressed={label === o} onClick={() => setLabel(label === o ? "" : o)}>
                      {o}
                    </button>
                  ))}
                </div>
                <Button onClick={saveNote} loading={busy === "note"} disabled={note.trim().length < 3} style={{ alignSelf: "flex-start" }}>
                  Simpan catatan
                </Button>
              </>
            )}
          </section>
        </div>

        <aside className="stack sticky-col" style={{ gap: 12 }} aria-label="Langkah" id="langkah">
          <section className="card stack" style={{ gap: 10 }}>
            <div className="row between">
              <h2>Langkah</h2>
              {["baru", "terlambat"].includes(data.status) && <span className={`chip ${data.overdue ? "chip-bad" : "chip-info"}`}>{fmtRemaining(data.hours_left)}</span>}
            </div>
            {closed ? (
              <p className="small muted">Kasus sudah ditutup.</p>
            ) : (
              <>
                <Button icon={<Play aria-hidden />} onClick={() => act("mulai_sesi", {}, "Sesi dimulai.")} loading={busy === "mulai_sesi"} block>
                  Mulai sesi
                </Button>
                <Button variant="ghost" icon={<Send aria-hidden />} onClick={() => setMode(mode === "wali" ? null : "wali")} aria-expanded={mode === "wali"} disabled={!data.guardian} block>
                  Hubungi wali
                </Button>
                {mode === "wali" && (
                  <div className="stack" style={{ gap: 8 }}>
                    <p className="small">Wali menerima undangan dan tiga pilihan waktu, tanpa zona atau alasan.</p>
                    {slots.map((s, i) => (
                      <input key={i} className="input" value={s} aria-label={`Pilihan waktu ${i + 1}`} onChange={(e) => setSlots((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
                    <Button onClick={() => act("hubungi_wali", { slots }, "Undangan dikirim ke wali.")} loading={busy === "hubungi_wali"} disabled={!slots.length}>
                      Kirim undangan
                    </Button>
                  </div>
                )}
                <Button variant="ghost" icon={<Share2 aria-hidden />} onClick={() => setMode(mode === "rujuk" ? null : "rujuk")} aria-expanded={mode === "rujuk"} block>
                  Rujuk
                </Button>
                {mode === "rujuk" && (
                  <div className="stack" style={{ gap: 8 }}>
                    <label className="label" htmlFor="target">
                      Tujuan rujukan
                    </label>
                    <select id="target" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="">Pilih layanan</option>
                      {(protocol.data?.referral_targets ?? []).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                      <option>Psikolog atau psikiater (luar sekolah)</option>
                    </select>
                    <Button onClick={() => act("rujuk", { referral_to: target }, "Rujukan tercatat.")} loading={busy === "rujuk"} disabled={!target}>
                      Catat rujukan
                    </Button>
                  </div>
                )}
                <Button variant="ghost" icon={<SquareCheck aria-hidden />} onClick={() => setMode(mode === "tutup" ? null : "tutup")} aria-expanded={mode === "tutup"} block>
                  Tutup kasus
                </Button>
                {mode === "tutup" && (
                  <div className="stack" style={{ gap: 8 }}>
                    <label className="label" htmlFor="reason">
                      Alasan penutupan
                    </label>
                    <select id="reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
                      <option value="">Pilih alasan</option>
                      {data.outcomes.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                    <label className="label" htmlFor="review">
                      Jadwal tinjauan
                    </label>
                    <input id="review" className="input" type="date" value={review} onChange={(e) => setReview(e.target.value)} />
                    <Button onClick={() => setConfirmClose(true)} disabled={!reason || !review}>
                      Tutup kasus
                    </Button>
                  </div>
                )}
              </>
            )}
            {err && <Banner kind="bad">{err}</Banner>}
          </section>
          <section className="card">
            <h2 style={{ marginBottom: 6 }}>Riwayat</h2>
            <Timeline items={data.history} />
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmClose}
        title="Tutup kasus ini?"
        consequence={`Penandaan dilepas dan kasus keluar dari antrean. Tinjauan dijadwalkan ${review || "-"}.`}
        confirmLabel="Tutup kasus"
        loading={busy === "tutup"}
        onConfirm={() => act("tutup", { reason, review_at: review }, "Kasus ditutup.")}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}
