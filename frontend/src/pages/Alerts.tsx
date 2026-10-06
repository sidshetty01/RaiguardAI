import clsx from "clsx";
import { ArrowRight, BellRing, CheckCheck, Siren, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { Alert } from "../api/types";
import { AlertRow } from "../components/AlertsDrawer";
import { Card, ErrorBox, PageHeader, StatCard } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { useApi } from "../hooks/useApi";
import { ALERT_HEX } from "../lib/format";
import { playChime } from "../lib/sound";

const CHAIN = ["Control Room Operator", "Station Master", "Divisional Safety Control", "Loco Pilot - Caution/Stop Order"];

export default function AlertsPage() {
  const live = useLive();
  const { user, canOperate } = useAuth();
  const [level, setLevel] = useState("");
  const [ack, setAck] = useState<"" | "false" | "true">("");
  const [kind, setKind] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const params = { level: level || undefined, acknowledged: ack || undefined, kind: kind || undefined, limit: 200 };
  const { data, reload } = useApi<Alert[]>("/alerts", params, 8000);
  const { data: settings } = useApi<{ escalation_critical_s: number; escalation_high_s: number }>("/settings");
  useEffect(() => {
    if (live.eventTick) void reload(true);
  }, [live.eventTick, reload]);

  const doAck = async (a: Alert) => {
    try {
      await api.post(`/alerts/${a.id}/ack`);
      live.markAcknowledged([a.id], user?.username ?? "");
      await reload(true);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const ackAll = async () => {
    try {
      await api.post(`/alerts/ack-all`);
      live.markAcknowledged("all", user?.username ?? "");
      await reload(true);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const all = data ?? [];
  const count = (l: string) => all.filter((a) => a.level === l && !a.acknowledged).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts & Escalation"
        subtitle="Centralised notification centre with severity filters, audible chimes and time-based escalation"
        icon={Siren}
        actions={
          <>
            <button className="btn-ghost" onClick={() => live.setSoundEnabled(!live.soundEnabled)}>
              {live.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Chimes {live.soundEnabled ? "on" : "off"}
            </button>
            <button className="btn-ghost" onClick={() => playChime("CRITICAL")}>
              <BellRing className="h-4 w-4" /> Test chime
            </button>
            {canOperate && (
              <button className="btn-primary" onClick={ackAll}>
                <CheckCheck className="h-4 w-4" /> Acknowledge all
              </button>
            )}
          </>
        }
      />
      {err && <ErrorBox message={err} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["CRITICAL", "HIGH", "WARNING", "INFO"] as const).map((l) => (
          <button key={l} onClick={() => setLevel(level === l ? "" : l)} className="text-left">
            <StatCard label={`${l} · unacked`} value={count(l)} icon={Siren} tone={l === "CRITICAL" ? "red" : l === "HIGH" ? "amber" : l === "WARNING" ? "amber" : "blue"} sub={level === l ? "filter active" : "click to filter"} />
          </button>
        ))}
      </div>

      <Card title="Escalation Ladder" icon={ArrowRight}>
        <div className="flex flex-wrap items-center gap-2">
          {CHAIN.map((c, i) => (
            <div key={c} className="flex items-center gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Stage {i + 1}</div>
                <div className="text-sm font-semibold text-slate-100">{c}</div>
              </div>
              {i < CHAIN.length - 1 && <ArrowRight className="h-4 w-4 text-slate-600" />}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Unacknowledged <span style={{ color: ALERT_HEX.CRITICAL }}>CRITICAL</span> alerts escalate one stage every {settings?.escalation_critical_s ?? 20}s; <span style={{ color: ALERT_HEX.HIGH }}>HIGH</span> alerts every{" "}
          {settings?.escalation_high_s ?? 45}s. An alert is upgraded (and needs fresh acknowledgement) whenever the object's risk climbs a level. PREDICTED alerts fire before the hazard enters the track.
        </p>
      </Card>

      <Card
        title="Notification Centre"
        icon={BellRing}
        actions={
          <div className="flex gap-2">
            <select className="input w-auto py-1 text-xs" value={ack} onChange={(e) => setAck(e.target.value as typeof ack)}>
              <option value="">All</option>
              <option value="false">Unacknowledged</option>
              <option value="true">Acknowledged</option>
            </select>
            <select className="input w-auto py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All events</option>
              <option value="RAISED">Raised</option>
              <option value="PREDICTED">Predicted</option>
              <option value="UPGRADED">Upgraded</option>
              <option value="ESCALATED">Escalated</option>
            </select>
          </div>
        }
        bodyClass="grid gap-2 p-3 lg:grid-cols-2"
      >
        {all.length === 0 && <div className={clsx("col-span-2 py-10 text-center text-sm text-slate-500")}>No alerts in this view.</div>}
        {all.map((a) => (
          <AlertRow key={a.id} a={a} onAck={doAck} canAck={canOperate} />
        ))}
      </Card>
    </div>
  );
}
