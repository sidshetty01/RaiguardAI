import { Database, FolderTree, Images, Layers, Sparkles, Tags } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, ErrorBox, PageHeader, Spinner, StatCard, axisProps, chartTooltip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { CAT } from "../lib/format";

interface DatasetInfo {
  detector_dataset: {
    name: string;
    source: string;
    images: number;
    instances: number;
    splits: { train: number; val: number; test: number };
    classes: { cls: string; label: string; instances: number; train: number; val: number; test: number }[];
    augmentations: string[];
  };
  classifier_dataset: { name: string; path: string; scanned_from_disk: boolean; images: number; classes: { cls: string; images: number }[] };
}

export default function DatasetPage() {
  const { data, error, loading, reload } = useApi<DatasetInfo>("/dataset");
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;
  const det = data.detector_dataset;
  const cls = data.classifier_dataset;

  return (
    <div className="space-y-5">
      <PageHeader title="Dataset Management" subtitle="Annotated training data for the YOLOv8 hazard detector and the 5-class hazard classifier" icon={Database} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Detector images" value={det.images.toLocaleString()} icon={Images} tone="cyan" sub="YOLO format" />
        <StatCard label="Annotated instances" value={det.instances.toLocaleString()} icon={Tags} tone="blue" sub={`${det.classes.length} hazard classes`} />
        <StatCard label="Split" value={`${det.splits.train * 100}/${det.splits.val * 100}/${det.splits.test * 100}`} icon={Layers} tone="violet" sub="train / val / test %" />
        <StatCard label="Classifier images" value={cls.images} icon={FolderTree} tone="green" sub={cls.scanned_from_disk ? "scanned from datasets/" : "documented counts"} />
      </div>

      <Card title={det.name}>
        <p className="mb-3 text-xs text-slate-400">Source: {det.source}</p>
        <div className="mb-2 flex gap-3 text-[11px] text-slate-400">
          {["Train", "Validation", "Test"].map((l, i) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAT[i] }} /> {l}
            </span>
          ))}
        </div>
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={det.classes}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis {...axisProps} width={40} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="train" name="Train" stackId="s" fill={CAT[0]} stroke="#0a1220" strokeWidth={1} />
              <Bar dataKey="val" name="Validation" stackId="s" fill={CAT[1]} stroke="#0a1220" strokeWidth={1} />
              <Bar dataKey="test" name="Test" stackId="s" fill={CAT[2]} radius={[4, 4, 0, 0]} stroke="#0a1220" strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={cls.name}>
          <p className="mb-3 font-mono text-xs text-slate-500">{cls.path}</p>
          <div className="space-y-2.5">
            {cls.classes.map((c) => (
              <div key={c.cls}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-200">{c.cls}</span>
                  <span className="font-mono text-slate-300">{c.images} images</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${(c.images / Math.max(...cls.classes.map((x) => x.images))) * 100}%`, background: CAT[0] }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Place class folders under <code className="text-slate-300">datasets/hazard_cls/</code> and this view counts them automatically; train with <code className="text-slate-300">python ml/train_classifiers.py</code>.</p>
        </Card>
        <Card title="Augmentation pipeline" icon={Sparkles}>
          <div className="flex flex-wrap gap-2">
            {det.augmentations.map((a) => (
              <span key={a} className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1.5 text-sm text-cyan-100">
                {a}
              </span>
            ))}
          </div>
          <div className="mt-5 space-y-2 text-sm text-slate-300">
            <p>
              <b className="text-white">Annotation format:</b> YOLO txt (class cx cy w h, normalised), one file per image.
            </p>
            <p>
              <b className="text-white">Class balance:</b> rare classes (bear, fire/smoke, landslide) oversampled ×2 during training.
            </p>
            <p>
              <b className="text-white">Retraining:</b> <code className="text-slate-300">python ml/train_yolov8.py --data ml/data.yaml</code> writes fresh metrics to the Model Performance page.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
