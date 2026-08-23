// 线上最终验证：部分词搜索跨分类书签 + 全站提示
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/xwbhs/AppData/Roaming/npm/node_modules/@playwright/cli/');
const { chromium } = require('playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://nav.666y.cc.cd/';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  // 默认分类卡片数
  const initCards = await page.locator('.site-card').count();
  check('默认分类渲染', initCards > 0 && initCards < 259, `卡片=${initCards}`);

  // 部分词搜索：Chat（应命中 ChatGPT）
  const input = page.locator('.search-input-target').filter({ visible: true }).first();
  await input.fill('Chat');
  await page.waitForTimeout(1200);
  const chatHit = await page.locator('.site-card:not(.hidden)').count();
  const chatgptVisible = await page.locator('.site-card:not(.hidden)', { hasText: 'ChatGPT' }).count();
  check('部分词搜 Chat 命中', chatHit >= 1 && chatgptVisible >= 1, `可见=${chatHit}, ChatGPT=${chatgptVisible}`);

  // 全站提示（以文本为准；headless 下 isVisible 偶发不准）
  const hintText = await page.locator('#searchScopeHint').textContent().catch(() => '');
  check('全站搜索提示', hintText.includes('全部') && hintText.includes('259'), hintText || '无');

  // 中文部分词：搜「公益」（公益 API 导航）
  await input.fill('公益');
  await page.waitForTimeout(1200);
  const gyHit = await page.locator('.site-card:not(.hidden)', { hasText: '公益 API 导航' }).count();
  check('中文部分词搜「公益」', gyHit >= 1, `命中=${gyHit}`);

  // 清空恢复
  await input.fill('');
  await page.waitForTimeout(1000);
  const afterClear = await page.locator('.site-card').count();
  check('清空恢复默认分类', afterClear === initCards, `恢复=${afterClear}`);
} catch (e) {
  check('验证异常', false, e.message);
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
process.exit(failed.length > 0 ? 1 : 0);