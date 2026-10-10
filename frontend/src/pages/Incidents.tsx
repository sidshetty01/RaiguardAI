import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Incident, Paged } from "../api/types";
import { Empty, PageHead, Pill, Status } from "../components/bits";
import Icon from "../components/Icon";
import { useApi } from "../hooks/useApi";
import { RISK_HEX, fmtDateTime, timeAgo, titleCase } from "../lib/format";

const PAGE = 20;
const LEVELS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES = ["", "OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_ALARM", "AUTO_CLEARED"];

export default function Incidents() {
  const nav = useNavigate();
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, error } = useApi<Paged<Incident>>("/incidents", { level: level || undefined, status: status || undefined, page, page_size: PAGE }, 8000);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <div className="page">
      <PageHead eyebrow="Incident log" title="Incidents" sub={data ? `${data.total.toLocaleString()} hazards caught by the system. Click any row for evidence, risk breakdown and the alert trail.` : "Loading..."} />

      <div className="panel row" style={{ justifyContent: "space-between" }}>
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              key={l || "all"}
              className={`chip ${level === l ? "on" : ""}`}
              onClick={() => (setLevel(l), setPage(1))}
              style={level === l && l ? { background: RISK_HEX[l as keyof typeof RISK_HEX], borderColor: RISK_HEX[l as keyof typeof RISK_HEX] } : undefined}
            >
              {l ? titleCase(l) : "All levels"}
            </button>
          ))}
        </div>
        <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? titleCase(s) : "All statuses"}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="msg error">{error}</div>}

      <div className="panel flush">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Hazard</th>
                <th>Incident</th>
                <th>Location</th>
                <th>Detected</th>
                <th>Risk</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((i) => (
                <tr key={i.id} onClick={() => nav(`/incidents/${i.id}`)} style={{ cursor: "pointer" }}>
                  <td>
                    <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
                      <span className="ico" style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 20, background: `${RISK_HEX[i.risk_level]}18`, flex: "none" }}>
                        {i.hazard_icon}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{i.hazard_label}</div>
                        <div className="small muted">
                          {titleCase(i.zone)} zone · {i.distance_m.toFixed(0)} m{i.predicted_threat ? " · predicted" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Link to={`/incidents/${i.id}`} className="code" onClick={(e) => e.stopPropagation()}>
                      {i.code}
                    </Link>
                  </td>
                  <td>
                    <div>{i.section_name}</div>
                    <div className="small muted mono">{i.camera_id}</div>
                  </td>
                  <td>
                    <div>{timeAgo(i.detected_at)}</div>
                    <div className="small muted">{fmtDateTime(i.detected_at)}</div>
                  </td>
                  <td>
                    <Pill level={i.risk_level} score={i.risk_score} />
                  </td>
                  <td>
                    <Status value={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.items.length === 0 && <Empty icon={<Icon name="shield" />}>No incidents match these filters.</Empty>}
        <div className="pager">
          <span className="small muted">
            Page {page} of {pages}
          </span>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <Icon name="back" /> Prev
          </button>
          <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next <Icon name="arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}
