import { CalendarCheck, CalendarClock, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Button, EmptyState, ErrorState, LoadingBlock, XaiBox } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtRelative } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { CONSENT_STATUS, ChildPicker, useChildren } from "./common";

interface Invitation {
  id: number;
  message: string;
  slots: { id: string; label: string }[];
  chosen: string | null;
  status: "menunggu" | "dikonfirmasi" | "minta_ulang";
  created_at: string;
  counselor: string | null;
  expired: boolean;
}
interface SummaryData {
  child: { id: number; name: string; class_name: string };
  consent: { status: string };
  invitations: Invitation[];
  why_no_zone: string;
  bk_contact: { name: string; hours: string };
}

/** W2 Ringkasan dan kontak BK. */
export default function GuardianSummary() {
  const kids = useChildren();
  const sid = kids.selected?.id;
  const sum = useResource<SummaryData>(sid ? `/api/guardian/children/${sid}/summary` : null);
  const pending = useResource<{ name: string; class_name: string }[]>("/api/guardian/pending");
  if (kids.loading && !kids.data) return <LoadingBlock label="Memuat" />;
  if (kids.error && !kids.data) return <ErrorState error={kids.error} onRetry={kids.reload} />;
  if (!kids.data?.length)
    return (
      <div className="card">
        <EmptyState title={pending.data?.length ? "Menunggu verifikasi sekolah" : "Belum ada anak yang terhubung"}>
          {pending.data?.length
            ? `Hubungan Anda dengan ${pending.data.map((p) => `${p.name} (${p.class_name})`).join(", ")} sedang diverifikasi admin sekolah. Setelah disetujui, persetujuan dan undangan BK muncul di sini.`
            : "Hubungi sekolah untuk memverifikasi hubungan Anda sebagai wali."}
        </EmptyState>
      </div>
    );
  const st = CONSENT_STATUS[kids.selected!.consent_status];
  return (
    <>
      <div className="m-greeting">
        <h1>Ringkasan {kids.selected!.nickname}</h1>
        <p className="muted">{kids.selected!.class_name}</p>
      </div>
      <ChildPicker items={kids.data} selected={kids.selected} onSelect={kids.select} />

      <section className="card row between">
        <span className="stack" style={{ gap: 2 }}>
          <span className="small muted">Status persetujuan</span>
          <span className={`chip ${st.cls}`}>{st.label}</span>
        </span>
        <Link to={`/wali/persetujuan?anak=${sid}`} className="btn btn-ghost btn-sm">
          Lihat
        </Link>
      </section>

      {sum.loading && !sum.data && <LoadingBlock lines={1} />}
      {sum.error && !sum.data && <ErrorState error={sum.error} onRetry={sum.reload} />}
      {sum.data && (
        <>
          {sum.data.invitations.length === 0 ? (
            <div className="card">
              <EmptyState icon={<MessageCircle aria-hidden />} title="Tidak ada undangan dari guru BK">
                Bila guru BK ingin berbincang, undangannya muncul di sini.
              </EmptyState>
            </div>
          ) : (
            sum.data.invitations.map((inv) => <InvitationCard key={inv.id} inv={inv} onChange={sum.reload} />)
          )}
          <XaiBox title="Mengapa Anda tidak melihat zona atau alasan">
            <p>{sum.data.why_no_zone}</p>
          </XaiBox>
          <section className="card row between nowrap-row">
            <span>
              <span className="strong" style={{ display: "block" }}>
                {sum.data.bk_contact.name}
              </span>
              <span className="caption">{sum.data.bk_contact.hours}</span>
            </span>
            <Link to={`/wali/hak-data?anak=${sid}`} className="btn btn-quiet btn-sm">
              Hak data anak
            </Link>
          </section>
        </>
      )}
    </>
  );
}

function InvitationCard({ inv, onChange }: { inv: Invitation; onChange: () => void }) {
  const [slot, setSlot] = useState<string | null>(inv.chosen);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const confirm = async () => {
    if (!slot) return;
    setBusy("ok");
    setErr(null);
    try {
      await api(`/api/guardian/invitations/${inv.id}/confirm`, { method: "POST", json: { slot } });
      toast("Waktu pertemuan dikonfirmasi.");
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const reschedule = async () => {
    setBusy("re");
    try {
      await api(`/api/guardian/invitations/${inv.id}/reschedule`, { method: "POST" });
      toast("Permintaan jadwal baru dikirim ke guru BK.");
      onChange();
    } finally {
      setBusy(null);
    }
  };
  const chosen = inv.slots.find((s) => s.id === inv.chosen);
  return (
    <section className="card stack" aria-labelledby={`inv-${inv.id}`}>
      <div className="row nowrap-row" style={{ alignItems: "flex-start", gap: 12 }}>
        <span className="avatar" aria-hidden>
          BK
        </span>
        <div className="grow stack" style={{ gap: 4 }}>
          <h2 id={`inv-${inv.id}`} style={{ fontSize: 17 }}>
            Undangan dari {inv.counselor}
          </h2>
          <p className="small">{inv.message}</p>
          <span className="caption">{fmtRelative(inv.created_at)}</span>
        </div>
      </div>
      {inv.status === "dikonfirmasi" ? (
        <Banner kind="info">
          <span className="row nowrap-row" style={{ gap: 8 }}>
            <CalendarCheck aria-hidden style={{ width: 18, height: 18 }} /> Dikonfirmasi: <strong>{chosen?.label}</strong>
          </span>
        </Banner>
      ) : inv.status === "minta_ulang" ? (
        <Banner kind="info">Anda meminta jadwal baru. Guru BK akan mengirim pilihan waktu lain.</Banner>
      ) : (
        <>
          <fieldset className="option-list">
            <legend className="label" style={{ marginBottom: 8 }}>
              Pilih waktu yang cocok
            </legend>
            {inv.slots.map((s) => (
              <label key={s.id} className="option">
                <input type="radio" name={`slot-${inv.id}`} checked={slot === s.id} onChange={() => setSlot(s.id)} />
                <CalendarClock aria-hidden style={{ width: 18, height: 18, color: "var(--mute)" }} />
                {s.label}
              </label>
            ))}
          </fieldset>
          {err && <Banner kind="bad">{err}</Banner>}
          <div className="choice-row two">
            <Button variant="ghost" icon={<Phone aria-hidden />} onClick={reschedule} loading={busy === "re"} disabled={!!busy}>
              Minta waktu lain
            </Button>
            <Button onClick={confirm} loading={busy === "ok"} disabled={!slot || !!busy}>
              Konfirmasi
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
