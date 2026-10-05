/** Lima wajah perasaan mode anak (PRD 7.9). Digambar sederhana dan netral; perlu diuji
 *  psikolog anak dan anak sasaran sebelum dipakai. */
const FACE_COLORS: Record<string, string> = {
  senang: "#F5C242",
  biasa: "#9CC9D6",
  capek: "#C9B8E8",
  sedih: "#8FB3E0",
  kesal: "#F2A48A",
};

export function Face({ kind }: { kind: string }) {
  const fill = FACE_COLORS[kind] ?? "#ddd";
  const mouth: Record<string, string> = {
    senang: "M20 37 Q32 48 44 37",
    biasa: "M21 40 L43 40",
    capek: "M22 41 Q32 37 42 41",
    sedih: "M21 44 Q32 34 43 44",
    kesal: "M21 43 Q32 37 43 43",
  };
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="28" fill={fill} stroke="#0F2A33" strokeWidth="2.5" />
      {kind === "capek" ? (
        <>
          <path d="M18 26 Q23 29 28 26" stroke="#0F2A33" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M36 26 Q41 29 46 26" stroke="#0F2A33" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </>
      ) : kind === "kesal" ? (
        <>
          <path d="M18 22 L28 26" stroke="#0F2A33" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M46 22 L36 26" stroke="#0F2A33" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="23" cy="30" r="3" fill="#0F2A33" />
          <circle cx="41" cy="30" r="3" fill="#0F2A33" />
        </>
      ) : (
        <>
          <circle cx="23" cy="27" r="3.4" fill="#0F2A33" />
          <circle cx="41" cy="27" r="3.4" fill="#0F2A33" />
        </>
      )}
      <path d={mouth[kind]} stroke="#0F2A33" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export const FACE_OPTIONS = [
  { id: "senang", label: "Senang" },
  { id: "biasa", label: "Biasa" },
  { id: "capek", label: "Capek" },
  { id: "sedih", label: "Sedih" },
  { id: "kesal", label: "Kesal" },
];
