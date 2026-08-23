// functions/_scheduled.js
// 定时任务入口（Cron Trigger）：自动把书签备份推送到 GitHub 私有仓库
// 需要在 Cloudflare Pages 项目中配置 Cron Trigger；或在 wrangler.toml 配置：
//   [triggers]
//   cron = ["0 3 1,15 * *"]   ← 每月 1 日、15 日 03:00 UTC
import { pushBackupToGithub } from './lib/github-backup';

export async function onScheduled(context) {
  const { env } = context;
  const result = await pushBackupToGithub(env);
  if (!result.ok) {
    console.error('[backup-scheduled]', result.message);
  } else {
    console.log('[backup-scheduled]', result.message);
  }
  return result.ok;
}