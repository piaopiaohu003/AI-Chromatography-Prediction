"""Inverse identification of compounds from observed chromatographic peaks.

The forward simulator is the physical model: every candidate is simulated under
the supplied conditions, then observed retention times are matched to predicted
retention times with a global one-to-one assignment (Hungarian algorithm).
An observed UV absorption maximum can be supplied as an orthogonal constraint.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.optimize import linear_sum_assignment

from .compounds import COMPOUNDS
from .models import Compound, IdentifyRequest, ObservedPeak
from .simulation import simulate

MAX_CANDIDATES = 200


def _default_library() -> List[Compound]:
    return [Compound(**item) for item in COMPOUNDS]


def _candidate_pool(request: IdentifyRequest) -> List[Compound]:
    pool = request.candidates if request.candidates else _default_library()
    if len(pool) > MAX_CANDIDATES:
        raise ValueError(f"候选组分最多 {MAX_CANDIDATES} 个，当前 {len(pool)} 个")
    return pool


def _predictions(pool: List[Compound], request: IdentifyRequest) -> List[Optional[Dict]]:
    predictions: List[Optional[Dict]] = []
    for compound in pool:
        try:
            result = simulate([compound], request.conditions)
            predictions.append(result["peaks"][0] if result["peaks"] else None)
        except Exception:  # noqa: BLE001 - a bad candidate must not break the search
            predictions.append(None)
    return predictions


def _uv_similarity(observed: ObservedPeak, compound: Compound) -> float:
    if observed.lambda_max_nm is None:
        return 1.0
    sigma = 12.0
    return math.exp(-0.5 * ((observed.lambda_max_nm - compound.lambda_max_nm) / sigma) ** 2)


def _pair_metrics(
    observed: ObservedPeak,
    compound: Compound,
    peak: Optional[Dict],
    tolerance_min: float,
    tolerance_pct: float,
) -> Optional[Dict]:
    if not peak or peak.get("tr_min") is None:
        return None
    predicted = float(peak["tr_min"])
    delta = abs(predicted - observed.tr_min)
    tolerance = max(tolerance_min, tolerance_pct * max(predicted, 1.0))
    tr_score = math.exp(-0.5 * (delta / tolerance) ** 2)
    uv_score = _uv_similarity(observed, compound)
    visible = bool(peak.get("visible"))
    score = tr_score * (0.75 + 0.25 * uv_score) * (1.0 if visible else 0.35)
    return {
        "predicted_tr_min": predicted,
        "delta_min": delta,
        "tolerance_min": tolerance,
        "score": score,
        "uv_score": uv_score,
        "visible": visible,
    }


def _confidence(metrics: Dict) -> str:
    if metrics["delta_min"] <= metrics["tolerance_min"] and metrics["score"] >= 0.75:
        return "high"
    if metrics["score"] >= 0.45:
        return "medium"
    return "low"


def _public_candidate(compound: Compound, metrics: Dict) -> Dict:
    return {
        "compound_id": compound.id,
        "name": compound.name,
        "name_en": compound.name_en,
        "category": compound.category,
        "predicted_tr_min": round(metrics["predicted_tr_min"], 3),
        "delta_min": round(metrics["delta_min"], 3),
        "score": round(metrics["score"], 4),
        "confidence": _confidence(metrics),
        "uv_score": round(metrics["uv_score"], 3),
        "visible": metrics["visible"],
        "lambda_max_nm": compound.lambda_max_nm,
    }


def _peak_label(observed: ObservedPeak, index: int) -> str:
    return observed.label or f"峰 {index + 1}"


def identify(request: IdentifyRequest) -> Dict:
    pool = _candidate_pool(request)
    predictions = _predictions(pool, request)
    observations = request.observed_peaks

    n_obs = len(observations)
    n_cand = len(pool)
    scores = np.zeros((n_obs, n_cand), dtype=float)
    entries: List[List[Optional[Dict]]] = [[None] * n_cand for _ in range(n_obs)]

    for i, observed in enumerate(observations):
        for j, compound in enumerate(pool):
            metrics = _pair_metrics(
                observed,
                compound,
                predictions[j],
                request.tolerance_min,
                request.tolerance_pct,
            )
            if metrics is None:
                continue
            entries[i][j] = _public_candidate(compound, metrics)
            scores[i, j] = metrics["score"]

    # Global one-to-one assignment between observed peaks and candidates.
    assigned: Dict[int, int] = {}
    if n_obs and n_cand:
        rows, cols = linear_sum_assignment(-scores)
        for row, col in zip(rows, cols):
            if scores[row, col] >= request.min_score:
                assigned[int(row)] = int(col)

    peak_results: List[Dict] = []
    unmatched: List[str] = []
    warnings: List[str] = []

    for i, observed in enumerate(observations):
        row = scores[i]
        ranked = np.argsort(-row)
        top_indices = [int(j) for j in ranked if row[j] > 0][: request.max_candidates]
        candidates = [entries[i][j] for j in top_indices if entries[i][j] is not None]
        positive = [float(row[j]) for j in ranked if row[j] > 0]
        margin = positive[0] - positive[1] if len(positive) >= 2 else (positive[0] if positive else 0.0)
        second_score = positive[1] if len(positive) >= 2 else 0.0
        second_entry = entries[i][int(ranked[1])] if len(positive) >= 2 else None

        chosen = entries[i][assigned[i]] if i in assigned else None
        if chosen is None:
            unmatched.append(_peak_label(observed, i))
        elif margin < 0.10 and chosen["score"] < 0.95:
            warnings.append(
                f"「{_peak_label(observed, i)}」存在多个保留时间接近的候选，"
                "建议补充 UV 光谱、质谱或标准品比对。"
            )
        elif second_score >= 0.5 and second_entry is not None:
            if chosen["confidence"] == "high":
                chosen["confidence"] = "medium"
            warnings.append(
                f"「{_peak_label(observed, i)}」的次优候选「{second_entry['name']}」"
                f"得分 {second_score:.2f}，建议用标准品或质谱进一步确认。"
            )

        peak_results.append({
            "peak_label": _peak_label(observed, i),
            "observed_tr_min": observed.tr_min,
            "assigned": chosen,
            "margin": round(float(margin), 4),
            "candidates": candidates,
        })

    assignments = []
    matched_compounds: List[Compound] = []
    for i in sorted(assigned):
        j = assigned[i]
        entry = entries[i][j]
        if entry is None:
            continue
        assignments.append({
            "peak_index": i,
            "peak_label": _peak_label(observations[i], i),
            "observed_tr_min": observations[i].tr_min,
            **entry,
        })
        matched_compounds.append(pool[j])

    if not assignments:
        warnings.append("没有候选组分与观测峰匹配，请检查色谱条件、保留时间或候选范围。")
    if unmatched:
        warnings.append("以下观测峰未匹配到候选组分：" + "、".join(unmatched) + "。")
    if n_obs > n_cand:
        warnings.append("观测峰数量多于候选组分数量，部分峰无法完成一对一匹配。")

    reconstruction = None
    if matched_compounds and request.include_reconstruction:
        reconstruction = simulate(matched_compounds, request.conditions)

    return {
        "conditions": request.conditions.model_dump(),
        "candidate_count": n_cand,
        "peak_count": n_obs,
        "peaks": peak_results,
        "assignments": assignments,
        "unmatched_peaks": unmatched,
        "reconstruction": reconstruction,
        "warnings": warnings,
    }
