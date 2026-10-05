import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner, Button, ConfirmDialog, ErrorState, LoadingBlock, PageHead, SimTag, Switch } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import type { Contact } from "../../lib/offline";
import { useToast } from "../../lib/toast";

interface ResData {
  contacts: (Contact & { verified: boolean })[];
  library: { id: number; title: string; category: string; label: string; status: string; source: string; reviewed_by: string | null }[];
  hours: { weekday: number; day: string; open: string | null; close: string | null }[];
  institution: string | null;
}
const KINDS: Record<string, string> = { bk: "Guru BK", krisis: "Layanan krisis", kesehatan: "Kesehatan", keamanan: "Darurat" };
const empty = { name: "", kind: "krisis", phone: "", hours: "", verified: false, note: "" };

/** A4 Kontak dan sumber daya. */
export default function Resources() {
  const { data, error, loading, reload } = useResource<ResData>("/api/admin/resources");
  const toast = useToast();
  const [edit, setEdit] = useState<null | { id?: number; name: string; kind: string; phone: string; hours: string; verified: boolean; note: string }>(null);
  const [hours, setHours] = useState<ResData["hours"]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) setHours(data.hours);
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const missing = data.contacts.filter((c) => c.status === "belum_diisi");

  const saveContact = async () => {
    if (!edit) return;
    setBusy("contact");
    setFormErr(null);
    const body = { ...edit, phone: edit.phone || null, hours: edit.hours || null, note: edit.note || null };
    try {
      await api(edit.id ? `/api/admin/contacts/${edit.id}` : "/api/admin/contacts", { method: edit.id ? "PUT" : "POST", json: body });
      toast("Kontak tersimpan.");
      setEdit(null);
      reload();
    } catch (e) {
      setFormErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const publish = async (id: number, on: boolean) => {
    setBusy(`l${id}`);
    setErr(null);
    try {
      await api(`/api/admin/library/${id}`, { method: "PATCH", json: { status: on ? "terbit" : "draf" } });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const saveHours = async () => {
    setBusy("hours");
    setErr(null);
    try {
      await api("/api/admin/hours", { method: "PUT", json: { days: hours } });
      toast("Jam layanan tersimpan.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title="Kontak dan sumber daya" meta={<SimTag />} sub="Kontak darurat, pustaka dukungan, dan jam layanan BK yang tampil di layar siswa." />
      <div className="stack" style={{ gap: 20 }}>
        {missing.length > 0 && (
          <Banner kind="warn">
            <strong>{missing.length} kontak perlu diisi:</strong> {missing.map((m) => m.name).join(", ")}. Kontak tanpa nomor terverifikasi tidak ditampilkan ke siswa. Jangan isi nomor yang belum
            Anda periksa.
          </Banner>
        )}
        {err && <Banner kind="bad">{err}</Banner>}

        <section className="card flush" aria-labelledby="kontak">
          <div className="row between" style={{ padding: "16px 16px 4px" }}>
            <h2 id="kontak">Kontak darurat</h2>
            <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => setEdit({ ...empty })}>
              Tambah kontak
            </Button>
          </div>
          <div className="table-wrap">
            <table className="table stack-mobile">
              <caption className="sr-only">Kontak darurat</caption>
              <thead>
                <tr>
                  <th scope="col">Nama</th>
                  <th scope="col">Jenis</th>
                  <th scope="col">Nomor</th>
                  <th scope="col">Ketersediaan</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.contacts.map((c) => (
                  <tr key={c.id} className={c.status === "belum_diisi" ? "row-warn" : ""}>
                    <td data-label="Nama" className="cell-main">
                      {c.name}
                      {c.note && <span className="caption" style={{ display: "block", fontWeight: 400 }}>{c.note}</span>}
                    </td>
                    <td data-label="Jenis">{KINDS[c.kind] ?? c.kind}</td>
                    <td data-label="Nomor" className="mono">
                      {c.phone ?? "—"}
                    </td>
                    <td data-label="Ketersediaan">{c.hours ?? "—"}</td>
                    <td data-label="Status">
                      <span className={`chip ${c.status === "aktif" ? "chip-ok" : "chip-warn"}`}>{c.status === "aktif" ? "Tampil ke siswa" : "Perlu diisi"}</span>
                    </td>
                    <td className="actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil aria-hidden />}
                        onClick={() => setEdit({ id: c.id, name: c.name, kind: c.kind, phone: c.phone ?? "", hours: c.hours ?? "", verified: c.verified, note: c.note ?? "" })}
                        aria-label={`Ubah ${c.name}`}
                      >
                        Ubah
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="layout-2col">
          <section className="card flush" aria-labelledby="pustaka">
            <div style={{ padding: "16px 16px 4px" }}>
              <h2 id="pustaka">Pustaka dukungan</h2>
              <p className="small muted">Konten draf tidak terbit. Konten harus ditinjau konselor sebelum terbit; sumber daya Islami selalu bersifat pilihan.</p>
            </div>
            <ul className="list">
              {data.library.map((i) => (
                <li key={i.id} className="row between nowrap-row" style={{ padding: "12px 16px" }}>
                  <span className="grow">
                    <span className="strong" style={{ display: "block" }}>
                      {i.title}
                    </span>
                    <span className="caption">
                      {i.category} · {i.label} · {i.reviewed_by ? `ditinjau ${i.reviewed_by}` : "belum ditinjau"}
                    </span>
                  </span>
                  <span className="row nowrap-row" style={{ gap: 8 }}>
                    <span className={`chip ${i.status === "terbit" ? "chip-ok" : "chip-neutral"}`}>{i.status === "terbit" ? "Terbit" : "Draf"}</span>
                    <Switch checked={i.status === "terbit"} onChange={(v) => publish(i.id, v)} label={`Terbitkan ${i.title}`} disabled={busy === `l${i.id}`} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card stack sticky-col" aria-labelledby="jam">
            <h2 id="jam">Jam layanan BK</h2>
            <p className="small muted">Di luar jam ini, layar bantuan siswa menyatakan BK tutup dan menonjolkan nomor darurat.</p>
            {hours.map((h, idx) => (
              <div key={h.weekday} className="row nowrap-row" style={{ gap: 8 }}>
                <span style={{ width: 64 }} className="strong small">
                  {h.day}
                </span>
                <label className="sr-only" htmlFor={`o-${h.weekday}`}>
                  Buka {h.day}
                </label>
                <input id={`o-${h.weekday}`} type="time" className="input" value={h.open ?? ""} onChange={(e) => setHours((arr) => arr.map((x, j) => (j === idx ? { ...x, open: e.target.value || null } : x)))} />
                <span aria-hidden>–</span>
                <label className="sr-only" htmlFor={`c-${h.weekday}`}>
                  Tutup {h.day}
                </label>
                <input id={`c-${h.weekday}`} type="time" className="input" value={h.close ?? ""} onChange={(e) => setHours((arr) => arr.map((x, j) => (j === idx ? { ...x, close: e.target.value || null } : x)))} />
              </div>
            ))}
            <p className="caption">Kosongkan keduanya untuk hari libur.</p>
            <Button onClick={saveHours} loading={busy === "hours"}>
              Simpan jam
            </Button>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={!!edit}
        title={edit?.id ? "Ubah kontak" : "Tambah kontak"}
        consequence="Kontak yang ditandai terverifikasi langsung tampil di tombol bantuan siswa, termasuk saat offline."
        confirmLabel="Simpan"
        loading={busy === "contact"}
        onConfirm={saveContact}
        onCancel={() => {
          setEdit(null);
          setFormErr(null);
        }}
      >
        {edit && (
          <>
            <div className="field">
              <label className="label" htmlFor="cn">
                Nama layanan
              </label>
              <input id="cn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="ck">
                Jenis
              </label>
              <select id="ck" className="select" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="cp">
                Nomor telepon
              </label>
              <input id="cp" className="input" inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="ch">
                Ketersediaan
              </label>
              <input id="ch" className="input" value={edit.hours} placeholder="Misalnya: 24 jam…" onChange={(e) => setEdit({ ...edit, hours: e.target.value })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={edit.verified} onChange={(e) => setEdit({ ...edit, verified: e.target.checked })} />
              <span>Saya sudah menelepon dan memastikan nomor ini benar.</span>
            </label>
            {formErr && <p className="field-error">{formErr}</p>}
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
