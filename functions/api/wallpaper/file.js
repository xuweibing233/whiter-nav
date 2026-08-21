// functions/api/wallpaper/file.js
// 从 R2 读取壁纸图片（公开访问），原生二进制 + Content-Type
import { errorResponse } from '../../_middleware';

const WALLPAPER_PREFIX = 'wallpaper/';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();

  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return errorResponse('Invalid id', 400);
  }

  if (!env.NAV_IMG) {
    return errorResponse('R2 bucket not configured', 500);
  }

  try {
    const key = `${WALLPAPER_PREFIX}${id}`;
    const obj = await env.NAV_IMG.get(key);
    if (!obj) {
      return new Response('Not found', { status: 404 });
    }

    const contentType = obj.httpMetadata?.contentType || 'image/jpeg';
    const buffer = await obj.arrayBuffer();

    return new Response(buffer, {
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
