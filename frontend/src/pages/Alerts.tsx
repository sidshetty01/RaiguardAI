import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Alert } from "../api/types";
import { Empty, PageHead } from "../components/bits";
import Icon from "../components/Icon";
import { useApi } from "../hooks/useApi";
import { ALERT_HEX, timeAgo } from "../lib/format";

const LADDER = ["Control Room Operator", "Station Master", "Divisional Safety Control", "Loco Pilot - Stop Order"];

export default function Alerts() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const { data, error, reload } = useApi<Alert[]>("/alerts", { acknowledged: onlyOpen ? false : undefined, limit: 80 }, 4000);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(25);

  const call = async (url: string) => {
    try {
      await api.post(url);
      await reload(true);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const counts = (data ?? []).reduce<Record<string, number>>((m, a) => ((m[a.level] = (m[a.level] ?? 0) + 1), m), {});

  return (
    <div className="page">
      <PageHead
        eyebrow="Notification centre"
        title="Alerts"
        sub="Raised the moment a hazard becomes risky - or before, when it is predicted to enter the track. Unacknowledged critical alerts climb the escalation ladder."
        actions={
          <button className="btn primary" onClick={() => call("/alerts/ack-all")}>
            <Icon name="check" /> Acknowledge all
          </button>
        }
      />

      <div className="panel">
        <div className="ladder">
          {LADDER.map((s, i) => (
            <span key={s} style={{ display: "contents" }}>
              <span className="step">
                <b>STAGE {i + 1}</b>
                {s}
              </span>
              {i < LADDER.length - 1 && <span className="arrow">→</span>}
            </span>
          ))}
          <span style={{ marginLeft: "auto" }} />
          {(["CRITICAL", "HIGH", "WARNING"] as const).map((l) => (
            <span key={l} className="pill" style={{ color: ALERT_HEX[l], borderColor: `${ALERT_HEX[l]}55`, background: `${ALERT_HEX[l]}1a` }}>
              {l} <span className="mono">{counts[l] ?? 0}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <label className="check">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only unacknowledged
        </label>
      </div>

      {(error || err) && <div className="msg error">{error || err}</div>}

      {data?.length === 0 && (
        <div className="panel">
          <Empty icon={<Icon name="check" />}>All clear - no alerts waiting.</Empty>
        </div>
      )}

      {data?.slice(0, shown).map((a, i) => {
        const c = ALERT_HEX[a.level];
        return (
          <div key={a.id} className={`alert-card ${a.acknowledged ? "done" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
            <span className="bar" style={{ background: c, boxShadow: `0 0 16px ${c}` }} />
            <span className="glow" style={{ background: c }} />
            <span className="ico" style={{ background: `${c}1f`, color: c }}>
              <Icon name={a.predicted ? "zap" : a.kind === "ESCALATED" ? "layers" : "alert"} />
            </span>
            <div className="main">
              <div className="title">{a.title}</div>
              <div className="meta">
                <span className="mono">{a.camera_id}</span>
                <span>→ {a.escalated_to}</span>
                <span>{timeAgo(a.created_at)}</span>
                {a.incident_id && <Link to={`/incidents/${a.incident_id}`}>{a.incident_code}</Link>}
              </div>
            </div>
            {a.acknowledged ? (
              <span className="small muted row" style={{ gap: 6 }}>
                <Icon name="check" style={{ width: 15, height: 15 }} /> Acknowledged
              </span>
            ) : (
              <button className="btn sm" onClick={() => call(`/alerts/${a.id}/ack`)}>
                Acknowledge
              </button>
            )}
          </div>
        );
      })}

      {data && data.length > shown && (
        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
          <button className="btn" onClick={() => setShown(shown + 25)}>
            Show more ({data.length - shown} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
