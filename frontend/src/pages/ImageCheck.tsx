import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { CameraGeom, RiskLevel, Roi, SceneObject } from "../api/types";
import { Empty, FactorBars, Gauge, Hud, PageHead, Pill } from "../components/bits";
import Icon from "../components/Icon";
import SceneCanvas from "../components/SceneCanvas";
import { RISK_HEX, titleCase } from "../lib/format";

interface Result {
  width: number;
  height: number;
  camera: CameraGeom;
  roi: Roi;
  objects: SceneObject[];
  max_risk: number;
  level: RiskLevel;
  safety_score: number;
  detect_ms: number;
  reasoning_ms: number;
  detector: string;
}

const VERDICT: Record<RiskLevel, string> = {
  SAFE: "Track looks clear",
  LOW: "Minor hazard nearby",
  MEDIUM: "Hazard near the track",
  HIGH: "Hazard close to the track",
  CRITICAL: "Track obstructed",
};

export default function ImageCheck() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [showRoi, setShowRoi] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const analyze = async (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    setSelected(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api.post<Result>("/analyze/image", fd);
      setResult(r.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void analyze(f);
  };

  const dropProps = {
    onClick: () => inputRef.current?.click(),
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      pick(e.dataTransfer.files);
    },
  };

  const focus = result?.objects.find((o) => o.track_id === selected) ?? result?.objects[0];
  const hasFile = !!file;

  return (
    <div className="page">
      <PageHead eyebrow="Single-frame analysis" title="Image Check" sub="Upload a photo of a railway track. RailGuard detects hazards, places them in the track danger zones and explains every point of the risk score." />
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />

      {!hasFile && (
        <div className={`drop ${over ? "over" : ""}`} {...dropProps}>
          <div className="orb">
            <Icon name="upload" />
          </div>
          <h3>Drop a track photo here</h3>
          <p>or click to browse · JPG, PNG or WEBP up to 25 MB</p>
          <div className="row small dim" style={{ marginTop: 22, justifyContent: "center", gap: 18 }}>
            <span>🐘 Elephants</span>
            <span>🐄 Cattle</span>
            <span>🚶 Trespassers</span>
            <span>🚙 Vehicles</span>
          </div>
        </div>
      )}

      {hasFile && (
        <>
          <div className={`drop compact ${over ? "over" : ""}`} {...dropProps} style={{ marginBottom: 18 }}>
            <div className="orb">
              <Icon name="upload" />
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{file.name}</div>
              <div className="small muted">{busy ? "Running YOLOv8 and the risk engine..." : "Click or drop another image to check it"}</div>
            </div>
          </div>

          {error && (
            <div className="msg error">
              <Icon name="alert" style={{ width: 18, height: 18 }} /> {error}
            </div>
          )}

          <div className="split">
            <div className="panel" style={{ padding: 14 }}>
              <Hud
                scanning={busy}
                alarm={result?.level === "CRITICAL"}
                tags={
                  <>
                    <span className="tag tl-tag">
                      <span className="rec" style={{ background: busy ? "#2fd9f4" : undefined }} /> {busy ? "SCANNING" : "ANALYSED"}
                    </span>
                    {result && <span className="tag tr-tag">{result.width}×{result.height} · {result.detect_ms} ms</span>}
                  </>
                }
              >
                {result ? (
                  <SceneCanvas scene={{ camera: result.camera, roi: result.roi, objects: result.objects }} image={preview} showRoi={showRoi} focusTrackId={focus?.track_id} animate={false} />
                ) : (
                  preview && <img src={preview} alt="" style={{ opacity: 0.75 }} />
                )}
              </Hud>
              <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
                <label className="check">
                  <input type="checkbox" checked={showRoi} onChange={(e) => setShowRoi(e.target.checked)} /> Track danger zones
                </label>
                <span className="small dim">Red = on track · yellow = warning buffer · assumes a camera looking down the track</span>
              </div>
            </div>

            <div>
              <div className="panel">
                {busy || !result ? (
                  <div>
                    <div className="skeleton" style={{ height: 100, marginBottom: 12 }} />
                    <div className="skeleton" style={{ height: 14, width: "60%" }} />
                  </div>
                ) : (
                  <div className="verdict">
                    <Gauge score={result.max_risk} level={result.level} size={150} />
                    <div>
                      <div className="lvl" style={{ color: RISK_HEX[result.level] }}>
                        {result.level}
                      </div>
                      <div style={{ marginTop: 6, fontWeight: 600 }}>{VERDICT[result.level]}</div>
                      <div className="meta">
                        Safety score <b style={{ color: "var(--text)" }}>{Math.round(result.safety_score)}</b>/100 · {result.objects.length} object{result.objects.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {result && (
                <div className="panel">
                  <div className="panel-title">
                    <Icon name="radar" /> Detected objects
                  </div>
                  {result.objects.length === 0 ? (
                    <Empty icon={<Icon name="check" />}>No hazards detected - the track looks clear.</Empty>
                  ) : (
                    <div className="objs">
                      {result.objects.map((o) => (
                        <button key={o.track_id} className={`obj ${focus?.track_id === o.track_id ? "on" : ""}`} onClick={() => setSelected(o.track_id)}>
                          <span className="ico">{o.icon}</span>
                          <span className="body">
                            <div className="title">
                              #{o.track_id} {o.label}
                            </div>
                            <div className="meta">
                              {titleCase(o.zone)} zone · {o.distance_m.toFixed(0)} m · {Math.round(o.confidence * 100)}% sure
                            </div>
                          </span>
                          <Pill level={o.risk.risk_level} score={o.risk.risk_score} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {focus && result && (
            <div className="panel">
              <div className="panel-title">
                <Icon name="brain" /> Why #{focus.track_id} {focus.label} scored {Math.round(focus.risk.risk_score)}
                <span className="sub">{focus.risk.summary_reason}</span>
              </div>
              <FactorBars key={focus.track_id} factors={focus.risk.contributing_factors} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
