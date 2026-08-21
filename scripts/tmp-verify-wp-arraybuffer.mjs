// 验证：arrayBuffer 读取 + metadata + 旧格式兼容
import { onRequestPost as uploadPost } from '../functions/api/wallpaper/upload.js';
import { onRequestGet as fileGet } from '../functions/api/wallpaper/file.js';

function createKv() {
  const store = new Map();
  const meta = new Map();
  return {
    store, meta,
    async get(key, opts = {}) {
      const v = store.get(key);
      if (v === undefined) return null;
      return v;
    },
    async put(key, value, opts = {}) {
      store.set(key, value);
      if (opts.metadata) meta.set(key, opts.metadata);
    },
    async getWithMetadata(key, opts = {}) {
      let v = store.get(key) ?? null;
      // 模拟真实 KV：arrayBuffer 类型把二进制返回 ArrayBuffer；text 返回字符串
      if (v instanceof ArrayBuffer && opts.type === 'text') {
        v = new TextDecoder().decode(v); // 模拟损坏：二进制按字符串读
      }
      return { value: v, metadata: meta.get(key) ?? null };
    },
  };
}

function authedEnv(kv) {
  kv.store.set('session_test', '1');
  return { NAV_AUTH: kv };
}
const AUTH_HEADERS = { Cookie: 'admin_session=test', 'X-CSRF-Token': 'token' };

const kv = createKv();
const env = authedEnv(kv);

// 1. 上传一张 PNG（含有效 PNG 头）
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 0, 0, 0, 2, 0, 1, 237, 251, 155, 125, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const form = new FormData();
form.append('file', new File([png], 'icon.png', { type: 'image/png' }));
const upRes = await uploadPost({ request: new Request('https://x.local/api/wallpaper/upload', { method: 'POST', headers: AUTH_HEADERS, body: form }), env });
const upData = await upRes.json();
console.log('上传 →', upRes.status === 201 ? '✅' : `❌ ${upData.message}`);

// 2. arrayBuffer 读取 → 返回二进制，PNG 头完整
const id = upData.data.id;
const fileRes = await fileGet({ request: new Request(`https://x.local/api/wallpaper/file?id=${id}`), env });
const buf = await fileRes.arrayBuffer();
const bytes = new Uint8Array(buf);
const pngHeaderOk = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
console.log('arrayBuffer 读取 →', fileRes.status === 200 && fileRes.headers.get('Content-Type') === 'image/png' && pngHeaderOk
  ? '✅ 200 + PNG 头完整' : `❌ status=${fileRes.status} ct=${fileRes.headers.get('Content-Type')} header=${pngHeaderOk}`);

// 3. 旧格式兼容
kv.store.set('wallpaper_legacy', JSON.stringify({ data: 'aGVsbG8=', ct: 'image/webp', at: 1 }));
const legacyRes = await fileGet({ request: new Request('https://x.local/api/wallpaper/file?id=legacy'), env });
const legacyBuf = await legacyRes.arrayBuffer();
console.log('旧格式 →', legacyRes.status === 200 && new TextDecoder().decode(legacyBuf) === 'hello' ? '✅' : `❌ ${legacyRes.status}`);
