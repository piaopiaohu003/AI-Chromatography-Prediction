import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, proxy: { server: 'http://127.0.0.1:18080' } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGE ' + e.message));

// test 1: wrong creds
await page.goto('https://37ltsh9sfvjos0tbohz.traesite.cn/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(500);
await page.fill('#auth-username', 'demo');
await page.fill('#auth-password', 'WRONGPASSWORD');
await page.click('#auth-submit');
await page.waitForTimeout(1500);
const err1 = await page.locator('#auth-error').innerText().catch(() => '<empty>');
console.log('wrong-creds error text:', JSON.stringify(err1));

// test 2: right creds
await page.fill('#auth-username', 'demo');
await page.fill('#auth-password', 'ChromAI2026');
await page.click('#auth-submit');
await page.waitForFunction(() => document.querySelector('#auth-gate').classList.contains('hidden'), null, { timeout: 20000 });
await page.waitForFunction(() => (document.querySelector('#chart-sub')?.textContent || '').includes('运行'), null, { timeout: 30000 });
const uname = await page.locator('#user-name').innerText();
console.log('logged in as:', uname);
console.log('console errors:', errors.slice(0, 6));
await page.screenshot({ path: '/workspace/online-login.png' });
await browser.close();
