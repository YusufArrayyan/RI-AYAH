import { CircleCheck, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { Banner, Button, ErrorState, LoadingBlock, PageHead, SeenPanel, SimTag, Steps, XaiBox } from "../../components/ui";
import { api, download, useResource } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useToast } from "../../lib/toast";

interface Preview {
  filename: string;
  headers: string[];
  mapping: Record<string, string>;
  dropped: string[];
  missing: string[];
  rows_total: number;
  rows_ok: number;
  rows_bad: number;
  errors: { line: number; error: string }[];
  preview: { kode: string; pekan: number; kehadiran: number; lms: number; tugas: number; kuis: number }[];
}
interface Field {
  key: string;
  label: string;
  hint: string;
}
interface Job {
  id: number;
  filename: string;
  at: string;
  rows_ok: number;
  rows_bad: number;
  dropped: string[];
}

/** A1 Impor data. */
export default function Import() {
  const fields = useResource<{ fields: Field[] }>("/api/admin/import/fields");
  const jobs = useResource<Job[]>("/api/admin/imports");
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ rows_ok: number; rows_bad: number; dropped: string[]; new_cases: number } | null>(null);

  const analyze = async (f: File, m?: Record<string, string>) => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", f);
    if (m) fd.append("mapping", JSON.stringify(m));
    try {
      const p = await api<Preview>("/api/admin/import/preview", { method: "POST", body: fd });
      setPrev(p);
      setMapping(p.mapping);
      return p;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    if (await analyze(f)) setStep(1);
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    try {
      const r = await api<{ rows_ok: number; rows_bad: number; dropped: string[]; new_cases: number }>("/api/admin/import/commit", { method: "POST", body: fd });
      setResult(r);
      setStep(3);
      jobs.reload();
      toast(`${r.rows_ok} baris masuk.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep(0);
    setFile(null);
    setPrev(null);
    setResult(null);
  };

  return (
    <>
      <PageHead title="Impor data" meta={<SimTag />} sub="Masukkan data mingguan dengan kolom minimal. Identitas dipseudonimkan saat masuk; kolom lain dibuang." />
      <div className="stack" style={{ gap: 20 }}>
        <div className="card">
          <Steps steps={["Unggah", "Petakan kolom", "Validasi", "Impor"]} current={step} />
        </div>
        {err && <Banner kind="bad">{err}</Banner>}

        {step === 0 && (
          <div className="layout-2col">
            <section className="card stack">
              <label
                htmlFor="csv"
                className="stack"
                style={{ alignItems: "center", textAlign: "center", gap: 10, padding: "36px 16px", border: "2px dashed var(--line-strong)", borderRadius: 12, cursor: "pointer", background: "var(--panel)" }}
              >
                <Upload aria-hidden style={{ width: 32, height: 32, color: "var(--primary-dark)" }} />
                <span className="strong">Pilih berkas CSV</span>
                <span className="small muted">UTF-8, baris pertama berisi judul kolom, maksimal 20.000 baris</span>
                <span className="btn btn-primary" aria-hidden>
                  {busy ? "Membaca…" : "Pilih berkas"}
                </span>
              </label>
              <input id="csv" type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" />
              <div className="row">
                <Button variant="ghost" icon={<Download aria-hidden />} onClick={() => download("/api/admin/import/sample", "contoh-impor-SIMULASI.csv")}>
                  Contoh CSV (dengan kolom terlarang)
                </Button>
              </div>
              <div className="stack" style={{ gap: 8, paddingTop: 8, borderTop: "1px solid var(--hairline)" }}>
                <h3 style={{ fontSize: 15.5 }}>Templat untuk siswa baru</h3>
                <p className="small muted">Berisi 8 pekan data SIMULASI untuk semua siswa yang belum punya data mingguan, misalnya akun yang baru mendaftar.</p>
                <div className="row">
                  <Button
                    variant="ghost"
                    icon={<Download aria-hidden />}
                    onClick={() => download("/api/admin/import/template?pattern=memburuk", "templat-memburuk-SIMULASI.csv").catch((e) => setErr(e.status === 404 ? "Semua siswa sudah punya data mingguan. Daftarkan siswa baru dulu." : e.message))}
                  >
                    Pola memburuk (memicu K1)
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<Download aria-hidden />}
                    onClick={() => download("/api/admin/import/template?pattern=stabil", "templat-stabil-SIMULASI.csv").catch((e) => setErr(e.status === 404 ? "Semua siswa sudah punya data mingguan. Daftarkan siswa baru dulu." : e.message))}
                  >
                    Pola stabil
                  </Button>
                </div>
              </div>
            </section>
            <aside className="stack">
              <SeenPanel
                seenTitle="Yang diambil"
                notSeenTitle="Selalu dibuang"
                seen={(fields.data?.fields ?? []).map((f) => f.label)}
                notSeen={["Nama dan alamat", "Agama dan suku", "Nilai rapor dan peringkat", "Kolom lain apa pun"]}
              />
              <XaiBox title="Data apa yang masuk ke aturan">
                <p>Hanya empat indikator ini yang dibaca aturan M1, K1, K2. Nomor induk diganti kode acak; kunci pemetaannya disimpan terpisah.</p>
              </XaiBox>
            </aside>
          </div>
        )}

        {step === 1 && prev && (
          <section className="card stack" aria-labelledby="map">
            <div className="row between">
              <h2 id="map">Petakan kolom</h2>
              <span className="row nowrap-row small muted" style={{ gap: 6 }}>
                <FileSpreadsheet aria-hidden style={{ width: 16, height: 16 }} /> {prev.filename} · {prev.rows_total} baris
              </span>
            </div>
            <div className="table-wrap">
              <table className="table stack-mobile">
                <caption className="sr-only">Pemetaan kolom</caption>
                <thead>
                  <tr>
                    <th scope="col">Kolom Ri'ayah</th>
                    <th scope="col">Kolom di berkas</th>
                    <th scope="col">Ketentuan</th>
                  </tr>
                </thead>
                <tbody>
                  {(fields.data?.fields ?? []).map((f) => (
                    <tr key={f.key}>
                      <td data-label="Kolom Ri'ayah" className="cell-main">
                        {f.label}
                      </td>
                      <td data-label="Kolom di berkas">
                        <label className="sr-only" htmlFor={`m-${f.key}`}>
                          Kolom untuk {f.label}
                        </label>
                        <select id={`m-${f.key}`} className="select" value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                          <option value="">Pilih kolom</option>
                          {prev.headers.map((h) => (
                            <option key={h}>{h}</option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Ketentuan" className="small muted">
                        {f.hint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const kept = new Set(Object.values(mapping));
              const dropped = prev.headers.filter((h) => !kept.has(h));
              return dropped.length ? (
                <Banner kind="info">
                  <strong>Tidak dipakai dan dibuang:</strong> {dropped.join(", ")}
                </Banner>
              ) : null;
            })()}
            <div className="row">
              <Button variant="ghost" onClick={reset}>
                Ganti berkas
              </Button>
              <Button
                onClick={async () => {
                  if (file && (await analyze(file, mapping))) setStep(2);
                }}
                loading={busy}
                disabled={(fields.data?.fields ?? []).some((f) => !mapping[f.key])}
              >
                Validasi
              </Button>
            </div>
          </section>
        )}

        {step === 2 && prev && (
          <section className="card stack" aria-labelledby="val">
            <h2 id="val">Hasil validasi</h2>
            <Banner kind={prev.rows_bad ? "warn" : "info"}>
              <strong>{prev.rows_ok}</strong> baris siap masuk. {prev.rows_bad ? `${prev.rows_bad} baris tidak valid dilaporkan dan tidak disimpan.` : "Tidak ada baris yang ditolak."}{" "}
              {prev.dropped.length > 0 && `${prev.dropped.length} kolom dibuang: ${prev.dropped.join(", ")}.`}
            </Banner>
            {prev.errors.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Baris tidak valid</caption>
                  <thead>
                    <tr>
                      <th scope="col">Baris</th>
                      <th scope="col">Masalah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prev.errors.map((e) => (
                      <tr key={e.line} className="row-warn">
                        <td className="tnum">{e.line}</td>
                        <td>{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {prev.preview.length > 0 && (
              <>
                <h3>Pratinjau setelah pseudonim</h3>
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">Pratinjau</caption>
                    <thead>
                      <tr>
                        <th scope="col">Kode</th>
                        <th scope="col">Pekan</th>
                        <th scope="col">Hadir</th>
                        <th scope="col">Buka materi</th>
                        <th scope="col">Tugas terlambat</th>
                        <th scope="col">Kuis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prev.preview.map((r, i) => (
                        <tr key={i}>
                          <td className="mono cell-main">{r.kode}</td>
                          <td className="tnum">{r.pekan}</td>
                          <td className="tnum">{r.kehadiran}</td>
                          <td className="tnum">{r.lms}</td>
                          <td className="tnum">{r.tugas}</td>
                          <td className="tnum">{r.kuis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="row">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Kembali
              </Button>
              <Button onClick={commit} loading={busy} disabled={!prev.rows_ok}>
                Impor {prev.rows_ok} baris
              </Button>
            </div>
          </section>
        )}

        {step === 3 && result && (
          <section className="card stack" style={{ alignItems: "flex-start" }}>
            <CircleCheck aria-hidden style={{ width: 32, height: 32, color: "var(--ok)" }} />
            <h2>Impor selesai</h2>
            <p>
              {result.rows_ok} baris masuk, {result.rows_bad} ditolak, {result.dropped.length} kolom dibuang. Aturan dijalankan ulang:{" "}
              {result.new_cases ? `${result.new_cases} penandaan baru masuk ke antrean guru atau BK.` : "tidak ada penandaan baru."}
            </p>
            <Button variant="ghost" onClick={reset}>
              Impor berkas lain
            </Button>
          </section>
        )}

        <section className="section" aria-labelledby="riwayat">
          <h2 id="riwayat">Riwayat impor</h2>
          {jobs.loading && !jobs.data && <LoadingBlock lines={1} />}
          {jobs.error && <ErrorState error={jobs.error} onRetry={jobs.reload} />}
          {jobs.data && (
            <div className="card flush">
              <ul className="list">
                {jobs.data.map((j) => (
                  <li key={j.id} className="row between" style={{ padding: "12px 16px" }}>
                    <span>
                      <span className="strong">{j.filename}</span>
                      <span className="caption" style={{ display: "block" }}>
                        {fmtDateTime(j.at)} · kolom dibuang: {j.dropped.join(", ") || "tidak ada"}
                      </span>
                    </span>
                    <span className="small tnum">
                      {j.rows_ok} masuk · {j.rows_bad} ditolak
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
