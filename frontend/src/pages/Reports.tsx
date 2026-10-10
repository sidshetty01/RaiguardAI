import { useState } from "react";
import { api, downloadFile, errorMessage } from "../api/client";
import type { Report } from "../api/types";
import { Empty, PageHead } from "../components/bits";
import Icon from "../components/Icon";
import { useApi } from "../hooks/useApi";
import { fmtBytes, fmtDateTime, titleCase } from "../lib/format";

function DocArt({ accent }: { accent: string }) {
  const gid = `doc-${accent.slice(1)}`;
  return (
    <svg className="doc" viewBox="0 0 82 100">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="0.35" />
          <stop offset="1" stopColor={accent} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d="M8 4h46l20 20v70a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill={`url(#${gid})`} stroke={accent} strokeOpacity="0.6" />
      <path d="M54 4v20h20" fill="none" stroke={accent} strokeOpacity="0.6" />
      <rect x="16" y="36" width="40" height="5" rx="2.5" fill={accent} opacity="0.8" />
      <rect x="16" y="48" width="50" height="4" rx="2" fill="#94a3b8" opacity="0.4" />
      <rect x="16" y="57" width="44" height="4" rx="2" fill="#94a3b8" opacity="0.4" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={18 + i * 12} y={86 - [14, 22, 10, 18][i]} width="8" height={[14, 22, 10, 18][i]} rx="2" fill={accent} opacity="0.7" />
      ))}
    </svg>
  );
}

export default function Reports() {
  const { data, reload } = useApi<Report[]>("/reports");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generate = async (key: string, url: string) => {
    setBusy(key);
    setErr(null);
    try {
      const r = await api.post<Report>(url);
      await reload(true);
      await downloadFile(`/reports/${r.data.id}/download`, `${r.data.code}.pdf`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <PageHead eyebrow="Audit & documentation" title="Reports" sub="Formal PDF reports for the control room. Incident audit reports are generated from each incident's page." />
      {err && <div className="msg error">{err}</div>}

      <div className="report-grid">
        <div className="report-card">
          <DocArt accent="#2fd9f4" />
          <div>
            <h3>Daily safety summary</h3>
            <p>Key numbers for the last 24 hours, incidents by hazard and section, and the 15 highest-risk events.</p>
            <button className="btn primary" disabled={!!busy} onClick={() => generate("daily", "/reports/daily")}>
              <Icon name="download" /> {busy === "daily" ? "Generating..." : "Generate PDF"}
            </button>
          </div>
        </div>
        <div className="report-card">
          <DocArt accent="#8b7cff" />
          <div>
            <h3>Section health report</h3>
            <p>A 0-100 safety index for every railway section, with an itemised explanation of each penalty.</p>
            <button className="btn" disabled={!!busy} onClick={() => generate("health", "/reports/section-health")}>
              <Icon name="download" /> {busy === "health" ? "Generating..." : "Generate PDF"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-title" style={{ padding: "18px 18px 0" }}>
          <Icon name="doc" /> Generated reports
        </div>
        {data?.length === 0 ? (
          <Empty icon={<Icon name="doc" />}>No reports yet - generate one above.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Type</th>
                <th>Created</th>
                <th>Size</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div className="small muted code">{r.code}</div>
                  </td>
                  <td className="muted">{titleCase(r.kind)}</td>
                  <td className="muted">{fmtDateTime(r.created_at)}</td>
                  <td className="muted mono small">{fmtBytes(r.size_bytes)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn sm" onClick={() => downloadFile(`/reports/${r.id}/download`, `${r.code}.pdf`).catch((e) => setErr(errorMessage(e)))}>
                      <Icon name="download" /> Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
