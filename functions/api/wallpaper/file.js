// functions/api/wallpaper/file.js
// 读取已上传的本地壁纸图片（公开访问）
// 新格式：KV 存二进制 ArrayBuffer，Content-Type 存 metadata
// 旧格式兼容：KV 存 { data: base64, ct, at } JSON
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

    // 用 getWithMetadata：新格式二进制有 metadata；旧格式 JSON 无 metadata
    let result = null;
    try {
      result = await env.NAV_AUTH.getWithMetadata(key);
    } catch (e) {
      result = null;
    }

    if (result && result.value !== null && result.metadata) {
      // 新格式：二进制 + metadata
      return new Response(result.value, {
        headers: {
          'Content-Type': result.metadata.ct || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (result && result.value !== null && !result.metadata) {
      // 无 metadata：旧格式（base64 JSON）或异常数据
      const text = typeof result.value === 'string' ? result.value : null;
      if (text) {
        try {
          const payload = JSON.parse(text);
          if (payload && payload.data) {
            return new Response(base64ToArrayBuffer(payload.data), {
              headers: {
                'Content-Type': payload.ct || 'image/jpeg',
                'Cache-Control': 'public, max-age=86400, immutable',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        } catch (e) {
          console.error('Wallpaper legacy decode failed:', e);
          return new Response('Corrupted wallpaper data', { status: 500 });
        }
      }
    }

    return new Response('Not found', { status: 404 });
  } catch (e) {
    console.error('Wallpaper file read failed:', e);
    return errorResponse(`Failed to read: ${e.message}`, 500);
  }
}
