// functions/api/debug/webdav-diag.js
// 临时诊断：测试 Worker 能否访问坚果云 WebDAV（认证 + PUT 最小请求）
// 需要登录态，避免被滥用
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../../_middleware';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    // 1. 读取配置
    const keys = ['webdav_url', 'webdav_username', 'webdav_password'];
    const placeholders = keys.map(() => '?').join(',');
    const { results } = await env.NAV_DB
      .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
      .bind(...keys)
      .all();
    const config = {};
    (results || []).forEach(row => { config[row.key] = row.value; });

    const baseUrl = String(config.webdav_url || '').trim();
    const username = String(config.webdav_username || '');
    const password = String(config.webdav_password || '');

    if (!baseUrl || !password) {
      return jsonResponse({ code: 200, data: { configured: false, message: 'WebDAV 未完整配置' } });
    }

    // 2. 构造认证头
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const auth = `Basic ${btoa(binary)}`;

    // 3. 测 OPTIONS（验证连通性，最小请求）
    let optionsResult = null;
    try {
      const res = await fetch(baseUrl, {
        method: 'OPTIONS',
        headers: { Authorization: auth },
        redirect: 'manual',
      });
      optionsResult = {
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get('content-type'),
      };
    } catch (e) {
      optionsResult = { error: e.message };
    }

    // 4. 测 PUT 最小文件到根目录
    let putResult = null;
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/worker-diag-test.json`, {
        method: 'PUT',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: '{"diag":true}',
        redirect: 'manual',
      });
      const bodyText = await res.text().catch(() => '');
      putResult = {
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get('content-type'),
        bodyPreview: bodyText.slice(0, 200),
      };
    } catch (e) {
      putResult = { error: e.message };
    }

    return jsonResponse({
      code: 200,
      data: {
        configured: true,
        baseUrl,
        optionsResult,
        putResult,
      },
    });
  } catch (e) {
    console.error('Webdav diag failed:', e);
    return errorResponse(`诊断失败: ${e.message}`, 500);
  }
}
