import { Check, Gavel, X } from "lucide-react";
import { useState } from "react";
import { Banner, Button, EmptyState, ErrorState, LoadingBlock, PageHead, SimTag, Tabs } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate } from "../../lib/format";
import { useToast } from "../../lib/toast";
import type { ReasonJson } from "../student/WhyFlagged";

interface Lists {
  objections: { id: number; case_id: number; code: string; status: string; decision: string | null; created_at: string; due_at: string; overdue: boolean }[];
  data_requests: { id: number; kind: string; status: string; requester_role: string; created_at: string; due_at: string; overdue: boolean; detail: string | null }[];
}
interface ObjDetail {
  id: number;
  code: string;
  student_name: string | null;
  statement: string;
  status: string;
  decision: string | null;
  reason: string | null;
  due_at: string;
  evidence: ReasonJson[];
  rule: string;
  counterfactual: string | null;
  system_saw: string[];
  system_not_saw: string[];
}
const DECISIONS = [
  { id: "cabut", label: "Cabut tanda" },
  { id: "pertahankan", label: "Pertahankan dengan alasan" },
  { id: "tinjau_aturan", label: "Tandai aturan untuk ditinjau" },
];
const REQ_LABEL: Record<string, string> = { hapus: "Hapus", perbaiki: "Perbaiki", lihat: "Lihat", unduh: "Unduh", tarik: "Tarik izin" };
const REQ_STATUS: Record<string, string> = { diajukan: "Diajukan", diproses: "Diproses", selesai: "Selesai", ditolak: "Ditolak" };

/** E3 Hak data dan keberatan (komite; BK melihat keberatan atas kasus miliknya). */
export default function Objections() {
  const { user } = useAuth();
  const committee = user?.role === "komite";
  const lists = useResource<Lists>("/api/ethics/requests");
  const [tab, setTab] = useState<"keberatan" | "hak">("keberatan");
  const [sel, setSel] = useState<number | null>(null);
  const detail = useResource<ObjDetail>(sel ? `/api/ethics/objections/${sel}` : null);
  const toast = useToast();
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const decide = async () => {
    setBusy("d");
    setErr(null);
    try {
      await api(`/api/ethics/objections/${sel}/decide`, { method: "POST", json: { decision, reason } });
      toast("Putusan tersimpan dan dikirim ke siswa dalam bahasa sederhana.");
      setDecision("");
      setReason("");
      lists.reload();
      detail.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const updateReq = async (id: number, status: string) => {
    setBusy(`r${id}`);
    try {
      await api(`/api/ethics/data-requests/${id}`, { method: "POST", json: { status } });
      toast("Status permintaan diperbarui.");
      lists.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const objs = lists.data?.objections ?? [];
  const reqs = lists.data?.data_requests ?? [];
  const d = detail.data;

  return (
    <>
      <PageHead
        title={committee ? "Hak data dan keberatan" : "Keberatan siswa"}
        meta={<SimTag />}
        sub="Setiap keberatan ditinjau manusia dan diputus dalam batas waktu. Putusan kembali ke siswa dalam bahasa sederhana."
      />
      {lists.loading && !lists.data && <LoadingBlock />}
      {lists.error && !lists.data && <ErrorState error={lists.error} onRetry={lists.reload} />}
      {lists.data && (
        <div className="stack" style={{ gap: 16 }}>
          {committee && (
            <Tabs
              label="Jenis permintaan"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "keberatan", label: "Keberatan", count: objs.filter((o) => o.status === "menunggu").length },
                { id: "hak", label: "Hak data", count: reqs.filter((r) => !["selesai", "ditolak"].includes(r.status)).length },
              ]}
            />
          )}

          {tab === "keberatan" && (
            <div className="layout-2col">
              <section className="card flush" aria-label="Daftar keberatan">
                {objs.length === 0 ? (
                  <EmptyState icon={<Gavel aria-hidden />} title="Tidak ada keberatan">
                    Keberatan siswa dari tombol “Ini tidak sesuai” muncul di sini.
                  </EmptyState>
                ) : (
                  <ul className="list">
                    {objs.map((o) => (
                      <li key={o.id} style={{ padding: 0 }}>
                        <button
                          type="button"
                          onClick={() => setSel(o.id)}
                          aria-pressed={sel === o.id}
                          className="row between"
                          style={{
                            width: "100%",
                            padding: "14px 16px",
                            border: 0,
                            background: sel === o.id ? "var(--primary-soft)" : o.overdue ? "var(--bad-soft)" : "transparent",
                            textAlign: "left",
                            cursor: "pointer",
                            minHeight: 56,
                          }}
                        >
                          <span>
                            <span className="mono strong">{o.code}</span>
                            <span className="caption" style={{ display: "block" }}>
                              Diajukan {fmtDate(o.created_at)} · batas {fmtDate(o.due_at)}
                            </span>
                          </span>
                          <span className={`chip ${o.overdue ? "chip-bad" : o.status === "menunggu" ? "chip-xai" : "chip-ok"}`}>
                            {o.overdue ? "Lewat batas · DPO" : o.status === "menunggu" ? "Menunggu" : "Diputus"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Panel peninjauan" className="sticky-col">
                {!sel && (
                  <div className="card">
                    <EmptyState title="Pilih satu keberatan">Panel peninjauan menampilkan pernyataan siswa, bukti, dan apa yang dilihat sistem.</EmptyState>
                  </div>
                )}
                {sel && detail.loading && !d && <LoadingBlock lines={2} />}
                {sel && detail.error && <ErrorState error={detail.error} onRetry={detail.reload} />}
                {d && (
                  <div className="card stack" style={{ gap: 14 }}>
                    <div className="row between">
                      <h2>
                        {d.student_name} <span className="mono muted small">{d.code}</span>
                      </h2>
                      <span className="chip chip-xai mono">{d.rule}</span>
                    </div>
                    <p className="caption">Identitas dibuka karena ada dasar kasus peninjauan. Pembukaan ini tercatat di log audit.</p>
                    <div className="stack" style={{ gap: 12 }}>
                      <div>
                        <h3 style={{ fontSize: 14.5, marginBottom: 4 }}>Pernyataan siswa</h3>
                        <blockquote style={{ margin: 0, padding: "10px 12px", background: "var(--panel)", borderRadius: 10, border: "1px solid var(--hairline)" }}>{d.statement}</blockquote>
                      </div>
                      <div>
                        <h3 style={{ fontSize: 14.5, marginBottom: 4 }}>Alasan tanda</h3>
                        <ul style={{ margin: 0, paddingLeft: "1.1em" }} className="small">
                          {d.evidence.map((e) => (
                            <li key={e.rank}>{e.text}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid-2">
                        <div>
                          <h3 style={{ fontSize: 14.5, marginBottom: 4 }}>Sistem melihat</h3>
                          <ul className="stack small" style={{ listStyle: "none", padding: 0, margin: 0, gap: 2 }}>
                            {d.system_saw.map((s) => (
                              <li key={s} className="row nowrap-row" style={{ gap: 6 }}>
                                <Check aria-hidden style={{ width: 14, height: 14, color: "var(--primary-dark)" }} /> {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h3 style={{ fontSize: 14.5, marginBottom: 4 }}>Sistem tidak melihat</h3>
                          <ul className="stack small" style={{ listStyle: "none", padding: 0, margin: 0, gap: 2 }}>
                            {d.system_not_saw.map((s) => (
                              <li key={s} className="row nowrap-row" style={{ gap: 6 }}>
                                <X aria-hidden style={{ width: 14, height: 14, color: "var(--mute)" }} /> {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                    {d.status === "diputus" ? (
                      <Banner kind="xai">
                        <strong>{DECISIONS.find((x) => x.id === d.decision)?.label}.</strong> {d.reason}
                      </Banner>
                    ) : (
                      <>
                        <div className="filter-chips" role="radiogroup" aria-label="Putusan">
                          {DECISIONS.map((x) => (
                            <button key={x.id} type="button" role="radio" aria-checked={decision === x.id} aria-pressed={decision === x.id} className="filter-chip" onClick={() => setDecision(x.id)}>
                              {x.label}
                            </button>
                          ))}
                        </div>
                        <label className="label" htmlFor="rs">
                          Alasan untuk siswa (bahasa sederhana)
                        </label>
                        <textarea id="rs" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Misalnya: Ketidakhadiranmu karena lomba resmi sekolah…" />
                        {err && <Banner kind="bad">{err}</Banner>}
                        <Button onClick={decide} loading={busy === "d"} disabled={!decision || reason.trim().length < 10}>
                          Simpan putusan
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "hak" && committee && (
            <section className="card flush">
              {reqs.length === 0 ? (
                <EmptyState title="Tidak ada permintaan hak data">Permintaan lihat, perbaiki, dan hapus dari siswa atau wali muncul di sini.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="table stack-mobile">
                    <caption className="sr-only">Permintaan hak data</caption>
                    <thead>
                      <tr>
                        <th scope="col">Jenis</th>
                        <th scope="col">Pemohon</th>
                        <th scope="col">Keterangan</th>
                        <th scope="col">Batas</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="sr-only">Aksi</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reqs.map((r) => (
                        <tr key={r.id} className={r.overdue ? "row-bad" : ""}>
                          <td data-label="Jenis" className="cell-main">
                            {REQ_LABEL[r.kind] ?? r.kind}
                          </td>
                          <td data-label="Pemohon">{r.requester_role === "wali" ? "Wali" : "Siswa"}</td>
                          <td data-label="Keterangan" className="small" style={{ maxWidth: 320 }}>
                            {r.detail ?? "-"}
                          </td>
                          <td data-label="Batas" className="nowrap" style={{ color: r.overdue ? "var(--bad)" : undefined, fontWeight: r.overdue ? 700 : 400 }}>
                            {fmtDate(r.due_at)}
                            {r.overdue && <span className="caption" style={{ display: "block", color: "var(--bad)" }}>Lewat batas, eskalasi DPO</span>}
                          </td>
                          <td data-label="Status">
                            <span className={`chip ${r.status === "selesai" ? "chip-ok" : r.status === "ditolak" ? "chip-neutral" : "chip-info"}`}>{REQ_STATUS[r.status]}</span>
                          </td>
                          <td className="actions">
                            {!["selesai", "ditolak"].includes(r.status) && (
                              <div className="row nowrap-row" style={{ gap: 6, justifyContent: "flex-end" }}>
                                {r.status === "diajukan" && (
                                  <Button size="sm" variant="ghost" onClick={() => updateReq(r.id, "diproses")} loading={busy === `r${r.id}`}>
                                    Proses
                                  </Button>
                                )}
                                <Button size="sm" onClick={() => updateReq(r.id, "selesai")} loading={busy === `r${r.id}`}>
                                  Selesai
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
