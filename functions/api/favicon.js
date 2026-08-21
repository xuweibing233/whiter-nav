// functions/api/favicon.js
// 站点 favicon 上传与读取（单值覆盖式，存 R2，绑定名 NAV_IMG）
// POST /api/favicon            → 上传（认证 + CSRF），返回 { url }
// GET  /api/favicon            → 读取当前图标（公开）
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

const FAVICON_KEY = 'favicon/current';

// 读取当前 favicon
export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.NAV_IMG) {
    return errorResponse('R2 bucket not configured', 500);
  }

  try {
    const obj = await env.NAV_IMG.get(FAVICON_KEY);
    if (!obj) {
      return new Response('Not found', { status: 404 });
    }

    const contentType = obj.httpMetadata?.contentType || 'image/png';
    const buffer = await obj.arrayBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('Favicon read failed:', e);
    return errorResponse(`Failed to read: ${e.message}`, 500);
  }
}

// 上传 favicon（覆盖式：直接写入 favicon/current）
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  if (!env.NAV_IMG) {
    return errorResponse('R2 bucket not configured', 500);
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

    // 覆盖式写入 R2
    await env.NAV_IMG.put(FAVICON_KEY, buffer, {
      httpMetadata: { contentType: ALLOWED_TYPES.get(contentType) },
    });

    return jsonResponse({
      code: 201,
      data: {
        url: '/api/favicon',
        currentUrl: '/api/favicon',
        contentType: ALLOWED_TYPES.get(contentType),
        size: buffer.byteLength,
      },
      message: 'Favicon uploaded',
    }, 201);
  } catch (e) {
    console.error('Favicon upload failed:', e);
    return errorResponse(`Failed to upload: ${e.message}`, 500);
  }
}
