import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import { LiveProvider } from "./context/LiveContext";
import AlertsPage from "./pages/Alerts";
import AnalyticsPage from "./pages/Analytics";
import CamerasPage from "./pages/Cameras";
import Dashboard from "./pages/Dashboard";
import DatasetPage from "./pages/Dataset";
import HeatmapPage from "./pages/Heatmap";
import IncidentDetail from "./pages/IncidentDetail";
import IncidentsPage from "./pages/Incidents";
import LiveMonitoring from "./pages/LiveMonitoring";
import Login from "./pages/Login";
import ModelPerformance from "./pages/ModelPerformance";
import RailwayMap from "./pages/RailwayMap";
import ReportsPage from "./pages/Reports";
import SectionHealthPage from "./pages/SectionHealth";
import SettingsPage from "./pages/Settings";
import SystemHealthPage from "./pages/SystemHealth";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Starting RailGuard AI" />;
  if (!user)
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  return (
    <LiveProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="live" element={<LiveMonitoring />} />
          <Route path="cameras" element={<CamerasPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="map" element={<RailwayMap />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="heatmap" element={<HeatmapPage />} />
          <Route path="health" element={<SectionHealthPage />} />
          <Route path="model" element={<ModelPerformance />} />
          <Route path="dataset" element={<DatasetPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="system" element={<SystemHealthPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LiveProvider>
  );
}
