"""Reversed-phase HPLC retention and chromatogram simulation.

Scientific model
----------------
1. Retention (linear solvent strength, LSS):
       log10 k = log10 k_w - S * phi
   where phi is the volume fraction of organic modifier (ACN or MeOH).
2. Ionisation (pH): the effective retention factor is scaled by the neutral
   fraction of the analyte.
       acid:  f = 1 / (1 + 10^(pH - pKa))
       base:  f = 1 / (1 + 10^(pKa - pH))
3. Temperature (van 't Hoff):
       ln k(T) = ln k(298.15) + (dH / R) * (1/298.15 - 1/T)
4. Plate height (reduced van Deemter form, Knox-like):
       h = 1.75 + 1.25 / nu + 0.06 * nu,   nu = u * dp / Dm
5. Gradient elution is solved by integrating the migration of every solute
   through the column, accounting for the system dwell volume.  The local
   mobile-phase composition at position x and time t is the pump composition
   evaluated at (t - t_dwell - x/u), which reproduces LSS gradient behaviour
   and band compression without closed-form approximations.
6. Peak shape is an exponentially modified Gaussian (EMG) parameterised by
   the plate count; the UV response is derived from a Gaussian absorption
   envelope around each compound's lambda_max.
"""

from __future__ import annotations

import math
from typing import Dict, List

import numpy as np
from scipy.stats import exponnorm

from .models import Compound, Conditions

R_GAS = 8.314462618
WATER_VISC = 0.00089  # Pa.s at 25 C
ORGANIC_PROPS = {
    "ACN": {"visc": 0.00037, "dm": 0.060, "label": "乙腈"},
    "MeOH": {"visc": 0.00055, "dm": 0.052, "label": "甲醇"},
    "IPA": {"visc": 0.00240, "dm": 0.045, "label": "异丙醇"},
    "EtOAc": {"visc": 0.00043, "dm": 0.070, "label": "乙酸乙酯"},
    "THF": {"visc": 0.00046, "dm": 0.065, "label": "四氢呋喃"},
    "EtOH": {"visc": 0.00109, "dm": 0.050, "label": "乙醇"},
}
AQUEOUS_PROPS = {
    "water": {"visc": WATER_VISC, "label": "水"},
    "buffer": {"visc": 0.00095, "label": "缓冲水相"},
    "hexane": {"visc": 0.00030, "label": "正己烷"},
    "heptane": {"visc": 0.00039, "label": "正庚烷"},
    "cyclohexane": {"visc": 0.00098, "label": "环己烷"},
}
PHASE_PROPS = {
    "reversed": {"base_visc": WATER_VISC},
    "normal": {"base_visc": 0.00030},  # n-hexane at 25 C
}
HEXANE_FAMILY = ("hexane", "heptane", "cyclohexane")
AQUEOUS_FAMILY = ("water", "buffer")


def _organic_key(conditions: Conditions) -> str:
    """Physical-property key for the organic modifier."""
    if conditions.organic == "custom":
        return "IPA" if conditions.phase == "normal" else "ACN"
    return conditions.organic


def _organic_label(conditions: Conditions) -> str:
    if conditions.organic == "custom" and conditions.organic_label:
        return conditions.organic_label.strip()
    return ORGANIC_PROPS[_organic_key(conditions)]["label"]


def _aqueous_key(conditions: Conditions) -> str:
    """Resolved non-organic phase key; auto follows the chromatographic mode."""
    if conditions.aqueous == "auto":
        return "hexane" if conditions.phase == "normal" else "water"
    return conditions.aqueous


def _aqueous_label(conditions: Conditions) -> str:
    if conditions.aqueous == "custom" and conditions.aqueous_label:
        return conditions.aqueous_label.strip()
    if conditions.aqueous == "custom":
        return "自定义非有机相"
    return AQUEOUS_PROPS[_aqueous_key(conditions)]["label"]


def _aqueous_viscosity(conditions: Conditions) -> float:
    key = _aqueous_key(conditions)
    if key == "custom":
        return PHASE_PROPS[conditions.phase]["base_visc"]
    return AQUEOUS_PROPS[key]["visc"]


# Relative elution strength of auxiliary solvents (1.0 = primary modifier).
MODIFIER_STRENGTH = {
    "reversed": {
        "ACN": 1.00, "MeOH": 0.86, "THF": 1.30, "EtOH": 0.76,
        "IPA": 0.98, "EtOAc": 1.12,
    },
    "normal": {
        "IPA": 1.00, "EtOAc": 0.88, "THF": 1.22, "EtOH": 1.01,
        "MeOH": 1.25, "ACN": 1.12,
    },
}


def _channel_key(value: str, phase: str):
    if value in ("none", "", None):
        return None
    if value == "custom":
        return "IPA" if phase == "normal" else "ACN"
    return value


def _channel_viscosity(key, phase: str) -> float:
    if key is None:
        return 0.0
    if key in ORGANIC_PROPS:
        return ORGANIC_PROPS[key]["visc"]
    return AQUEOUS_PROPS.get(key, {"visc": PHASE_PROPS[phase]["base_visc"]})["visc"]


def _aux_label(value: str, custom_label: Optional[str]) -> str:
    if value == "custom":
        return (custom_label or "").strip() or "自定义溶剂"
    if value in ORGANIC_PROPS:
        return ORGANIC_PROPS[value]["label"]
    return AQUEOUS_PROPS.get(value, {}).get("label", value)


def _channel_strength(key, phase: str) -> float:
    if key is None or key not in MODIFIER_STRENGTH[phase]:
        return 0.0
    return MODIFIER_STRENGTH[phase][key]


def _modifier_phi(
    percent_b: float, percent_c: float, percent_d: float, conditions: Conditions
) -> float:
    """Effective modifier fraction of the quaternary mobile phase."""
    phase = conditions.phase
    fractions = [
        (max(percent_b, 0.0) / 100.0, _channel_strength(_organic_key(conditions), phase)),
        (
            max(percent_c, 0.0) / 100.0,
            _channel_strength(_channel_key(conditions.solvent_c, phase), phase),
        ),
        (
            max(percent_d, 0.0) / 100.0,
            _channel_strength(_channel_key(conditions.solvent_d, phase), phase),
        ),
    ]
    total = sum(fraction for fraction, _ in fractions)
    scale = 1.0 if total <= 1.0 else 1.0 / total
    return sum(fraction * strength for fraction, strength in fractions) * scale


NP_REF_PHI = 0.10  # normal-phase reference: 10% polar modifier
RESPONSE_SCALE = 6.0  # mAU*min per ug of injected mass at full absorptivity
TAIL_RATIO = 0.18


def _neutral_fraction(compound: Compound, ph: float) -> float:
    if compound.pka is None:
        return 1.0
    if compound.acid_base == "acid":
        return 1.0 / (1.0 + 10.0 ** (ph - compound.pka))
    if compound.acid_base == "base":
        return 1.0 / (1.0 + 10.0 ** (compound.pka - ph))
    return 1.0


def _log_kw(compound: Compound) -> float:
    if compound.log_kw is not None:
        return compound.log_kw
    # QSRR fallback for user-defined analytes
    return 0.55 * compound.log_p + 1.25


def _s_value(compound: Compound, organic: str) -> float:
    if compound.s_value is not None:
        return compound.s_value
    if organic == "ACN":
        return float(np.clip(4.15 + 0.13 * compound.log_p, 3.2, 6.0))
    return float(np.clip(3.0 + 0.10 * compound.log_p, 2.4, 4.8))


def _np_log_k_ref(compound: Compound) -> float:
    """log k on a polar adsorbent at 10% polar modifier (normal phase)."""
    if compound.log_k_np is not None:
        return compound.log_k_np
    # QSRR: polar analytes (low logP) are retained more strongly in NPLC.
    return float(np.clip(1.55 - 0.42 * compound.log_p, -1.0, 3.2))


def _np_s(compound: Compound) -> float:
    if compound.s_np is not None:
        return compound.s_np
    return float(np.clip(7.5 + 0.25 * compound.log_p, 5.0, 11.0))


def _temp_factor(compound: Compound, temperature_c: float, phase: str = "reversed") -> float:
    # Exothermic retention: dH is negative, so k falls as T rises.
    base_dh = 13.0e3 if phase == "reversed" else 8.0e3
    d_h = -(base_dh + 2.0e3 * float(np.clip(compound.log_p, -1.0, 6.0)))
    t = temperature_c + 273.15
    return float(math.exp(d_h / R_GAS * (1.0 / 298.15 - 1.0 / t)))


def _eps_rel(compound: Compound, wavelength_nm: float) -> float:
    bandwidth = 22.0
    return float(
        compound.epsilon_max
        * math.exp(-0.5 * ((wavelength_nm - compound.lambda_max_nm) / bandwidth) ** 2)
    )


def _gradient_arrays(conditions: Conditions, flow: float, run_time: float):
    if conditions.mode == "gradient" and len(conditions.gradient) >= 1:
        points = sorted(conditions.gradient, key=lambda p: p.time_min)
        times = [p.time_min for p in points]
        percents = [p.percent_b for p in points]
        if times[0] > 0.0:
            times.insert(0, 0.0)
            percents.insert(0, percents[0])
        if times[-1] < run_time:
            times.append(run_time)
            percents.append(percents[-1])
        return np.asarray(times, dtype=float), np.asarray(percents, dtype=float)
    if conditions.mode == "isocratic":
        value = conditions.percent_b
    elif conditions.gradient:
        value = conditions.gradient[0].percent_b
    else:
        value = 50.0
    return np.asarray([0.0, max(run_time, 1.0)]), np.asarray([value, value], dtype=float)


def _empty_result(conditions: Conditions, note: str) -> Dict:
    t = np.linspace(0.0, 10.0, 400)
    return {
        "time": [round(float(v), 4) for v in t],
        "signal": [0.0 for _ in t],
        "composition": [float(conditions.percent_b)] * len(t),
        "peaks": [],
        "metrics": {
            "t0_min": None, "run_time_min": 10.0, "plates": None, "pressure_bar": None,
            "num_peaks": 0, "min_resolution": None, "max_k": None,
        },
        "warnings": [note] if note else [],
    }


def simulate(compounds: List[Compound], conditions: Conditions) -> Dict:
    if not compounds:
        return _empty_result(conditions, "尚未选择任何组分")

    column = conditions.column
    flow = conditions.flow_ml_min
    area_mm2 = math.pi * (column.inner_diameter_mm / 2.0) ** 2
    void_volume_ml = column.porosity * area_mm2 * column.length_mm / 1000.0
    t0 = void_volume_ml / flow
    u = flow * 1000.0 / (column.porosity * area_mm2)  # mm/min
    dp_mm = column.particle_um / 1000.0
    organic_key = _organic_key(conditions)
    dm = ORGANIC_PROPS[organic_key]["dm"]
    reduced_velocity = max(u * dp_mm / dm, 1e-3)
    plate_height_mm = dp_mm * (1.75 + 1.25 / reduced_velocity + 0.06 * reduced_velocity)
    plates = max(250.0, column.length_mm / plate_height_mm)

    n = len(compounds)
    phase = conditions.phase
    temp_factor = np.array([
        _temp_factor(c, conditions.temperature_c, phase) for c in compounds
    ])
    if phase == "normal":
        # NPLC: reference point is 10% polar modifier, retention decreases as
        # the polar modifier fraction increases.  pH is not meaningful.
        log_k_ref = np.array([_np_log_k_ref(c) for c in compounds])
        s_values = np.array([_np_s(c) for c in compounds])
        neutral = np.ones(n)
        log_k0 = (
            log_k_ref
            + s_values * NP_REF_PHI
            + np.log10(np.maximum(temp_factor, 1e-9))
        )
    else:
        log_kw = np.array([_log_kw(c) for c in compounds])
        s_values = np.array([_s_value(c, organic_key) for c in compounds])
        neutral = np.array([_neutral_fraction(c, conditions.ph) for c in compounds])
        # Combined intercept: log k at phi = 0 for the actual pH / temperature.
        log_k0 = (
            log_kw
            + np.log10(np.maximum(neutral, 1e-9))
            + np.log10(np.maximum(temp_factor, 1e-9))
        )

    # --- run length -------------------------------------------------------
    if conditions.total_time_min:
        run_time = float(conditions.total_time_min)
    elif conditions.mode == "gradient":
        program_end = max(p.time_min for p in conditions.gradient) if conditions.gradient else 20.0
        run_time = max(program_end * 1.35, program_end + 6.0)
    else:
        phi_iso = _modifier_phi(
            conditions.percent_b, conditions.percent_c, conditions.percent_d, conditions
        )
        k_values = 10.0 ** np.clip(log_k0 - s_values * phi_iso, -6.0, 8.0)
        run_time = min(240.0, max(10.0, t0 * (1.0 + float(np.max(k_values))) * 1.1 + 2.0))

    grad_t, grad_b = _gradient_arrays(conditions, flow, run_time)
    grad_phi = np.asarray([
        _modifier_phi(float(pb), conditions.percent_c, conditions.percent_d, conditions)
        for pb in grad_b
    ])
    dwell_t = conditions.dwell_volume_ml / flow if flow > 0 else 0.0
    if conditions.mode == "gradient" and conditions.gradient:
        program_end = float(max(p.time_min for p in conditions.gradient))
    else:
        program_end = 0.0

    dt = min(0.01, max(0.0012, run_time / 12000.0))
    if run_time / dt > 40000:
        dt = run_time / 40000.0

    # --- integrate solute migration --------------------------------------
    x = np.zeros(n)
    tr = np.full(n, np.nan)
    t = 0.0
    length = column.length_mm
    while t < run_time - 1e-9:
        shifted = t - dwell_t - x / u
        percent = np.interp(shifted, grad_t, grad_b)
        phi = np.interp(shifted, grad_t, grad_phi)
        k = 10.0 ** np.clip(log_k0 - s_values * phi, -9.0, 9.0)
        velocity = u / (1.0 + k)  # mm/min
        next_x = x + velocity * dt
        hit = (next_x >= length) & np.isnan(tr)
        if np.any(hit):
            tr[hit] = t + (length - x[hit]) / np.maximum(velocity[hit], 1e-12)
        x = np.where(next_x >= length, length, next_x)
        t += dt
        if np.all(x >= length):
            break

    # Composition seen by each solute at the column outlet
    outlet_time = tr - dwell_t - length / u
    outlet_percent = np.interp(np.nan_to_num(outlet_time, nan=0.0), grad_t, grad_b)
    outlet_phi = np.interp(np.nan_to_num(outlet_time, nan=0.0), grad_t, grad_phi)
    k_elution = 10.0 ** np.clip(log_k0 - s_values * outlet_phi, -9.0, 9.0)

    # --- peak profile -----------------------------------------------------
    eps_rel = np.array([_eps_rel(c, conditions.wavelength_nm) for c in compounds])
    mass_ug = np.array([c.concentration_mg_l * conditions.injection_volume_ul / 1000.0 for c in compounds])
    peak_area = mass_ug * eps_rel * RESPONSE_SCALE
    visible = np.isfinite(tr) & (eps_rel >= 0.03)
    sigma = np.where(np.isfinite(tr), tr / math.sqrt(plates), 0.0)
    sigma = np.maximum(sigma, 0.0015)
    tau = sigma * TAIL_RATIO

    finite = np.isfinite(tr)
    if np.any(finite):
        last_peak = float(np.nanmax(tr[finite]))
        last_sigma = float(np.nanmax(sigma[finite]))
        display_end = max(
            program_end * 1.02,
            last_peak + max(3.0 * last_sigma, 1.0),
            5.0,
        )
        display_end = min(display_end, max(run_time, display_end))
    else:
        display_end = run_time
    display_end = max(display_end, 1.0)

    grid = np.linspace(0.0, display_end, 3200)
    signal = np.zeros_like(grid)
    for i in range(n):
        if not visible[i]:
            continue
        mu = tr[i] - tau[i]
        signal += peak_area[i] * exponnorm.pdf(
            grid, TAIL_RATIO, loc=mu, scale=sigma[i]
        )

    rng = np.random.default_rng(7)
    baseline = (
        0.28
        + 0.12 * np.sin(2.0 * math.pi * grid / 9.5 + 0.4)
        + 0.05 * np.sin(2.0 * math.pi * grid / 3.1 + 1.7)
    )
    signal = signal + baseline + rng.normal(0.0, conditions.noise_mau, grid.size)

    composition = np.interp(
        np.clip(grid - dwell_t, grad_t[0], grad_t[-1]), grad_t, grad_b
    )

    # --- peak table -------------------------------------------------------
    order = np.argsort(np.where(finite, tr, 1e9))
    peaks = []
    for idx in order:
        c = compounds[int(idx)]
        if not finite[idx]:
            peaks.append({
                "name": c.name,
                "compound_id": c.id,
                "tr_min": None,
                "k": None,
                "phi_elution": None,
                "height_mau": 0.0,
                "area": 0.0,
                "width_min": None,
                "plates": int(round(plates)),
                "resolution_prev": None,
                "visible": False,
                "eps_rel": round(float(eps_rel[idx]), 4),
                "note": "运行时间内未洗脱",
            })
            continue
        mu = tr[idx] - tau[idx]
        height = float(peak_area[idx] * exponnorm.pdf(tr[idx], TAIL_RATIO, loc=mu, scale=sigma[idx]))
        peaks.append({
            "name": c.name,
            "compound_id": c.id,
            "tr_min": round(float(tr[idx]), 3),
            "k": round(float(k_elution[idx]), 3),
            "phi_elution": round(float(outlet_percent[idx]), 1),
            "height_mau": round(height, 3),
            "area": round(float(peak_area[idx]), 4) if visible[idx] else 0.0,
            "width_min": round(float(4.0 * sigma[idx]), 4),
            "plates": int(round(plates)),
            "resolution_prev": None,
            "visible": bool(visible[idx]),
            "eps_rel": round(float(eps_rel[idx]), 4),
            "note": None if visible[idx] else "该波长下紫外吸收弱",
        })

    # Resolution between adjacent visible peaks
    visible_peaks = [p for p in peaks if p["visible"] and p["tr_min"] is not None]
    resolutions = []
    for i in range(1, len(visible_peaks)):
        prev, cur = visible_peaks[i - 1], visible_peaks[i]
        # recover sigmas from widths (width = 4 sigma)
        s1 = prev["width_min"] / 4.0
        s2 = cur["width_min"] / 4.0
        rs = (cur["tr_min"] - prev["tr_min"]) / (2.0 * (s1 + s2))
        cur["resolution_prev"] = round(float(rs), 2)
        resolutions.append(rs)

    # --- pressure & warnings ---------------------------------------------
    mean_b = float(np.mean(composition)) / 100.0
    base_visc = _aqueous_viscosity(conditions)
    c_key = _channel_key(conditions.solvent_c, conditions.phase)
    d_key = _channel_key(conditions.solvent_d, conditions.phase)
    frac_c = conditions.percent_c / 100.0 if c_key else 0.0
    frac_d = conditions.percent_d / 100.0 if d_key else 0.0
    frac_a = max(0.0, 1.0 - mean_b - frac_c - frac_d)
    mix = [(frac_a, base_visc), (mean_b, ORGANIC_PROPS[organic_key]["visc"])]
    if c_key:
        mix.append((frac_c, _channel_viscosity(c_key, conditions.phase)))
    if d_key:
        mix.append((frac_d, _channel_viscosity(d_key, conditions.phase)))
    total_frac = sum(weight for weight, _ in mix) or 1.0
    eta = sum(weight * visc for weight, visc in mix) / total_frac
    eta *= max(0.4, 1.0 - 0.021 * (conditions.temperature_c - 25.0))
    pressure_bar = 1600.0 * eta * column.length_mm * (u / 60.0) / (dp_mm ** 2) / 1e5

    warnings: List[str] = []
    not_eluted = [p["name"] for p in peaks if p["tr_min"] is None]
    if not_eluted:
        warnings.append(
            "以下组分在运行时间内未洗脱：" + "、".join(not_eluted)
            + "。建议提高强洗脱溶剂 B 的比例或延长运行时间。"
        )
    for p in peaks:
        if p["visible"] and p["k"] is not None and p["k"] < 1.0:
            warnings.append(
                f"「{p['name']}」保留因子 k={p['k']:.2f} < 1，接近死体积，易受基质干扰。"
            )
    for p in peaks:
        if p["visible"] and p["k"] is not None and p["k"] > 20.0:
            warnings.append(
                f"「{p['name']}」保留过强（k={p['k']:.1f}），峰形易展宽，建议增大 B 比例。"
            )
    for i in range(1, len(visible_peaks)):
        cur = visible_peaks[i]
        if cur["resolution_prev"] is not None and cur["resolution_prev"] < 1.5:
            warnings.append(
                f"「{visible_peaks[i-1]['name']}」与「{cur['name']}」分离度 Rs={cur['resolution_prev']:.2f} < 1.5，存在共洗脱风险。"
            )
    for c, eps in zip(compounds, eps_rel):
        if eps < 0.05:
            warnings.append(
                f"「{c.name}」在 {conditions.wavelength_nm:.0f} nm 处摩尔吸光系数仅 {eps:.3f}，建议更换检测波长（λmax≈{c.lambda_max_nm:.0f} nm）或检测器。"
            )
    if phase == "reversed":
        for c in compounds:
            if c.pka is not None and abs(conditions.ph - c.pka) < 0.5:
                warnings.append(
                    f"pH {conditions.ph:.1f} 接近「{c.name}」的 pKa {c.pka:.1f}，保留时间对 pH 波动敏感。"
                )
        if column.chemistry != "c18":
            warnings.append(
                f"反相模型按 C18 校准，当前固定相为 {column.chemistry.upper()}，保留预测仅作相对参考。"
            )
        if _aqueous_key(conditions) in HEXANE_FAMILY:
            warnings.append(
                "当前为反相模式，非有机相 A 通常应为水或缓冲水溶液；所选 A 相极性过低。"
            )
    else:
        if column.chemistry not in ("silica", "diol", "amino"):
            warnings.append(
                "正相模式建议使用硅胶、二醇或氨基柱；当前 C18 固定相不适合正相条件。"
            )
        ionizable = [c.name for c in compounds if c.pka is not None]
        if ionizable:
            warnings.append(
                "正相不使用 pH 控制，以下组分具有可电离基团，可能与硅醇基强吸附或拖尾："
                + "、".join(ionizable)
                + "。建议使用氨基/二醇柱或加入少量极性添加剂。"
            )
        if _aqueous_key(conditions) in AQUEOUS_FAMILY:
            warnings.append(
                "当前为正相模式，非有机相 A 通常应为正己烷或正庚烷；所选 A 相为水相，可能不兼容。"
            )
    if conditions.aqueous == "custom":
        warnings.append(
            f"自定义非有机相「{_aqueous_label(conditions)}」按"
            + ("正己烷" if phase == "normal" else "水")
            + "的黏度估算柱压。"
        )
    if conditions.organic == "custom":
        warnings.append(
            f"自定义有机相「{_organic_label(conditions)}」按"
            + ("异丙醇" if phase == "normal" else "乙腈")
            + "的物性与洗脱强度估算。"
        )
    max_b = (
        max((p.percent_b for p in conditions.gradient), default=conditions.percent_b)
        if conditions.mode == "gradient"
        else conditions.percent_b
    )
    if max_b + conditions.percent_c + conditions.percent_d > 100.5:
        warnings.append(
            "B/C/D 相比例合计超过 100%，计算时已按比例归一化，请检查泵程序设置。"
        )
    for slot, value, label in (
        ("C", conditions.solvent_c, conditions.solvent_c_label),
        ("D", conditions.solvent_d, conditions.solvent_d_label),
    ):
        if value == "none":
            continue
        if value == "custom":
            warnings.append(
                f"自定义辅助相 {slot}「{_aux_label(value, label)}」按"
                + ("异丙醇" if phase == "normal" else "乙腈")
                + "的物性与洗脱强度估算。"
            )
            continue
        if phase == "reversed" and value in HEXANE_FAMILY:
            warnings.append(f"反相模式下辅助相 {slot} 为烷烃，可能与水相不互溶。")
        if phase == "normal" and value in AQUEOUS_FAMILY:
            warnings.append(f"正相模式下辅助相 {slot} 为水相，可能与正己烷体系不兼容。")
    pressure_limit = 1000.0 if column.particle_um <= 2.5 else 400.0
    if pressure_bar > pressure_limit:
        warnings.append(
            f"预测柱压约 {pressure_bar:.0f} bar，超过该柱型的建议上限（{pressure_limit:.0f} bar），"
            "建议降低流速、缩短柱长或检查粒径匹配。"
        )
    if conditions.mode == "gradient":
        last_tr = max((p["tr_min"] for p in visible_peaks), default=0.0)
        if last_tr > program_end + 0.5:
            warnings.append(
                "最后一个峰在梯度程序结束后才洗脱，可适当延长梯度时间或提高末端有机相比例。"
            )

    metrics = {
        "t0_min": round(float(t0), 3),
        "run_time_min": round(float(display_end), 2),
        "plates": int(round(plates)),
        "pressure_bar": round(float(pressure_bar), 1),
        "num_peaks": len(visible_peaks),
        "min_resolution": round(float(min(resolutions)), 2) if resolutions else None,
        "max_k": round(float(np.nanmax(k_elution[finite])), 2) if np.any(finite) else None,
        "wavelength_nm": float(conditions.wavelength_nm),
        "organic": conditions.organic,
        "organic_label": _organic_label(conditions),
        "aqueous": conditions.aqueous,
        "aqueous_label": _aqueous_label(conditions),
        "solvent_c": conditions.solvent_c,
        "solvent_c_label": _aux_label(conditions.solvent_c, conditions.solvent_c_label),
        "percent_c": float(conditions.percent_c),
        "solvent_d": conditions.solvent_d,
        "solvent_d_label": _aux_label(conditions.solvent_d, conditions.solvent_d_label),
        "percent_d": float(conditions.percent_d),
        "mode": conditions.mode,
        "phase": phase,
        "chemistry": column.chemistry,
    }

    return {
        "time": [round(float(v), 4) for v in grid],
        "signal": [round(float(v), 4) for v in signal],
        "composition": [round(float(v), 2) for v in composition],
        "peaks": peaks,
        "metrics": metrics,
        "warnings": warnings,
    }
