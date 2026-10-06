"""Benchmark hazard image classifiers on the 5-class dataset.

    python ml/train_classifiers.py --data datasets/hazard_cls --epochs 25

Dataset layout: ``datasets/hazard_cls/<class>/*.jpg`` with classes
clear_track, cows, elephants, rocks, trees.

* MobileNetV3-Small, ImageNet-pretrained, fine-tuned (transfer learning)
* Random Forest and XGBoost on handcrafted features (HSV colour histogram + HOG + edge density)

Results (accuracy / macro precision / macro recall on a stratified 25% test split) are written
to the ``classifiers`` block of ``ml/metrics/model_metrics.json`` for the Model Performance page.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
METRICS = ROOT / "ml" / "metrics" / "model_metrics.json"
EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def load(data_dir: Path):
    paths, labels = [], []
    classes = sorted(d.name for d in data_dir.iterdir() if d.is_dir())
    for ci, c in enumerate(classes):
        for f in sorted((data_dir / c).rglob("*")):
            if f.suffix.lower() in EXT:
                paths.append(f)
                labels.append(ci)
    return paths, np.array(labels), classes


def handcrafted(path: Path) -> np.ndarray:
    img = cv2.resize(cv2.imread(str(path)), (128, 128))
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [8, 4, 4], [0, 180, 0, 256, 0, 256]).flatten()
    hist /= hist.sum() + 1e-6
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    hog = cv2.HOGDescriptor((128, 128), (32, 32), (16, 16), (16, 16), 9).compute(gray).flatten()
    edges = cv2.Canny(gray, 80, 160).mean() / 255.0
    return np.concatenate([hist, hog, [edges]])


def scores(y_true, y_pred) -> dict:
    from sklearn.metrics import accuracy_score, precision_score, recall_score

    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 3),
        "precision": round(float(precision_score(y_true, y_pred, average="macro", zero_division=0)), 3),
        "recall": round(float(recall_score(y_true, y_pred, average="macro", zero_division=0)), 3),
    }


def train_mobilenet(train_p, train_y, test_p, n_cls, epochs: int):
    import torch
    from torch import nn
    from torchvision import models, transforms
    from PIL import Image

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    tf_train = transforms.Compose([transforms.RandomResizedCrop(224, scale=(0.7, 1)), transforms.RandomHorizontalFlip(), transforms.ColorJitter(0.3, 0.3, 0.3), transforms.ToTensor(), transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    tf_test = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(), transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    net = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    net.classifier[3] = nn.Linear(net.classifier[3].in_features, n_cls)
    net.to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=3e-4, weight_decay=1e-4)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
    imgs = [Image.open(p).convert("RGB") for p in train_p]
    for ep in range(epochs):
        net.train()
        perm = np.random.permutation(len(imgs))
        for i in range(0, len(perm), 16):
            idx = perm[i : i + 16]
            x = torch.stack([tf_train(imgs[j]) for j in idx]).to(dev)
            y = torch.tensor(train_y[idx]).to(dev)
            opt.zero_grad()
            loss_fn(net(x), y).backward()
            opt.step()
        print(f"  mobilenet epoch {ep + 1}/{epochs}")
    net.eval()
    with torch.no_grad():
        x = torch.stack([tf_test(Image.open(p).convert("RGB")) for p in test_p]).to(dev)
        return net(x).argmax(1).cpu().numpy()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "datasets" / "hazard_cls"))
    ap.add_argument("--epochs", type=int, default=25)
    args = ap.parse_args()

    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from xgboost import XGBClassifier

    paths, y, classes = load(Path(args.data))
    print(f"{len(paths)} images, classes: {classes}")
    tr, te = train_test_split(np.arange(len(paths)), test_size=0.25, stratify=y, random_state=42)
    feats = np.stack([handcrafted(p) for p in paths])

    results = []
    pred = train_mobilenet([paths[i] for i in tr], y[tr], [paths[i] for i in te], len(classes), args.epochs)
    results.append({"model": "MobileNetV3-Small (transfer learning)", **scores(y[te], pred)})
    xgb = XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.1).fit(feats[tr], y[tr])
    results.append({"model": "XGBoost (handcrafted features)", **scores(y[te], xgb.predict(feats[te]))})
    rf = RandomForestClassifier(n_estimators=300, random_state=42).fit(feats[tr], y[tr])
    results.append({"model": "Random Forest (handcrafted features)", **scores(y[te], rf.predict(feats[te]))})

    for r in results:
        print(f"{r['model']:<42} acc {r['accuracy']:.3f}  P {r['precision']:.3f}  R {r['recall']:.3f}")
    data = json.loads(METRICS.read_text()) if METRICS.exists() else {}
    data["classifiers"] = {"dataset": f"{len(classes)}-class track-hazard image dataset ({', '.join(classes)}; {len(paths)} images)", "results": results}
    METRICS.write_text(json.dumps(data, indent=1))
    print(f"Metrics written to {METRICS}")


if __name__ == "__main__":
    main()
