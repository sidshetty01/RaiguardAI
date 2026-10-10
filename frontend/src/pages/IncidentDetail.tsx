import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadFile, errorMessage } from "../api/client";
import type { IncidentDetail as Detail, Report } from "../api/types";
import { FactorBars, Gauge, Hud, Pill, Status } from "../components/bits";
import Icon from "../components/Icon";
import SceneCanvas from "../components/SceneCanvas";
import { useApi } from "../hooks/useApi";
import { ALERT_HEX, RISK_HEX, fmtDateTime, titleCase } from "../lib/format";

export default function IncidentDetail() {
  const { id } = useParams();
  const { data: inc, error, reload } = useApi<Detail>(`/incidents/${id}`);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const hasImage = inc?.has_image;
  const incId = inc?.id;

  useEffect(() => {
    if (!hasImage || !incId) return;
    let url: string | null = null;
    api
      .get(`/incidents/${incId}/snapshot`, { responseType: "blob" })
      .then((r) => setImageUrl((url = URL.createObjectURL(r.data))))
      .catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasImage, incId]);

  if (error)
    return (
      <div className="page">
        <div className="msg error">{error}</div>
      </div>
    );
  if (!inc)
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 420, marginTop: 30 }} />
      </div>
    );

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const close = (resolution: "RESOLVED" | "FALSE_ALARM") =>
    act(async () => {
      await api.post(`/incidents/${inc.id}/signoff`, { notes: notes || undefined, resolution });
      setNotes("");
      await reload(true);
    });
  const pdf = () =>
    act(async () => {
      const r = await api.post<Report>(`/reports/incident/${inc.id}`);
      await downloadFile(`/reports/${r.data.id}/download`, `${inc.code}.pdf`);
    });

  const facts: [string, string][] = [
    ["Detected", fmtDateTime(inc.detected_at)],
    ["Camera", `${inc.camera_id} · ${inc.camera_name}`],
    ["Section", inc.section_name],
    ["Danger zone", titleCase(inc.zone)],
    ["Distance ahead", `${inc.distance_m.toFixed(1)} m`],
    ["Distance to track", `${inc.edge_distance_m.toFixed(1)} m`],
    ["Motion", titleCase(inc.motion_direction)],
    ["Predicted entry", inc.predicted_entry_s != null ? `${inc.predicted_entry_s.toFixed(1)} s` : "-"],
    ["AI confidence", `${(inc.confidence * 100).toFixed(0)}%`],
    ["Response time", inc.response_time_s != null ? `${Math.round(inc.response_time_s)} s` : "-"],
  ];
  const closed = ["RESOLVED", "FALSE_ALARM"].includes(inc.status);

  return (
    <div className="page">
      <Link to="/incidents" className="btn sm" style={{ marginTop: 14 }}>
        <Icon name="back" /> All incidents
      </Link>

      <div className="panel" style={{ marginTop: 16, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -80, top: -80, width: 260, height: 260, borderRadius: "50%", background: RISK_HEX[inc.risk_level], filter: "blur(90px)", opacity: 0.22 }} />
        <Gauge score={inc.risk_score} level={inc.risk_level} size={160} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="row">
            <span className="code muted">{inc.code}</span>
            <Pill level={inc.risk_level} />
            <Status value={inc.status} />
          </div>
          <h1 style={{ fontSize: 32, marginTop: 8 }}>
            {inc.hazard_icon} {inc.hazard_label}
          </h1>
          <p className="muted" style={{ margin: "6px 0 0", maxWidth: 640 }}>
            {inc.summary_reason}
          </p>
        </div>
        <button className="btn primary" onClick={pdf} disabled={busy}>
          <Icon name="download" /> PDF report
        </button>
      </div>

      {err && <div className="msg error">{err}</div>}

      <div className="split">
        <div className="panel" style={{ padding: 14 }}>
          <Hud
            alarm={inc.risk_level === "CRITICAL" && !closed}
            tags={
              <span className="tag tl-tag">
                <span className="rec" /> EVIDENCE · PEAK RISK FRAME
              </span>
            }
          >
            {inc.snapshot ? <SceneCanvas scene={{ ...inc.snapshot, seed: inc.camera_id }} image={imageUrl} focusTrackId={inc.snapshot.focus_track_id} animate={false} /> : <div className="empty">No snapshot stored</div>}
          </Hud>
        </div>
        <div className="panel">
          <div className="panel-title">
            <Icon name="pin" /> Details
          </div>
          <div className="kv">
            {facts.map(([k, v]) => [<div key={`k${k}`}>{k}</div>, <div key={`v${k}`}>{v}</div>])}
          </div>
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-title">
            <Icon name="brain" /> Explainable risk breakdown
          </div>
          <FactorBars factors={inc.factors} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <Icon name="bell" /> Alert trail
          </div>
          <div className="timeline">
            {inc.alerts.map((a) => (
              <div className="tl-item" key={a.id}>
                <span className="node" style={{ background: ALERT_HEX[a.level], boxShadow: `0 0 12px ${ALERT_HEX[a.level]}` }} />
                <div className="t">{a.title}</div>
                <div className="s">
                  {fmtDateTime(a.created_at)} · to {a.escalated_to} · {a.acknowledged ? "acknowledged" : "pending"}
                </div>
              </div>
            ))}
            <div className="tl-item">
              <span className="node" style={{ background: closed ? "#22c55e" : "#334155" }} />
              <div className="t">{closed ? `Closed · ${titleCase(inc.status)}` : "Awaiting sign-off"}</div>
              {inc.signed_off_by && (
                <div className="s">
                  {inc.signed_off_by} · {fmtDateTime(inc.signed_off_at)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <Icon name="doc" /> Operator notes
        </div>
        {inc.operator_notes && <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{inc.operator_notes}</p>}
        <textarea placeholder="What action was taken? e.g. loco pilot cautioned, forest department informed, herd moved off the line" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy} onClick={() => close("RESOLVED")}>
            <Icon name="check" /> Mark resolved
          </button>
          <button className="btn" disabled={busy} onClick={() => close("FALSE_ALARM")}>
            False alarm
          </button>
        </div>
      </div>
    </div>
  );
}
