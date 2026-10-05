import { Download, Eye, FilePen, Trash2, UserX } from "lucide-react";
import { useState } from "react";
import { Banner, Button, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Switch, SwitchRow } from "../../components/ui";
import { api, download, useResource } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { useToast } from "../../lib/toast";
import type { ConsentView } from "./Consent";

interface PrivacyData {
  consent: ConsentView;
  high_contrast: boolean;
  access_log: { who: string; role: string; what: string; at: string }[];
  requests: { id: number; kind: string; status: string; created_at: string; due_at: string }[];
}

const REQ_LABEL: Record<string, string> = { hapus: "Hapus data", perbaiki: "Perbaiki data", lihat: "Lihat data", unduh: "Unduh data" };
const REQ_STATUS: Record<string, string> = { diajukan: "Diajukan", diproses: "Diproses DPO", selesai: "Selesai", ditolak: "Ditolak" };

export default function Privacy() {
  const { user, patch, refresh } = useAuth();
  const child = user?.ui_mode === "anak";
  const { data, error, loading, reload, setData } = useResource<PrivacyData>("/api/me/privacy");
  const toast = useToast();
  const [dialog, setDialog] = useState<null | "withdraw" | "delete">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <LoadingBlock label="Memuat privasi" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const c = data.consent;

  const toggle = async (type: string, v: boolean) => {
    setBusy(type);
    setErr(null);
    const choices: Record<string, boolean> = { [type]: v };
    if (type === "checkin" && !v) choices.bk_baca_checkin = false;
    try {
      const r = await api<{ consent: ConsentView; closed_cases: number }>("/api/me/consent", { method: "POST", json: { choices } });
      setData({ ...data, consent: r.consent });
      toast(r.closed_cases ? "Izin diubah. Pendampingan yang terbuka ditutup." : "Izin diubah.");
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const contrast = async (v: boolean) => {
    patch({ high_contrast: v });
    try {
      await api("/api/me/settings", { method: "POST", json: { high_contrast: v } });
    } catch {
      patch({ high_contrast: !v });
    }
  };

  const request = async (kind: string, detail = "") => {
    setBusy(kind);
    setErr(null);
    try {
      await api("/api/me/requests", { method: "POST", json: { kind, detail } });
      await reload();
      toast(kind === "hapus" ? "Permintaan hapus dikirim ke DPO." : "Permintaan terkirim.");
      setDialog(null);
      setFixOpen(false);
      setFixText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    setBusy("withdraw");
    try {
      const r = await api<{ closed_cases: number }>("/api/me/withdraw", { method: "POST" });
      await Promise.all([reload(), refresh()]);
      setDialog(null);
      toast(`Semua persetujuan ditarik${r.closed_cases ? `; ${r.closed_cases} pendampingan ditutup` : ""}.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doDownload = async () => {
    setBusy("unduh");
    try {
      await download("/api/me/export", "data-riayah-saya.json");
      toast("Salinan datamu diunduh.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pendingDelete = data.requests.find((r) => r.kind === "hapus" && r.status === "diproses");

  return (
    <>
      <h1>{child ? "Dataku" : "Privasi dan data saya"}</h1>
      {c.needs_reconfirm && <Banner kind="warn">Kamu sudah 18 tahun. Pilih ulang izinmu di bawah; sampai itu, datamu tidak dibaca.</Banner>}
      {err && <Banner kind="bad">{err}</Banner>}

      <section className="section" aria-labelledby="izin">
        <div className="section-title">
          <h2 id="izin">{child ? "Yang boleh kami lihat" : "Data yang kamu izinkan"}</h2>
        </div>
        <div className="card" style={{ paddingBlock: 4 }}>
          {c.items.map((i) => {
            const dependent = i.type === "bk_baca_checkin" && !c.items.find((x) => x.type === "checkin")?.granted;
            const status = i.effective
              ? `Aktif sejak ${fmtDate(i.since)}`
              : c.needs_guardian && i.granted && !i.guardian_granted
                ? "Kamu setuju; menunggu wali"
                : c.needs_guardian && !i.granted && i.guardian_granted
                  ? "Wali setuju; kamu belum"
                  : "Tidak aktif";
            return (
              <SwitchRow
                key={i.type}
                label={i.label}
                desc={i.description}
                status={status}
                statusOn={i.effective}
                checked={c.needs_reconfirm ? false : i.granted}
                disabled={busy === i.type || dependent}
                onChange={(v) => toggle(i.type, v)}
              />
            );
          })}
        </div>
      </section>

      <section className="section" aria-labelledby="siapa">
        <h2 id="siapa">Siapa yang melihat datamu</h2>
        <div className="card flush">
          {data.access_log.length === 0 ? (
            <EmptyState icon={<Eye aria-hidden />} title="Belum ada yang membuka datamu">
              Setiap kali guru atau guru BK membuka datamu, catatannya muncul di sini.
            </EmptyState>
          ) : (
            <ul className="list">
              {data.access_log.map((l, i) => (
                <li key={i} style={{ padding: "12px 16px" }}>
                  <div className="row between nowrap-row" style={{ alignItems: "flex-start" }}>
                    <span>
                      <strong className="strong">{l.who}</strong> <span className="muted">({l.role})</span> {l.what}
                    </span>
                    <span className="caption nowrap">{fmtDateTime(l.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="hak">
        <h2 id="hak">Hak atas datamu</h2>
        <div className="grid-2">
          <Button variant="ghost" icon={<Download aria-hidden />} onClick={doDownload} loading={busy === "unduh"}>
            Unduh salinan
          </Button>
          <Button variant="ghost" icon={<FilePen aria-hidden />} onClick={() => setFixOpen((o) => !o)} aria-expanded={fixOpen}>
            Minta perbaikan
          </Button>
          <Button variant="danger-ghost" icon={<Trash2 aria-hidden />} onClick={() => setDialog("delete")} disabled={!!pendingDelete}>
            {pendingDelete ? "Hapus: diproses DPO" : "Minta hapus data"}
          </Button>
          <Button variant="danger-ghost" icon={<UserX aria-hidden />} onClick={() => setDialog("withdraw")} disabled={!c.any_granted}>
            Tarik semua persetujuan
          </Button>
        </div>
        {fixOpen && (
          <div className="card stack">
            <label className="label" htmlFor="fix">
              Data apa yang keliru?
            </label>
            <textarea id="fix" className="textarea" value={fixText} onChange={(e) => setFixText(e.target.value)} placeholder="Contoh: Kehadiran minggu ke-6 tercatat 2 hari, seharusnya 4…" />
            <div className="choice-row two">
              <Button variant="ghost" onClick={() => setFixOpen(false)}>
                Batal
              </Button>
              <Button onClick={() => request("perbaiki", fixText)} loading={busy === "perbaiki"} disabled={fixText.trim().length < 5}>
                Kirim permintaan
              </Button>
            </div>
          </div>
        )}
        {data.requests.length > 0 && (
          <div className="card flush">
            <ul className="list">
              {data.requests.map((r) => (
                <li key={r.id} className="row between" style={{ padding: "12px 16px" }}>
                  <span>
                    <strong className="strong">{REQ_LABEL[r.kind] ?? r.kind}</strong>
                    <span className="caption" style={{ display: "block" }}>
                      Diajukan {fmtDate(r.created_at)} · batas {fmtDate(r.due_at)}
                    </span>
                  </span>
                  <span className={`chip ${r.status === "selesai" ? "chip-ok" : "chip-info"}`}>{REQ_STATUS[r.status] ?? r.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="tampilan">
        <h2 id="tampilan">Tampilan</h2>
        <div className="card">
          <div className="switch-row" style={{ padding: 0 }}>
            <div className="switch-text">
              <div className="switch-label">Kontras tinggi</div>
              <div className="switch-desc">Teks dan garis lebih tegas.</div>
            </div>
            <Switch checked={!!user?.high_contrast} onChange={contrast} label="Kontras tinggi" />
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={dialog === "withdraw"}
        title="Tarik semua persetujuan?"
        consequence="Kami langsung berhenti membaca semua datamu, pendampingan yang terbuka ditutup, dan datamu dijadwalkan dihapus sesuai aturan sekolah. Tombol bantuan tetap tersedia."
        confirmLabel="Tarik semua"
        danger
        loading={busy === "withdraw"}
        onConfirm={withdraw}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title="Minta datamu dihapus?"
        consequence="Permintaan dikirim ke petugas pelindungan data (DPO). Selama diproses, statusnya terlihat di halaman ini. Penghapusan tidak dapat dibatalkan setelah selesai."
        confirmLabel="Kirim permintaan"
        danger
        loading={busy === "hapus"}
        onConfirm={() => request("hapus")}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
