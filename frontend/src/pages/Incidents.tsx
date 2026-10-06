import { ChevronLeft, ChevronRight, Download, Search, ShieldAlert, SlidersHorizontal, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Incident, Paged } from "../api/types";
import { Card, ErrorBox, PageHeader, RiskBadge, Spinner, StatusBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { useApi } from "../hooks/useApi";
import { fmtDateTime, titleCase } from "../lib/format";

const LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_ALARM", "AUTO_CLEARED"];

export default function IncidentsPage() {
  const { canOperate } = useAuth();
  const live = useLive();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const [hazard, setHazard] = useState("");
  const [camera, setCamera] = useState("");
  const [predicted, setPredicted] = useState(false);
  const [sort, setSort] = useState("detected_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const params = {
    q: query || undefined,
    level: level || undefined,
    status: status || undefined,
    hazard_class: hazard || undefined,
    camera_id: camera || undefined,
    predicted: predicted || undefined,
    sort,
    order,
    page,
    page_size: pageSize,
  };
  const { data, error, loading, reload } = useApi<Paged<Incident>>("/incidents", params, 10000);
  const { data: classes } = useApi<{ key: string; label: string }[]>("/stream/classes");
  useEffect(() => {
    if (live.eventTick && page === 1) void reload(true);
  }, [live.eventTick, page, reload]);

  const setIncidentStatus = async (i: Incident, s: string) => {
    try {
      await api.patch(`/incidents/${i.id}`, { status: s });
      await reload(true);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const toggleSort = (col: string) => {
    if (sort === col) setOrder(order === "desc" ? "asc" : "desc");
    else {
      setSort(col);
      setOrder("desc");
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [["code", "detected_at", "camera", "section", "hazard", "risk", "level", "zone", "distance_m", "status", "summary"]];
    data.items.forEach((i) => rows.push([i.code, i.detected_at, i.camera_id, i.section_name, i.hazard_label, String(i.risk_score), i.risk_level, i.zone, String(i.distance_m), i.status, `"${i.summary_reason.replace(/"/g, "'")}"`]));
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `railguard-incidents-p${page}.csv`;
    a.click();
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const SortTh = ({ col, children }: { col: string; children: string }) => (
    <th className="th cursor-pointer select-none hover:text-slate-200" onClick={() => toggleSort(col)}>
      {children} {sort === col ? (order === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incidents Database"
        subtitle={data ? `${data.total.toLocaleString()} incidents matching filters` : "Searchable incident log"}
        icon={ShieldAlert}
        actions={
          <button className="btn-ghost" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />
      {err && <ErrorBox message={err} />}
      <Card bodyClass="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input className="input pl-9" placeholder="Search code, hazard, camera, reason..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <SlidersHorizontal className="h-4 w-4 text-slate-500" />
          <select className="input w-auto" value={level} onChange={(e) => (setLevel(e.target.value), setPage(1))}>
            <option value="">All risk levels</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select className="input w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={hazard} onChange={(e) => (setHazard(e.target.value), setPage(1))}>
            <option value="">All hazards</option>
            {classes?.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={camera} onChange={(e) => (setCamera(e.target.value), setPage(1))}>
            <option value="">All cameras</option>
            {Array.from({ length: 8 }, (_, i) => `CAM-0${i + 1}`).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className={predicted ? "btn border border-yellow-500/40 bg-yellow-500/15 text-yellow-200" : "btn-ghost"} onClick={() => (setPredicted(!predicted), setPage(1))}>
            <Zap className="h-4 w-4" /> Predicted only
          </button>
        </div>
      </Card>

      <Card bodyClass="p-0">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={() => reload()} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/[0.06] bg-white/[0.02]">
                <tr>
                  <th className="th">Incident</th>
                  <SortTh col="detected_at">Detected</SortTh>
                  <SortTh col="hazard_class">Hazard</SortTh>
                  <SortTh col="camera_id">Camera / Section</SortTh>
                  <th className="th">Zone · Dist</th>
                  <SortTh col="risk_score">Risk</SortTh>
                  <th className="th">Reason</th>
                  <SortTh col="status">Status</SortTh>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((i) => (
                  <tr key={i.id} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                    <td className="td">
                      <Link to={`/incidents/${i.id}`} className="font-mono text-xs font-semibold text-cyan-300 hover:underline">
                        {i.code}
                      </Link>
                      <div className="text-[10px] text-slate-500">{i.source}</div>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-300">{fmtDateTime(i.detected_at)}</td>
                    <td className="td whitespace-nowrap">
                      <span className="mr-1">{i.hazard_icon}</span>
                      {i.hazard_label}
                      {i.predicted_threat && <Zap className="ml-1 inline h-3 w-3 text-yellow-400" />}
                    </td>
                    <td className="td text-xs">
                      <div className="font-mono text-slate-200">{i.camera_id}</div>
                      <div className="text-slate-500">{i.section_name}</div>
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      <span className={i.zone === "CRITICAL" ? "text-red-300" : i.zone === "WARNING" ? "text-yellow-300" : "text-emerald-300"}>{i.zone}</span>
                      <span className="text-slate-500"> · {i.distance_m.toFixed(0)}m</span>
                    </td>
                    <td className="td">
                      <RiskBadge level={i.risk_level} score={i.risk_score} />
                    </td>
                    <td className="td max-w-xs truncate text-xs text-slate-400" title={i.summary_reason}>
                      {i.summary_reason}
                    </td>
                    <td className="td">
                      {canOperate ? (
                        <select className="input w-auto py-1 text-xs" value={i.status} onChange={(e) => setIncidentStatus(i, e.target.value)}>
                          {STATUSES.filter((s) => s !== "AUTO_CLEARED" || i.status === "AUTO_CLEARED").map((s) => (
                            <option key={s} value={s}>
                              {titleCase(s)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge status={i.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.items.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No incidents match the filters.</div>}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs text-slate-400">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button className="btn-ghost py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
