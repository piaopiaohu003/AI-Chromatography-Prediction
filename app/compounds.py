"""Built-in compound library with experimentally calibrated RPLC descriptors.

`log_kw` is the extrapolated retention factor in pure water (log10 scale) and
`s_value` the solvent-strength slope S of the linear solvent strength (LSS)
model for the default C18 stationary phase.  Both are held at 25 °C.  Values
were selected to reproduce typical published C18 retentions; for compounds
outside the library the engine falls back to a logP-based QSRR estimate.
"""

from __future__ import annotations

from typing import Dict, List

COMPOUNDS: List[Dict] = [
    {
        "id": "acetaminophen", "name": "对乙酰氨基酚", "name_en": "Acetaminophen",
        "category": "药物", "log_p": 0.46, "pka": 9.38, "acid_base": "acid",
        "lambda_max_nm": 245, "log_kw": 1.92, "s_value": 4.30,
    },
    {
        "id": "caffeine", "name": "咖啡因", "name_en": "Caffeine",
        "category": "药物", "log_p": -0.07, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 273, "log_kw": 1.28, "s_value": 4.05,
    },
    {
        "id": "theophylline", "name": "茶碱", "name_en": "Theophylline",
        "category": "药物", "log_p": -0.02, "pka": 8.8, "acid_base": "acid",
        "lambda_max_nm": 271, "log_kw": 1.32, "s_value": 4.10,
    },
    {
        "id": "aspirin", "name": "阿司匹林", "name_en": "Aspirin",
        "category": "药物", "log_p": 1.19, "pka": 3.50, "acid_base": "acid",
        "lambda_max_nm": 277, "log_kw": 2.35, "s_value": 4.32,
    },
    {
        "id": "benzoic-acid", "name": "苯甲酸", "name_en": "Benzoic acid",
        "category": "食品添加剂", "log_p": 1.87, "pka": 4.20, "acid_base": "acid",
        "lambda_max_nm": 230, "log_kw": 2.58, "s_value": 4.39,
    },
    {
        "id": "salicylic-acid", "name": "水杨酸", "name_en": "Salicylic acid",
        "category": "药物", "log_p": 2.26, "pka": 2.97, "acid_base": "acid",
        "lambda_max_nm": 236, "log_kw": 2.62, "s_value": 4.44,
    },
    {
        "id": "ibuprofen", "name": "布洛芬", "name_en": "Ibuprofen",
        "category": "药物", "log_p": 3.97, "pka": 4.91, "acid_base": "acid",
        "lambda_max_nm": 222, "log_kw": 3.62, "s_value": 4.67,
    },
    {
        "id": "diclofenac", "name": "双氯芬酸", "name_en": "Diclofenac",
        "category": "药物", "log_p": 4.51, "pka": 4.15, "acid_base": "acid",
        "lambda_max_nm": 276, "log_kw": 3.95, "s_value": 4.72,
    },
    {
        "id": "sulfamethoxazole", "name": "磺胺甲噁唑", "name_en": "Sulfamethoxazole",
        "category": "药物", "log_p": 0.89, "pka": 5.60, "acid_base": "acid",
        "lambda_max_nm": 265, "log_kw": 2.05, "s_value": 4.25,
    },
    {
        "id": "chloramphenicol", "name": "氯霉素", "name_en": "Chloramphenicol",
        "category": "药物", "log_p": 1.14, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 278, "log_kw": 2.18, "s_value": 4.30,
    },
    {
        "id": "dexamethasone", "name": "地塞米松", "name_en": "Dexamethasone",
        "category": "药物", "log_p": 1.83, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 240, "log_kw": 2.78, "s_value": 4.36,
    },
    {
        "id": "testosterone", "name": "睾酮", "name_en": "Testosterone",
        "category": "药物", "log_p": 3.32, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 240, "log_kw": 3.36, "s_value": 4.52,
    },
    {
        "id": "estradiol", "name": "雌二醇", "name_en": "Estradiol",
        "category": "药物", "log_p": 4.01, "pka": 10.3, "acid_base": "acid",
        "lambda_max_nm": 280, "log_kw": 3.62, "s_value": 4.60,
    },
    {
        "id": "warfarin", "name": "华法林", "name_en": "Warfarin",
        "category": "药物", "log_p": 2.70, "pka": 5.00, "acid_base": "acid",
        "lambda_max_nm": 308, "log_kw": 3.05, "s_value": 4.48,
    },
    {
        "id": "propranolol", "name": "普萘洛尔", "name_en": "Propranolol",
        "category": "药物", "log_p": 3.48, "pka": 9.50, "acid_base": "base",
        "lambda_max_nm": 290, "log_kw": 3.25, "s_value": 4.48,
    },
    {
        "id": "metformin", "name": "二甲双胍", "name_en": "Metformin",
        "category": "药物", "log_p": -1.43, "pka": 12.4, "acid_base": "base",
        "lambda_max_nm": 233, "log_kw": 0.35, "s_value": 3.80,
    },
    {
        "id": "phenol", "name": "苯酚", "name_en": "Phenol",
        "category": "环境与酚类", "log_p": 1.46, "pka": 9.95, "acid_base": "acid",
        "lambda_max_nm": 270, "log_kw": 2.05, "s_value": 4.20,
    },
    {
        "id": "bisphenol-a", "name": "双酚A", "name_en": "Bisphenol A",
        "category": "环境与酚类", "log_p": 3.32, "pka": 9.60, "acid_base": "acid",
        "lambda_max_nm": 276, "log_kw": 3.30, "s_value": 4.50,
    },
    {
        "id": "triclosan", "name": "三氯生", "name_en": "Triclosan",
        "category": "环境与酚类", "log_p": 4.76, "pka": 7.90, "acid_base": "acid",
        "lambda_max_nm": 280, "log_kw": 3.95, "s_value": 4.70,
    },
    {
        "id": "atrazine", "name": "莠去津", "name_en": "Atrazine",
        "category": "环境与酚类", "log_p": 2.61, "pka": 1.70, "acid_base": "base",
        "lambda_max_nm": 222, "log_kw": 3.05, "s_value": 4.45,
    },
    {
        "id": "2-4-d", "name": "2,4-滴", "name_en": "2,4-D",
        "category": "环境与酚类", "log_p": 2.81, "pka": 2.73, "acid_base": "acid",
        "lambda_max_nm": 283, "log_kw": 2.85, "s_value": 4.42,
    },
    {
        "id": "nitrobenzene", "name": "硝基苯", "name_en": "Nitrobenzene",
        "category": "环境与酚类", "log_p": 1.85, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 268, "log_kw": 2.62, "s_value": 4.34,
    },
    {
        "id": "naphthalene", "name": "萘", "name_en": "Naphthalene",
        "category": "环境与酚类", "log_p": 3.30, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 275, "log_kw": 3.52, "s_value": 4.55,
    },
    {
        "id": "anthracene", "name": "蒽", "name_en": "Anthracene",
        "category": "环境与酚类", "log_p": 4.45, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 253, "log_kw": 4.05, "s_value": 4.70,
    },
    {
        "id": "toluene", "name": "甲苯", "name_en": "Toluene",
        "category": "环境与酚类", "log_p": 2.73, "pka": None, "acid_base": "neutral",
        "lambda_max_nm": 262, "log_kw": 3.28, "s_value": 4.48,
    },
    {
        "id": "ascorbic-acid", "name": "维生素C", "name_en": "Ascorbic acid",
        "category": "食品添加剂", "log_p": -1.85, "pka": 4.20, "acid_base": "acid",
        "lambda_max_nm": 245, "log_kw": 0.55, "s_value": 3.85,
    },
    {
        "id": "sorbic-acid", "name": "山梨酸", "name_en": "Sorbic acid",
        "category": "食品添加剂", "log_p": 1.33, "pka": 4.76, "acid_base": "acid",
        "lambda_max_nm": 254, "log_kw": 2.25, "s_value": 4.28,
    },
    {
        "id": "riboflavin", "name": "核黄素", "name_en": "Riboflavin",
        "category": "食品添加剂", "log_p": -1.46, "pka": 10.2, "acid_base": "acid",
        "lambda_max_nm": 267, "log_kw": 1.55, "s_value": 4.05,
    },
    {
        "id": "uracil", "name": "尿嘧啶（死体积标记）", "name_en": "Uracil",
        "category": "系统适用性", "log_p": -1.07, "pka": 9.5, "acid_base": "acid",
        "lambda_max_nm": 259, "log_kw": 0.15, "s_value": 3.60,
    },
]

CATEGORIES = ["药物", "环境与酚类", "食品添加剂", "系统适用性"]

COMPOUND_MAP: Dict[str, Dict] = {c["id"]: c for c in COMPOUNDS}


def default_compound_payload(compound_id: str, concentration: float = 100.0) -> Dict:
    """Return a Compound payload (with concentration) for a library entry."""
    base = dict(COMPOUND_MAP[compound_id])
    base["concentration_mg_l"] = concentration
    return base
