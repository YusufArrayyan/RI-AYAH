import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** State yang tersimpan di URL (filter, tab, periode) agar bisa dibagikan dan di-deep-link. */
export function useQueryState<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const value = (params.get(key) as T | null) ?? fallback;
  const set = useCallback(
    (v: T) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === fallback || v === "") next.delete(key);
          else next.set(key, v);
          return next;
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  );
  return [value, set];
}
