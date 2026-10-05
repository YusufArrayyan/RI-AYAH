import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner, Button, ErrorState, LoadingBlock, SeenPanel, Steps, SwitchRow } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { useToast } from "../../lib/toast";

export interface ConsentItem {
  type: string;
  label: string;
  description: string;
  granted: boolean;
  guardian_granted: boolean | null;
  since: string | null;
  effective: boolean;
}
export interface ConsentView {
  items: ConsentItem[];
  needs_guardian: boolean;
  needs_reconfirm: boolean;
  guardian_pending: boolean;
  any_granted: boolean;
  not_read: string[];
  purpose: string;
  duration: string;
  history: { type: string; label: string; kind: string; granted: boolean; by: string; at: string }[];
}

export default function Consent() {
  const { data, error, loading, reload } = useResource<ConsentView>("/api/me/consent");
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const child = user?.ui_mode === "anak";

  useEffect(() => {
    if (data) setChoices(Object.fromEntries(data.items.map((i) => [i.type, data.needs_reconfirm ? false : i.granted])));
  }, [data]);

  if (loading && !data) return <LoadingBlock label="Memuat persetujuan" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const seen = data.items.filter((i) => i.type !== "bk_baca_checkin").map((i) => i.label);
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const c = { ...choices };
    if (!c.checkin) c.bk_baca_checkin = false;
    try {
      await api("/api/me/consent", { method: "POST", json: { choices: c } });
      await Promise.all([reload(), refresh()]);
      setStep(2);
      toast("Pilihanmu tersimpan.");
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1>{data.needs_reconfirm ? "Sekarang kamu yang memutuskan" : child ? "Boleh kami lihat?" : "Data yang boleh kami baca"}</h1>
      <Steps steps={["Tujuan", "Pilih data", "Selesai"]} current={step} />

      {data.needs_reconfirm && step < 2 && (
        <Banner kind="warn">
          Kamu sudah berusia 18 tahun. Persetujuan sebelumnya diberikan walimu, jadi kami berhenti membaca datamu sampai kamu memilih sendiri.
        </Banner>
      )}

      {step === 0 && (
        <>
          <section className="card stack">
            <h2 style={{ fontSize: 17 }}>Untuk apa?</h2>
            <p>{data.purpose}</p>
            <p className="small muted">{data.duration}</p>
          </section>
          <SeenPanel seen={seen} notSeen={data.not_read} />
          <section className="card stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 17 }}>Bagaimana kami membaca?</h2>
            <p className="small">
              Kami hanya membaca <strong className="strong">tren</strong> mingguan, misalnya kehadiran yang turun beberapa pekan berturut-turut. Bila ada perubahan, wali
              kelasmu mendapat ajakan untuk menyapa. Kamu bisa melihat alasannya, dan menolak sapaan tanpa akibat.
            </p>
            <p className="small">Data ini tidak pernah dipakai untuk nilai, sanksi, seleksi, atau beasiswa.</p>
          </section>
          <div className="choice-row two">
            <Link to="/siswa" className="btn btn-ghost">
              Nanti
            </Link>
            <Button onClick={() => setStep(1)}>Lanjut</Button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          {data.needs_guardian && (
            <Banner kind="info">
              {child ? "Walimu sudah ditanya lebih dulu. Sekarang kamu boleh memilih sendiri." : "Karena kamu belum 18 tahun, data baru dibaca bila walimu setuju dan kamu juga setuju."}
            </Banner>
          )}
          <section className="card" aria-label="Pilihan data">
            {data.items.map((i) => {
              const dependent = i.type === "bk_baca_checkin" && !choices.checkin;
              const g = i.guardian_granted;
              const status = data.needs_guardian
                ? g
                  ? "Wali sudah setuju"
                  : "Menunggu persetujuan wali"
                : i.since && !data.needs_reconfirm
                  ? `Aktif sejak ${fmtDate(i.since)}`
                  : "Tidak aktif";
              return (
                <SwitchRow
                  key={i.type}
                  label={i.label}
                  desc={dependent ? "Aktifkan check-in dulu untuk memilih ini." : i.description}
                  status={status}
                  statusOn={data.needs_guardian ? !!g : !!i.since && !data.needs_reconfirm}
                  checked={!!choices[i.type] && !dependent}
                  disabled={dependent}
                  onChange={(v) => setChoices((c) => ({ ...c, [i.type]: v }))}
                />
              );
            })}
          </section>
          <p className="small muted">Menolak semua juga tidak apa-apa. Kamu tetap bisa memakai pustaka dan tombol bantuan.</p>
          {saveError && <Banner kind="bad">{saveError}</Banner>}
          <div className="choice-row two">
            <Link to="/siswa" className="btn btn-ghost">
              Nanti
            </Link>
            <Button onClick={save} loading={saving}>
              {child ? "Simpan pilihanku" : "Setuju dan lanjut"}
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <section className="card stack" style={{ alignItems: "flex-start" }}>
            <CircleCheck aria-hidden style={{ width: 32, height: 32, color: "var(--ok)" }} />
            <h2>Pilihanmu tersimpan</h2>
            <ul className="list" style={{ width: "100%" }}>
              {data.items.map((i) => (
                <li key={i.type} className="row between">
                  <span>{i.label}</span>
                  <span className={`chip ${i.effective ? "chip-ok" : "chip-neutral"}`}>{i.effective ? "Dibaca" : data.needs_guardian && i.granted ? "Menunggu wali" : "Tidak dibaca"}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">Kamu bisa mengubahnya kapan saja dari halaman Privasi.</p>
          </section>
          <Button onClick={() => nav("/siswa")}>Kembali ke beranda</Button>
        </>
      )}

      {data.history.length > 0 && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--ink)" }}>Riwayat persetujuan</summary>
          <ul className="list" style={{ marginTop: 8 }}>
            {data.history.slice(0, 12).map((h, idx) => (
              <li key={idx} className="small">
                <strong className="strong">{h.label}</strong>: {h.granted ? "diizinkan" : "dicabut"} oleh {h.by}
                {h.kind === "asen" ? " (asen)" : ""} · <span className="muted">{fmtDateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
