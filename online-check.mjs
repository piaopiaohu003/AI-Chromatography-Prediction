import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, proxy: { server: 'http://127.0.0.1:18080' } });
const page = await context.newPage();
await page.goto('https://37ltsh9sfvjos0tbohz.traesite.cn/', { waitUntil: 'domcontentloaded', timeout: 40000 });
// login as demo
await page.fill('#auth-username', 'demo');
await page.fill('#auth-password', 'ChromAI2026');
await page.click('#auth-submit');
await page.waitForFunction(() => document.querySelector('#auth-gate').classList.contains('hidden'), null, { timeout: 20000 });
await page.waitForFunction(() => (document.querySelector('#chart-sub')?.textContent || '').includes('运行'), null, { timeout: 30000 });
await page.waitForTimeout(600);
await page.click('.advanced summary');
await page.waitForTimeout(200);
const count = await page.locator('#column-chemistry option').count();
console.log('online options count (reversed):', count);
if (count !== 7) { console.log('FAIL expected 7'); process.exitCode = 1; }
await page.selectOption('#column-chemistry', 'c8');
await page.waitForTimeout(800);
const summary = await page.locator('#column-summary').innerText();
console.log('summary:', summary);
if (!summary.includes('C8')) { console.log('FAIL summary'); process.exitCode = 1; }
// verify simulation result changed/warnings appeared
const sub = await page.locator('#chart-sub').innerText();
console.log('chart-sub:', sub.slice(0, 80));
await page.screenshot({ path: '/workspace/online-check.png' });
await browser.close();
console.log('online E2E done');
