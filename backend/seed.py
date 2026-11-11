from datetime import datetime

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    AiPrediction,
    CameraDevice,
    OccupancyHistory,
    ParkingDetection,
    ParkingLevel,
    ParkingLot,
    ParkingSession,
    ParkingSpace,
    Payment,
    PricingRule,
    Reservation,
    SystemEvent,
    User,
    Vehicle,
)


def seed_database(db: Session) -> None:
    lot = ParkingLot(name='Northgate Centre', location='Hyderabad', capacity=20)
    db.add(lot)
    db.flush()

    level = ParkingLevel(lot_id=lot.id, name='Level 01')
    db.add(level)
    db.flush()

    demo_spaces = [
        ('A-01', 'A', 'AVAILABLE', True, False),
        ('A-02', 'A', 'OCCUPIED', False, False),
        ('A-03', 'A', 'AVAILABLE', False, True),
        ('A-04', 'A', 'RESERVED', False, False),
        ('B-01', 'B', 'AVAILABLE', True, False),
        ('B-02', 'B', 'HELD', False, False),
        ('B-03', 'B', 'OCCUPIED', False, False),
        ('B-04', 'B', 'AVAILABLE', False, True),
        ('C-01', 'C', 'AVAILABLE', True, False),
        ('C-02', 'C', 'OCCUPIED', False, False),
        ('C-03', 'C', 'AVAILABLE', False, False),
        ('C-04', 'C', 'RESERVED', False, False),
        ('D-01', 'D', 'OCCUPIED', False, False),
        ('D-02', 'D', 'AVAILABLE', False, False),
        ('D-03', 'D', 'AVAILABLE', False, False),
        ('D-04', 'D', 'HELD', False, False),
        ('E-01', 'E', 'AVAILABLE', True, False),
        ('E-02', 'E', 'AVAILABLE', False, False),
        ('E-03', 'E', 'AVAILABLE', False, True),
        ('E-04', 'E', 'OCCUPIED', False, False),
    ]

    for code, zone, status, accessibility, ev in demo_spaces:
        sp = ParkingSpace(
            lot_id=lot.id,
            level_id=level.id,
            space_code=code,
            floor='Level 01',
            zone=zone,
            status=status,
            type='STANDARD',
            accessibility=accessibility,
            ev_charging=ev,
            latitude=0.0,
            longitude=0.0,
            last_updated=datetime.utcnow(),
        )
        db.add(sp)
    db.flush()

    user = User(email='admin@parkwise.local', name='Admin User', password_hash=hash_password('password123'), role='ADMIN')
    db.add(user)
    db.flush()

    vehicles = [
        Vehicle(user_id=user.id, vehicle_number='AP39AB1234', vehicle_type='CAR', owner='Shiva', phone='9876543210', ev=False, accessibility_requirement=False),
        Vehicle(user_id=user.id, vehicle_number='AP05CD7821', vehicle_type='CAR', owner='Ravi', phone='9123456789', ev=False, accessibility_requirement=False),
        Vehicle(user_id=user.id, vehicle_number='TS09EF4532', vehicle_type='SUV', owner='Kiran', phone='9765432109', ev=True, accessibility_requirement=False),
        Vehicle(user_id=user.id, vehicle_number='AP16GH9182', vehicle_type='CAR', owner='Asha', phone='9988776655', ev=False, accessibility_requirement=True),
        Vehicle(user_id=user.id, vehicle_number='KA01JK7821', vehicle_type='CAR', owner='Priya', phone='9876123456', ev=True, accessibility_requirement=False),
    ]
    db.add_all(vehicles)
    db.flush()

    for space_code, vehicle in [('A-04', vehicles[2]), ('C-04', vehicles[3])]:
        space = db.query(ParkingSpace).filter(ParkingSpace.space_code == space_code).first()
        if space:
            db.add(Reservation(
                user_id=user.id,
                vehicle_id=vehicle.id,
                parking_space_id=space.id,
                start_time=datetime.utcnow(),
                status='ACTIVE',
            ))

    for idx, vehicle in enumerate(vehicles[:2], start=1):
        space = db.query(ParkingSpace).filter(ParkingSpace.space_code == demo_spaces[idx - 1][0]).first()
        if space:
            space.status = 'OCCUPIED'
            space.current_vehicle_id = vehicle.id
            space.last_updated = datetime.utcnow()
            session = ParkingSession(
                vehicle_id=vehicle.id,
                parking_space_id=space.id,
                entry_time=datetime.utcnow(),
                duration_minutes=90,
                price_per_hour=30,
                total_amount=45,
                status='ACTIVE',
            )
            db.add(session)
            db.flush()
            db.add(Payment(session_id=session.id, amount=45, payment_method='UPI', status='PAID'))

    db.add(PricingRule(name='0-40%', occupancy_min=0, occupancy_max=40, price_per_hour=20, is_active=True))
    db.add(PricingRule(name='40-70%', occupancy_min=40, occupancy_max=70, price_per_hour=30, is_active=True))
    db.add(PricingRule(name='70-90%', occupancy_min=70, occupancy_max=90, price_per_hour=40, is_active=True))
    db.add(PricingRule(name='90-100%', occupancy_min=90, occupancy_max=100, price_per_hour=50, is_active=True))

    db.add_all([
        AiPrediction(hour='09:00', occupancy_percent=25),
        AiPrediction(hour='10:00', occupancy_percent=31),
        AiPrediction(hour='11:00', occupancy_percent=38),
        AiPrediction(hour='12:00', occupancy_percent=45),
        AiPrediction(hour='13:00', occupancy_percent=52),
        AiPrediction(hour='14:00', occupancy_percent=61),
        AiPrediction(hour='15:00', occupancy_percent=70),
        AiPrediction(hour='16:00', occupancy_percent=79),
        AiPrediction(hour='17:00', occupancy_percent=91),
        AiPrediction(hour='18:00', occupancy_percent=87),
        AiPrediction(hour='19:00', occupancy_percent=74),
        AiPrediction(hour='20:00', occupancy_percent=58),
        AiPrediction(hour='21:00', occupancy_percent=42),
    ])

    db.add_all([
        CameraDevice(name='CAM 01', location='Main Entrance', stream_url='demo://cam1', status='ONLINE', fps=18, resolution='1920x1080', detection_accuracy=98.4),
        CameraDevice(name='CAM 02', location='South Wing', stream_url='demo://cam2', status='ONLINE', fps=16, resolution='1280x720', detection_accuracy=97.6),
        CameraDevice(name='CAM 03', location='Level 01', stream_url='demo://cam3', status='WARNING', fps=12, resolution='1280x720', detection_accuracy=95.8),
    ])

    db.add_all([
        SystemEvent(event_type='camera_status_changed', message='Camera 01 came online.'),
        SystemEvent(event_type='vehicle_detected', message='Vehicle AP39AB1234 detected in A-02.'),
        SystemEvent(event_type='reservation_created', message='A-04 reserved for a user.'),
    ])

    db.add_all([
        OccupancyHistory(parking_space_id=1, previous_status='AVAILABLE', new_status='OCCUPIED'),
        OccupancyHistory(parking_space_id=2, previous_status='AVAILABLE', new_status='RESERVED'),
    ])

    db.add_all([
        ParkingDetection(parking_space_id=2, vehicle_number='AP39AB1234', confidence=0.96, camera='CAM 01', timestamp=datetime.utcnow()),
        ParkingDetection(parking_space_id=14, vehicle_number='TS09EF4532', confidence=0.94, camera='CAM 02', timestamp=datetime.utcnow()),
    ])

    db.commit()


if __name__ == '__main__':
    db = SessionLocal()
    try:
        seed_database(db)
        print('Database seeded with demo Parkwise data.')
    finally:
        db.close()
