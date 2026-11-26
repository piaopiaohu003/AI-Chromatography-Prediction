'use strict';

/* ChemicalBook reference lookup used by the merged compound-search view.
 * The upstream site does not publish an API, so search results and product
 * property pages are parsed from HTML. Parsing is deliberately tolerant:
 * missing fields stay null and never become fake values. */

const BASE_URL = 'https://www.chemicalbook.com';
const SEARCH_URL = `${BASE_URL}/Search_EN.aspx`;
const DETAIL_PATH = /ProductChemicalProperties(CB\d+)_EN\.htm/i;
const CACHE_LIMIT = 128;
const cache = new Map();

class ChemicalBookError extends Error {}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value) {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const mapped = ENTITIES[body.toLowerCase()];
    return mapped === undefined ? match : mapped;
  });
}

function clean(value) {
  const text = decodeEntities(String(value ?? ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

async function upstreamRequest(url) {
  if (cache.has(url)) return cache.get(url);
  const pending = (async () => {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ChromAI/1.0; +https://github.com/piaopiaohu003/AI-Chromatography-Prediction)',
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      });
    } catch (err) {
      throw new ChemicalBookError(`ChemicalBook request failed: ${err.message || err}`);
    }
    if (!response.ok) {
      throw new ChemicalBookError(`ChemicalBook responded with HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 8_000_000) {
      throw new ChemicalBookError('ChemicalBook returned an unexpectedly large response');
    }
    const text = new TextDecoder('utf-8').decode(buffer);
    if (/\/verify/i.test(response.url) || /Verify you're human/i.test(text)) {
      throw new ChemicalBookError('ChemicalBook requires browser verification for this request');
    }
    return { text, url: response.url };
  })();
  cache.set(url, pending);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  try {
    return await pending;
  } catch (err) {
    cache.delete(url);
    throw err;
  }
}

function tableSegments(html) {
  const starts = [];
  const pattern = /<table[^>]*class\s*=\s*"[^"]*\bmbox\b[^"]*"[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    starts.push({ index: match.index, end: pattern.lastIndex });
  }
  return starts.map((entry, position) => {
    const next = starts[position + 1];
    return html.slice(entry.index, next ? next.index : html.length);
  });
}

function rowFields(segment) {
  const fields = {};
  const rowPattern = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let row;
  while ((row = rowPattern.exec(segment)) !== null) {
    const label = clean(row[1]);
    const value = clean(row[2]);
    if (!label || !value) continue;
    const key = label.replace(/:$/, '').trim().toLowerCase();
    if (key && fields[key] === undefined) fields[key] = value;
  }
  return fields;
}

function parseSearch(html, limit = 5) {
  const matches = [];
  for (const segment of tableSegments(String(html || ''))) {
    if (matches.length >= limit) break;
    const nameMatch = segment.match(/<td[^>]*class\s*=\s*"[^"]*\brtd\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const fields = rowFields(segment.slice(0, segment.indexOf('</table>')));
    const name = clean(nameMatch ? nameMatch[1] : fields['chemical name']);
    if (!name) continue;
    const hrefMatch = segment.match(/href\s*=\s*"([^"]*ProductChemicalPropertiesCB\d+_EN\.htm[^"]*)"/i);
    const detailUrl = hrefMatch ? new URL(decodeEntities(hrefMatch[1]), BASE_URL).href : null;
    let cbNumber = fields.cbnumber || null;
    if (cbNumber) cbNumber = cbNumber.toUpperCase();
    if (!cbNumber && detailUrl) {
      const extracted = detailUrl.match(DETAIL_PATH);
      if (extracted) cbNumber = extracted[1].toUpperCase();
    }
    matches.push({
      id: cbNumber || `result-${matches.length + 1}`,
      cb_number: cbNumber,
      name,
      cas_number: fields['cas no.'] || null,
      molecular_formula: fields['molecular formula'] || null,
      molecular_weight: fields['formula weight'] || fields['molecular weight'] || null,
      detail_url: detailUrl,
    });
  }
  return matches;
}

function parseDetail(html, match) {
  const text = String(html || '');
  const fields = {};
  const rowPattern = /<tr[^>]*class\s*=\s*"[^"]*ProdSupplierGN_ProductA_[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowPattern.exec(text)) !== null) {
    const cells = [];
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cellPattern.exec(row[1])) !== null) cells.push(cell[1]);
    if (cells.length < 2) continue;
    const label = clean(cells[0]);
    const value = clean(cells[1]);
    const key = label ? label.replace(/:$/, '').trim().toLowerCase() : null;
    if (key && value && fields[key] === undefined) fields[key] = value;
  }
  const selected = {
    ...match,
    name: fields['product name'] || match.name,
    cas_number: fields.cas || match.cas_number,
    molecular_formula: fields.mf || match.molecular_formula,
    molecular_weight: fields.mw || match.molecular_weight,
    source_label: 'ChemicalBook · Product chemical properties',
  };
  selected.properties = [
    ['Molecular formula', selected.molecular_formula],
    ['Molecular weight', selected.molecular_weight],
    ['Boiling point', fields['boiling point']],
  ].filter(([, value]) => value).map(([label, value]) => ({ label, value }));

  const summaryMatch = text.match(
    /<td[^>]*>\s*<a[^>]*name\s*=\s*"chemical property"[^>]*>[\s\S]*?<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
  );
  selected.summary = summaryMatch ? clean(summaryMatch[1]) : null;
  return selected;
}

async function searchCompounds(query, cbNumber = null, limit = 5) {
  const search = await upstreamRequest(`${SEARCH_URL}?keyword=${encodeURIComponent(query)}`);
  const matches = parseSearch(search.text, limit);
  let selected = null;
  if (matches.length) {
    const wanted = cbNumber ? String(cbNumber).toUpperCase() : null;
    const base = wanted
      ? matches.find((item) => item.cb_number && item.cb_number.toUpperCase() === wanted)
      : matches[0];
    if (base && base.detail_url) {
      const detail = await upstreamRequest(base.detail_url);
      selected = parseDetail(detail.text, base);
    } else if (base) {
      selected = {
        ...base,
        properties: [
          ['Molecular formula', base.molecular_formula],
          ['Molecular weight', base.molecular_weight],
        ].filter(([, value]) => value).map(([label, value]) => ({ label, value })),
        summary: null,
        source_label: 'ChemicalBook · Search result',
      };
    }
  }
  return {
    query,
    source: { name: 'ChemicalBook', status: 'live', url: search.url },
    matches,
    selected,
    notices: {
      matches: matches.length ? null : 'No compounds matched this search.',
      properties: selected && selected.properties && selected.properties.length
        ? null
        : 'No physical properties are published for this record.',
      summary: selected && selected.summary
        ? null
        : 'No compound summary is published for this record.',
    },
  };
}

module.exports = {
  ChemicalBookError,
  parseSearch,
  parseDetail,
  searchCompounds,
};
