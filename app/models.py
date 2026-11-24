"""Pydantic data models shared by the API and the simulation engine."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ColumnConfig(BaseModel):
    length_mm: float = Field(150.0, ge=30.0, le=300.0)
    inner_diameter_mm: float = Field(4.6, ge=1.0, le=10.0)
    particle_um: float = Field(5.0, ge=1.2, le=10.0)
    porosity: float = Field(0.65, ge=0.45, le=0.85)


class GradientPoint(BaseModel):
    time_min: float = Field(..., ge=0.0, le=600.0)
    percent_b: float = Field(..., ge=0.0, le=100.0)


class Conditions(BaseModel):
    mode: Literal["isocratic", "gradient"] = "gradient"
    organic: Literal["ACN", "MeOH"] = "ACN"
    percent_b: float = Field(50.0, ge=0.0, le=100.0)
    gradient: List[GradientPoint] = Field(
        default_factory=lambda: [
            GradientPoint(time_min=0.0, percent_b=5.0),
            GradientPoint(time_min=20.0, percent_b=95.0),
            GradientPoint(time_min=25.0, percent_b=95.0),
        ]
    )
    flow_ml_min: float = Field(1.0, ge=0.05, le=5.0)
    temperature_c: float = Field(30.0, ge=10.0, le=70.0)
    ph: float = Field(2.5, ge=0.5, le=13.0)
    wavelength_nm: float = Field(254.0, ge=180.0, le=800.0)
    column: ColumnConfig = Field(default_factory=ColumnConfig)
    dwell_volume_ml: float = Field(1.0, ge=0.0, le=5.0)
    injection_volume_ul: float = Field(10.0, ge=0.1, le=100.0)
    total_time_min: Optional[float] = Field(None, ge=1.0, le=300.0)
    noise_mau: float = Field(0.15, ge=0.0, le=2.0)


class Compound(BaseModel):
    id: str
    name: str
    name_en: Optional[str] = None
    category: Optional[str] = None
    log_p: float
    pka: Optional[float] = None
    acid_base: Literal["acid", "base", "neutral"] = "neutral"
    lambda_max_nm: float = 254.0
    concentration_mg_l: float = Field(100.0, ge=0.01, le=10000.0)
    log_kw: Optional[float] = None
    s_value: Optional[float] = None
    epsilon_max: float = 1.0


class SimulateRequest(BaseModel):
    compounds: List[Compound]
    conditions: Conditions


class RecommendConstraints(BaseModel):
    detector: Literal["UV", "MS"] = "UV"
    organic: Literal["auto", "ACN", "MeOH"] = "auto"
    mode: Literal["auto", "isocratic", "gradient"] = "auto"
    max_run_min: float = Field(40.0, ge=8.0, le=120.0)


class AIOverride(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


class RecommendRequest(BaseModel):
    compounds: List[Compound]
    constraints: RecommendConstraints = Field(default_factory=RecommendConstraints)
    ai: Optional[AIOverride] = None


class AITestRequest(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
