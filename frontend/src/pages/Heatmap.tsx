import { Flame } from "lucide-react";
import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip as LTooltip } from "react-leaflet";
import { Card, ErrorBox, PageHeader, ProgressBar, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { seqColor } from "../lib/format";
import { TILE_ATTR, TILE_URL } from "./RailwayMap";

interface HeatData {
  days: number;
  points: { lat: number; lng: number; count: number; weight: number; critical: number }[];
  hour_matrix: { section_id: string; name: string; hours: number[]; total: number }[];
  class_labels: string[];
  class_matrix: { section_id: string; name: string; counts: Record<string, number> }[];
  density: { section_id: string; name: string; incidents: number; per_km: number; lat: number; lng: number; polyline: [number, number][] }[];
}

// Hazard density uses a single warm hue (light → saturated) - sequential, not categorical.
function heat(t: number): string {
  const l = 78 - t * 38; // lightness falls as density rises
  const s = 70 + t * 25;
  return `hsl(14, ${s}%, ${l}%)`;
}

export default function HeatmapPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useApi<HeatData>("/heatmap", { days }, 30000);
  const maxW = useMemo(() => Math.max(1, ...(data?.points.map((p) => p.weight) ?? [1])), [data]);
  const maxCell = useMemo(() => Math.max(1, ...(data?.hour_matrix.flatMap((r) => r.hours) ?? [1])), [data]);
  const maxClass = useMemo(() => Math.max(1, ...(data?.class_matrix.flatMap((r) => Object.values(r.counts)) ?? [1])), [data]);
  const maxDensity = Math.max(0.01, ...(data?.density.map((d) => d.per_km) ?? [0.01]));

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Safety Heatmap"
        subtitle="Spatial and temporal hazard density highlighting high-risk sectors"
        icon={Flame}
        actions={
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${days === d ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-white"}`}>
                {d}d
              </button>
            ))}
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="glass h-[520px] overflow-hidden p-1.5">
          <MapContainer center={[13.35, 75.15]} zoom={8} className="h-full w-full">
            <TileLayer url={TILE_URL} attribution={TILE_ATTR} className="rg-dark-tiles" />
            {data.density.map((s) => (
              <Polyline key={s.section_id} positions={s.polyline} pathOptions={{ color: "#94a3b8", weight: 2, opacity: 0.6, dashArray: "4 4" }} />
            ))}
            {data.points.map((p, i) => {
              const t = p.weight / maxW;
              return (
                <CircleMarker key={i} center={[p.lat, p.lng]} radius={6 + 22 * Math.sqrt(t)} pathOptions={{ stroke: false, fillColor: heat(t), fillOpacity: 0.25 + 0.5 * t }}>
                  <LTooltip>
                    {p.count} incidents · {p.critical} critical · weight {p.weight.toFixed(1)}
                  </LTooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
        <Card title="Hazard density ranking (incidents / km)">
          <div className="space-y-3">
            {data.density.map((d, i) => (
              <div key={d.section_id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">
                    <span className="mr-1.5 font-mono text-slate-500">{i + 1}.</span>
                    {d.name}
                  </span>
                  <span className="font-mono text-slate-200">{d.per_km.toFixed(2)}</span>
                </div>
                <ProgressBar value={d.per_km} max={maxDensity} color={heat(d.per_km / maxDensity)} />
                <div className="mt-0.5 text-[10px] text-slate-500">{d.incidents} incidents</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
            Low
            <div className="h-2 flex-1 rounded" style={{ background: `linear-gradient(90deg, ${heat(0)}, ${heat(0.5)}, ${heat(1)})` }} />
            High
          </div>
        </Card>
      </div>

      <Card title="Section × hour-of-day density (IST)">
        <div className="overflow-x-auto">
          <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="w-48" />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="text-center font-mono text-[10px] font-normal text-slate-500">
                    {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                  </th>
                ))}
                <th className="pl-2 text-right text-[10px] font-normal text-slate-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.hour_matrix.map((r) => (
                <tr key={r.section_id}>
                  <td className="truncate pr-2 text-xs text-slate-300">{r.name}</td>
                  {r.hours.map((v, h) => (
                    <td key={h} title={`${r.name} · ${String(h).padStart(2, "0")}:00 · ${v} incidents`} className="h-7 min-w-[18px] rounded-[3px]" style={{ background: v ? seqColor(v / maxCell) : "rgba(255,255,255,0.03)" }} />
                  ))}
                  <td className="pl-2 text-right font-mono text-xs text-slate-300">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
          0
          <div className="h-2 w-40 rounded" style={{ background: `linear-gradient(90deg, ${seqColor(0)}, ${seqColor(0.5)}, ${seqColor(1)})` }} />
          {maxCell} incidents / hour-slot
        </div>
      </Card>

      <Card title="Section × hazard class matrix">
        <div className="overflow-x-auto">
          <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="w-48" />
                {data.class_labels.map((c) => (
                  <th key={c} className="px-1 text-center text-[10px] font-medium text-slate-400">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.class_matrix.map((r) => (
                <tr key={r.section_id}>
                  <td className="truncate pr-2 text-xs text-slate-300">{r.name}</td>
                  {data.class_labels.map((c) => {
                    const v = r.counts[c] ?? 0;
                    return (
                      <td key={c} className="h-8 rounded-[3px] text-center font-mono text-[11px]" style={{ background: v ? seqColor(v / maxClass) : "rgba(255,255,255,0.03)", color: v / maxClass > 0.55 ? "#0a1220" : "#e2e8f0" }}>
                        {v || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
