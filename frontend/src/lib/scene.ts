import type { CameraGeom, Roi, SceneObject } from "../api/types";
import { RISK_HEX } from "./format";

export interface SceneData {
  camera: CameraGeom;
  roi: Roi;
  objects: SceneObject[];
  env?: { time_of_day: string; weather: string };
  seed?: string;
}

export interface DrawOptions {
  showRoi: boolean;
  showVectors: boolean;
  showLabels: boolean;
  focusTrackId?: number | null;
  image?: HTMLImageElement | null;
  t?: number; // animation time (s) for pulsing / rain
}

const GAUGE_HALF = 0.838; // Indian broad gauge 1.676 m

function project(cam: CameraGeom, x: number, z: number): [number, number] {
  return [cam.width / 2 + (cam.focal_px * x) / z, cam.horizon_y + (cam.focal_px * cam.mount_height_m) / z];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function skyColors(tod: string): [string, string, string] {
  if (tod === "NIGHT") return ["#020617", "#0b1530", "#0f1d33"];
  if (tod === "DUSK") return ["#1e1b4b", "#7c2d12", "#f59e0b"];
  return ["#7dd3fc", "#bae6fd", "#e0f2fe"];
}

function drawBackground(ctx: CanvasRenderingContext2D, scene: SceneData) {
  const { camera: cam } = scene;
  const tod = scene.env?.time_of_day ?? "DAY";
  const night = tod === "NIGHT";
  const [s0, s1, s2] = skyColors(tod);
  const sky = ctx.createLinearGradient(0, 0, 0, cam.horizon_y);
  sky.addColorStop(0, s0);
  sky.addColorStop(0.7, s1);
  sky.addColorStop(1, s2);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cam.width, cam.horizon_y + 1);

  if (night) {
    const rnd = mulberry(hash(scene.seed ?? "stars"));
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 70; i++) ctx.fillRect(rnd() * cam.width, rnd() * cam.horizon_y * 0.8, 1.4, 1.4);
  }

  // distant ridges of the Western Ghats
  const rnd = mulberry(hash(scene.seed ?? "ridge"));
  const ridge = (base: number, amp: number, color: string, freq: number) => {
    ctx.beginPath();
    ctx.moveTo(0, cam.horizon_y);
    const p1 = rnd() * 10;
    const p2 = rnd() * 10;
    for (let x = 0; x <= cam.width; x += 8) {
      const y = cam.horizon_y - base - amp * (0.55 * Math.sin(x * freq + p1) + 0.45 * Math.sin(x * freq * 2.7 + p2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cam.width, cam.horizon_y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  ridge(70, 40, night ? "#0b1324" : tod === "DUSK" ? "#3b2a4a" : "#6b8fa8", 0.004);
  ridge(35, 25, night ? "#0a1a14" : tod === "DUSK" ? "#24301f" : "#3f6b4a", 0.009);

  // ground
  const ground = ctx.createLinearGradient(0, cam.horizon_y, 0, cam.height);
  ground.addColorStop(0, night ? "#07130d" : "#2f5a32");
  ground.addColorStop(1, night ? "#0c1f14" : "#1f4424");
  ctx.fillStyle = ground;
  ctx.fillRect(0, cam.horizon_y, cam.width, cam.height - cam.horizon_y);

  // forest tree line along both sides
  const trees = mulberry(hash((scene.seed ?? "") + "trees"));
  for (let i = 0; i < 90; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (12 + trees() * 40);
    const z = 18 + trees() * 160;
    const [u, v] = project(cam, x, z);
    const h = (cam.focal_px * (6 + trees() * 6)) / z;
    if (u < -h || u > cam.width + h) continue;
    ctx.fillStyle = night ? `rgba(4,20,12,${0.9})` : `hsl(${120 + trees() * 25}, 35%, ${16 + trees() * 10}%)`;
    ctx.beginPath();
    ctx.moveTo(u, v - h);
    ctx.lineTo(u - h * 0.32, v);
    ctx.lineTo(u + h * 0.32, v);
    ctx.closePath();
    ctx.fill();
  }

  // ballast bed
  const zNear = 9.5;
  const zFar = 400;
  const bl = project(cam, -2.2, zNear);
  const br = project(cam, 2.2, zNear);
  const fr = project(cam, 2.2, zFar);
  const fl = project(cam, -2.2, zFar);
  ctx.fillStyle = night ? "#1c1f26" : "#6b6258";
  ctx.beginPath();
  ctx.moveTo(...bl);
  ctx.lineTo(...br);
  ctx.lineTo(...fr);
  ctx.lineTo(...fl);
  ctx.closePath();
  ctx.fill();

  // sleepers
  ctx.fillStyle = night ? "#2a2520" : "#4a3b2c";
  for (let z = zNear; z < 140; z += 0.65) {
    const [x1, y1] = project(cam, -1.35, z);
    const [x2] = project(cam, 1.35, z);
    const th = Math.max(0.6, (cam.focal_px * cam.mount_height_m) / z - (cam.focal_px * cam.mount_height_m) / (z + 0.25));
    ctx.fillRect(x1, y1 - th, x2 - x1, th);
  }

  // rails
  ctx.strokeStyle = night ? "#94a3b8" : "#d6d3d1";
  for (const xm of [-GAUGE_HALF, GAUGE_HALF]) {
    const [x1, y1] = project(cam, xm, zNear);
    const [x2, y2] = project(cam, xm, zFar);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // weather overlays
  const weather = scene.env?.weather ?? "CLEAR";
  if (weather === "FOG") {
    const fog = ctx.createLinearGradient(0, cam.horizon_y - 120, 0, cam.height);
    fog.addColorStop(0, "rgba(203,213,225,0.55)");
    fog.addColorStop(0.5, "rgba(203,213,225,0.25)");
    fog.addColorStop(1, "rgba(203,213,225,0.05)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, cam.width, cam.height);
  } else if (weather === "OVERCAST") {
    ctx.fillStyle = "rgba(30,41,59,0.25)";
    ctx.fillRect(0, 0, cam.width, cam.height);
  }
  if (night) {
    ctx.fillStyle = "rgba(2,6,23,0.35)";
    ctx.fillRect(0, 0, cam.width, cam.height);
  }
}

function drawRain(ctx: CanvasRenderingContext2D, cam: CameraGeom, t: number) {
  {
    ctx.strokeStyle = "rgba(186,230,253,0.35)";
    ctx.lineWidth = 1;
    const r = mulberry(Math.floor(t * 12));
    ctx.beginPath();
    for (let i = 0; i < 160; i++) {
      const x = r() * cam.width;
      const y = r() * cam.height;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 6, y + 18);
    }
    ctx.stroke();
  }
}

function mulberry(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polygon(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoi(ctx: CanvasRenderingContext2D, roi: Roi) {
  ctx.save();
  polygon(ctx, roi.warning);
  ctx.fillStyle = "rgba(250,204,21,0.10)";
  ctx.fill();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(250,204,21,0.8)";
  ctx.stroke();
  polygon(ctx, roi.critical);
  ctx.fillStyle = "rgba(239,68,68,0.16)";
  ctx.fill();
  ctx.setLineDash([]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(239,68,68,0.9)";
  ctx.stroke();
  ctx.restore();
}

function drawObject(ctx: CanvasRenderingContext2D, o: SceneObject, opts: DrawOptions, synthetic: boolean, scale: number) {
  const [x1, y1, x2, y2] = o.bbox;
  const w = x2 - x1;
  const h = y2 - y1;
  const color = RISK_HEX[o.risk.risk_level];
  const t = opts.t ?? 0;

  if (synthetic) {
    // silhouette for the simulated object
    ctx.save();
    ctx.font = `${Math.max(10, h * 0.95)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (o.motion.vx > 0.5 && o.category !== "OBSTRUCTION") {
      ctx.translate((x1 + x2) / 2, 0);
      ctx.scale(-1, 1);
      ctx.fillText(o.icon, 0, y2 + h * 0.06);
    } else {
      ctx.fillText(o.icon, (x1 + x2) / 2, y2 + h * 0.06);
    }
    ctx.restore();
  }

  const focus = opts.focusTrackId === o.track_id;
  ctx.lineWidth = (focus ? 4 : o.risk.risk_level === "CRITICAL" ? 3 : 2) * scale;
  ctx.strokeStyle = color;
  if (o.risk.risk_level === "CRITICAL") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + 8 * Math.sin(t * 6);
  }
  ctx.strokeRect(x1, y1, w, h);
  ctx.shadowBlur = 0;
  // corner accents
  const c = Math.min(14 * scale, w / 3, h / 3);
  ctx.lineWidth = 4 * scale;
  for (const [cx, cy, dx, dy] of [
    [x1, y1, 1, 1],
    [x2, y1, -1, 1],
    [x1, y2, 1, -1],
    [x2, y2, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * c);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * c, cy);
    ctx.stroke();
  }

  // motion vector (1 s look-ahead) from the ground contact point
  if (opts.showVectors && o.motion.direction !== "STATIONARY") {
    const gx = (x1 + x2) / 2;
    const gy = y2;
    const ex = gx + o.motion.vx;
    const ey = gy + o.motion.vy;
    const len = Math.hypot(ex - gx, ey - gy);
    if (len > 4) {
      ctx.strokeStyle = o.motion.direction === "TOWARD_TRACK" || o.motion.direction === "ON_TRACK_MOVING" ? "#f43f5e" : "#38bdf8";
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      const ang = Math.atan2(ey - gy, ex - gx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 12 * scale * Math.cos(ang - 0.45), ey - 12 * scale * Math.sin(ang - 0.45));
      ctx.lineTo(ex - 12 * scale * Math.cos(ang + 0.45), ey - 12 * scale * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }

  if (!opts.showLabels) return;
  const fs = 13 * scale;
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  const l1 = `#${o.track_id} ${o.label} ${Math.round(o.confidence * 100)}%`;
  const l2 = `${o.distance_m.toFixed(0)}m · RISK ${Math.round(o.risk.risk_score)}`;
  const tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 12 * scale;
  const th = fs * 2.5;
  let ly = y1 - th - 4 * scale;
  if (ly < 2) ly = y2 + 4 * scale;
  ctx.fillStyle = "rgba(2,6,23,0.82)";
  roundRect(ctx, x1, ly, tw, th, 5 * scale);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x1, ly, 3 * scale, th);
  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(l1, x1 + 8 * scale, ly + fs * 0.25);
  ctx.fillStyle = color;
  ctx.fillText(l2, x1 + 8 * scale, ly + fs * 1.3);

  if (o.motion.predicted_threat && o.motion.eta_s != null) {
    const txt = `⚠ PREDICTED ENTRY ${o.motion.eta_s.toFixed(1)}s`;
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
    const bw = ctx.measureText(txt).width + 14 * scale;
    const by = y2 + 6 * scale;
    const pulse = 0.65 + 0.35 * Math.abs(Math.sin(t * 4));
    ctx.fillStyle = `rgba(234,179,8,${pulse})`;
    roundRect(ctx, x1, by, bw, fs * 1.6, 5 * scale);
    ctx.fill();
    ctx.fillStyle = "#1c1917";
    ctx.fillText(txt, x1 + 7 * scale, by + fs * 0.3);
  }
}

const bgCache = new Map<string, HTMLCanvasElement>();

function cachedBackground(scene: SceneData): HTMLCanvasElement {
  const c = scene.camera;
  const key = [scene.seed, scene.env?.time_of_day, scene.env?.weather, c.width, c.height, c.focal_px, c.horizon_y].join("|");
  let bg = bgCache.get(key);
  if (!bg) {
    bg = document.createElement("canvas");
    bg.width = c.width;
    bg.height = c.height;
    drawBackground(bg.getContext("2d")!, scene);
    if (bgCache.size > 24) bgCache.clear();
    bgCache.set(key, bg);
  }
  return bg;
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: SceneData, opts: DrawOptions) {
  const cam = scene.camera;
  ctx.clearRect(0, 0, cam.width, cam.height);
  const synthetic = !opts.image;
  if (opts.image) ctx.drawImage(opts.image, 0, 0, cam.width, cam.height);
  else {
    ctx.drawImage(cachedBackground(scene), 0, 0);
    if (scene.env?.weather === "RAIN") drawRain(ctx, cam, opts.t ?? 0);
  }
  if (opts.showRoi) drawRoi(ctx, scene.roi);
  const scale = cam.width / 1280;
  // draw far objects first so near ones overlap them
  const objs = [...scene.objects].sort((a, b) => a.bbox[3] - b.bbox[3]);
  for (const o of objs) drawObject(ctx, o, opts, synthetic, Math.max(scale, 0.6));
}
