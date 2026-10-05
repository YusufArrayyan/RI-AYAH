import { CalendarClock, CheckCheck, Forward, OctagonAlert } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Banner, Button, ConfirmDialog, ErrorState, HumanNote, LoadingBlock, PageHead, SimTag, StatusChip, XaiBox, ZoneChip } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtDateTime, fmtRemaining } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { ReasonCard, type ReasonJson } from "../student/WhyFlagged";

interface Detail {
  id: number;
  code: string;
  class_name: string;
  student_name: string | null;
  zone: string;
  rule_id: string;
  status: string;
  student_response: string | null;
  withdrawn: boolean;
  reasons: ReasonJson[];
  counterfactual: string | null;
  hidden: string[];
  history: { action: string; outcome: string | null; at: string; actor: string }[];
  outcomes: string[];
  hours_left: number;
  overdue: boolean;
  flag_week: number | null;
}

export function Timeline({ items }: { items: Detail["history"] }) {
  return (
    <ol className="list" style={{ listStyle: "none" }}>
      {items.map((h, i) => (
        <li key={i} className="row nowrap-row" style={{ alignItems: "flex-start", gap: 12 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: "var(--primary)", marginTop: 7, flex: "none" }} />
          <span className="grow">
            <span className="strong">{h.outcome ?? h.action.replace(/_/g, " ")}</span>
            <span className="caption" style={{ display: "block" }}>
              {h.actor} · {fmtDateTime(h.at)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** G2 Detail kasus. */
export default function TeacherCase() {
  const { id } = useParams();
  const { data, error, loading, reload, setData } = useResource<Detail>(`/api/teacher/cases/${id}`);
  const toast = useToast();
  const [mode, setMode] = useState<null | "disapa" | "jadwal">(null);
  const [outcome, setOutcome] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const open = !["ditutup"].includes(data.status);

  const act = async (action: string, extra: Record<string, unknown> = {}, msg = "Tersimpan.") => {
    setBusy(action);
    setErr(null);
    try {
      const d = await api<Detail>(`/api/teacher/cases/${id}/action`, { method: "POST", json: { action, ...extra } });
      setData(d);
      setMode(null);
      setDanger(false);
      toast(msg);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const startWeek = data.flag_week && data.reasons[0] ? data.flag_week - data.reasons[0].series.length + 1 : undefined;

  return (
    <>
      <PageHead
        back={{ to: "/guru", label: "Daftar sapaan" }}
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

      {data.withdrawn && <Banner kind="info">Kasus ditutup karena siswa menarik persetujuan. Alasan disembunyikan dan tidak ada langkah lanjutan.</Banner>}

      <div className="layout-2col">
        <div className="stack" style={{ gap: 16 }}>
          {!data.withdrawn && (
            <>
              <section className="stack" aria-labelledby="alasan">
                <h2 id="alasan">Alasan</h2>
                <p className="small muted">Kalimat ini sama persis dengan yang dibaca siswa di layarnya.</p>
                {data.reasons.map((r) => (
                  <ReasonCard key={r.rank} r={r} startWeek={startWeek} />
                ))}
              </section>
              {data.counterfactual && (
                <XaiBox title="Apa yang bisa mengubah penandaan ini">
                  <p>{data.counterfactual}</p>
                </XaiBox>
              )}
            </>
          )}
          <XaiBox title="Yang tidak ditampilkan kepada Anda" tag="Batas">
            <ul>
              {data.hidden.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </XaiBox>
          <section className="card">
            <h2 style={{ marginBottom: 6 }}>Riwayat</h2>
            <Timeline items={data.history} />
          </section>
        </div>

        <aside className="sticky-col stack" style={{ gap: 12 }} aria-label="Langkah" id="langkah">
          <section className="card stack" style={{ gap: 12 }}>
            <div className="row between">
              <h2>Langkah</h2>
              {open && ["baru", "terlambat"].includes(data.status) && (
                <span className={`chip ${data.overdue ? "chip-bad" : "chip-info"}`}>{fmtRemaining(data.hours_left)}</span>
              )}
            </div>
            {data.student_response && (
              <Banner kind="info">{data.student_response === "mau" ? "Siswa memilih: mau disapa." : "Siswa memilih: belum mau. Jadwalkan ulang dengan jarak yang cukup."}</Banner>
            )}
            {open ? (
              <>
                <Button icon={<CheckCheck aria-hidden />} onClick={() => setMode(mode === "disapa" ? null : "disapa")} aria-expanded={mode === "disapa"} block>
                  Catat sudah menyapa
                </Button>
                {mode === "disapa" && (
                  <div className="stack" style={{ gap: 8 }}>
                    <fieldset className="option-list">
                      <legend className="label" style={{ marginBottom: 6 }}>
                        Kode hasil (tanpa isi cerita)
                      </legend>
                      {data.outcomes.map((o) => (
                        <label key={o} className="option" style={{ minHeight: 44, fontSize: 14.5 }}>
                          <input type="radio" name="outcome" checked={outcome === o} onChange={() => setOutcome(o)} />
                          {o}
                        </label>
                      ))}
                    </fieldset>
                    <Button onClick={() => act("disapa", { outcome }, "Sapaan tercatat.")} disabled={!outcome} loading={busy === "disapa"}>
                      Simpan
                    </Button>
                  </div>
                )}
                <Button variant="ghost" icon={<CalendarClock aria-hidden />} onClick={() => setMode(mode === "jadwal" ? null : "jadwal")} aria-expanded={mode === "jadwal"} block>
                  Jadwalkan ulang
                </Button>
                {mode === "jadwal" && (
                  <div className="row nowrap-row">
                    <label className="sr-only" htmlFor="days">
                      Jadwalkan ulang dalam
                    </label>
                    <select id="days" className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                      <option value={3}>3 hari lagi</option>
                      <option value={7}>7 hari lagi</option>
                      <option value={14}>14 hari lagi</option>
                    </select>
                    <Button onClick={() => act("jadwal_ulang", { days }, "Jadwal baru tersimpan.")} loading={busy === "jadwal_ulang"}>
                      Simpan
                    </Button>
                  </div>
                )}
                <Button variant="ghost" icon={<Forward aria-hidden />} onClick={() => act("teruskan_bk", {}, "Kasus diteruskan ke guru BK.")} loading={busy === "teruskan_bk"} block>
                  Teruskan ke BK
                </Button>
                <Button variant="danger-ghost" icon={<OctagonAlert aria-hidden />} onClick={() => setDanger(true)} block>
                  Ada tanda bahaya
                </Button>
              </>
            ) : (
              <p className="small muted">Kasus sudah ditutup. Tidak ada langkah yang perlu dilakukan.</p>
            )}
            {err && <Banner kind="bad">{err}</Banner>}
          </section>
          <Link to="/guru/panduan" className="card tight small strong" style={{ color: "var(--primary-dark)" }}>
            Bingung mau mulai dari mana? Buka panduan menyapa →
          </Link>
          <HumanNote>Penandaan bukan diagnosis. Anda menyapa sebagai guru yang peduli, bukan sebagai penilai.</HumanNote>
        </aside>
      </div>

      <ConfirmDialog
        open={danger}
        title="Laporkan tanda bahaya?"
        consequence="Antrean merah guru BK dibuka sekarang, dengan target kontak dalam 24 jam. Gunakan bila siswa menyebut ingin menyakiti diri atau tidak merasa aman."
        confirmLabel="Buka antrean merah"
        danger
        loading={busy === "tanda_bahaya"}
        onConfirm={() => act("tanda_bahaya", {}, "Antrean merah BK dibuka.")}
        onCancel={() => setDanger(false)}
      />
    </>
  );
}
