import { CircleCheck, Hourglass, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { TrendChart } from "../../components/charts";
import { Banner, Button, ConfirmDialog, EmptyState, ErrorState, HumanNote, LoadingBlock, XaiBox, ZoneChip } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate, initials } from "../../lib/format";
import { useToast } from "../../lib/toast";

export interface ReasonJson {
  rank: number;
  indicator: string;
  title: string;
  text: string;
  detail: string;
  series: number[];
  trigger_from: number | null;
  summary: string | null;
}

interface Objection {
  status: string;
  decision: string | null;
  reason: string | null;
  created_at: string;
}

interface FlagData {
  zone?: string;
  child?: boolean;
  redirect?: string;
  message?: string;
  case_id?: number;
  status?: string;
  teacher?: string;
  response?: string | null;
  reasons?: ReasonJson[];
  counterfactual?: string | null;
  data_used?: string[];
  objection?: Objection | null;
  flagged_at?: string;
  flag_week?: number | null;
  sentence?: string;
}

export function ReasonCard({ r, startWeek }: { r: ReasonJson; startWeek?: number }) {
  return (
    <article className="card stack" style={{ gap: 8 }}>
      <div className="row between nowrap-row" style={{ alignItems: "flex-start" }}>
        <h3>{r.title}</h3>
        <span className="caption nowrap">Alasan {r.rank}</span>
      </div>
      <p>{r.text}</p>
      {r.series.length > 1 && (
        <TrendChart
          series={r.series}
          triggerFrom={r.trigger_from}
          summary={r.summary ?? r.text}
          startWeek={startWeek}
          higherIsBetter={r.indicator !== "tugas"}
          unit={r.indicator === "kehadiran" ? " hr" : ""}
        />
      )}
      <p className="caption">{r.detail}</p>
    </article>
  );
}

const DECISION_TEXT: Record<string, string> = {
  cabut: "Penandaan dicabut.",
  pertahankan: "Penandaan dipertahankan.",
  tinjau_aturan: "Penandaan dipertahankan untuk sementara, dan aturannya ditandai untuk ditinjau komite.",
};

export default function WhyFlagged() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<FlagData>("/api/me/flag");
  if (loading && !data) return <LoadingBlock label="Memuat alasan" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  if (data.redirect === "bantuan") return <Navigate to="/siswa/bantuan" replace state={{ gentle: true }} />;
  if (data.child || user?.ui_mode === "anak") return <ChildGreeting data={data} reload={reload} />;
  if (data.zone === "hijau")
    return (
      <>
        <h1>Mengapa saya ditandai?</h1>
        <div className="card">
          <EmptyState title="Tidak ada penandaan saat ini" action={<Link to="/siswa" className="btn btn-ghost">Kembali ke beranda</Link>}>
            {data.message}
          </EmptyState>
        </div>
      </>
    );
  return <TeenFlag data={data} reload={reload} />;
}

function TeenFlag({ data, reload }: { data: FlagData; reload: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [objecting, setObjecting] = useState(false);
  const [statement, setStatement] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reasons = data.reasons ?? [];
  const startWeek = data.flag_week ? data.flag_week - (reasons[0]?.series.length ?? 1) + 1 : undefined;

  const respond = async (response: "mau" | "belum_mau") => {
    setBusy(response);
    setErr(null);
    try {
      await api("/api/me/flag/respond", { method: "POST", json: { response } });
      await reload();
      toast(response === "mau" ? `${data.teacher} akan menghubungimu.` : "Sapaan ditunda. Tidak ada akibat apa pun.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const object = async () => {
    setBusy("obj");
    setErr(null);
    try {
      await api("/api/me/objection", { method: "POST", json: { statement } });
      setConfirm(false);
      setObjecting(false);
      await reload();
      toast("Keberatanmu terkirim ke peninjau manusia.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="stack" style={{ gap: 10, marginTop: 8 }}>
        <h1>Ini yang kami lihat dan mengapa</h1>
        <div className="row">
          <ZoneChip zone={data.zone!} note="bukan diagnosis" />
        </div>
        <p className="small">
          Sejak {fmtDate(data.flagged_at)}. {data.teacher === "Guru BK" ? "Guru BK" : `${data.teacher}, wali kelasmu,`} melihat alasan yang sama dengan kalimat yang sama. Tidak ada versi rahasia.
        </p>
      </div>

      <section className="stack" aria-labelledby="alasan-h">
        <h2 id="alasan-h" className="sr-only">
          Alasan
        </h2>
        {reasons.map((r) => (
          <ReasonCard key={r.rank} r={r} startWeek={startWeek} />
        ))}
      </section>

      {data.counterfactual && (
        <XaiBox title="Apa yang bisa mengubah penandaan ini">
          <p>{data.counterfactual}</p>
        </XaiBox>
      )}

      {data.data_used && (
        <p className="small muted">
          Dibaca dari data yang kamu izinkan: {data.data_used.join(", ")}. <Link to="/siswa/privasi">Ubah izin</Link>
        </p>
      )}

      {data.objection ? (
        <section className="card stack" style={{ gap: 6, borderColor: "var(--xai)" }}>
          <div className="row nowrap-row" style={{ gap: 10 }}>
            {data.objection.status === "menunggu" ? <Hourglass aria-hidden style={{ color: "var(--xai)" }} /> : <CircleCheck aria-hidden style={{ color: "var(--ok)" }} />}
            <h2 style={{ fontSize: 17 }}>{data.objection.status === "menunggu" ? "Sedang ditinjau" : "Keberatanmu sudah diputus"}</h2>
          </div>
          {data.objection.status === "menunggu" ? (
            <p className="small">Guru BK atau komite akan memeriksa keberatanmu dan menjelaskan hasilnya dengan bahasa sederhana. Selama ditinjau, tidak ada sapaan baru.</p>
          ) : (
            <>
              <p className="strong">{DECISION_TEXT[data.objection.decision ?? ""]}</p>
              {data.objection.reason && <p className="small">{data.objection.reason}</p>}
            </>
          )}
        </section>
      ) : data.response ? (
        <section className="card stack" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 17 }}>{data.response === "mau" ? `Kamu bersedia disapa ${data.teacher}` : "Kamu memilih belum mau disapa"}</h2>
          <p className="small">
            {data.response === "mau"
              ? `${data.teacher} akan mencari waktu yang tenang untuk ngobrol. Kamu tetap boleh berubah pikiran.`
              : "Sapaan ditunda. Tidak ada akibat pada nilai atau catatanmu. Kalau berubah pikiran, kamu bisa memilih lagi."}
          </p>
          <Button variant="ghost" onClick={() => respond(data.response === "mau" ? "belum_mau" : "mau")} loading={!!busy}>
            {data.response === "mau" ? "Aku berubah pikiran, belum mau" : "Aku mau disapa sekarang"}
          </Button>
        </section>
      ) : (
        <section className="stack" aria-labelledby="resp-title" style={{ gap: 10 }}>
          <h2 id="resp-title" style={{ fontSize: 17 }}>
            Bagaimana tanggapanmu?
          </h2>
          <div className="choice-row three">
            <Button variant="ghost" onClick={() => respond("mau")} loading={busy === "mau"} disabled={!!busy && busy !== "mau"}>
              Aku mau disapa
            </Button>
            <Button variant="ghost" onClick={() => respond("belum_mau")} loading={busy === "belum_mau"} disabled={!!busy && busy !== "belum_mau"}>
              Aku belum mau
            </Button>
            <Button variant="ghost" onClick={() => setObjecting(true)} aria-expanded={objecting} disabled={!!busy}>
              Ini tidak sesuai
            </Button>
          </div>
        </section>
      )}

      {objecting && !data.objection && (
        <section className="card stack" aria-labelledby="obj-title">
          <div className="row nowrap-row" style={{ gap: 10 }}>
            <MessageCircleQuestion aria-hidden style={{ color: "var(--xai)" }} />
            <h2 id="obj-title" style={{ fontSize: 17 }}>
              Apa yang tidak sesuai?
            </h2>
          </div>
          <p className="small">Ceritakan singkat bila mau, misalnya kamu sakit atau ikut lomba. Boleh juga dikosongkan.</p>
          <label className="sr-only" htmlFor="stmt">
            Penjelasan keberatan
          </label>
          <textarea id="stmt" className="textarea" value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={2000} placeholder="Contoh: Aku tidak masuk karena sakit, ada surat dokter…" />
          <div className="choice-row two">
            <Button variant="ghost" onClick={() => setObjecting(false)}>
              Batal
            </Button>
            <Button variant="xai" onClick={() => setConfirm(true)}>
              Kirim keberatan
            </Button>
          </div>
        </section>
      )}

      {err && <Banner kind="bad">{err}</Banner>}
      <HumanNote />

      <ConfirmDialog
        open={confirm}
        title="Kirim keberatan?"
        consequence="Penandaan ini akan ditinjau guru BK atau komite. Selama ditinjau, tidak ada sapaan baru. Hasilnya dikirim kepadamu."
        confirmLabel="Kirim"
        loading={busy === "obj"}
        onConfirm={object}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

/* ── S3-A Mode anak: disapa ────────────────────────────────────────────── */
function ChildGreeting({ data, reload }: { data: FlagData; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!data.sentence) {
    return (
      <>
        <h1>Tidak ada pesan</h1>
        <div className="card">
          <EmptyState title="Belum ada yang ingin menyapa" action={<Link to="/siswa" className="btn btn-ghost">Kembali</Link>}>
            Kalau ingin cerita, kamu selalu boleh datang ke guru BK.
          </EmptyState>
        </div>
      </>
    );
  }
  const choose = async (c: "boleh" | "belum" | "tidak_benar") => {
    setBusy(c);
    try {
      if (c === "tidak_benar") await api("/api/me/objection", { method: "POST", json: { statement: "" } });
      else await api("/api/me/flag/respond", { method: "POST", json: { response: c === "boleh" ? "mau" : "belum_mau" } });
      setDone(c);
      await reload();
    } finally {
      setBusy(null);
    }
  };
  const answered = done ?? (data.objection ? "tidak_benar" : data.response === "mau" ? "boleh" : data.response === "belum_mau" ? "belum" : null);
  const reply: Record<string, string> = {
    boleh: `Baik! ${data.teacher} akan mencarimu di waktu yang tenang.`,
    belum: "Tidak apa-apa. Tidak ada yang marah.",
    tidak_benar: "Terima kasih sudah memberi tahu. Guru BK akan memeriksanya.",
  };
  return (
    <>
      <section className="card stack" style={{ alignItems: "center", textAlign: "center", gap: 14, paddingTop: 28 }}>
        <span className="avatar" aria-hidden style={{ width: 84, height: 84, fontSize: 30, background: "#fde3c8", color: "#7a3a06" }}>
          {initials(data.teacher ?? "")}
        </span>
        <h1>{data.teacher} ingin menyapamu</h1>
        <p style={{ fontSize: 19, maxWidth: "30ch" }}>{data.sentence}</p>
      </section>

      {answered ? (
        <section className="card stack" style={{ alignItems: "center", textAlign: "center" }} aria-live="polite">
          <CircleCheck aria-hidden style={{ width: 36, height: 36, color: "var(--ok)" }} />
          <p className="child-title" style={{ fontSize: 22, color: "var(--ink)" }}>
            {reply[answered]}
          </p>
          <Link to="/siswa" className="btn btn-ghost">
            Kembali ke beranda
          </Link>
        </section>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <Button variant="ghost" block onClick={() => choose("boleh")} loading={busy === "boleh"} disabled={!!busy}>
            Boleh
          </Button>
          <Button variant="ghost" block onClick={() => choose("belum")} loading={busy === "belum"} disabled={!!busy}>
            Aku belum mau
          </Button>
          <Button variant="ghost" block onClick={() => choose("tidak_benar")} loading={busy === "tidak_benar"} disabled={!!busy}>
            Itu tidak benar
          </Button>
        </div>
      )}

      <div className="reassure">
        <CircleCheck aria-hidden />
        <span>Menolak tidak apa-apa. Nilaimu tidak berubah.</span>
      </div>
    </>
  );
}
