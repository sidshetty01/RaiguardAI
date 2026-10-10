import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { RuntimeSummary, Scenario } from "../api/types";
import { Empty, FactorBars, Gauge, Hud, PageHead, Pill } from "../components/bits";
import Icon from "../components/Icon";
import SceneCanvas from "../components/SceneCanvas";
import { useApi } from "../hooks/useApi";
import { useStream } from "../hooks/useStream";
import { RISK_HEX, titleCase } from "../lib/format";

const DIRECTION: Record<string, string> = {
  TOWARD_TRACK: "moving toward track",
  AWAY_FROM_TRACK: "moving away",
  ON_TRACK_MOVING: "moving on track",
  ALONG_TRACK: "moving parallel",
  STATIONARY: "stationary",
};

export default function Live() {
  const [params, setParams] = useSearchParams();
  const { data: runtimes, reload } = useApi<RuntimeSummary[]>("/stream/runtimes", undefined, 3000);
  const { data: scenarios } = useApi<Scenario[]>("/stream/scenarios");
  const [camId, setCamId] = useState<string | null>(params.get("cam"));
  const [scenario, setScenario] = useState("elephant_crossing");
  const [showRoi, setShowRoi] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!camId && runtimes?.length) setCamId(runtimes.find((r) => r.status === "ONLINE")?.id ?? runtimes[0].id);
  }, [runtimes, camId]);
  useEffect(() => {
    if (camId) setParams({ cam: camId }, { replace: true });
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camId]);

  const { frame, ended } = useStream(camId);
  const rt = runtimes?.find((r) => r.id === camId);
  const focus = frame?.objects.find((o) => o.track_id === selected) ?? frame?.objects[0];
  const level = frame?.level ?? "SAFE";

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      window.setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const trigger = () =>
    run(async () => {
      const r = await api.post(`/stream/${camId}/scenario`, { scenario });
      return `Scenario started: ${r.data.title}`;
    });

  const upload = (f: File) =>
    run(async () => {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api.post<RuntimeSummary>("/stream/upload", fd, { timeout: 300000 });
      await reload();
      setCamId(r.data.id);
      if (fileRef.current) fileRef.current.value = "";
      return `Analysing ${f.name} with YOLOv8...`;
    });

  const stopVideo = () =>
    run(async () => {
      await api.delete(`/stream/${camId}`);
      setCamId(null);
      await reload();
      return "Video stream removed";
    });

  return (
    <div className="page">
      <PageHead
        eyebrow="Real-time analysis"
        title="Live Monitoring"
        sub="Trackside cameras through the full pipeline: detection → danger zones → tracking → distance → trajectory → explainable risk."
        actions={
          <>
            <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Icon name="upload" /> {busy ? "Working..." : "Upload video"}
            </button>
          </>
        }
      />

      <div className="chips" style={{ marginBottom: 18 }}>
        {runtimes?.map((r) => (
          <button key={r.id} className={`chip ${r.id === camId ? "on" : ""}`} onClick={() => setCamId(r.id)} title={r.name}>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: 7,
                marginRight: 7,
                background: r.status !== "ONLINE" ? "#64748b" : r.object_count ? RISK_HEX[r.level] : "#22c55e",
              }}
            />
            {r.mode === "VIDEO" ? "VIDEO " : ""}
            {r.id}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`msg ${msg.ok ? "ok" : "error"}`}>
          <Icon name={msg.ok ? "check" : "alert"} style={{ width: 18, height: 18 }} /> {msg.text}
        </div>
      )}

      <div className="split">
        <div>
          <div className="panel" style={{ padding: 14 }}>
            <Hud
              alarm={frame?.objects.some((o) => o.risk.risk_level === "CRITICAL")}
              tags={
                frame && (
                  <>
                    <span className="tag tl-tag">
                      <span className="rec" /> {frame.camera_id} · {frame.mode === "VIDEO" ? "YOLOv8" : "SIM"} · {frame.fps.toFixed(1)} FPS
                    </span>
                    <span className="tag tr-tag">
                      {frame.env.time_of_day} · {frame.env.weather}
                    </span>
                    {frame.scenario && <span className="tag bl-tag" style={{ color: "#ffd38a" }}>▶ {frame.scenario.title}</span>}
                  </>
                )
              }
            >
              {rt && rt.status !== "ONLINE" ? (
                <div style={{ aspectRatio: "16/9", display: "grid", placeItems: "center" }}>
                  <Empty icon={<Icon name="cam" />}>
                    {rt.name} is {rt.status.toLowerCase()} - no feed
                  </Empty>
                </div>
              ) : frame ? (
                <SceneCanvas scene={{ ...frame, seed: frame.camera_id }} image={frame.image} showRoi={showRoi} focusTrackId={focus?.track_id} />
              ) : (
                <div className="skeleton" style={{ aspectRatio: "16/9", borderRadius: 0 }}>
                  {ended && <div className="empty">{ended}</div>}
                </div>
              )}
              {frame?.progress != null && (
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(255,255,255,.08)" }}>
                  <div style={{ height: "100%", width: `${frame.progress * 100}%`, background: "var(--violet)" }} />
                </div>
              )}
            </Hud>
            <div className="row" style={{ marginTop: 12 }}>
              <label className="check">
                <input type="checkbox" checked={showRoi} onChange={(e) => setShowRoi(e.target.checked)} /> Track danger zones
              </label>
              <span style={{ marginLeft: "auto" }} />
              {rt?.mode === "SIMULATION" && (
                <>
                  <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                    {scenarios?.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <button className="btn" onClick={trigger} disabled={busy}>
                    <Icon name="play" /> Run scenario
                  </button>
                </>
              )}
              {rt?.mode === "VIDEO" && (
                <button className="btn danger" onClick={stopVideo} disabled={busy}>
                  <Icon name="x" /> Remove video
                </button>
              )}
            </div>
          </div>

          {focus && (
            <div className="panel">
              <div className="panel-title">
                <Icon name="brain" /> #{focus.track_id} {focus.label} · risk breakdown
                <span className="sub">{focus.risk.summary_reason}</span>
              </div>
              <FactorBars key={`${camId}-${focus.track_id}`} factors={focus.risk.contributing_factors} />
            </div>
          )}
        </div>

        <div>
          <div className="panel">
            <div className="verdict">
              <Gauge score={frame?.max_risk ?? 0} level={level} size={140} />
              <div>
                <div className="lvl" style={{ color: RISK_HEX[level] }}>
                  {level}
                </div>
                <div className="meta">
                  Track safety <b style={{ color: "var(--text)" }}>{Math.round(frame?.safety_score ?? 100)}</b>/100
                  <br />
                  {frame?.objects.length ?? 0} tracked · {frame?.objects.filter((o) => o.zone === "CRITICAL").length ?? 0} on track
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <Icon name="radar" /> Tracked objects
            </div>
            {!frame?.objects.length ? (
              <Empty icon={<Icon name="check" />}>Track clear - nothing detected</Empty>
            ) : (
              <div className="objs">
                {frame.objects.map((o) => (
                  <button key={o.track_id} className={`obj ${focus?.track_id === o.track_id ? "on" : ""}`} onClick={() => setSelected(o.track_id)}>
                    <span className="ico">{o.icon}</span>
                    <span className="body">
                      <div className="title">
                        #{o.track_id} {o.label}
                      </div>
                      <div className="meta">
                        {titleCase(o.zone)} · {o.distance_m.toFixed(0)} m · {DIRECTION[o.motion.direction] ?? o.motion.direction}
                      </div>
                      {o.motion.predicted_threat && o.motion.eta_s != null && <span className="eta">⚠ enters track in {o.motion.eta_s.toFixed(1)}s</span>}
                    </span>
                    <Pill level={o.risk.risk_level} score={o.risk.risk_score} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
