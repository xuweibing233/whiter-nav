// functions/api/icon.js
// 站点图标代理：不使用 KV，改用 Cloudflare 边缘缓存（Cache API）+ 浏览器长缓存
// 1. 同一图标每个访客首访 → 查边缘缓存 → 未命中抓取一次外部源
// 2. 命中边缘缓存 → 直接返回，不读 KV、不再抓外部
// 3. 浏览器缓存 30 天（immutable），重复访客不再请求
//
// 两种模式（由 url 参数形态自动判断）：
//   /api/icon?url=<domain>                → 域名模式：从 favicon 服务抓该站点图标
//   /api/icon?url=<完整图片URL>            → 直链模式：白名单域名（raw.githubusercontent.com）的图片原样代理

const FAVICON_ENDPOINTS = (domain) => [
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  `https://www.faviconextractor.com/favicon/${domain}?larger=true`,
  `https://faviconsnap.com/api/favicon?url=${domain}`,
  `https://favicon.im/${domain}?larger=true`,
];

// 直链模式白名单：只允许代理这些域名下的图片，防 SSRF
const PROXY_ALLOWED_HOSTS = new Set([
  'raw.githubusercontent.com',
]);

const MIN_IMAGE_SIZE = 100;
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="#e2e8f0"/><circle cx="20" cy="15" r="5" fill="#94a3b8"/><path d="M10 32a10 10 0 0 1 20 0z" fill="#94a3b8"/></svg>`;

function extractDomain(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';
  try {
    if (!/^https?:\/\//i.test(value)) value = 'http://' + value;
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function fallbackResponse() {
  return new Response(FALLBACK_SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const urlParam = (url.searchParams.get('url') || '').trim();

  if (!urlParam) return fallbackResponse();

  // === 直链模式：url 参数是完整 http(s) 图片 URL ===
  if (/^https?:\/\//i.test(urlParam)) {
    return handleDirectProxy(context, url, urlParam);
  }

  // === 域名模式：从 favicon 服务抓取 ===
  const domain = extractDomain(urlParam);
  if (!domain) return fallbackResponse();

  const cacheKey = new Request(`${url.origin}${url.pathname}?url=${encodeURIComponent(domain)}`);

  // 查边缘缓存
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: {
          'Content-Type': cached.headers.get('Content-Type') || 'image/png',
          'Cache-Control': 'public, max-age=2592000, immutable',
          'Access-Control-Allow-Origin': '*',
          'X-Icon-Cache': 'HIT',
        },
      });
    }
  } catch (e) {
    console.warn('Icon cache read failed:', e);
  }

  // 未命中：从外部源抓取（多个源依次尝试）
  const userAgent = 'Mozilla/5.0 (compatible; MyNavigator/1.0)';
  let iconBuffer = null;
  let iconType = 'image/png';

  for (const targetUrl of FAVICON_ENDPOINTS(domain)) {
    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': userAgent },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('image')) continue;

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > 0 && contentLength < MIN_IMAGE_SIZE) continue;

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < MIN_IMAGE_SIZE) continue;

      iconBuffer = buffer;
      iconType = contentType;
      break;
    } catch (e) {
      console.warn(`Failed to fetch icon from ${targetUrl}:`, e);
    }
  }

  if (!iconBuffer) {
    return fallbackResponse();
  }

  const finalResponse = new Response(iconBuffer, {
    headers: {
      'Content-Type': iconType,
      'Cache-Control': 'public, max-age=2592000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Icon-Cache': 'MISS',
    },
  });

  try {
    const cache = caches.default;
    context.waitUntil(cache.put(cacheKey, finalResponse.clone()));
  } catch (e) {
    console.warn('Icon cache write failed:', e);
  }

  return finalResponse;
}

// === 直链代理：白名单域名内的图片直接抓取并缓存 ===
async function handleDirectProxy(context, requestUrl, rawTarget) {
  let targetUrl = rawTarget;

  // 白名单校验（防 SSRF）
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return fallbackResponse();
  }
  if (!PROXY_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return fallbackResponse();
  }
  if (parsed.protocol !== 'https:') {
    return fallbackResponse();
  }

  // GitHub raw 分支兜底：分支名 main 不存在时尝试 master（很多仓库默认分支是 master）
  const branchFallbacks = [];
  const m = /^\/[^/]+\/[^/]+\/([^/]+)\//.exec(parsed.pathname);
  if (m && (m[1] === 'main' || m[1] === 'master')) {
    const other = m[1] === 'main' ? 'master' : 'main';
    branchFallbacks.push(targetUrl.replace(/\/(main|master)\//, `/${other}/`));
  }

  const cacheKey = new Request(`${requestUrl.origin}${requestUrl.pathname}?url=${encodeURIComponent(targetUrl)}`);

  // 查边缘缓存
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: {
          'Content-Type': cached.headers.get('Content-Type') || 'image/png',
          'Cache-Control': 'public, max-age=2592000, immutable',
          'Access-Control-Allow-Origin': '*',
          'X-Icon-Cache': 'HIT',
        },
      });
    }
  } catch (e) {
    console.warn('Icon proxy cache read failed:', e);
  }

  // 未命中：抓取（含分支兜底）
  const userAgent = 'Mozilla/5.0 (compatible; MyNavigator/1.0)';
  let iconBuffer = null;
  let iconType = 'image/png';

  for (const candidate of [targetUrl, ...branchFallbacks]) {
    try {
      const response = await fetch(candidate, {
        headers: { 'User-Agent': userAgent },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('image')) continue;

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > 0 && contentLength < MIN_IMAGE_SIZE) continue;

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < MIN_IMAGE_SIZE) continue;

      iconBuffer = buffer;
      iconType = contentType;
      break;
    } catch (e) {
      console.warn(`Failed to fetch proxy image ${candidate}:`, e);
    }
  }

  if (!iconBuffer) {
    return fallbackResponse();
  }

  const finalResponse = new Response(iconBuffer, {
    headers: {
      'Content-Type': iconType,
      'Cache-Control': 'public, max-age=2592000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Icon-Cache': 'MISS',
    },
  });

  try {
    const cache = caches.default;
    context.waitUntil(cache.put(cacheKey, finalResponse.clone()));
  } catch (e) {
    console.warn('Icon proxy cache write failed:', e);
  }

  return finalResponse;
}