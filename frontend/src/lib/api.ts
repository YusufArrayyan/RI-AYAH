import { useCallback, useEffect, useRef, useState } from "react";

const TOKEN_KEY = "riayah.token";

export class ApiError extends Error {
  status: number;
  offline: boolean;
  constructor(message: string, status = 0, offline = false) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

export const tokenStore = {
  // sessionStorage: sesi berakhir saat tab ditutup (perangkat bersama di sekolah).
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function detailMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return "Isian belum lengkap atau tidak valid.";
  }
  if (status >= 500) return "Server sedang bermasalah. Data Anda tidak hilang; coba lagi sebentar lagi.";
  return "Permintaan tidak berhasil.";
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, body });
  } catch {
    throw new ApiError("Tidak ada koneksi. Periksa internet lalu coba lagi.", 0, true);
  }
  if (res.status === 401 && token) {
    tokenStore.clear();
    onUnauthorized?.();
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) throw new ApiError(detailMessage(data, res.status), res.status);
  return data as T;
}

export async function download(path: string, filename: string) {
  const token = tokenStore.get();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => {
    throw new ApiError("Tidak ada koneksi. Unduhan belum bisa dilakukan.", 0, true);
  });
  if (!res.ok) throw new ApiError("Unduhan gagal.", res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (d: T) => void;
}

/** Ambil data dari API. Data lama tetap tampil saat memuat ulang. */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path);
      if (id === seq.current) setData(d);
    } catch (e) {
      if (id === seq.current) setError(e as ApiError);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
