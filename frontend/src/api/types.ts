export type RiskLevel = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertLevel = "INFO" | "WARNING" | "HIGH" | "CRITICAL";
export type Role = "ADMIN" | "OPERATOR" | "VIEWER";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
}

export interface Factor {
  factor: string;
  points: number;
  max_points: number;
  description: string;
}

export interface Risk {
  risk_score: number;
  risk_level: RiskLevel;
  summary_reason: string;
  contributing_factors: Factor[];
}

export interface Motion {
  direction: string;
  speed_mps: number;
  closing_speed_mps: number;
  vx: number;
  vy: number;
  trend: string;
  eta_s: number | null;
  predicted_threat: boolean;
}

export interface SceneObject {
  track_id: number;
  cls: string;
  label: string;
  icon: string;
  category: string;
  bbox: [number, number, number, number];
  confidence: number;
  zone: "SAFE" | "WARNING" | "CRITICAL";
  distance_m: number;
  edge_distance_m: number;
  lateral_m: number;
  persisted_frames: number;
  persisted_s: number;
  motion: Motion;
  risk: Risk;
}

export interface CameraGeom {
  width: number;
  height: number;
  focal_px: number;
  horizon_y: number;
  mount_height_m: number;
}

export interface Roi {
  critical: [number, number][];
  warning: [number, number][];
}

export interface Frame {
  type: "frame";
  camera_id: string;
  camera_name: string;
  mode: "SIMULATION" | "VIDEO" | "CAMERA";
  ts: number;
  frame_no: number;
  camera: CameraGeom;
  roi: Roi;
  objects: SceneObject[];
  max_risk: number;
  safety_score: number;
  level: RiskLevel;
  latency_ms: number;
  fps: number;
  env: { time_of_day: string; weather: string };
  scenario: { key: string; title: string; description: string; elapsed_s: number } | null;
  progress: number | null;
  image: string | null;
}

export interface Snapshot {
  camera: CameraGeom;
  roi: Roi;
  objects: SceneObject[];
  env: { time_of_day: string; weather: string };
  frame_no: number;
  focus_track_id: number;
  captured_at?: string;
}

export interface RuntimeSummary {
  id: string;
  name: string;
  section_id: string | null;
  mode: string;
  status: string;
  source_name: string | null;
  running: boolean;
  finished: boolean;
  error: string | null;
  frames: number;
  fps: number;
  latency_ms: number;
  progress: number | null;
  safety_score: number;
  max_risk: number;
  level: RiskLevel;
  object_count: number;
  simulation: {
    profile: string;
    active_scenario: { key: string; title: string; description: string; elapsed_s: number } | null;
    next_scenario_in_s: number | null;
    time_of_day: string;
    weather: string;
  } | null;
}

export interface Camera {
  id: string;
  name: string;
  section_id: string;
  section_name: string;
  km_marker: number;
  lat: number;
  lng: number;
  status: "ONLINE" | "OFFLINE" | "MAINTENANCE";
  camera_type: string;
  resolution: string;
  fps: number;
  focal_length_px: number;
  mount_height_m: number;
  stream_url: string | null;
  scenario_profile: string;
  temperature_c: number;
  uptime_pct: number;
  bandwidth_mbps: number;
  installed_on: string;
  last_heartbeat: string | null;
  runtime: RuntimeSummary | null;
  incident_count?: number;
}

export interface Incident {
  id: number;
  code: string;
  camera_id: string;
  camera_name: string;
  section_id: string;
  section_name: string;
  track_id: number;
  hazard_class: string;
  hazard_label: string;
  hazard_icon: string;
  category: string;
  risk_score: number;
  risk_level: RiskLevel;
  zone: string;
  distance_m: number;
  edge_distance_m: number;
  confidence: number;
  motion_direction: string;
  speed_mps: number;
  predicted_entry_s: number | null;
  predicted_threat: boolean;
  frames_persisted: number;
  summary_reason: string;
  status: string;
  source: string;
  response_time_s: number | null;
  detected_at: string;
  updated_at: string;
  has_image: boolean;
}

export interface IncidentDetail extends Incident {
  factors: Factor[];
  snapshot: Snapshot | null;
  operator_notes: string;
  signed_off_by: string | null;
  signed_off_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  km_marker: number | null;
  lat: number | null;
  lng: number | null;
  alerts: Alert[];
}

export interface Alert {
  id: number;
  incident_id: number | null;
  incident_code: string | null;
  hazard_class: string | null;
  camera_id: string;
  level: AlertLevel;
  kind: string;
  title: string;
  message: string;
  predicted: boolean;
  escalation_stage: number;
  escalated_to: string;
  risk_score: number;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface Paged<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface Report {
  id: number;
  code: string;
  kind: string;
  title: string;
  incident_id: number | null;
  size_bytes: number;
  created_by: string;
  created_at: string;
}

export interface Section {
  id: string;
  name: string;
  from_station: string;
  to_station: string;
  km_start: number;
  km_end: number;
  terrain: string;
  forest_proximity: number;
  elephant_corridor: boolean;
  landslide_prone: boolean;
  lat: number;
  lng: number;
  polyline: [number, number][];
}

export interface SectionHealth {
  section_id: string;
  name: string;
  terrain: string;
  km_start: number;
  km_end: number;
  score: number;
  grade: string;
  rating: string;
  window_days: number;
  incidents: number;
  critical: number;
  high: number;
  unresolved: number;
  avg_response_s: number | null;
  top_hazards: [string, number][];
  factors: { factor: string; penalty: number; max_penalty: number; description: string }[];
}

export interface Settings {
  simulation_enabled: boolean;
  auto_scenarios: boolean;
  scenario_frequency: "LOW" | "NORMAL" | "HIGH";
  alert_sound: boolean;
  escalation_critical_s: number;
  escalation_high_s: number;
}

export interface Scenario {
  key: string;
  title: string;
  description: string;
  classes: string[];
}
