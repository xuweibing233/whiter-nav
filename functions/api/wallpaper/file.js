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
    const raw = await env.NAV_AUTH.get(key, { type: 'json' });
    if (!raw || !raw.data) {
      return new Response('Not found', { status: 404 });
    }

    return new Response(base64ToArrayBuffer(raw.data), {
      headers: {
        'Content-Type': raw.ct || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('Wallpaper file read failed:', e);
    return errorResponse(`Failed to read: ${e.message}`, 500);
  }
}
