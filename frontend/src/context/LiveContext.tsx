import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, wsUrl } from "../api/client";
import type { Alert, RuntimeSummary } from "../api/types";
import { playChime } from "../lib/sound";
import { useAuth } from "./AuthContext";

interface Toast {
  id: number;
  alert: Alert;
}

interface LiveState {
  connected: boolean;
  alerts: Alert[];
  unacknowledged: number;
  telemetry: RuntimeSummary[];
  toasts: Toast[];
  dismissToast: (id: number) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  refreshAlerts: () => void;
  markAcknowledged: (ids: number[] | "all", by: string) => void;
  eventTick: number;
}

const LiveContext = createContext<LiveState | null>(null);

const SOUND_KEY = "railguard.sound";

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [telemetry, setTelemetry] = useState<RuntimeSummary[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [eventTick, setEventTick] = useState(0);
  const [soundEnabled, setSoundState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const lastChime = useRef(0);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundState(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAlerts = useCallback(() => {
    api
      .get<Alert[]>("/alerts", { params: { limit: 150 } })
      .then((r) => setAlerts(r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshAlerts();
    let ws: WebSocket | null = null;
    let retry: number | undefined;
    let closed = false;
    let ping: number | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl("/ws/events"));
      ws.onopen = () => {
        setConnected(true);
        ping = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 20000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "telemetry") setTelemetry(msg.cameras);
        else if (msg.type === "alert") {
          const a: Alert = msg.alert;
          setAlerts((prev) => [a, ...prev].slice(0, 300));
          setEventTick((t) => t + 1);
          // escalations of an already-announced hazard go to the drawer, not a new toast
          if (a.kind !== "ESCALATED" && (a.level === "HIGH" || a.level === "CRITICAL" || a.kind === "PREDICTED")) {
            setToasts((prev) => [{ id: a.id, alert: a }, ...prev].slice(0, 3));
            window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== a.id)), 9000);
            const now = Date.now();
            if (soundRef.current && now - lastChime.current > 2500) {
              lastChime.current = now;
              playChime(a.level);
            }
          }
        } else if (msg.type === "incident_opened") setEventTick((t) => t + 1);
      };
      ws.onclose = () => {
        setConnected(false);
        window.clearInterval(ping);
        if (!closed) retry = window.setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      window.clearInterval(ping);
      ws?.close();
    };
  }, [user, refreshAlerts]);

  const markAcknowledged = useCallback((ids: number[] | "all", by: string) => {
    const now = new Date().toISOString();
    setAlerts((prev) =>
      prev.map((a) => (ids === "all" || ids.includes(a.id) ? { ...a, acknowledged: true, acknowledged_by: by, acknowledged_at: now } : a)),
    );
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const value = useMemo<LiveState>(
    () => ({
      connected,
      alerts,
      unacknowledged: alerts.filter((a) => !a.acknowledged).length,
      telemetry,
      toasts,
      dismissToast,
      soundEnabled,
      setSoundEnabled,
      drawerOpen,
      setDrawerOpen,
      refreshAlerts,
      markAcknowledged,
      eventTick,
    }),
    [connected, alerts, telemetry, toasts, dismissToast, soundEnabled, setSoundEnabled, drawerOpen, refreshAlerts, markAcknowledged, eventTick],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive outside LiveProvider");
  return ctx;
}
