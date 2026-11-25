"""Dynamic compound lookup backed by PubChem PUG REST.

PubChem provides logP and SMILES, but pKa and lambda_max are inferred
heuristically.  Every returned compound is marked as estimated so the client can
warn the user before the compound is used for a method.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional
from urllib.parse import quote

import requests

AUTOCOMPLETE_URL = "https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound"
PROPERTY_URL = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name"
CACHE_TTL_SECONDS = 600
_CACHE: Dict[str, tuple[float, List[dict]]] = {}
_HEADERS = {"User-Agent": "ChromAI/1.0 (educational chromatography)"}


def _estimate_acid_base(smiles: Optional[str]) -> tuple[str, Optional[float]]:
    value = smiles or ""
    if "C(=O)O" in value or "S(=O)(=O)O" in value:
        return "acid", 4.2
    if "c1ccccc1O" in value or "c1ccc(O)cc1" in value:
        return "acid", 10.0
    if "N" in value and "C(=O)N" not in value and "[N+](=O)" not in value:
        return "base", 9.5
    return "neutral", None


def _to_compound(property_row: dict, fallback_name: str) -> Optional[dict]:
    try:
        cid = int(property_row["CID"])
    except (KeyError, TypeError, ValueError):
        return None
    title = property_row.get("Title") or fallback_name
    try:
        log_p = float(property_row.get("XLogP"))
    except (TypeError, ValueError):
        log_p = 2.5
    acid_base, pka = _estimate_acid_base(
        property_row.get("ConnectivitySMILES") or property_row.get("CanonicalSMILES"),
    )
    return {
        "id": f"pubchem-{cid}",
        "name": title,
        "name_en": title,
        "category": "在线检索",
        "log_p": log_p,
        "pka": pka,
        "acid_base": acid_base,
        "lambda_max_nm": 254,
        "concentration_mg_l": 100,
        "log_kw": None,
        "s_value": None,
        "epsilon_max": 1,
        "source": "pubchem",
        "cid": cid,
        "estimated": True,
    }


def _fetch_one(name: str) -> Optional[dict]:
    response = requests.get(
        f"{PROPERTY_URL}/{quote(name, safe='')}/property/"
        "Title,XLogP,CanonicalSMILES/JSON",
        headers=_HEADERS,
        timeout=4.5,
    )
    response.raise_for_status()
    rows = response.json().get("PropertyTable", {}).get("Properties", [])
    return _to_compound(rows[0], name) if rows else None


def search_online(query: str, limit: int = 6) -> List[dict]:
    key = f"{query.lower()}:{limit}"
    cached = _CACHE.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    response = requests.get(
        f"{AUTOCOMPLETE_URL}/{quote(query, safe='')}/json",
        params={"limit": limit},
        headers=_HEADERS,
        timeout=4.5,
    )
    response.raise_for_status()
    names = response.json().get("dictionary_terms", {}).get("compound", [])[:limit]

    results: List[dict] = []
    if names:
        with ThreadPoolExecutor(max_workers=min(limit, 6)) as pool:
            futures = [pool.submit(_fetch_one, name) for name in names]
            for future in futures:
                try:
                    item = future.result()
                except Exception:  # noqa: BLE001 - one bad name must not break the search
                    continue
                if item:
                    results.append(item)

    deduped: List[dict] = []
    seen = set()
    for item in results:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        deduped.append(item)

    _CACHE[key] = (time.time(), deduped)
    if len(_CACHE) > 100:
        oldest = next(iter(_CACHE))
        _CACHE.pop(oldest, None)
    return deduped
