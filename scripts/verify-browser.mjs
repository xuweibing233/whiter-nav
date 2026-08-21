// scripts/verify-browser.mjs
// 用 playwright-core + 系统 Chrome 验证本地预览页交互
// 用法: node scripts/verify-browser.mjs
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/xwbhs/AppData/Roaming/npm/node_modules/@playwright/cli/');
const { chromium } = require('playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4173/';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', msg => {
  if (msg.type() === 'error') console.log('  [console.error]', msg.text());
});
page.on('pageerror', err => console.log('  [pageerror]', err.message));

try {
  // 1. 页面加载
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  check('页面加载', true);

  // 2. 卡片渲染
  const cardCount = await page.locator('.site-card').count();
  check('卡片渲染', cardCount >= 6, `${cardCount} 张卡片`);

  // 3. 搜索引擎按钮（含 data-engine-url）
  const engines = await page.locator('.search-engine-option').allTextContents();
  check('搜索引擎按钮', engines.includes('Google') && engines.includes('站内'), engines.join(','));

  // 4. hover 浮层：鼠标移到第一张卡片
  await page.locator('.site-card').first().hover();
  await page.waitForTimeout(400);
  const tooltipVisible = await page.locator('.site-desc-tooltip.visible').count();
  const tooltipText = tooltipVisible ? await page.locator('.site-desc-tooltip .tooltip-desc').textContent() : '';
  check('hover 浮层显示', tooltipVisible === 1, tooltipText ? tooltipText.slice(0, 30) + '...' : '');

  // 5. 浮层跟随视口边界：移到右下角卡片（选有描述的卡片，Notion 有描述）
  const lastCard = page.locator('.site-card', { hasText: 'Notion' });
  await lastCard.hover({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(400);
  const box = await page.locator('.site-desc-tooltip.visible').boundingBox();
  check('浮层不溢出视口', box ? (box.x >= 0 && box.x + box.width <= 1280) : false, box ? `left=${Math.round(box.x)} right=${Math.round(box.x + box.width)}` : '无浮层');

  // 5a. 浮层显示期间，卡片内原生 title 应被抑制（避免名称+描述两个提示）
  const titleAttrOnHover = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.site-card:not(.hidden)')).find(c => c.textContent.includes('Notion'));
    const h3 = card?.querySelector('h3');
    return h3 ? h3.getAttribute('title') : 'no-h3';
  });
  check('hover 时原生 title 被抑制', titleAttrOnHover === null, `title=${titleAttrOnHover}`);

  // 5b. 移开卡片后，原生 title 应恢复
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  const titleAfterLeave = await page.evaluate(() => {
    const card = document.querySelector('.site-card');
    const h3 = card?.querySelector('h3');
    return h3 ? h3.getAttribute('title') : 'no-h3';
  });
  check('移开后原生 title 恢复', titleAfterLeave !== null, `title=${titleAfterLeave}`);

  // 5c. 从有描述卡片移到无描述卡片：浮层应隐藏（bug 回归测试）
  await page.locator('.site-card').first().hover();
  await page.waitForTimeout(300);
  const tooltipBefore = await page.locator('.site-desc-tooltip.visible').count();
  const noDescCard = page.locator('.site-card', { hasText: '无描述站点' });
  await noDescCard.hover();
  await page.waitForTimeout(300);
  const tooltipAfter = await page.locator('.site-desc-tooltip.visible').count();
  check('移到无描述卡片浮层隐藏', tooltipBefore === 1 && tooltipAfter === 0, `before=${tooltipBefore} after=${tooltipAfter}`);

  // 6. / 快捷键聚焦搜索框（选可见的输入框）
  await page.keyboard.press('/');
  await page.waitForTimeout(200);
  const focused = await page.evaluate(() => document.activeElement?.classList?.contains('search-input-target'));
  check('/ 快捷键聚焦搜索', focused === true);

  // 7. 站内搜索过滤 + 关键词高亮（可见输入框）
  const searchInput = page.locator('.search-input-target:visible').first();
  await searchInput.fill('figma');
  await page.waitForTimeout(600);
  const visibleCards = await page.locator('.site-card:not(.hidden)').count();
  const markCount = await page.locator('.site-card:not(.hidden) mark').count();
  check('搜索过滤', visibleCards >= 1 && visibleCards < cardCount, `${visibleCards} 可见`);
  check('关键词高亮', markCount >= 1, `${markCount} 处高亮`);

  // 8. 无结果空状态
  await searchInput.fill('zzzzzz不存在');
  await page.waitForTimeout(600);
  const emptyState = await page.locator('.search-empty-state').count();
  check('无结果空状态', emptyState === 1);

  // 9. 清空搜索恢复
  await searchInput.fill('');
  await page.waitForTimeout(600);
  const restored = await page.locator('.site-card:not(.hidden)').count();
  check('清空恢复', restored === cardCount, `${restored} 张`);

  // 10. 投稿表单 URL 自动补全 + 校验
  await page.locator('#addSiteBtnFloating').click();
  await page.waitForTimeout(300);
  // 静态预览没有 /api/categories，直接注入一个选项模拟分类已加载
  await page.evaluate(() => {
    const select = document.getElementById('addSiteCatelog');
    if (select) {
      select.innerHTML = '<option value="" disabled>请选择一个分类</option><option value="1">开发工具</option>';
    }
  });
  await page.locator('#addSiteName').fill('测试站点');
  await page.locator('#addSiteCatelog').selectOption('1');
  await page.locator('#addSiteUrl').fill('example.com');
  await page.locator('#addSiteUrl').blur();
  const urlValue = await page.locator('#addSiteUrl').inputValue();
  check('URL 自动补全 https://', urlValue === 'https://example.com', urlValue);

  // 11. 非法 URL 阻止提交（分类已选，绕过原生 required 拦截，验证前端校验）
  await page.locator('#addSiteUrl').fill('not a url');
  await page.locator('#addSiteUrl').blur();
  await page.locator('#addSiteForm button[type="submit"]').click();
  await page.waitForTimeout(300);
  const msg = await page.locator('#addSiteMessage').textContent().catch(() => '');
  check('非法 URL 校验提示', !!msg, msg?.trim()?.slice(0, 30));

  // 12. 页面截图存档
  await page.screenshot({ path: 'C:/Users/xwbhs/Documents/DeepSeek/whiter-nav/.local-preview/verify-screenshot.png', fullPage: false });
  check('截图存档', true);

} catch (e) {
  check('验证异常', false, e.message);
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
process.exit(failed.length > 0 ? 1 : 0);
