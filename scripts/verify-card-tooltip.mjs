// 验证：卡片悬浮浮层（描述+网址 / 仅网址）
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
const errors = [];
page.on('pageerror', e => errors.push(e.message));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(800);

  // 1. 有描述卡片（Node.js 中文网）：浮层显示描述 + 网址，有分隔线
  await page.locator('.site-card', { hasText: 'Node.js 中文网' }).hover();
  await page.waitForTimeout(400);
  const tooltipVisible = await page.locator('.site-card-tooltip.visible').count();
  const descText = await page.locator('.site-card-tooltip .tooltip-desc').textContent().catch(() => '');
  const urlText = await page.locator('.site-card-tooltip .tooltip-url').textContent().catch(() => '');
  const hasDivider = await page.locator('.site-card-tooltip .tooltip-divider').count();
  check('有描述：浮层显示', tooltipVisible === 1, `visible=${tooltipVisible}`);
  check('有描述：描述内容', descText.includes('Node.js 是一个基于'), descText.slice(0, 20));
  check('有描述：网址显示', urlText.includes('nodejs.cn'), urlText);
  check('有描述：分隔线存在', hasDivider === 1);

  // 2. 无描述卡片：只显示网址，无描述节点、无分隔线
  // 无描述站点在分类3，先切过去？直接查 IORI_SITES 找无描述站点并 hover 其 data-id 对应卡片
  const noDescId = await page.evaluate(() => {
    const s = (window.IORI_SITES || []).find(x => !(x.hasDesc));
    return s ? String(s.id) : '';
  });
  if (noDescId) {
    const card = page.locator(`.site-card[data-id="${noDescId}"]`);
    if (await card.count()) {
      await card.hover();
      await page.waitForTimeout(400);
      const descCount = await page.locator('.site-card-tooltip .tooltip-desc').count();
      const urlText2 = await page.locator('.site-card-tooltip .tooltip-url').textContent().catch(() => '');
      const dividerCount = await page.locator('.site-card-tooltip .tooltip-divider').count();
      check('无描述：无描述节点', descCount === 0, `desc=${descCount}`);
      check('无描述：仅网址', urlText2.length > 0, urlText2);
      check('无描述：无分隔线', dividerCount === 0);
    } else {
      check('无描述卡片在当前视图', false, '卡片不在当前分类视图');
    }
  } else {
    check('预览含无描述书签', false, '未找到');
  }

  // 3. 移到间隙：浮层隐藏
  await page.mouse.move(640, 640);
  await page.waitForTimeout(400);
  const leftover = await page.locator('.site-card-tooltip.visible').count();
  check('移到间隙浮层隐藏', leftover === 0);

  console.log('JS 错误:', errors.length ? errors.join('; ') : '无');
} catch (e) {
  check('验证异常', false, e.message);
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
process.exit(failed.length > 0 ? 1 : 0);