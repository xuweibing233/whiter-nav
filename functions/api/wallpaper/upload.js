// functions/api/wallpaper/upload.js
// 上传本地壁纸：认证后接收图片文件，以二进制直接存入 KV（wallpaper_<uuid>）
// Content-Type 存入 KV metadata；读取用 getWithMetadata + arrayBuffer
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../../_middleware';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
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
      return errorResponse('Image too large (max 2MB)', 400);
    }
    if (buffer.byteLength === 0) {
      return errorResponse('Empty file', 400);
    }

    const id = crypto.randomUUID();
    const key = `wallpaper_${id}`;
    // 二进制直接存 KV，Content-Type 走 metadata，避免大图 base64 字符串导致的解码问题
    await env.NAV_AUTH.put(key, buffer, { metadata: { ct: contentType } });

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
