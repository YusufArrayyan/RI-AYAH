import { useSearchParams } from "react-router-dom";
import { useResource } from "../../lib/api";

export interface Child {
  id: number;
  name: string;
  nickname: string;
  class_name: string;
  level: string;
  consent_status: "belum" | "menunggu_asen" | "aktif";
  pending_invitations: number;
}

export const CONSENT_STATUS: Record<string, { label: string; cls: string }> = {
  belum: { label: "Belum ada persetujuan", cls: "chip-neutral" },
  menunggu_asen: { label: "Menunggu persetujuan anak", cls: "chip-warn" },
  aktif: { label: "Persetujuan aktif", cls: "chip-ok" },
};

export function useChildren() {
  const res = useResource<Child[]>("/api/guardian/children");
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("anak"));
  const selected = res.data?.find((c) => c.id === requested) ?? res.data?.[0] ?? null;
  const select = (id: number) => setParams({ anak: String(id) }, { replace: true });
  return { ...res, selected, select };
}

export function ChildPicker({ items, selected, onSelect }: { items: Child[]; selected: Child | null; onSelect: (id: number) => void }) {
  if (items.length < 2) return null;
  return (
    <div className="filter-chips" role="group" aria-label="Pilih anak">
      {items.map((c) => (
        <button key={c.id} type="button" className="filter-chip" aria-pressed={selected?.id === c.id} onClick={() => onSelect(c.id)}>
          {c.nickname} · {c.class_name}
        </button>
      ))}
    </div>
  );
}
