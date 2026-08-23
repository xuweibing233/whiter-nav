// 验证：默认分类下搜索覆盖全站（修复「隐藏全部 tab 后搜索只搜当前分类」）
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/xwbhs/AppData/Roaming/npm/node_modules/@playwright/cli/');
const { chromium } = require('playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4173/';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(800);

  // 1. 默认分类=1（工具）：「全部」tab 应隐藏
  const allTabCount = await page.locator('a[href="?catalog=all"]').count();
  check('「全部」tab 已隐藏', allTabCount === 0, `all tab 数量=${allTabCount}`);

  // 2. 首页只渲染工具分类（3 条：Node.js/React/Vue），设计/效率的书签不渲染
  const cardCount = await page.locator('.site-card').count();
  check('默认分类渲染', cardCount === 3, `卡片数=${cardCount}（期望工具分类 3 条）`);

  // 3. 站内搜索「Notion」——它在「效率办公」分类，不在当前默认分类
  const searchInput = page.locator('.search-input-target:visible').first();
  await searchInput.fill('Notion');
  await page.waitForTimeout(700);

  const visibleAfterSearch = await page.locator('.site-card:not(.hidden)').count();
  const notionVisible = await page.locator('.site-card:not(.hidden)', { hasText: 'Notion' }).count();
  check('搜索跨分类命中 Notion', visibleAfterSearch >= 1 && notionVisible === 1,
    `可见卡片=${visibleAfterSearch}, Notion=${notionVisible}`);

  // 4. 搜索提示显示全站范围（预览 mock 共 7 个书签）
  const hint = await page.locator('#searchScopeHint').textContent().catch(() => '');
  const hintVisible = await page.locator('#searchScopeHint').isVisible().catch(() => false);
  check('全站搜索提示显示', hintVisible && hint.includes('7'), hint || '提示未显示');

  // 5. 清空搜索 → 恢复默认分类视图（工具 3 条）+ 提示隐藏
  await searchInput.fill('');
  await page.waitForTimeout(700);
  const cardCountAfterClear = await page.locator('.site-card').count();
  const hintHidden = !(await page.locator('#searchScopeHint').isVisible().catch(() => true));
  check('清空后恢复默认分类', cardCountAfterClear === 3 && hintHidden, `卡片=${cardCountAfterClear}, 提示隐藏=${hintHidden}`);

  // 6. 搜索「Vue」（当前分类内的）仍正常
  await searchInput.fill('Vue');
  await page.waitForTimeout(700);
  const vueVisible = await page.locator('.site-card:not(.hidden)', { hasText: 'Vue' }).count();
  check('搜索当前分类内书签', vueVisible === 1, `Vue=${vueVisible}`);
} catch (e) {
  check('验证异常', false, e.message);
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
process.exit(failed.length > 0 ? 1 : 0);