import { CircleCheck, Lock } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner, Button, EmptyState, ErrorState, LoadingBlock } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { useToast } from "../../lib/toast";

interface CheckinData {
  consented: boolean;
  done: boolean;
  week: number;
  items: { id: string; text: string }[];
  choices: { value: number; label: string }[];
  safety: { id: string; text: string; choices: { value: boolean; label: string }[] };
  note: string;
  bk_can_read: boolean;
}

export default function Checkin() {
  const { data, error, loading, reload } = useResource<CheckinData>("/api/me/checkin");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [safety, setSafety] = useState<boolean | null>(null);
  const [redo, setRedo] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const toast = useToast();

  if (loading && !data) return <LoadingBlock label="Memuat check-in" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  if (!data.consented)
    return (
      <>
        <h1>Check-in mingguan</h1>
        <div className="card">
          <EmptyState icon={<Lock aria-hidden />} title="Check-in belum aktif" action={<Link to="/siswa/persetujuan" className="btn btn-ghost">Buka persetujuan</Link>}>
            Check-in sepenuhnya sukarela. Aktifkan bila kamu mau, atau biarkan mati. Tidak ada akibat apa pun.
          </EmptyState>
        </div>
      </>
    );

  if (data.done && !redo)
    return (
      <>
        <h1>Check-in mingguan</h1>
        <div className="card">
          <EmptyState icon={<CircleCheck aria-hidden />} title="Check-in pekan ini sudah terisi" action={<Button variant="ghost" onClick={() => setRedo(true)}>Isi ulang</Button>}>
            Terima kasih. Jawabanmu tersimpan terenkripsi{data.bk_can_read ? " dan hanya terbaca guru BK" : " dan tidak dibaca siapa pun selain sistem"}.
          </EmptyState>
        </div>
      </>
    );

  const total = data.items.length + 1;
  const isSafety = idx === data.items.length;
  const item = data.items[idx];

  const next = () => setIdx((i) => Math.min(total - 1, i + 1));
  const skip = () => {
    if (!isSafety) setAnswers((a) => ({ ...a, [item.id]: null }));
    if (isSafety) submit(null);
    else next();
  };
  const submit = async (s: boolean | null) => {
    setSending(true);
    setErr(null);
    try {
      const full = Object.fromEntries(data.items.map((i) => [i.id, answers[i.id] ?? null]));
      const r = await api<{ redirect: string | null }>("/api/me/checkin", { method: "POST", json: { answers: full, safety: s } });
      if (r.redirect === "bantuan") {
        nav("/siswa/bantuan", { replace: true, state: { gentle: true } });
        return;
      }
      toast("Terima kasih, check-in tersimpan.");
      nav("/siswa", { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const current = isSafety ? safety : answers[item.id];

  return (
    <>
      <div className="stack" style={{ gap: 10, marginTop: 8 }}>
        <div className="row between">
          <h1>Check-in</h1>
          <span className="small muted tnum">
            {idx + 1} dari {total}
          </span>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={idx + 1} aria-label="Kemajuan check-in">
          <span style={{ width: `${((idx + 1) / total) * 100}%` }} />
        </div>
      </div>

      <section className="card stack" aria-live="polite">
        <fieldset className="option-list">
          <legend style={{ fontSize: 19, fontWeight: 700, color: "var(--ink)", marginBottom: 14, lineHeight: 1.35 }}>{isSafety ? data.safety.text : item.text}</legend>
          {isSafety
            ? data.safety.choices.map((c) => (
                <label key={String(c.value)} className="option">
                  <input type="radio" name="safety" checked={safety === c.value} onChange={() => setSafety(c.value)} />
                  {c.label}
                </label>
              ))
            : data.choices.map((c) => (
                <label key={c.value} className="option">
                  <input type="radio" name={item.id} checked={answers[item.id] === c.value} onChange={() => setAnswers((a) => ({ ...a, [item.id]: c.value }))} />
                  {c.label}
                </label>
              ))}
        </fieldset>
        {isSafety && <p className="small muted">Bila kamu menjawab “Ya”, kami langsung menampilkan kontak bantuan. Kamu tidak akan dimarahi.</p>}
      </section>

      {err && <Banner kind="bad">{err}</Banner>}

      <div className="choice-row two">
        <Button variant="ghost" onClick={skip} disabled={sending}>
          Lewati
        </Button>
        {isSafety ? (
          <Button onClick={() => submit(safety)} loading={sending} disabled={safety === null}>
            Selesai
          </Button>
        ) : (
          <Button onClick={next} disabled={current === undefined || current === null}>
            Lanjut
          </Button>
        )}
      </div>
      <div className="row between">
        {idx > 0 ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setIdx((i) => i - 1)}>
            Kembali
          </button>
        ) : (
          <span />
        )}
        <Link to="/siswa" className="btn btn-quiet btn-sm">
          Berhenti tanpa menyimpan
        </Link>
      </div>
      <p className="caption">
        Tidak ada skor yang ditampilkan. Jawaban disimpan terenkripsi{data.bk_can_read ? "; hanya guru BK yang boleh membacanya." : " dan tidak dibaca guru."} {data.note}
      </p>
    </>
  );
}
