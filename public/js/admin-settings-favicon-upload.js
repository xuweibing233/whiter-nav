(function () {
  const ns = window.AdminSettings = window.AdminSettings || {};
  const currentSettings = ns.currentSettings || ns.defaults?.createDefaultSettings?.() || {};
  ns.currentSettings = currentSettings;

  function getRefs() {
    return {
      uploadBtn: document.getElementById('uploadFaviconBtn'),
      uploadFile: document.getElementById('uploadFaviconFile'),
      faviconInput: document.getElementById('homeSiteFavicon'),
    };
  }

  function setFaviconInput(url) {
    const refs = getRefs();
    if (!refs.faviconInput) return;
    refs.faviconInput.value = url || '';
    refs.faviconInput.dispatchEvent(new Event('input', { bubbles: true }));
    refs.faviconInput.dispatchEvent(new Event('change', { bubbles: true }));
    currentSettings.home_site_favicon = url || '';
    refs.faviconInput.classList.add('bg-green-50');
    setTimeout(() => refs.faviconInput.classList.remove('bg-green-50'), 300);
  }

  async function uploadFavicon(file) {
    if (!file) return;

    if (file.size > 512 * 1024) {
      window.showMessage?.('图标过大，请选择 512KB 以内的图片', 'error');
      return;
    }
    const allowed = ['image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      window.showMessage?.('仅支持 SVG / PNG / ICO / JPEG / WebP 图片', 'error');
      return;
    }

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/api/favicon', {
        method: 'POST',
        headers: { 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
        body: form,
      });
      const data = await res.json();
      if (data.code === 201 && data.data?.currentUrl) {
        setFaviconInput(data.data.currentUrl);
        window.showMessage?.('图标已上传，请点击底部「保存设置」生效', 'success');
      } else {
        window.showMessage?.(data.message || '上传失败', 'error');
      }
    } catch (e) {
      console.error('Upload favicon failed:', e);
      window.showMessage?.('上传失败（网络错误）', 'error');
    }
  }

  function init() {
    const refs = getRefs();
    if (!refs.uploadBtn || !refs.uploadFile) return false;

    refs.uploadBtn.addEventListener('click', () => refs.uploadFile.click());
    refs.uploadFile.addEventListener('change', () => {
      if (refs.uploadFile.files?.[0]) uploadFavicon(refs.uploadFile.files[0]);
      refs.uploadFile.value = '';
    });

    return true;
  }

  ns.faviconUpload = {
    init,
    setFaviconInput,
  };
})();
