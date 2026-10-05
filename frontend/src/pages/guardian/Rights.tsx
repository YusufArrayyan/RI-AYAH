import { Download, Eye, FilePen, Trash2, UserX } from "lucide-react";
import { useState } from "react";
import { Banner, Button, ConfirmDialog, ErrorState, LoadingBlock } from "../../components/ui";
import { api, download, useResource } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { CONSENT_STATUS, ChildPicker, useChildren } from "./common";

interface RightsData {
  child: { id: number; name: string; class_name: string };
  consent: { status: string };
  stored: string[];
  retention: string;
  requests: { id: number; kind: string; status: string; created_at: string; due_at: string; overdue: boolean }[];
}
const REQ_LABEL: Record<string, string> = { hapus: "Hapus data", perbaiki: "Perbaiki data", lihat: "Lihat data" };
const REQ_STATUS: Record<string, string> = { diajukan: "Diajukan", diproses: "Diproses DPO", selesai: "Selesai", ditolak: "Ditolak" };

/** W3 Hak data anak. */
export default function GuardianRights() {
  const kids = useChildren();
  const sid = kids.selected?.id;
  const res = useResource<RightsData>(sid ? `/api/guardian/children/${sid}/rights` : null);
  const toast = useToast();
  const [dialog, setDialog] = useState<null | "tarik" | "hapus">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fix, setFix] = useState("");
  const [fixOpen, setFixOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (kids.loading && !kids.data) return <LoadingBlock />;
  if (kids.error && !kids.data) return <ErrorState error={kids.error} onRetry={kids.reload} />;
  const d = res.data;

  const request = async (kind: string, detail = "") => {
    setBusy(kind);
    setErr(null);
    try {
      await api(`/api/guardian/children/${sid}/requests`, { method: "POST", json: { kind, detail } });
      await res.reload();
      toast("Permintaan terkirim.");
      setDialog(null);
      setFixOpen(false);
      setFix("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const withdraw = async () => {
    setBusy("tarik");
    try {
      await api(`/api/guardian/children/${sid}/withdraw`, { method: "POST" });
      await Promise.all([res.reload(), kids.reload()]);
      setDialog(null);
      toast("Persetujuan ditarik. Pemrosesan data anak berhenti.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h1>Hak data {kids.selected?.nickname}</h1>
      {kids.data && <ChildPicker items={kids.data} selected={kids.selected} onSelect={kids.select} />}
      {res.loading && !d && <LoadingBlock lines={2} />}
      {res.error && !d && <ErrorState error={res.error} onRetry={res.reload} />}
      {d && (
        <>
          <section className="card row between">
            <span className="small muted">Status persetujuan</span>
            <span className={`chip ${CONSENT_STATUS[d.consent.status].cls}`}>{CONSENT_STATUS[d.consent.status].label}</span>
          </section>
          <section className="card stack" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 17 }}>Yang tersimpan tentang {d.child.name.split(" ")[0]}</h2>
            <ul style={{ margin: 0, paddingLeft: "1.2em" }} className="stack small">
              {d.stored.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="caption">{d.retention}</p>
          </section>

          {err && <Banner kind="bad">{err}</Banner>}
          <div className="grid-2">
            <Button variant="ghost" icon={<Eye aria-hidden />} onClick={() => request("lihat")} loading={busy === "lihat"}>
              Minta lihat data
            </Button>
            <Button
              variant="ghost"
              icon={<Download aria-hidden />}
              loading={busy === "unduh"}
              onClick={async () => {
                setBusy("unduh");
                try {
                  await download(`/api/guardian/children/${sid}/export`, "data-riayah-anak.json");
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Unduh salinan
            </Button>
            <Button variant="ghost" icon={<FilePen aria-hidden />} onClick={() => setFixOpen((o) => !o)} aria-expanded={fixOpen}>
              Perbaiki data
            </Button>
            <Button variant="danger-ghost" icon={<Trash2 aria-hidden />} onClick={() => setDialog("hapus")}>
              Hapus data
            </Button>
          </div>
          {fixOpen && (
            <div className="card stack">
              <label className="label" htmlFor="gfix">
                Data apa yang keliru?
              </label>
              <textarea id="gfix" className="textarea" value={fix} onChange={(e) => setFix(e.target.value)} />
              <div className="choice-row two">
                <Button variant="ghost" onClick={() => setFixOpen(false)}>
                  Batal
                </Button>
                <Button onClick={() => request("perbaiki", fix)} disabled={fix.trim().length < 5} loading={busy === "perbaiki"}>
                  Kirim
                </Button>
              </div>
            </div>
          )}
          <Button variant="danger-ghost" icon={<UserX aria-hidden />} onClick={() => setDialog("tarik")} disabled={d.consent.status === "belum"}>
            Tarik izin
          </Button>

          <section className="section">
            <h2 style={{ fontSize: 17 }}>Permintaan berjalan</h2>
            {d.requests.length === 0 ? (
              <p className="small muted">Belum ada permintaan.</p>
            ) : (
              <div className="card flush">
                <ul className="list">
                  {d.requests.map((r) => (
                    <li key={r.id} className="row between" style={{ padding: "12px 16px" }}>
                      <span>
                        <strong className="strong">{REQ_LABEL[r.kind] ?? r.kind}</strong>
                        <span className="caption" style={{ display: "block" }}>
                          Diajukan {fmtDate(r.created_at)} · batas {fmtDate(r.due_at)}
                        </span>
                      </span>
                      <span className={`chip ${r.overdue ? "chip-bad" : r.status === "selesai" ? "chip-ok" : "chip-info"}`}>
                        {r.overdue ? "Lewat batas · eskalasi DPO" : REQ_STATUS[r.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
      <ConfirmDialog
        open={dialog === "tarik"}
        title="Tarik izin untuk anak?"
        consequence="Pemrosesan data anak berhenti seketika. Guru BK diberi tahu bahwa pendampingan yang terbuka akan ditutup, dan data dijadwalkan dihapus sesuai aturan retensi."
        confirmLabel="Tarik izin"
        danger
        loading={busy === "tarik"}
        onConfirm={withdraw}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "hapus"}
        title="Minta data anak dihapus?"
        consequence="Permintaan dikirim ke petugas pelindungan data. Setelah selesai, penghapusan tidak dapat dibatalkan."
        confirmLabel="Kirim permintaan"
        danger
        loading={busy === "hapus"}
        onConfirm={() => request("hapus")}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
