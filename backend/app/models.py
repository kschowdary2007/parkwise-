from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)
    role = Column(String(20), default='USER', nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vehicles = relationship('Vehicle', back_populates='user')
    reservations = relationship('Reservation', back_populates='user')


class ParkingLot(Base):
    __tablename__ = 'parking_lots'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    location = Column(String(255), default='Northgate Centre')
    capacity = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    levels = relationship('ParkingLevel', back_populates='lot')
    spaces = relationship('ParkingSpace', back_populates='lot')


class ParkingLevel(Base):
    __tablename__ = 'parking_levels'

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(Integer, ForeignKey('parking_lots.id'), nullable=False)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    lot = relationship('ParkingLot', back_populates='levels')
    spaces = relationship('ParkingSpace', back_populates='level')


class ParkingSpace(Base):
    __tablename__ = 'parking_spaces'

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(Integer, ForeignKey('parking_lots.id'), nullable=False)
    level_id = Column(Integer, ForeignKey('parking_levels.id'), nullable=False)
    space_code = Column(String(20), unique=True, nullable=False, index=True)
    floor = Column(String(20), nullable=False, default='Level 01')
    zone = Column(String(30), nullable=False, default='A')
    status = Column(String(20), nullable=False, default='AVAILABLE')
    type = Column(String(20), default='STANDARD')
    accessibility = Column(Boolean, default=False)
    ev_charging = Column(Boolean, default=False)
    latitude = Column(Float, default=0.0)
    longitude = Column(Float, default=0.0)
    current_vehicle_id = Column(Integer, ForeignKey('vehicles.id'), nullable=True)
    last_updated = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    lot = relationship('ParkingLot', back_populates='spaces')
    level = relationship('ParkingLevel', back_populates='spaces')
    vehicle = relationship('Vehicle', back_populates='spaces')
    reservations = relationship('Reservation', back_populates='parking_space')
    sessions = relationship('ParkingSession', back_populates='parking_space')
    occupancy_history = relationship('OccupancyHistory', back_populates='parking_space')
    detections = relationship('ParkingDetection', back_populates='parking_space')


class Vehicle(Base):
    __tablename__ = 'vehicles'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    vehicle_number = Column(String(30), unique=True, nullable=False, index=True)
    vehicle_type = Column(String(50), default='CAR')
    owner = Column(String(100), nullable=False)
    phone = Column(String(30), nullable=True)
    ev = Column(Boolean, default=False)
    accessibility_requirement = Column(Boolean, default=False)
    registration_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship('User', back_populates='vehicles')
    spaces = relationship('ParkingSpace', back_populates='vehicle')
    sessions = relationship('ParkingSession', back_populates='vehicle')
    reservations = relationship('Reservation', back_populates='vehicle')


class Reservation(Base):
    __tablename__ = 'reservations'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id'), nullable=False)
    parking_space_id = Column(Integer, ForeignKey('parking_spaces.id'), nullable=False)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    status = Column(String(20), default='ACTIVE')
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship('User', back_populates='reservations')
    vehicle = relationship('Vehicle', back_populates='reservations')
    parking_space = relationship('ParkingSpace', back_populates='reservations')


class ParkingSession(Base):
    __tablename__ = 'parking_sessions'

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id'), nullable=False)
    parking_space_id = Column(Integer, ForeignKey('parking_spaces.id'), nullable=False)
    entry_time = Column(DateTime, default=datetime.utcnow)
    exit_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, default=0)
    price_per_hour = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    status = Column(String(20), default='ACTIVE')
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship('Vehicle', back_populates='sessions')
    parking_space = relationship('ParkingSpace', back_populates='sessions')
    payment = relationship('Payment', back_populates='session', uselist=False)


class Payment(Base):
    __tablename__ = 'payments'

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey('parking_sessions.id'), nullable=False, unique=True)
    amount = Column(Float, default=0.0)
    payment_method = Column(String(30), default='UPI')
    status = Column(String(20), default='PENDING')
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship('ParkingSession', back_populates='payment')


class ParkingDetection(Base):
    __tablename__ = 'parking_detections'

    id = Column(Integer, primary_key=True, index=True)
    parking_space_id = Column(Integer, ForeignKey('parking_spaces.id'), nullable=True)
    vehicle_number = Column(String(30), nullable=True)
    confidence = Column(Float, default=0.0)
    camera = Column(String(100), default='CAM 01')
    timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    parking_space = relationship('ParkingSpace', back_populates='detections')


class VehicleDetectionRecord(Base):
    __tablename__ = 'vehicle_detection_records'

    id = Column(Integer, primary_key=True, index=True)
    vehicle_class = Column(String(30), nullable=False, index=True)
    confidence = Column(Float, nullable=False)
    camera_id = Column(String(100), nullable=False, index=True)
    parking_space_id = Column(Integer, ForeignKey('parking_spaces.id'), nullable=True)
    occupancy_status = Column(String(20), nullable=True)
    source = Column(String(20), nullable=False, default='image')
    inference_ms = Column(Float, nullable=False)
    recorded_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    parking_space = relationship('ParkingSpace')


class YoloModelEvaluation(Base):
    __tablename__ = 'yolo_model_evaluations'

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String(36), nullable=False, index=True)
    model_name = Column(String(100), nullable=False)
    dataset_name = Column(String(255), nullable=False)
    split = Column(String(20), nullable=False)
    metrics = Column(JSON, nullable=False)
    confusion_matrix = Column(JSON, nullable=True)
    model_size_mb = Column(Float, nullable=True)
    hardware = Column(String(255), nullable=True)
    evaluated_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class OccupancyHistory(Base):
    __tablename__ = 'occupancy_history'

    id = Column(Integer, primary_key=True, index=True)
    parking_space_id = Column(Integer, ForeignKey('parking_spaces.id'), nullable=False)
    previous_status = Column(String(20), nullable=True)
    new_status = Column(String(20), nullable=False)
    recorded_at = Column(DateTime, default=datetime.utcnow)

    parking_space = relationship('ParkingSpace', back_populates='occupancy_history')


class PricingRule(Base):
    __tablename__ = 'pricing_rules'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    occupancy_min = Column(Float, default=0.0)
    occupancy_max = Column(Float, default=100.0)
    price_per_hour = Column(Float, default=20.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AiPrediction(Base):
    __tablename__ = 'ai_predictions'

    id = Column(Integer, primary_key=True, index=True)
    hour = Column(String(10), nullable=False)
    occupancy_percent = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class CameraDevice(Base):
    __tablename__ = 'camera_devices'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    location = Column(String(100), default='Level 01')
    stream_url = Column(String(255), default='demo://camera')
    status = Column(String(20), default='ONLINE')
    last_seen = Column(DateTime, default=datetime.utcnow)
    fps = Column(Integer, default=18)
    resolution = Column(String(50), default='1920x1080')
    detection_accuracy = Column(Float, default=98.4)
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemEvent(Base):
    __tablename__ = 'system_events'

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelEvaluation(Base):
    __tablename__ = 'model_evaluations'

    id = Column(Integer, primary_key=True, index=True)
    evaluation_date = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    model_type = Column(String(50), nullable=False, default='parking_classification')
    model_name = Column(String(100), nullable=False)
    dataset_name = Column(String(255), nullable=True)
    dataset_split = Column(JSON, nullable=True)
    confusion_matrix = Column(JSON, nullable=True)
    classification_metrics = Column(JSON, nullable=True)
    detection_metrics = Column(JSON, nullable=True)
    prediction_metrics = Column(JSON, nullable=True)
    precision_recall_curve = Column(JSON, nullable=True)
    actual_vs_predicted = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelComparisonResult(Base):
    __tablename__ = 'model_comparison_results'

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(100), nullable=False)
    dataset_version = Column(String(255), nullable=False)
    evaluation_date = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    accuracy = Column(Float, nullable=True)
    precision = Column(Float, nullable=True)
    recall = Column(Float, nullable=True)
    f1_score = Column(Float, nullable=True)
    confusion_matrix = Column(JSON, nullable=True)
    training_time_seconds = Column(Float, nullable=True)
    prediction_time_seconds = Column(Float, nullable=True)
    training_records = Column(Integer, nullable=True)
    validation_records = Column(Integer, nullable=True)
    testing_records = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TestCaseResult(Base):
    __tablename__ = 'test_case_results'

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    expected_result = Column(Text, nullable=True)
    actual_result = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default='PENDING')
    executed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
