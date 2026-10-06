# RailGuard AI

### **AI-Based Intelligent Framework for Autonomous Railway Track Safety Monitoring in Rural and Forest Areas**

> **Tagline**: *See the Risk. Predict the Threat. Protect the Track.*

---

## 🚆 1. Project Overview & Problem Statement

Railway safety monitoring in rural and forest corridors presents critical challenges due to wild animal crossings (elephants, cattle, deer), fallen trees, rockslides, vehicle trespassers, and extreme weather conditions. Traditional systems rely either on manual track inspections or naive object detection models (e.g., `Camera → YOLO → Bounding Box → Simple Alert`).

These simple setups suffer from high false-positive rates for harmless distant objects outside track boundaries, lack spatial track awareness, ignore temporal object trajectories, provide no risk explainability, and fail to predict imminent threats.

**RailGuard AI** solves these limitations by implementing a 12-stage intelligent railway safety monitoring platform combining **Object Detection + Track ROI Danger Zone Segmentation + Spatial Proximity Estimation + Temporal Centroid Tracking + Vector Motion Analysis + Explainable Risk Scoring (XAI) + Early Threat Prediction + Escalation Engine + PDF Audit Reporting**.

---

## ⚡ 2. Key Technical Innovations

1. **Multi-Stage AI Computer Vision Engine** - spatial polygon ROI track segmentation combined with pinhole distance and trajectory reasoning, not just bounding boxes.
2. **Explainable AI (XAI) Risk Engine** - a transparent 0–100 risk score with every contribution itemised (e.g. `+35 Track Proximity`, `+23.8 Hazard Severity`, `+8 Stationary obstruction`, `+15 Persistence`, `+9.4 Confidence`).
3. **Early Warning Threat Prediction** - least-squares closing speed toward the track gives the predicted entry time (`Predicted entry in 6.4s`) and a `PREDICTED THREAT` alert *before* the hazard breaches the track.
4. **False-positive suppression** - severity, persistence and confidence are scaled by zone exposure, so a cow grazing 25 m away stays SAFE while the same cow on the ballast is CRITICAL; birds are suppressed outright.
5. **Section Safety Health Score (0–100)** - explainable, capped penalties for hazard density, critical incidents, forest proximity, response time, unresolved hazards and terrain.
6. **Control Room Dashboard** - 16 dark glassmorphism pages: live canvas with ROI overlays, incidents, alert drawer with audible chimes, Leaflet map, 12 analytics charts, heatmap, PDF reports and diagnostics.
7. **Zero-Hardware Demo Simulation Mode** - scripted hazards move in world coordinates and are projected through the same pinhole camera model, then emitted as noisy detector output (jitter, misses, range-dependent confidence), so the tracker, distance, motion and risk stages run exactly as on real YOLO output.

---

## 🏗️ 3. End-to-End System Architecture

```
[ Video Input / Camera Stream (RTSP) / Upload / Synthetic Generator ]
                │
                ▼
  [ RailGuard AI Computer Vision Engine ]          backend/app/vision/
  ├── 1. YOLOv8 Object Detector (16 classes)          detector.py, hazard_classes.py
  ├── 2. Track Danger Zone Polygon Segmentor          roi.py, geometry.py
  ├── 3. Centroid & IoU Temporal Object Tracker       tracker.py
  ├── 4. Pinhole Camera Distance Estimator            distance.py
  ├── 5. Motion Analyzer & Threat Predictor           motion.py
  ├── 6. Explainable Risk Engine (XAI 0–100)          risk_engine.py
  └── 7. Alert & Escalation Engine                    alert_engine.py
                │                                     pipeline.py (orchestration), simulator.py
                ▼
      [ FastAPI REST + WebSocket ] ◄────► [ SQLite (default) / PostgreSQL ]
                │                         services/stream_manager.py, pdf_report.py, health_score.py
                ▼
    [ React + TypeScript Control Room Dashboard ] (16 pages)   frontend/src/
```

---

## 🛠️ 4. Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, Leaflet (react-leaflet), Canvas renderer, Axios.
- **Backend**: Python 3.11+ (tested on 3.14), FastAPI, Uvicorn, SQLAlchemy 2, Pydantic v2, PyJWT + bcrypt, ReportLab, WebSockets.
- **AI / Vision**: Ultralytics YOLOv8, PyTorch, OpenCV, NumPy; training scripts use scikit-learn, XGBoost, torchvision.
- **DevOps**: Docker, Docker Compose, Nginx.

---

## 📊 5. Explainable Risk Scoring Engine (XAI)

$$\text{Risk Score} = S_{\text{Proximity}} (35) + S_{\text{Severity}} (25) + S_{\text{Motion}} (15) + S_{\text{Persistence}} (15) + S_{\text{Confidence}} (10)$$

| Component | Rule |
|---|---|
| Proximity (35) | 35 inside the track corridor; 14–28 in the warning buffer (closer = more); 0–10 outside, decaying over 20 m |
| Severity (25) | 25 × class severity (elephant 0.95, fallen tree 0.95, vehicle 0.90, cattle 0.80, rock 0.48 …) × zone exposure |
| Motion (15) | on track: 8 stationary / 10–15 moving; approaching: 6–15 by closing speed (×0.4 beyond the 12 s warning horizon) |
| Persistence (15) | 15 × min(1, seconds tracked / 3 s) × zone exposure |
| Confidence (10) | 10 × smoothed detector confidence × zone exposure |

Zone exposure = 1.0 (critical), 0.75 (warning, or predicted entrant), 0.25 (safe).

### Risk Classifications
- **0 – 20**: `SAFE` (Green) · **21 – 40**: `LOW` (Blue) · **41 – 60**: `MEDIUM` (Yellow) · **61 – 80**: `HIGH` (Orange) · **81 – 100**: `CRITICAL` (Red)

### Sample Explainability Output (fallen tree on track - reproduced by `test_risk_engine_matches_readme_sample`)
```json
{
  "risk_score": 91.2,
  "risk_level": "CRITICAL",
  "summary_reason": "CRITICAL: Object directly obstructing rail track & High hazard class: Fallen Tree",
  "contributing_factors": [
    {"factor": "Track Proximity", "points": 35.0, "description": "Object directly obstructing rail track"},
    {"factor": "Hazard Severity", "points": 23.8, "description": "High hazard class: Fallen Tree"},
    {"factor": "Motion Vector", "points": 8.0, "description": "Stationary obstruction on track - will not self-clear"},
    {"factor": "Temporal Persistence", "points": 15.0, "description": "Persisted across 45 frames (~3.0s)"},
    {"factor": "Confidence Rating", "points": 9.4, "description": "AI confidence 94%"}
  ]
}
```

**Track-obstacle policy** (verified live on the Model Performance page): rock on track → HIGH, elephant / cow / fallen tree on track → CRITICAL, cattle 25 m away → SAFE, clear track → safety score 100.

---

## 🚀 6. Quick Start & Local Execution

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm

### Backend
```bash
# 1. Install dependencies (ultralytics pulls in PyTorch; remove it from requirements.txt for a
#    lightweight simulation-only install)
pip install -r requirements.txt

# 2. Seed the database (8 sections, 8 cameras, 3 users, 14 days of history)
python database/seed_data.py            # add --reset to rebuild from scratch

# 3. Start the API + live engine
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
OpenAPI docs: `http://127.0.0.1:8000/docs`. (If you skip step 2, the server seeds an empty database automatically on first start.)

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:3000  (proxies /api and /ws to :8000)
```
`npm run build` produces `frontend/dist`; the FastAPI server then also serves the dashboard itself at `http://127.0.0.1:8000`, so one process is enough for a demo.

### Demo logins
| Role | Username / password | Can |
|---|---|---|
| Admin | `admin` / `admin123` | everything, incl. engine settings |
| Operator | `operator` / `operator123` | acknowledge, sign off, generate reports, trigger scenarios, upload video |
| Viewer | `viewer` / `viewer123` | read-only |

### Demo tips
- **Live Monitoring → Demo Scenario Control** triggers any of 13 scripted hazards (elephant herd crossing, cattle on track, fallen tree, rockfall, landslide, trespasser, level-crossing vehicle, deer dash, wild boar, sloth bear, flood water, forest fire, distant harmless activity) on the selected camera.
- **Upload video** runs real YOLOv8 (COCO weights map elephant/cow/person/car/… onto the hazard taxonomy; put custom weights in `ml/weights/` and set `RAILGUARD_YOLO_WEIGHTS`).
- **Settings** → scenario frequency `HIGH` for a busy live demo, `LOW` for a quiet control room.

### Tests
```bash
python -m pytest backend/tests -q      # vision stages, risk policy, alert escalation, API workflow, PDF
```

---

## 🐳 7. Docker Deployment

```bash
docker compose up --build
# dashboard  -> http://localhost:3000   (nginx, proxies /api and /ws)
# API / docs -> http://localhost:8000/docs
```
Set `RAILGUARD_JWT_SECRET` in the environment for anything beyond a local demo. To use PostgreSQL, set `RAILGUARD_DATABASE_URL` (and add `psycopg[binary]` to the requirements).

### Configuration (environment variables)
| Variable | Default | Purpose |
|---|---|---|
| `RAILGUARD_DATABASE_URL` | `sqlite:///data/railguard.db` | SQLAlchemy URL |
| `RAILGUARD_JWT_SECRET` | dev secret | token signing key |
| `RAILGUARD_YOLO_WEIGHTS` | `yolov8n.pt` | detector weights (searched in repo root and `ml/weights/`) |
| `RAILGUARD_YOLO_CONFIDENCE` | `0.35` | detection threshold |
| `RAILGUARD_SIMULATION_FPS` | `10` | synthetic stream rate |
| `RAILGUARD_DATA_DIR` | `data/` | DB, uploads, snapshots, reports |

---

## 📄 8. The 16 UI Pages

1. **Login** - role-based authentication (Admin / Operator / Viewer).
2. **Control Dashboard** - KPI cards, live canvas preview (follows the riskiest camera), network safety index, alert feed, 24-hour risk index, recent incidents.
3. **Live Monitoring** - stream selector, video upload, ROI / vector / label toggles, live boxes with distance, motion vectors and ETA badges, per-object XAI, scenario control.
4. **Camera Network Manager** - 8 trackside cameras with ONLINE / MAINTENANCE / OFFLINE status, FPS, latency, temperature, uptime.
5. **Incidents Database** - search, filters, sorting, pagination, inline status changes, CSV export.
6. **Incident Detail** - evidence snapshot at peak risk, XAI breakdown, spatial-temporal analysis, escalation timeline, operator notes & sign-off, PDF trigger.
7. **Alerts & Escalation** - notification centre, severity filters, audible chimes, escalation ladder.
8. **Geographical Railway Map** - Leaflet map of the Hassan–Mangaluru ghat line and Konkan sections, coloured by section health, live camera markers, open incidents.
9. **Hazard Analytics** - 12 interactive Recharts charts.
10. **Safety Heatmap** - geographic density, section × hour matrix, section × hazard-class matrix.
11. **Section Health Score** - 0–100 index per section with explainable penalty breakdown and weekly trend.
12. **Model Performance** - Precision, Recall, mAP@50, mAP@50-95, latency, PR and F1 curves, confusion matrix, per-class AP, training curves, classifier comparison, live policy checks.
13. **Dataset Management** - class distribution, splits, augmentations; counts `datasets/hazard_cls/` automatically when present.
14. **PDF Reports Center** - incident audit, daily summary and section health reports.
15. **System Health** - subsystem diagnostics (API, DB, reasoning engine, YOLO detector, feeds, alerts, storage) and audit trail.
16. **Settings & Academic Scope** - engine settings plus problem statement, objectives, methodology, XAI formulation, literature survey, team and future scope.

> **About the model metrics:** the detector figures (P 92.4%, R 89.1%, mAP@50 93.8%, mAP@50-95 74.2%, 14.2 ms) and classifier results (MobileNetV3 84.4% vs XGBoost 37.5% / RF 34.4%) are the values reported in the project presentation, stored in `ml/metrics/model_metrics.json`. Running `ml/train_yolov8.py` / `ml/train_classifiers.py` on your dataset overwrites them with freshly measured numbers.

---

## 🧪 9. Training

```bash
pip install -r requirements-ml.txt
python ml/train_yolov8.py --data ml/data.yaml --model yolov8n.pt --epochs 100   # -> ml/weights/railguard_yolov8.pt
python ml/train_classifiers.py --data datasets/hazard_cls --epochs 25            # MobileNetV3 vs XGBoost vs RF
```

---

## 📁 10. Project Structure

```
backend/app/
  main.py            FastAPI app, lifespan (seed, engine start), SPA hosting
  config.py          environment-driven settings
  models.py          SQLAlchemy models (users, sections, cameras, incidents, alerts, reports, settings, audit)
  auth.py            JWT + bcrypt, role guards, audit helper
  routers/           auth, cameras, incidents, alerts, analytics (dashboard/map/heatmap/health), stream (REST + WS), system
  services/          stream_manager (live loops, incident recorder), pdf_report, health_score, hub (pub/sub)
  vision/            the 7-stage reasoning engine + simulator
backend/tests/       pytest suite
database/seed_data.py
ml/                  training scripts, data.yaml, metrics/, weights/
frontend/src/        pages/ (16), components/, context/, hooks/, lib/ (scene renderer, formatting, sound)
docker-compose.yml, Dockerfile.backend, frontend/Dockerfile, frontend/nginx.conf
```

---

## 🔮 11. Future Extensions

- **Locomotive Edge AI**: Jetson Orin Nano deployment directly on locomotive cabs.
- **Drone Patrol Integration**: autonomous aerial surveillance for remote forest corridors.
- **Multimodal Thermal Cameras**: FLIR / LiDAR fusion for night-time wildlife tracking.
- **Train-to-Control Communication**: 5G / LoRaWAN link to trigger automated braking orders.

---

## 📜 12. License & Citation

Developed for Academic Demonstration & Major Project Defense - Department of AI & DS, NMAMIT (2023-27).
**RailGuard AI System v2.0** — *See the Risk. Predict the Threat. Protect the Track.*
