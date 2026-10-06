import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Camera, Clock, Gauge, LayoutDashboard, MonitorPlay, Radar, ShieldAlert, Siren, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Alert, Incident, RiskLevel, RuntimeSummary } from "../api/types";
import { AlertRow } from "../components/AlertsDrawer";
import SceneCanvas from "../components/SceneCanvas";
import { Card, ErrorBox, PageHeader, RiskBadge, ScoreRing, Spinner, StatCard, StatusBadge, axisProps, chartTooltip } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { useApi } from "../hooks/useApi";
import { useStream } from "../hooks/useStream";
import { RISK_HEX, timeAgo } from "../lib/format";

interface Summary {
  kpis: {
    incidents_24h: number;
    incidents_prev_24h: number;
    critical_24h: number;
    predicted_24h: number;
    active_alerts: number;
    open_incidents: number;
    cameras_online: number;
    cameras_total: number;
    avg_response_s: number | null;
    network_safety_score: number;
    detection_latency_ms: number;
    active_hazards: number;
  };
  risk_index_24h: { hour: string; count: number; max_risk: number; avg_risk: number; critical: number }[];
  recent_incidents: Incident[];
  recent_alerts: Alert[];
  level_mix_24h: { level: RiskLevel; count: number }[];
}

function LivePreview({ telemetry }: { telemetry: RuntimeSummary[] }) {
  // follow the camera with the highest current risk, but don't flicker between cameras
  const [camId, setCamId] = useState<string | null>(null);
  const hottest = useMemo(
    () => [...telemetry].filter((t) => t.status === "ONLINE" && t.mode === "SIMULATION").sort((a, b) => b.max_risk - a.max_risk || b.object_count - a.object_count)[0],
    [telemetry],
  );
  useEffect(() => {
    if (!hottest) return;
    const current = telemetry.find((t) => t.id === camId);
    if (!camId || !current || (hottest.max_risk > current.max_risk + 15 && hottest.id !== camId) || (current.object_count === 0 && hottest.object_count > 0)) setCamId(hottest.id);
  }, [hottest, telemetry, camId]);
  const { frame } = useStream(camId);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Live Canvas Preview <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        </span>
      }
      icon={MonitorPlay}
      actions={
        <select className="input w-auto py-1 text-xs" value={camId ?? ""} onChange={(e) => setCamId(e.target.value)}>
          {telemetry
            .filter((t) => t.status === "ONLINE" && t.mode !== "VIDEO")
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.name}
              </option>
            ))}
        </select>
      }
      bodyClass="p-3"
    >
      <div className="relative">
        {frame ? <SceneCanvas scene={{ ...frame, seed: frame.camera_id }} image={frame.image} /> : <div className="aspect-video animate-pulse rounded-xl bg-white/[0.03]" />}
        {frame && (
          <>
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1 font-mono text-[11px] text-slate-200 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> REC {frame.camera_id} · {frame.env.time_of_day} · {frame.env.weather}
            </div>
            <div className="absolute right-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-right backdrop-blur">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Safety</div>
              <div className="font-mono text-lg font-bold" style={{ color: RISK_HEX[frame.level] }}>
                {Math.round(frame.safety_score)}
              </div>
            </div>
            {frame.scenario && <div className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-lg bg-black/60 px-2.5 py-1 text-xs text-amber-200 backdrop-blur">▶ {frame.scenario.title}</div>}
          </>
        )}
      </div>
      <Link to={camId ? `/live?cam=${camId}` : "/live"} className="mt-2 inline-block text-xs font-medium text-cyan-300 hover:underline">
        Open in Live Monitoring →
      </Link>
    </Card>
  );
}

export default function Dashboard() {
  const live = useLive();
  const { canOperate } = useAuth();
  const { data, error, loading, reload } = useApi<Summary>("/dashboard/summary", undefined, 5000);
  useEffect(() => {
    if (live.eventTick) void reload(true);
  }, [live.eventTick, reload]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;
  const k = data.kpis;
  const delta = k.incidents_24h - k.incidents_prev_24h;
  const camsLive = live.telemetry.filter((t) => t.mode !== "VIDEO");

  return (
    <div className="space-y-5">
      <PageHeader title="Control Room Dashboard" subtitle="Real-time situational awareness across the monitored railway network" icon={LayoutDashboard} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Incidents · 24h"
          value={k.incidents_24h}
          icon={ShieldAlert}
          tone="amber"
          trend={
            <span className={`flex items-center ${delta > 0 ? "text-red-300" : "text-emerald-300"}`}>
              {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(delta)}
            </span>
          }
          sub="vs previous 24h"
        />
        <StatCard label="Critical · 24h" value={k.critical_24h} icon={AlertTriangle} tone="red" sub={`${k.open_incidents} incidents open`} />
        <StatCard label="Active Alerts" value={live.unacknowledged || k.active_alerts} icon={Siren} tone="red" sub="awaiting acknowledgement" />
        <StatCard label="Predicted Threats" value={k.predicted_24h} icon={Zap} tone="violet" sub="early warnings · 24h" />
        <StatCard label="Cameras Online" value={`${k.cameras_online}/${k.cameras_total}`} icon={Camera} tone="green" sub={`${k.active_hazards} objects tracked now`} />
        <StatCard label="Avg Response" value={k.avg_response_s != null ? `${Math.round(k.avg_response_s)}s` : "-"} icon={Clock} tone="blue" sub={`AI reasoning ${k.detection_latency_ms.toFixed(2)} ms`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <LivePreview telemetry={live.telemetry} />
        </div>
        <Card title="Network Safety Index" icon={Gauge}>
          <div className="flex items-center gap-5">
            <ScoreRing score={k.network_safety_score} size={130} label="Safety" color={RISK_HEX[k.network_safety_score >= 80 ? "SAFE" : k.network_safety_score >= 60 ? "LOW" : k.network_safety_score >= 40 ? "MEDIUM" : k.network_safety_score >= 20 ? "HIGH" : "CRITICAL"]} />
            <div className="flex-1 space-y-1.5 text-xs">
              {data.level_mix_24h
                .filter((l) => l.level !== "SAFE")
                .map((l) => (
                  <div key={l.level} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: RISK_HEX[l.level] }} />
                    <span className="flex-1 text-slate-400">{l.level}</span>
                    <span className="font-mono text-slate-200">{l.count}</span>
                  </div>
                ))}
              <div className="pt-1 text-[11px] text-slate-500">Incident mix, last 24h</div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            {camsLive.map((c) => (
              <Link to={`/live?cam=${c.id}`} key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5">
                <span className={`h-2 w-2 rounded-full ${c.status === "ONLINE" ? "bg-emerald-400" : c.status === "MAINTENANCE" ? "bg-amber-400" : "bg-red-500"}`} />
                <span className="w-14 font-mono text-slate-400">{c.id}</span>
                <span className="flex-1 truncate text-slate-300">{c.simulation?.active_scenario?.title ?? (c.status === "ONLINE" ? "Clear track" : c.status.toLowerCase())}</span>
                {c.status === "ONLINE" ? <RiskBadge level={c.level} score={c.max_risk} /> : <StatusBadge status={c.status} />}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="24-Hour Risk Index" icon={Activity} className="xl:col-span-2">
          <div className="mb-2 flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#e66767]" /> Peak risk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#c98500]" /> Average risk
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer>
              <ComposedChart data={data.risk_index_24h} syncId="risk24">
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#e66767" stopOpacity={0.35} />
                    <stop offset="1" stopColor="#e66767" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="hour" {...axisProps} interval={2} hide />
                <YAxis domain={[0, 100]} {...axisProps} width={30} />
                <Tooltip {...chartTooltip} />
                <Area type="monotone" dataKey="max_risk" name="Peak risk" stroke="#e66767" fill="url(#riskFill)" strokeWidth={2} />
                <Line type="monotone" dataKey="avg_risk" name="Avg risk" stroke="#c98500" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Incidents per hour</div>
          <div className="h-16">
            <ResponsiveContainer>
              <BarChart data={data.risk_index_24h} syncId="risk24">
                <XAxis dataKey="hour" {...axisProps} interval={2} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="count" name="Incidents" fill="#3987e5" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card
          title="Live Alert Feed"
          icon={Siren}
          actions={
            <button className="text-xs text-cyan-300 hover:underline" onClick={() => live.setDrawerOpen(true)}>
              View all
            </button>
          }
          bodyClass="max-h-72 space-y-2 overflow-y-auto p-3"
        >
          {(live.alerts.length ? live.alerts : data.recent_alerts).slice(0, 8).map((a) => (
            <AlertRow key={a.id} a={a} canAck={false} />
          ))}
          {canOperate ? null : <p className="text-center text-[11px] text-slate-500">Read-only role</p>}
        </Card>
      </div>

      <Card title="Recent Incidents" icon={Radar} actions={<Link to="/incidents" className="text-xs text-cyan-300 hover:underline">Incident database →</Link>} bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr>
                <th className="th">Incident</th>
                <th className="th">Hazard</th>
                <th className="th">Location</th>
                <th className="th">Zone</th>
                <th className="th">Risk</th>
                <th className="th">Status</th>
                <th className="th">Detected</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_incidents.map((i) => (
                <tr key={i.id} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="td">
                    <Link to={`/incidents/${i.id}`} className="font-mono text-cyan-300 hover:underline">
                      {i.code}
                    </Link>
                  </td>
                  <td className="td">
                    <span className="mr-1.5">{i.hazard_icon}</span>
                    {i.hazard_label}
                    {i.predicted_threat && <Zap className="ml-1 inline h-3 w-3 text-yellow-400" />}
                  </td>
                  <td className="td text-slate-400">
                    {i.camera_id} · {i.section_name}
                  </td>
                  <td className="td text-xs text-slate-400">{i.zone}</td>
                  <td className="td">
                    <RiskBadge level={i.risk_level} score={i.risk_score} />
                  </td>
                  <td className="td">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="td text-xs text-slate-400">{timeAgo(i.detected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
