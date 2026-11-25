import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3100';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const step = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);

await page.goto(BASE, { waitUntil: 'networkidle' });
const user = `chem_${Date.now().toString().slice(-6)}`;
await page.click('[data-auth-tab="register"]');
await page.fill('#auth-username', user);
await page.fill('#auth-password', 'Chem12345!');
await page.fill('#auth-confirm', 'Chem12345!');
await page.click('#auth-submit');
await page.waitForFunction(() => document.querySelector('#auth-gate').classList.contains('hidden'));
await page.waitForFunction(() => (document.querySelector('#chart-sub')?.textContent || '').includes('运行'));
await page.waitForTimeout(500);

await page.click('.advanced summary');
await page.waitForTimeout(200);

const revOptions = await page.locator('#column-chemistry option').allInnerTexts();
step('reversed chemistry count', revOptions.length === 7, `${revOptions.length}: ${revOptions.join(', ')}`);
step('reversed chemistry includes C8', revOptions.some((t) => t.includes('C8')));

await page.selectOption('#column-chemistry', 'c8');
await page.waitForTimeout(500);
const summaryC8 = await page.locator('#column-summary').innerText();
step('summary reflects C8', summaryC8.includes('C8'), summaryC8);
const chartSub = await page.locator('#chart-sub').innerText();
step('simulation after C8 change', /运行|组分/.test(chartSub), chartSub);

await page.click('#seg-phase [data-value="normal"]');
await page.waitForTimeout(700);
const normOptions = await page.locator('#column-chemistry option').allInnerTexts();
step('normal chemistry count', normOptions.length === 3, `${normOptions.length}: ${normOptions.join(', ')}`);
step('normal chemistry excludes C18', !normOptions.some((t) => t.includes('C18') || t.includes('C8')));
step('normal chemistry includes Silica', normOptions.some((t) => t.includes('Silica')));

await page.selectOption('#column-chemistry', 'diol');
await page.waitForTimeout(500);
const summaryDiol = await page.locator('#column-summary').innerText();
step('normal summary reflects Diol', summaryDiol.includes('Diol'), summaryDiol);

await page.click('#seg-phase [data-value="reversed"]');
await page.waitForTimeout(700);
const revOptions2 = await page.locator('#column-chemistry option').allInnerTexts();
step('reversed chemistry restored after switch back', revOptions2.length === 7, `${revOptions2.length}`);
step('reversed reset to c18 after illegal value', await page.inputValue('#column-chemistry') === 'c18');

await page.click('#seg-phase [data-value="normal"]');
await page.waitForTimeout(500);
await page.selectOption('#column-preset', 'silica-150-46-5');
await page.waitForTimeout(500);
const presetChem = await page.inputValue('#column-chemistry');
step('column preset syncs chemistry', presetChem === 'silica', presetChem);

await page.screenshot({ path: '/workspace/chemistry-test.png', fullPage: false });
await browser.close();
console.log('chemistry test done');
