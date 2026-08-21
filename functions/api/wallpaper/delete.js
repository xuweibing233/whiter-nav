// functions/api/wallpaper/delete.js
// 删除已上传的本地壁纸（认证后可用）
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../../_middleware';

const WALLPAPER_PREFIX = 'wallpaper_';

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

    const key = `${WALLPAPER_PREFIX}${id}`;
    const exists = await env.NAV_AUTH.get(key);
    if (!exists) {
      return errorResponse('Wallpaper not found', 404);
    }

    await env.NAV_AUTH.delete(key);
    return jsonResponse({ code: 200, message: 'Wallpaper deleted' });
  } catch (e) {
    console.error('Wallpaper delete failed:', e);
    return errorResponse(`Failed to delete: ${e.message}`, 500);
  }
}
