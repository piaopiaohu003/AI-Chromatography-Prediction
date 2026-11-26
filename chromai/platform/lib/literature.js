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

/* Curated analytical-chemistry journal set used as a dedicated OpenAlex
 * view.  ISSNs let the query stay inside these journals instead of relying on
 * loose title matching. */
const TOP_ANALYTICAL_JOURNALS = [
  { name: 'Analytical Chemistry', issn: '0003-2700' },
  { name: 'Journal of Chromatography A', issn: '0021-9673' },
  { name: 'Journal of Chromatography B', issn: '1570-0232' },
  { name: 'Analytica Chimica Acta', issn: '0003-2670' },
  { name: 'Talanta', issn: '0039-9140' },
  { name: 'Journal of Pharmaceutical and Biomedical Analysis', issn: '0731-7085' },
  { name: 'Journal of Separation Science', issn: '1615-9306' },
  { name: 'Chromatographia', issn: '0009-5893' },
  { name: 'Analytical and Bioanalytical Chemistry', issn: '1618-2642' },
  { name: 'Analytical Methods', issn: '1759-9660' },
  { name: 'Electrophoresis', issn: '0173-0835' },
  { name: 'Journal of Mass Spectrometry', issn: '1076-5174' },
  { name: 'Food Chemistry', issn: '0308-8146' },
  { name: 'Journal of Agricultural and Food Chemistry', issn: '0021-8561' },
];
const TOP_ISSN_FILTER = TOP_ANALYTICAL_JOURNALS.map((journal) => journal.issn).join('|');
const TOP_JOURNAL_KEYS = new Set(
  TOP_ANALYTICAL_JOURNALS.map((journal) => normalizeJournalName(journal.name)),
);

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

function applyRelevance(items, plan, sort, topJournals = false) {
  if (!plan) return items;
  const scored = [];
  items.forEach((item, index) => {
    const text = `${item.title || ''} ${item.abstract || ''}`.toLowerCase();
    if (!plan.terms.some((term) => text.includes(term))) return;
    if (plan.specific.length && !plan.specific.some((term) => text.includes(term))) return;
    let score = relevanceScore(item, plan);
    if (topJournals
      && ((item.sources || []).includes('openalex_journals') || isTopJournal(item.journal))) {
      score += 3;
    }
    scored.push({ item, score, index });
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

async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
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
  const issns = Array.isArray(record.ISSN) ? record.ISSN.slice() : [];
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
    issns,
    sources: ['crossref'],
  };
}

function normalizeJournalName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function isTopJournal(name) {
  const key = normalizeJournalName(name);
  return key ? TOP_JOURNAL_KEYS.has(key) : false;
}

function reconstructAbstract(index) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      const slot = Number.parseInt(position, 10);
      if (Number.isFinite(slot)) words[slot] = word;
    }
  }
  return words.filter(Boolean).join(' ');
}

function fromOpenAlex(record) {
  if (!record) return null;
  const title = cleanText(record.title || record.display_name, 300);
  if (!title) return null;
  const doi = normalizeDoi(record.doi);
  const source = record.primary_location?.source || {};
  const authors = Array.isArray(record.authorships)
    ? record.authorships
      .slice(0, 6)
      .map((entry) => entry?.author?.display_name)
      .filter(Boolean)
      .join(', ')
    : '';
  const year = Number.parseInt(record.publication_year, 10);
  const issns = Array.isArray(source.issn) ? source.issn.slice() : [];
  if (source.issn_l && !issns.includes(source.issn_l)) issns.push(source.issn_l);
  return {
    id: doi ? `doi:${doi}` : `openalex:${String(record.id || title).toLowerCase()}`,
    title,
    authors: cleanText(authors, 180),
    journal: cleanText(source.display_name, 90) || 'OpenAlex',
    year: Number.isFinite(year) ? year : null,
    doi: doi || null,
    url: doi ? `https://doi.org/${doi}` : String(record.id || ''),
    abstract: cleanText(reconstructAbstract(record.abstract_inverted_index), 700),
    cited_by: Number.isFinite(Number(record.cited_by_count)) ? Number(record.cited_by_count) : null,
    open_access: Boolean(record.open_access?.is_oa),
    type: record.type || 'journal-article',
    issns,
    sources: ['openalex'],
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
      if (!existing.journal || ['Crossref', 'OpenAlex'].includes(existing.journal)) {
        existing.journal = item.journal;
      }
      existing.authors = existing.authors || item.authors;
      if (existing.cited_by == null || (item.cited_by != null && item.cited_by > existing.cited_by)) {
        existing.cited_by = item.cited_by;
      }
      existing.open_access = existing.open_access || item.open_access;
      if (Array.isArray(item.issns) && item.issns.length) {
        const mergedIssns = new Set([...(existing.issns || []), ...item.issns]);
        existing.issns = Array.from(mergedIssns);
      }
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

async function searchEuropePmc(query, limit, sort, fromYear, toYear, timeoutMs) {
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
    timeoutMs,
  );
  const records = data?.resultList?.result || [];
  return records.map(fromEuropePmc).filter(Boolean);
}

async function searchCrossref(query, limit, sort, fromYear, toYear, timeoutMs) {
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(limit),
    select: 'DOI,title,author,issued,container-title,ISSN,is-referenced-by-count,abstract,URL,type',
    mailto: MAILTO,
  });
  /* Crossref 的 published 排序会退化为“最新但不相关”，因此始终按相关性检索，
   * 再在本地按年份 / 被引排序，兼顾相关性与时效。 */
  if (fromYear) {
    params.set('filter', `from-pub-date:${fromYear}-01-01,until-pub-date:${toYear || 2100}-12-31`);
  }
  const data = await fetchJson(`https://api.crossref.org/works?${params.toString()}`, timeoutMs);
  const records = data?.message?.items || [];
  return records.map(fromCrossref).filter(Boolean);
}

/* OpenAlex indexes ACS/Elsevier/Wiley analytical journals and exposes
 * abstracts as an inverted index.  Restricting by ISSN produces a dedicated
 * "top analytical chemistry journals" view without a separate API key. */
async function searchOpenAlex(query, limit, sort, fromYear, toYear, timeoutMs, topJournals = false) {
  const params = new URLSearchParams({
    search: query,
    'per-page': String(Math.min(100, Math.max(5, limit))),
    select: 'id,doi,title,publication_year,primary_location,authorships,cited_by_count,'
      + 'abstract_inverted_index,open_access,type',
    mailto: MAILTO,
  });
  const filters = [];
  if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
  if (toYear) filters.push(`to_publication_date:${toYear}-12-31`);
  if (topJournals) filters.push(`primary_location.source.issn:${TOP_ISSN_FILTER}`);
  if (filters.length) params.set('filter', filters.join(','));
  if (sort === 'newest') params.set('sort', 'publication_date:desc');
  else if (sort === 'cited') params.set('sort', 'cited_by_count:desc');
  else params.set('sort', 'relevance_score:desc');
  const data = await fetchJson(`https://api.openalex.org/works?${params.toString()}`, timeoutMs);
  const records = data?.results || [];
  return records.map(fromOpenAlex).filter(Boolean);
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
  const topJournals = Boolean(options.top_journals);
  const requested = Number.parseInt(options.timeout_ms, 10);
  const timeoutMs = Number.isFinite(requested)
    ? Math.min(TIMEOUT_MS, Math.max(2000, requested))
    : TIMEOUT_MS;
  const key = JSON.stringify([query, sort, fromYear, toYear, limit, topJournals]);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const perSource = Math.min(50, Math.max(limit * 2, 20));
  const tasks = [
    /* Europe PMC is consistently the slowest upstream; cap it at 6 s so a
     * dead endpoint cannot dominate the whole search budget. */
    ['europepmc', 'Europe PMC', searchEuropePmc(
      query, perSource, sort, fromYear, toYear, Math.min(timeoutMs, 6000),
    )],
    ['crossref', 'Crossref', searchCrossref(query, perSource, sort, fromYear, toYear, timeoutMs)],
    ['openalex', 'OpenAlex', searchOpenAlex(query, perSource, sort, fromYear, toYear, timeoutMs, false)],
  ];
  if (topJournals) {
    tasks.push([
      'openalex_journals',
      'OpenAlex 分析化学顶刊库',
      searchOpenAlex(query, perSource, sort, fromYear, toYear, timeoutMs, true),
    ]);
  }
  const settled = await Promise.allSettled(tasks.map((task) => task[2]));

  const errors = [];
  const sources = {};
  let merged = [];
  settled.forEach((result, index) => {
    const [keyName, label] = tasks[index];
    if (result.status === 'fulfilled') {
      sources[keyName] = 'ok';
      merged = mergeItems(merged, result.value);
    } else {
      sources[keyName] = 'error';
      errors.push(`${label}：${result.reason?.message || '请求失败'}`);
    }
  });

  const plan = relevancePlan(query);
  const cleaned = merged.map((item) => ({
    ...item,
    year: sanitizeYear(item.year),
  }));
  const items = orderItems(applyRelevance(cleaned, plan, sort, topJournals), sort).slice(0, limit);
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

module.exports = {
  search,
  scanTopic,
  LiteratureError,
  cleanText,
  isTopJournal,
  reconstructAbstract,
  fromOpenAlex,
  TOP_ANALYTICAL_JOURNALS,
};
