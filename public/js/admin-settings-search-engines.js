(function () {
  const ns = window.AdminSettings = window.AdminSettings || {};
  const currentSettings = ns.currentSettings || ns.defaults?.createDefaultSettings?.() || {};
  ns.currentSettings = currentSettings;

  const DEFAULT_ENGINES = [
    { id: 'google', label: 'Google', url: 'https://www.google.com/search?q={q}' },
    { id: 'baidu', label: 'Baidu', url: 'https://www.baidu.com/s?wd={q}' },
    { id: 'github', label: 'Github', url: 'https://github.com/search?q={q}' },
  ];

  // 解析 settings 里的引擎 JSON（空/非法时回退默认）
  function parseEngines(json) {
    try {
      const parsed = JSON.parse(json || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map(e => ({
            id: String(e?.id || '').trim(),
            label: String(e?.label || '').trim(),
            url: String(e?.url || '').trim(),
          }))
          .filter(e => e.id && e.label && e.url);
      }
    } catch (e) { /* 忽略，回退默认 */ }
    return DEFAULT_ENGINES.map(e => ({ ...e }));
  }

  // 生成唯一 id（供新添加的引擎使用）
  function genId() {
    return 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function renderEngineList() {
    const list = document.getElementById('searchEnginesList');
    if (!list) return;

    const engines = parseEngines(currentSettings.home_search_engines);
    list.innerHTML = '';

    engines.forEach((engine, index) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 p-2 bg-white rounded border border-gray-200 search-engine-row';
      row.draggable = true;

      row.innerHTML = `
        <span class="cursor-move text-gray-400 select-none">⠿</span>
        <input type="text" class="engine-label flex-1 min-w-0 text-sm p-1 border rounded" value="${escapeAttr(engine.label)}" placeholder="名称" data-engine-id="${escapeAttr(engine.id)}">
        <input type="text" class="engine-url flex-1 min-w-0 text-sm p-1 border rounded" value="${escapeAttr(engine.url)}" placeholder="https://...?q={q}" data-engine-id="${escapeAttr(engine.id)}">
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" class="engine-move-up text-gray-400 hover:text-primary-600 disabled:opacity-30 px-1" ${index === 0 ? 'disabled' : ''} title="上移">↑</button>
          <button type="button" class="engine-move-down text-gray-400 hover:text-primary-600 disabled:opacity-30 px-1" ${index === engines.length - 1 ? 'disabled' : ''} title="下移">↓</button>
          <button type="button" class="engine-delete text-red-400 hover:text-red-600 px-1" title="删除">×</button>
        </div>
      `;

      list.appendChild(row);
    });

    bindEngineEvents();
  }

  function escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function syncEnginesToSettings() {
    const list = document.getElementById('searchEnginesList');
    if (!list) return;

    const engines = Array.from(list.querySelectorAll('.search-engine-row')).map(row => {
      const id = row.querySelector('.engine-label')?.dataset.engineId || genId();
      const label = row.querySelector('.engine-label')?.value.trim() || '';
      const url = row.querySelector('.engine-url')?.value.trim() || '';
      return { id, label, url };
    }).filter(e => e.label && e.url);

    currentSettings.home_search_engines = engines.length > 0 ? JSON.stringify(engines) : '';
  }

  function bindEngineEvents() {
    const list = document.getElementById('searchEnginesList');
    if (!list) return;

    list.onclick = (e) => {
      const row = e.target.closest('.search-engine-row');
      if (!row) return;

      if (e.target.classList.contains('engine-move-up')) {
        const prev = row.previousElementSibling;
        if (prev) list.insertBefore(row, prev);
      } else if (e.target.classList.contains('engine-move-down')) {
        const next = row.nextElementSibling;
        if (next) list.insertBefore(next, row);
      } else if (e.target.classList.contains('engine-delete')) {
        row.remove();
      }

      refreshMoveButtons();
      syncEnginesToSettings();
    };

    // 输入变化即同步（防抖，避免每次击键都写）
    let debounceTimer = null;
    list.oninput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncEnginesToSettings, 200);
    };

    // 拖拽排序
    let dragRow = null;
    list.ondragstart = (e) => {
      dragRow = e.target.closest('.search-engine-row');
      if (dragRow) e.dataTransfer.effectAllowed = 'move';
    };
    list.ondragover = (e) => {
      e.preventDefault();
      const target = e.target.closest('.search-engine-row');
      if (target && target !== dragRow) {
        const rect = target.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        if (after) {
          target.after(dragRow);
        } else {
          target.before(dragRow);
        }
      }
    };
    list.ondragend = () => {
      dragRow = null;
      refreshMoveButtons();
      syncEnginesToSettings();
    };
  }

  function refreshMoveButtons() {
    const list = document.getElementById('searchEnginesList');
    if (!list) return;
    const rows = Array.from(list.querySelectorAll('.search-engine-row'));
    rows.forEach((row, index) => {
      const up = row.querySelector('.engine-move-up');
      const down = row.querySelector('.engine-move-down');
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === rows.length - 1;
    });
  }

  function init() {
    const addBtn = document.getElementById('addSearchEngineBtn');
    const list = document.getElementById('searchEnginesList');
    if (!addBtn || !list) return false;

    addBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 p-2 bg-white rounded border border-gray-200 search-engine-row';
      const id = genId();
      row.innerHTML = `
        <span class="cursor-move text-gray-400 select-none">⠿</span>
        <input type="text" class="engine-label flex-1 min-w-0 text-sm p-1 border rounded" placeholder="名称" data-engine-id="${id}">
        <input type="text" class="engine-url flex-1 min-w-0 text-sm p-1 border rounded" placeholder="https://...?q={q}" data-engine-id="${id}">
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" class="engine-move-up text-gray-400 hover:text-primary-600 disabled:opacity-30 px-1" title="上移">↑</button>
          <button type="button" class="engine-move-down text-gray-400 hover:text-primary-600 disabled:opacity-30 px-1" title="下移">↓</button>
          <button type="button" class="engine-delete text-red-400 hover:text-red-600 px-1" title="删除">×</button>
        </div>
      `;
      list.appendChild(row);
      refreshMoveButtons();
      row.querySelector('.engine-label').focus();
      syncEnginesToSettings();
    });

    return true;
  }

  // 设置打开/加载后刷新列表
  function renderAfterSettingsLoad() {
    const orig = ns.form?.updateUIFromSettings;
    if (typeof orig !== 'function') return;
    ns.form.updateUIFromSettings = function (...args) {
      const result = orig.apply(this, args);
      renderEngineList();
      return result;
    };
  }

  // 设置保存前同步：collectSettingsFromInputs 返回 currentSettings，引擎 JSON 已实时写入其中
  function syncBeforeCollect() {
    const orig = ns.form?.collectSettingsFromInputs;
    if (typeof orig !== 'function') return;
    ns.form.collectSettingsFromInputs = function (...args) {
      syncEnginesToSettings();
      return orig.apply(this, args);
    };
  }

  ns.searchEngines = {
    init,
    renderEngineList,
    syncEnginesToSettings,
  };

  renderAfterSettingsLoad();
  syncBeforeCollect();
})();