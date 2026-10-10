import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Icon, { Logo } from "./components/Icon";
import { useApi } from "./hooks/useApi";
import Alerts from "./pages/Alerts";
import Home from "./pages/Home";
import ImageCheck from "./pages/ImageCheck";
import IncidentDetail from "./pages/IncidentDetail";
import Incidents from "./pages/Incidents";
import Live from "./pages/Live";
import Reports from "./pages/Reports";

const LINKS = [
  { to: "/image", label: "Image Check", icon: "image" },
  { to: "/live", label: "Live", icon: "live" },
  { to: "/incidents", label: "Incidents", icon: "shield" },
  { to: "/alerts", label: "Alerts", icon: "bell" },
  { to: "/reports", label: "Reports", icon: "doc" },
];

function Ambient() {
  return (
    <div className="ambient" aria-hidden>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="grid" />
      <div className="stars" />
    </div>
  );
}

export default function App() {
  const { data: stats } = useApi<{ unacknowledged: number }>("/alerts/stats", undefined, 8000);
  return (
    <>
      <Ambient />
      <nav className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="brand">
            <Logo />
            <span className="word">
              RailGuard <span className="ai">AI</span>
            </span>
          </NavLink>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <Icon name={l.icon} />
              <span className="label">{l.label}</span>
              {l.to === "/alerts" && !!stats?.unacknowledged && <span className="count">{stats.unacknowledged > 99 ? "99+" : stats.unacknowledged}</span>}
            </NavLink>
          ))}
          <span className="nav-link" title="Engine live" style={{ cursor: "default" }}>
            <span className="live-dot" />
          </span>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/image" element={<ImageCheck />} />
        <Route path="/live" element={<Live />} />
        <Route path="/incidents" element={<Incidents />} />
        <Route path="/incidents/:id" element={<IncidentDetail />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <div className="footer">RAILGUARD AI · SEE THE RISK · PREDICT THE THREAT · PROTECT THE TRACK</div>
    </>
  );
}
