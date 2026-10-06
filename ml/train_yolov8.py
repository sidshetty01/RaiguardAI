"""Fine-tune YOLOv8 on the RailGuard hazard dataset and publish metrics to the dashboard.

    python ml/train_yolov8.py --data ml/data.yaml --model yolov8n.pt --epochs 100

After training, the best weights are copied to ``ml/weights/railguard_yolov8.pt`` and the
validation metrics (P, R, mAP@50, mAP@50-95, per-class AP, PR curve, confusion matrix,
training curve, latency) overwrite the ``detector`` block of ``ml/metrics/model_metrics.json``
- which is exactly what the Model Performance page renders. Point the backend at the new
weights with ``RAILGUARD_YOLO_WEIGHTS=ml/weights/railguard_yolov8.pt``.
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METRICS = ROOT / "ml" / "metrics" / "model_metrics.json"
LABELS = {
    "elephant": "Elephant", "cattle": "Cattle", "deer": "Deer", "wild_boar": "Wild Boar", "bear": "Sloth Bear",
    "dog": "Stray Dog", "person": "Trespasser", "vehicle": "Vehicle", "motorcycle": "Motorcycle",
    "fallen_tree": "Fallen Tree", "boulder": "Boulder", "rock": "Rock", "landslide_debris": "Landslide Debris", "fire_smoke": "Fire / Smoke",
}


def _downsample(xs, ys, n=51):
    step = max(1, len(xs) // n)
    return [(float(x), float(y)) for x, y in list(zip(xs, ys))[::step]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "ml" / "data.yaml"))
    ap.add_argument("--model", default="yolov8n.pt")
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.model)
    model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=args.device,
                project=str(ROOT / "runs"), name="railguard", exist_ok=True, mosaic=1.0, hsv_v=0.5, fliplr=0.5, scale=0.5)
    run_dir = ROOT / "runs" / "railguard"
    best = run_dir / "weights" / "best.pt"
    (ROOT / "ml" / "weights").mkdir(parents=True, exist_ok=True)
    shutil.copy(best, ROOT / "ml" / "weights" / "railguard_yolov8.pt")

    trained = YOLO(str(best))
    m = trained.val(data=args.data, imgsz=args.imgsz, split="val", plots=False)
    names = m.names
    box = m.box
    per_class = []
    for i, ci in enumerate(box.ap_class_index):
        key = names[int(ci)]
        p, r, ap50, ap = box.class_result(i)
        per_class.append({"cls": key, "label": LABELS.get(key, key), "instances": int(m.nt_per_class[int(ci)]) if hasattr(m, "nt_per_class") else 0,
                          "precision": round(float(p), 3), "recall": round(float(r), 3), "ap50": round(float(ap50), 3), "ap50_95": round(float(ap), 3)})

    pr_curve, f1_curve = [], []
    try:  # curves_results: [PR, F1, P, R] -> (x, y, xlabel, ylabel)
        px, py = box.curves_results[0][0], box.curves_results[0][1].mean(0)
        pr_curve = [{"recall": x, "precision": y} for x, y in _downsample(px, py)]
        fx, fy = box.curves_results[1][0], box.curves_results[1][1].mean(0)
        f1_curve = [{"confidence": x, "f1": y} for x, y in _downsample(fx, fy)]
    except Exception:  # older ultralytics
        pass

    cm = m.confusion_matrix.matrix
    nc = cm.shape[0] - 1
    order = list(range(nc)) + [nc]
    # ultralytics stores [pred, true]; transpose to rows = true class and normalise
    rows = []
    for t in order:
        col = [float(cm[p_, t]) for p_ in order]
        s = sum(col) or 1.0
        rows.append([round(v / s, 3) for v in col])

    curve = []
    results_csv = run_dir / "results.csv"
    if results_csv.exists():
        with results_csv.open() as fh:
            for row in csv.DictReader(fh):
                row = {k.strip(): v for k, v in row.items()}
                curve.append({"epoch": int(float(row["epoch"])) + 1, "box_loss": round(float(row["train/box_loss"]), 3),
                              "cls_loss": round(float(row["train/cls_loss"]), 3), "map50": round(float(row["metrics/mAP50(B)"]), 3)})

    data = json.loads(METRICS.read_text()) if METRICS.exists() else {}
    data["source"] = f"Validation results from ml/train_yolov8.py ({args.model}, {args.epochs} epochs)."
    data["detector"] = {
        "model": f"{Path(args.model).stem} (RailGuard hazard fine-tune)", "input_size": args.imgsz, "epochs": args.epochs, "classes": len(names),
        "precision": round(float(box.mp), 3), "recall": round(float(box.mr), 3), "map50": round(float(box.map50), 3), "map50_95": round(float(box.map), 3),
        "latency_ms": round(float(m.speed.get("inference", 0.0)), 1), "params_m": round(sum(p.numel() for p in trained.model.parameters()) / 1e6, 1), "gflops": 0,
        "per_class": per_class, "pr_curve": pr_curve, "f1_curve": f1_curve,
        "confusion_matrix": {"labels": [LABELS.get(names[i], names[i]) for i in range(nc)] + ["Background"], "matrix": rows},
        "training_curve": curve[::3] or curve,
    }
    METRICS.write_text(json.dumps(data, indent=1))
    print(f"Saved weights to ml/weights/railguard_yolov8.pt and metrics to {METRICS}")


if __name__ == "__main__":
    main()
