// functions/api/wallpaper/file.js
// 读取已上传的本地壁纸图片（公开访问，按 KV 存的内容类型返回）
import { errorResponse } from '../../_middleware';

const WALLPAPER_PREFIX = 'wallpaper_';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();

  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return errorResponse('Invalid id', 400);
  }

  try {
    const key = `${WALLPAPER_PREFIX}${id}`;
    const value = await env.NAV_AUTH.get(key, { type: 'arrayBuffer' });
    if (!value) {
      return new Response('Not found', { status: 404 });
    }

    const meta = await env.NAV_AUTH.getWithMetadata(key);
    const contentType = meta?.metadata?.contentType || 'image/jpeg';

    return new Response(value, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('Wallpaper file read failed:', e);
    return errorResponse(`Failed to read: ${e.message}`, 500);
  }
}
