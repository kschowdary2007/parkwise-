from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import joblib
import numpy as np
from PIL import Image, UnidentifiedImageError
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier


ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = ROOT / "data" / "matchbox" / "matchbox_cars_parkinglot"
OUTPUT_DIR = ROOT / "data" / "matchbox_evaluation"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DATASET_VERSION = "ljkeller/matchbox-car-parking-occupancy"


def image_features(path: Path) -> np.ndarray | None:
    try:
        with Image.open(path) as image:
            rgb = image.convert("RGB")
            small = rgb.resize((32, 32), Image.Resampling.BILINEAR)
            pixels = np.asarray(small, dtype=np.float32).reshape(-1) / 255.0
            histogram = []
            for channel in range(3):
                values, _ = np.histogram(np.asarray(rgb)[:, :, channel], bins=16, range=(0, 256), density=True)
                histogram.extend(values)
            return np.concatenate([pixels, np.asarray(histogram, dtype=np.float32)])
    except (UnidentifiedImageError, OSError, ValueError):
        return None


def main() -> dict:
    records = []
    duplicate_count = 0
    seen_hashes = set()
    corrupt_count = 0

    if not DATASET_DIR.exists():
        raise RuntimeError(f"Kaggle image dataset directory not found: {DATASET_DIR}")

    for label_name in ("empty", "occupied"):
        label_dir = DATASET_DIR / label_name
        if not label_dir.exists():
            continue
        for path in sorted(label_dir.glob("*")):
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in seen_hashes:
                duplicate_count += 1
                continue
            seen_hashes.add(digest)
            features = image_features(path)
            if features is None:
                corrupt_count += 1
                continue
            records.append((path, 0 if label_name == "empty" else 1, features))

    if not records:
        raise RuntimeError("No valid image records found in the Kaggle dataset.")

    paths = [item[0] for item in records]
    labels = np.asarray([item[1] for item in records], dtype=np.int8)
    features = np.vstack([item[2] for item in records])

    train_features, remaining_features, train_labels, remaining_labels, train_paths, remaining_paths = train_test_split(
        features, labels, paths, train_size=0.70, random_state=42, stratify=labels
    )
    validation_features, test_features, validation_labels, test_labels, validation_paths, test_paths = train_test_split(
        remaining_features, remaining_labels, remaining_paths, test_size=0.50, random_state=42, stratify=remaining_labels
    )

    scaler = StandardScaler()
    train_scaled = scaler.fit_transform(train_features)
    validation_scaled = scaler.transform(validation_features)
    test_scaled = scaler.transform(test_features)

    models = {
        "Decision Tree": DecisionTreeClassifier(max_depth=12, random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=150, max_depth=20, random_state=42, n_jobs=-1),
        "SVM (Linear)": LinearSVC(C=1.0, random_state=42, dual="auto", max_iter=3000),
        "XGBoost": XGBClassifier(
            n_estimators=150,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.9,
            colsample_bytree=0.9,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
        ),
    }

    comparison = []
    for name, model in models.items():
        training_started = time.perf_counter()
        model.fit(train_scaled, train_labels)
        training_time = time.perf_counter() - training_started
        prediction_started = time.perf_counter()
        predictions = model.predict(test_scaled)
        prediction_time = time.perf_counter() - prediction_started

        tn, fp, fn, tp = confusion_matrix(test_labels, predictions, labels=[0, 1]).ravel()
        precision, recall, f1, _ = precision_recall_fscore_support(test_labels, predictions, average="binary", zero_division=0)
        accuracy = float(np.mean(predictions == test_labels))

        comparison.append({
            "model_name": name,
            "accuracy": round(accuracy * 100, 2),
            "precision": round(float(precision) * 100, 2),
            "recall": round(float(recall) * 100, 2),
            "f1_score": round(float(f1) * 100, 2),
            "training_time_seconds": round(training_time, 6),
            "prediction_time_seconds": round(prediction_time, 6),
            "confusion_matrix": {"true_positive": int(tp), "true_negative": int(tn), "false_positive": int(fp), "false_negative": int(fn)},
        })
        joblib.dump(model, OUTPUT_DIR / f"{name.lower().replace(' ', '_').replace('(', '').replace(')', '')}.joblib")

    joblib.dump(scaler, OUTPUT_DIR / "scaler.joblib")
    comparison.sort(key=lambda row: (row["accuracy"], row["f1_score"]), reverse=True)
    distribution = {
        "available": int(np.sum(labels == 0)),
        "occupied": int(np.sum(labels == 1)),
    }
    result = {
        "dataset": {
            "name": DATASET_VERSION,
            "image_based": True,
            "record_count": len(records),
            "feature_description": "32x32 RGB normalized pixels and 16-bin RGB histograms per channel",
            "target_labels": ["available", "occupied"],
            "missing_values_removed": corrupt_count,
            "duplicate_values_removed": duplicate_count,
            "corrupt_images_removed": corrupt_count,
            "distribution": distribution,
            "sample_records": [
                {"path": str(path.relative_to(ROOT)), "label": "available" if label == 0 else "occupied"}
                for path, label in list(zip(paths[:3], labels[:3])) + list(zip(paths[-3:], labels[-3:]))
            ],
        },
        "dataset_split": {
            "train": len(train_labels),
            "validation": len(validation_labels),
            "test": len(test_labels),
            "train_percent": 70,
            "validation_percent": 15,
            "test_percent": 15,
        },
        "comparison": comparison,
        "best_model": comparison[0]["model_name"] if comparison else None,
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "methodology": "Images were deduplicated, converted to RGB, resized to 32x32, normalized, augmented with RGB histograms, and split with stratified 70/15/15 sampling.",
        "history_available": False,
        "epochs": None,
        "training_accuracy_history": None,
        "validation_accuracy_history": None,
        "training_loss_history": None,
        "validation_loss_history": None,
    }
    (OUTPUT_DIR / "evaluation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(main(), indent=2))
