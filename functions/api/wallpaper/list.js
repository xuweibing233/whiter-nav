// functions/api/wallpaper/list.js
// 列出已上传的本地壁纸（认证后可用），从 R2 读取
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../../_middleware';

const WALLPAPER_PREFIX = 'wallpaper/';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  if (!env.NAV_IMG) {
    return errorResponse('R2 bucket not configured', 500);
  }

  try {
    // 递归列出 wallpaper/ 前缀下所有对象（R2 list 默认返回 1000 条以内）
    const listed = await env.NAV_IMG.list({ prefix: WALLPAPER_PREFIX });
    const items = (listed.objects || []).map(obj => ({
      id: obj.key.slice(WALLPAPER_PREFIX.length),
      url: `/api/wallpaper/file?id=${obj.key.slice(WALLPAPER_PREFIX.length)}`,
      name: obj.key,
      size: obj.size,
    }));

    return jsonResponse({ code: 200, data: items });
  } catch (e) {
    console.error('Wallpaper list failed:', e);
    return errorResponse(`Failed to list: ${e.message}`, 500);
  }
}
