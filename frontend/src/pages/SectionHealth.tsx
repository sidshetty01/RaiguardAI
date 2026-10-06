import { HeartPulse, Info, Mountain, Trees, Waves, Wheat } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SectionHealth } from "../api/types";
import { Card, ErrorBox, PageHeader, ScoreRing, Spinner, axisProps, chartTooltip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { CAT } from "../lib/format";
import { healthColor } from "./RailwayMap";

const TERRAIN_ICON = { FOREST: Trees, GHAT: Mountain, COASTAL: Waves, RURAL: Wheat } as const;

interface Detail extends SectionHealth {
  trend: { week: string; incidents: number }[];
}

export default function SectionHealthPage() {
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = useApi<SectionHealth[]>("/sections/health", { days }, 30000);
  const [sel, setSel] = useState<string | null>(null);
  const selected = sel ?? data?.slice().sort((a, b) => a.score - b.score)[0]?.section_id ?? null;
  const { data: detail } = useApi<Detail>(selected ? `/sections/${selected}/health` : null);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;
  const avg = data.reduce((s, d) => s + d.score, 0) / Math.max(data.length, 1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Railway Section Health Score"
        subtitle={`0-100 safety index per section · network average ${avg.toFixed(0)} · rolling ${days}-day window`}
        icon={HeartPulse}
        actions={
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {[7, 14, 30].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${days === d ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-white"}`}>
                {d}d
              </button>
            ))}
          </div>
        }
      />
      <div className="glass flex items-start gap-3 p-3 text-xs text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
        Health = 100 − Hazard Density (≤25) − Critical Incidents (≤20) − Forest Proximity (≤15) − Response Time (≤15) − Unresolved Hazards (≤15) − Terrain Risk (≤8). Every penalty is capped and explained, mirroring the XAI risk engine.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.map((s) => {
          const Icon = TERRAIN_ICON[s.terrain as keyof typeof TERRAIN_ICON] ?? Trees;
          return (
            <button key={s.section_id} onClick={() => setSel(s.section_id)} className={`glass p-4 text-left transition hover:bg-white/[0.06] ${selected === s.section_id ? "ring-2 ring-cyan-400/50" : ""}`}>
              <div className="flex items-start gap-3">
                <ScoreRing score={s.score} size={84} color={healthColor(s.score)} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-slate-500">{s.section_id}</div>
                  <div className="text-sm font-semibold leading-tight text-white">{s.name}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: healthColor(s.score) }}>
                    Grade {s.grade} · {s.rating}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    <Icon className="h-3 w-3" /> {s.terrain} · km {s.km_start}-{s.km_end}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded-lg bg-white/[0.03] py-1.5">
                  <div className="font-mono text-sm text-white">{s.incidents}</div>
                  <div className="text-slate-500">incidents</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] py-1.5">
                  <div className="font-mono text-sm text-red-300">{s.critical}</div>
                  <div className="text-slate-500">critical</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] py-1.5">
                  <div className="font-mono text-sm text-white">{s.avg_response_s != null ? `${Math.round(s.avg_response_s)}s` : "-"}</div>
                  <div className="text-slate-500">response</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {detail && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title={`Penalty breakdown · ${detail.name}`}>
            <div className="space-y-2.5">
              {detail.factors.map((f) => (
                <div key={f.factor}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-200">{f.factor}</span>
                    <span className="font-mono text-red-300">
                      −{f.penalty.toFixed(1)} <span className="text-slate-500">/ {f.max_penalty}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-red-400/80" style={{ width: `${(f.penalty / f.max_penalty) * 100}%` }} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{f.description}</div>
                </div>
              ))}
              <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-semibold">
                <span>Health score</span>
                <span className="font-mono" style={{ color: healthColor(detail.score) }}>
                  {detail.score.toFixed(1)} / 100
                </span>
              </div>
            </div>
          </Card>
          <Card title="Weekly incident trend">
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={detail.trend}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="week" {...axisProps} />
                  <YAxis {...axisProps} width={30} allowDecimals={false} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="incidents" name="Incidents" fill={CAT[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Top hazards: {detail.top_hazards.length ? detail.top_hazards.map(([c, n]) => `${c.replace("_", " ")} (${n})`).join(", ") : "none"} · {detail.unresolved} unresolved high/critical
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
