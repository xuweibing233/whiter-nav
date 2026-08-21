// functions/api/icon.js
// 站点图标本地代理 + KV 缓存：
// 1. 浏览器只请求本域 /api/icon?url=<domain>，不再直连外部 favicon API
// 2. 第一次请求时从多个外部图标源抓取，成功后写入 KV（TTL 7 天）
// 3. 后续请求全部命中 KV 缓存，不再消耗外部请求

const FAVICON_ENDPOINTS = (domain) => [
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  `https://www.faviconextractor.com/favicon/${domain}?larger=true`,
  `https://faviconsnap.com/api/favicon?url=${domain}`,
  `https://favicon.im/${domain}?larger=true`,
];

const MIN_IMAGE_SIZE = 100;
const ICON_CACHE_TTL = 7 * 24 * 60 * 60; // 7 天（秒）
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

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function iconResponse(buffer, contentType, { fromCache = false } = {}) {
  return new Response(buffer, {
    headers: {
      'Content-Type': contentType || 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Icon-Cache': fromCache ? 'HIT' : 'MISS',
    },
  });
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
  const { request, env } = context;
  const url = new URL(request.url);
  const domain = extractDomain(url.searchParams.get('url'));

  if (!domain) return fallbackResponse();

  const cacheKey = `icon_${domain}`;

  // 1. 尝试读取 KV 缓存
  try {
    const cached = await env.NAV_AUTH.get(cacheKey, { type: 'json' });
    if (cached && cached.data) {
      return iconResponse(base64ToArrayBuffer(cached.data), cached.ct, { fromCache: true });
    }
  } catch (e) {
    console.warn('Icon cache read failed:', e);
  }

  // 2. 未命中：从外部源抓取（多个源依次尝试）
  const userAgent = 'Mozilla/5.0 (compatible; MyNavigator/1.0)';
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

      // 3. 写入 KV 缓存（base64 + 类型）
      try {
        await env.NAV_AUTH.put(cacheKey, JSON.stringify({
          data: arrayBufferToBase64(buffer),
          ct: contentType,
          at: Date.now(),
        }), { expirationTtl: ICON_CACHE_TTL });
      } catch (e) {
        console.warn('Icon cache write failed:', e);
      }

      return iconResponse(buffer, contentType);
    } catch (e) {
      console.warn(`Failed to fetch icon from ${targetUrl}:`, e);
    }
  }

  // 4. 全部失败：返回内置占位图，避免前端破图
  return fallbackResponse();
}
