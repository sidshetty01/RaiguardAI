import { BookOpen, GraduationCap, Lightbulb, Loader2, Rocket, Save, Settings2, Sigma, Target, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { Settings } from "../api/types";
import { Card, ErrorBox, PageHeader, Spinner, Toggle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { useApi } from "../hooks/useApi";
import { RISK_HEX } from "../lib/format";

const STAGES = [
  ["Video input", "Camera stream, RTSP or uploaded video; zero-hardware synthetic generator for demos"],
  ["YOLOv8 detection", "12+ hazard classes - elephant, cattle, deer, boar, bear, trespasser, vehicle, fallen tree, boulder, rock, landslide, flood, fire"],
  ["Track ROI segmentation", "Perspective polygons split the frame into CRITICAL (rail corridor), WARNING (cess) and SAFE zones using each object's ground-contact point"],
  ["Centroid + IoU tracking", "Persistent object IDs and frame persistence across occlusions and missed detections"],
  ["Pinhole distance", "D = H_real · f / h_px blended with the ground-plane row estimate - metric distance and distance-to-track"],
  ["Motion analysis", "Least-squares trajectory vector, speed and acceleration trend"],
  ["Threat prediction", "Closing speed → predicted track-entry time; PREDICTED THREAT before the hazard breaches the track"],
  ["XAI risk engine", "Weighted, itemised 0-100 score with plain-English justification per factor"],
  ["False-positive suppression", "Zone exposure multiplier and benign-class suppression keep distant / harmless objects SAFE"],
  ["Alert & escalation", "INFO → WARNING → HIGH → CRITICAL with timed escalation to Station Master, Divisional Control and Loco Pilot"],
  ["Section health index", "0-100 per section from hazard density, criticals, forest proximity, response time and terrain"],
  ["Audit & reporting", "Incident database, operator sign-off, audit trail and ReportLab PDF audit reports"],
];

const TEAM = [
  ["Eshan R Poojary", "NNM23AD019", "Computer vision pipeline: YOLOv8 detection, Track ROI segmentation, centroid/IoU tracking"],
  ["N N Prarthana", "NNM23AD030", "Dataset curation, feature extraction, XGBoost / Random Forest / MobileNetV3 classifiers"],
  ["Prathiksha", "NNM23AD037", "Explainable risk scoring engine, motion/threat prediction, alert escalation logic"],
  ["Vishal V Shetty", "NNM23AD070", "FastAPI backend, WebSocket integration, React + TypeScript control-room dashboard"],
];

const LITERATURE = [
  ["He et al. (2021)", "Improved-YOLOv4 for rail-transit obstacle detection with colour-mask ROI", "Validated ROI-based track segmentation + YOLO"],
  ["Zhang et al. (2024)", "YOLOv5 intrusion warning fused with risk assessment", "Shaped the XAI risk-scoring design"],
  ["Karanam et al. (2022)", "Vision-based train-elephant collision prevention (ResNet50 / MobileNet / InceptionV3)", "Transfer learning for animal hazard classes"],
  ["Gayathri et al. (2026)", "WildlifeRailGuard - day/night YOLOv8 on Raspberry Pi edge units", "Template for Jetson edge roadmap"],
  ["Perumal et al. (2022)", "Benchmark of six DNNs on aerial Indian rail images (RODD)", "YOLO family best speed-accuracy trade-off"],
  ["Brintha & Joseph Jawhar (2024)", "FOD-YOLO net: fastener faults & track objects", "Future auxiliary track-condition tasks"],
];

const FUTURE = [
  ["Locomotive Edge AI", "Jetson Orin Nano deployment in locomotive cabs for on-board inference"],
  ["Drone patrol integration", "Autonomous aerial surveillance of remote forest corridors"],
  ["Thermal & LiDAR fusion", "FLIR night-vision wildlife tracking in total darkness and fog"],
  ["Train-to-control link", "5G / LoRaWAN signalling to trigger automated braking orders"],
  ["Bio-acoustic deterrents", "Trackside sound deterrents triggered by predicted elephant crossings"],
  ["Multi-corridor dataset", "Expanded dataset collection and periodic model retraining"],
];

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const live = useLive();
  const { data, error, loading, reload } = useApi<Settings>("/settings");
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const r = await api.put<Settings>("/settings", form);
      setForm(r.data);
      setMsg({ ok: true, text: "Settings saved and applied to the running engine." });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => form && setForm({ ...form, [k]: v });

  return (
    <div className="space-y-5">
      <PageHeader title="Settings & Academic Scope" subtitle="Runtime configuration and the academic presentation of RailGuard AI" icon={GraduationCap} />

      <Card title="Engine settings" icon={Settings2}>
        {loading && !form ? (
          <Spinner />
        ) : error && !form ? (
          <ErrorBox message={error} onRetry={() => reload()} />
        ) : (
          form && (
            <div className="space-y-4">
              {!isAdmin && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200">Only administrators can change engine settings. Alert-chime preference is per browser and always editable.</p>}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div>
                    <div className="text-sm font-medium text-white">Simulation mode</div>
                    <div className="text-xs text-slate-400">Run synthetic camera streams</div>
                  </div>
                  <Toggle checked={form.simulation_enabled} onChange={(v) => set("simulation_enabled", v)} disabled={!isAdmin} label="Simulation" />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div>
                    <div className="text-sm font-medium text-white">Auto scenarios</div>
                    <div className="text-xs text-slate-400">Cameras start hazard scenarios on their own</div>
                  </div>
                  <Toggle checked={form.auto_scenarios} onChange={(v) => set("auto_scenarios", v)} disabled={!isAdmin} label="Auto scenarios" />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div>
                    <div className="text-sm font-medium text-white">Alert chimes</div>
                    <div className="text-xs text-slate-400">Audible alerts in this browser</div>
                  </div>
                  <Toggle checked={live.soundEnabled} onChange={live.setSoundEnabled} label="Alert chimes" />
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <label className="label">Scenario frequency</label>
                  <select className="input" value={form.scenario_frequency} disabled={!isAdmin} onChange={(e) => set("scenario_frequency", e.target.value as Settings["scenario_frequency"])}>
                    <option value="LOW">Low - quiet control room</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High - live demo</option>
                  </select>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <label className="label">Escalate CRITICAL after (s)</label>
                  <input type="number" min={5} max={600} className="input" value={form.escalation_critical_s} disabled={!isAdmin} onChange={(e) => set("escalation_critical_s", Number(e.target.value))} />
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <label className="label">Escalate HIGH after (s)</label>
                  <input type="number" min={5} max={1800} className="input" value={form.escalation_high_s} disabled={!isAdmin} onChange={(e) => set("escalation_high_s", Number(e.target.value))} />
                </div>
              </div>
              {msg && <div className={`rounded-lg p-2 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-200" : "bg-red-500/10 text-red-200"}`}>{msg.text}</div>}
              {isAdmin && (
                <button className="btn-primary" onClick={save} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
                </button>
              )}
            </div>
          )
        )}
      </Card>

      <div className="glass relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Major Project · Department of AI & DS, NMAMIT · 2023-27</div>
        <h2 className="mt-2 max-w-3xl text-2xl font-bold leading-snug text-white">AI-Based Intelligent Framework for Autonomous Railway Track Safety Monitoring in Rural and Forest Areas</h2>
        <p className="mt-2 text-slate-300">See the Risk. Predict the Threat. Protect the Track.</p>
        <p className="mt-3 text-sm text-slate-400">Supervisor: Dr. Navaneeth Bhaskar, Assistant Professor Grade III, AI & DS, NMAMIT</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Problem statement" icon={Lightbulb}>
          <p className="text-sm leading-relaxed text-slate-300">
            Railway corridors through rural and forest terrain face frequent hazards - wild animal crossings (elephants, cattle), fallen trees, landslide boulders and rockfall, and trespassers - that manual track inspection and naive Camera → YOLO → Alert pipelines cannot reliably
            catch. Existing systems produce high false positives for harmless distant objects, ignore spatial track boundaries and object trajectories, and give no explanation for their alerts or early warning before a hazard actually reaches the track.
          </p>
        </Card>
        <Card title="Objectives" icon={Target}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Detect hazards on railway tracks using YOLOv8 and locate them relative to the track using ROI segmentation and object tracking.</li>
            <li>Build an Explainable AI risk-scoring system that shows why a hazard is risky, not just that it is.</li>
            <li>Predict hazards before they reach the track and raise timely, escalating alerts.</li>
            <li>Build a control-room dashboard for operators to view live alerts, track history and reports.</li>
          </ol>
        </Card>
      </div>

      <Card title="Methodology - the 12-stage pipeline" icon={Rocket}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {STAGES.map(([t, d], i) => (
            <div key={t} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/20 font-mono text-xs font-bold text-cyan-200">{i + 1}</span>
                <span className="text-sm font-semibold text-white">{t}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Explainable risk formulation" icon={Sigma}>
        <div className="rounded-xl border border-white/[0.06] bg-ink-900/60 p-4 text-center font-mono text-sm text-slate-100">
          Risk = S<sub>Proximity</sub>(35) + S<sub>Severity</sub>(25) + S<sub>Motion</sub>(15) + S<sub>Persistence</sub>(15) + S<sub>Confidence</sub>(10)
        </div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-5">
          {(
            [
              ["SAFE", "0-20"],
              ["LOW", "21-40"],
              ["MEDIUM", "41-60"],
              ["HIGH", "61-80"],
              ["CRITICAL", "81-100"],
            ] as const
          ).map(([l, r]) => (
            <div key={l} className="rounded-lg border p-2 text-center" style={{ borderColor: `${RISK_HEX[l]}55`, background: `${RISK_HEX[l]}14` }}>
              <div className="font-semibold" style={{ color: RISK_HEX[l] }}>
                {l}
              </div>
              <div className="font-mono text-slate-300">{r}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Severity, persistence and confidence are scaled by zone exposure (1.0 on track, 0.75 warning buffer, 0.25 outside), so harmless distant objects stay SAFE. Example: fallen tree on track = 35 + 23.8 + 8 + 15 + 9.4 = 91 CRITICAL.
        </p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Literature survey" icon={BookOpen} bodyClass="p-0">
          <table className="w-full">
            <tbody>
              {LITERATURE.map(([a, m, r]) => (
                <tr key={a} className="border-b border-white/[0.04] align-top">
                  <td className="td whitespace-nowrap text-xs font-semibold text-slate-200">{a}</td>
                  <td className="td text-xs text-slate-400">{m}</td>
                  <td className="td text-xs text-cyan-200">{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Team & contributions" icon={Users} bodyClass="space-y-2 p-3">
          {TEAM.map(([n, u, c]) => (
            <div key={u} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{n}</span>
                <span className="font-mono text-[11px] text-slate-500">{u}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{c}</p>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Future scope" icon={Rocket}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {FUTURE.map(([t, d]) => (
            <div key={t} className="rounded-xl border border-violet-400/15 bg-violet-500/[0.05] p-3">
              <div className="text-sm font-semibold text-violet-100">{t}</div>
              <p className="mt-1 text-xs text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
