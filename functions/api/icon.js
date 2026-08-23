// functions/api/icon.js
// 站点图标代理：不使用 KV，改用 Cloudflare 边缘缓存（Cache API）+ 浏览器长缓存
// 1. 同一图标每个访客首访 → 查边缘缓存 → 未命中抓取一次外部源
// 2. 命中边缘缓存 → 直接返回，不读 KV、不再抓外部
// 3. 浏览器缓存 30 天（immutable），重复访客不再请求

const FAVICON_ENDPOINTS = (domain) => [
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  `https://www.faviconextractor.com/favicon/${domain}?larger=true`,
  `https://faviconsnap.com/api/favicon?url=${domain}`,
  `https://favicon.im/${domain}?larger=true`,
];

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
  const domain = extractDomain(url.searchParams.get('url'));

  if (!domain) return fallbackResponse();

  // Cache API 需要用规范化的请求 URL 作为 key
  const cacheKey = new Request(`${url.origin}${url.pathname}?url=${encodeURIComponent(domain)}`);

  // 1. 查边缘缓存（caches.default，Cloudflare 免费可用）
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

  // 2. 未命中：从外部源抓取（多个源依次尝试）
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

  // 3. 写入边缘缓存（异步，不阻塞响应）
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