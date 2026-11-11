from __future__ import annotations

import os
import math
import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine, get_db
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.ai_routes import close_camera_streams, has_configured_yolo_models, has_evaluation_dataset, router as ai_router
from app.models import (
    AiPrediction,
    CameraDevice,
    ModelEvaluation,
    ModelComparisonResult,
    OccupancyHistory,
    ParkingDetection,
    ParkingLot,
    ParkingSession,
    ParkingSpace,
    Payment,
    PricingRule,
    Reservation,
    SystemEvent,
    TestCaseResult,
    User,
    Vehicle,
    VehicleDetectionRecord,
)

settings = get_settings()
app = FastAPI(title='Parkwise Smart Parking API', version='1.0.0')
app.include_router(ai_router)

origins = [origin.strip() for origin in settings.cors_origins.split(',') if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ['http://localhost:5173'],
    allow_origin_regex=r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$',
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str = 'USER'


class VehicleCreate(BaseModel):
    vehicle_number: str
    vehicle_type: str = 'CAR'
    owner: str
    phone: str | None = None
    ev: bool = False
    accessibility_requirement: bool = False


class VehicleUpdate(BaseModel):
    vehicle_number: str | None = None
    vehicle_type: str | None = None
    owner: str | None = None
    phone: str | None = None
    ev: bool | None = None
    accessibility_requirement: bool | None = None


class ParkingSpaceUpdate(BaseModel):
    status: str | None = None
    accessibility: bool | None = None
    ev_charging: bool | None = None


class ReservationCreate(BaseModel):
    vehicle_id: int
    parking_space_id: int
    start_time: datetime | None = None
    end_time: datetime | None = None


class PaymentCreate(BaseModel):
    session_id: int
    amount: float
    payment_method: str = 'UPI'
    status: str = 'PAID'


class RouteRequest(BaseModel):
    start: str = 'ENTRANCE'
    destination: str = 'A-02'


class ConfusionMatrixInput(BaseModel):
    true_positive: int = Field(default=0, ge=0)
    true_negative: int = Field(default=0, ge=0)
    false_positive: int = Field(default=0, ge=0)
    false_negative: int = Field(default=0, ge=0)


class DetectionMetricsInput(BaseModel):
    map50: float | None = Field(default=None, ge=0, le=1)
    map50_95: float | None = Field(default=None, ge=0, le=1)
    iou: float | None = Field(default=None, ge=0, le=1)
    detection_confidence: float | None = Field(default=None, ge=0, le=1)
    fps: float | None = Field(default=None, ge=0)
    inference_ms: float | None = Field(default=None, ge=0)
    precision_recall_curve: list[dict[str, float]] | None = None


class PredictionMetricsInput(BaseModel):
    actual: list[float] | None = None
    predicted: list[float] | None = None


class ModelEvaluationCreate(BaseModel):
    model_type: str = 'parking_classification'
    model_name: str
    evaluation_date: datetime | None = None
    dataset_name: str | None = None
    dataset_split: dict[str, int] | None = None
    confusion_matrix: ConfusionMatrixInput | None = None
    detection_metrics: DetectionMetricsInput | None = None
    prediction_metrics: PredictionMetricsInput | None = None
    notes: str | None = None


class TestCaseCreate(BaseModel):
    category: str
    name: str
    description: str | None = None
    expected_result: str | None = None
    actual_result: str | None = None
    status: str = 'PENDING'


class TestCaseUpdate(BaseModel):
    actual_result: str | None = None
    status: str | None = None


class ReservationUpdate(BaseModel):
    status: str | None = None
    end_time: datetime | None = None


@app.on_event('startup')
def startup_event() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.query(ParkingLot).count() == 0:
            from seed import seed_database

            seed_database(db)
        demo_admin = db.query(User).filter(User.email == 'admin@parkwise.local').first()
        if demo_admin and demo_admin.password_hash == 'placeholder':
            demo_admin.password_hash = hash_password('password123')
            db.commit()
        if not db.query(SystemEvent).filter(SystemEvent.event_type == 'demo_reservations_seeded').first():
            if not db.query(Reservation).count() and demo_admin:
                demo_vehicles = db.query(Vehicle).order_by(Vehicle.id).limit(5).all()
                for space_code, vehicle_index in [('A-04', 2), ('C-04', 3)]:
                    space = db.query(ParkingSpace).filter(ParkingSpace.space_code == space_code).first()
                    if space and len(demo_vehicles) > vehicle_index:
                        db.add(Reservation(
                            user_id=demo_admin.id,
                            vehicle_id=demo_vehicles[vehicle_index].id,
                            parking_space_id=space.id,
                            start_time=datetime.utcnow(),
                            status='ACTIVE',
                        ))
            db.add(SystemEvent(event_type='demo_reservations_seeded', message='Initial demo reservations loaded.'))
            db.commit()
        forecast_seed = [
            ('07:00', 18), ('08:00', 22), ('09:00', 25), ('10:00', 31),
            ('11:00', 38), ('12:00', 45), ('13:00', 52), ('14:00', 61),
            ('15:00', 70), ('16:00', 79), ('17:00', 91), ('18:00', 87),
            ('19:00', 74), ('20:00', 58), ('21:00', 42), ('22:00', 28),
        ]
        known_forecast_hours = {row.hour for row in db.query(AiPrediction.hour).all()}
        for hour, occupancy in forecast_seed:
            if hour not in known_forecast_hours:
                db.add(AiPrediction(hour=hour, occupancy_percent=occupancy))
        db.commit()
        if db.query(ModelComparisonResult).count() == 0 and MATCHBOX_EVALUATION.exists():
            try:
                evaluation = json.loads(MATCHBOX_EVALUATION.read_text(encoding='utf-8'))
                evaluation_date = datetime.utcnow()
                for row in evaluation.get('comparison', []):
                    db.add(ModelComparisonResult(
                        model_name=row['model_name'],
                        dataset_version=evaluation['dataset']['name'],
                        evaluation_date=evaluation_date,
                        accuracy=row['accuracy'],
                        precision=row['precision'],
                        recall=row['recall'],
                        f1_score=row['f1_score'],
                        confusion_matrix=row['confusion_matrix'],
                        training_time_seconds=row['training_time_seconds'],
                        prediction_time_seconds=row['prediction_time_seconds'],
                        training_records=evaluation['dataset_split']['train'],
                        validation_records=evaluation['dataset_split']['validation'],
                        testing_records=evaluation['dataset_split']['test'],
                    ))
                db.commit()
            except (json.JSONDecodeError, OSError, KeyError, TypeError):
                pass


@app.on_event('shutdown')
def shutdown_event() -> None:
    close_camera_streams()


@app.get('/health')
@app.get('/api/health')
def health() -> dict[str, str]:
    try:
        with SessionLocal() as db:
            db.execute(text('SELECT 1'))
        return {'status': 'ok', 'database': 'connected', 'ai_mode': settings.ai_mode}
    except Exception:
        return {'status': 'degraded', 'database': 'disconnected', 'ai_mode': settings.ai_mode}


@app.get('/api/dashboard/summary')
def dashboard_summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    total_spaces = db.query(ParkingSpace).count()
    available = db.query(ParkingSpace).filter(ParkingSpace.status == 'AVAILABLE').count()
    occupied = db.query(ParkingSpace).filter(ParkingSpace.status == 'OCCUPIED').count()
    reserved = db.query(ParkingSpace).filter(ParkingSpace.status == 'RESERVED').count()
    held = db.query(ParkingSpace).filter(ParkingSpace.status == 'HELD').count()
    occupancy_rate = round((occupied / total_spaces) * 100, 1) if total_spaces else 0
    predicted_peak = '17:00'
    active_cameras = db.query(CameraDevice).filter(CameraDevice.status == 'ONLINE').count()
    vehicles_today = db.query(ParkingSession).filter(ParkingSession.entry_time >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)).count()
    revenue_today = db.query(Payment).filter(Payment.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)).with_entities(func.coalesce(func.sum(Payment.amount), 0)).scalar() or 0
    completed_sessions = db.query(ParkingSession).filter(ParkingSession.duration_minutes > 0).all()
    average_parking_minutes = round(sum(session.duration_minutes for session in completed_sessions) / len(completed_sessions), 1) if completed_sessions else None
    return {
        'total_spaces': total_spaces,
        'available_spaces': available,
        'occupied_spaces': occupied,
        'reserved_spaces': reserved,
        'held_spaces': held,
        'occupancy_rate': occupancy_rate,
        'predicted_peak': predicted_peak,
        'detection_accuracy': None,
        'active_cameras': active_cameras,
        'vehicles_today': vehicles_today,
        'revenue_today': float(revenue_today),
        'vehicles_detected': db.query(ParkingDetection).count() + db.query(VehicleDetectionRecord).count(),
        'successful_allocations': db.query(Reservation).count(),
        'failed_allocations': None,
        'average_parking_minutes': average_parking_minutes,
    }


@app.get('/api/parking/spaces')
def list_spaces(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(ParkingSpace).order_by(ParkingSpace.space_code).all()
    payload = []
    for space in rows:
        payload.append({
            'id': space.id,
            'space_code': space.space_code,
            'floor': space.floor,
            'zone': space.zone,
            'status': space.status,
            'type': space.type,
            'accessibility': bool(space.accessibility),
            'ev': bool(space.ev_charging),
            'vehicle_number': space.vehicle.vehicle_number if space.vehicle else None,
            'last_updated': space.last_updated.isoformat() if space.last_updated else None,
            'current_vehicle_id': space.current_vehicle_id,
        })
    return payload


@app.patch('/api/parking/spaces/{space_id}')
def update_parking_space(space_id: int, payload: ParkingSpaceUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    space = db.query(ParkingSpace).filter(ParkingSpace.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail='Parking space not found.')
    changes = payload.model_dump(exclude_unset=True)
    if 'status' in changes and changes['status'] not in {'AVAILABLE', 'OCCUPIED', 'RESERVED', 'HELD'}:
        raise HTTPException(status_code=422, detail='Status must be AVAILABLE, OCCUPIED, RESERVED, or HELD.')
    if changes.get('status') == 'RESERVED' and space.status != 'RESERVED':
        raise HTTPException(status_code=409, detail='Create a reservation to hold this space.')
    active = db.query(Reservation).filter(
            Reservation.parking_space_id == space.id,
            Reservation.status == 'ACTIVE',
        ).first()
    next_status = changes.get('status', space.status)
    if active and next_status != 'RESERVED':
        raise HTTPException(status_code=409, detail='Cancel the active reservation before changing this space status.')
    previous_status = space.status
    for field, value in changes.items():
        if field == 'ev_charging':
            space.ev_charging = value
        else:
            setattr(space, field, value)
    if changes.get('status') == 'AVAILABLE':
        space.current_vehicle_id = None
    if 'status' in changes and previous_status != space.status:
        db.add(OccupancyHistory(
            parking_space_id=space.id,
            previous_status=previous_status,
            new_status=space.status,
        ))
    space.last_updated = datetime.utcnow()
    db.commit()
    return {
        'id': space.id,
        'space_code': space.space_code,
        'status': space.status,
        'accessibility': bool(space.accessibility),
        'ev': bool(space.ev_charging),
    }


@app.get('/api/parking/lots')
def list_parking_lots(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    lots = db.query(ParkingLot).order_by(ParkingLot.name).all()
    return [
        {
            'id': lot.id,
            'name': lot.name,
            'location': lot.location,
            'capacity': lot.capacity,
            'levels': [level.name for level in lot.levels],
            'available_spaces': db.query(ParkingSpace).filter(ParkingSpace.lot_id == lot.id, ParkingSpace.status == 'AVAILABLE').count(),
        }
        for lot in lots
    ]


@app.get('/api/parking/recommend')
def recommend_space(
    vehicle: str | None = None,
    floor: str | None = None,
    ev: bool = False,
    accessibility: bool = False,
    max_distance: int = 150,
    zone: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    spaces = db.query(ParkingSpace).filter(ParkingSpace.status == 'AVAILABLE').all()
    if floor:
        spaces = [space for space in spaces if space.floor.casefold() == floor.casefold()]
    if zone:
        spaces = [space for space in spaces if space.zone.casefold() == zone.casefold()]
    if accessibility:
        spaces = [space for space in spaces if space.accessibility]
    if not spaces:
        raise HTTPException(status_code=404, detail='No available spaces match those preferences.')

    def score(space: ParkingSpace) -> tuple[float, float, float]:
        distance = 40 + abs((ord(space.space_code.split('-')[0][0]) - ord('A')) * 12) + (int(space.space_code.split('-')[1]) * 6)
        route_weight = 1 if distance <= max_distance else 999
        ev_weight = 0 if (not ev or space.ev_charging) else 5
        access_weight = 0 if (not accessibility or space.accessibility) else 10
        return (distance + route_weight + ev_weight + access_weight, distance, space.id)

    candidate = min(spaces, key=score)
    route = build_route(candidate.space_code)
    return {
        'recommended_space': candidate.space_code,
        'distance': 32 + (candidate.id % 9) * 5,
        'estimated_travel_time': 2 + (candidate.id % 5),
        'current_price': determine_price_rate(db),
        'route': route,
    }


@app.get('/api/pricing/current')
def current_pricing(db: Session = Depends(get_db)) -> dict[str, Any]:
    summary = dashboard_summary(db)
    rate = determine_price_rate(db, occupancy_rate=summary['occupancy_rate'])
    return {'occupancy_rate': summary['occupancy_rate'], 'price_per_hour': rate, 'currency': 'INR'}


@app.get('/api/vehicles')
def list_vehicles(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [
        {
            'id': vehicle.id,
            'vehicle_number': vehicle.vehicle_number,
            'vehicle_type': vehicle.vehicle_type,
            'owner': vehicle.owner,
            'phone': vehicle.phone,
            'ev': bool(vehicle.ev),
            'accessibility_requirement': bool(vehicle.accessibility_requirement),
            'registration_date': vehicle.registration_date.isoformat(),
        }
        for vehicle in db.query(Vehicle).all()
    ]


@app.post('/api/vehicles')
def create_vehicle(payload: VehicleCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    existing = db.query(Vehicle).filter(Vehicle.vehicle_number == payload.vehicle_number).first()
    if existing:
        raise HTTPException(status_code=409, detail='Vehicle already registered.')
    entity = Vehicle(user_id=1, **payload.model_dump())
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return {'id': entity.id, 'message': 'Vehicle registered'}


@app.put('/api/vehicles/{vehicle_id}')
def update_vehicle(vehicle_id: int, payload: VehicleUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail='Vehicle not found.')
    changes = payload.model_dump(exclude_unset=True)
    if 'vehicle_number' in changes:
        changes['vehicle_number'] = changes['vehicle_number'].strip().upper()
        duplicate = db.query(Vehicle).filter(
            Vehicle.vehicle_number == changes['vehicle_number'],
            Vehicle.id != vehicle_id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail='Vehicle already registered.')
    for field, value in changes.items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    return {'id': vehicle.id, 'message': 'Vehicle updated'}


@app.get('/api/reservations')
def list_reservations(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [
        {
            'id': reservation.id,
            'vehicle_id': reservation.vehicle_id,
            'parking_space_id': reservation.parking_space_id,
            'status': reservation.status,
            'start_time': reservation.start_time.isoformat(),
            'end_time': reservation.end_time.isoformat() if reservation.end_time else None,
            'vehicle_number': reservation.vehicle.vehicle_number,
            'vehicle_type': reservation.vehicle.vehicle_type,
            'owner': reservation.vehicle.owner,
            'space_code': reservation.parking_space.space_code,
            'floor': reservation.parking_space.floor,
            'zone': reservation.parking_space.zone,
        }
        for reservation in db.query(Reservation).order_by(Reservation.start_time.desc()).all()
    ]


@app.post('/api/reservations')
def create_reservation(payload: ReservationCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    space = db.query(ParkingSpace).filter(ParkingSpace.id == payload.parking_space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail='Parking space not found.')
    if space.status in {'OCCUPIED', 'RESERVED'}:
        raise HTTPException(status_code=409, detail='Space is not available for reservation.')
    reservation = Reservation(
        user_id=1,
        vehicle_id=payload.vehicle_id,
        parking_space_id=payload.parking_space_id,
        start_time=payload.start_time or datetime.utcnow(),
        end_time=payload.end_time,
        status='ACTIVE',
    )
    space.status = 'RESERVED'
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return {'id': reservation.id, 'status': reservation.status, 'message': 'Reservation created'}


@app.get('/api/reservations/{reservation_id}')
def get_reservation(reservation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail='Reservation not found.')
    return {
        'id': reservation.id,
        'status': reservation.status,
        'vehicle_id': reservation.vehicle_id,
        'parking_space_id': reservation.parking_space_id,
        'start_time': reservation.start_time.isoformat(),
    }


@app.put('/api/reservations/{reservation_id}')
def update_reservation(reservation_id: int, payload: ReservationUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail='Reservation not found.')
    if payload.status:
        reservation.status = payload.status
    if payload.end_time:
        reservation.end_time = payload.end_time
    db.commit()
    return {'id': reservation.id, 'status': reservation.status, 'message': 'Reservation updated'}


@app.delete('/api/reservations/{reservation_id}')
def delete_reservation(reservation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail='Reservation not found.')
    space = db.query(ParkingSpace).filter(ParkingSpace.id == reservation.parking_space_id).first()
    if space:
        space.status = 'AVAILABLE'
    db.delete(reservation)
    db.commit()
    return {'message': 'Reservation cancelled'}


@app.get('/api/payments')
def list_payments(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    items = db.query(Payment).all()
    return [
        {'id': payment.id, 'session_id': payment.session_id, 'amount': payment.amount, 'payment_method': payment.payment_method, 'status': payment.status}
        for payment in items
    ]


@app.post('/api/payments')
def create_payment(payload: PaymentCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    session = db.query(ParkingSession).filter(ParkingSession.id == payload.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail='Parking session not found.')
    payment = Payment(session_id=payload.session_id, amount=payload.amount, payment_method=payload.payment_method, status=payload.status)
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {'id': payment.id, 'status': payment.status, 'amount': payment.amount}


@app.get('/api/payments/{payment_id}')
def get_payment(payment_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail='Payment not found.')
    return {'id': payment.id, 'session_id': payment.session_id, 'amount': payment.amount, 'payment_method': payment.payment_method, 'status': payment.status}


@app.post('/api/navigation/route')
def compute_route(payload: RouteRequest) -> dict[str, Any]:
    graph = {
        'ENTRANCE': ['A1', 'B1', 'C1'],
        'A1': ['ENTRANCE', 'A2', 'B1'],
        'A2': ['A1', 'A3', 'B2'],
        'A3': ['A2', 'B3'],
        'B1': ['ENTRANCE', 'A1', 'B2', 'C1'],
        'B2': ['A2', 'B3', 'B1', 'C2'],
        'B3': ['A3', 'B2', 'C3'],
        'C1': ['ENTRANCE', 'B1', 'C2'],
        'C2': ['C1', 'B2', 'C3'],
        'C3': ['C2', 'B3'],
        'A-02': ['A2'],
    }
    path = a_star(graph, payload.start, payload.destination)
    return {'algorithm': 'A*', 'distance': len(path) * 12, 'estimated_time': max(1, len(path) // 2), 'path': path}


@app.get('/api/analytics/demand')
def analytics_demand(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    expected = [
        ('07:00', 18), ('08:00', 22), ('09:00', 25), ('10:00', 31),
        ('11:00', 38), ('12:00', 45), ('13:00', 52), ('14:00', 61),
        ('15:00', 70), ('16:00', 79), ('17:00', 91), ('18:00', 87),
        ('19:00', 74), ('20:00', 58), ('21:00', 42), ('22:00', 28),
    ]
    stored = {prediction.hour: prediction.occupancy_percent for prediction in db.query(AiPrediction).all()}
    return [{'hour': hour, 'occupancy_percent': stored.get(hour, value)} for hour, value in expected]


@app.get('/api/ai/status')
def ai_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    detections = db.query(ParkingDetection).all()
    average_confidence = round(sum(detection.confidence for detection in detections) / len(detections) * 100, 1) if detections else None
    cameras = db.query(CameraDevice).all()
    latest = db.query(ModelEvaluation).order_by(ModelEvaluation.evaluation_date.desc(), ModelEvaluation.id.desc()).first()
    metrics = latest.classification_metrics if latest else None
    confusion = latest.confusion_matrix if latest else None
    validated = latest is not None
    dataset_split = {'train': 70, 'validation': 20, 'test': 10}
    evaluation_model_name = latest.model_name if latest else None
    latest_evaluation_date = latest.evaluation_date.isoformat() if latest else None

    if not latest:
        artifact = load_matchbox_evaluation()
        if artifact and artifact.get('comparison'):
            best = artifact['comparison'][0]
            matrix = best['confusion_matrix']
            metrics = {
                'accuracy': best['accuracy'],
                'precision': best['precision'],
                'recall': best['recall'],
                'f1_score': best['f1_score'],
                'specificity': None if (matrix['true_negative'] + matrix['false_positive']) == 0 else round(matrix['true_negative'] / (matrix['true_negative'] + matrix['false_positive']) * 100, 2),
                'error_rate': round(100 - best['accuracy'], 2),
            }
            confusion = matrix
            validated = True
            evaluation_model_name = f"{best['model_name']} · Matchbox test set"
            latest_evaluation_date = artifact.get('evaluated_at')
            dataset_split = {
                'train': artifact['dataset_split']['train_percent'],
                'validation': artifact['dataset_split']['validation_percent'],
                'test': artifact['dataset_split']['test_percent'],
            }

    return {
        'mode': settings.ai_mode,
        'model_configured': has_configured_yolo_models(),
        'evaluation_dataset_configured': has_evaluation_dataset(),
        'parking_spaces_labeled': db.query(ParkingSpace).count(),
        'prediction_points': db.query(AiPrediction).count(),
        'detection_samples': len(detections),
        'average_detection_confidence': average_confidence,
        'cameras_online': sum(camera.status == 'ONLINE' for camera in cameras),
        'cameras_total': len(cameras),
        'performance_validated': validated,
        'latest_evaluation': latest_evaluation_date,
        'evaluation_model_name': evaluation_model_name,
        'metrics': metrics,
        'detection_metrics': latest.detection_metrics if latest else None,
        'prediction_metrics': latest.prediction_metrics if latest else None,
        'confusion_matrix': confusion,
        'precision_recall_curve': latest.precision_recall_curve if latest else None,
        'actual_vs_predicted': latest.actual_vs_predicted if latest else None,
        'dataset_split': dataset_split,
    }


def percentage(value: float | None) -> float | None:
    return None if value is None else round(value * 100, 2)


def safe_percent(numerator: int | float, denominator: int | float) -> float | None:
    return percentage(numerator / denominator) if denominator else None


@app.post('/api/ai/evaluations')
def create_model_evaluation(payload: ModelEvaluationCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    matrix = payload.confusion_matrix
    classification = None
    confusion = None
    if matrix:
        tp = matrix.true_positive
        tn = matrix.true_negative
        fp = matrix.false_positive
        fn = matrix.false_negative
        denominator = tp + tn + fp + fn
        accuracy = safe_percent(tp + tn, denominator)
        precision = safe_percent(tp, tp + fp)
        recall = safe_percent(tp, tp + fn)
        specificity = safe_percent(tn, tn + fp)
        f1 = None
        if precision is not None and recall is not None and (precision + recall) > 0:
            p = precision / 100
            r = recall / 100
            f1 = round((2 * p * r / (p + r)) * 100, 2)
        classification = {
            'accuracy': accuracy,
            'precision': precision,
            'recall': recall,
            'f1_score': f1,
            'specificity': specificity,
            'error_rate': None if accuracy is None else round(100 - accuracy, 2),
        }
        confusion = matrix.model_dump()

    detection = None
    curve = None
    if payload.detection_metrics:
        source = payload.detection_metrics
        detection = {
            'map50': percentage(source.map50),
            'map50_95': percentage(source.map50_95),
            'iou': percentage(source.iou),
            'detection_confidence': percentage(source.detection_confidence),
            'fps': source.fps,
            'inference_ms': source.inference_ms,
        }
        curve = source.precision_recall_curve

    prediction = None
    actual_vs_predicted = None
    if payload.prediction_metrics:
        actual = payload.prediction_metrics.actual
        predicted = payload.prediction_metrics.predicted
        if actual is not None and predicted is not None and len(actual) == len(predicted) and len(actual) > 0:
            errors = [a - p for a, p in zip(actual, predicted)]
            mae = sum(abs(error) for error in errors) / len(errors)
            mse = sum(error * error for error in errors) / len(errors)
            rmse = math.sqrt(mse)
            mean_actual = sum(actual) / len(actual)
            total_variance = sum((value - mean_actual) ** 2 for value in actual)
            residual = sum(error * error for error in errors)
            r2 = None if total_variance == 0 else 1 - (residual / total_variance)
            prediction = {
                'mae': round(mae, 4),
                'mse': round(mse, 4),
                'rmse': round(rmse, 4),
                'r2_score': None if r2 is None else round(r2, 4),
            }
            actual_vs_predicted = [
                {'index': index + 1, 'actual': actual[index], 'predicted': predicted[index], 'error': round(errors[index], 4)}
                for index in range(len(actual))
            ]

    evaluation = ModelEvaluation(
        model_type=payload.model_type,
        model_name=payload.model_name,
        evaluation_date=payload.evaluation_date or datetime.utcnow(),
        dataset_name=payload.dataset_name,
        dataset_split=payload.dataset_split,
        confusion_matrix=confusion,
        classification_metrics=classification,
        detection_metrics=detection,
        prediction_metrics=prediction,
        precision_recall_curve=curve,
        actual_vs_predicted=actual_vs_predicted,
        notes=payload.notes,
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)
    return {
        'id': evaluation.id,
        'evaluation_date': evaluation.evaluation_date.isoformat(),
        'classification_metrics': evaluation.classification_metrics,
        'detection_metrics': evaluation.detection_metrics,
        'prediction_metrics': evaluation.prediction_metrics,
        'confusion_matrix': evaluation.confusion_matrix,
        'precision_recall_curve': evaluation.precision_recall_curve,
        'actual_vs_predicted': evaluation.actual_vs_predicted,
    }


@app.get('/api/ai/evaluations/history')
def model_evaluation_history(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(ModelEvaluation).order_by(ModelEvaluation.evaluation_date.desc(), ModelEvaluation.id.desc()).all()
    return [{
        'id': row.id,
        'evaluation_date': row.evaluation_date.isoformat(),
        'model_type': row.model_type,
        'model_name': row.model_name,
        'dataset_name': row.dataset_name,
        'dataset_split': row.dataset_split,
        'classification_metrics': row.classification_metrics,
        'detection_metrics': row.detection_metrics,
        'prediction_metrics': row.prediction_metrics,
        'confusion_matrix': row.confusion_matrix,
        'precision_recall_curve': row.precision_recall_curve,
        'actual_vs_predicted': row.actual_vs_predicted,
        'notes': row.notes,
    } for row in rows]


MATCHBOX_EVALUATION = Path(__file__).resolve().parent.parent.parent / 'data' / 'matchbox_evaluation' / 'evaluation.json'


def load_matchbox_evaluation() -> dict[str, Any] | None:
    if not MATCHBOX_EVALUATION.exists():
        return None
    try:
        return json.loads(MATCHBOX_EVALUATION.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return None


@app.get('/api/ai/dataset')
def ai_dataset_information() -> dict[str, Any]:
    evaluation = load_matchbox_evaluation()
    if not evaluation:
        return {
            'dataset': {
                'name': 'ljkeller/matchbox-car-parking-occupancy',
                'image_based': True,
                'record_count': None,
                'target_labels': ['available', 'occupied'],
            },
            'dataset_split': None,
            'comparison': [],
            'best_model': None,
            'status': 'Not Evaluated Yet',
        }
    evaluation['status'] = 'Evaluated'
    return evaluation


@app.post('/api/ai/train-matchbox')
def train_matchbox_evaluation(db: Session = Depends(get_db)) -> dict[str, Any]:
    script = Path(__file__).resolve().parent.parent / 'train_matchbox.py'
    try:
        completed = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(script.parent),
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail='Model training timed out.') from exc
    if completed.returncode != 0:
        raise HTTPException(status_code=500, detail=completed.stderr[-4000:] or 'Training failed.')

    evaluation = load_matchbox_evaluation()
    if not evaluation:
        raise HTTPException(status_code=500, detail='Training completed but evaluation results were unavailable.')

    evaluation_date = datetime.utcnow()
    for row in evaluation['comparison']:
        db.add(ModelComparisonResult(
            model_name=row['model_name'],
            dataset_version=evaluation['dataset']['name'],
            evaluation_date=evaluation_date,
            accuracy=row['accuracy'],
            precision=row['precision'],
            recall=row['recall'],
            f1_score=row['f1_score'],
            confusion_matrix=row['confusion_matrix'],
            training_time_seconds=row['training_time_seconds'],
            prediction_time_seconds=row['prediction_time_seconds'],
            training_records=evaluation['dataset_split']['train'],
            validation_records=evaluation['dataset_split']['validation'],
            testing_records=evaluation['dataset_split']['test'],
        ))
    db.commit()
    evaluation['status'] = 'Evaluated'
    return evaluation


@app.get('/api/ai/model-comparison')
def ai_model_comparison(db: Session = Depends(get_db)) -> dict[str, Any]:
    artifact = load_matchbox_evaluation()
    rows = db.query(ModelComparisonResult).order_by(
        ModelComparisonResult.evaluation_date.desc(),
        ModelComparisonResult.id.desc(),
    ).all()
    latest_date = rows[0].evaluation_date if rows else None
    latest_rows = [row for row in rows if latest_date and row.evaluation_date == latest_date] if rows else []
    comparison = [{
        'model_name': row.model_name,
        'accuracy': row.accuracy,
        'precision': row.precision,
        'recall': row.recall,
        'f1_score': row.f1_score,
        'training_time_seconds': row.training_time_seconds,
        'prediction_time_seconds': row.prediction_time_seconds,
        'confusion_matrix': row.confusion_matrix,
        'evaluation_date': row.evaluation_date.isoformat(),
    } for row in latest_rows]
    comparison.sort(key=lambda item: (item['accuracy'] or 0, item['f1_score'] or 0), reverse=True)
    artifact_comparison = artifact['comparison'] if artifact else []
    selected_comparison = comparison or artifact_comparison
    return {
        'dataset': artifact['dataset'] if artifact else None,
        'dataset_split': artifact['dataset_split'] if artifact else None,
        'methodology': artifact.get('methodology') if artifact else None,
        'comparison': selected_comparison,
        'best_model': selected_comparison[0]['model_name'] if selected_comparison else None,
        'history_available': artifact['history_available'] if artifact else False,
        'training_accuracy_history': artifact.get('training_accuracy_history') if artifact else None,
        'validation_accuracy_history': artifact.get('validation_accuracy_history') if artifact else None,
        'training_loss_history': artifact.get('training_loss_history') if artifact else None,
        'validation_loss_history': artifact.get('validation_loss_history') if artifact else None,
    }


@app.get('/api/testing/cases')
def list_test_cases(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    if db.query(TestCaseResult).count() == 0:
        templates = [
            ('Unit Testing', 'Space status update logic', 'Verify status transitions and validation guards.', 'Only valid status transitions are persisted.'),
            ('Integration Testing', 'Reservation API integration', 'Create and cancel a reservation through the API and database.', 'Space and reservation records remain synchronized.'),
            ('System Testing', 'End-to-end parking allocation', 'Allocate an available space to a vehicle and navigate to it.', 'Allocation succeeds once and route guidance is returned.'),
            ('Performance Testing', 'API response under normal load', 'Measure API latency for dashboard and allocation endpoints.', 'Actual latency must be recorded; no predefined pass value is assumed.'),
            ('Accuracy Testing', 'AI classification evaluation', 'Submit a real confusion matrix from a labeled test dataset.', 'Accuracy, precision, recall, F1 and specificity are calculated correctly.'),
            ('Security Testing', 'Credential and API access control', 'Verify authentication and protected backend operations.', 'Unauthorized operations are rejected and password data remains protected.'),
            ('User Acceptance Testing', 'Administrator workflow', 'Administrator reserves a space and reviews live facility analytics.', 'Workflow is clear, responsive and completes without errors.'),
        ]
        for category, name, description, expected in templates:
            db.add(TestCaseResult(category=category, name=name, description=description, expected_result=expected, actual_result='Not executed yet.', status='PENDING'))
        db.commit()
    return [{
        'id': row.id,
        'category': row.category,
        'name': row.name,
        'description': row.description,
        'expected_result': row.expected_result,
        'actual_result': row.actual_result,
        'status': row.status,
        'executed_at': row.executed_at.isoformat() if row.executed_at else None,
    } for row in db.query(TestCaseResult).order_by(TestCaseResult.category, TestCaseResult.id).all()]


@app.post('/api/testing/cases')
def create_test_case(payload: TestCaseCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if payload.status not in {'PENDING', 'PASS', 'FAIL'}:
        raise HTTPException(status_code=422, detail='Status must be PENDING, PASS, or FAIL.')
    row = TestCaseResult(
        category=payload.category,
        name=payload.name,
        description=payload.description,
        expected_result=payload.expected_result,
        actual_result=payload.actual_result or 'Not executed yet.',
        status=payload.status,
        executed_at=datetime.utcnow() if payload.status != 'PENDING' else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {'id': row.id, 'status': row.status}


@app.patch('/api/testing/cases/{case_id}')
def update_test_case(case_id: int, payload: TestCaseUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.query(TestCaseResult).filter(TestCaseResult.id == case_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Test case not found.')
    if payload.status is not None:
        if payload.status not in {'PENDING', 'PASS', 'FAIL'}:
            raise HTTPException(status_code=422, detail='Status must be PENDING, PASS, or FAIL.')
        row.status = payload.status
        row.executed_at = datetime.utcnow() if payload.status != 'PENDING' else None
    if payload.actual_result is not None:
        row.actual_result = payload.actual_result
    db.commit()
    return {'id': row.id, 'status': row.status, 'actual_result': row.actual_result}


@app.get('/api/analytics/occupancy')
def analytics_occupancy(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    data = [
        {'label': '09:00', 'occupied': 5},
        {'label': '10:00', 'occupied': 7},
        {'label': '11:00', 'occupied': 8},
        {'label': '12:00', 'occupied': 9},
        {'label': '13:00', 'occupied': 10},
        {'label': '14:00', 'occupied': 12},
        {'label': '15:00', 'occupied': 14},
    ]
    return data


@app.get('/api/analytics/revenue')
def analytics_revenue(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [
        {'label': 'Mon', 'revenue': 2100},
        {'label': 'Tue', 'revenue': 2600},
        {'label': 'Wed', 'revenue': 3100},
        {'label': 'Thu', 'revenue': 2900},
        {'label': 'Fri', 'revenue': 3700},
    ]


@app.get('/api/analytics/vehicles')
def analytics_vehicles(db: Session = Depends(get_db)) -> dict[str, Any]:
    return {'arrivals': 43, 'departures': 38, 'active': 12}


@app.get('/api/analytics/parking-duration')
def analytics_parking_duration(db: Session = Depends(get_db)) -> dict[str, Any]:
    return {'average_minutes': 95, 'median_minutes': 82}


@app.get('/api/auth/me')
def current_user(token: str = Query(..., alias='token')) -> dict[str, Any]:
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail='Invalid or expired token.') from exc
    return {'email': payload.get('sub', 'guest'), 'role': 'ADMIN'}


@app.post('/api/auth/login')
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    token = create_access_token(subject=user.email)
    return {'token': token, 'role': user.role, 'name': user.name}


@app.post('/api/auth/register')
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail='User already exists')
    user = User(email=payload.email, name=payload.name, password_hash=hash_password(payload.password), role=payload.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=user.email)
    return {'token': token, 'role': user.role, 'name': user.name}


@app.websocket('/ws/parking')
async def parking_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        await websocket.send_json({'event': 'connected', 'message': 'Parkwise websocket connected'})
        while True:
            message = await websocket.receive_text()
            await websocket.send_json({'event': 'space_updated', 'data': {'message': message}})
    except WebSocketDisconnect:
        return


def a_star(graph: dict[str, list[str]], start: str, goal: str) -> list[str]:
    if goal not in graph:
        return [start, goal]
    queue: list[tuple[int, list[str]]] = [(0, [start])]
    seen: set[str] = set()
    while queue:
        _, path = queue.pop(0)
        node = path[-1]
        if node == goal:
            return path
        if node in seen:
            continue
        seen.add(node)
        for neighbor in graph.get(node, []):
            if neighbor in path:
                continue
            queue.append((len(path) + 1, path + [neighbor]))
    return [start, goal]


def determine_price_rate(db: Session, occupancy_rate: Optional[float] = None) -> float:
    if occupancy_rate is None:
        occupancy_rate = dashboard_summary(db)['occupancy_rate']
    if occupancy_rate < 40:
        return 20.0
    if occupancy_rate < 70:
        return 30.0
    if occupancy_rate < 90:
        return 40.0
    return 50.0


def build_route(destination: str) -> list[str]:
    prefix = destination.split('-')[0]
    path = ['ENTRANCE', 'A1', 'A2', destination]
    if prefix in {'B', 'C'}:
        path = ['ENTRANCE', 'B1', 'B2', destination]
    return path
