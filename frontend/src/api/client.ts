import axios from "axios";

const TOKEN_KEY = "railguard.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) - session stays in memory only */
  }
}

export const api = axios.create({ baseURL: "/api", timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && !String(err.config?.url).includes("/auth/login")) {
      setToken(null);
      if (!location.pathname.startsWith("/login")) location.assign("/login");
    }
    return Promise.reject(err);
  },
);

export function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg ?? String(x)).join(", ");
  return e?.message ?? "Request failed";
}

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}?token=${encodeURIComponent(getToken() ?? "")}`;
}

/** Download an authenticated file (PDF reports) via blob. */
export async function downloadFile(url: string, filename: string) {
  const res = await api.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export async function openFile(url: string) {
  const res = await api.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(res.data);
  window.open(href, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
