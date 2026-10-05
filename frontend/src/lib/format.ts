const LOCALE = "id-ID";
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Server menyimpan UTC naif; tambahkan Z agar dibaca sebagai UTC. */
export function parseUtc(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return dateFmt.format(parseUtc(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return dateTimeFmt.format(parseUtc(iso));
}

export function fmtRelative(iso: string): string {
  const diff = (Date.now() - parseUtc(iso).getTime()) / 1000;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days} hari lalu`;
  return fmtDate(iso);
}

/** Sisa waktu SLA dalam bahasa biasa. */
export function fmtRemaining(hours: number): string {
  if (hours < 0) {
    const h = Math.abs(hours);
    return h >= 24 ? `Lewat ${Math.floor(h / 24)} hari` : `Lewat ${Math.max(1, Math.round(h))} jam`;
  }
  if (hours >= 24) {
    const d = Math.floor(hours / 24);
    return `${d} hari lagi`;
  }
  return `${Math.max(1, Math.round(hours))} jam lagi`;
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "-";
  return new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Angka dengan pemisah desimal Indonesia (koma). */
export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "-";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(v);
}

export function initials(name: string): string {
  const clean = name.replace(/^(Bu|Pak|Ibu|Mas|Dr\.|Dra\.)\s+/i, "");
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export const STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  disapa: "Sudah diajak ngobrol",
  ditindaklanjuti: "Ditindaklanjuti",
  ditutup: "Ditutup",
  terlambat: "Terlambat",
  ditinjau: "Sedang ditinjau",
};

export const INDICATOR_LABEL: Record<string, string> = {
  kehadiran: "Kehadiran",
  lms: "Belajar online",
  tugas: "Tugas telat",
  kuis: "Nilai kuis",
  checkin: "Check-in",
};
