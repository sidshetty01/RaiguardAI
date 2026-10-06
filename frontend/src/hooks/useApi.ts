import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";

/** GET a resource, optionally re-polling every `intervalMs`. */
export function useApi<T>(url: string | null, params?: Record<string, unknown>, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(params ?? {});
  const alive = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (!url) return;
      if (!silent) setLoading(true);
      try {
        const r = await api.get<T>(url, { params: JSON.parse(key) });
        if (alive.current) {
          setData(r.data);
          setError(null);
        }
      } catch (e) {
        if (alive.current) setError(errorMessage(e));
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [url, key],
  );

  useEffect(() => {
    alive.current = true;
    void load();
    let t: number | undefined;
    if (intervalMs) t = window.setInterval(() => void load(true), intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(t);
    };
  }, [load, intervalMs]);

  return { data, error, loading, reload: load, setData };
}
