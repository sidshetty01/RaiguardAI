import { ArrowLeft, Camera, CheckCircle2, ClipboardSignature, FileDown, Loader2, MapPin, Navigation, ShieldAlert, Siren, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadFile, errorMessage } from "../api/client";
import type { IncidentDetail as Detail, Report } from "../api/types";
import SceneCanvas from "../components/SceneCanvas";
import XaiBreakdown from "../components/XaiBreakdown";
import { Card, ErrorBox, RiskBadge, Spinner, StatusBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { ALERT_HEX, fmtDateTime, titleCase } from "../lib/format";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/[0.04] py-1.5 text-sm last:border-0">
      <span className="text-slate-400">{k}</span>
      <span className="text-right text-slate-100">{v}</span>
    </div>
  );
}

export default function IncidentDetail() {
  const { id } = useParams();
  const { canOperate } = useAuth();
  const { data: inc, error, loading, reload, setData } = useApi<Detail>(`/incidents/${id}`);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const hasImage = inc?.has_image;
  const incId = inc?.id;

  useEffect(() => {
    if (!hasImage || !incId) return;
    let url: string | null = null;
    api
      .get(`/incidents/${incId}/snapshot`, { responseType: "blob" })
      .then((r) => {
        url = URL.createObjectURL(r.data);
        setImageUrl(url);
      })
      .catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasImage, incId]);

  if (loading && !inc) return <Spinner />;
  if (error || !inc) return <ErrorBox message={error ?? "Not found"} onRetry={() => reload()} />;

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const ack = () =>
    act("ack", async () => {
      await api.patch(`/incidents/${inc.id}`, { status: "ACKNOWLEDGED" });
      await reload(true);
    });
  const signOff = (resolution: "RESOLVED" | "FALSE_ALARM") =>
    act(resolution, async () => {
      const r = await api.post<Detail>(`/incidents/${inc.id}/signoff`, { notes: notes || undefined, resolution });
      setData({ ...inc, ...r.data });
      setNotes("");
    });
  const saveNotes = () =>
    act("notes", async () => {
      await api.patch(`/incidents/${inc.id}`, { operator_notes: notes });
      setNotes("");
      await reload(true);
    });
  const pdf = () =>
    act("pdf", async () => {
      const r = await api.post<Report>(`/reports/incident/${inc.id}`);
      await downloadFile(`/reports/${r.data.id}/download`, `${inc.code}.pdf`);
    });

  const closed = ["RESOLVED", "FALSE_ALARM"].includes(inc.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/incidents" className="btn-ghost p-2">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-bold text-white">{inc.code}</h1>
            <RiskBadge level={inc.risk_level} score={inc.risk_score} />
            <StatusBadge status={inc.status} />
            {inc.predicted_threat && (
              <span className="flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-300">
                <Zap className="h-3 w-3" /> PREDICTED THREAT
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">
            {inc.hazard_icon} {inc.hazard_label} · {inc.camera_name} · {inc.section_name} · {fmtDateTime(inc.detected_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canOperate && inc.status === "OPEN" && (
            <button className="btn-ghost" onClick={ack} disabled={!!busy}>
              {busy === "ack" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Acknowledge
            </button>
          )}
          <button className="btn-primary" onClick={pdf} disabled={!!busy || !canOperate} title={canOperate ? "" : "Operator role required"}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF audit report
          </button>
        </div>
      </div>
      {err && <ErrorBox message={err} />}

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Card title="Evidence Snapshot (peak risk frame)" icon={Camera} bodyClass="p-3">
            {inc.snapshot ? (
              <SceneCanvas scene={{ ...inc.snapshot, seed: inc.camera_id }} image={imageUrl} focusTrackId={inc.snapshot.focus_track_id} />
            ) : (
              <div className="py-16 text-center text-sm text-slate-500">No snapshot stored</div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {inc.has_image ? "Original video frame with AI overlays." : "Reconstructed from stored detections: bounding boxes, track ROI zones and motion vectors at the moment of peak risk."}
            </p>
          </Card>

          <Card title="Summary Reason" icon={ShieldAlert}>
            <p className="text-sm leading-relaxed text-slate-200">{inc.summary_reason}</p>
          </Card>

          <Card title="Alert & Escalation Timeline" icon={Siren}>
            {inc.alerts.length === 0 && <p className="text-sm text-slate-500">No alerts were raised for this incident.</p>}
            <ol className="relative space-y-4 border-l border-white/10 pl-5">
              {inc.alerts.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-ink-900" style={{ background: ALERT_HEX[a.level] }} />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-white">{a.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {fmtDateTime(a.created_at)} · Stage {a.escalation_stage} → {a.escalated_to}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{a.acknowledged ? `Acknowledged by ${a.acknowledged_by} at ${fmtDateTime(a.acknowledged_at)}` : "Not acknowledged"}</div>
                </li>
              ))}
              <li className="relative">
                <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-ink-900 ${closed ? "bg-emerald-400" : "bg-slate-600"}`} />
                <div className="text-sm font-semibold text-white">{closed ? `Signed off - ${titleCase(inc.status)}` : "Awaiting operator sign-off"}</div>
                {inc.signed_off_by && (
                  <div className="text-xs text-slate-400">
                    {inc.signed_off_by} · {fmtDateTime(inc.signed_off_at)}
                  </div>
                )}
              </li>
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Explainable Risk (XAI)" icon={ShieldAlert}>
            <XaiBreakdown factors={inc.factors} score={inc.risk_score} level={inc.risk_level} />
          </Card>

          <Card title="Spatial & Temporal Analysis" icon={Navigation}>
            <Row k="Danger zone" v={<span className={inc.zone === "CRITICAL" ? "text-red-300" : inc.zone === "WARNING" ? "text-yellow-300" : "text-emerald-300"}>{inc.zone}</span>} />
            <Row k="Distance ahead (pinhole)" v={`${inc.distance_m.toFixed(1)} m`} />
            <Row k="Distance to track edge" v={`${inc.edge_distance_m.toFixed(1)} m`} />
            <Row k="Motion" v={titleCase(inc.motion_direction)} />
            <Row k="Speed" v={`${inc.speed_mps.toFixed(2)} m/s`} />
            <Row k="Predicted entry" v={inc.predicted_entry_s != null ? `${inc.predicted_entry_s.toFixed(1)} s` : "-"} />
            <Row k="Frames persisted" v={inc.frames_persisted} />
            <Row k="AI confidence" v={`${(inc.confidence * 100).toFixed(1)}%`} />
            <Row k="Response time" v={inc.response_time_s != null ? `${Math.round(inc.response_time_s)} s` : "-"} />
          </Card>

          <Card title="Location" icon={MapPin}>
            <Row k="Camera" v={`${inc.camera_id} · ${inc.camera_name}`} />
            <Row k="Section" v={inc.section_name} />
            <Row k="Km marker" v={inc.km_marker ?? "-"} />
            <Row k="Coordinates" v={inc.lat != null ? `${inc.lat.toFixed(4)}, ${inc.lng?.toFixed(4)}` : "-"} />
          </Card>

          <Card title="Operator Notes & Sign-off" icon={ClipboardSignature}>
            <pre className="mb-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-900/60 p-2.5 font-sans text-xs text-slate-300">{inc.operator_notes || "No notes yet."}</pre>
            {canOperate ? (
              <>
                <textarea className="input min-h-[80px]" placeholder="Action taken, e.g. 'Loco pilot cautioned, forest dept informed, herd moved off line'" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-ghost py-1.5 text-xs" disabled={!notes || !!busy} onClick={saveNotes}>
                    Save note
                  </button>
                  <button className="btn-primary py-1.5 text-xs" disabled={!!busy} onClick={() => signOff("RESOLVED")}>
                    {busy === "RESOLVED" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sign off · Resolved
                  </button>
                  <button className="btn-ghost py-1.5 text-xs" disabled={!!busy} onClick={() => signOff("FALSE_ALARM")}>
                    False alarm
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">Viewer role - sign-off requires an operator.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
