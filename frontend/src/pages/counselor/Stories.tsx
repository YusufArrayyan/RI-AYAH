import { Inbox, Lock, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Banner, Button, EmptyState, ErrorState, LoadingBlock, PageHead, SimTag } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtRelative } from "../../lib/format";
import { useQueryState } from "../../lib/useQueryState";
import { useToast } from "../../lib/toast";
import { MessageList, type StoryMsg } from "../student/Stories";

interface Row {
  id: number;
  status: string;
  urgent: boolean;
  counselor: string | null;
  last_at: string;
  unread: number;
  student: string;
  class_name: string;
  mine: boolean;
}
interface Thread extends Row {
  messages: StoryMsg[];
}

/** Cerita tertulis dari siswa. Dibaca dan dibalas guru BK; setiap pembukaan tercatat. */
export default function CounselorStories() {
  const list = useResource<{ rows: Row[]; unread_total: number }>("/api/counselor/stories");
  const [sel, setSel] = useQueryState<string>("cerita", "");
  const thread = useResource<Thread>(sel ? `/api/counselor/stories/${sel}` : null);
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (thread.data) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.data?.id]);

  const reply = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/counselor/stories/${sel}/reply`, { method: "POST", json: { body: text } });
      setText("");
      await thread.reload();
      list.reload();
      toast("Balasan terkirim.");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    await api(`/api/counselor/stories/${sel}/close`, { method: "POST" });
    toast("Percakapan ditandai selesai.");
    thread.reload();
    list.reload();
  };

  return (
    <>
      <PageHead title="Cerita siswa" meta={<SimTag />} sub="Pesan tertulis dari siswa yang sulit bicara langsung. Balas dengan hangat dan singkat; ajak bertemu bila siswa mau." />
      {list.loading && !list.data && <LoadingBlock />}
      {list.error && !list.data && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && (
        <div className="layout-2col" style={{ gridTemplateColumns: undefined }}>
          <section className="card flush" aria-label="Daftar cerita">
            {list.data.rows.length === 0 ? (
              <EmptyState icon={<Inbox aria-hidden />} title="Belum ada cerita">
                Saat siswa menulis lewat “Cerita lewat tulisan”, pesannya muncul di sini.
              </EmptyState>
            ) : (
              <ul className="list">
                {list.data.rows.map((r) => (
                  <li key={r.id} style={{ padding: 0 }}>
                    <button
                      type="button"
                      onClick={() => setSel(String(r.id))}
                      aria-pressed={sel === String(r.id)}
                      className="row between nowrap-row"
                      style={{ width: "100%", padding: "14px 16px", border: 0, textAlign: "left", cursor: "pointer", minHeight: 56, background: sel === String(r.id) ? "var(--primary-soft)" : "transparent" }}
                    >
                      <span className="grow">
                        <span className="strong" style={{ display: "block" }}>
                          {r.student} <span className="muted" style={{ fontWeight: 400 }}>· {r.class_name}</span>
                        </span>
                        <span className="caption">
                          {fmtRelative(r.last_at)} · {r.counselor ? `ditangani ${r.counselor}` : "belum ada yang membalas"}
                          {r.status === "selesai" ? " · selesai" : ""}
                        </span>
                      </span>
                      <span className="row nowrap-row" style={{ gap: 6 }}>
                        {r.urgent && r.status === "terbuka" && <span className="chip chip-bad">Mendesak</span>}
                        {r.unread > 0 && <span className="chip chip-info">{r.unread} baru</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sticky-col" aria-label="Isi percakapan">
            {!sel && (
              <div className="card">
                <EmptyState title="Pilih satu cerita">Isi pesan hanya dibuka bila Anda memilihnya, dan setiap pembukaan tercatat di riwayat akses siswa.</EmptyState>
              </div>
            )}
            {sel && thread.loading && !thread.data && <LoadingBlock lines={2} />}
            {sel && thread.error && <ErrorState error={thread.error} onRetry={thread.reload} />}
            {thread.data && (
              <div className="card stack" style={{ gap: 12 }}>
                <div className="row between">
                  <h2>
                    {thread.data.student} <span className="muted small">· {thread.data.class_name}</span>
                  </h2>
                  {thread.data.status === "terbuka" && (
                    <Button size="sm" variant="ghost" onClick={close}>
                      Tandai selesai
                    </Button>
                  )}
                </div>
                <p className="caption row nowrap-row" style={{ gap: 6 }}>
                  <Lock aria-hidden style={{ width: 14, height: 14 }} /> Terenkripsi. Wali kelas, orang tua, dan admin tidak bisa membuka percakapan ini.
                </p>
                {thread.data.urgent && <Banner kind="bad">Siswa menandai pesan ini mendesak. Kasus merah sudah dibuka di Antrean; hubungi siswa hari ini.</Banner>}
                <MessageList messages={thread.data.messages} me="bk" />
                {thread.data.status === "terbuka" ? (
                  <form onSubmit={reply} className="stack" style={{ gap: 8 }}>
                    <label className="label" htmlFor="reply">
                      Balasan
                    </label>
                    <textarea id="reply" className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Terima kasih sudah cerita…" />
                    {err && <Banner kind="bad">{err}</Banner>}
                    <Button type="submit" icon={<Send aria-hidden />} loading={busy} disabled={!text.trim()} style={{ alignSelf: "flex-start" }}>
                      Kirim balasan
                    </Button>
                  </form>
                ) : (
                  <p className="small muted">Percakapan sudah selesai. Bila siswa menulis lagi, percakapan baru akan dibuka.</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
