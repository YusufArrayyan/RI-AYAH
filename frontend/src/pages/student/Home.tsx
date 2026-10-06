import { BookOpen, ChevronRight, ClipboardCheck, Clock, Headphones, Info, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Face, FACE_OPTIONS } from "../../components/Faces";
import { Banner, ErrorState, LoadingBlock } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { initials } from "../../lib/format";

export interface HomeData {
  nickname: string;
  mode: string;
  week: number | null;
  consent: { any: boolean; needs_reconfirm: boolean; guardian_pending: boolean };
  checkin: { consented: boolean; done: boolean };
  message: { case_id: number; from: string; text: string } | null;
  has_red: boolean;
  objection_pending: boolean;
  library: { id: number; title: string; kind: string; label: string; minutes: number; category: string; dalil_count?: number }[];
}

const KIND_ICON: Record<string, typeof BookOpen> = { bacaan: BookOpen, latihan: Sparkles, audio: Headphones, info: Info };

export function LibraryCard({ item }: { item: HomeData["library"][number] }) {
  const Icon = KIND_ICON[item.kind] ?? BookOpen;
  return (
    <Link to={`/siswa/pustaka/${item.id}`} className="card tight" style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span className="empty-icon" style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: "var(--primary-dark)", flex: "none" }}>
        <Icon aria-hidden style={{ width: 20, height: 20 }} />
      </span>
      <span className="grow">
        <span className="strong" style={{ display: "block" }}>
          {item.title}
        </span>
        <span className="caption">
          {item.label} · {item.minutes} menit
          {item.dalil_count ? ` · ${item.dalil_count} dalil` : ""}
        </span>
      </span>
      <ChevronRight aria-hidden style={{ width: 20, height: 20, color: "var(--mute)" }} />
    </Link>
  );
}

export default function StudentHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<HomeData>("/api/me/home");
  if (loading && !data) return <LoadingBlock label="Memuat beranda" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  if (user?.ui_mode === "anak") return <ChildHome data={data} />;

  const primaryTaken = !!data.message;
  return (
    <>
      <div className="m-greeting">
        <h1>Halo, {data.nickname}</h1>
        <p className="muted">
          {data.week ? `Data terakhir dari sekolah: minggu ke-${data.week} semester ini.` : "Belum ada data mingguan dari sekolah. Kamu tetap bisa mengatur izin dan melihat bacaan."}
        </p>
      </div>

      {data.consent.needs_reconfirm && (
        <Banner kind="warn" action={<Link to="/siswa/persetujuan" className="btn btn-sm btn-ghost">Tinjau</Link>}>
          <strong>Kamu sudah 18 tahun.</strong> Persetujuan sebelumnya diberikan walimu. Sekarang kamu yang memutuskan; sampai itu, datamu tidak dibaca.
        </Banner>
      )}
      {!data.consent.needs_reconfirm && !data.consent.any && (
        <Banner kind="info" action={<Link to="/siswa/persetujuan" className="btn btn-sm btn-ghost">Lihat pilihan</Link>}>
          Kamu belum memilih data apa yang boleh kami baca. Tidak memilih juga tidak apa-apa.
        </Banner>
      )}

      {data.has_red && (
        <Link to="/siswa/bantuan" className="card" style={{ borderColor: "var(--bad)" }}>
          <div className="row nowrap-row" style={{ alignItems: "flex-start" }}>
            <Clock aria-hidden style={{ color: "var(--bad)", width: 22, height: 22, flex: "none", marginTop: 2 }} />
            <div className="grow">
              <h2 style={{ fontSize: 17 }}>Guru BK sedang dihubungi</h2>
              <p className="small">Kamu tidak sendirian. Buka halaman bantuan untuk melihat kontak yang bisa kamu hubungi sekarang.</p>
            </div>
          </div>
        </Link>
      )}

      {data.message && (
        <section className="card" aria-labelledby="msg-title">
          <div className="row nowrap-row" style={{ alignItems: "flex-start", gap: 14 }}>
            <span className="avatar lg" aria-hidden>
              {initials(data.message.from)}
            </span>
            <div className="stack grow" style={{ gap: 6 }}>
              <h2 id="msg-title" style={{ fontSize: 17 }}>
                Pesan dari {data.message.from}
              </h2>
              <p>{data.message.text}</p>
            </div>
          </div>
          <div className="stack" style={{ marginTop: 14, gap: 8 }}>
            <Link to="/siswa/alasan" className="btn btn-primary btn-block">
              Lihat alasannya
            </Link>
            <p className="caption" style={{ textAlign: "center" }}>
              Kamu boleh menolak. Tidak ada akibat apa pun pada nilaimu.
            </p>
          </div>
        </section>
      )}

      {data.objection_pending && (
        <Banner kind="xai" action={<Link to="/siswa/alasan" className="btn btn-sm btn-xai">Lihat</Link>}>
          Keberatanmu sedang ditinjau manusia. Hasilnya akan dijelaskan dengan bahasa sederhana.
        </Banner>
      )}

      <section className="card" aria-labelledby="ci-title">
        <div className="row nowrap-row" style={{ alignItems: "flex-start", gap: 14 }}>
          <span className="empty-icon" style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", background: data.checkin.done ? "var(--ok-soft)" : "var(--primary-soft)", color: data.checkin.done ? "var(--ok)" : "var(--primary-dark)", flex: "none" }}>
            <ClipboardCheck aria-hidden style={{ width: 22, height: 22 }} />
          </span>
          <div className="stack grow" style={{ gap: 4 }}>
            <h2 id="ci-title" style={{ fontSize: 17 }}>
              Check-in minggu ini
            </h2>
            {!data.checkin.consented ? (
              <p className="small">Check-in belum aktif. Kamu bisa mengaktifkannya kapan saja, atau membiarkannya mati.</p>
            ) : data.checkin.done ? (
              <p className="small">Sudah terisi. Terima kasih sudah meluangkan waktu.</p>
            ) : (
              <p className="small">Empat pertanyaan singkat tentang perasaanmu, sekitar satu menit. Semua boleh dilewati.</p>
            )}
          </div>
        </div>
        {data.checkin.consented && !data.checkin.done && (
          <Link to="/siswa/checkin" className={`btn ${primaryTaken ? "btn-ghost" : "btn-primary"} btn-block`} style={{ marginTop: 14 }}>
            Mulai check-in
          </Link>
        )}
        {!data.checkin.consented && (
          <Link to="/siswa/persetujuan" className="btn btn-ghost btn-block" style={{ marginTop: 14 }}>
            Buka pengaturan persetujuan
          </Link>
        )}
      </section>

      <Link to="/siswa/cerita" className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span className="grow">
          <span className="strong" style={{ display: "block" }}>
            Sulit cerita langsung?
          </span>
          <span className="small">Tulis saja ke guru BK. Hanya guru BK yang membaca, dan ia akan membalas.</span>
        </span>
        <ChevronRight aria-hidden style={{ width: 20, height: 20, color: "var(--mute)", flex: "none" }} />
      </Link>

      {data.library.length > 0 && (
        <section className="section" aria-labelledby="lib-title">
          <div className="section-title">
            <h2 id="lib-title">Untuk dibaca santai</h2>
            <Link to="/siswa/pustaka" className="small strong" style={{ color: "var(--primary)" }}>
              Semua
            </Link>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {data.library.map((i) => (
              <LibraryCard key={i.id} item={i} />
            ))}
          </div>
        </section>
      )}

      <p className="row nowrap-row caption" style={{ gap: 8, alignItems: "flex-start" }}>
        <ShieldCheck aria-hidden style={{ width: 16, height: 16, color: "var(--xai)", flex: "none", marginTop: 1 }} />
        Beranda tidak menampilkan nilai atau skor. Kami tidak membaca pesan, media sosial, lokasi, atau ibadahmu.
      </p>
    </>
  );
}

/* ── S1-A Mode anak: beranda ───────────────────────────────────────────── */
function ChildHome({ data }: { data: HomeData }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pick = async (f: string) => {
    setPicked(f);
    setSaved(false);
    try {
      await api("/api/me/feeling", { method: "POST", json: { feeling: f } });
      setSaved(true);
    } catch {
      /* pilihan tetap terlihat; tidak ada akibat bila gagal tersimpan */
    }
  };
  return (
    <>
      <div className="m-greeting">
        <h1>Halo, {data.nickname}!</h1>
      </div>
      <section className="card" aria-labelledby="feel-title">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend id="feel-title" className="child-title" style={{ fontSize: 22, color: "var(--ink)", marginBottom: 14 }}>
            Bagaimana perasaanmu hari ini?
          </legend>
          <div className="faces" role="radiogroup" aria-labelledby="feel-title">
            {FACE_OPTIONS.map((f) => (
              <label key={f.id} className="face">
                <input type="radio" name="feeling" value={f.id} checked={picked === f.id} onChange={() => pick(f.id)} />
                <Face kind={f.id} />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <p aria-live="polite" style={{ marginTop: 12, fontSize: 17, minHeight: 26 }}>
          {saved ? "Terima kasih sudah memberi tahu." : "Boleh pilih, boleh juga tidak."}
        </p>
      </section>

      {data.message && (
        <Link to="/siswa/alasan" className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span className="avatar lg" aria-hidden style={{ background: "#fde3c8", color: "#7a3a06" }}>
            {initials(data.message.from)}
          </span>
          <span className="grow">
            <span className="child-title" style={{ display: "block", fontSize: 21, color: "var(--ink)" }}>
              Mau cerita ke {data.message.from}?
            </span>
            <span style={{ fontSize: 17 }}>{data.message.text}</span>
          </span>
          <ChevronRight aria-hidden style={{ width: 24, height: 24, color: "var(--mute)", flex: "none" }} />
        </Link>
      )}

      <div className="reassure">
        <ShieldCheck aria-hidden />
        <span>Tidak memilih juga tidak apa-apa. Nilaimu tidak berubah.</span>
      </div>
    </>
  );
}
