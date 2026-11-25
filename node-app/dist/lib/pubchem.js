'use strict';

/* Dynamic compound lookup backed by PubChem PUG REST.  Results are intentionally
 * marked as estimated: PubChem provides logP and SMILES, but pKa and lambda_max
 * are inferred heuristically and should be corrected for regulatory work. */

const AUTOCOMPLETE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound';
const PROPERTY_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name';
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function estimateAcidBase(smiles) {
  const value = String(smiles || '');
  if (/C\(=O\)O|S\(=O\)\(=O\)O/.test(value)) {
    return { acid_base: 'acid', pka: 4.2 };
  }
  if (/c1ccccc1O|c1ccc\(O\)cc1/.test(value)) {
    return { acid_base: 'acid', pka: 10.0 };
  }
  if (/N/.test(value) && !/C\(=O\)N/.test(value) && !/\[N\+\]\(=O\)/.test(value)) {
    return { acid_base: 'base', pka: 9.5 };
  }
  return { acid_base: 'neutral', pka: null };
}

async function fetchJson(url, timeoutMs = 4500) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ChromAI/1.0 (educational chromatography)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`PubChem HTTP ${response.status}`);
  }
  return response.json();
}

function toCompound(property, fallbackName) {
  const cid = Number(property.CID);
  if (!Number.isFinite(cid)) return null;
  const title = property.Title || fallbackName;
  const logP = Number(property.XLogP);
  const ion = estimateAcidBase(property.ConnectivitySMILES || property.CanonicalSMILES);
  return {
    id: `pubchem-${cid}`,
    name: title,
    name_en: title,
    category: '在线检索',
    log_p: Number.isFinite(logP) ? logP : 2.5,
    pka: ion.pka,
    acid_base: ion.acid_base,
    lambda_max_nm: 254,
    concentration_mg_l: 100,
    log_kw: null,
    s_value: null,
    epsilon_max: 1,
    source: 'pubchem',
    cid,
    estimated: true,
  };
}

async function searchOnline(query, limit = 6) {
  const key = `${query.toLowerCase()}:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const autocomplete = await fetchJson(
    `${AUTOCOMPLETE_URL}/${encodeURIComponent(query)}/json?limit=${limit}`,
  );
  const names = (autocomplete.dictionary_terms && autocomplete.dictionary_terms.compound) || [];
  const settled = await Promise.allSettled(
    names.slice(0, limit).map(async (name) => {
      const data = await fetchJson(
        `${PROPERTY_URL}/${encodeURIComponent(name)}/property/Title,XLogP,CanonicalSMILES/JSON`,
      );
      const property = data && data.PropertyTable && data.PropertyTable.Properties
        ? data.PropertyTable.Properties[0]
        : null;
      return property ? toCompound(property, name) : null;
    }),
  );

  const seen = new Set();
  const value = [];
  for (const item of settled) {
    if (item.status !== 'fulfilled' || !item.value) continue;
    if (seen.has(item.value.id)) continue;
    seen.add(item.value.id);
    value.push(item.value);
  }

  cache.set(key, { at: Date.now(), value });
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  return value;
}

module.exports = { searchOnline, estimateAcidBase };
