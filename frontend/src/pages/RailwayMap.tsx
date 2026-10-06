import { Map as MapIcon, MonitorPlay } from "lucide-react";
import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip as LTooltip, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import type { Incident, RiskLevel, RuntimeSummary, Section, SectionHealth } from "../api/types";
import { Card, ErrorBox, PageHeader, RiskBadge, Spinner, StatusBadge } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { RISK_HEX, timeAgo } from "../lib/format";

interface MapData {
  sections: (Section & { health: SectionHealth | null })[];
  cameras: { id: string; name: string; section_id: string; lat: number; lng: number; km_marker: number; status: string; live: RuntimeSummary | null }[];
  active_incidents: (Incident & { lat: number; lng: number })[];
}

// Standard OSM tiles (no API key); darkened for the control-room theme via the .rg-dark-tiles CSS filter.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function healthColor(score: number | undefined): string {
  if (score == null) return "#64748b";
  if (score >= 85) return RISK_HEX.SAFE;
  if (score >= 70) return RISK_HEX.LOW;
  if (score >= 55) return RISK_HEX.MEDIUM;
  if (score >= 40) return RISK_HEX.HIGH;
  return RISK_HEX.CRITICAL;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 12, { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function RailwayMap() {
  const { data, error, loading, reload } = useApi<MapData>("/map", undefined, 4000);
  const [target, setTarget] = useState<[number, number] | null>(null);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <PageHeader title="Geographical Railway Map" subtitle="Hassan-Mangaluru ghat line & Konkan Railway sections - live camera status, section health and active hazards" icon={MapIcon} />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="glass h-[640px] overflow-hidden p-1.5">
          <MapContainer center={[13.35, 75.15]} zoom={8} className="h-full w-full" scrollWheelZoom>
            <TileLayer url={TILE_URL} attribution={TILE_ATTR} className="rg-dark-tiles" />
            <FlyTo target={target} />
            {data.sections.map((s) => (
              <Polyline key={s.id} positions={s.polyline} pathOptions={{ color: healthColor(s.health?.score), weight: 6, opacity: 0.9 }}>
                <LTooltip sticky>
                  <b>{s.name}</b>
                  <br />
                  Health {s.health?.score.toFixed(0)} ({s.health?.rating}) · {s.terrain}
                </LTooltip>
              </Polyline>
            ))}
            {data.cameras.map((c) => {
              const lv: RiskLevel = c.live?.level ?? "SAFE";
              const color = c.status !== "ONLINE" ? "#64748b" : c.live && c.live.object_count > 0 ? RISK_HEX[lv] : "#22d3ee";
              return (
                <CircleMarker key={c.id} center={[c.lat, c.lng]} radius={9} pathOptions={{ color: "#0a1220", weight: 2, fillColor: color, fillOpacity: 1 }}>
                  <Popup>
                    <div className="min-w-[200px] space-y-1 text-xs">
                      <div className="text-sm font-bold">
                        {c.id} · {c.name}
                      </div>
                      <div>
                        Status: <b>{c.status}</b> · km {c.km_marker}
                      </div>
                      {c.live && c.status === "ONLINE" && (
                        <>
                          <div>
                            Safety {Math.round(c.live.safety_score)} · {c.live.object_count} objects · {c.live.fps} FPS
                          </div>
                          {c.live.simulation?.active_scenario && <div>▶ {c.live.simulation.active_scenario.title}</div>}
                          <Link to={`/live?cam=${c.id}`} className="font-semibold text-cyan-300">
                            Open live view →
                          </Link>
                        </>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
            {data.active_incidents.map((i) => (
              <CircleMarker key={i.id} center={[i.lat, i.lng]} radius={6} pathOptions={{ color: RISK_HEX[i.risk_level], weight: 2, fillColor: RISK_HEX[i.risk_level], fillOpacity: 0.5 }}>
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold">
                      {i.hazard_icon} {i.code}
                    </div>
                    <div>
                      {i.hazard_label} · risk {Math.round(i.risk_score)} · {i.status}
                    </div>
                    <Link to={`/incidents/${i.id}`} className="font-semibold text-cyan-300">
                      Details →
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="space-y-4">
          <Card title="Legend" bodyClass="space-y-2 text-xs text-slate-300">
            <div className="font-semibold text-slate-400">Track sections - health score</div>
            {[
              ["≥ 85 Excellent", RISK_HEX.SAFE],
              ["70-84 Good", RISK_HEX.LOW],
              ["55-69 Fair", RISK_HEX.MEDIUM],
              ["40-54 Poor", RISK_HEX.HIGH],
              ["< 40 Critical", RISK_HEX.CRITICAL],
            ].map(([l, c]) => (
              <div key={l} className="flex items-center gap-2">
                <span className="h-1.5 w-6 rounded" style={{ background: c }} /> {l}
              </div>
            ))}
            <div className="pt-1 font-semibold text-slate-400">Cameras</div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-cyan-400" /> Online, clear
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-orange-500" /> Online, hazard tracked (risk colour)
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-500" /> Offline / maintenance
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-red-500 bg-red-500/50" /> Open high/critical incident
            </div>
          </Card>
          <Card title="Sections" bodyClass="max-h-[400px] space-y-1.5 overflow-y-auto p-3">
            {data.sections.map((s) => {
              const cam = data.cameras.find((c) => c.section_id === s.id);
              return (
                <button key={s.id} onClick={() => setTarget([s.lat, s.lng])} className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-left hover:bg-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: healthColor(s.health?.score) }} />
                    <span className="text-sm font-medium text-slate-100">{s.name}</span>
                    <span className="ml-auto font-mono text-sm font-bold" style={{ color: healthColor(s.health?.score) }}>
                      {s.health?.score.toFixed(0)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                    {s.terrain} · km {s.km_start}-{s.km_end}
                    {cam && <span className="ml-auto">{cam.status === "ONLINE" && cam.live ? <RiskBadge level={cam.live.level} /> : <StatusBadge status={cam.status} />}</span>}
                  </div>
                </button>
              );
            })}
          </Card>
          <Card title={`Active hazards (${data.active_incidents.length})`} bodyClass="max-h-48 space-y-1 overflow-y-auto p-3 text-xs">
            {data.active_incidents.length === 0 && <div className="py-4 text-center text-slate-500">No open high/critical incidents</div>}
            {data.active_incidents.map((i) => (
              <button key={i.id} onClick={() => setTarget([i.lat, i.lng])} className="flex w-full items-center gap-2 rounded px-1.5 py-1 hover:bg-white/5">
                <span>{i.hazard_icon}</span>
                <span className="font-mono text-cyan-300">{i.code}</span>
                <span className="ml-auto text-slate-500">{timeAgo(i.detected_at)}</span>
              </button>
            ))}
          </Card>
          <Link to="/live" className="btn-ghost w-full">
            <MonitorPlay className="h-4 w-4" /> Live monitoring
          </Link>
        </div>
      </div>
    </div>
  );
}
