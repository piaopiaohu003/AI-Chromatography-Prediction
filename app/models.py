"""Pydantic data models shared by the API and the simulation engine."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ColumnConfig(BaseModel):
    length_mm: float = Field(150.0, ge=30.0, le=300.0)
    inner_diameter_mm: float = Field(4.6, ge=1.0, le=10.0)
    particle_um: float = Field(5.0, ge=1.2, le=10.0)
    porosity: float = Field(0.65, ge=0.45, le=0.85)
    chemistry: Literal["c18", "silica", "diol", "amino"] = "c18"


class GradientPoint(BaseModel):
    time_min: float = Field(..., ge=0.0, le=600.0)
    percent_b: float = Field(..., ge=0.0, le=100.0)


class Conditions(BaseModel):
    phase: Literal["reversed", "normal"] = "reversed"
    mode: Literal["isocratic", "gradient"] = "gradient"
    organic: Literal[
        "ACN", "MeOH", "IPA", "EtOAc", "THF", "EtOH", "custom"
    ] = "ACN"
    organic_label: Optional[str] = Field(None, max_length=40)
    aqueous: Literal[
        "auto", "water", "buffer", "hexane", "heptane", "cyclohexane", "custom"
    ] = "auto"
    aqueous_label: Optional[str] = Field(None, max_length=40)
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
    log_k_np: Optional[float] = None
    s_np: Optional[float] = None
    epsilon_max: float = 1.0


class SimulateRequest(BaseModel):
    compounds: List[Compound]
    conditions: Conditions


class RecommendConstraints(BaseModel):
    detector: Literal["UV", "MS"] = "UV"
    phase: Literal["auto", "reversed", "normal"] = "auto"
    organic: Literal["auto", "ACN", "MeOH", "IPA", "EtOAc"] = "auto"
    mode: Literal["auto", "isocratic", "gradient"] = "auto"
    max_run_min: float = Field(40.0, ge=8.0, le=120.0)


class AuthRequest(BaseModel):
    username: str
    password: str


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


class ObservedPeak(BaseModel):
    label: Optional[str] = None
    tr_min: float = Field(..., ge=0.0, le=600.0)
    height_mau: Optional[float] = Field(None, ge=0.0)
    area: Optional[float] = Field(None, ge=0.0)
    lambda_max_nm: Optional[float] = Field(None, ge=180.0, le=800.0)


class IdentifyRequest(BaseModel):
    conditions: Conditions
    observed_peaks: List[ObservedPeak] = Field(..., min_length=1, max_length=20)
    candidates: Optional[List[Compound]] = Field(None, max_length=200)
    tolerance_min: float = Field(0.20, ge=0.02, le=2.0)
    tolerance_pct: float = Field(0.02, ge=0.0, le=0.10)
    min_score: float = Field(0.35, ge=0.0, le=1.0)
    max_candidates: int = Field(5, ge=1, le=10)
    include_reconstruction: bool = True
