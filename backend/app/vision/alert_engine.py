"""Stage 7 - Centralised alert & escalation engine.

Maps risk to alert levels (INFO / WARNING / HIGH / CRITICAL), de-duplicates per tracked
object, upgrades an alert when risk climbs, and escalates unacknowledged HIGH/CRITICAL
alerts up the chain of command on a timer.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class AlertLevel(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


LEVEL_ORDER = {AlertLevel.INFO: 1, AlertLevel.WARNING: 2, AlertLevel.HIGH: 3, AlertLevel.CRITICAL: 4}

ESCALATION_CHAIN = [
    "Control Room Operator",
    "Station Master",
    "Divisional Safety Control",
    "Loco Pilot - Caution/Stop Order",
]

# seconds an alert may remain unacknowledged at a given level before escalating one stage
ESCALATION_AFTER_S = {AlertLevel.CRITICAL: 20.0, AlertLevel.HIGH: 45.0}


def level_for(risk_score: float, predicted_threat: bool) -> AlertLevel | None:
    s = round(risk_score)
    if s >= 81:
        lvl = AlertLevel.CRITICAL
    elif s >= 61:
        lvl = AlertLevel.HIGH
    elif s >= 41:
        lvl = AlertLevel.WARNING
    elif s >= 21:
        lvl = AlertLevel.INFO
    else:
        lvl = None
    if predicted_threat and (lvl is None or LEVEL_ORDER[lvl] < LEVEL_ORDER[AlertLevel.WARNING]):
        lvl = AlertLevel.WARNING
    return lvl


class DecisionKind(str, Enum):
    RAISED = "RAISED"
    PREDICTED = "PREDICTED"
    UPGRADED = "UPGRADED"
    ESCALATED = "ESCALATED"


@dataclass
class AlertDecision:
    key: tuple[str, int]
    kind: DecisionKind
    level: AlertLevel
    stage: int
    escalated_to: str
    predicted: bool


@dataclass
class _State:
    level: AlertLevel
    stage: int
    level_since: float
    last_escalation: float
    acknowledged: bool = False


class AlertEngine:
    def __init__(self, min_level: AlertLevel = AlertLevel.WARNING):
        # INFO-level conditions are shown on the live view but not pushed as alerts
        self.min_level = min_level
        self._state: dict[tuple[str, int], _State] = {}

    def acknowledge(self, key: tuple[str, int]) -> None:
        st = self._state.get(key)
        if st:
            st.acknowledged = True

    def forget(self, key: tuple[str, int]) -> None:
        self._state.pop(key, None)

    def evaluate(self, camera_id: str, track_id: int, risk_score: float, predicted_threat: bool, now: float) -> list[AlertDecision]:
        key = (camera_id, track_id)
        lvl = level_for(risk_score, predicted_threat)
        st = self._state.get(key)
        out: list[AlertDecision] = []

        if lvl is None or LEVEL_ORDER[lvl] < LEVEL_ORDER[self.min_level]:
            return out

        if st is None:
            kind = DecisionKind.PREDICTED if predicted_threat and lvl == AlertLevel.WARNING else DecisionKind.RAISED
            self._state[key] = _State(lvl, 1, now, now)
            out.append(AlertDecision(key, kind, lvl, 1, ESCALATION_CHAIN[0], predicted_threat))
            return out

        if LEVEL_ORDER[lvl] > LEVEL_ORDER[st.level]:
            st.level = lvl
            st.level_since = now
            st.last_escalation = now
            st.acknowledged = False  # a worse condition needs a fresh acknowledgement
            out.append(AlertDecision(key, DecisionKind.UPGRADED, lvl, st.stage, ESCALATION_CHAIN[st.stage - 1], predicted_threat))
            return out

        wait = ESCALATION_AFTER_S.get(st.level)
        if wait and not st.acknowledged and st.stage < len(ESCALATION_CHAIN) and now - st.last_escalation >= wait:
            st.stage += 1
            st.last_escalation = now
            out.append(
                AlertDecision(key, DecisionKind.ESCALATED, st.level, st.stage, ESCALATION_CHAIN[st.stage - 1], predicted_threat)
            )
        return out
