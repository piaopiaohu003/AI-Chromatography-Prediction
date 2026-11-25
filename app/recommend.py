"""Chromatographic method design: rule-based expert system + optional LLM.

The rule engine derives pH, organic modifier, column, flow, wavelength and an
isocratic/gradient program from the analytes' logP / pKa / lambda_max, then
validates every candidate with the same physical simulation used by the
front-end.  When an OpenAI-compatible endpoint is configured the LLM proposals
are normalised, clamped to instrument limits and re-simulated, so the returned
chromatogram is always physically consistent.
"""

from __future__ import annotations

import json
import math
from typing import Dict, List, Optional, Tuple

import numpy as np

from . import ai_client
from .models import (
    AIOverride,
    ColumnConfig,
    Compound,
    Conditions,
    GradientPoint,
    RecommendConstraints,
)
from .simulation import (
    _eps_rel,
    _log_kw,
    _neutral_fraction,
    _np_log_k_ref,
    _np_s,
    _s_value,
    _temp_factor,
    simulate,
)

PH_CANDIDATES = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.8, 7.5, 8.5, 9.5, 10.5]

SYSTEM_PROMPT = """你是一名资深液相色谱方法开发专家，精通反相(RPLC)与正相(NPLC)色谱、QbD、LSS 保留模型、QSRR、pH/离子化控制与梯度优化。
你的任务是根据给定的组分性质设计一套可直接上机的科学色谱条件。

硬性要求：
1. 只输出一个 JSON 对象，不要 Markdown、不要代码块、不要解释性前后缀。
2. 必须使用下面给定的字段名与数据类型，数值使用数字而非字符串。
3. gradient 的时间必须从 0 开始且严格递增；最后一个点后建议再保持 3–5 min。
4. 若 mode 为 isocratic，则使用 percent_b；gradient 字段仍需给出但不会使用。
5. phase 只能是 "reversed" 或 "normal"。
6. 反相：pH 必须在 1–12；UV 可用磷酸盐，LC-MS 必须用挥发性缓冲盐；有机相只能是 "ACN" 或 "MeOH"；固定相用 "c18"。
7. 正相：pH 固定为 7 且不使用缓冲盐；B 相只能是 "IPA" 或 "EtOAc"（A 相为正己烷）；固定相用 "silica"、"diol" 或 "amino"。
8. 波长 200–360 nm；柱温 25–45 °C。
9. 目标：等度时各组分 k≈1–10；梯度时所有组分在运行时间内洗脱，相邻峰 Rs≥1.5。
10. 不要编造未提供的化合物性质；只能基于给出的 logP/pKa/λmax/logkw。
11. rationale、risks 使用简体中文，各 2–5 条，具体到数值依据。

JSON 结构：
{
  "method_name": "string",
  "phase": "reversed" | "normal",
  "mode": "gradient" | "isocratic",
  "organic": "ACN" | "MeOH" | "IPA" | "EtOAc",
  "percent_b": number,
  "gradient": [{"time_min": number, "percent_b": number}, ...],
  "flow_ml_min": number,
  "temperature_c": number,
  "ph": number,
  "wavelength_nm": number,
  "column": {"length_mm": number, "inner_diameter_mm": number, "particle_um": number, "chemistry": "c18" | "silica" | "diol" | "amino"},
  "dwell_volume_ml": number,
  "injection_volume_ul": number,
  "buffer_system": "string",
  "rationale": ["string", ...],
  "risks": ["string", ...],
  "expected_order": ["string", ...]
}"""


CHEMISTRY_LABELS = {
    "c18": "C18",
    "silica": "Silica",
    "diol": "Diol",
    "amino": "Amino",
}
SOLVENT_LABELS = {
    "ACN": "乙腈 (ACN)",
    "MeOH": "甲醇 (MeOH)",
    "IPA": "异丙醇 (IPA)",
    "EtOAc": "乙酸乙酯 (EtOAc)",
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _choose_phase(compounds: List[Compound], constraints: RecommendConstraints) -> str:
    if constraints.phase in ("reversed", "normal"):
        return constraints.phase
    logps = [c.log_p for c in compounds]
    if not logps:
        return "reversed"
    ionizable = any(c.pka is not None for c in compounds)
    return "normal" if float(np.median(logps)) >= 4.5 and not ionizable else "reversed"


def _number(value, default: float, low: float, high: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    if not math.isfinite(parsed):
        parsed = default
    return _clamp(parsed, low, high)


def _buffer_for(ph: float, detector: str) -> str:
    if detector == "MS":
        if ph <= 3.0:
            return "0.1% 甲酸水溶液（pH≈2.5，MS 兼容）"
        if ph <= 5.5:
            return "5 mM 甲酸铵缓冲液（pH≈4.5，MS 兼容）"
        if ph <= 7.5:
            return "10 mM 乙酸铵缓冲液（pH≈6.8，MS 兼容）"
        if ph <= 10.0:
            return "10 mM 碳酸氢铵（pH≈9.0，MS 兼容，需耐碱柱）"
        return "5 mM 碳酸铵/氨水（pH≈10.2，MS 兼容，需耐碱柱）"
    if ph <= 2.8:
        return "0.1% 甲酸水溶液（pH≈2.5）"
    if ph <= 4.0:
        return "10 mM 磷酸二氢钾缓冲液（pH≈3.0）"
    if ph <= 5.5:
        return "10 mM 乙酸铵/乙酸缓冲液（pH≈4.8）"
    if ph <= 7.5:
        return "10 mM 磷酸盐缓冲液（pH≈6.8）"
    if ph <= 10.0:
        return "10 mM 碳酸氢铵（pH≈9.0，需耐碱柱）"
    return "5 mM 碳酸铵/氨水（pH≈10.2，需耐碱柱）"


def _choose_ph(compounds: List[Compound], detector: str) -> Tuple[float, List[str]]:
    best_ph = 2.5
    best_score = -1e9
    for ph in PH_CANDIDATES:
        fractions = [max(_neutral_fraction(c, ph), 1e-4) for c in compounds]
        score = float(np.mean(np.log10(fractions)))
        if ph > 8.0:
            score -= 0.35
        if ph > 10.0:
            score -= 0.15
        if ph >= 7.0:
            score -= 0.08
        if ph < 2.8:
            score -= 0.02 * abs(ph - 2.5)
        if detector == "MS" and ph > 8.5:
            score -= 0.1
        if score > best_score + 1e-9:
            best_score = score
            best_ph = ph
    notes = []
    sensitive = [
        c.name for c in compounds
        if c.pka is not None and abs(best_ph - c.pka) < 0.5
    ]
    if sensitive:
        notes.append(
            "所选 pH 接近 " + "、".join(sensitive) + " 的 pKa，建议在方法耐用性考察中验证 pH ±0.2 的影响。"
        )
    return best_ph, notes


def _log_k_effective(compounds: List[Compound], ph: float, temperature_c: float) -> np.ndarray:
    values = []
    for compound in compounds:
        neutral = max(_neutral_fraction(compound, ph), 1e-8)
        temp = max(_temp_factor(compound, temperature_c), 1e-8)
        values.append(_log_kw(compound) + math.log10(neutral) + math.log10(temp))
    return np.asarray(values, dtype=float)


def _choose_wavelength(compounds: List[Compound], detector: str) -> Tuple[float, List[str]]:
    if detector == "MS":
        return 254.0, []
    best_score = -1.0
    best_lambda = 254.0
    for wavelength in range(200, 361, 2):
        score = sum(_eps_rel(c, wavelength) for c in compounds)
        if wavelength < 230:
            score *= 0.9
        if wavelength < 210:
            score *= 0.9
        if score > best_score:
            best_score = score
            best_lambda = float(wavelength)
    weak = [
        f"「{c.name}」" for c in compounds
        if _eps_rel(c, best_lambda) < 0.05
    ]
    notes = []
    if weak:
        notes.append(
            f"{'、'.join(weak)}在 {best_lambda:.0f} nm 吸收较弱，若灵敏度不足建议改用电化学/荧光/质谱检测。"
        )
    return best_lambda, notes


def _column_for(detector: str, compound_count: int, phase: str = "reversed") -> Dict:
    if phase == "normal":
        if detector == "MS":
            return {
                "length_mm": 150.0,
                "inner_diameter_mm": 2.1,
                "particle_um": 3.0,
                "flow": 0.3,
                "dwell": 0.4,
                "injection": 2.0,
                "chemistry": "silica",
                "label": "Silica, 150 × 2.1 mm, 3 µm（正相/MS）",
            }
        length = 250.0 if compound_count >= 8 else 150.0
        return {
            "length_mm": length,
            "inner_diameter_mm": 4.6,
            "particle_um": 5.0,
            "flow": 1.0,
            "dwell": 1.2,
            "injection": 10.0,
            "chemistry": "silica",
            "label": f"Silica, {int(length)} × 4.6 mm, 5 µm",
        }
    if detector == "MS":
        return {
            "length_mm": 100.0,
            "inner_diameter_mm": 2.1,
            "particle_um": 1.8,
            "flow": 0.3,
            "dwell": 0.3,
            "injection": 2.0,
            "chemistry": "c18",
            "label": "C18, 100 × 2.1 mm, 1.8 µm（UHPLC/MS）",
        }
    length = 250.0 if compound_count >= 8 else 150.0
    return {
        "length_mm": length,
        "inner_diameter_mm": 4.6,
        "particle_um": 5.0,
        "flow": 1.0,
        "dwell": 1.2,
        "injection": 10.0,
        "chemistry": "c18",
        "label": f"C18, {int(length)} × 4.6 mm, 5 µm",
    }


def _build_conditions(
    compounds: List[Compound],
    constraints: RecommendConstraints,
    mode: str,
    organic: str,
    ph: float,
    wavelength: float,
    column: Dict,
    percent_b: float = 50.0,
    gradient: Optional[List[GradientPoint]] = None,
    phase: str = "reversed",
) -> Conditions:
    return Conditions(
        phase=phase,
        mode=mode,
        organic=organic,
        percent_b=percent_b,
        gradient=gradient or [
            GradientPoint(time_min=0.0, percent_b=5.0),
            GradientPoint(time_min=20.0, percent_b=95.0),
            GradientPoint(time_min=25.0, percent_b=95.0),
        ],
        flow_ml_min=column["flow"],
        temperature_c=30.0,
        ph=ph,
        wavelength_nm=wavelength,
        column=ColumnConfig(
            length_mm=column["length_mm"],
            inner_diameter_mm=column["inner_diameter_mm"],
            particle_um=column["particle_um"],
            chemistry=column.get("chemistry", "c18"),
        ),
        dwell_volume_ml=column["dwell"],
        injection_volume_ul=column["injection"],
        noise_mau=0.12,
    )


def _gradient_points(start: float, end: float, gradient_time: float) -> List[GradientPoint]:
    start = round(_clamp(start, 0.0, 100.0), 1)
    end = round(_clamp(end, 5.0, 100.0), 1)
    hold = round(max(3.0, min(5.0, gradient_time * 0.20)), 1)
    return [
        GradientPoint(time_min=0.0, percent_b=start),
        GradientPoint(time_min=round(gradient_time, 1), percent_b=end),
        GradientPoint(time_min=round(gradient_time + hold, 1), percent_b=end),
    ]


def _simulation_summary(result: Dict) -> Dict:
    peaks = result["peaks"]
    visible = [p for p in peaks if p["visible"] and p["tr_min"] is not None]
    return {
        "visible": visible,
        "all_eluted": all(p["tr_min"] is not None for p in peaks),
        "missing": sum(1 for p in peaks if p["tr_min"] is None),
        "first_tr": min((p["tr_min"] for p in visible), default=None),
        "last_tr": max((p["tr_min"] for p in visible), default=None),
        "min_rs": result["metrics"].get("min_resolution"),
        "t0": result["metrics"].get("t0_min"),
        "pressure": result["metrics"].get("pressure_bar"),
    }


def _score_gradient(summary: Dict, gradient_time: float, max_run: float) -> float:
    if summary["last_tr"] is None:
        return -100.0
    min_rs = summary["min_rs"]
    if min_rs is None:
        min_rs = 2.0
    score = 3.0 * min(min_rs, 2.0)
    ratio = summary["last_tr"] / max(gradient_time, 1e-6)
    score -= 4.0 * abs(ratio - 0.95)
    score -= 0.08 * gradient_time
    score -= 4.0 * summary["missing"]
    if summary["first_tr"] is not None and summary["t0"]:
        if summary["first_tr"] < 2.2 * summary["t0"]:
            score -= 1.5
    if summary["last_tr"] > gradient_time + 4.0:
        score -= 2.5
    if summary["last_tr"] > max_run - 1.0:
        score -= 5.0
    if summary["pressure"] and summary["pressure"] > 950:
        score -= 1.5
    return score


def _rule_normal_conditions(
    compounds: List[Compound], constraints: RecommendConstraints
) -> Dict:
    detector = constraints.detector
    organic = constraints.organic if constraints.organic in ("IPA", "EtOAc") else "IPA"
    wavelength, wavelength_notes = _choose_wavelength(compounds, detector)
    column = _column_for(detector, len(compounds), "normal")
    log_k_ref = np.array([_np_log_k_ref(c) for c in compounds])
    s_values = np.array([_np_s(c) for c in compounds])

    # log k = log k(10%) - S * (phi - 0.10); invert for k = 10 and k = 1.
    p10 = (0.10 + (log_k_ref - 1.0) / s_values) * 100.0
    p1 = (0.10 + log_k_ref / s_values) * 100.0
    p10_max = float(np.max(p10))
    p1_min = float(np.min(p1))
    window_gap = p1_min - p10_max
    isocratic_ok = (
        window_gap >= 4.0
        and 1.0 <= p10_max <= 45.0
        and constraints.mode in ("auto", "isocratic")
    )

    rationale: List[str] = []
    risks: List[str] = []
    rationale.extend(wavelength_notes)
    if constraints.organic in ("ACN", "MeOH"):
        rationale.append("正相模式不使用乙腈/甲醇，已改用异丙醇作为极性调节剂。")

    start = 2.0
    end = 40.0
    if isocratic_ok:
        percent_b = round(_clamp((p10_max + p1_min) / 2.0, 1.0, 55.0), 1)
        conditions = _build_conditions(
            compounds, constraints, "isocratic", organic, 7.0, wavelength, column,
            percent_b=percent_b, phase="normal",
        )
        result = simulate(compounds, conditions)
        summary = _simulation_summary(result)
        if summary["min_rs"] is not None and summary["min_rs"] < 1.2:
            adjusted = round(_clamp(percent_b + 2.0, 1.0, 55.0), 1)
            alt = _build_conditions(
                compounds, constraints, "isocratic", organic, 7.0, wavelength, column,
                percent_b=adjusted, phase="normal",
            )
            alt_result = simulate(compounds, alt)
            alt_summary = _simulation_summary(alt_result)
            if (alt_summary["min_rs"] or 0) > (summary["min_rs"] or 0):
                conditions, result, summary = alt, alt_result, alt_summary
                percent_b = adjusted
        rationale.append(
            f"正相保留随极性调节剂比例升高而降低；取 k≈1–10 的中点，"
            f"推荐 {percent_b:.1f}% {organic} 等度。"
        )
        if constraints.mode == "isocratic" and not isocratic_ok:
            risks.append("等度无法覆盖所有组分的正相保留窗口，实际建议改用梯度洗脱。")
    else:
        start = round(_clamp(p1_min - 10.0, 1.0, 20.0), 1)
        end = round(_clamp(p10_max + 18.0, max(25.0, start + 15.0), 70.0), 1)
        candidates = [6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 22.0, 26.0, 30.0, 35.0, 40.0]
        candidates = [t for t in candidates if t + 6.0 <= constraints.max_run_min]
        if not candidates:
            candidates = [max(3.0, constraints.max_run_min - 6.0)]

        best = None
        for gradient_time in candidates:
            points = _gradient_points(start, end, gradient_time)
            trial = _build_conditions(
                compounds, constraints, "gradient", organic, 7.0, wavelength, column,
                gradient=points, phase="normal",
            )
            trial_result = simulate(compounds, trial)
            summary = _simulation_summary(trial_result)
            score = _score_gradient(summary, gradient_time, constraints.max_run_min)
            if best is None or score > best[0]:
                best = (score, gradient_time, points, trial_result, summary)

        assert best is not None
        _, gradient_time, points, result, summary = best
        conditions = _build_conditions(
            compounds, constraints, "gradient", organic, 7.0, wavelength, column,
            gradient=points, phase="normal",
        )
        rationale.append(
            f"组分极性跨度较大，等度无法同时满足 k=1–10，"
            f"采用 {start:.1f}→{end:.1f}% {organic} 正相梯度。"
        )
        rationale.append(
            f"通过物理模型搜索梯度时间，选定 {gradient_time:.0f} min，后接 3–5 min 保持。"
        )
        if not summary["all_eluted"]:
            risks.append("在当前极性调节剂上限下仍有组分未洗脱，需提高末端 B 比例或改用更强极性溶剂。")
        if end >= 65.0:
            risks.append("梯度末端极性溶剂比例较高，注意正相柱在高水分/高极性条件下的平衡时间。")

    rationale.append(
        f"检测波长 {wavelength:.0f} nm：在 200–360 nm 范围内使各组分吸光度之和最大。"
    )
    rationale.append(
        f"色谱柱 {column['label']}，流速 {column['flow']:.2f} mL/min，柱温 30 °C，"
        f"进样 {column['injection']:.0f} µL。"
    )
    rationale.append(
        "正相以正己烷为 A、极性溶剂为 B；不使用 pH 和缓冲盐，需控制流动相含水量并充分平衡色谱柱。"
    )
    ionizable = [c.name for c in compounds if c.pka is not None]
    if ionizable:
        risks.append(
            "以下组分含可电离基团，正相中可能与硅醇基强吸附或拖尾："
            + "、".join(ionizable)
            + "。建议选用氨基/二醇柱或加入少量极性添加剂。"
        )

    result["warnings"].extend(risks)
    rationale.append(
        f"模型预测：死时间 {result['metrics']['t0_min']:.2f} min，柱压约 "
        f"{result['metrics']['pressure_bar']:.0f} bar，理论塔板数约 {result['metrics']['plates']}。"
    )

    method = {
        "name": f"{'梯度' if conditions.mode == 'gradient' else '等度'} NPLC 方法"
                f"（{CHEMISTRY_LABELS[column['chemistry']]} / {organic}）",
        "phase": "normal",
        "column_label": column["label"],
        "eluent_a": "正己烷 (n-hexane)",
        "eluent_b": SOLVENT_LABELS[organic],
        "buffer": "无（正相，不使用缓冲盐）",
        "gradient": [p.model_dump() for p in conditions.gradient] if conditions.mode == "gradient" else [],
        "isocratic_percent": conditions.percent_b if conditions.mode == "isocratic" else None,
        "ph": 7.0,
        "flow_ml_min": conditions.flow_ml_min,
        "temperature_c": conditions.temperature_c,
        "wavelength_nm": conditions.wavelength_nm,
        "injection_volume_ul": conditions.injection_volume_ul,
    }

    return {
        "source": "rule",
        "ai_model": None,
        "llm_error": None,
        "conditions": conditions.model_dump(),
        "result": result,
        "method": method,
        "rationale": rationale,
        "risks": risks,
        "expected_order": [
            {"name": p["name"], "tr_min": p["tr_min"]}
            for p in sorted(
                [x for x in result["peaks"] if x["tr_min"] is not None],
                key=lambda x: x["tr_min"],
            )
        ],
    }


def _rule_conditions(
    compounds: List[Compound], constraints: RecommendConstraints
) -> Dict:
    phase = _choose_phase(compounds, constraints)
    if phase == "normal":
        return _rule_normal_conditions(compounds, constraints)
    detector = constraints.detector
    organic = "ACN" if constraints.organic in ("auto", "IPA", "EtOAc") else constraints.organic
    ph, ph_notes = _choose_ph(compounds, detector)
    wavelength, wavelength_notes = _choose_wavelength(compounds, detector)
    column = _column_for(detector, len(compounds), "reversed")
    log_k_eff = _log_k_effective(compounds, ph, 30.0)
    s_values = np.array([_s_value(c, organic) for c in compounds])

    # Percent B that would give k=10 (most retained) and k=1 (least retained)
    p10 = (log_k_eff - 1.0) / s_values * 100.0
    p1 = log_k_eff / s_values * 100.0
    p10_max = float(np.max(p10))
    p1_min = float(np.min(p1))
    window_gap = p1_min - p10_max

    isocratic_ok = (
        window_gap >= 4.0
        and p10_max >= 2.0
        and p10_max <= 92.0
        and constraints.mode in ("auto", "isocratic")
    )
    use_isocratic = False
    if constraints.mode == "isocratic":
        use_isocratic = isocratic_ok
    elif constraints.mode == "auto":
        use_isocratic = isocratic_ok

    rationale: List[str] = []
    risks: List[str] = []
    rationale.extend(ph_notes)
    rationale.extend(wavelength_notes)

    if use_isocratic:
        percent_b = round(_clamp((p10_max + p1_min) / 2.0, 2.0, 95.0), 1)
        conditions = _build_conditions(
            compounds, constraints, "isocratic", organic, ph, wavelength, column,
            percent_b=percent_b,
        )
        result = simulate(compounds, conditions)
        summary = _simulation_summary(result)
        # nudge once if the spread is wider than the target window
        if summary["min_rs"] is not None and summary["min_rs"] < 1.2:
            adjusted = round(_clamp(percent_b + 2.0, 2.0, 95.0), 1)
            alt = _build_conditions(
                compounds, constraints, "isocratic", organic, ph, wavelength, column,
                percent_b=adjusted,
            )
            alt_result = simulate(compounds, alt)
            alt_summary = _simulation_summary(alt_result)
            if (alt_summary["min_rs"] or 0) > (summary["min_rs"] or 0):
                conditions, result, summary = alt, alt_result, alt_summary
                percent_b = adjusted
        rationale.append(
            f"各组分 log k 窗口允许等度洗脱，取 k≈1–10 的中点，推荐 {percent_b:.1f}% {organic} 等度。"
        )
        if constraints.mode == "isocratic" and not isocratic_ok:
            risks.append("等度无法同时满足所有组分的保留窗口，实际建议改用梯度洗脱。")
    else:
        start = round(_clamp(p1_min - 12.0, 2.0, 30.0), 1)
        end = round(_clamp(p10_max + 25.0, max(35.0, start + 20.0), 98.0), 1)
        candidates = [6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 22.0, 26.0, 30.0, 35.0, 40.0, 50.0]
        candidates = [t for t in candidates if t + 6.0 <= constraints.max_run_min]
        if not candidates:
            candidates = [max(3.0, constraints.max_run_min - 6.0)]

        best = None
        for gradient_time in candidates:
            points = _gradient_points(start, end, gradient_time)
            trial = _build_conditions(
                compounds, constraints, "gradient", organic, ph, wavelength, column,
                gradient=points,
            )
            trial_result = simulate(compounds, trial)
            summary = _simulation_summary(trial_result)
            score = _score_gradient(summary, gradient_time, constraints.max_run_min)
            if best is None or score > best[0]:
                best = (score, gradient_time, points, trial_result, summary)

        assert best is not None
        _, gradient_time, points, result, summary = best
        conditions = _build_conditions(
            compounds, constraints, "gradient", organic, ph, wavelength, column,
            gradient=points,
        )
        rationale.append(
            f"组分疏水性跨度较大，等度无法同时满足 k=1–10，采用 {start:.1f}→{end:.1f}% {organic} 线性梯度。"
        )
        rationale.append(
            f"通过物理模型搜索梯度时间，选定 {gradient_time:.0f} min（最晚峰约在梯度终点），后接 3–5 min 保持。"
        )
        if not summary["all_eluted"]:
            risks.append("在当前有机相上限下仍有组分未洗脱，需提高末端有机相比例或使用更强溶剂。")
        if end >= 95.0:
            risks.append("梯度末端接近 100% 有机相，注意缓冲盐在纯有机相中的溶解度与析出风险。")

    rationale.append(
        f"检测波长 {wavelength:.0f} nm：在 200–360 nm 范围内使各组分吸光度之和最大，兼顾灵敏度与基线噪声。"
    )
    rationale.append(
        f"色谱柱 {column['label']}，流速 {column['flow']:.2f} mL/min，柱温 30 °C，进样 {column['injection']:.0f} µL。"
    )
    if ph > 8.0:
        risks.append("方法 pH 偏高，需选用耐碱色谱柱（杂化硅胶/聚合物载体）并评估柱寿命。")
    if any(c.acid_base == "base" for c in compounds) and ph < 4.0:
        risks.append("碱性组分在低 pH 下部分电离，若保留不足可考虑离子对试剂或提高 pH。")

    buffer_text = _buffer_for(ph, detector)
    rationale.append(f"水相（A）：{buffer_text}；有机相（B）：{'乙腈' if organic == 'ACN' else '甲醇'}。")

    result["warnings"].extend(risks)
    metric_text = (
        f"模型预测：死时间 {result['metrics']['t0_min']:.2f} min，柱压约 "
        f"{result['metrics']['pressure_bar']:.0f} bar，理论塔板数约 {result['metrics']['plates']}。"
    )
    rationale.append(metric_text)

    method = {
        "name": f"{'梯度' if conditions.mode == 'gradient' else '等度'} RPLC 方法（C18 / {organic}）",
        "phase": "reversed",
        "column_label": column["label"],
        "eluent_a": buffer_text,
        "eluent_b": "乙腈 (ACN)" if organic == "ACN" else "甲醇 (MeOH)",
        "buffer": buffer_text,
        "gradient": [p.model_dump() for p in conditions.gradient] if conditions.mode == "gradient" else [],
        "isocratic_percent": conditions.percent_b if conditions.mode == "isocratic" else None,
        "ph": conditions.ph,
        "flow_ml_min": conditions.flow_ml_min,
        "temperature_c": conditions.temperature_c,
        "wavelength_nm": conditions.wavelength_nm,
        "injection_volume_ul": conditions.injection_volume_ul,
    }

    return {
        "source": "rule",
        "ai_model": None,
        "llm_error": None,
        "conditions": conditions.model_dump(),
        "result": result,
        "method": method,
        "rationale": rationale,
        "risks": risks,
        "expected_order": [
            {"name": p["name"], "tr_min": p["tr_min"]}
            for p in sorted(
                [x for x in result["peaks"] if x["tr_min"] is not None],
                key=lambda x: x["tr_min"],
            )
        ],
    }


def _coerce_ai_conditions(raw: Dict, fallback: Conditions) -> Conditions:
    phase_raw = str(raw.get("phase", fallback.phase)).lower()
    phase = "normal" if ("normal" in phase_raw or "正相" in phase_raw) else "reversed"

    organic_raw = str(raw.get("organic", fallback.organic)).upper()
    if phase == "normal":
        organic = "EtOAc" if ("ETOAC" in organic_raw or "乙酸乙酯" in organic_raw) else "IPA"
    else:
        organic = "MeOH" if ("MEOH" in organic_raw or "甲醇" in organic_raw) else "ACN"
    mode_raw = str(raw.get("mode", "gradient")).lower()
    mode = "isocratic" if mode_raw.startswith("iso") or "等度" in mode_raw else "gradient"

    column_raw = raw.get("column") if isinstance(raw.get("column"), dict) else {}
    chemistry_raw = str(column_raw.get("chemistry", "")).lower()
    allowed_chemistry = ["c18", "silica", "diol", "amino"]
    default_chemistry = "silica" if phase == "normal" else "c18"
    chemistry = chemistry_raw if chemistry_raw in allowed_chemistry else default_chemistry
    if phase == "normal" and chemistry == "c18":
        chemistry = "silica"
    if phase == "reversed" and chemistry != "c18":
        chemistry = "c18"
    column = ColumnConfig(
        length_mm=_number(column_raw.get("length_mm"), fallback.column.length_mm, 30, 300),
        inner_diameter_mm=_number(
            column_raw.get("inner_diameter_mm", column_raw.get("id_mm")),
            fallback.column.inner_diameter_mm, 1.0, 10.0,
        ),
        particle_um=_number(
            column_raw.get("particle_um", column_raw.get("dp_um")),
            fallback.column.particle_um, 1.2, 10.0,
        ),
        chemistry=chemistry,
    )

    raw_gradient = raw.get("gradient")
    points: List[GradientPoint] = []
    if isinstance(raw_gradient, list):
        for item in raw_gradient:
            if not isinstance(item, dict):
                continue
            time_value = item.get("time_min", item.get("time", item.get("t")))
            percent_value = item.get("percent_b", item.get("b_percent", item.get("b")))
            if time_value is None or percent_value is None:
                continue
            points.append(
                GradientPoint(
                    time_min=_number(time_value, 0.0, 0.0, 300.0),
                    percent_b=_number(percent_value, 5.0, 0.0, 100.0),
                )
            )
    points.sort(key=lambda p: p.time_min)
    # remove duplicate times
    deduped: List[GradientPoint] = []
    for point in points:
        if deduped and abs(point.time_min - deduped[-1].time_min) < 1e-6:
            deduped[-1] = point
        else:
            deduped.append(point)
    points = deduped
    if not points:
        points = fallback.gradient
    if points[0].time_min > 0:
        points.insert(0, GradientPoint(time_min=0.0, percent_b=points[0].percent_b))
    if len(points) == 1:
        points.append(GradientPoint(time_min=points[0].time_min + 10.0, percent_b=points[0].percent_b))

    percent_b = _number(
        raw.get("percent_b"),
        fallback.percent_b if fallback.mode == "isocratic" else points[0].percent_b,
        0.0, 100.0,
    )

    return Conditions(
        phase=phase,
        mode=mode,
        organic=organic,
        percent_b=percent_b,
        gradient=points,
        flow_ml_min=_number(raw.get("flow_ml_min", raw.get("flow")), fallback.flow_ml_min, 0.05, 5.0),
        temperature_c=_number(raw.get("temperature_c", raw.get("temperature")), 30.0, 15.0, 60.0),
        ph=7.0 if phase == "normal" else _number(raw.get("ph", raw.get("pH")), 2.5, 1.0, 12.0),
        wavelength_nm=_number(raw.get("wavelength_nm", raw.get("wavelength")), 254.0, 190.0, 400.0),
        column=column,
        dwell_volume_ml=_number(raw.get("dwell_volume_ml"), 1.0, 0.0, 3.0),
        injection_volume_ul=_number(raw.get("injection_volume_ul", raw.get("injection_ul")), 10.0, 0.1, 100.0),
        noise_mau=0.12,
    )


def _ai_conditions(
    compounds: List[Compound], constraints: RecommendConstraints, override: Optional[AIOverride]
) -> Dict:
    config = ai_client.resolve_config(override.model_dump() if override else None)
    if not config["configured"]:
        raise ai_client.AIError("未配置大模型 API Key，已使用本地规则专家系统")

    payload = {
        "task": "为下列组分设计一套科学、可上机的液相色谱条件（反相或正相）",
        "constraints": {
            "detector": constraints.detector,
            "preferred_phase": constraints.phase,
            "preferred_organic": constraints.organic,
            "preferred_mode": constraints.mode,
            "max_run_min": constraints.max_run_min,
        },
        "system": {
            "model": "LSS: log10 k = log10 k0 - S*phi; 系统延迟体积已计入梯度",
            "normal_phase": "A=正己烷，B=异丙醇或乙酸乙酯，pH 不适用",
            "note": "梯度表时间指泵程序时间；模拟器会自动加入 dwell volume 延迟",
        },
        "compounds": [
            {
                "name": c.name,
                "logP": c.log_p,
                "pKa": c.pka,
                "acid_base": c.acid_base,
                "lambda_max_nm": c.lambda_max_nm,
                "log_kw": round(_log_kw(c), 3),
                "S_default": round(_s_value(c, "ACN"), 2),
                "log_k_np_ref": round(_np_log_k_ref(c), 3),
                "S_np": round(_np_s(c), 2),
                "concentration_mg_L": c.concentration_mg_l,
            }
            for c in compounds
        ],
    }
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    content = ai_client.chat(config, messages, temperature=0.2, json_mode=True)
    raw = ai_client.extract_json(content)
    fallback_phase = _choose_phase(compounds, constraints)
    fallback = Conditions(
        phase=fallback_phase,
        organic="IPA" if fallback_phase == "normal" else "ACN",
        column=ColumnConfig(chemistry="silica" if fallback_phase == "normal" else "c18"),
        ph=7.0 if fallback_phase == "normal" else 2.5,
    )
    conditions = _coerce_ai_conditions(raw, fallback)

    # Respect explicit user preferences
    if constraints.mode == "gradient":
        conditions.mode = "gradient"
    elif constraints.mode == "isocratic":
        conditions.mode = "isocratic"
        if not (0.0 <= conditions.percent_b <= 100.0):
            conditions.percent_b = 100.0
    if constraints.phase != "auto" and conditions.phase != constraints.phase:
        conditions.phase = constraints.phase
        conditions.ph = 7.0 if conditions.phase == "normal" else 2.5
        conditions.column.chemistry = "silica" if conditions.phase == "normal" else "c18"
        conditions.organic = "IPA" if conditions.phase == "normal" else "ACN"
    if constraints.organic != "auto":
        if conditions.phase == "normal" and constraints.organic in ("IPA", "EtOAc"):
            conditions.organic = constraints.organic
        elif conditions.phase == "reversed" and constraints.organic in ("ACN", "MeOH"):
            conditions.organic = constraints.organic

    result = simulate(compounds, conditions)
    rationale = [str(x) for x in (raw.get("rationale") or []) if str(x).strip()]
    risks = [str(x) for x in (raw.get("risks") or []) if str(x).strip()]
    if not rationale:
        reasoning = raw.get("reasoning")
        if isinstance(reasoning, str) and reasoning.strip():
            rationale = [reasoning.strip()]
    if not rationale:
        rationale = ["大模型未返回结构化设计依据，结果已通过物理模型复核。"]

    is_normal = conditions.phase == "normal"
    buffer_text = "无（正相，不使用缓冲盐）" if is_normal else str(
        raw.get("buffer_system") or _buffer_for(conditions.ph, constraints.detector)
    )
    chemistry_label = CHEMISTRY_LABELS.get(conditions.column.chemistry, "C18")
    method = {
        "name": str(
            raw.get("method_name")
            or ("AI 设计 NPLC 方法" if is_normal else "AI 设计 RPLC 方法")
        ),
        "phase": conditions.phase,
        "column_label": f"{chemistry_label}, {conditions.column.length_mm:.0f} × "
                         f"{conditions.column.inner_diameter_mm:.1f} mm, "
                         f"{conditions.column.particle_um:.1f} µm",
        "eluent_a": "正己烷 (n-hexane)" if is_normal else buffer_text,
        "eluent_b": SOLVENT_LABELS[conditions.organic],
        "buffer": buffer_text,
        "gradient": [p.model_dump() for p in conditions.gradient] if conditions.mode == "gradient" else [],
        "isocratic_percent": conditions.percent_b if conditions.mode == "isocratic" else None,
        "ph": conditions.ph,
        "flow_ml_min": conditions.flow_ml_min,
        "temperature_c": conditions.temperature_c,
        "wavelength_nm": conditions.wavelength_nm,
        "injection_volume_ul": conditions.injection_volume_ul,
    }

    result["warnings"].extend(risks)
    if not all(p["tr_min"] is not None for p in result["peaks"]):
        risks.append("AI 条件下仍有组分未在运行时间内洗脱，已保留模拟结果供复核。")

    return {
        "source": "llm",
        "ai_model": config["model"],
        "llm_error": None,
        "conditions": conditions.model_dump(),
        "result": result,
        "method": method,
        "rationale": rationale,
        "risks": risks,
        "expected_order": [
            {"name": p["name"], "tr_min": p["tr_min"]}
            for p in sorted(
                [x for x in result["peaks"] if x["tr_min"] is not None],
                key=lambda x: x["tr_min"],
            )
        ],
    }


def recommend(
    compounds: List[Compound],
    constraints: RecommendConstraints,
    override: Optional[AIOverride] = None,
) -> Dict:
    rule_result: Optional[Dict] = None
    config = ai_client.resolve_config(override.model_dump() if override else None)

    if config["configured"]:
        try:
            return _ai_conditions(compounds, constraints, override)
        except Exception as exc:  # noqa: BLE001 - fall back to deterministic engine
            rule_result = _rule_conditions(compounds, constraints)
            rule_result["llm_error"] = f"大模型调用失败，已使用规则专家系统：{exc}"
            return rule_result

    rule_result = _rule_conditions(compounds, constraints)
    if not config["configured"]:
        rule_result["llm_error"] = None
    return rule_result
