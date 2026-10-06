import { Activity, CheckCircle2, Cpu, History, Server, TriangleAlert, XCircle } from "lucide-react";
import type { RuntimeSummary } from "../api/types";
import { Card, ErrorBox, PageHeader, Spinner, StatCard, StatusBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { fmtDateTime, fmtDuration, titleCase } from "../lib/format";

interface Health {
  overall: string;
  version: string;
  checks: { name: string; status: string; detail: string; latency_ms: number }[];
  streams: RuntimeSummary[];
  overview: { uptime_s: number; avg_fps: number; avg_latency_ms: number; ws_clients: number; counters: { frames: number; incidents: number; alerts: number }; simulation_paused: boolean };
  resources: Record<string, string | number>;
}

const ICON = { OK: CheckCircle2, STANDBY: CheckCircle2, DEGRADED: TriangleAlert, DOWN: XCircle } as const;
const COLOR = { OK: "text-emerald-400", STANDBY: "text-sky-400", DEGRADED: "text-amber-400", DOWN: "text-red-400" } as const;

export default function SystemHealthPage() {
  const { canOperate } = useAuth();
  const { data, error, loading, reload } = useApi<Health>("/system/health", undefined, 3000);
  const { data: audit } = useApi<{ id: number; username: string; action: string; entity: string; detail: string; created_at: string }[]>(canOperate ? "/audit" : null, { limit: 40 }, 10000);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;
  const ov = data.overview;

  return (
    <div className="space-y-5">
      <PageHeader title="System Health" subtitle={`RailGuard AI v${data.version} · subsystem diagnostics refreshed every 3 s`} icon={Cpu} actions={<StatusBadge status={data.overall} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Uptime" value={fmtDuration(ov.uptime_s)} icon={Server} tone="green" sub={ov.simulation_paused ? "simulation paused" : "all loops running"} />
        <StatCard label="Frames analysed" value={ov.counters.frames.toLocaleString()} icon={Activity} tone="cyan" sub={`${ov.avg_fps} FPS per feed`} />
        <StatCard label="Reasoning latency" value={`${ov.avg_latency_ms.toFixed(2)} ms`} icon={Cpu} tone="violet" sub="stages 2-6 per frame" />
        <StatCard label="Session events" value={`${ov.counters.incidents} / ${ov.counters.alerts}`} icon={History} tone="amber" sub={`incidents / alerts · ${ov.ws_clients} WS subs`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Subsystem diagnostics" bodyClass="space-y-2 p-3">
          {data.checks.map((c) => {
            const Icon = ICON[c.status as keyof typeof ICON] ?? TriangleAlert;
            return (
              <div key={c.name} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${COLOR[c.status as keyof typeof COLOR] ?? "text-slate-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{c.name}</span>
                    <StatusBadge status={c.status} />
                    <span className="ml-auto font-mono text-[11px] text-slate-500">{c.latency_ms} ms</span>
                  </div>
                  <p className="mt-0.5 break-words text-xs text-slate-400">{c.detail}</p>
                </div>
              </div>
            );
          })}
        </Card>
        <div className="space-y-5">
          <Card title="Stream feeds" bodyClass="p-0">
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <th className="th">Feed</th>
                  <th className="th">Mode</th>
                  <th className="th">Status</th>
                  <th className="th text-right">FPS</th>
                  <th className="th text-right">Latency</th>
                  <th className="th text-right">Frames</th>
                </tr>
              </thead>
              <tbody>
                {data.streams.map((s) => (
                  <tr key={s.id} className="border-b border-white/[0.04]">
                    <td className="td font-mono text-xs">{s.id}</td>
                    <td className="td text-xs text-slate-400">{titleCase(s.mode)}</td>
                    <td className="td">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="td text-right font-mono text-xs">{s.fps.toFixed(1)}</td>
                    <td className="td text-right font-mono text-xs">{s.latency_ms.toFixed(2)} ms</td>
                    <td className="td text-right font-mono text-xs">{s.frames.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Runtime environment" bodyClass="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(data.resources).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/[0.03] p-2">
                <div className="text-slate-500">{titleCase(k)}</div>
                <div className="break-all font-mono text-slate-200">{String(v)}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {audit && (
        <Card title="Audit trail" icon={History} bodyClass="p-0">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-white/[0.04]">
                    <td className="td whitespace-nowrap text-xs text-slate-400">{fmtDateTime(a.created_at)}</td>
                    <td className="td text-xs font-medium text-slate-200">{a.username}</td>
                    <td className="td font-mono text-xs text-cyan-300">{a.action}</td>
                    <td className="td text-xs text-slate-300">{a.entity}</td>
                    <td className="td max-w-xs truncate text-xs text-slate-500" title={a.detail}>
                      {a.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
