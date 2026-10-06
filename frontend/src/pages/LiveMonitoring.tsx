import clsx from "clsx";
import { ArrowRight, Crosshair, Eraser, Eye, EyeOff, Film, Loader2, MonitorPlay, Move, Play, Square, Tag, Upload, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { RuntimeSummary, Scenario, SceneObject } from "../api/types";
import SceneCanvas from "../components/SceneCanvas";
import XaiBreakdown from "../components/XaiBreakdown";
import { Card, PageHeader, RiskBadge, ScoreRing, Toggle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { useApi } from "../hooks/useApi";
import { useStream } from "../hooks/useStream";
import { RISK_HEX, titleCase } from "../lib/format";

const STAGES = ["YOLOv8 Detect", "Track ROI Zones", "Centroid/IoU Track", "Pinhole Distance", "Motion & ETA", "XAI Risk", "Alert Engine"];

function directionLabel(o: SceneObject) {
  const d = o.motion.direction;
  if (d === "TOWARD_TRACK") return "→ Toward track";
  if (d === "AWAY_FROM_TRACK") return "← Away";
  if (d === "ON_TRACK_MOVING") return "On track, moving";
  if (d === "ALONG_TRACK") return "Parallel";
  return "Stationary";
}

export default function LiveMonitoring() {
  const [params, setParams] = useSearchParams();
  const { canOperate } = useAuth();
  const live = useLive();
  const { data: runtimes, reload: reloadRuntimes } = useApi<RuntimeSummary[]>("/stream/runtimes", undefined, 3000);
  const { data: scenarios } = useApi<Scenario[]>("/stream/scenarios");
  const [camId, setCamId] = useState<string | null>(params.get("cam"));
  const [showRoi, setShowRoi] = useState(true);
  const [showVectors, setShowVectors] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!camId && runtimes?.length) setCamId(runtimes.find((r) => r.status === "ONLINE")?.id ?? runtimes[0].id);
  }, [runtimes, camId]);
  useEffect(() => {
    if (camId && params.get("cam") !== camId) setParams({ cam: camId }, { replace: true });
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camId]);

  const { frame, connected, ended } = useStream(camId);
  const rt = runtimes?.find((r) => r.id === camId) ?? live.telemetry.find((t) => t.id === camId);
  const focus = useMemo(() => {
    if (!frame?.objects.length) return null;
    return frame.objects.find((o) => o.track_id === selected) ?? frame.objects[0];
  }, [frame, selected]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg(null), 5000);
  };

  const trigger = async (key: string) => {
    if (!camId) return;
    setBusy(key);
    try {
      const r = await api.post(`/stream/${camId}/scenario`, { scenario: key });
      flash(true, `Scenario started: ${r.data.title}`);
    } catch (e) {
      flash(false, errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (!camId) return;
    try {
      await api.post(`/stream/${camId}/clear`);
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const upload = async (file: File) => {
    setBusy("upload");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post<RuntimeSummary>("/stream/upload", fd, { timeout: 300000 });
      await reloadRuntimes();
      setCamId(r.data.id);
      flash(true, `Analysing ${file.name} with YOLOv8...`);
    } catch (e) {
      flash(false, errorMessage(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const stopVideo = async () => {
    if (!camId) return;
    try {
      await api.delete(`/stream/${camId}`);
      setCamId(null);
      await reloadRuntimes();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const isSim = rt?.mode === "SIMULATION";
  const isVideo = rt?.mode === "VIDEO";
  const offline = rt && rt.status !== "ONLINE";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Monitoring"
        subtitle="Real-time multi-stage AI analysis: detection → danger-zone segmentation → tracking → distance → trajectory → explainable risk"
        icon={MonitorPlay}
        actions={
          canOperate && (
            <>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
                {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload video
              </button>
            </>
          )
        }
      />

      {msg && <div className={clsx("rounded-xl border p-3 text-sm", msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200")}>{msg.text}</div>}

      {/* stream selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {runtimes?.map((r) => (
          <button
            key={r.id}
            onClick={() => setCamId(r.id)}
            className={clsx(
              "min-w-[150px] shrink-0 rounded-xl border px-3 py-2 text-left transition",
              r.id === camId ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
            )}
          >
            <div className="flex items-center gap-2">
              {r.mode === "VIDEO" ? <Film className="h-3.5 w-3.5 text-violet-300" /> : <span className={clsx("h-2 w-2 rounded-full", r.status === "ONLINE" ? "bg-emerald-400" : r.status === "MAINTENANCE" ? "bg-amber-400" : "bg-red-500")} />}
              <span className="font-mono text-xs font-semibold text-white">{r.id}</span>
              {r.status === "ONLINE" && r.object_count > 0 && <span className="ml-auto h-2 w-2 rounded-full" style={{ background: RISK_HEX[r.level] }} />}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-400">{r.name}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card bodyClass="p-3">
            <div className="relative">
              {offline ? (
                <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-ink-900 text-slate-500">
                  <EyeOff className="mb-2 h-8 w-8" />
                  Camera {rt?.status.toLowerCase()} - no feed
                </div>
              ) : frame ? (
                <SceneCanvas scene={{ ...frame, seed: frame.camera_id }} image={frame.image} showRoi={showRoi} showVectors={showVectors} showLabels={showLabels} focusTrackId={focus?.track_id} />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl bg-ink-900 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {ended ?? "Connecting to stream..."}
                </div>
              )}
              {frame && !offline && (
                <>
                  <div className="absolute left-3 top-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2 rounded-lg bg-black/65 px-2.5 py-1 font-mono text-[11px] text-slate-100 backdrop-blur">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                      {frame.camera_id} · {frame.mode} · frame {frame.frame_no}
                    </div>
                    <div className="rounded-lg bg-black/65 px-2.5 py-1 font-mono text-[11px] text-slate-300 backdrop-blur">
                      {frame.fps.toFixed(1)} FPS · {frame.latency_ms.toFixed(1)} ms · {frame.env.time_of_day} · {frame.env.weather}
                    </div>
                  </div>
                  <div className="absolute right-3 top-3 rounded-xl bg-black/65 px-3 py-1.5 text-center backdrop-blur">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Track safety</div>
                    <div className="font-mono text-2xl font-bold" style={{ color: RISK_HEX[frame.level] }}>
                      {Math.round(frame.safety_score)}
                    </div>
                  </div>
                  {frame.scenario && (
                    <div className="absolute bottom-3 left-3 max-w-[75%] rounded-lg bg-black/65 px-3 py-1.5 text-xs backdrop-blur">
                      <span className="font-semibold text-amber-300">▶ {frame.scenario.title}</span>
                      <span className="ml-2 text-slate-400">{frame.scenario.elapsed_s.toFixed(0)}s</span>
                    </div>
                  )}
                  {frame.progress != null && (
                    <div className="absolute inset-x-3 bottom-2 h-1 overflow-hidden rounded bg-white/10">
                      <div className="h-full bg-violet-400" style={{ width: `${frame.progress * 100}%` }} />
                    </div>
                  )}
                  {frame.objects.some((o) => o.risk.risk_level === "CRITICAL") && <div className="pointer-events-none absolute inset-0 animate-pulse rounded-xl ring-4 ring-inset ring-red-500/50" />}
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300">
              <label className="flex items-center gap-2">
                <Toggle checked={showRoi} onChange={setShowRoi} label="ROI" /> <Crosshair className="h-3.5 w-3.5 text-red-400" /> Track ROI polygons
              </label>
              <label className="flex items-center gap-2">
                <Toggle checked={showVectors} onChange={setShowVectors} label="Vectors" /> <Move className="h-3.5 w-3.5 text-rose-400" /> Motion vectors
              </label>
              <label className="flex items-center gap-2">
                <Toggle checked={showLabels} onChange={setShowLabels} label="Labels" /> <Tag className="h-3.5 w-3.5 text-cyan-400" /> Labels
              </label>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-sm border-2 border-red-500 bg-red-500/20" /> Critical zone
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-sm border-2 border-dashed border-yellow-400 bg-yellow-400/10" /> Warning buffer
                </span>
                <span className={connected ? "text-emerald-400" : "text-red-400"}>● {connected ? "WS live" : "WS offline"}</span>
              </span>
            </div>
          </Card>

          {/* pipeline strip */}
          <div className="glass flex flex-wrap items-center gap-1.5 p-3 text-[11px]">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={clsx("rounded-md border px-2 py-1 font-medium", frame && !offline ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-500")}>
                  {i + 1}. {s}
                </span>
                {i < STAGES.length - 1 && <ArrowRight className="h-3 w-3 text-slate-600" />}
              </div>
            ))}
            {isVideo && <span className="ml-auto text-slate-400">YOLOv8 on uploaded video</span>}
          </div>

          {isSim && canOperate && (
            <Card
              title="Demo Scenario Control"
              icon={Play}
              actions={
                <button className="btn-ghost py-1 text-xs" onClick={clear}>
                  <Eraser className="h-3.5 w-3.5" /> Clear scene
                </button>
              }
            >
              <p className="mb-3 text-xs text-slate-400">
                Zero-hardware simulation mode. Scenarios are scripted in world coordinates and pass through the same pinhole projection, tracker, distance estimator, motion analyser and XAI risk engine as real YOLO detections. Auto-scenarios run on their own; trigger one here for a demo.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {scenarios?.map((s) => (
                  <button key={s.key} onClick={() => trigger(s.key)} disabled={!!busy} className="group rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-400/5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                      {busy === s.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 text-cyan-400" />}
                      {s.title}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-slate-400">{s.description}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {isVideo && canOperate && (
            <button className="btn-danger" onClick={stopVideo}>
              <Square className="h-4 w-4" /> Stop & remove video stream
            </button>
          )}
        </div>

        {/* right column */}
        <div className="space-y-4">
          <Card title="Scene Assessment" icon={Eye}>
            <div className="flex items-center gap-4">
              <ScoreRing score={frame?.safety_score ?? 100} size={104} label="Safety" color={RISK_HEX[frame?.level ?? "SAFE"]} />
              <div className="space-y-1 text-sm">
                <RiskBadge level={frame?.level ?? "SAFE"} score={frame?.max_risk ?? 0} />
                <div className="text-slate-400">{frame?.objects.length ?? 0} tracked object(s)</div>
                <div className="text-slate-400">{frame?.objects.filter((o) => o.zone === "CRITICAL").length ?? 0} inside track corridor</div>
                {frame?.objects.some((o) => o.motion.predicted_threat) && (
                  <div className="flex items-center gap-1 font-semibold text-yellow-300">
                    <Zap className="h-3.5 w-3.5" /> PREDICTED THREAT
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Tracked Objects" icon={Crosshair} bodyClass="space-y-2 p-3">
            {!frame?.objects.length && <div className="py-6 text-center text-sm text-slate-500">Track clear - no objects detected</div>}
            {frame?.objects.map((o) => (
              <button
                key={o.track_id}
                onClick={() => setSelected(o.track_id)}
                className={clsx("w-full rounded-xl border p-2.5 text-left transition", focus?.track_id === o.track_id ? "border-cyan-400/50 bg-cyan-400/[0.07]" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]")}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{o.icon}</span>
                  <span className="text-sm font-semibold text-white">
                    #{o.track_id} {o.label}
                  </span>
                  <span className="ml-auto">
                    <RiskBadge level={o.risk.risk_level} score={o.risk.risk_score} />
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] text-slate-400">
                  <span>
                    Zone <b className={o.zone === "CRITICAL" ? "text-red-300" : o.zone === "WARNING" ? "text-yellow-300" : "text-emerald-300"}>{o.zone}</b>
                  </span>
                  <span>
                    Dist <b className="text-slate-200">{o.distance_m.toFixed(0)} m</b>
                  </span>
                  <span>
                    Edge <b className="text-slate-200">{o.edge_distance_m.toFixed(1)} m</b>
                  </span>
                  <span className="col-span-2">{directionLabel(o)}</span>
                  <span>
                    <b className="text-slate-200">{o.motion.speed_mps.toFixed(1)}</b> m/s
                  </span>
                </div>
                {o.motion.predicted_threat && o.motion.eta_s != null && (
                  <div className="mt-1.5 rounded-md bg-yellow-500/15 px-2 py-1 text-[11px] font-semibold text-yellow-200">⚠ Predicted track entry in {o.motion.eta_s.toFixed(1)}s</div>
                )}
              </button>
            ))}
          </Card>

          {focus && (
            <Card title={`XAI · #${focus.track_id} ${focus.label}`} icon={Eye}>
              <XaiBreakdown factors={focus.risk.contributing_factors} score={focus.risk.risk_score} level={focus.risk.risk_level} summary={focus.risk.summary_reason} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>Trend: {titleCase(focus.motion.trend)}</div>
                <div>Persisted: {focus.persisted_frames} frames</div>
                <div>Lateral offset: {focus.lateral_m.toFixed(1)} m</div>
                <div>Confidence: {(focus.confidence * 100).toFixed(1)}%</div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
