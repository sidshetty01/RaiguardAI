import clsx from "clsx";
import { CheckCheck, Check, Siren, X, Zap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Alert } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { ALERT_HEX, timeAgo } from "../lib/format";
import { Badge } from "./ui";

export function AlertRow({ a, onAck, canAck }: { a: Alert; onAck?: (a: Alert) => void; canAck: boolean }) {
  return (
    <div className={clsx("relative rounded-xl border p-3 transition", a.acknowledged ? "border-white/[0.05] bg-white/[0.015] opacity-70" : "border-white/10 bg-white/[0.04]")}>
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r" style={{ background: ALERT_HEX[a.level] }} />
      <div className="flex items-start gap-2 pl-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide" style={{ background: `${ALERT_HEX[a.level]}22`, color: ALERT_HEX[a.level], borderColor: `${ALERT_HEX[a.level]}55` }}>
              {a.level}
            </span>
            {a.predicted && (
              <Badge className="border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                <Zap className="h-3 w-3" /> Predicted
              </Badge>
            )}
            {a.kind === "ESCALATED" && <Badge className="border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">Stage {a.escalation_stage}</Badge>}
            <span className="ml-auto text-[11px] text-slate-500">{timeAgo(a.created_at)}</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-slate-100">{a.title}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-slate-400">{a.message}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span>{a.camera_id}</span>
            <span>→ {a.escalated_to}</span>
            {a.incident_id && (
              <Link to={`/incidents/${a.incident_id}`} className="font-medium text-cyan-300 hover:underline">
                {a.incident_code}
              </Link>
            )}
            {a.acknowledged ? (
              <span className="ml-auto flex items-center gap-1 text-emerald-400">
                <Check className="h-3 w-3" /> {a.acknowledged_by}
              </span>
            ) : (
              canAck &&
              onAck && (
                <button className="ml-auto rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 font-medium text-cyan-200 hover:bg-cyan-400/20" onClick={() => onAck(a)}>
                  Acknowledge
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AlertsDrawer() {
  const live = useLive();
  const { user, canOperate } = useAuth();
  const [filter, setFilter] = useState<"UNACK" | "ALL" | "CRITICAL" | "PREDICTED">("UNACK");
  const [err, setErr] = useState<string | null>(null);
  if (!live.drawerOpen) return null;

  const list = live.alerts.filter((a) =>
    filter === "UNACK" ? !a.acknowledged : filter === "CRITICAL" ? a.level === "CRITICAL" : filter === "PREDICTED" ? a.predicted : true,
  );

  const ack = async (a: Alert) => {
    try {
      await api.post(`/alerts/${a.id}/ack`);
      live.markAcknowledged([a.id], user?.username ?? "");
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const ackAll = async () => {
    try {
      await api.post(`/alerts/ack-all`);
      live.markAcknowledged("all", user?.username ?? "");
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => live.setDrawerOpen(false)} />
      <aside className="glass-strong absolute inset-y-0 right-0 flex w-full max-w-md animate-slideIn flex-col rounded-none rounded-l-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 p-4">
          <Siren className="h-5 w-5 text-red-400" />
          <div className="flex-1">
            <h2 className="font-semibold text-white">Alert Center</h2>
            <p className="text-xs text-slate-400">{live.unacknowledged} unacknowledged</p>
          </div>
          {canOperate && live.unacknowledged > 0 && (
            <button className="btn-ghost py-1.5 text-xs" onClick={ackAll}>
              <CheckCheck className="h-4 w-4" /> Ack all
            </button>
          )}
          <button className="btn-ghost p-2" onClick={() => live.setDrawerOpen(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex gap-1 border-b border-white/[0.06] px-4 py-2">
          {(["UNACK", "CRITICAL", "PREDICTED", "ALL"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={clsx("rounded-md px-2.5 py-1 text-xs font-medium", filter === f ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:bg-white/5")}>
              {f === "UNACK" ? "Unacknowledged" : f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {err && <div className="mx-4 mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{err}</div>}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {list.length === 0 && <div className="py-16 text-center text-sm text-slate-500">No alerts in this view.</div>}
          {list.slice(0, 80).map((a) => (
            <AlertRow key={a.id} a={a} onAck={ack} canAck={canOperate} />
          ))}
        </div>
        <footer className="border-t border-white/10 p-3 text-center">
          <Link to="/alerts" className="text-xs font-medium text-cyan-300 hover:underline" onClick={() => live.setDrawerOpen(false)}>
            Open full Alerts & Escalation page →
          </Link>
        </footer>
      </aside>
    </div>
  );
}
