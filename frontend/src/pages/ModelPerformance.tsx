import { BrainCircuit, CheckCircle2, Crosshair, Gauge, Info, Target, Timer, XCircle } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, ErrorBox, PageHeader, RiskBadge, Spinner, StatCard, axisProps, chartTooltip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { CAT, seqColor } from "../lib/format";

interface Metrics {
  source: string;
  detector: {
    model: string;
    input_size: number;
    epochs: number;
    classes: number;
    precision: number;
    recall: number;
    map50: number;
    map50_95: number;
    latency_ms: number;
    params_m: number;
    gflops: number;
    per_class: { cls: string; label: string; instances: number; precision: number; recall: number; ap50: number; ap50_95: number }[];
    pr_curve: { recall: number; precision: number }[];
    f1_curve: { confidence: number; f1: number }[];
    confusion_matrix: { labels: string[]; matrix: number[][] };
    training_curve: { epoch: number; box_loss: number; cls_loss: number; map50: number }[];
  };
  classifiers: { dataset: string; results: { model: string; accuracy: number; precision: number; recall: number }[] };
  risk_policy_checks: { case: string; expected: string; risk_score: number; observed_level: string; safety_score: number; passed: boolean }[];
  live: { pipeline_latency_ms: number; avg_fps: number; detector: { weights: string; loaded: boolean; device: string; error: string | null; last_latency_ms: number } };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function ModelPerformance() {
  const { data, error, loading, reload } = useApi<Metrics>("/model/performance", undefined, 15000);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;
  const d = data.detector;
  const cm = d.confusion_matrix;
  const clsData = data.classifiers.results.map((r) => ({ ...r, short: r.model.split(" (")[0] }));

  return (
    <div className="space-y-5">
      <PageHeader title="Model Performance" subtitle={`${d.model} · ${d.classes} hazard classes · ${d.input_size}px input · ${d.epochs} epochs`} icon={BrainCircuit} />
      <div className="glass flex items-start gap-3 p-3 text-xs text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
        <span>
          {data.source} Live pipeline: {data.live.pipeline_latency_ms.toFixed(2)} ms spatial-temporal reasoning per frame at {data.live.avg_fps} FPS · detector{" "}
          {data.live.detector.loaded ? `${data.live.detector.weights} loaded on ${data.live.detector.device} (${data.live.detector.last_latency_ms} ms last inference)` : "loads on first video upload"}.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Precision" value={pct(d.precision)} icon={Crosshair} tone="cyan" sub="all classes" />
        <StatCard label="Recall" value={pct(d.recall)} icon={Target} tone="blue" sub="all classes" />
        <StatCard label="mAP@50" value={pct(d.map50)} icon={Gauge} tone="green" sub="IoU 0.50" />
        <StatCard label="mAP@50-95" value={pct(d.map50_95)} icon={Gauge} tone="violet" sub="COCO-style" />
        <StatCard label="Latency" value={`${d.latency_ms} ms`} icon={Timer} tone="amber" sub={`${d.params_m}M params · ${d.gflops} GFLOPs`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Precision-Recall curve (all classes)">
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={d.pr_curve}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="recall" type="number" domain={[0, 1]} {...axisProps} label={{ value: "Recall", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }} />
                <YAxis domain={[0, 1]} {...axisProps} width={35} />
                <Tooltip {...chartTooltip} formatter={(v: number) => v.toFixed(3)} labelFormatter={(l) => `Recall ${Number(l).toFixed(2)}`} />
                <Area type="monotone" dataKey="precision" name="Precision" stroke={CAT[0]} fill={CAT[0]} fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-xs text-slate-400">Area under curve = mAP@50 {pct(d.map50)}</p>
        </Card>
        <Card title="F1-Confidence curve">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={d.f1_curve}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="confidence" type="number" domain={[0, 1]} {...axisProps} />
                <YAxis domain={[0, 1]} {...axisProps} width={35} />
                <Tooltip {...chartTooltip} formatter={(v: number) => v.toFixed(3)} labelFormatter={(l) => `Confidence ${Number(l).toFixed(2)}`} />
                <Line type="monotone" dataKey="f1" name="F1" stroke={CAT[2]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-xs text-slate-400">Deployed confidence threshold 0.35 sits near the F1 plateau</p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Normalised confusion matrix (rows = true class)">
          <div className="overflow-x-auto">
            <table className="border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th />
                  {cm.labels.map((l) => (
                    <th key={l} className="h-24 w-8 align-bottom">
                      <div className="w-6 origin-bottom-left translate-x-4 -rotate-60 whitespace-nowrap text-[10px] font-normal text-slate-400" style={{ transform: "rotate(-60deg)" }}>
                        {l}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cm.matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap pr-2 text-right text-[11px] text-slate-300">{cm.labels[i]}</td>
                    {row.map((v, j) => (
                      <td key={j} title={`true ${cm.labels[i]} → predicted ${cm.labels[j]}: ${(v * 100).toFixed(1)}%`} className="h-8 w-8 rounded-[3px] text-center font-mono text-[9px]" style={{ background: v > 0.005 ? seqColor(Math.sqrt(v)) : "rgba(255,255,255,0.03)", color: Math.sqrt(v) > 0.55 ? "#0a1220" : "#cbd5e1" }}>
                        {v >= 0.01 ? Math.round(v * 100) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Per-class AP@50" bodyClass="p-0">
          <div className="max-h-[460px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-ink-900">
                <tr>
                  <th className="th">Class</th>
                  <th className="th text-right">Inst.</th>
                  <th className="th text-right">P</th>
                  <th className="th text-right">R</th>
                  <th className="th">AP@50</th>
                </tr>
              </thead>
              <tbody>
                {d.per_class.map((c) => (
                  <tr key={c.cls} className="border-t border-white/[0.04]">
                    <td className="td text-xs">{c.label}</td>
                    <td className="td text-right font-mono text-xs text-slate-400">{c.instances}</td>
                    <td className="td text-right font-mono text-xs">{(c.precision * 100).toFixed(1)}</td>
                    <td className="td text-right font-mono text-xs">{(c.recall * 100).toFixed(1)}</td>
                    <td className="td w-36">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full" style={{ width: `${c.ap50 * 100}%`, background: CAT[0] }} />
                        </div>
                        <span className="font-mono text-xs">{(c.ap50 * 100).toFixed(1)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Training losses">
          <div className="mb-2 flex gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: CAT[0] }} /> Box loss
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: CAT[1] }} /> Class loss
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={d.training_curve}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="epoch" {...axisProps} />
                <YAxis {...axisProps} width={35} />
                <Tooltip {...chartTooltip} labelFormatter={(l) => `Epoch ${l}`} />
                <Line type="monotone" dataKey="box_loss" name="Box loss" stroke={CAT[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cls_loss" name="Class loss" stroke={CAT[1]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Validation mAP@50 by epoch">
          <div className="h-[248px]">
            <ResponsiveContainer>
              <AreaChart data={d.training_curve}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="epoch" {...axisProps} />
                <YAxis domain={[0, 1]} {...axisProps} width={35} />
                <Tooltip {...chartTooltip} labelFormatter={(l) => `Epoch ${l}`} />
                <Area type="monotone" dataKey="map50" name="mAP@50" stroke={CAT[2]} fill={CAT[2]} fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Hazard classifier comparison">
          <p className="mb-2 text-xs text-slate-400">{data.classifiers.dataset}</p>
          <div className="mb-2 flex gap-3 text-[11px] text-slate-400">
            {["Accuracy", "Precision", "Recall"].map((l, i) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAT[i] }} /> {l}
              </span>
            ))}
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={clsData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="short" {...axisProps} />
                <YAxis domain={[0, 1]} {...axisProps} width={35} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip {...chartTooltip} formatter={(v: number) => pct(v)} />
                <Bar dataKey="accuracy" name="Accuracy" fill={CAT[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="precision" name="Precision" fill={CAT[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="recall" name="Recall" fill={CAT[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-400">Deep transfer-learning features (MobileNetV3) clearly outperform handcrafted-feature baselines at this dataset scale.</p>
        </Card>
        <Card title="Track-obstacle policy verification (live risk engine)" bodyClass="p-0">
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr>
                <th className="th">Scenario</th>
                <th className="th">Expected</th>
                <th className="th">Observed</th>
                <th className="th text-right">Safety</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data.risk_policy_checks.map((c) => (
                <tr key={c.case} className="border-b border-white/[0.04]">
                  <td className="td text-xs">{c.case}</td>
                  <td className="td text-xs text-slate-400">{c.expected}</td>
                  <td className="td">
                    <RiskBadge level={c.observed_level} score={c.risk_score} />
                  </td>
                  <td className="td text-right font-mono text-xs">{Math.round(c.safety_score)}/100</td>
                  <td className="td">{c.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-[11px] text-slate-500">Computed on every page load by running the production RiskEngine on canonical inputs - not hard-coded.</p>
        </Card>
      </div>
    </div>
  );
}
