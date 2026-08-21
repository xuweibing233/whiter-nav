// functions/api/wallpaper/list.js
// 列出已上传的本地壁纸（认证后可用）
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../../_middleware';

const WALLPAPER_PREFIX = 'wallpaper_';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const { keys } = await env.NAV_AUTH.list({ prefix: WALLPAPER_PREFIX });
    const items = (keys || []).map(key => ({
      id: key.name.slice(WALLPAPER_PREFIX.length),
      url: `/api/wallpaper/file?id=${key.name.slice(WALLPAPER_PREFIX.length)}`,
      name: key.name,
    }));

    return jsonResponse({ code: 200, data: items });
  } catch (e) {
    console.error('Wallpaper list failed:', e);
    return errorResponse(`Failed to list: ${e.message}`, 500);
  }
}
