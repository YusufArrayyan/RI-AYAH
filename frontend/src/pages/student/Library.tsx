import { Phone, SearchX, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui";
import { useResource } from "../../lib/api";
import { useQueryState } from "../../lib/useQueryState";
import { useAuth } from "../../lib/auth";
import { cachedContacts, refreshContacts, type ContactsPayload } from "../../lib/offline";
import { LibraryCard, type HomeData } from "./Home";

interface LibData {
  categories: string[];
  items: (HomeData["library"][number] & { summary: string; source: string })[];
}

export default function Library() {
  const { user } = useAuth();
  const child = user?.ui_mode === "anak";
  const [cat, setCat] = useQueryState<string>("kategori", "");
  const [debounced, setDebounced] = useQueryState<string>("q", "");
  const [q, setQ] = useState(debounced);
  const [contacts, setContacts] = useState<ContactsPayload | null>(cachedContacts());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q, setDebounced]);
  useEffect(() => {
    refreshContacts().then((c) => c && setContacts(c));
  }, []);
  const path = `/api/library?q=${encodeURIComponent(debounced)}&category=${encodeURIComponent(cat)}`;
  const { data, error, loading, reload } = useResource<LibData>(path);

  return (
    <>
      <h1>{child ? "Bacaan" : "Bacaan dan latihan"}</h1>
      <p className="muted">Bacaan dan latihan singkat yang ditinjau guru BK, dilengkapi dalil Al-Qur'an dan hadis beserta sumbernya. Semua bersifat pilihan.</p>

      <div className="search">
        <Search aria-hidden />
        <label htmlFor="q" className="sr-only">
          Cari konten
        </label>
        <input id="q" className="input" type="search" name="q" autoComplete="off" placeholder="Cari, misalnya “tidur”…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {data && (
        <div className="filter-chips" role="group" aria-label="Kategori">
          <button type="button" className="filter-chip" aria-pressed={cat === ""} onClick={() => setCat("")}>
            Semua
          </button>
          {data.categories.map((c) => (
            <button key={c} type="button" className="filter-chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {loading && !data && <LoadingBlock label="Memuat pustaka" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <div className="card">
          <EmptyState icon={<SearchX aria-hidden />} title="Belum ada konten untuk kata itu">
            Coba kata lain, atau pilih kategori di atas.
          </EmptyState>
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="stack" style={{ gap: 8 }} aria-busy={loading}>
          {data.items.map((i) => (
            <LibraryCard key={i.id} item={i} />
          ))}
        </div>
      )}

      {contacts && contacts.contacts.length > 0 && (
        <section className="section" aria-labelledby="ct-title">
          <h2 id="ct-title" style={{ fontSize: 18 }}>
            Bicara dengan manusia
          </h2>
          <div className="card flush">
            <ul className="list">
              {contacts.contacts.map((c) => (
                <li key={c.id} className="row between nowrap-row" style={{ padding: "12px 16px" }}>
                  <span className="grow">
                    <span className="strong" style={{ display: "block" }}>
                      {c.name}
                    </span>
                    <span className="caption">{c.hours}</span>
                  </span>
                  <a className="btn btn-ghost btn-sm" href={`tel:${c.phone?.replace(/\s/g, "")}`} aria-label={`Telepon ${c.name}, ${c.phone}`}>
                    <Phone aria-hidden /> {c.phone}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="caption">{contacts.disclaimer}</p>
        </section>
      )}
    </>
  );
}
