"""Run the full RailGuard image pipeline (YOLOv8 + scene hazard model + risk engine) on a folder.

    python ml/evaluate_images.py "test rai/test rai"
    python ml/evaluate_images.py my_photos --labels labels.csv

Writes to ml/eval_out/:
  results.csv      one row per image: level, risk, detected objects, top scene scores
  sheet_N.jpg      contact sheets with each prediction printed under its photo

With --labels (CSV with columns `file,expected`) it also scores the run:
  HAZARD  something on the track            -> must be HIGH or CRITICAL
  NEAR    something close to, not on, track -> must be MEDIUM or HIGH (a warning, not "on track")
  CLEAR   clear track                       -> must not be HIGH or CRITICAL
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from backend.app.routers.analyze import _run  # noqa: E402

EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
COLORS = {"SAFE": (94, 197, 34), "LOW": (246, 130, 59), "MEDIUM": (8, 179, 234), "HIGH": (22, 115, 249), "CRITICAL": (68, 68, 239)}  # BGR
FLAGGED = {"HIGH", "CRITICAL"}


def load_bgr(path: Path) -> np.ndarray:
    return cv2.cvtColor(np.array(Image.open(path).convert("RGB")), cv2.COLOR_RGB2BGR)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--labels", help="CSV with columns file,expected (HAZARD or CLEAR)")
    ap.add_argument("--out", default=str(ROOT / "ml" / "eval_out"))
    args = ap.parse_args()

    files = sorted(p for p in Path(args.folder).iterdir() if p.suffix.lower() in EXT)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for i, f in enumerate(files):
        ok, buf = cv2.imencode(".jpg", load_bgr(f))
        r = _run(buf.tobytes())
        rows.append(
            {
                "idx": i,
                "file": f.name,
                "level": r["level"],
                "risk": round(r["max_risk"], 1),
                "objects": "; ".join(f"{o['label']} ({o['zone']}, {round(o['risk']['risk_score'])})" for o in r["objects"][:4]),
                "scene": "; ".join(f"{s['label']} {round(s['score'] * 100)}%" for s in r["scene"][:3]),
            }
        )
        print(f"[{i + 1}/{len(files)}] {f.name[:50]:50s} {r['level']:8s} {r['max_risk']:5.1f}")

    with (out / "results.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # contact sheets, 20 photos each
    W, H, BAND = 300, 200, 46
    for s in range(0, len(rows), 20):
        sheet = np.full((4 * (H + BAND), 5 * W, 3), 20, np.uint8)
        for j, row in enumerate(rows[s : s + 20]):
            y, x = (j // 5) * (H + BAND), (j % 5) * W
            sheet[y : y + H, x : x + W] = cv2.resize(load_bgr(Path(args.folder) / row["file"]), (W, H))
            cv2.rectangle(sheet, (x, y + H), (x + W, y + H + BAND), COLORS[row["level"]], -1)
            cv2.putText(sheet, f"#{row['idx']} {row['level']} {round(row['risk'])}", (x + 4, y + H + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
            cv2.putText(sheet, row["objects"][:44], (x + 4, y + H + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
        cv2.imwrite(str(out / f"sheet_{s // 20}.jpg"), sheet)

    if args.labels:
        expected = {r["file"]: r["expected"].strip().upper() for r in csv.DictReader(open(args.labels, encoding="utf-8"))}
        haz = [r for r in rows if expected.get(r["file"]) == "HAZARD"]
        near = [r for r in rows if expected.get(r["file"]) == "NEAR"]
        clr = [r for r in rows if expected.get(r["file"]) == "CLEAR"]
        tp = sum(r["level"] in FLAGGED for r in haz)
        fp = sum(r["level"] in FLAGGED for r in clr)
        print(f"\nHazard photos flagged HIGH/CRITICAL: {tp}/{len(haz)}" + (f" ({100 * tp / len(haz):.1f}%)" if haz else ""))
        print(f"Clear-track false alarms:            {fp}/{len(clr)}")
        if near:
            ok = sum(r["level"] in ("MEDIUM", "HIGH") for r in near)
            print(f"Near-track objects given a warning:  {ok}/{len(near)}")
            for r in near:
                if r["level"] not in ("MEDIUM", "HIGH"):
                    print(f"  near-track wrong: #{r['idx']} {r['file']} -> {r['level']} | {r['objects']}")
        for r in haz:
            if r["level"] not in FLAGGED:
                print(f"  missed: #{r['idx']} {r['file']} -> {r['level']} | {r['scene']}")
        for r in clr:
            if r["level"] in FLAGGED:
                print(f"  false alarm: #{r['idx']} {r['file']} -> {r['level']} | {r['scene']}")
    print(f"\nResults written to {out}")


if __name__ == "__main__":
    main()
