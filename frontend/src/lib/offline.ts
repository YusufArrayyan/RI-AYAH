import { useEffect, useState } from "react";
import { api } from "./api";

export interface Contact {
  id: number;
  name: string;
  kind: string;
  phone: string | null;
  hours: string | null;
  note: string | null;
  status: "aktif" | "belum_diisi";
}
export interface Hours {
  days: { weekday: number; day: string; open: string | null; close: string | null }[];
  is_open_now: boolean;
  today: { open: string | null; close: string | null } | null;
}
export interface ContactsPayload {
  contacts: Contact[];
  hours: Hours;
  missing_count: number | null;
  disclaimer: string;
  cached_at?: string;
}

const KEY = "riayah.contacts";

/** Aturan wajib 14.3.5: kontak bantuan tersimpan di perangkat agar tetap tampil saat offline.
 *  Hanya kontak yang sudah diverifikasi (sama dengan yang diterima siswa) yang disimpan. */
export function cachedContacts(): ContactsPayload | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ContactsPayload) : null;
  } catch {
    return null;
  }
}

export async function refreshContacts(): Promise<ContactsPayload | null> {
  try {
    const data = await api<ContactsPayload>("/api/contacts");
    const safe = { ...data, contacts: data.contacts.filter((c) => c.status === "aktif" && c.phone), cached_at: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(safe));
    return data;
  } catch {
    return cachedContacts();
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
