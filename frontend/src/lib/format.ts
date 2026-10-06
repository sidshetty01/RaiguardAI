import type { AlertLevel, RiskLevel } from "../api/types";

export const RISK_HEX: Record<RiskLevel, string> = {
  SAFE: "#22c55e",
  LOW: "#3b82f6",
  MEDIUM: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

export const ALERT_HEX: Record<AlertLevel, string> = {
  INFO: "#3b82f6",
  WARNING: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

export const RISK_CLASSES: Record<string, string> = {
  SAFE: "bg-green-500/15 text-green-300 border-green-500/30",
  LOW: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  WARNING: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  INFO: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  HIGH: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  CRITICAL: "bg-red-500/20 text-red-300 border-red-500/40",
};

export const STATUS_CLASSES: Record<string, string> = {
  OPEN: "bg-red-500/15 text-red-300 border-red-500/30",
  ACKNOWLEDGED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  RESOLVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  FALSE_ALARM: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  AUTO_CLEARED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  ONLINE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  OFFLINE: "bg-red-500/15 text-red-300 border-red-500/30",
  MAINTENANCE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  OK: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DEGRADED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  DOWN: "bg-red-500/15 text-red-300 border-red-500/30",
  STANDBY: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export function riskLevel(score: number): RiskLevel {
  const s = Math.round(score);
  if (s <= 20) return "SAFE";
  if (s <= 40) return "LOW";
  if (s <= 60) return "MEDIUM";
  if (s <= 80) return "HIGH";
  return "CRITICAL";
}

export function riskColor(score: number): string {
  return RISK_HEX[riskLevel(score)];
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "-";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

/** Categorical palette (fixed order, validated for the dark surface - CVD ΔE >= 8.4). */
export const CAT = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
/** Single-hue sequential ramp (blue), dim -> bright on the dark surface. */
export const SEQ = ["#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4"];
export function seqColor(t: number): string {
  const i = Math.max(0, Math.min(SEQ.length - 1, Math.round(t * (SEQ.length - 1))));
  return SEQ[i];
}
