"""Formal PDF audit reports generated with ReportLab."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Alert, Incident, utcnow
from ..vision.hazard_classes import HAZARD_CLASSES
from .health_score import all_sections_health

NAVY = colors.HexColor("#0b1424")
ACCENT = colors.HexColor("#0ea5e9")
LEVEL_COLORS = {
    "SAFE": colors.HexColor("#16a34a"),
    "LOW": colors.HexColor("#2563eb"),
    "MEDIUM": colors.HexColor("#ca8a04"),
    "HIGH": colors.HexColor("#ea580c"),
    "CRITICAL": colors.HexColor("#dc2626"),
}
GRID = colors.HexColor("#cbd5e1")
MUTED = colors.HexColor("#475569")

_styles = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=_styles["Heading1"], fontSize=16, textColor=NAVY, spaceAfter=4)
H2 = ParagraphStyle("h2", parent=_styles["Heading2"], fontSize=12, textColor=NAVY, spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("body", parent=_styles["BodyText"], fontSize=9, leading=12)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8, textColor=MUTED)
CENTER = ParagraphStyle("center", parent=SMALL, alignment=TA_CENTER)


def _label(cls: str) -> str:
    hz = HAZARD_CLASSES.get(cls)
    return hz.label if hz else cls


def _fmt(dt: datetime | None) -> str:
    if not dt:
        return "-"
    # stored as UTC; show IST for the Indian Railways control room
    return (dt + timedelta(hours=5, minutes=30)).strftime("%d %b %Y, %H:%M:%S IST")


def _header_footer(title: str):
    def draw(canvas, doc):
        canvas.saveState()
        w, h = A4
        canvas.setFillColor(NAVY)
        canvas.rect(0, h - 22 * mm, w, 22 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(15 * mm, h - 12 * mm, "RailGuard AI")
        canvas.setFont("Helvetica", 8.5)
        canvas.drawString(15 * mm, h - 17 * mm, "Autonomous Railway Track Safety Monitoring - Control Room")
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawRightString(w - 15 * mm, h - 12 * mm, title)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(w - 15 * mm, h - 17 * mm, f"Generated {_fmt(utcnow())}")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica-Oblique", 7.5)
        canvas.drawString(15 * mm, 10 * mm, f"RailGuard AI System v{settings.version} - {settings.tagline}")
        canvas.drawRightString(w - 15 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def _kv_table(rows: list[tuple[str, str]], col=(45 * mm, 45 * mm)) -> Table:
    # two key/value pairs per row
    data = []
    for i in range(0, len(rows), 2):
        pair = rows[i : i + 2]
        line = []
        for k, v in pair:
            line += [Paragraph(f"<b>{k}</b>", SMALL), Paragraph(str(v), BODY)]
        while len(line) < 4:
            line += ["", ""]
        data.append(line)
    t = Table(data, colWidths=[col[0] * 0.7, col[1] * 1.25, col[0] * 0.7, col[1] * 1.25])
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, GRID),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f1f5f9")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def _grid_table(data: list[list], widths: list[float], header_bg=NAVY) -> Table:
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.4, GRID),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def _risk_badge(score: float, level: str) -> Table:
    t = Table([[f"RISK {score:.0f}/100", level]], colWidths=[40 * mm, 30 * mm], rowHeights=[10 * mm])
    c = LEVEL_COLORS.get(level, MUTED)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), c),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 12),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def _factor_chart(factors: list[dict]) -> Drawing:
    w, row = 170 * mm, 9 * mm
    d = Drawing(w, row * len(factors) + 4)
    bar_x, bar_w = 52 * mm, 80 * mm
    for i, f in enumerate(factors):
        y = d.height - (i + 1) * row
        d.add(String(0, y + 3, f["factor"], fontSize=8, fontName="Helvetica-Bold"))
        maxp = f.get("max_points") or 1
        d.add(Rect(bar_x, y + 1, bar_w, 5 * mm, fillColor=colors.HexColor("#e2e8f0"), strokeColor=None))
        pts = f["points"]
        frac = max(0.0, min(1.0, abs(pts) / maxp)) if maxp else min(1.0, abs(pts) / 35)
        col = colors.HexColor("#64748b") if pts < 0 else ACCENT
        d.add(Rect(bar_x, y + 1, bar_w * frac, 5 * mm, fillColor=col, strokeColor=None))
        sign = "+" if pts >= 0 else ""
        d.add(String(bar_x + bar_w + 3 * mm, y + 3, f"{sign}{pts:.1f} / {maxp:g}", fontSize=8))
    return d


def _clip_poly(poly: list, w: float, h: float) -> list:
    """Sutherland-Hodgman clip of a polygon to the image rectangle."""
    def clip(pts, inside, cut):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
        return out

    def at_x(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) or 1e-9))

    def at_y(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) or 1e-9), y)

    pts = [tuple(p) for p in poly]
    for inside, cut in (
        (lambda p: p[0] >= 0, at_x(0)),
        (lambda p: p[0] <= w, at_x(w)),
        (lambda p: p[1] >= 0, at_y(0)),
        (lambda p: p[1] <= h, at_y(h)),
    ):
        pts = clip(pts, inside, cut) if pts else pts
    return pts


def _scene_drawing(snapshot: dict, focus: int | None) -> Drawing:
    cam = snapshot.get("camera", {})
    W, H = cam.get("width", 1280), cam.get("height", 720)
    scale = (150 * mm) / W
    d = Drawing(W * scale, H * scale)

    def tp(x, y):  # image coords -> drawing coords (flip y)
        return x * scale, (H - y) * scale

    hy = cam.get("horizon_y", H * 0.42)
    d.add(Rect(0, 0, W * scale, H * scale, fillColor=colors.HexColor("#1e3a2a"), strokeColor=None))
    d.add(Rect(0, (H - hy) * scale, W * scale, hy * scale, fillColor=colors.HexColor("#1e293b"), strokeColor=None))
    for key, fill, stroke in (("warning", "#facc1533", "#facc15"), ("critical", "#ef444455", "#ef4444")):
        poly = snapshot.get("roi", {}).get(key)
        if poly:
            pts = []
            for x, y in _clip_poly(poly, W, H):
                pts += list(tp(x, y))
            if len(pts) >= 6:
                d.add(Polygon(pts, fillColor=colors.HexColor(fill, hasAlpha=True), strokeColor=colors.HexColor(stroke), strokeWidth=0.8))
    if cam:
        f, mh = cam.get("focal_px", 1000), cam.get("mount_height_m", 5)
        for xm in (-0.838, 0.838):
            x1, y1 = W / 2 + f * xm / 14, hy + f * mh / 14
            x2, y2 = W / 2 + f * xm / 220, hy + f * mh / 220
            d.add(Line(*tp(x1, y1), *tp(x2, y2), strokeColor=colors.HexColor("#cbd5e1"), strokeWidth=1.2))
    for o in snapshot.get("objects", []):
        x1, y1, x2, y2 = o["bbox"]
        lvl = o["risk"]["risk_level"]
        c = LEVEL_COLORS.get(lvl, MUTED)
        bx, by = tp(x1, y2)
        d.add(Rect(bx, by, (x2 - x1) * scale, (y2 - y1) * scale, fillColor=None, strokeColor=c, strokeWidth=2 if o["track_id"] == focus else 1))
        d.add(String(bx, by + (y2 - y1) * scale + 2, f"#{o['track_id']} {o['label']} {o['risk']['risk_score']:.0f}", fontSize=6.5, fillColor=colors.white))
    return d


def build_incident_report(db: Session, inc: Incident, author: str) -> Path:
    path = settings.reports_dir / f"{inc.code}.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=28 * mm, bottomMargin=18 * mm)
    story: list = []
    story.append(Paragraph(f"Incident Audit Report - {inc.code}", H1))
    story.append(Paragraph(f"{_label(inc.hazard_class)} hazard detected by {inc.camera.name} on {inc.section.name}.", BODY))
    story.append(Spacer(1, 4 * mm))
    story.append(_risk_badge(inc.risk_score, inc.risk_level))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(f"<b>Summary reason:</b> {inc.summary_reason}", BODY))

    story.append(Paragraph("1. Incident Details", H2))
    story.append(
        _kv_table(
            [
                ("Incident ID", inc.code),
                ("Status", inc.status),
                ("Detected at", _fmt(inc.detected_at)),
                ("Last updated", _fmt(inc.updated_at)),
                ("Camera", f"{inc.camera_id} - {inc.camera.name}"),
                ("Section", f"{inc.section_id} - {inc.section.name}"),
                ("Km marker", f"{inc.camera.km_marker:.1f}"),
                ("Source", inc.source),
                ("Hazard class", _label(inc.hazard_class)),
                ("Danger zone", inc.zone),
                ("Distance ahead", f"{inc.distance_m:.1f} m"),
                ("Distance to track", f"{inc.edge_distance_m:.1f} m"),
                ("Motion", inc.motion_direction.replace("_", " ").title()),
                ("Speed", f"{inc.speed_mps:.2f} m/s"),
                ("Predicted entry", f"{inc.predicted_entry_s:.1f} s" if inc.predicted_entry_s else ("Predicted threat" if inc.predicted_threat else "-")),
                ("AI confidence", f"{inc.confidence * 100:.1f}%"),
                ("Frames persisted", str(inc.frames_persisted)),
                ("Response time", f"{inc.response_time_s:.0f} s" if inc.response_time_s else "-"),
            ]
        )
    )

    story.append(Paragraph("2. Explainable Risk Breakdown (XAI)", H2))
    story.append(Paragraph("Risk = Proximity (35) + Severity (25) + Motion (15) + Persistence (15) + Confidence (10)", SMALL))
    factors = inc.factors or []
    if factors:
        story.append(_factor_chart(factors))
        data = [["Factor", "Points", "Max", "Justification"]]
        for f in factors:
            data.append([f["factor"], f"{f['points']:+.1f}", f"{f.get('max_points', 0):g}", Paragraph(f["description"], SMALL)])
        data.append(["Total", f"{inc.risk_score:.1f}", "100", Paragraph(f"<b>{inc.risk_level}</b>", SMALL)])
        story.append(_grid_table(data, [38 * mm, 18 * mm, 14 * mm, 110 * mm]))

    evidence: list = [Paragraph("3. Evidence Snapshot", H2)]
    img = settings.snapshots_dir / inc.snapshot_path if inc.snapshot_path else None
    if img and img.exists():
        evidence.append(Image(str(img), width=150 * mm, height=84 * mm, kind="proportional"))
    elif inc.snapshot:
        evidence.append(_scene_drawing(inc.snapshot, inc.snapshot.get("focus_track_id")))
        evidence.append(Spacer(1, 2 * mm))
        evidence.append(Paragraph("Reconstructed scene at peak risk: red = critical (track) zone, yellow = warning buffer.", CENTER))
    else:
        evidence.append(Paragraph("No evidence snapshot stored for this incident.", SMALL))
    story.append(KeepTogether(evidence))

    story.append(Paragraph("4. Alert & Escalation Timeline", H2))
    alerts = db.scalars(select(Alert).where(Alert.incident_id == inc.id).order_by(Alert.created_at)).all()
    if alerts:
        data = [["Time", "Level", "Event", "Stage / Recipient", "Ack"]]
        for a in alerts:
            data.append(
                [
                    _fmt(a.created_at).replace(" IST", ""),
                    a.level,
                    Paragraph(a.title, SMALL),
                    Paragraph(f"{a.escalation_stage} - {a.escalated_to}", SMALL),
                    a.acknowledged_by or "-",
                ]
            )
        story.append(_grid_table(data, [38 * mm, 18 * mm, 62 * mm, 44 * mm, 18 * mm]))
    else:
        story.append(Paragraph("No alerts were raised for this incident.", SMALL))

    story.append(Paragraph("5. Operator Notes & Sign-off", H2))
    story.append(Paragraph(inc.operator_notes or "<i>No operator notes recorded.</i>", BODY))
    story.append(Spacer(1, 4 * mm))
    story.append(
        KeepTogether(
            _kv_table(
                [
                    ("Signed off by", inc.signed_off_by or "Pending"),
                    ("Signed off at", _fmt(inc.signed_off_at)),
                    ("Report prepared by", author),
                    ("Resolved at", _fmt(inc.resolved_at)),
                ]
            )
        )
    )
    doc.build(story, onFirstPage=_header_footer("Incident Audit Report"), onLaterPages=_header_footer("Incident Audit Report"))
    return path


def build_daily_summary(db: Session, author: str, hours: int = 24) -> Path:
    now = utcnow()
    since = now - timedelta(hours=hours)
    stamp = now.strftime("%Y%m%d-%H%M%S")
    path = settings.reports_dir / f"DAILY-{stamp}.pdf"
    incs = db.scalars(select(Incident).where(Incident.detected_at >= since).order_by(Incident.risk_score.desc())).all()
    alerts = db.scalars(select(Alert).where(Alert.created_at >= since)).all()

    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=28 * mm, bottomMargin=18 * mm)
    story: list = [Paragraph(f"Daily Safety Summary - last {hours} hours", H1)]
    story.append(Paragraph(f"Window: {_fmt(since)} to {_fmt(now)}", SMALL))
    levels = Counter(i.risk_level for i in incs)
    resp = [i.response_time_s for i in incs if i.response_time_s]
    story.append(Paragraph("Key Indicators", H2))
    story.append(
        _kv_table(
            [
                ("Incidents", str(len(incs))),
                ("Alerts raised", str(len(alerts))),
                ("Critical", str(levels.get("CRITICAL", 0))),
                ("High", str(levels.get("HIGH", 0))),
                ("Predicted threats", str(sum(1 for i in incs if i.predicted_threat))),
                ("Escalations", str(sum(1 for a in alerts if a.kind == "ESCALATED"))),
                ("Open / acknowledged", str(sum(1 for i in incs if i.status in ("OPEN", "ACKNOWLEDGED")))),
                ("Mean response", f"{sum(resp) / len(resp):.0f} s" if resp else "-"),
            ]
        )
    )
    story.append(Paragraph("Incidents by Hazard Class", H2))
    by_cls = Counter(i.hazard_class for i in incs)
    data = [["Hazard class", "Incidents", "Critical", "Max risk"]]
    for cls, n in by_cls.most_common():
        sub = [i for i in incs if i.hazard_class == cls]
        data.append([_label(cls), n, sum(1 for i in sub if i.risk_level == "CRITICAL"), f"{max(i.risk_score for i in sub):.0f}"])
    story.append(_grid_table(data, [70 * mm, 35 * mm, 35 * mm, 40 * mm]) if len(data) > 1 else Paragraph("No incidents.", SMALL))

    story.append(Paragraph("Incidents by Section", H2))
    by_sec = Counter(i.section_id for i in incs)
    data = [["Section", "Incidents"]] + [[s, n] for s, n in by_sec.most_common()]
    story.append(_grid_table(data, [120 * mm, 60 * mm]) if len(data) > 1 else Paragraph("No incidents.", SMALL))

    story.append(Paragraph("Top 15 Highest-Risk Incidents", H2))
    data = [["Incident", "Time", "Class", "Camera", "Risk", "Status"]]
    for i in incs[:15]:
        data.append([i.code, _fmt(i.detected_at).replace(" IST", ""), _label(i.hazard_class), i.camera_id, f"{i.risk_score:.0f} {i.risk_level}", i.status])
    story.append(_grid_table(data, [32 * mm, 38 * mm, 30 * mm, 20 * mm, 30 * mm, 30 * mm]) if len(data) > 1 else Paragraph("No incidents.", SMALL))
    doc.build(story, onFirstPage=_header_footer("Daily Safety Summary"), onLaterPages=_header_footer("Daily Safety Summary"))
    return path


def build_section_health_report(db: Session, author: str) -> Path:
    now = utcnow()
    path = settings.reports_dir / f"HEALTH-{now.strftime('%Y%m%d-%H%M%S')}.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=28 * mm, bottomMargin=18 * mm)
    story: list = [Paragraph("Railway Section Safety Health Report", H1), Paragraph("Rolling 7-day window. Health = 100 - capped, explainable penalties.", SMALL)]
    rows = all_sections_health(db)
    data = [["Section", "Terrain", "Score", "Grade", "Incidents", "Critical", "Unresolved"]]
    for r in rows:
        data.append([Paragraph(f"{r['section_id']} - {r['name']}", SMALL), r["terrain"], f"{r['score']:.0f}", f"{r['grade']} ({r['rating']})", r["incidents"], r["critical"], r["unresolved"]])
    story.append(Spacer(1, 3 * mm))
    story.append(_grid_table(data, [55 * mm, 22 * mm, 16 * mm, 30 * mm, 20 * mm, 18 * mm, 20 * mm]))
    for r in rows:
        story.append(Paragraph(f"{r['section_id']} - {r['name']}: {r['score']:.0f}/100 ({r['rating']})", H2))
        data = [["Penalty factor", "Penalty", "Cap", "Reason"]]
        for f in r["factors"]:
            data.append([f["factor"], f"-{f['penalty']:.1f}", f"{f['max_penalty']:g}", Paragraph(f["description"], SMALL)])
        story.append(_grid_table(data, [40 * mm, 20 * mm, 15 * mm, 105 * mm]))
    doc.build(story, onFirstPage=_header_footer("Section Health Report"), onLaterPages=_header_footer("Section Health Report"))
    return path
