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

  // 4. 卡片级原生 tooltip：有描述的卡片 title = 完整描述（替代自定义浮层）
  const descTitle = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.site-card:not(.hidden)')).find(c => c.textContent.includes('Node.js 中文网'));
    return card ? card.getAttribute('title') : '';
  });
  check('有描述卡片 title=描述', descTitle.includes('Chrome V8'), descTitle ? descTitle.slice(0, 30) + '...' : '空');

  // 4a. 无描述卡片 title = 名称
  const nameTitle = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.site-card:not(.hidden)')).find(c => c.textContent.includes('无描述站点'));
    return card ? card.getAttribute('title') : '';
  });
  check('无描述卡片 title=名称', nameTitle === '无描述站点', nameTitle);

  // 4b. 内部元素不再挂独立 title（避免多个提示抢焦点）
  const innerTitles = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.site-card:not(.hidden)')).find(c => c.textContent.includes('Node.js 中文网'));
    return card ? card.querySelectorAll('[title]').length : -1;
  });
  check('卡片内无多余 title', innerTitles === 0, `inner titles=${innerTitles}`);

  // 5. 移开鼠标（失焦）后 tooltip 立即隐藏 —— 原生 title 由浏览器管理，
  //    这里验证 hover 后移开不残留自定义元素（.site-desc-tooltip 已彻底移除）
  await page.locator('.site-card').first().hover();
  await page.waitForTimeout(200);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  const leftoverTooltip = await page.locator('.site-desc-tooltip').count();
  check('无自定义浮层残留', leftoverTooltip === 0, `leftover=${leftoverTooltip}`);

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
