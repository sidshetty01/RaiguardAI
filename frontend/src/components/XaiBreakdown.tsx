import { Brain } from "lucide-react";
import type { Factor } from "../api/types";
import { riskColor } from "../lib/format";

const FACTOR_COLORS: Record<string, string> = {
  "Track Proximity": "#ef4444",
  "Hazard Severity": "#f97316",
  "Motion Vector": "#a855f7",
  "Temporal Persistence": "#3b82f6",
  "Confidence Rating": "#22d3ee",
  "Benign Class Suppression": "#64748b",
};

export default function XaiBreakdown({ factors, score, level, summary, compact }: { factors: Factor[]; score: number; level: string; summary?: string; compact?: boolean }) {
  const positive = factors.filter((f) => f.points > 0);
  const total = positive.reduce((s, f) => s + f.points, 0) || 1;
  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-violet-400/20 bg-violet-500/10 p-2">
            <Brain className="h-4 w-4 text-violet-300" />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-slate-400">Explainable risk score</div>
            <div className="font-mono text-lg font-bold" style={{ color: riskColor(score) }}>
              {score.toFixed(1)} / 100 · {level}
            </div>
          </div>
        </div>
      )}
      {/* stacked contribution bar */}
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
        {positive.map((f) => (
          <div key={f.factor} title={`${f.factor}: +${f.points}`} style={{ width: `${(f.points / 100) * 100}%`, background: FACTOR_COLORS[f.factor] ?? "#94a3b8" }} />
        ))}
      </div>
      <div className="space-y-2">
        {factors.map((f) => (
          <div key={f.factor} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-200">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FACTOR_COLORS[f.factor] ?? "#94a3b8" }} />
                {f.factor}
              </span>
              <span className={`font-mono font-semibold ${f.points < 0 ? "text-slate-400" : "text-white"}`}>
                {f.points >= 0 ? "+" : ""}
                {f.points.toFixed(1)}
                {f.max_points ? <span className="text-slate-500"> / {f.max_points}</span> : null}
              </span>
            </div>
            {f.max_points > 0 && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, (f.points / f.max_points) * 100)}%`, background: FACTOR_COLORS[f.factor] ?? "#94a3b8" }} />
              </div>
            )}
            <p className="mt-1.5 text-xs text-slate-400">{f.description}</p>
          </div>
        ))}
      </div>
      {summary && <p className="rounded-lg border border-white/[0.06] bg-ink-900/60 p-2.5 text-xs leading-relaxed text-slate-300">{summary}</p>}
      {!compact && <p className="text-[11px] text-slate-500">Share of score: {positive.map((f) => `${f.factor.split(" ")[1] ?? f.factor} ${Math.round((f.points / total) * 100)}%`).join(" · ")}</p>}
    </div>
  );
}
