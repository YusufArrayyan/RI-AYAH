import { Copy } from "lucide-react";
import { Banner, Button, ErrorState, LoadingBlock, PageHead } from "../../components/ui";
import { useResource } from "../../lib/api";
import type { Contact } from "../../lib/offline";
import { useToast } from "../../lib/toast";

interface ProtocolData {
  draft: boolean;
  steps: { title: string; body: string }[];
  contacts: Contact[];
  missing: number;
}

/** K3 Protokol krisis dan rujukan. */
export default function Protocol() {
  const { data, error, loading, reload } = useResource<ProtocolData>("/api/counselor/protocol");
  const toast = useToast();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Nomor disalin.");
    } catch {
      toast("Tidak dapat menyalin. Salin manual dari tabel.", "error");
    }
  };
  return (
    <>
      <PageHead title="Protokol krisis dan rujukan" sub="Langkah saat kasus merah. Urutan ini membantu, bukan menggantikan penilaian profesional Anda." />
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 20 }}>
          {data.draft && <Banner kind="warn">Protokol ini masih draf perancang. Psikolog sekolah dan komite menetapkan versi final sebelum pilot.</Banner>}
          <ol className="grid-3" style={{ listStyle: "none", padding: 0, margin: 0, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {data.steps.map((s, i) => (
              <li key={s.title} className="card stack" style={{ gap: 6 }}>
                <span className="avatar" aria-hidden style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>
                  {i + 1}
                </span>
                <h2 style={{ fontSize: 17 }}>{s.title}</h2>
                <p className="small">{s.body}</p>
              </li>
            ))}
          </ol>

          <section className="section" aria-labelledby="kontak">
            <h2 id="kontak">Kontak rujukan</h2>
            {data.missing > 0 && <Banner kind="warn">{data.missing} kontak belum diisi admin. Kontak itu tidak ditampilkan ke siswa sampai diverifikasi.</Banner>}
            <div className="card flush">
              <div className="table-wrap">
                <table className="table stack-mobile">
                  <caption className="sr-only">Kontak rujukan</caption>
                  <thead>
                    <tr>
                      <th scope="col">Layanan</th>
                      <th scope="col">Nomor</th>
                      <th scope="col">Jam</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.contacts.map((c) => (
                      <tr key={c.id} className={c.status === "belum_diisi" ? "row-warn" : ""}>
                        <td data-label="Layanan" className="cell-main">
                          {c.name}
                          {c.note && <span className="caption" style={{ display: "block", fontWeight: 400 }}>{c.note}</span>}
                        </td>
                        <td data-label="Nomor" className="mono">
                          {c.phone ?? "—"}
                        </td>
                        <td data-label="Jam">{c.hours ?? "—"}</td>
                        <td data-label="Status">
                          <span className={`chip ${c.status === "aktif" ? "chip-ok" : "chip-warn"}`}>{c.status === "aktif" ? "Terverifikasi" : "Belum diisi"}</span>
                        </td>
                        <td className="actions">
                          {c.phone && c.status === "aktif" && (
                            <Button size="sm" variant="ghost" icon={<Copy aria-hidden />} onClick={() => copy(c.phone!)} aria-label={`Salin nomor ${c.name}`}>
                              Salin
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="caption">Untuk mencatat rujukan, buka kasus di antrean lalu pilih “Rujuk”.</p>
          </section>
        </div>
      )}
    </>
  );
}
