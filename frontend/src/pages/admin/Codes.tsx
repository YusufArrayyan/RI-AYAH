import { KeyRound, Printer, Users } from "lucide-react";
import { useState } from "react";
import { Banner, Button, ErrorState, LoadingBlock, PageHead, SimTag, Tabs } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useQueryState } from "../../lib/useQueryState";
import { useToast } from "../../lib/toast";

type Kind = "aktivasi" | "undangan_wali";
interface CodeCell {
  code: string | null;
  status: "aktif" | "terpakai" | "dicabut" | "kedaluwarsa" | "belum_ada";
  expires_at: string | null;
  id: number | null;
}
interface Row {
  id: number;
  name: string;
  nis: string;
  class_name: string;
  level: string;
  has_guardian: boolean;
  aktivasi: CodeCell;
  undangan_wali: CodeCell;
}
interface Data {
  classes: string[];
  class_name: string;
  rows: Row[];
  institution: string;
  valid_days: number;
}
const STATUS: Record<CodeCell["status"], [string, string]> = {
  aktif: ["Siap dibagikan", "chip-info"],
  terpakai: ["Sudah dipakai", "chip-ok"],
  dicabut: ["Diganti", "chip-neutral"],
  kedaluwarsa: ["Kedaluwarsa", "chip-warn"],
  belum_ada: ["Belum dibuat", "chip-neutral"],
};

/** Kode akses: kartu aktivasi siswa dan undangan orang tua, per kelas. */
export default function Codes() {
  const [cls, setCls] = useQueryState<string>("kelas", "");
  const [kind, setKind] = useQueryState<Kind>("jenis", "aktivasi");
  const { data, error, loading, reload } = useResource<Data>(`/api/admin/codes?class_name=${encodeURIComponent(cls)}`);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const issue = async (ids: number[]) => {
    if (!ids.length) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ issued: number }>("/api/admin/codes", { method: "POST", json: { kind, student_ids: ids } });
      toast(`${r.issued} kode dibuat. Kode lama yang belum dipakai otomatis diganti.`);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.rows ?? [];
  const needs = rows.filter((r) => ["belum_ada", "kedaluwarsa", "dicabut"].includes(r[kind].status) && !(kind === "aktivasi" && r.aktivasi.status === "terpakai"));
  const printable = rows.filter((r) => r[kind].status === "aktif" && r[kind].code);

  return (
    <>
      <div className="no-print">
        <PageHead
          title="Kode akses"
          meta={<SimTag />}
          sub="Siswa tidak mendaftar sendiri. Sekolah membagikan kartu kode aktivasi kepada siswa dan kode undangan kepada orang tua, sehingga hubungan orang tua dengan anak langsung terverifikasi."
        />
        {loading && !data && <LoadingBlock />}
        {error && !data && <ErrorState error={error} onRetry={reload} />}
        {data && (
          <div className="stack" style={{ gap: 16 }}>
            <Tabs
              label="Jenis kode"
              value={kind}
              onChange={setKind}
              tabs={[
                { id: "aktivasi", label: "Aktivasi siswa" },
                { id: "undangan_wali", label: "Undangan orang tua" },
              ]}
            />
            <Banner kind="info">
              {kind === "aktivasi" ? (
                <>
                  Siswa membuka <strong>{origin}/aktivasi</strong>, memasukkan nomor induk dan kode, lalu membuat kata sandi sendiri. Kode juga dipakai bila siswa lupa kata sandi. Berlaku {data.valid_days} hari, sekali pakai.
                </>
              ) : (
                <>
                  Orang tua membuka <strong>{origin}/undangan</strong> dan memasukkan kode. Akunnya langsung terhubung dengan anak tanpa perlu disetujui lagi, karena kodenya dari sekolah. Berlaku {data.valid_days} hari, sekali pakai.
                </>
              )}
            </Banner>
            <div className="row between">
              <div className="filter-chips" role="group" aria-label="Kelas">
                {data.classes.map((c) => (
                  <button key={c} type="button" className="filter-chip" aria-pressed={data.class_name === c} onClick={() => setCls(c)}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="row">
                <Button variant="ghost" icon={kind === "aktivasi" ? <KeyRound aria-hidden /> : <Users aria-hidden />} onClick={() => issue(needs.map((r) => r.id))} loading={busy} disabled={!needs.length}>
                  Buat kode untuk {needs.length} siswa
                </Button>
                <Button icon={<Printer aria-hidden />} onClick={() => window.print()} disabled={!printable.length}>
                  Cetak {printable.length} kartu
                </Button>
              </div>
            </div>
            {err && <Banner kind="bad">{err}</Banner>}
            <div className="card flush">
              <div className="table-wrap">
                <table className="table stack-mobile">
                  <caption className="sr-only">Kode akses kelas {data.class_name}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Siswa</th>
                      <th scope="col">Nomor induk</th>
                      <th scope="col">{kind === "aktivasi" ? "Kode aktivasi" : "Kode undangan"}</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = r[kind];
                      return (
                        <tr key={r.id}>
                          <td data-label="Siswa" className="cell-main">
                            {r.name}
                            {kind === "undangan_wali" && r.has_guardian && <span className="caption" style={{ display: "block", fontWeight: 400 }}>Sudah ada orang tua terhubung</span>}
                          </td>
                          <td data-label="Nomor induk" className="mono">
                            {r.nis}
                          </td>
                          <td data-label="Kode" className="mono strong" style={{ letterSpacing: "0.06em" }}>
                            {c.code ?? "—"}
                          </td>
                          <td data-label="Status">
                            <span className={`chip ${STATUS[c.status][1]}`}>{STATUS[c.status][0]}</span>
                            {c.status === "aktif" && c.expires_at && <span className="caption" style={{ display: "block" }}>sampai {fmtDate(c.expires_at)}</span>}
                          </td>
                          <td className="actions">
                            <Button size="sm" variant="quiet" onClick={() => issue([r.id])} disabled={busy}>
                              {c.status === "belum_ada" ? "Buat" : "Buat ulang"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kartu cetak: hanya muncul saat dicetak. */}
      <div className="print-only code-cards" aria-hidden>
        {printable.map((r) => (
          <div key={r.id} className="code-card">
            <div className="code-card-head">
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <img src="/brand/logo.png" alt="" width={18} height={20} /> Ri'ayah
              </strong>
              <span lang="ar">رعاية</span>
            </div>
            <p className="code-card-title">{kind === "aktivasi" ? "Kartu aktivasi akun siswa" : "Undangan untuk orang tua"}</p>
            <p>
              <strong>{r.name}</strong> · {r.class_name}
            </p>
            {kind === "aktivasi" && (
              <p>
                Nomor induk: <span className="mono">{r.nis}</span>
              </p>
            )}
            <p className="code-card-code mono">{r[kind].code}</p>
            <p className="code-card-small">
              Buka <strong>{origin}/{kind === "aktivasi" ? "aktivasi" : "undangan"}</strong>, masukkan {kind === "aktivasi" ? "nomor induk dan kode ini, lalu buat kata sandimu sendiri" : "kode ini, lalu buat akun Anda"}. Berlaku sampai {fmtDate(r[kind].expires_at)}, sekali pakai. Jangan berikan kode ini kepada orang lain.
            </p>
            <p className="code-card-small">{data?.institution}</p>
          </div>
        ))}
      </div>
    </>
  );
}
