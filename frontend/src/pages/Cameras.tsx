import clsx from "clsx";
import { Camera as CameraIcon, Cpu, Gauge, MapPin, MonitorPlay, Power, Signal, Thermometer, Wifi } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Camera } from "../api/types";
import { ErrorBox, PageHeader, ProgressBar, RiskBadge, Spinner, StatCard, StatusBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { timeAgo } from "../lib/format";

export default function CamerasPage() {
  const { canOperate } = useAuth();
  const { data, error, loading, reload } = useApi<Camera[]>("/cameras", undefined, 4000);
  const [err, setErr] = useState<string | null>(null);

  const setStatus = async (c: Camera, status: Camera["status"]) => {
    try {
      await api.patch(`/cameras/${c.id}`, { status });
      await reload(true);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  const cams = data ?? [];
  const online = cams.filter((c) => c.status === "ONLINE");

  return (
    <div className="space-y-5">
      <PageHeader title="Camera Network Manager" subtitle="Trackside camera telemetry across Western Ghats & Konkan sections" icon={CameraIcon} />
      {err && <ErrorBox message={err} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Online" value={`${online.length}/${cams.length}`} icon={Wifi} tone="green" sub="cameras streaming" />
        <StatCard label="Avg FPS" value={(online.reduce((s, c) => s + (c.runtime?.fps ?? 0), 0) / Math.max(online.length, 1)).toFixed(1)} icon={Gauge} tone="cyan" sub="analysed frames/s" />
        <StatCard label="Avg Uptime" value={`${(cams.reduce((s, c) => s + c.uptime_pct, 0) / Math.max(cams.length, 1)).toFixed(1)}%`} icon={Signal} tone="blue" sub="30-day availability" />
        <StatCard label="Reasoning latency" value={`${(online.reduce((s, c) => s + (c.runtime?.latency_ms ?? 0), 0) / Math.max(online.length, 1)).toFixed(2)} ms`} icon={Cpu} tone="violet" sub="ROI → XAI per frame" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {cams.map((c) => {
          const rt = c.runtime;
          const on = c.status === "ONLINE";
          return (
            <div key={c.id} className={clsx("glass flex flex-col p-4", !on && "opacity-80")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={clsx("h-2.5 w-2.5 rounded-full", on ? "animate-pulse bg-emerald-400" : c.status === "MAINTENANCE" ? "bg-amber-400" : "bg-red-500")} />
                    <span className="font-mono text-sm font-bold text-white">{c.id}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-200">{c.name}</div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5" /> {c.section_name} · km {c.km_marker}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/[0.03] p-2">
                  <div className="text-slate-500">Type</div>
                  <div className="text-slate-200">{c.camera_type}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2">
                  <div className="text-slate-500">Resolution</div>
                  <div className="text-slate-200">
                    {c.resolution} @ {c.fps}fps
                  </div>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2">
                  <div className="text-slate-500">Live FPS / latency</div>
                  <div className="font-mono text-slate-200">{on && rt ? `${rt.fps.toFixed(1)} / ${rt.latency_ms.toFixed(1)}ms` : "-"}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2">
                  <div className="flex items-center gap-1 text-slate-500">
                    <Thermometer className="h-3 w-3" /> Enclosure
                  </div>
                  <div className={clsx("font-mono", c.temperature_c > 44 ? "text-orange-300" : "text-slate-200")}>{c.temperature_c.toFixed(1)}°C</div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Uptime</span>
                  <span className="font-mono">{c.uptime_pct.toFixed(2)}%</span>
                </div>
                <ProgressBar value={c.uptime_pct} color={c.uptime_pct > 97 ? "#22c55e" : c.uptime_pct > 90 ? "#eab308" : "#ef4444"} />
                <div className="flex justify-between pt-1 text-slate-400">
                  <span>Bandwidth {c.bandwidth_mbps} Mbps</span>
                  <span>Heartbeat {timeAgo(c.last_heartbeat)}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-xs">
                {on && rt ? <RiskBadge level={rt.level} score={rt.max_risk} /> : <span className="text-slate-500">No feed</span>}
                <span className="text-slate-500">{c.incident_count} incidents</span>
                <span className="ml-auto text-slate-500">{c.scenario_profile}</span>
              </div>
              {rt?.simulation?.active_scenario && on && <div className="mt-2 truncate rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">▶ {rt.simulation.active_scenario.title}</div>}
              <div className="mt-3 flex gap-2">
                <Link to={`/live?cam=${c.id}`} className={clsx("btn-ghost flex-1 py-1.5 text-xs", !on && "pointer-events-none opacity-40")}>
                  <MonitorPlay className="h-3.5 w-3.5" /> View live
                </Link>
                {canOperate && (
                  <select className="input w-auto py-1.5 text-xs" value={c.status} onChange={(e) => setStatus(c, e.target.value as Camera["status"])} title="Set camera status">
                    <option value="ONLINE">Online</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                )}
                {!canOperate && <Power className="h-4 w-4 self-center text-slate-600" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
