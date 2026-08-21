// functions/api/wallpaper/file.js
// 读取已上传的本地壁纸图片（公开访问）
// value 格式：{ data: base64, ct: contentType, at: timestamp }
import { errorResponse } from '../../_middleware';

const WALLPAPER_PREFIX = 'wallpaper_';

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();

  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return errorResponse('Invalid id', 400);
  }

  try {
    const key = `${WALLPAPER_PREFIX}${id}`;
    // 用 text 读取再自行 parse，避免 KV type:'json' 在大 value 或异常数据时抛错
    const text = await env.NAV_AUTH.get(key, { type: 'text' });
    if (!text) {
      return new Response('Not found', { status: 404 });
    }

    let payload;
    let buffer;
    try {
      payload = JSON.parse(text);
      if (!payload || !payload.data) {
        return new Response('Not found', { status: 404 });
      }
      buffer = base64ToArrayBuffer(payload.data);
    } catch (e) {
      // base64 损坏或 JSON 非法：明确返回 500，避免前端破图但无法定位
      console.error('Wallpaper payload decode failed:', e);
      return new Response('Corrupted wallpaper data', { status: 500 });
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': payload.ct || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('Wallpaper file read failed:', e);
    return errorResponse(`Failed to read: ${e.message}`, 500);
  }
}
