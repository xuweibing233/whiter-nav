(function () {
  const ns = window.AdminSettings = window.AdminSettings || {};
  const currentSettings = ns.currentSettings || ns.defaults?.createDefaultSettings?.() || {};
  ns.currentSettings = currentSettings;

  function getRefs() {
    return {
      uploadBtn: document.getElementById('uploadWallpaperBtn'),
      uploadFile: document.getElementById('uploadWallpaperFile'),
      uploadedDiv: document.getElementById('uploadedWallpapers'),
      customWallpaperInput: document.getElementById('customWallpaperInput'),
    };
  }

  // 从 /api/wallpaper/file 地址反推 id（或直接用 url）
  function applyWallpaper(url) {
    const refs = getRefs();
    if (!refs.customWallpaperInput) return;
    refs.customWallpaperInput.value = url || '';
    refs.customWallpaperInput.dispatchEvent(new Event('input', { bubbles: true }));
    refs.customWallpaperInput.dispatchEvent(new Event('change', { bubbles: true }));
    currentSettings.layout_custom_wallpaper = url || '';
    refs.customWallpaperInput.classList.add('bg-green-50');
    setTimeout(() => refs.customWallpaperInput.classList.remove('bg-green-50'), 300);
    ns.preview?.scheduleFullPreviewRender?.();
  }

  function renderList(items) {
    const refs = getRefs();
    if (!refs.uploadedDiv) return;

    if (!items || items.length === 0) {
      refs.uploadedDiv.innerHTML = '<div class="col-span-full text-center text-gray-400 py-6 text-sm">还没有上传壁纸</div>';
      return;
    }

    refs.uploadedDiv.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'wp-card-wrapper aspect-video';
      div.title = '点击应用为当前壁纸';
      div.innerHTML = `
        <div class="wp-card-image-container">
          <img src="${window.escapeHTML(item.url)}" class="wp-card-image" alt="本地壁纸">
        </div>
        <div class="wp-card-overlay">
          <span class="wp-card-btn">应用</span>
        </div>
        <button type="button" class="wp-card-delete"
          title="删除这张壁纸"
          style="position:absolute;top:4px;right:4px;z-index:5;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;border:none;cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;">×</button>`;
      div.querySelector('.wp-card-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteWallpaper(item.id, div);
      });
      div.addEventListener('mouseenter', () => {
        const btn = div.querySelector('.wp-card-delete');
        if (btn) btn.style.opacity = '1';
      });
      div.addEventListener('mouseleave', () => {
        const btn = div.querySelector('.wp-card-delete');
        if (btn) btn.style.opacity = '0';
      });
      div.addEventListener('click', () => applyWallpaper(item.url));
      refs.uploadedDiv.appendChild(div);
    });
  }

  async function deleteWallpaper(id, cardEl) {
    if (!confirm('确定删除这张壁纸吗？')) return;

    try {
      const res = await fetch(`/api/wallpaper/delete?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
      });
      const data = await res.json();
      if (data.code === 200) {
        window.showMessage?.('壁纸已删除', 'success');
        loadUploaded();
      } else {
        window.showMessage?.(data.message || '删除失败', 'error');
      }
    } catch (e) {
      console.error('Delete wallpaper failed:', e);
      window.showMessage?.('删除失败（网络错误）', 'error');
    }
  }

  async function loadUploaded() {
    const refs = getRefs();
    if (!refs.uploadedDiv) return;
    refs.uploadedDiv.innerHTML = '<div class="col-span-full text-center text-gray-400 py-6 text-sm">加载中...</div>';

    try {
      const res = await fetch('/api/wallpaper/list');
      if (!res.ok) throw new Error('list failed');
      const data = await res.json();
      if (data.code === 200) {
        renderList(data.data || []);
      } else {
        refs.uploadedDiv.innerHTML = '<div class="col-span-full text-center text-gray-400 py-6 text-sm">加载失败</div>';
      }
    } catch (e) {
      console.error('Load uploaded wallpapers failed:', e);
      refs.uploadedDiv.innerHTML = '<div class="col-span-full text-center text-red-400 py-6 text-sm">加载失败，请检查登录状态</div>';
    }
  }

  async function uploadFile(file) {
    const refs = getRefs();
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      window.showMessage?.('图片过大，请选择 2MB 以内的图片', 'error');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      window.showMessage?.('仅支持 JPEG/PNG/WebP/GIF 图片', 'error');
      return;
    }

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/api/wallpaper/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
        body: form,
      });
      const data = await res.json();
      if (data.code === 201 && data.data?.url) {
        window.showMessage?.('上传成功，点击缩略图应用', 'success');
        loadUploaded();
      } else {
        window.showMessage?.(data.message || '上传失败', 'error');
      }
    } catch (e) {
      console.error('Upload wallpaper failed:', e);
      window.showMessage?.('上传失败（网络错误）', 'error');
    }
  }

  function init() {
    const refs = getRefs();
    if (!refs.uploadBtn || !refs.uploadFile) return false;

    refs.uploadBtn.addEventListener('click', () => refs.uploadFile.click());
    refs.uploadFile.addEventListener('change', () => {
      if (refs.uploadFile.files?.[0]) uploadFile(refs.uploadFile.files[0]);
      refs.uploadFile.value = '';
    });

    // 壁纸 tab 打开时加载列表
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('data-tab') === 'wallpaper-settings') {
          loadUploaded();
        }
      });
    });

    return true;
  }

  ns.wallpaperUpload = {
    init,
    loadUploaded,
    applyWallpaper,
    deleteWallpaper,
  };
})();
