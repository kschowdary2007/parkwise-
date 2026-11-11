from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.ai_routes import _detection_metrics, _persist_detections, _selected_weights
from app.core.config import get_settings
from app.core.database import Base
from app.models import OccupancyHistory, ParkingLevel, ParkingLot, ParkingSpace, VehicleDetectionRecord


def test_detection_metrics_use_ultralytics_box_metrics():
    metrics = _detection_metrics(
        SimpleNamespace(mp=0.8, mr=0.5, map50=0.72, map=0.41),
        25.0,
    )

    assert metrics == {
        'accuracy': None,
        'precision': 0.8,
        'recall': 0.5,
        'f1_score': 0.615385,
        'map50': 0.72,
        'map50_95': 0.41,
        'inference_ms': 25.0,
        'fps': 40.0,
    }


def test_detection_roi_updates_space_and_persists_record(monkeypatch):
    engine = create_engine('sqlite://')
    Base.metadata.create_all(bind=engine)
    settings = get_settings()
    monkeypatch.setattr(settings, 'yolo_parking_rois', '{"A-01":[0.1,0.1,0.9,0.9]}')

    with Session(engine) as db:
        lot = ParkingLot(name='Test lot', capacity=1)
        db.add(lot)
        db.flush()
        level = ParkingLevel(lot_id=lot.id, name='Level 01')
        db.add(level)
        db.flush()
        space = ParkingSpace(lot_id=lot.id, level_id=level.id, space_code='A-01', floor='Level 01', zone='A', status='AVAILABLE')
        db.add(space)
        db.commit()

        _persist_detections(
            db,
            [{'vehicle_class': 'car', 'confidence': 0.91, 'center': [0.5, 0.5]}],
            12.5,
            'camera-1',
            'image',
        )

        assert db.query(ParkingSpace).filter_by(space_code='A-01').one().status == 'OCCUPIED'
        record = db.query(VehicleDetectionRecord).one()
        assert record.vehicle_class == 'car'
        assert record.confidence == 0.91
        assert record.parking_space_id == space.id
        assert db.query(OccupancyHistory).one().new_status == 'OCCUPIED'

    engine.dispose()


def test_default_model_selection_uses_configured_variant(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, 'yolo_model_path', '')
    monkeypatch.setattr(settings, 'yolo_model_variants', '{"YOLOv8s":"/models/s.pt","YOLOv8m":"/models/m.pt"}')

    assert _selected_weights() == '/models/s.pt'
    assert _selected_weights('YOLOv8m') == '/models/m.pt'
