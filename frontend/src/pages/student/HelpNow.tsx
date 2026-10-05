import { CircleCheck, Clock, MessageSquareHeart, Phone, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Banner, Button } from "../../components/ui";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { cachedContacts, refreshContacts, useOnline, type ContactsPayload } from "../../lib/offline";

/** S7 Bantuan sekarang. Selalu tersedia, termasuk saat persetujuan ditarik dan saat offline.
 *  Tidak ada penilaian kondisi siswa di layar ini. */
export default function HelpNow() {
  const { user } = useAuth();
  const child = user?.ui_mode === "anak";
  const loc = useLocation();
  const nav = useNavigate();
  const online = useOnline();
  const gentle = (loc.state as { gentle?: boolean } | null)?.gentle;
  const [data, setData] = useState<ContactsPayload | null>(cachedContacts());
  const [queued, setQueued] = useState<boolean>(!!gentle);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    refreshContacts().then((d) => d && setData(d));
  }, []);

  const contacts = (data?.contacts ?? []).filter((c) => c.status === "aktif" && c.phone);
  const bk = contacts.find((c) => c.kind === "bk");
  const crisis = contacts.filter((c) => c.kind === "krisis" || c.kind === "keamanan");
  const others = contacts.filter((c) => c !== bk && !crisis.includes(c));
  const open = data?.hours.is_open_now ?? false;

  const callBk = async () => {
    setSending(true);
    setErr(null);
    try {
      await api("/api/me/help", { method: "POST" });
      setQueued(true);
    } catch (e) {
      setErr(online ? (e as Error).message : "Tidak ada koneksi, jadi permintaan belum terkirim. Telepon salah satu nomor di bawah.");
    } finally {
      setSending(false);
    }
  };

  const smsText = encodeURIComponent("Aku sedang butuh teman bicara. Bisa hubungi aku?");

  return (
    <>
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        <h1 style={{ fontSize: child ? 32 : 28 }}>Kamu tidak sendirian.</h1>
        <p style={{ fontSize: 17 }}>
          {gentle ? "Terima kasih sudah jujur. Guru BK sudah diberi tahu dan akan menghubungimu." : "Pilih cara yang paling nyaman untukmu sekarang."}
        </p>
      </div>

      {!open && (
        <Banner kind="warn">
          <strong>Ruang BK sedang tutup</strong>
          {data?.hours.today?.open ? ` (hari ini ${data.hours.today.open}–${data.hours.today.close})` : ""}. Permintaanmu tetap tercatat dan dibaca saat BK buka. Bila kamu merasa tidak aman sekarang,
          telepon layanan darurat di bawah.
        </Banner>
      )}

      {!open && crisis.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {crisis.map((c) => (
            <a key={c.id} href={`tel:${c.phone!.replace(/\s/g, "")}`} className="help-btn">
              <PhoneCall aria-hidden /> Telepon {c.name} · {c.phone}
            </a>
          ))}
        </div>
      )}

      <section className="card stack" style={{ gap: 12 }}>
        {queued ? (
          <div className="row nowrap-row" style={{ alignItems: "flex-start", gap: 12 }} role="status">
            <CircleCheck aria-hidden style={{ width: 26, height: 26, color: "var(--ok)", flex: "none" }} />
            <div>
              <h2 style={{ fontSize: 18 }}>Guru BK sudah diberi tahu</h2>
              <p className="small">
                {open ? "Guru BK siaga akan menghubungimu secepatnya, paling lambat 24 jam." : "Guru BK akan menghubungimu saat ruang BK buka."} Sambil menunggu, kamu boleh menelepon nomor di bawah.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="row nowrap-row" style={{ alignItems: "flex-start", gap: 12 }}>
              <Clock aria-hidden style={{ width: 24, height: 24, color: "var(--primary-dark)", flex: "none", marginTop: 2 }} />
              <p>{open ? "Guru BK siaga sedang bertugas dan bisa menghubungimu hari ini." : "Kamu tetap bisa mengirim permintaan sekarang."}</p>
            </div>
            <Button variant="danger" block onClick={callBk} loading={sending} style={{ minHeight: 52 }}>
              {child ? "Minta guru BK menghubungiku" : "Hubungi guru BK sekarang"}
            </Button>
          </>
        )}
        {err && <Banner kind="bad">{err}</Banner>}
      </section>

      {(bk || others.length > 0 || (open && crisis.length > 0)) && (
        <section className="section" aria-labelledby="tel-title">
          <h2 id="tel-title" style={{ fontSize: 18 }}>
            Telepon langsung
          </h2>
          <div className="stack" style={{ gap: 8 }}>
            {[bk, ...others, ...(open ? crisis : [])].filter(Boolean).map((c) => (
              <a key={c!.id} href={`tel:${c!.phone!.replace(/\s/g, "")}`} className="btn btn-ghost btn-block" style={{ justifyContent: "space-between", minHeight: 52 }}>
                <span className="row nowrap-row" style={{ gap: 10 }}>
                  <Phone aria-hidden /> {c!.name}
                </span>
                <span className="tnum">{c!.phone}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <a href={`sms:?&body=${smsText}`} className="btn btn-ghost btn-block" style={{ minHeight: 52 }}>
        <MessageSquareHeart aria-hidden /> Kirim pesan ke orang yang kamu percaya
      </a>

      <button type="button" className="btn btn-quiet" onClick={() => nav(-1)}>
        Kembali
      </button>

      <p className="caption">{data?.disclaimer ?? "Ri'ayah bukan layanan darurat. Bila nyawa terancam, hubungi layanan darurat setempat."}</p>
      {!online && data?.cached_at && <p className="caption">Kontak di atas tersimpan di perangkatmu dan tetap bisa dibuka tanpa internet.</p>}
    </>
  );
}
