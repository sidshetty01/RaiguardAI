import clsx from "clsx";
import { Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { RISK_CLASSES, STATUS_CLASSES, riskColor, titleCase } from "../lib/format";

export function Card({ className, children, title, icon: Icon, actions, bodyClass }: { className?: string; children: ReactNode; title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; bodyClass?: string }) {
  return (
    <section className={clsx("glass flex flex-col", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            {Icon && <Icon className="h-4 w-4 text-cyan-400" />}
            {title}
          </h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("flex-1 p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, icon: Icon, actions }: { title: string; subtitle?: string; icon?: LucideIcon; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2.5">
            <Icon className="h-5 w-5 text-cyan-300" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", className)}>{children}</span>;
}

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  return (
    <Badge className={RISK_CLASSES[level] ?? RISK_CLASSES.LOW}>
      {level === "CRITICAL" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}
      {level}
      {score !== undefined && <span className="font-mono opacity-80">{Math.round(score)}</span>}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_CLASSES[status] ?? "border-white/10 bg-white/5 text-slate-300"}>{titleCase(status)}</Badge>;
}

export function StatCard({ label, value, sub, icon: Icon, tone = "cyan", trend }: { label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone?: "cyan" | "red" | "amber" | "green" | "violet" | "blue"; trend?: ReactNode }) {
  const tones: Record<string, string> = {
    cyan: "from-cyan-500/20 to-cyan-500/0 text-cyan-300 border-cyan-400/20",
    red: "from-red-500/20 to-red-500/0 text-red-300 border-red-400/20",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-300 border-amber-400/20",
    green: "from-emerald-500/20 to-emerald-500/0 text-emerald-300 border-emerald-400/20",
    violet: "from-violet-500/20 to-violet-500/0 text-violet-300 border-violet-400/20",
    blue: "from-blue-500/20 to-blue-500/0 text-blue-300 border-blue-400/20",
  };
  return (
    <div className="glass relative overflow-hidden p-4">
      <div className={clsx("pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-xl", tones[tone])} />
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <div className={clsx("rounded-lg border bg-gradient-to-br p-1.5", tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
        {trend}
        {sub}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}...
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
      {message}
      {onRetry && (
        <button className="btn-ghost ml-3 py-1" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function ScoreRing({ score, size = 120, label, color }: { score: number; size?: number; label?: string; color?: string }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const col = color ?? riskColor(100 - score);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={8} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={col}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
          style={{ transition: "stroke-dashoffset .6s ease, stroke .3s" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono text-2xl font-bold text-white" style={{ fontSize: size / 4.4 }}>
          {Math.round(score)}
        </div>
        {label && <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, color = "#22d3ee", className }: { value: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={clsx("h-2 overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("relative h-6 w-11 rounded-full border transition disabled:opacity-40", checked ? "border-cyan-400/50 bg-cyan-500/70" : "border-white/10 bg-white/10")}
    >
      <span className={clsx("absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export const chartTooltip = {
  contentStyle: { background: "rgba(10,18,32,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#e2e8f0" },
  labelStyle: { color: "#94a3b8" },
  itemStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

export const axisProps = { stroke: "#64748b", fontSize: 11, tickLine: false, axisLine: false } as const;
