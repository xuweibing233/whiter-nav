// functions/api/wallpaper/delete.js
// 从 R2 删除本地壁纸（认证后可用）
import { isAdminAuthenticated, errorResponse, jsonResponse, markHomeCacheDirty } from '../../_middleware';

const WALLPAPER_PREFIX = 'wallpaper/';

export async function onRequestDelete(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  if (!env.NAV_IMG) {
    return errorResponse('R2 bucket not configured', 500);
  }

  try {
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();

    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
      return errorResponse('Invalid id', 400);
    }

    const key = `${WALLPAPER_PREFIX}${id}`;
    const exists = await env.NAV_IMG.get(key);
    if (!exists) {
      return errorResponse('Wallpaper not found', 404);
    }

    await env.NAV_IMG.delete(key);

    // 删除壁纸后失效首页缓存，避免首页 HTML 仍引用已删除的图片
    await markHomeCacheDirty(env, 'all');

    return jsonResponse({ code: 200, message: 'Wallpaper deleted' });
  } catch (e) {
    console.error('Wallpaper delete failed:', e);
    return errorResponse(`Failed to delete: ${e.message}`, 500);
  }
}
