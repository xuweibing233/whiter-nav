// 验证：分类导航防 FOUC（初始隐藏 → 折叠后显示）
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

// 在文档开始就捕获导航的初始可见性（JS 执行前）
await page.addInitScript(() => {
  window.__navStates = [];
  const observer = new MutationObserver(() => {
    const nav = document.getElementById('horizontalCategoryNav');
    if (nav && window.__navStates.length < 50) {
      const cs = getComputedStyle(nav);
      const state = {
        pending: nav.classList.contains('nav-collapse-pending'),
        visible: cs.visibility,
        opacity: cs.opacity,
        rootBtns: nav.querySelectorAll(':scope > .menu-item-wrapper:not(#horizontalMoreWrapper)').length,
        moreHidden: document.getElementById('horizontalMoreWrapper')?.classList.contains('hidden'),
      };
      const last = window.__navStates[window.__navStates.length - 1];
      if (!last || JSON.stringify(last) !== JSON.stringify(state)) window.__navStates.push(state);
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.getElementById('horizontalCategoryNav') || document.body, { attributes: true, childList: true, subtree: true });
    // 立即记录一次
    const nav = document.getElementById('horizontalCategoryNav');
    if (nav) {
      window.__navStates.push({
        pending: nav.classList.contains('nav-collapse-pending'),
        initial: true,
        rootBtns: nav.querySelectorAll(':scope > .menu-item-wrapper:not(#horizontalMoreWrapper)').length,
      });
    }
  });
});

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1200);

  const states = await page.evaluate(() => window.__navStates || []);
  console.log('捕获的状态序列:');
  states.forEach((s, i) => console.log(`  [${i}] ${JSON.stringify(s)}`));

  // 初始状态：应有 pending（隐藏）
  const initial = states[0];
  check('初始带 pending（隐藏）', initial && initial.pending === true,
    initial ? `pending=${initial.pending}` : '未捕获');

  // 最终状态：pending 移除、可见
  const final = await page.evaluate(() => {
    const nav = document.getElementById('horizontalCategoryNav');
    return {
      pending: nav.classList.contains('nav-collapse-pending'),
      visibility: getComputedStyle(nav).visibility,
      rootBtns: nav.querySelectorAll(':scope > .menu-item-wrapper:not(#horizontalMoreWrapper)').length,
      moreVisible: !document.getElementById('horizontalMoreWrapper').classList.contains('hidden'),
      dropdownItems: document.getElementById('horizontalMoreDropdown').children.length,
    };
  });
  console.log('最终状态:', JSON.stringify(final));

  check('折叠完成后 pending 已移除', final.pending === false);
  check('导航最终可见', final.visibility === 'visible');

  // 10 个分类 > 7 → 应折叠为 7 + 更多，下拉里 3 个
  check('折叠为 7 个根按钮', final.rootBtns === 7, `rootBtns=${final.rootBtns}`);
  check('「更多」按钮出现', final.moreVisible === true);
  check('下拉含溢出分类', final.dropdownItems === 3, `dropdown=${final.dropdownItems}`);
} catch (e) {
  check('验证异常', false, e.message);
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
process.exit(failed.length > 0 ? 1 : 0);