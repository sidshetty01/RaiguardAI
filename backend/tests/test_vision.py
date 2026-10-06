"""Unit tests for the RailGuard reasoning stages."""
from backend.app.vision.alert_engine import AlertEngine, AlertLevel, DecisionKind, level_for
from backend.app.vision.distance import DistanceEstimator
from backend.app.vision.geometry import CameraModel, distance_to_polygon, iou, point_in_polygon
from backend.app.vision.motion import Direction, MotionState
from backend.app.vision.pipeline import VisionPipeline
from backend.app.vision.risk_engine import RiskEngine, RiskInput, risk_level
from backend.app.vision.roi import TrackROI, Zone
from backend.app.vision.simulator import SCENARIO_KEYS, SceneSimulator, build_scenario
from backend.app.vision.tracker import CentroidIoUTracker, Detection

CAM = CameraModel()


def test_geometry_helpers():
    sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert point_in_polygon((5, 5), sq)
    assert not point_in_polygon((15, 5), sq)
    assert distance_to_polygon((15, 5), sq) == 5
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1
    assert iou((0, 0, 10, 10), (20, 20, 30, 30)) == 0


def test_roi_zones_follow_ground_point():
    roi = TrackROI.from_camera(CAM)

    def box_at(x_m, z_m, h=1.5):
        u, v = CAM.project(x_m, z_m)
        hp = CAM.focal_px * h / z_m
        return (u - hp / 2, v - hp, u + hp / 2, v)

    assert roi.classify(box_at(0.0, 40)).zone == Zone.CRITICAL
    assert roi.classify(box_at(5.0, 40)).zone == Zone.WARNING
    far = roi.classify(box_at(20.0, 40))
    assert far.zone == Zone.SAFE and far.edge_distance_px > 0


def test_pinhole_distance_recovers_depth():
    est = DistanceEstimator(CAM)
    for z in (20, 50, 100):
        u, v = CAM.project(0, z)
        h = CAM.focal_px * 2.8 / z  # elephant height
        d = est.estimate("elephant", (u - h / 2, v - h, u + h / 2, v))
        assert abs(d - z) / z < 0.05


def test_tracker_keeps_identity_and_drops_lost_tracks():
    tr = CentroidIoUTracker(max_disappeared=2)
    ids = set()
    for k in range(10):
        active = tr.update([Detection("cattle", (100 + 4 * k, 300, 160 + 4 * k, 340), 0.9)], k * 0.1)
        ids.update(t.track_id for t in active)
    assert ids == {1}
    for k in range(4):
        tr.update([], 1 + k * 0.1)
    assert not tr.tracks


def test_risk_engine_matches_readme_sample():
    r = RiskEngine().assess(
        RiskInput("fallen_tree", Zone.CRITICAL, 0.0, 0.94, 45, 3.0, MotionState(direction=Direction.STATIONARY))
    )
    pts = {f.factor: round(f.points, 1) for f in r.contributing_factors}
    assert pts["Track Proximity"] == 35.0
    assert pts["Hazard Severity"] == 23.8
    assert pts["Temporal Persistence"] == 15.0
    assert pts["Confidence Rating"] == 9.4
    assert r.risk_level == "CRITICAL" and round(r.risk_score) == 91


def test_track_obstacle_policy():
    eng = RiskEngine()
    still = MotionState(direction=Direction.STATIONARY)
    assert eng.assess(RiskInput("rock", Zone.CRITICAL, 0, 0.99, 45, 3.0, still)).risk_level == "HIGH"
    for cls in ("elephant", "cattle", "fallen_tree"):
        assert eng.assess(RiskInput(cls, Zone.CRITICAL, 0, 0.95, 45, 3.0, still)).risk_level == "CRITICAL"


def test_false_positive_suppression():
    eng = RiskEngine()
    far = eng.assess(RiskInput("cattle", Zone.SAFE, 25.0, 0.95, 60, 6.0, MotionState()))
    assert far.risk_level == "SAFE"
    bird = eng.assess(RiskInput("bird", Zone.CRITICAL, 0, 0.9, 45, 3.0, MotionState(direction=Direction.ON_TRACK_MOVING, speed_mps=3)))
    assert bird.risk_score <= 40


def test_risk_levels():
    assert [risk_level(s) for s in (10, 30, 50, 70, 90)] == ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


def test_alert_engine_raise_upgrade_escalate_ack():
    ae = AlertEngine()
    assert level_for(30, True) == AlertLevel.WARNING
    d = ae.evaluate("C", 1, 45, True, 0)
    assert d[0].kind == DecisionKind.PREDICTED
    d = ae.evaluate("C", 1, 90, False, 1)
    assert d[0].kind == DecisionKind.UPGRADED and d[0].level == AlertLevel.CRITICAL
    assert ae.evaluate("C", 1, 90, False, 5) == []
    d = ae.evaluate("C", 1, 90, False, 22)
    assert d[0].kind == DecisionKind.ESCALATED and d[0].stage == 2
    ae.acknowledge(("C", 1))
    assert ae.evaluate("C", 1, 90, False, 100) == []


def _run(key: str, seed: int = 3):
    sim = SceneSimulator(CAM, seed=seed)
    sim.trigger(key)
    pipe = VisionPipeline(CAM)
    t, peak, predicted = 0.0, {}, False
    while sim.scenario is not None and t < 120:
        t += 0.1
        fa = pipe.process(sim.step(0.1), t)
        for o in fa.objects:
            peak[o.cls] = max(peak.get(o.cls, 0), o.risk_score)
            predicted |= o.motion["predicted_threat"]
    return peak, predicted


def test_simulated_elephant_crossing_is_predicted_then_critical():
    peak, predicted = _run("elephant_crossing")
    assert predicted
    assert peak["elephant"] > 80


def test_simulated_distant_activity_stays_safe():
    peak, _ = _run("distant_wildlife")
    assert max(peak.values()) <= 40


def test_all_scenarios_build():
    import random

    for k in SCENARIO_KEYS:
        assert build_scenario(k, random.Random(1)).actors
