import { Download, Eye, FileBarChart, FileHeart, FileText, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadFile, errorMessage, openFile } from "../api/client";
import type { Incident, Paged, Report } from "../api/types";
import { Card, ErrorBox, PageHeader, RiskBadge, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { fmtBytes, fmtDateTime, titleCase } from "../lib/format";

export default function ReportsPage() {
  const { canOperate } = useAuth();
  const { data, error, loading, reload } = useApi<Report[]>("/reports");
  const { data: critical } = useApi<Paged<Incident>>("/incidents", { level: "CRITICAL,HIGH", page_size: 8 });
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

  const remove = async (r: Report) => {
    if (!confirm(`Delete report ${r.code}?`)) return;
    try {
      await api.delete(`/reports/${r.id}`);
      await reload(true);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const templates = [
    { key: "daily", title: "Daily Safety Summary", desc: "KPIs, incidents by class & section, top 15 highest-risk incidents for the last 24 h.", icon: FileBarChart, url: "/reports/daily" },
    { key: "health", title: "Section Health Report", desc: "0-100 health index for every section with an itemised, explainable penalty breakdown.", icon: FileHeart, url: "/reports/section-health" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="PDF Reports Center" subtitle="Formal, downloadable audit reports generated with ReportLab" icon={FileText} />
      {err && <ErrorBox message={err} />}
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <div key={t.key} className="glass flex items-start gap-4 p-5">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              <t.icon className="h-6 w-6 text-cyan-300" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">{t.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{t.desc}</p>
              <button className="btn-primary mt-3" disabled={!canOperate || !!busy} onClick={() => generate(t.key, t.url)}>
                {busy === t.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Generate PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      <Card title="Incident audit reports - recent high-risk incidents" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {critical?.items.map((i) => (
                <tr key={i.id} className="border-b border-white/[0.04]">
                  <td className="td">
                    <Link to={`/incidents/${i.id}`} className="font-mono text-xs text-cyan-300 hover:underline">
                      {i.code}
                    </Link>
                  </td>
                  <td className="td text-sm">
                    {i.hazard_icon} {i.hazard_label}
                  </td>
                  <td className="td text-xs text-slate-400">{i.section_name}</td>
                  <td className="td">
                    <RiskBadge level={i.risk_level} score={i.risk_score} />
                  </td>
                  <td className="td text-xs text-slate-400">{fmtDateTime(i.detected_at)}</td>
                  <td className="td text-right">
                    <button className="btn-ghost py-1 text-xs" disabled={!canOperate || !!busy} onClick={() => generate(`inc-${i.id}`, `/reports/incident/${i.id}`)}>
                      {busy === `inc-${i.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Audit PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Generated reports (${data?.length ?? 0})`} bodyClass="p-0">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorBox message={error} />
          </div>
        ) : data?.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No reports yet - generate one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <th className="th">Report</th>
                  <th className="th">Type</th>
                  <th className="th">Created</th>
                  <th className="th">By</th>
                  <th className="th">Size</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {data?.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="td">
                      <div className="font-mono text-xs text-slate-200">{r.code}</div>
                      <div className="text-xs text-slate-500">{r.title}</div>
                    </td>
                    <td className="td text-xs text-slate-300">{titleCase(r.kind)}</td>
                    <td className="td text-xs text-slate-400">{fmtDateTime(r.created_at)}</td>
                    <td className="td text-xs text-slate-400">{r.created_by}</td>
                    <td className="td font-mono text-xs text-slate-400">{fmtBytes(r.size_bytes)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <button className="btn-ghost p-1.5" title="Open" onClick={() => openFile(`/reports/${r.id}/download`).catch((e) => setErr(errorMessage(e)))}>
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button className="btn-ghost p-1.5" title="Download" onClick={() => downloadFile(`/reports/${r.id}/download`, `${r.code}.pdf`).catch((e) => setErr(errorMessage(e)))}>
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {canOperate && (
                          <button className="btn-ghost p-1.5 text-red-300" title="Delete" onClick={() => remove(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
