from __future__ import annotations

import base64
import csv
import json
import math
import os
import tempfile
import threading
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models import OccupancyHistory, ParkingSpace, VehicleDetectionRecord, YoloModelEvaluation

router = APIRouter(prefix='/api/ai/vehicle-detections', tags=['AI vehicle detection'])
settings = get_settings()
VEHICLE_CLASSES = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}
EXPECTED_MODELS = ('YOLOv8n', 'YOLOv8s', 'YOLOv8m', 'YOLOv8l')
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = PROJECT_ROOT / 'data' / 'coco_vehicle_benchmark' / 'dataset' / 'coco2017-subset.yaml'
VIDEO_DIRECTORY = Path(__file__).resolve().parents[2] / 'media' / 'processed'
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_VIDEO_INFERENCES = 600
_captures: dict[str, Any] = {}
_capture_lock = threading.Lock()
_model_locks: dict[str, threading.Lock] = {}
_model_lock = threading.Lock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _load_json_setting(value: str, name: str) -> dict[str, Any]:
    try:
        result = json.loads(value or '{}')
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f'{name} must contain a JSON object.') from exc
    if not isinstance(result, dict):
        raise HTTPException(status_code=500, detail=f'{name} must contain a JSON object.')
    return result


def _configured_models() -> dict[str, str]:
    configured = _load_json_setting(settings.yolo_model_variants, 'YOLO_MODEL_VARIANTS')
    models = {str(name): str(path) for name, path in configured.items() if path}
    if settings.yolo_model_path:
        models.setdefault('YOLOv8n', settings.yolo_model_path)
    if not models:
        weights_dir = PROJECT_ROOT / 'data' / 'coco_vehicle_benchmark' / 'weights'
        models = {
            name: str(weights_dir / f'{name.lower()}.pt')
            for name in EXPECTED_MODELS
            if (weights_dir / f'{name.lower()}.pt').is_file()
        }
    return models


def _evaluation_dataset() -> Path | None:
    dataset = Path(settings.yolo_dataset_yaml) if settings.yolo_dataset_yaml else DEFAULT_DATASET
    return dataset if dataset.is_file() else None


def has_configured_yolo_models() -> bool:
    return any(Path(path).is_file() for path in _configured_models().values())


def has_evaluation_dataset() -> bool:
    return _evaluation_dataset() is not None


def _training_loss_history(weights: str) -> list[dict[str, float | int | None]]:
    configured_path = Path(settings.yolo_training_results_path) if settings.yolo_training_results_path else None
    run_directory = Path(weights).parent.parent
    candidates = [configured_path, run_directory / 'results.csv']
    results_file = next((path for path in candidates if path and path.is_file()), None)
    if results_file is None:
        return []

    with results_file.open(newline='', encoding='utf-8-sig') as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames:
            return []
        rows = []
        for index, raw_row in enumerate(reader):
            row = {str(key).strip(): (value.strip() if value else '') for key, value in raw_row.items() if key}

            def total_loss(prefix: str) -> float | None:
                keys = [key for key in row if key.startswith(f'{prefix}/') and key.endswith('_loss')]
                if not keys or any(row[key] == '' for key in keys):
                    return None
                try:
                    return round(sum(float(row[key]) for key in keys), 6)
                except ValueError:
                    return None

            try:
                epoch = int(float(row.get('epoch', index)))
            except ValueError:
                epoch = index
            training_loss = total_loss('train')
            validation_loss = total_loss('val')
            if training_loss is not None or validation_loss is not None:
                rows.append({
                    'epoch': epoch + 1,
                    'training_loss': training_loss,
                    'validation_loss': validation_loss,
                })
    return rows


def _confusion_matrix_payload(matrix: Any, model_names: dict[int, str], np: Any) -> dict[str, Any] | None:
    if matrix is None:
        return None
    values = np.asarray(matrix)
    if values.ndim != 2 or values.shape[0] != values.shape[1]:
        return None
    labels = [str(label) for _, label in sorted(model_names.items())]
    if values.shape[0] > len(labels):
        labels.extend(['background'] * (values.shape[0] - len(labels)))
    labels = labels[:values.shape[0]]
    active = np.flatnonzero(values.sum(axis=0) + values.sum(axis=1))
    if not len(active):
        return None
    return {
        'labels': [labels[index] for index in active],
        'values': values[np.ix_(active, active)].tolist(),
    }


@lru_cache(maxsize=8)
def _model(weights: str) -> Any:
    if not weights:
        raise HTTPException(status_code=503, detail='YOLO weights are not configured. Set YOLO_MODEL_PATH.')
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise HTTPException(status_code=503, detail='Ultralytics is not installed. Install backend requirements first.') from exc
    try:
        return YOLO(weights)
    except (OSError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=f'Unable to load YOLO weights: {exc}') from exc


def _selected_weights(model_name: str | None = None) -> str:
    configured = _configured_models()
    if model_name:
        weights = configured.get(model_name)
        if not weights:
            raise HTTPException(status_code=404, detail=f'{model_name} has no configured weights.')
        return weights
    if settings.yolo_model_path:
        return settings.yolo_model_path
    if 'YOLOv8n' in configured:
        return configured['YOLOv8n']
    if configured:
        return next(iter(configured.values()))
    raise HTTPException(status_code=503, detail='YOLO weights are not configured. Set YOLO_MODEL_PATH.')


def _parking_rois() -> dict[str, tuple[float, float, float, float]]:
    raw = _load_json_setting(settings.yolo_parking_rois, 'YOLO_PARKING_ROIS')
    rois: dict[str, tuple[float, float, float, float]] = {}
    for code, bounds in raw.items():
        if (not isinstance(bounds, list) or len(bounds) != 4
                or any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in bounds)):
            raise HTTPException(status_code=500, detail=f'Invalid normalized ROI for parking space {code}.')
        x1, y1, x2, y2 = bounds
        if not (0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1):
            raise HTTPException(status_code=500, detail=f'ROI for parking space {code} must be normalized to [0, 1].')
        rois[str(code)] = (float(x1), float(y1), float(x2), float(y2))
    return rois


def _vision_libraries() -> tuple[Any, Any]:
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise HTTPException(status_code=503, detail='OpenCV and NumPy are required for vehicle detection. Install backend requirements first.') from exc
    return cv2, np


def _infer(image: Any, model_name: str | None = None) -> tuple[Any, list[dict[str, Any]], float]:
    weights = _selected_weights(model_name)
    model = _model(weights)
    with _model_lock:
        inference_lock = _model_locks.setdefault(weights, threading.Lock())
    model_names = model.names if isinstance(model.names, dict) else dict(enumerate(model.names))
    aliases = {'motorbike': 'motorcycle', 'bike': 'motorcycle'}
    class_ids = []
    for class_id, class_name in model_names.items():
        normalized = str(class_name).lower()
        normalized = aliases.get(normalized, normalized)
        if normalized in VEHICLE_CLASSES.values():
            class_ids.append(int(class_id))
    if not class_ids:
        raise HTTPException(status_code=422, detail='The configured YOLO model has no car, motorcycle, bus, or truck classes.')
    with inference_lock:
        started = time.perf_counter()
        result = model.predict(image, classes=class_ids, verbose=False)[0]
        inference_ms = (time.perf_counter() - started) * 1000
    height, width = image.shape[:2]
    detections = []
    for box in result.boxes:
        class_id = int(box.cls[0].item())
        vehicle_class = aliases.get(str(result.names.get(class_id, '')).lower(), str(result.names.get(class_id, '')).lower())
        if not vehicle_class:
            continue
        x1, y1, x2, y2 = (float(value) for value in box.xyxy[0].tolist())
        detections.append({
            'vehicle_class': vehicle_class,
            'confidence': float(box.conf[0].item()),
            'bbox': [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
            'center': [(x1 + x2) / (2 * width), (y1 + y2) / (2 * height)],
        })
    return result, detections, inference_ms


def _encode_image(image: Any) -> str:
    cv2, _ = _vision_libraries()
    success, encoded = cv2.imencode('.jpg', image)
    if not success:
        raise HTTPException(status_code=500, detail='Could not encode the processed camera frame.')
    return 'data:image/jpeg;base64,' + base64.b64encode(encoded.tobytes()).decode('ascii')


def _persist_detections(
    db: Session,
    detections: list[dict[str, Any]],
    inference_ms: float,
    camera_id: str,
    source: str,
    commit: bool = True,
) -> dict[str, int]:
    rois = _parking_rois()
    spaces = db.query(ParkingSpace).filter(ParkingSpace.space_code.in_(rois.keys())).all() if rois else []
    by_code = {space.space_code: space for space in spaces}
    occupied_codes: set[str] = set()
    assigned: list[str | None] = []
    for detection in detections:
        center_x, center_y = detection['center']
        assigned_code = next((
            code for code, (x1, y1, x2, y2) in rois.items()
            if x1 <= center_x <= x2 and y1 <= center_y <= y2
        ), None)
        assigned.append(assigned_code)
        if assigned_code:
            occupied_codes.add(assigned_code)
    timestamp = _utcnow()
    for detection, code in zip(detections, assigned):
        space = by_code.get(code) if code else None
        db.add(VehicleDetectionRecord(
            vehicle_class=detection['vehicle_class'],
            confidence=detection['confidence'],
            camera_id=camera_id,
            parking_space_id=space.id if space else None,
            occupancy_status='OCCUPIED' if space else None,
            source=source,
            inference_ms=inference_ms,
            recorded_at=timestamp,
        ))
    for code, space in by_code.items():
        next_status = 'OCCUPIED' if code in occupied_codes else 'AVAILABLE'
        if space.status in {'AVAILABLE', 'OCCUPIED'} and space.status != next_status:
            db.add(OccupancyHistory(
                parking_space_id=space.id,
                previous_status=space.status,
                new_status=next_status,
                recorded_at=timestamp,
            ))
            space.status = next_status
            space.last_updated = timestamp
    if commit:
        db.commit()
    counts = Counter(detection['vehicle_class'] for detection in detections)
    return {name: counts.get(name, 0) for name in ('car', 'motorcycle', 'bus', 'truck')}


def _occupancy_summary(db: Session) -> dict[str, Any]:
    spaces = db.query(ParkingSpace).all()
    occupied = sum(space.status == 'OCCUPIED' for space in spaces)
    return {
        'total_spaces': len(spaces),
        'occupied_spaces': occupied,
        'available_spaces': sum(space.status == 'AVAILABLE' for space in spaces),
        'reserved_spaces': sum(space.status == 'RESERVED' for space in spaces),
        'held_spaces': sum(space.status == 'HELD' for space in spaces),
        'occupancy_percent': round(occupied / len(spaces) * 100, 2) if spaces else None,
        'roi_configured': bool(_parking_rois()),
    }


def _read_upload(upload: UploadFile, allowed_extensions: set[str]) -> bytes:
    extension = Path(upload.filename or '').suffix.lower()
    if extension not in allowed_extensions:
        raise HTTPException(status_code=415, detail=f'File must use one of: {", ".join(sorted(allowed_extensions))}.')
    data = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail='The uploaded file is empty.')
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail='Upload exceeds the 100 MB size limit.')
    return data


@router.get('/summary')
def detection_summary(
    days: int = Query(default=1, ge=1, le=30),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    since = _utcnow() - timedelta(days=days)
    rows = db.query(VehicleDetectionRecord).filter(
        VehicleDetectionRecord.recorded_at >= since,
    ).order_by(VehicleDetectionRecord.recorded_at.asc()).all()
    distribution = Counter(row.vehicle_class for row in rows)
    timeline: dict[str, dict[str, Any]] = {}
    for row in rows:
        hour = row.recorded_at.replace(minute=0, second=0, microsecond=0).isoformat()
        point = timeline.setdefault(hour, {'timestamp': hour, 'detections': 0})
        point['detections'] += 1
    history = db.query(OccupancyHistory).filter(
        OccupancyHistory.recorded_at >= since,
    ).order_by(OccupancyHistory.recorded_at.desc(), OccupancyHistory.id.desc()).all()
    spaces = db.query(ParkingSpace).all()
    total = len(spaces)
    occupied = sum(space.status == 'OCCUPIED' for space in spaces)
    occupancy_timeline = []
    for item in history:
        if item.new_status == 'OCCUPIED':
            occupied -= 1
        if item.previous_status == 'OCCUPIED':
            occupied += 1
        occupancy_timeline.append({
            'timestamp': item.recorded_at.isoformat(),
            'occupancy_percent': round(occupied / total * 100, 2) if total else None,
        })
    occupancy_timeline.reverse()
    latest = db.query(VehicleDetectionRecord).order_by(VehicleDetectionRecord.recorded_at.desc()).first()
    return {
        'occupancy': _occupancy_summary(db),
        'detected_vehicles_total': db.query(VehicleDetectionRecord).count(),
        'detected_vehicles_period': len(rows),
        'range_days': days,
        'vehicle_distribution': {name: distribution.get(name, 0) for name in ('car', 'motorcycle', 'bus', 'truck')},
        'detection_timeline': list(timeline.values()),
        'occupancy_timeline': occupancy_timeline,
        'latest_confidence': latest.confidence if latest else None,
        'latest_inference_ms': latest.inference_ms if latest else None,
        'roi_configured': bool(_parking_rois()),
    }


@router.get('/history')
def detection_history(
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = db.query(VehicleDetectionRecord).order_by(
        VehicleDetectionRecord.recorded_at.desc(),
    ).limit(limit).all()
    return [{
        'id': row.id,
        'vehicle_class': row.vehicle_class,
        'confidence': row.confidence,
        'camera_id': row.camera_id,
        'parking_slot': row.parking_space.space_code if row.parking_space else None,
        'occupancy_status': row.occupancy_status,
        'source': row.source,
        'inference_ms': row.inference_ms,
        'timestamp': row.recorded_at.isoformat(),
    } for row in rows]


@router.post('/image')
def detect_image(
    file: UploadFile = File(...),
    camera_id: str = Query(default='upload'),
    model_name: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    cv2, np = _vision_libraries()
    content = _read_upload(file, {'.jpg', '.jpeg', '.png', '.webp', '.bmp'})
    image = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail='The uploaded image could not be decoded.')
    result, detections, inference_ms = _infer(image, model_name)
    counts = _persist_detections(db, detections, inference_ms, camera_id[:100], 'image')
    return {
        'detections': [{key: value for key, value in item.items() if key != 'center'} for item in detections],
        'detection_count': len(detections),
        'class_counts': counts,
        'confidence_mean': round(sum(item['confidence'] for item in detections) / len(detections), 4) if detections else None,
        'inference_ms': round(inference_ms, 2),
        'fps': round(1000 / inference_ms, 2) if inference_ms > 0 else None,
        'original_image': _encode_image(image),
        'processed_image': _encode_image(result.plot()),
        'occupancy': _occupancy_summary(db),
        'roi_configured': bool(_parking_rois()),
    }


@router.post('/video')
def detect_video(
    file: UploadFile = File(...),
    camera_id: str = Query(default='upload'),
    model_name: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    cv2, _ = _vision_libraries()
    content = _read_upload(file, {'.mp4', '.avi', '.mov', '.mkv', '.webm'})
    VIDEO_DIRECTORY.mkdir(parents=True, exist_ok=True)
    video_id = str(uuid.uuid4())
    input_path: str | None = None
    capture = None
    writer = None
    output_path = VIDEO_DIRECTORY / f'{video_id}.mp4'
    try:
        with tempfile.NamedTemporaryFile(suffix=Path(file.filename or '').suffix, delete=False) as temporary:
            temporary.write(content)
            input_path = temporary.name
        capture = cv2.VideoCapture(input_path)
        if not capture.isOpened():
            raise HTTPException(status_code=400, detail='The uploaded video could not be opened.')
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        source_fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
        stride = max(1, math.ceil(frame_count / MAX_VIDEO_INFERENCES)) if frame_count else 1
        combined_counts: Counter[str] = Counter()
        latencies: list[float] = []
        samples = 0
        frame_index = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % stride == 0:
                result, detections, inference_ms = _infer(frame, model_name)
                combined_counts.update(_persist_detections(
                    db, detections, inference_ms, camera_id[:100], 'video', commit=False,
                ))
                latencies.append(inference_ms)
                samples += 1
                annotated = result.plot()
                if writer is None:
                    height, width = annotated.shape[:2]
                    writer = cv2.VideoWriter(
                        str(output_path),
                        cv2.VideoWriter_fourcc(*'mp4v'),
                        max(1.0, source_fps / stride),
                        (width, height),
                    )
                    if not writer.isOpened():
                        raise HTTPException(status_code=500, detail='Could not create the processed video feed.')
                writer.write(annotated)
            frame_index += 1
        if samples == 0:
            raise HTTPException(status_code=400, detail='No decodable frames were found in the video.')
        db.commit()
        average_ms = sum(latencies) / len(latencies)
        return {
            'video_url': f'/api/ai/vehicle-detections/videos/{video_id}.mp4',
            'processed_frames': samples,
            'detection_count': sum(combined_counts.values()),
            'class_counts': {name: combined_counts.get(name, 0) for name in ('car', 'motorcycle', 'bus', 'truck')},
            'inference_ms': round(average_ms, 2),
            'fps': round(1000 / average_ms, 2) if average_ms > 0 else None,
            'occupancy': _occupancy_summary(db),
            'roi_configured': bool(_parking_rois()),
        }
    except Exception:
        output_path.unlink(missing_ok=True)
        raise
    finally:
        if capture is not None:
            capture.release()
        if writer is not None:
            writer.release()
        if input_path:
            Path(input_path).unlink(missing_ok=True)


@router.get('/videos/{filename}')
def processed_video(filename: str) -> FileResponse:
    if Path(filename).name != filename or not filename.endswith('.mp4'):
        raise HTTPException(status_code=404, detail='Processed video not found.')
    path = VIDEO_DIRECTORY / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail='Processed video not found.')
    return FileResponse(path, media_type='video/mp4', filename=filename)


@router.get('/cameras')
def configured_cameras() -> dict[str, Any]:
    sources = _load_json_setting(settings.yolo_camera_sources, 'YOLO_CAMERA_SOURCES')
    return {'configured_camera_ids': list(sources), 'browser_camera_available': True}


@router.post('/cameras/{camera_id}/frame')
def detect_camera_frame(
    camera_id: str,
    model_name: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    cv2, _ = _vision_libraries()
    sources = _load_json_setting(settings.yolo_camera_sources, 'YOLO_CAMERA_SOURCES')
    source = sources.get(camera_id)
    if source is None:
        raise HTTPException(status_code=404, detail='Camera ID is not configured on this server.')
    with _capture_lock:
        capture = _captures.get(camera_id)
        if capture is None or not capture.isOpened():
            capture_source = int(source) if isinstance(source, int) or (isinstance(source, str) and source.isdigit()) else source
            capture = cv2.VideoCapture(capture_source)
            if not capture.isOpened():
                capture.release()
                raise HTTPException(status_code=503, detail='Configured camera stream is unavailable.')
            _captures[camera_id] = capture
        ok, image = capture.read()
        if not ok:
            capture.release()
            _captures.pop(camera_id, None)
            raise HTTPException(status_code=503, detail='Could not read a frame from the configured camera.')
    result, detections, inference_ms = _infer(image, model_name)
    counts = _persist_detections(db, detections, inference_ms, camera_id, 'camera')
    return {
        'detections': [{key: value for key, value in item.items() if key != 'center'} for item in detections],
        'detection_count': len(detections),
        'class_counts': counts,
        'confidence_mean': round(sum(item['confidence'] for item in detections) / len(detections), 4) if detections else None,
        'inference_ms': round(inference_ms, 2),
        'fps': round(1000 / inference_ms, 2) if inference_ms > 0 else None,
        'original_image': _encode_image(image),
        'processed_image': _encode_image(result.plot()),
        'occupancy': _occupancy_summary(db),
        'roi_configured': bool(_parking_rois()),
    }


def _evaluation_payload(row: YoloModelEvaluation) -> dict[str, Any]:
    return {
        'model_name': row.model_name,
        'dataset_name': row.dataset_name,
        'split': row.split,
        'metrics': row.metrics,
        'confusion_matrix': row.confusion_matrix,
        'model_size_mb': row.model_size_mb,
        'hardware': row.hardware,
        'evaluated_at': row.evaluated_at.isoformat(),
        'run_id': row.run_id,
    }


def _detection_metrics(
    box_metrics: Any,
    inference_ms: float | None,
    model_names: dict[int, str],
    target_counts: Any,
) -> dict[str, Any]:
    import numpy as np

    precision = float(box_metrics.mp)
    recall = float(box_metrics.mr)
    f1_score = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    class_metrics = []
    for index, class_id in enumerate(box_metrics.ap_class_index):
        class_precision, class_recall, ap50, map50_95 = box_metrics.class_result(index)
        class_instances = (
            int(target_counts[int(class_id)])
            if target_counts is not None and int(class_id) < len(target_counts)
            else None
        )
        class_metrics.append({
            'class_id': int(class_id),
            'class_name': str(model_names.get(int(class_id), class_id)),
            'instances': class_instances,
            'precision': round(float(class_precision), 6),
            'recall': round(float(class_recall), 6),
            'f1_score': round(float(box_metrics.f1[index]), 6),
            'ap50': round(float(ap50), 6),
            'map50_95': round(float(map50_95), 6),
        })

    precision_recall_curve = []
    curves = box_metrics.curves_results
    if curves and len(curves[0]) >= 2:
        recall_values = curves[0][0]
        precision_values = np.asarray(curves[0][1])
        if precision_values.ndim == 1:
            precision_values = precision_values[None, :]
        if len(recall_values) and precision_values.size:
            mean_precision = precision_values.mean(axis=0)
            sample_indices = sorted(set(range(0, len(recall_values), 10)) | {len(recall_values) - 1})
            precision_recall_curve = [
                {
                    'recall': round(float(recall_values[index]), 6),
                    'precision': round(float(mean_precision[index]), 6),
                }
                for index in sample_indices
            ]

    return {
        'accuracy': None,
        'precision': round(precision, 6),
        'recall': round(recall, 6),
        'f1_score': round(f1_score, 6),
        'map50': round(float(box_metrics.map50), 6),
        'map50_95': round(float(box_metrics.map), 6),
        'inference_ms': round(inference_ms, 3) if inference_ms is not None else None,
        'fps': round(1000 / inference_ms, 3) if inference_ms and inference_ms > 0 else None,
        'per_class': class_metrics,
        'precision_recall_curve': precision_recall_curve,
    }


@router.get('/evaluation')
def latest_evaluation(db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.query(YoloModelEvaluation).order_by(
        YoloModelEvaluation.evaluated_at.desc(),
        YoloModelEvaluation.id.desc(),
    ).first()
    return {'status': 'evaluated' if row else 'unavailable', 'result': _evaluation_payload(row) if row else None}


@router.get('/comparison')
def model_comparison(db: Session = Depends(get_db)) -> dict[str, Any]:
    latest = db.query(YoloModelEvaluation).order_by(
        YoloModelEvaluation.evaluated_at.desc(),
        YoloModelEvaluation.id.desc(),
    ).first()
    rows = db.query(YoloModelEvaluation).filter(
        YoloModelEvaluation.run_id == latest.run_id,
    ).all() if latest else []
    by_name = {row.model_name: row for row in rows}
    names = list(dict.fromkeys((*EXPECTED_MODELS, *_configured_models().keys())))
    comparison = []
    for name in names:
        row = by_name.get(name)
        comparison.append(_evaluation_payload(row) if row else {
            'model_name': name,
            'status': 'Not evaluated',
            'metrics': None,
        })
    evaluated = [row for row in rows if row.metrics.get('map50_95') is not None]
    best = max(
        evaluated,
        key=lambda row: (
            row.metrics.get('map50_95', -1),
            row.metrics.get('map50', -1),
            -(row.metrics.get('inference_ms') or float('inf')),
        ),
        default=None,
    )
    return {
        'dataset_name': latest.dataset_name if latest else (_evaluation_dataset().name if _evaluation_dataset() else None),
        'dataset_available': has_evaluation_dataset(),
        'split': latest.split if latest else None,
        'hardware': latest.hardware if latest else None,
        'configured_models': list(_configured_models()),
        'comparison': comparison,
        'best_model': best.model_name if best else None,
        'speed_performance_tradeoff': (
            'Best model is ranked by mAP@0.5:0.95, with inference time used to break ties.'
            if best else 'Run a comparison on the same labeled dataset to measure speed and detection quality.'
        ),
    }


@router.post('/evaluate')
def evaluate_models(
    split: str = Query(default='test', pattern='^(validation|test)$'),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    dataset_yaml = _evaluation_dataset()
    if dataset_yaml is None:
        raise HTTPException(status_code=409, detail='Evaluation data unavailable: configure YOLO_DATASET_YAML with labeled detection data.')
    configured = _configured_models()
    if not configured:
        raise HTTPException(status_code=409, detail='Evaluation data unavailable: configure YOLO_MODEL_PATH or YOLO_MODEL_VARIANTS.')
    try:
        import torch
    except ImportError:
        torch = None
    device = '0' if torch is not None and torch.cuda.is_available() else 'cpu'
    hardware = torch.cuda.get_device_name(0) if device == '0' else 'CPU'
    run_id = str(uuid.uuid4())
    model_rows = []
    import numpy as np

    for name, weights in configured.items():
        model = _model(weights)
        try:
            result = model.val(data=dataset_yaml, split='val' if split == 'validation' else 'test', device=device, verbose=False, plots=False)
        except (OSError, RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f'Evaluation failed for {name}: {exc}') from exc
        box_metrics = result.box
        inference_ms = float(result.speed.get('inference', 0.0)) if result.speed else None
        confusion_matrix = None
        validator = getattr(model, 'validator', None)
        matrix = getattr(getattr(result, 'confusion_matrix', None), 'matrix', None)
        if matrix is None:
            matrix = getattr(getattr(validator, 'confusion_matrix', None), 'matrix', None)
        model_names = model.names if isinstance(model.names, dict) else dict(enumerate(model.names))
        if matrix is not None:
            confusion_matrix = _confusion_matrix_payload(matrix, model_names, np)
        try:
            model_size_mb = round(os.path.getsize(weights) / (1024 * 1024), 3)
        except OSError:
            model_size_mb = None
        metrics = _detection_metrics(box_metrics, inference_ms, model_names, result.nt_per_class)
        metrics['loss_history'] = _training_loss_history(weights)
        row = YoloModelEvaluation(
            run_id=run_id,
            model_name=name,
            dataset_name=dataset_yaml.name,
            split=split,
            metrics=metrics,
            confusion_matrix=confusion_matrix,
            model_size_mb=model_size_mb,
            hardware=hardware,
        )
        db.add(row)
        db.flush()
        model_rows.append(_evaluation_payload(row))
    db.commit()
    return {
        'status': 'evaluated',
        'dataset_name': dataset_yaml.name,
        'split': split,
        'hardware': hardware,
        'comparison': model_rows,
        'best_model': max(
            model_rows,
            key=lambda row: (row['metrics']['map50_95'], row['metrics']['map50'], -(row['metrics']['inference_ms'] or float('inf'))),
        )['model_name'],
    }


def close_camera_streams() -> None:
    with _capture_lock:
        for capture in _captures.values():
            capture.release()
        _captures.clear()
