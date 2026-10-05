import { Lock, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Banner, Button, ErrorState, LoadingBlock } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDateTime } from "../../lib/format";
import { useToast } from "../../lib/toast";

export interface StoryMsg {
  id: number;
  from: "siswa" | "bk";
  author: string;
  body: string;
  at: string;
  read: boolean;
}
interface StoriesData {
  current: null | { id: number; counselor: string | null; urgent: boolean; messages: StoryMsg[] };
  history: { id: number; last_at: string; counselor: string | null }[];
}

export function MessageList({ messages, me }: { messages: StoryMsg[]; me: "siswa" | "bk" }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Chrome terbaru mengembalikan Promise dari scrollIntoView; jangan dijadikan nilai kembali efek.
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  return (
    <ol className="chat" aria-label="Percakapan">
      {messages.map((m) => (
        <li key={m.id} className={`bubble ${m.from === me ? "mine" : "theirs"}`}>
          <span className="bubble-who">{m.from === me ? "Kamu" : m.author}</span>
          <p>{m.body}</p>
          <time className="bubble-time" dateTime={m.at}>
            {fmtDateTime(m.at)}
          </time>
        </li>
      ))}
      <div ref={end} />
    </ol>
  );
}

/** Cerita lewat tulisan: siswa menulis ke guru BK tanpa harus bertemu langsung. */
export default function Stories() {
  const { user } = useAuth();
  const child = user?.ui_mode === "anak";
  const { data, error, loading, reload } = useResource<StoriesData>("/api/me/stories");
  const toast = useToast();
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => reload(), 20000);
    return () => clearInterval(t);
  }, [reload]);

  if (loading && !data) return <LoadingBlock label="Memuat cerita" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const cur = data.current;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ urgent_queued: boolean }>("/api/me/stories", { method: "POST", json: { body: text, urgent } });
      setText("");
      setUrgent(false);
      await reload();
      toast(r.urgent_queued ? "Terkirim. Guru BK diminta segera menghubungimu." : "Terkirim. Guru BK akan membalas di sini.");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        <h1>{child ? "Cerita ke guru BK" : "Cerita lewat tulisan"}</h1>
        <p className="muted">{child ? "Kamu boleh menulis apa saja yang kamu rasakan. Guru BK akan membalas." : "Kalau sulit bicara langsung, kamu bisa menulis dulu. Guru BK yang membaca dan membalas, bukan mesin."}</p>
      </div>

      <div className="privacy-note">
        <Lock aria-hidden />
        <span>
          Hanya kamu dan guru BK yang bisa membaca. Wali kelas dan orang tuamu <strong>tidak</strong> bisa melihatnya. Namamu terlihat oleh guru BK supaya ia bisa membantumu.
        </span>
      </div>

      {cur && cur.messages.length > 0 ? (
        <section className="card" aria-label="Percakapan dengan guru BK">
          <MessageList messages={cur.messages} me="siswa" />
          {!cur.messages.some((m) => m.from === "bk") && <p className="caption" style={{ marginTop: 8 }}>Pesanmu sudah terkirim. Guru BK biasanya membalas di jam sekolah.</p>}
        </section>
      ) : (
        <section className="card stack" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 17 }}>Mulai dari mana saja</h2>
          <p className="small">Tidak perlu rapi. Contoh: “Aku susah tidur karena kepikiran ujian”, atau “Aku lagi sedih tapi bingung mau cerita ke siapa”.</p>
        </section>
      )}

      <form onSubmit={send} className="card stack" style={{ gap: 10 }}>
        <label className="label" htmlFor="story">
          {cur ? "Tulis balasan" : "Tulis ceritamu"}
        </label>
        <textarea id="story" name="story" className="textarea" rows={4} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis di sini…" />
        <label className="check" style={{ paddingTop: 0 }}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          <span className="small">Ini mendesak, aku ingin dihubungi hari ini</span>
        </label>
        {err && <Banner kind="bad">{err}</Banner>}
        <Button type="submit" icon={<Send aria-hidden />} loading={busy} disabled={!text.trim()}>
          Kirim ke guru BK
        </Button>
      </form>

      <Banner kind="warn">
        Kalau kamu merasa tidak aman <strong>sekarang</strong>, jangan menunggu balasan. Buka <Link to="/siswa/bantuan">Butuh bantuan sekarang</Link>.
      </Banner>
    </>
  );
}
