"""Literature lookup backed by Europe PMC and Crossref.

Both services are public and key-free.  Results are normalized, merged and
deduplicated by DOI or title, then cached briefly to keep request volume low.
"""

from __future__ import annotations

import html
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

import requests

EUROPE_PMC_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
CROSSREF_URL = "https://api.crossref.org/works"
TIMEOUT = (5.0, 25.0)
CACHE_TTL_SECONDS = 10 * 60
USER_AGENT = "ChromAI/1.1 (analytical chemistry references; mailto:chromai@example.com)"
MAILTO = "chromai@example.com"
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


class LiteratureError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _clean_text(value: object, maximum: int = 700) -> str:
    text = re.sub(r"<[^>]*>", " ", str(value or ""))
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > maximum:
        text = text[: maximum - 1].rstrip() + "…"
    return text


def _normalize_doi(value: object) -> str:
    doi = str(value or "").strip()
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    return doi.lower()


def normalize_query(value: object) -> str:
    query = str(value or "").strip()
    if len(query) < 2:
        raise LiteratureError("检索词至少需要 2 个字符", 400)
    if len(query) > 160:
        raise LiteratureError("检索词过长（上限 160 个字符）", 400)
    return query


_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "their",
    "this", "to", "using", "via", "was", "were", "with", "study", "studies",
    "method", "methods", "validation", "determination", "analysis", "analytical",
    "quantitative", "detection", "new", "novel", "approach", "based",
}


def _relevance_plan(query: str) -> Optional[dict[str, list[str]]]:
    """Tokens used to drop loosely matched records (mainly noisy Crossref hits)."""
    text = str(query or "")
    if re.search(r"[\u4e00-\u9fa5]", text):
        return None
    if re.match(r"^10\.\d{4,9}/", text.strip()):
        return None
    terms: list[str] = []
    for token in re.split(r"[^a-z0-9]+", text.lower()):
        if len(token) < 3 or token in _STOPWORDS or token in terms:
            continue
        terms.append(token)
    if not terms:
        return None
    return {"terms": terms, "specific": [term for term in terms if len(term) >= 5]}


def _relevance_score(item: dict[str, Any], plan: dict[str, list[str]]) -> int:
    title = str(item.get("title") or "").lower()
    abstract = str(item.get("abstract") or "").lower()
    score = 0
    for term in plan["terms"]:
        if term in title:
            score += 3
        elif term in abstract:
            score += 1
    return score


def _apply_relevance(
    items: list[dict[str, Any]], plan: Optional[dict[str, list[str]]], sort: str
) -> list[dict[str, Any]]:
    if not plan:
        return items
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for index, item in enumerate(items):
        text = f"{item.get('title') or ''} {item.get('abstract') or ''}".lower()
        if not any(term in text for term in plan["terms"]):
            continue
        if plan["specific"] and not any(term in text for term in plan["specific"]):
            continue
        scored.append((_relevance_score(item, plan), index, item))
    if not scored:
        return items
    if sort == "relevance":
        scored.sort(key=lambda entry: (-entry[0], entry[1]))
    return [entry[2] for entry in scored]


def _sanitize_year(year: object) -> Optional[int]:
    try:
        value = int(str(year))
    except (TypeError, ValueError):
        return None
    limit = time.gmtime().tm_year + 1
    if value < 1900 or value > limit:
        return None
    return value


def _title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fa5]+", "", title.lower())


def _from_europe_pmc(record: dict[str, Any]) -> Optional[dict[str, Any]]:
    title = _clean_text(record.get("title"), 300)
    if not title:
        return None
    doi = _normalize_doi(record.get("doi"))
    pmid = str(record.get("pmid") or "")
    item_id = f"doi:{doi}" if doi else (f"pmid:{pmid}" if pmid else f"epmc:{record.get('id')}")
    journal = (
        record.get("journalTitle")
        or (record.get("journalInfo") or {}).get("journal", {}).get("title")
        or "Europe PMC"
    )
    year_raw = str(record.get("pubYear") or "")
    year = int(year_raw) if year_raw.isdigit() else None
    cited = record.get("citedByCount")
    return {
        "id": item_id,
        "title": title,
        "authors": _clean_text(record.get("authorString"), 180),
        "journal": _clean_text(journal, 90),
        "year": year,
        "doi": doi or None,
        "url": f"https://doi.org/{doi}" if doi else f"https://europepmc.org/article/{record.get('source') or 'MED'}/{record.get('id')}",
        "abstract": _clean_text(record.get("abstractText"), 700),
        "cited_by": int(cited) if isinstance(cited, (int, float)) else None,
        "open_access": str(record.get("isOpenAccess") or "").upper() == "Y",
        "type": "journal-article",
        "sources": ["europepmc"],
    }


def _from_crossref(record: dict[str, Any]) -> Optional[dict[str, Any]]:
    titles = record.get("title") or []
    title = _clean_text(titles[0] if isinstance(titles, list) and titles else record.get("title"), 300)
    if not title:
        return None
    doi = _normalize_doi(record.get("DOI"))
    parts = ((record.get("issued") or {}).get("date-parts") or [[]])[0]
    year = int(parts[0]) if parts and str(parts[0]).isdigit() else None
    authors = ", ".join(
        " ".join(part for part in (person.get("given"), person.get("family")) if part).strip()
        for person in (record.get("author") or [])[:6]
    )
    containers = record.get("container-title") or []
    journal = containers[0] if isinstance(containers, list) and containers else containers
    cited = record.get("is-referenced-by-count")
    return {
        "id": f"doi:{doi}" if doi else f"crossref:{_title_key(title)[:60]}",
        "title": title,
        "authors": _clean_text(authors, 180),
        "journal": _clean_text(journal or "Crossref", 90),
        "year": year,
        "doi": doi or None,
        "url": f"https://doi.org/{doi}" if doi else str(record.get("URL") or ""),
        "abstract": _clean_text(record.get("abstract"), 700),
        "cited_by": int(cited) if isinstance(cited, (int, float)) else None,
        "open_access": False,
        "type": record.get("type") or "journal-article",
        "sources": ["crossref"],
    }


def _merge(first: list[dict[str, Any]], second: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}

    def add(item: Optional[dict[str, Any]]) -> None:
        if not item:
            return
        keys = [
            item["id"],
            f"doi:{item['doi']}" if item.get("doi") else "",
            _title_key(item["title"]),
        ]
        keys = [key for key in keys if key]
        existing = next((by_key[key] for key in keys if key in by_key), None)
        if existing:
            if not existing.get("abstract") and item.get("abstract"):
                existing["abstract"] = item["abstract"]
            if existing.get("journal") == "Crossref" and item.get("journal"):
                existing["journal"] = item["journal"]
            if not existing.get("authors") and item.get("authors"):
                existing["authors"] = item["authors"]
            current = existing.get("cited_by")
            candidate = item.get("cited_by")
            if candidate is not None and (current is None or candidate > current):
                existing["cited_by"] = candidate
            existing["open_access"] = bool(existing.get("open_access") or item.get("open_access"))
            for source in item["sources"]:
                if source not in existing["sources"]:
                    existing["sources"].append(source)
            for key in keys:
                by_key[key] = existing
            return
        merged.append(item)
        for key in keys:
            by_key[key] = item

    for index in range(max(len(first), len(second))):
        if index < len(first):
            add(first[index])
        if index < len(second):
            add(second[index])
    return merged


def _search_europe_pmc(
    query: str, limit: int, sort: str, from_year: Optional[int], to_year: Optional[int]
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "query": query,
        "format": "json",
        "pageSize": limit,
        "resultType": "core",
    }
    if sort == "newest":
        params["sort"] = "P_PDATE_D desc"
    elif sort == "cited":
        params["sort"] = "CITED desc"
    if from_year:
        params["query"] = (
            f"{query} AND (FIRST_PDATE:[{from_year}-01-01 TO {to_year or 2100}-12-31])"
        )
    response = requests.get(
        EUROPE_PMC_URL, params=params, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}
    )
    response.raise_for_status()
    records = ((response.json().get("resultList") or {}).get("result")) or []
    return [item for item in (_from_europe_pmc(record) for record in records) if item]


def _search_crossref(
    query: str, limit: int, sort: str, from_year: Optional[int], to_year: Optional[int]
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "query.bibliographic": query,
        "rows": limit,
        "select": "DOI,title,author,issued,container-title,is-referenced-by-count,abstract,URL,type",
        "mailto": MAILTO,
    }
    # Crossref 的 published 排序会退化为“最新但不相关”，因此始终按相关性检索，
    # 再在本地按年份 / 被引排序。
    if from_year:
        params["filter"] = (
            f"from-pub-date:{from_year}-01-01,until-pub-date:{to_year or 2100}-12-31"
        )
    response = requests.get(
        CROSSREF_URL, params=params, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}
    )
    response.raise_for_status()
    records = ((response.json().get("message") or {}).get("items")) or []
    return [item for item in (_from_crossref(record) for record in records) if item]


def _order(items: list[dict[str, Any]], sort: str) -> list[dict[str, Any]]:
    if sort == "newest":
        return sorted(
            items,
            key=lambda item: (item.get("year") or 0, item.get("cited_by") or 0),
            reverse=True,
        )
    if sort == "cited":
        return sorted(items, key=lambda item: item.get("cited_by") or 0, reverse=True)
    return items


def search(
    query_input: object,
    limit: int = 15,
    sort: str = "relevance",
    from_year: Optional[int] = None,
    to_year: Optional[int] = None,
) -> dict[str, Any]:
    query = normalize_query(query_input)
    limit = min(30, max(5, int(limit or 15)))
    sort = sort if sort in ("relevance", "newest", "cited") else "relevance"
    cache_key = f"{query}|{sort}|{from_year}|{to_year}|{limit}"
    cached = _CACHE.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    per_source = min(50, max(limit * 2, 20))
    errors: list[str] = []
    sources: dict[str, str] = {}
    first: list[dict[str, Any]] = []
    second: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            "europepmc": pool.submit(
                _search_europe_pmc, query, per_source, sort, from_year, to_year
            ),
            "crossref": pool.submit(
                _search_crossref, query, per_source, sort, from_year, to_year
            ),
        }
        results: dict[str, Any] = {}
        for name, future in futures.items():
            try:
                results[name] = future.result()
                sources[name] = "ok"
            except Exception as exc:  # noqa: BLE001
                results[name] = []
                sources[name] = "error"
                errors.append(f"{'Europe PMC' if name == 'europepmc' else 'Crossref'}：{exc}")

    first = results.get("europepmc") or []
    second = results.get("crossref") or []
    plan = _relevance_plan(query)
    cleaned = [
        {**item, "year": _sanitize_year(item.get("year"))}
        for item in _merge(first, second)
    ]
    items = _order(_apply_relevance(cleaned, plan, sort), sort)[:limit]
    if not items and errors:
        raise LiteratureError("文献数据库暂不可用：" + "；".join(errors))
    payload = {"query": query, "sort": sort, "results": items, "sources": sources, "errors": errors}
    _CACHE[cache_key] = (time.time(), payload)
    if len(_CACHE) > 80:
        _CACHE.pop(next(iter(_CACHE)))
    return payload


def scan_topic(
    query: str,
    previous_seen: Optional[list[str]] = None,
    limit: int = 25,
    baseline: bool = False,
) -> dict[str, Any]:
    results = search(query, limit=limit, sort="newest")["results"]
    seen = set(previous_seen or [])
    fresh = [] if baseline else [item for item in results if item["id"] not in seen]
    fresh_ids = {item["id"] for item in fresh}
    items = [
        {**item, "abstract": _clean_text(item.get("abstract"), 520), "is_new": item["id"] in fresh_ids}
        for item in results[:20]
    ]
    seen_ids: list[str] = []
    for item_id in [item["id"] for item in results] + list(previous_seen or []):
        if item_id not in seen_ids:
            seen_ids.append(item_id)
    return {
        "items": items,
        "seen_ids": seen_ids[:400],
        "new_ids": [item["id"] for item in fresh][:50],
        "new_count": len(fresh),
        "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
