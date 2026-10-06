import clsx from "clsx";
import {
  Activity,
  BarChart3,
  Bell,
  BellRing,
  BrainCircuit,
  Camera,
  ChevronLeft,
  Cpu,
  Database,
  FileText,
  Flame,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  MonitorPlay,
  ShieldAlert,
  Siren,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLive } from "../context/LiveContext";
import { ALERT_HEX } from "../lib/format";
import { unlockAudio } from "../lib/sound";
import AlertsDrawer from "./AlertsDrawer";

const NAV = [
  {
    group: "Monitoring",
    items: [
      { to: "/", label: "Control Dashboard", icon: LayoutDashboard },
      { to: "/live", label: "Live Monitoring", icon: MonitorPlay },
      { to: "/cameras", label: "Camera Network", icon: Camera },
      { to: "/map", label: "Railway Map", icon: MapIcon },
    ],
  },
  {
    group: "Incidents",
    items: [
      { to: "/incidents", label: "Incidents", icon: ShieldAlert },
      { to: "/alerts", label: "Alerts & Escalation", icon: Siren },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { to: "/analytics", label: "Hazard Analytics", icon: BarChart3 },
      { to: "/heatmap", label: "Safety Heatmap", icon: Flame },
      { to: "/health", label: "Section Health", icon: HeartPulse },
    ],
  },
  {
    group: "AI Model",
    items: [
      { to: "/model", label: "Model Performance", icon: BrainCircuit },
      { to: "/dataset", label: "Dataset", icon: Database },
    ],
  },
  {
    group: "Operations",
    items: [
      { to: "/reports", label: "PDF Reports", icon: FileText },
      { to: "/system", label: "System Health", icon: Cpu },
      { to: "/settings", label: "Settings & Scope", icon: GraduationCap },
    ],
  },
];

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="hidden text-right md:block">
      <div className="font-mono text-sm font-semibold text-slate-100">{now.toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })} IST</div>
      <div className="text-[11px] text-slate-500">{now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</div>
    </div>
  );
}

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-5">
      <div className="relative">
        <img src="/favicon.svg" alt="" className="h-9 w-9" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 ring-2 ring-ink-900" />
      </div>
      {!collapsed && (
        <div>
          <div className="text-[15px] font-extrabold tracking-tight text-white">
            RailGuard <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">AI</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Track Safety Control</div>
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useLive();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map(({ id, alert }) => (
        <div key={id} className="glass-strong pointer-events-auto animate-slideIn overflow-hidden" style={{ borderColor: `${ALERT_HEX[alert.level]}66` }}>
          <div className="h-1" style={{ background: ALERT_HEX[alert.level] }} />
          <div className="flex gap-3 p-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0" style={{ color: ALERT_HEX[alert.level] }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">{alert.title}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-slate-400">{alert.message}</div>
              {alert.incident_id && (
                <NavLink to={`/incidents/${alert.incident_id}`} className="mt-1 inline-block text-xs font-medium text-cyan-300 hover:underline" onClick={() => dismissToast(id)}>
                  Open {alert.incident_code} →
                </NavLink>
              )}
            </div>
            <button className="self-start text-slate-500 hover:text-white" onClick={() => dismissToast(id)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const live = useLive();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  const critical = live.alerts.filter((a) => !a.acknowledged && a.level === "CRITICAL").length;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Logo collapsed={collapsed} />
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            {!collapsed && <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{g.group}</div>}
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === "/"}
                  title={it.label}
                  className={({ isActive }) =>
                    clsx(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      isActive ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/5 text-white shadow-[inset_2px_0_0_#22d3ee]" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                    )
                  }
                >
                  <it.icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{it.label}</span>}
                  {!collapsed && it.to === "/alerts" && live.unacknowledged > 0 && (
                    <span className="ml-auto rounded-full bg-red-500/90 px-1.5 text-[10px] font-bold text-white">{live.unacknowledged > 99 ? "99+" : live.unacknowledged}</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <button className="hidden w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-300 lg:flex" onClick={() => setCollapsed((c) => !c)}>
          <ChevronLeft className={clsx("h-4 w-4 transition", collapsed && "rotate-180")} />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full" onClick={unlockAudio}>
      <aside className={clsx("hidden shrink-0 border-r border-white/[0.06] bg-ink-900/60 backdrop-blur-xl transition-all lg:block", collapsed ? "w-[76px]" : "w-64")}>{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-white/10 bg-ink-900">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/[0.06] bg-ink-950/70 px-4 py-2.5 backdrop-blur-xl md:px-6">
          <button className="btn-ghost p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-xs">
            {live.connected ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">
                <Wifi className="h-3.5 w-3.5" /> LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-medium text-red-300">
                <WifiOff className="h-3.5 w-3.5" /> RECONNECTING
              </span>
            )}
            <span className="hidden items-center gap-1.5 text-slate-400 sm:flex">
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              {live.telemetry.filter((t) => t.status === "ONLINE" && t.mode !== "VIDEO").length} feeds ·{" "}
              {live.telemetry.reduce((s, t) => s + (t.status === "ONLINE" ? t.object_count : 0), 0)} tracked objects
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 md:gap-4">
            <Clock />
            <button className="btn-ghost p-2" onClick={() => live.setSoundEnabled(!live.soundEnabled)} title={live.soundEnabled ? "Mute alert chimes" : "Enable alert chimes"}>
              {live.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-slate-500" />}
            </button>
            <button className={clsx("btn-ghost relative p-2", critical > 0 && "animate-pulseRing border-red-500/50")} onClick={() => live.setDrawerOpen(true)} title="Alerts">
              <Bell className="h-4 w-4" />
              {live.unacknowledged > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{live.unacknowledged > 99 ? "99+" : live.unacknowledged}</span>
              )}
            </button>
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">
                {user?.full_name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-medium text-slate-100">{user?.full_name}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">{user?.role}</div>
              </div>
              <button className="btn-ghost ml-1 p-2" onClick={logout} title="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <Outlet />
        </main>
      </div>
      <AlertsDrawer />
      <Toasts />
    </div>
  );
}
