"""Stage 6 - Explainable (XAI) risk engine.

    Risk = Proximity (35) + Severity (25) + Motion (15) + Persistence (15) + Confidence (10)

Every component is returned as a named factor with its point contribution and a plain-English
justification, so an operator can see *why* an alert fired.

False-positive suppression: severity, persistence and confidence describe *what* the object is,
not whether it endangers the train. They are therefore scaled by a zone-exposure multiplier
(1.0 on track, 0.75 in the warning buffer, 0.25 outside), so a cow grazing 30 m from the line
stays SAFE while the same cow stepping onto the ballast escalates to CRITICAL.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .hazard_classes import HAZARD_CLASSES, STATIC_OBSTRUCTIONS
from .motion import Direction, MotionState
from .roi import CRITICAL_HALF_WIDTH_M, WARNING_HALF_WIDTH_M, Zone

W_PROXIMITY = 35.0
W_SEVERITY = 25.0
W_MOTION = 15.0
W_PERSISTENCE = 15.0
W_CONFIDENCE = 10.0

PERSISTENCE_FULL_S = 3.0
WARNING_BAND_M = WARNING_HALF_WIDTH_M - CRITICAL_HALF_WIDTH_M
SAFE_DECAY_M = 20.0

EXPOSURE = {Zone.CRITICAL: 1.0, Zone.WARNING: 0.75, Zone.SAFE: 0.25}

LEVELS = [(20, "SAFE"), (40, "LOW"), (60, "MEDIUM"), (80, "HIGH"), (100, "CRITICAL")]


def risk_level(score: float) -> str:
    s = round(score)
    for upper, name in LEVELS:
        if s <= upper:
            return name
    return "CRITICAL"


@dataclass
class Factor:
    factor: str
    points: float
    max_points: float
    description: str

    def to_dict(self) -> dict:
        return {
            "factor": self.factor,
            "points": round(self.points, 1),
            "max_points": self.max_points,
            "description": self.description,
        }


@dataclass
class RiskAssessment:
    risk_score: float
    risk_level: str
    summary_reason: str
    contributing_factors: list[Factor] = field(default_factory=list)

    @property
    def safety_score(self) -> float:
        return round(100 - self.risk_score, 1)

    def to_dict(self) -> dict:
        return {
            "risk_score": round(self.risk_score, 1),
            "risk_level": self.risk_level,
            "summary_reason": self.summary_reason,
            "contributing_factors": [f.to_dict() for f in self.contributing_factors],
        }


@dataclass
class RiskInput:
    cls: str
    zone: Zone
    edge_distance_m: float
    confidence: float
    persisted_frames: int
    persisted_s: float
    motion: MotionState


class RiskEngine:
    def assess(self, inp: RiskInput) -> RiskAssessment:
        hz = HAZARD_CLASSES[inp.cls]
        factors: list[Factor] = []

        # --- 1. Track proximity (35) -------------------------------------------------
        if inp.zone == Zone.CRITICAL:
            prox = W_PROXIMITY
            prox_desc = "Object directly obstructing rail track"
        elif inp.zone == Zone.WARNING:
            frac = 1 - min(inp.edge_distance_m, WARNING_BAND_M) / WARNING_BAND_M
            prox = 14 + 14 * frac
            prox_desc = f"Inside warning buffer, {inp.edge_distance_m:.1f} m from track edge"
        else:
            beyond = max(inp.edge_distance_m - WARNING_BAND_M, 0.0)
            prox = 10 * max(0.0, 1 - beyond / SAFE_DECAY_M)
            prox_desc = f"Outside danger zone, {inp.edge_distance_m:.1f} m from track edge"
        factors.append(Factor("Track Proximity", prox, W_PROXIMITY, prox_desc))

        # Predicted entrants are treated as warning-zone exposure: they are about to be there.
        exposure = EXPOSURE[inp.zone]
        if inp.motion.predicted_threat and inp.zone == Zone.SAFE:
            exposure = EXPOSURE[Zone.WARNING]
        exp_note = "" if exposure == 1.0 else f" (x{exposure:.2f} zone exposure)"

        # --- 2. Hazard severity (25) -----------------------------------------------
        sev = W_SEVERITY * hz.severity * exposure
        tier = "High" if hz.severity >= 0.85 else "Moderate" if hz.severity >= 0.45 else "Low"
        factors.append(Factor("Hazard Severity", sev, W_SEVERITY, f"{tier} hazard class: {hz.label}{exp_note}"))

        # --- 3. Motion / trajectory (15) --------------------------------------------
        m = inp.motion
        if inp.zone == Zone.CRITICAL:
            if m.direction == Direction.STATIONARY:
                mot = 8.0
                mot_desc = (
                    "Stationary obstruction on track - will not self-clear"
                    if inp.cls in STATIC_OBSTRUCTIONS
                    else "Stationary on track"
                )
            else:
                mot = min(W_MOTION, 10 + 2.5 * m.speed_mps)
                mot_desc = f"Moving within track corridor at {m.speed_mps:.1f} m/s"
        elif m.direction == Direction.TOWARD_TRACK:
            mot = min(W_MOTION, 6 + 9 * min(1.0, m.closing_speed_mps / 2.0))
            mot_desc = f"Vector toward track at {m.closing_speed_mps:.1f} m/s"
            if m.predicted_threat and m.eta_s is not None:
                mot_desc += f" - predicted entry in {m.eta_s:.1f}s"
            else:
                mot *= 0.4  # approaching, but beyond the early-warning horizon
            if m.trend.value == "ACCELERATING":
                mot = min(W_MOTION, mot + 2)
                mot_desc += ", accelerating"
        elif m.direction == Direction.ALONG_TRACK:
            mot = 4.0 if inp.zone == Zone.WARNING else 1.5
            mot_desc = "Moving parallel to track"
        elif m.direction == Direction.AWAY_FROM_TRACK:
            mot = 0.0
            mot_desc = "Moving away from track"
        else:
            mot = 2.0 if inp.zone == Zone.WARNING else 0.0
            mot_desc = "Stationary beside track" if inp.zone == Zone.WARNING else "Stationary, clear of track"
        factors.append(Factor("Motion Vector", mot, W_MOTION, mot_desc))

        # --- 4. Temporal persistence (15) -------------------------------------------
        pers = W_PERSISTENCE * min(1.0, inp.persisted_s / PERSISTENCE_FULL_S) * exposure
        factors.append(
            Factor(
                "Temporal Persistence",
                pers,
                W_PERSISTENCE,
                f"Persisted across {inp.persisted_frames} frames (~{inp.persisted_s:.1f}s){exp_note}",
            )
        )

        # --- 5. Detection confidence (10) -------------------------------------------
        conf = W_CONFIDENCE * inp.confidence * exposure
        factors.append(Factor("Confidence Rating", conf, W_CONFIDENCE, f"AI confidence {inp.confidence * 100:.0f}%{exp_note}"))

        score = sum(f.points for f in factors)

        # Benign classes (birds) are suppressed regardless of where they appear.
        if hz.category == "BENIGN":
            penalty = -score * 0.7
            factors.append(Factor("Benign Class Suppression", penalty, 0.0, f"{hz.label} is not a track hazard"))
            score += penalty

        score = max(0.0, min(100.0, score))
        level = risk_level(score)
        top = sorted((f for f in factors if f.points > 0), key=lambda f: f.points, reverse=True)[:2]
        reason = f"{level}: " + " & ".join(f.description for f in top) if top else f"{level}: no contributing factors"
        if m.predicted_threat and inp.zone != Zone.CRITICAL:
            reason = f"PREDICTED THREAT - {hz.label} predicted to enter track in {m.eta_s:.1f}s. " + reason
        return RiskAssessment(round(score, 1), level, reason, factors)
