// functions/lib/github-backup.js
// 书签备份推送到 GitHub 私有仓库（共享逻辑：手动按钮与定时任务共用）

import { fetchBookmarkExport, validateBookmarkExportForImport } from './bookmark-export';

const GITHUB_API = 'https://api.github.com';
const BACKUP_FILE = 'bookmark-backup.json';
const USER_AGENT = 'iori-nav-backup/1.0';

/**
 * 检查 GitHub 备份是否已配置（token + 仓库）
 */
export function isGithubBackupConfigured(env) {
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO && /^[^/]+\/[^/]+$/.test(String(env.GITHUB_REPO || '')));
}

/**
 * 从 D1 导出全部书签（含私密），并校验可无损恢复
 * @returns {Promise<{ok: true, data: object}|{ok: false, message: string}>}
 */
async function buildBackupPayload(env) {
  const data = await fetchBookmarkExport(env, { includePrivate: true });
  const check = validateBookmarkExportForImport(data);
  if (!check.ok) {
    return { ok: false, message: `备份数据校验失败: ${check.message}` };
  }
  return { ok: true, data };
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * 推送到 GitHub 私有仓库（Contents API，幂等：存在则更新）
 * @returns {Promise<{ok: true, message: string, committed?: boolean}|{ok: false, message: string}>}
 */
export async function pushBackupToGithub(env) {
  if (!isGithubBackupConfigured(env)) {
    return { ok: false, message: 'GitHub 备份未配置（需要 GITHUB_TOKEN 与 GITHUB_REPO）' };
  }

  const repo = String(env.GITHUB_REPO).trim();
  const branch = String(env.GITHUB_BRANCH || 'main').trim() || 'main';
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
  };

  try {
    const payload = await buildBackupPayload(env);
    if (!payload.ok) return payload;

    const content = JSON.stringify(payload.data, null, 2);

    // 1. 读取仓库中现有文件（取 sha，以便覆盖更新；404 表示首次创建）
    let sha = null;
    let getStatus = 0;
    try {
      const getRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${BACKUP_FILE}?ref=${branch}`, { headers });
      getStatus = getRes.status;
      if (getRes.ok) {
        const meta = await getRes.json();
        sha = meta.sha || null;
      }
    } catch (e) {
      return { ok: false, message: `读取 GitHub 仓库失败: ${e.message}` };
    }

    if (getStatus !== 200 && getStatus !== 404) {
      return { ok: false, message: `GitHub API 返回 ${getStatus}，请检查 Token 权限（需该仓库 Contents 读写）` };
    }

    // 2. 写入/覆盖文件
    const body = {
      message: `书签备份 ${new Date().toISOString()}`,
      content: utf8ToBase64(content),
      branch,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${BACKUP_FILE}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      let detail = '';
      try {
        const err = await putRes.json();
        detail = err.message || '';
      } catch { /* 忽略 */ }
      return { ok: false, message: `GitHub 推送失败 (${putRes.status}): ${detail}` };
    }

    return {
      ok: true,
      message: '备份已推送到 GitHub 私有仓库',
      committed: true,
    };
  } catch (e) {
    return { ok: false, message: `备份失败: ${e.message}` };
  }
}