// functions/api/wallpaper/upload.js
// 上传本地壁纸到 R2 存储桶（绑定名 NAV_IMG），原生二进制存储
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../../_middleware';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'image/jpeg'],
  ['image/png', 'image/png'],
  ['image/webp', 'image/webp'],
  ['image/gif', 'image/gif'],
]);

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  // R2 绑定必须存在
  if (!env.NAV_IMG) {
    return errorResponse('R2 bucket not configured (bind NAV_IMG)', 500);
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return errorResponse('No file uploaded', 400);
    }

    const contentType = String(file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return errorResponse('Unsupported image type (use JPEG/PNG/WebP/GIF)', 400);
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) {
      return errorResponse('Image too large (max 5MB)', 400);
    }
    if (buffer.byteLength === 0) {
      return errorResponse('Empty file', 400);
    }

    const id = crypto.randomUUID();
    const key = `wallpaper/${id}`;
    // R2 原生二进制存储，Content-Type 存 httpMetadata
    await env.NAV_IMG.put(key, buffer, {
      httpMetadata: { contentType },
    });

    return jsonResponse({
      code: 201,
      data: {
        id,
        url: `/api/wallpaper/file?id=${id}`,
        contentType,
        size: buffer.byteLength,
      },
      message: 'Wallpaper uploaded',
    }, 201);
  } catch (e) {
    console.error('Wallpaper upload failed:', e);
    return errorResponse(`Failed to upload: ${e.message}`, 500);
  }
}
