import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetail, parseSearch } from '../server.js';

const SEARCH_HTML = `
<table class="mid"><tr><td><table class="mbox">
<tr><td>CBNumber:</td><td>CB5114818</td></tr>
<tr><td>Chemical Name:</td><td class="rtd"><a>aspirin</a></td></tr>
<tr><td>Molecular Formula:</td><td>C9H8O4</td></tr>
<tr><td>Formula Weight:</td><td>180.16</td></tr>
<tr><td>CAS No.:</td><td>50-78-2</td></tr>
</table><a href="/ProductChemicalPropertiesCB5114818_EN.htm">Chemical Properties</a></td></tr></table>
<table class="mid"><tr><td><table class="mbox">
<tr><td>Chemical Name:</td><td class="rtd"><a>Unknown compound</a></td></tr>
<tr><td>Molecular Formula:</td><td> </td></tr><tr><td>CAS No.:</td><td> </td></tr>
</table></td></tr></table>`;
const DETAIL_HTML = `<table>
<tr class="ProdSupplierGN_ProductA_2"><td>Product Name:</td><td>Acetylsalicylic acid</td></tr>
<tr class="ProdSupplierGN_ProductA_1"><td>CAS:</td><td>50-78-2</td></tr>
<tr class="ProdSupplierGN_ProductA_2"><td>MF:</td><td>C9H8O4</td></tr>
<tr class="ProdSupplierGN_ProductA_1"><td>MW:</td><td>180.16</td></tr>
<tr class="ProdSupplierGN_ProductA_2"><td>Boiling point</td><td>272.96°C (rough estimate)</td></tr>
<tr class="ProdSupplierGN_ProductA_1"><td><a name="Chemical property">Chemical property</a></td><td>This product is a white crystalline solid.</td></tr>
</table>`;

test('ChemicalBook search preserves present and missing fields', () => {
  const matches = parseSearch(SEARCH_HTML);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].name, 'aspirin');
  assert.equal(matches[0].cas_number, '50-78-2');
  assert.equal(matches[0].molecular_formula, 'C9H8O4');
  assert.equal(matches[0].molecular_weight, '180.16');
  assert.equal(matches[0].cb_number, 'CB5114818');
  assert.equal(matches[0].detail_url, 'https://www.chemicalbook.com/ProductChemicalPropertiesCB5114818_EN.htm');
  assert.equal(matches[1].cas_number, null);
  assert.equal(matches[1].molecular_formula, null);
});

test('ChemicalBook detail maps properties and paragraph summary', () => {
  const selected = parseDetail(DETAIL_HTML, parseSearch(SEARCH_HTML)[0]);
  assert.equal(selected.name, 'Acetylsalicylic acid');
  assert.equal(selected.source_label, 'ChemicalBook · Product chemical properties');
  assert.equal(selected.summary, 'This product is a white crystalline solid.');
  assert.deepEqual(selected.properties, [
    { label: 'Molecular formula', value: 'C9H8O4' },
    { label: 'Molecular weight', value: '180.16' },
    { label: 'Boiling point', value: '272.96°C (rough estimate)' },
  ]);
});

test('ChemicalBook empty page returns no matches', () => {
  assert.deepEqual(parseSearch('<html><body>No matches</body></html>'), []);
});
