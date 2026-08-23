(function () {
  const Home = window.IoriHome = window.IoriHome || {};

  Home.initSearch = function () {
    const sitesGrid = document.getElementById('sitesGrid');
    const searchInputs = document.querySelectorAll('.search-input-target');
    const engineOptions = document.querySelectorAll('.search-engine-option');
    let searchCardCache = null;
    let searchDebounceTimer = null;
    let currentSearchEngine = 'local';
    // 搜索态标记：true 表示网格当前是全量书签（搜索视图），false 为默认分类视图
    let isSearchView = false;

    function clearSearchCardCache() {
      searchCardCache = null;
    }

    // 预缓存全量书签搜索数据（不受当前渲染分类影响）
    // 从 IORI_SITES 全量构建；SSR 注入的 IORI_SITES 始终包含所有书签
    function getSearchCardCache() {
      if (searchCardCache) return searchCardCache;
      searchCardCache = (window.IORI_SITES || []).map(s => {
        const text = (s.searchText || [s.nameHtml, s.urlHtml, s.catalogHtml, s.descHtml]
          .map(v => String(v || '').toLowerCase()).join('\0'));
        return { id: String(s.id), text };
      });
      return searchCardCache;
    }

    // 恢复默认分类视图（与 SSR 渲染的分类一致；「全部」tab 隐藏时回到默认分类）
    function restoreDefaultView() {
      const ssrCatalogId = window.IORI_LAYOUT_CONFIG?.ssrCatalogId;
      const controller = Home.cardController;
      if (!controller) return;

      if (ssrCatalogId && ssrCatalogId !== 'all') {
        const sites = controller.getSitesForCatalog(ssrCatalogId);
        controller.setActiveCatalogId(ssrCatalogId);
        controller.renderSites(sites);
        Home.updateHeading?.(null, null, sites.length);
      } else {
        const allSites = window.IORI_SITES || [];
        controller.setActiveCatalogId(null);
        controller.renderSites(allSites);
        Home.updateHeading?.(null, null, allSites.length);
      }
    }

    // 应用本地搜索过滤：关键词非空时切到全量视图再过滤，清空时恢复默认视图
    function applyLocalSearchFilter(keyword) {
      const normalizedKeyword = String(keyword || '').toLowerCase().trim();
      const controller = Home.cardController;
      const allSites = window.IORI_SITES || [];

      // 进入搜索：确保网格渲染全量书签（否则默认分类下搜索不到其他分类）
      if (normalizedKeyword && !isSearchView) {
        isSearchView = true;
        controller?.setActiveCatalogId(null);
        controller?.renderSites(allSites);
      }
      // 清空搜索：恢复默认分类视图
      if (!normalizedKeyword && isSearchView) {
        isSearchView = false;
        restoreDefaultView();
        updateHeading('');
        updateSearchHint(0, '');
        return;
      }

      if (!normalizedKeyword) {
        updateHeading('');
        updateSearchHint(0, '');
        return;
      }

      const cached = getSearchCardCache();
      // 按 data-id 匹配卡片（全量渲染后所有书签都在 DOM）
      const cards = sitesGrid ? Array.from(sitesGrid.querySelectorAll('.site-card')) : [];
      const cacheById = new Map(cached.map(c => [c.id, c.text]));

      let visibleCount = 0;
      cards.forEach(card => {
        const id = card.getAttribute('data-id');
        const text = cacheById.get(String(id)) || '';
        const matches = text.includes(normalizedKeyword);
        card.classList.toggle('hidden', !matches);
        if (matches) visibleCount++;
        highlightMatches(card, normalizedKeyword);
      });

      updateHeading(normalizedKeyword);
      updateNoResultState(visibleCount);
      updateSearchHint(visibleCount, normalizedKeyword);
    }

    // 全站搜索提示：搜索时显示「已在全部 N 个书签中搜索」，清空时隐藏
    function updateSearchHint(visibleCount, keyword) {
      const hint = document.getElementById('searchScopeHint');
      if (!hint) return;
      if (!keyword) {
        hint.classList.add('hidden');
        return;
      }
      const total = (window.IORI_SITES || []).length;
      hint.textContent = `🔍 已在全部 ${total} 个书签中搜索，命中 ${visibleCount} 条`;
      hint.classList.remove('hidden');
    }

    function getCurrentLocalSearchKeyword() {
      if (currentSearchEngine !== 'local') return '';
      for (const input of searchInputs) {
        const keyword = input.value.trim();
        if (keyword) return keyword;
      }
      return '';
    }

    // 无结果空状态：搜索无命中时展示提示（不会在「全部」无书签时误报）
    function updateNoResultState(visibleCount) {
      const grid = document.getElementById('sitesGrid');
      if (!grid) return;
      const existing = grid.querySelector('.search-empty-state');
      const keyword = getCurrentLocalSearchKeyword();

      if (keyword && visibleCount === 0) {
        if (!existing) {
          const empty = document.createElement('div');
          empty.className = 'search-empty-state col-span-full flex flex-col items-center justify-center py-14 text-center';
          empty.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <p class="text-gray-400 dark:text-gray-500 text-sm">没有找到与「<span class="text-gray-600 dark:text-gray-300 font-medium"></span>」相关的书签</p>
          `;
          empty.querySelector('span').textContent = keyword;
          grid.appendChild(empty);
        } else {
          existing.querySelector('span').textContent = keyword;
        }
      } else if (existing) {
        existing.remove();
      }
    }

    // 关键词高亮：命中文字包裹 <mark>，搜索后清除旧高亮
    function highlightMatches(el, keyword) {
      if (!el) return;
      el.querySelectorAll('mark').forEach(m => {
        const parent = m.parentNode;
        if (parent) parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      });

      if (!keyword) return;
      const textNodes = getTextNodes(el);
      textNodes.forEach(node => {
        const text = node.nodeValue;
        if (!text) return;
        const lower = text.toLowerCase();
        const idx = lower.indexOf(keyword);
        if (idx === -1) return;
        const fragment = document.createDocumentFragment();
        if (idx > 0) fragment.appendChild(document.createTextNode(text.slice(0, idx)));
        const mark = document.createElement('mark');
        mark.className = 'bg-amber-200/80 dark:bg-amber-500/40 rounded px-0.5 text-inherit';
        mark.textContent = text.slice(idx, idx + keyword.length);
        fragment.appendChild(mark);
        if (idx + keyword.length < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(idx + keyword.length)));
        }
        node.parentNode.replaceChild(fragment, node);
      });
    }

    function getTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          const parent = node.parentNode;
          if (parent && (parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE' || parent.nodeName === 'MARK')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      return nodes;
    }

    function reapplyLocalSearchFilter() {
      applyLocalSearchFilter(getCurrentLocalSearchKeyword());
    }

    function updateSearchEngineUI(engine) {
      engineOptions.forEach(opt => {
        if (opt.dataset.engine === engine) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });

      let placeholder = '搜索书签...';
      const activeOption = Array.from(engineOptions).find(opt => opt.dataset.engine === engine);
      const activeLabel = activeOption?.querySelector('span')?.textContent?.trim();
      if (activeLabel) placeholder = `${activeLabel} 搜索...`;

      searchInputs.forEach(input => {
        input.placeholder = placeholder;
        if (engine === 'local' && input.value.trim()) {
          input.dispatchEvent(new Event('input'));
        }
      });
    }

    function updateHeading(keyword, activeCatalog, count) {
      const heading = document.querySelector('[data-role="list-heading"]');
      if (!heading) return;

      const visibleCount = (count !== undefined) ? count : (sitesGrid?.querySelectorAll('.site-card:not(.hidden)').length || 0);
      const isMobile = window.innerWidth < 440;

      if (activeCatalog !== undefined) {
        if (activeCatalog) {
          heading.dataset.active = activeCatalog;
        } else {
          delete heading.dataset.active;
        }
      }

      if (keyword) {
        heading.textContent = isMobile ? `${visibleCount} 个书签` : `搜索结果 · ${visibleCount} 个书签`;
      } else {
        const currentActive = heading.dataset.active;
        if (isMobile) {
          heading.textContent = `${visibleCount} 个书签`;
        } else if (currentActive) {
          heading.textContent = `${currentActive} · ${visibleCount} 个书签`;
        } else {
          heading.textContent = `全部收藏 · ${visibleCount} 个书签`;
        }
      }
    }

    Home.clearSearchCardCache = clearSearchCardCache;
    Home.reapplyLocalSearchFilter = reapplyLocalSearchFilter;
    Home.updateHeading = updateHeading;
    Home.exitSearchView = function () {
      isSearchView = false;
    };

    if (engineOptions.length > 0) {
      currentSearchEngine = localStorage.getItem('search_engine') || 'local';
      if (currentSearchEngine === 'bing') {
        currentSearchEngine = 'github';
        localStorage.setItem('search_engine', currentSearchEngine);
      }
      updateSearchEngineUI(currentSearchEngine);
    } else {
      localStorage.removeItem('search_engine');
    }

    engineOptions.forEach(option => {
      option.addEventListener('click', () => {
        currentSearchEngine = option.dataset.engine;
        localStorage.setItem('search_engine', currentSearchEngine);
        updateSearchEngineUI(currentSearchEngine);

        searchInputs.forEach(input => input.focus());
      });
    });

    searchInputs.forEach(input => {
      input.addEventListener('input', function () {
        if (currentSearchEngine !== 'local') return;

        const value = this.value;
        searchInputs.forEach(otherInput => {
          if (otherInput !== this) otherInput.value = value;
        });

        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          applyLocalSearchFilter(value);
        }, 200);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && currentSearchEngine !== 'local') {
          e.preventDefault();
          const query = this.value.trim();
          if (query) {
            const option = Array.from(engineOptions).find(opt => opt.dataset.engine === currentSearchEngine);
            const urlTemplate = option?.dataset.engineUrl;
            if (urlTemplate) {
              const url = urlTemplate.replace('{q}', encodeURIComponent(query));
              window.open(url, '_blank');
            }
          }
        }
      });
    });

    updateHeading();
  };

  // 「/」快捷键聚焦搜索框（不在输入框/文本域/可编辑区域时生效）
  function initSearchShortcut() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;

      // 页面存在两个搜索框（移动端竖版 hidden / 桌面横版），只聚焦可见的那个
      const inputs = Array.from(document.querySelectorAll('.search-input-target'));
      const visible = inputs.find(input => input.offsetParent !== null);
      if (!visible) return;

      e.preventDefault();
      visible.focus();
      visible.select();
    });
  }

  Home.initSearchShortcut = initSearchShortcut;
})();
