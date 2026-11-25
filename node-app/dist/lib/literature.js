'use strict';

/* Literature lookup backed by public bibliographic APIs.
 *
 * Europe PMC (PubMed/PMC/preprints) and Crossref are queried in parallel.
 * Results are normalized, merged/deduplicated by DOI or title, and cached for
 * a short period.  No API key is required; both services are polite-pool
 * friendly as long as requests stay modest.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 80;
const TIMEOUT_MS = 12000;
const USER_AGENT = 'ChromAI/1.1 (analytical chemistry references; mailto:chromai@example.com)';
const MAILTO = 'chromai@example.com';

const cache = new Map();

class LiteratureError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'LiteratureError';
    this.status = status;
  }
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function decodeEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const base = code[1].toLowerCase() === 'x' ? 16 : 10;
      const value = Number.parseInt(code.slice(base === 16 ? 2 : 1), base);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] || match;
  });
}

function cleanText(value, max = 700) {
  let text = decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '));
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
  return text;
}

function normalizeDoi(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .toLowerCase();
}

function normalizeQuery(value) {
  const query = String(value === undefined || value === null ? '' : value).trim();
  if (query.length < 2) {
    throw new LiteratureError('检索词至少需要 2 个字符', 400);
  }
  if (query.length > 160) {
    throw new LiteratureError('检索词过长（上限 160 个字符）', 400);
  }
  return query;
}

/* Query analysis used to keep loosely matched records out of the results.
 * Crossref (and to a lesser degree Europe PMC) happily returns papers that
 * only share a generic word with the query, especially when sorting by date.
 */

const STOPWORDS = new Set(
  ('a an and are as at be by for from has have in into is it its of on or that the '
    + 'their this to using via was were with study studies method methods validation '
    + 'determination analysis analytical quantitative detection new novel approach based'
  ).split(/\s+/),
);

function hasCjk(text) {
  return /[\u4e00-\u9fa5]/.test(String(text || ''));
}

function relevancePlan(query) {
  const text = String(query || '');
  if (hasCjk(text)) return null; // 中文检索交给数据源匹配
  if (/^10\.\d{4,9}\//.test(text.trim())) return null; // DOI 检索
  const terms = [];
  text.toLowerCase().split(/[^a-z0-9]+/).forEach((token) => {
    if (token.length < 3 || STOPWORDS.has(token) || terms.includes(token)) return;
    terms.push(token);
  });
  if (!terms.length) return null;
  return { terms, specific: terms.filter((term) => term.length >= 5) };
}

function relevanceScore(item, plan) {
  const title = String(item.title || '').toLowerCase();
  const abstract = String(item.abstract || '').toLowerCase();
  let score = 0;
  plan.terms.forEach((term) => {
    if (title.includes(term)) score += 3;
    else if (abstract.includes(term)) score += 1;
  });
  return score;
}

function applyRelevance(items, plan, sort) {
  if (!plan) return items;
  const scored = [];
  items.forEach((item, index) => {
    const text = `${item.title || ''} ${item.abstract || ''}`.toLowerCase();
    if (!plan.terms.some((term) => text.includes(term))) return;
    if (plan.specific.length && !plan.specific.some((term) => text.includes(term))) return;
    scored.push({ item, score: relevanceScore(item, plan), index });
  });
  if (!scored.length) return items; // 不过度过滤导致空结果
  if (sort === 'relevance') {
    scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  }
  return scored.map((entry) => entry.item);
}

function sanitizeYear(year) {
  const value = Number.parseInt(year, 10);
  if (!Number.isFinite(value)) return null;
  const limit = new Date().getFullYear() + 1;
  if (value < 1900 || value > limit) return null; // 过滤元数据中的未来 / 异常年份
  return value;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function fromEuropePmc(record) {
  const title = cleanText(record.title, 300);
  if (!title) return null;
  const doi = normalizeDoi(record.doi);
  const pmid = record.pmid ? String(record.pmid) : '';
  const id = doi ? `doi:${doi}` : (pmid ? `pmid:${pmid}` : `epmc:${record.id}`);
  const year = Number.parseInt(record.pubYear, 10);
  return {
    id,
    title,
    authors: cleanText(record.authorString, 180),
    journal: cleanText(
      record.journalTitle
        || record.journalInfo?.journal?.title
        || record.bookOrReportDetails?.publisher
        || 'Europe PMC',
      90,
    ),
    year: Number.isFinite(year) ? year : null,
    doi: doi || null,
    url: doi ? `https://doi.org/${doi}` : `https://europepmc.org/article/${record.source || 'MED'}/${record.id}`,
    abstract: cleanText(record.abstractText, 700),
    cited_by: Number.isFinite(Number(record.citedByCount)) ? Number(record.citedByCount) : null,
    open_access: String(record.isOpenAccess || '').toUpperCase() === 'Y',
    type: 'journal-article',
    sources: ['europepmc'],
  };
}

function fromCrossref(record) {
  const title = cleanText(Array.isArray(record.title) ? record.title[0] : record.title, 300);
  if (!title) return null;
  const doi = normalizeDoi(record.DOI);
  const parts = record.issued?.['date-parts']?.[0] || [];
  const year = Number.parseInt(parts[0], 10);
  const authors = Array.isArray(record.author)
    ? record.author
      .slice(0, 6)
      .map((person) => [person.given, person.family].filter(Boolean).join(' ').trim())
      .filter(Boolean)
      .join(', ')
    : '';
  const journal = cleanText(
    Array.isArray(record['container-title']) ? record['container-title'][0] : record['container-title'],
    90,
  );
  return {
    id: doi ? `doi:${doi}` : `crossref:${cleanText(title, 60).toLowerCase()}`,
    title,
    authors: cleanText(authors, 180),
    journal: journal || 'Crossref',
    year: Number.isFinite(year) ? year : null,
    doi: doi || null,
    url: doi ? `https://doi.org/${doi}` : (record.URL || ''),
    abstract: cleanText(record.abstract, 700),
    cited_by: Number.isFinite(Number(record['is-referenced-by-count']))
      ? Number(record['is-referenced-by-count'])
      : null,
    open_access: false,
    type: record.type || 'journal-article',
    sources: ['crossref'],
  };
}

function titleKey(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function mergeItems(first, second) {
  const merged = [];
  const byKey = new Map();
  const add = (item) => {
    if (!item) return;
    const keys = [item.id, item.doi ? `doi:${item.doi}` : '', titleKey(item.title)].filter(Boolean);
    const existing = keys.map((key) => byKey.get(key)).find(Boolean);
    if (existing) {
      existing.abstract = existing.abstract || item.abstract;
      existing.journal = existing.journal === 'Crossref' ? item.journal : existing.journal;
      existing.authors = existing.authors || item.authors;
      if (existing.cited_by == null || (item.cited_by != null && item.cited_by > existing.cited_by)) {
        existing.cited_by = item.cited_by;
      }
      existing.open_access = existing.open_access || item.open_access;
      item.sources.forEach((source) => {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      });
      keys.forEach((key) => byKey.set(key, existing));
      return;
    }
    merged.push(item);
    keys.forEach((key) => byKey.set(key, item));
  };
  const length = Math.max(first.length, second.length);
  for (let i = 0; i < length; i += 1) {
    add(first[i]);
    add(second[i]);
  }
  return merged;
}

async function searchEuropePmc(query, limit, sort, fromYear, toYear) {
  const params = new URLSearchParams({
    query,
    format: 'json',
    pageSize: String(limit),
    resultType: 'core',
  });
  if (sort === 'newest') params.set('sort', 'P_PDATE_D desc');
  else if (sort === 'cited') params.set('sort', 'CITED desc');
  if (fromYear) params.set('query', `${query} AND (FIRST_PDATE:[${fromYear}-01-01 TO ${toYear || 2100}-12-31])`);
  const data = await fetchJson(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`,
  );
  const records = data?.resultList?.result || [];
  return records.map(fromEuropePmc).filter(Boolean);
}

async function searchCrossref(query, limit, sort, fromYear, toYear) {
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(limit),
    select: 'DOI,title,author,issued,container-title,is-referenced-by-count,abstract,URL,type',
    mailto: MAILTO,
  });
  /* Crossref 的 published 排序会退化为“最新但不相关”，因此始终按相关性检索，
   * 再在本地按年份 / 被引排序，兼顾相关性与时效。 */
  if (fromYear) {
    params.set('filter', `from-pub-date:${fromYear}-01-01,until-pub-date:${toYear || 2100}-12-31`);
  }
  const data = await fetchJson(`https://api.crossref.org/works?${params.toString()}`);
  const records = data?.message?.items || [];
  return records.map(fromCrossref).filter(Boolean);
}

function orderItems(items, sort) {
  if (sort === 'newest') {
    return items.slice().sort((a, b) => {
      if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
      return (b.cited_by || 0) - (a.cited_by || 0);
    });
  }
  if (sort === 'cited') {
    return items.slice().sort((a, b) => (b.cited_by || 0) - (a.cited_by || 0));
  }
  return items;
}

async function search(queryInput, options = {}) {
  const query = normalizeQuery(queryInput);
  const limit = Math.min(30, Math.max(5, Number.parseInt(options.limit, 10) || 15));
  const sort = ['relevance', 'newest', 'cited'].includes(options.sort) ? options.sort : 'relevance';
  const fromYear = Number.parseInt(options.from_year, 10) || null;
  const toYear = Number.parseInt(options.to_year, 10) || null;
  const key = JSON.stringify([query, sort, fromYear, toYear, limit]);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const perSource = Math.min(50, Math.max(limit * 2, 20));
  const [epmc, crossref] = await Promise.allSettled([
    searchEuropePmc(query, perSource, sort, fromYear, toYear),
    searchCrossref(query, perSource, sort, fromYear, toYear),
  ]);

  const errors = [];
  const sources = {};
  const first = [];
  const second = [];
  if (epmc.status === 'fulfilled') {
    first.push(...epmc.value);
    sources.europepmc = 'ok';
  } else {
    sources.europepmc = 'error';
    errors.push(`Europe PMC：${epmc.reason?.message || '请求失败'}`);
  }
  if (crossref.status === 'fulfilled') {
    second.push(...crossref.value);
    sources.crossref = 'ok';
  } else {
    sources.crossref = 'error';
    errors.push(`Crossref：${crossref.reason?.message || '请求失败'}`);
  }

  const plan = relevancePlan(query);
  const cleaned = mergeItems(first, second).map((item) => ({
    ...item,
    year: sanitizeYear(item.year),
  }));
  const items = orderItems(applyRelevance(cleaned, plan, sort), sort).slice(0, limit);
  if (!items.length && errors.length) {
    throw new LiteratureError(`文献数据库暂不可用：${errors.join('；')}`);
  }
  const value = { query, sort, results: items, sources, errors };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  return value;
}

function compactItem(item) {
  return {
    ...item,
    abstract: cleanText(item.abstract, 520),
    authors: cleanText(item.authors, 160),
  };
}

async function scanTopic(query, previousSeen = [], options = {}) {
  const baseline = Boolean(options.baseline);
  const limit = Math.min(30, Math.max(5, Number.parseInt(options.limit, 10) || 25));
  const { results } = await search(query, { limit, sort: 'newest' });
  const seen = new Set(Array.isArray(previousSeen) ? previousSeen : []);
  const fresh = baseline ? [] : results.filter((item) => !seen.has(item.id));
  const freshIds = new Set(fresh.map((item) => item.id));
  const items = results.slice(0, 20).map((item) => ({
    ...compactItem(item),
    is_new: freshIds.has(item.id),
  }));
  const seenIds = [
    ...results.map((item) => item.id),
    ...(Array.isArray(previousSeen) ? previousSeen : []),
  ].filter((id, index, list) => list.indexOf(id) === index).slice(0, 400);
  return {
    items,
    seen_ids: seenIds,
    new_ids: fresh.map((item) => item.id).slice(0, 50),
    new_count: fresh.length,
    scanned_at: new Date().toISOString(),
  };
}

module.exports = { search, scanTopic, LiteratureError, cleanText };
