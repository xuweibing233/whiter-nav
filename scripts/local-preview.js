// scripts/local-preview.js
// 本地验证辅助：mock env 完整跑首页 SSR，生成可静态预览的页面
// 用法: node scripts/local-preview.js
// 输出: .local-preview/index.html + 复制的 public 静态资源

import { readFileSync, writeFileSync, cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { onRequest } from '../functions/index.js';

const ROOT = resolve('.');
const OUT = resolve('.local-preview');
const templateHtml = readFileSync(resolve('public/index.html'), 'utf8');

// 可从环境变量注入更多设置（分号分隔 key=value 列表；JSON 值含逗号，故用分号分隔）
const extraSettings = (process.env.PREVIEW_SETTINGS || '')
  .split(';')
  .filter(Boolean)
  .map(part => {
    const [key, ...rest] = part.split('=');
    return { key: key.trim(), value: rest.join('=').trim() };
  });

function createStatement(sql, settingsRows) {
  return {
    bind() { return createStatement(sql, settingsRows); },
    async all() {
      if (sql.includes('FROM category')) {
        return {
          results: [
            { id: 1, catelog: '开发工具', sort_order: 1, parent_id: 0 },
            { id: 2, catelog: '设计资源', sort_order: 2, parent_id: 0 },
            { id: 3, catelog: '效率办公', sort_order: 3, parent_id: 0 },
            { id: 4, catelog: 'AI 工具', sort_order: 4, parent_id: 0 },
            { id: 5, catelog: '影视娱乐', sort_order: 5, parent_id: 0 },
            { id: 6, catelog: '学习教程', sort_order: 6, parent_id: 0 },
            { id: 7, catelog: '云存储', sort_order: 7, parent_id: 0 },
            { id: 8, catelog: '社交通讯', sort_order: 8, parent_id: 0 },
            { id: 9, catelog: '购物比价', sort_order: 9, parent_id: 0 },
            { id: 10, catelog: '新闻资讯', sort_order: 10, parent_id: 0 },
          ],
        };
      }
      if (sql.includes('FROM settings')) {
        return { results: settingsRows };
      }
      if (sql.includes('FROM sites')) {
        return {
          results: [
            { id: 1, name: 'Node.js 中文网', url: 'https://nodejs.cn', logo: '', desc: 'Node.js 是一个基于 Chrome V8 引擎的 JavaScript 运行时环境，采用事件驱动、非阻塞 I/O 模型，使其轻量又高效。Node.js 的包管理器 npm 是全球最大的开源库生态系统，拥有超过百万个可复用的包。适用于服务端开发、命令行工具、Web 应用等场景。', catelog_id: 1, catelog_name: '开发工具' },
            { id: 2, name: 'React 官方文档', url: 'https://react.dev', logo: '', desc: 'React 是一个用于构建用户界面的 JavaScript 库，由 Facebook 开发和维护。采用声明式编程范式，组件化开发，虚拟 DOM 机制。支持服务端渲染（Next.js）、移动端（React Native）、桌面端（Electron）等多种平台。', catelog_id: 1, catelog_name: '开发工具' },
            { id: 3, name: 'Vue.js 3 指南', url: 'https://vuejs.org', logo: '', desc: 'Vue.js 是一个渐进式 JavaScript 框架，用于构建用户界面。Vue 3 采用 Composition API 和 TypeScript 支持，性能相比 Vue 2 提升 2-3 倍。', catelog_id: 1, catelog_name: '开发工具' },
            { id: 4, name: 'Dribbble', url: 'https://dribbble.com', logo: '', desc: '全球设计师展示和发现创意作品的设计社区，涵盖 UI/UX、插画、品牌设计等领域。', catelog_id: 2, catelog_name: '设计资源' },
            { id: 5, name: 'Figma', url: 'https://www.figma.com', logo: '', desc: '基于浏览器的协作式界面设计工具，支持实时协作、原型制作、设计系统管理，是团队设计工作流的核心工具。', catelog_id: 2, catelog_name: '设计资源' },
            { id: 6, name: 'Notion', url: 'https://www.notion.so', logo: '', desc: '集笔记、文档、知识库、项目管理于一体的协作平台，支持数据库视图、模板和团队协作。', catelog_id: 3, catelog_name: '效率办公' },
            { id: 7, name: '无描述站点', url: 'https://example.org', logo: '', desc: '', catelog_id: 1, catelog_name: '开发工具' },
          ],
        };
      }
      return { results: [] };
    },
  };
}

async function renderHome(settingsRows = [], envOverrides = {}) {
  const response = await onRequest({
    request: new Request('https://preview.local/?render-preview=1'),
    env: {
      ASSETS: {
        async fetch() { return new Response(templateHtml); },
      },
      NAV_AUTH: {
        async get() { return null; },
        async put() {},
        async delete() {},
      },
      NAV_DB: {
        prepare(sql) { return createStatement(sql, settingsRows); },
      },
      SITE_NAME: '本地预览',
      SITE_DESCRIPTION: 'whiter-nav 本地验证预览',
      FOOTER_TEXT: '本地验证',
      ENABLE_PUBLIC_SUBMISSION: 'true',
      ...envOverrides,
    },
    waitUntil() {},
  });

  if (response.status !== 200) {
    throw new Error(`SSR failed: ${response.status} ${await response.text()}`);
  }
  return response.text();
}

// 复制 public 静态资源（排除 index.html，避免覆盖生成的页面）
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(resolve('public'), OUT, {
  recursive: true,
  filter: (src) => !src.endsWith('index.html'),
});

const html = await renderHome(extraSettings);
writeFileSync(resolve(OUT, 'index.html'), html, 'utf8');
console.log(`Preview written to ${OUT} (${html.length} bytes, settings: ${extraSettings.length} rows)`);
