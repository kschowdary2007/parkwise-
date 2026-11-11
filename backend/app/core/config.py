import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / '.env'),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = 'Parkwise API'
    api_prefix: str = '/api'
    database_url: str = Field(default='sqlite:///./parkwise.db', validation_alias=AliasChoices('DATABASE_URL', 'database_url'))
    secret_key: str = Field(default='dev-secret-key', validation_alias=AliasChoices('SECRET_KEY', 'secret_key'))
    access_token_expire_minutes: int = Field(default=60, validation_alias=AliasChoices('ACCESS_TOKEN_EXPIRE_MINUTES', 'access_token_expire_minutes'))
    ai_mode: str = Field(default='demo', validation_alias=AliasChoices('AI_MODE', 'ai_mode'))
    yolo_model_path: str = Field(default='', validation_alias=AliasChoices('YOLO_MODEL_PATH', 'yolo_model_path'))
    yolo_model_variants: str = Field(default='{}', validation_alias=AliasChoices('YOLO_MODEL_VARIANTS', 'yolo_model_variants'))
    yolo_dataset_yaml: str = Field(default='', validation_alias=AliasChoices('YOLO_DATASET_YAML', 'yolo_dataset_yaml'))
    yolo_training_results_path: str = Field(default='', validation_alias=AliasChoices('YOLO_TRAINING_RESULTS', 'yolo_training_results_path'))
    yolo_parking_rois: str = Field(default='{}', validation_alias=AliasChoices('YOLO_PARKING_ROIS', 'yolo_parking_rois'))
    yolo_camera_sources: str = Field(default='{}', validation_alias=AliasChoices('YOLO_CAMERA_SOURCES', 'yolo_camera_sources'))
    ocr_enabled: bool = Field(default=False, validation_alias=AliasChoices('OCR_ENABLED', 'ocr_enabled'))
    cors_origins: str = Field(default='http://localhost:5173', validation_alias=AliasChoices('CORS_ORIGINS', 'cors_origins'))

    @field_validator('cors_origins')
    @classmethod
    def parse_cors(cls, value: str) -> str:
        return value or 'http://localhost:5173'


@lru_cache

def get_settings() -> Settings:
    return Settings()
