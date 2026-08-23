// functions/api/backup/github.js
// 手动触发：把书签备份推送到 GitHub 私有仓库
import { isAdminAuthenticated, errorResponse, jsonResponse } from '../../_middleware';
import { pushBackupToGithub, isGithubBackupConfigured } from '../../lib/github-backup';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  if (!isGithubBackupConfigured(env)) {
    return errorResponse('GitHub 备份未配置（需要在 Pages 项目变量中配置 GITHUB_TOKEN 与 GITHUB_REPO）', 500);
  }

  const result = await pushBackupToGithub(env);
  if (!result.ok) {
    return errorResponse(result.message, 502);
  }
  return jsonResponse({ code: 200, message: result.message });
}