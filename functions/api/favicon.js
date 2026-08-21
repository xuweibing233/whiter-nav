// functions/api/favicon.js
// 站点 favicon 上传与读取（单值覆盖式：新上传替换旧图标）
// POST /api/favicon            → 上传（认证 + CSRF），返回 { url }
// GET  /api/favicon            → 读取当前图标（公开）
// DELETE /api/favicon?id=<id>  → 删除指定图标
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../_middleware';

const MAX_SIZE = 512 * 1024; // favicon 512KB 足够
const ALLOWED_TYPES = new Map([
  ['image/svg+xml', 'image/svg+xml'],
  ['image/png', 'image/png'],
  ['image/x-icon', 'image/x-icon'],
  ['image/vnd.microsoft.icon', 'image/x-icon'],
  ['image/jpeg', 'image/jpeg'],
  ['image/webp', 'image/webp'],
]);

const FAVICON_PREFIX = 'site_favicon_';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// 读取当前/指定 favicon
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  const key = id && /^[a-zA-Z0-9-]+$/.test(id)
    ? `${FAVICON_PREFIX}${id}`
    : `${FAVICON_PREFIX}current`;

  try {
    const raw = await env.NAV_AUTH.get(key, { type: 'json' });
    if (!raw || !raw.data) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(base64ToArrayBuffer(raw.data), {
      headers: {
        'Content-Type': raw.ct || 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('Favicon read failed:', e);
    return errorResponse(`Failed to read: ${e.message}`, 500);
  }
}

// 上传 favicon（覆盖式：写入 current + 新 id 两个 key，旧的 current 之前 id 会被列表清理）
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return errorResponse('No file uploaded', 400);
    }

    const contentType = String(file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return errorResponse('Unsupported icon type (use SVG/PNG/ICO/JPEG/WebP)', 400);
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) {
      return errorResponse('Icon too large (max 512KB)', 400);
    }
    if (buffer.byteLength === 0) {
      return errorResponse('Empty file', 400);
    }

    const id = crypto.randomUUID();
    const payload = JSON.stringify({
      data: arrayBufferToBase64(buffer),
      ct: ALLOWED_TYPES.get(contentType),
      at: Date.now(),
    });

    // 写入新 id + current（current 供 SSR/首页读取）
    await env.NAV_AUTH.put(`${FAVICON_PREFIX}${id}`, payload);
    await env.NAV_AUTH.put(`${FAVICON_PREFIX}current`, payload);

    // 返回站内相对路径（favicon 设置已支持相对路径）
    return jsonResponse({
      code: 201,
      data: {
        id,
        url: `/api/favicon?id=${id}`,
        currentUrl: '/api/favicon',
        contentType,
        size: buffer.byteLength,
      },
      message: 'Favicon uploaded',
    }, 201);
  } catch (e) {
    console.error('Favicon upload failed:', e);
    return errorResponse(`Failed to upload: ${e.message}`, 500);
  }
}

// 删除 favicon
export async function onRequestDelete(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();

    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
      return errorResponse('Invalid id', 400);
    }

    const key = `${FAVICON_PREFIX}${id}`;
    const exists = await env.NAV_AUTH.get(key);
    if (!exists) {
      return errorResponse('Favicon not found', 404);
    }

    await env.NAV_AUTH.delete(key);
    return jsonResponse({ code: 200, message: 'Favicon deleted' });
  } catch (e) {
    console.error('Favicon delete failed:', e);
    return errorResponse(`Failed to delete: ${e.message}`, 500);
  }
}
