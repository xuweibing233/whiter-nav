import { escapeHTML, sanitizeUrl } from './utils';

// 已知的外部 favicon 服务：这些 URL 是后台「自动生成图标」时写入的，
// 渲染时统一改走本地代理 /api/icon?url=<domain>，避免每次页面加载都直连外部图标服务
const FAVICON_SERVICE_PATTERNS = [
  /faviconsnap\.com/i,
  /favicon\.im/i,
  /faviconextractor\.com/i,
  /google\.com\/s2\/favicons/i,
];

function extractDomainFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// 将 logo URL 归一化为本地代理地址；用户自填的 logo 保留原样
function resolveLogoProxyUrl(logoUrl, siteUrl) {
  if (!logoUrl) return '';
  if (logoUrl.startsWith('data:')) return logoUrl;

  const isFaviconService = FAVICON_SERVICE_PATTERNS.some(pattern => pattern.test(logoUrl));
  if (isFaviconService) {
    // 从站点 URL 提取域名（更可靠），失败时回退从 logo URL 提取
    const domain = extractDomainFromUrl(siteUrl) || extractDomainFromUrl(logoUrl);
    if (domain) return `/api/icon?url=${encodeURIComponent(domain)}`;
  }
  return logoUrl;
}

function buildSearchText(site, normalizedUrl) {
  return [
    site?.name,
    site?.url,
    normalizedUrl || '',
    site?.catelog_name || site?.catelog || '未分类',
    site?.desc,
  ]
    .map(value => String(value ?? '').toLowerCase())
    .join('\u0000');
}

function getDeviceSetting(settings, device, key, fallback = '') {
  const mobileKey = `mobile_${key}`;
  if (device === 'mobile' && settings[mobileKey] !== undefined) {
    return settings[mobileKey];
  }
  return settings[key] ?? fallback;
}

function getDeviceSettingOrDefault(settings, device, key, fallback = '') {
  const value = getDeviceSetting(settings, device, key, fallback);
  return String(value ?? '').trim() === '' ? fallback : value;
}

export function buildCardTemplateConfig(settings = {}, device = 'desktop') {
  const isMobile = device === 'mobile';
  const cardStyle = getDeviceSetting(settings, device, 'layout_card_style', isMobile ? 'style2' : 'style1') || (isMobile ? 'style2' : 'style1');
  const isNavigationTileStyle = cardStyle === 'style3';
  const hideDesc = isNavigationTileStyle || getDeviceSetting(settings, device, 'layout_hide_desc', isMobile) === true;
  const hideLinks = isNavigationTileStyle || getDeviceSetting(settings, device, 'layout_hide_links', isMobile) === true;
  const hideCategory = isNavigationTileStyle || getDeviceSetting(settings, device, 'layout_hide_category', false) === true;
  const enableFrostedGlass = getDeviceSetting(settings, device, 'layout_enable_frosted_glass', false) === true;
  const cardAnimation = getDeviceSetting(settings, device, 'layout_card_animation', 'radial') || 'radial';
  const gridCols = getDeviceSetting(settings, device, 'layout_grid_cols', isMobile ? '3' : '4') || (isMobile ? '3' : '4');
  const hideCopyText = isMobile ? Number(gridCols) >= 3 : (Number(gridCols) || 4) >= 5;
  const titleSize = getDeviceSetting(settings, device, 'card_title_size', isMobile ? '13' : '16') || (isMobile ? '13' : '16');
  const titleColor = getDeviceSetting(settings, device, 'card_title_color', '');
  const titleFont = getDeviceSetting(settings, device, 'card_title_font', '');
  const descSize = getDeviceSetting(settings, device, 'card_desc_size', isMobile ? '11' : '14') || (isMobile ? '11' : '14');
  const descColor = getDeviceSetting(settings, device, 'card_desc_color', '');
  const descFont = getDeviceSetting(settings, device, 'card_desc_font', '');
  const cardRadius = getDeviceSettingOrDefault(settings, device, 'layout_card_border_radius', '12');
  const frostedGlassIntensity = getDeviceSettingOrDefault(settings, device, 'layout_frosted_glass_intensity', '15');

  return {
    device,
    hideDesc,
    hideLinks,
    hideCategory,
    enableFrostedGlass,
    cardStyle,
    cardAnimation,
    gridCols,
    hideCopyText,
    titleSize,
    titleColor,
    titleFont,
    descSize,
    descColor,
    descFont,
    cardRadius,
    frostedGlassIntensity,
    aboveFoldImageCount: 8,
    baseCardClass: enableFrostedGlass
      ? 'site-card group h-full flex flex-col overflow-hidden transition-all'
      : 'site-card group h-full flex flex-col bg-white border border-primary-100/60 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700',
    frostedClass: enableFrostedGlass ? 'frosted-glass-effect' : '',
    cardStyleClass: cardStyle === 'style2' ? 'style-2' : (isNavigationTileStyle ? 'style-3' : ''),
    titleClass: 'site-title text-base font-medium text-gray-900 dark:text-gray-100 truncate transition-all duration-300 origin-left',
    descClass: 'mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2',
    categoryClass: 'site-category inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-secondary-100 text-primary-700 dark:bg-secondary-800 dark:text-primary-300',
    linkRowClass: 'mt-3 flex items-center justify-between',
    urlTextClass: 'text-xs text-primary-600 dark:text-primary-400 truncate flex-1 min-w-0 mr-2',
    copyButtonBaseClass: 'copy-btn relative flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors',
    copyButtonEnabledClass: 'bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900/30 dark:text-accent-300 dark:hover:bg-accent-900/50',
    copyButtonDisabledClass: 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500',
    logoClass: 'w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-700',
    siteIconClass: 'site-icon flex-shrink-0 mr-4 transition-all duration-300',
  };
}

export function buildCardViewModel(site) {
  const rawName = site?.name || '未命名';
  const normalizedUrl = sanitizeUrl(site?.url);
  const normalizedLogo = sanitizeUrl(site?.logo);
  const rawCatalog = site?.catelog_name || site?.catelog || '未分类';
  const rawDesc = site?.desc || '暂无描述';
  const logoProxyUrl = resolveLogoProxyUrl(normalizedLogo, normalizedUrl);

  return {
    id: site?.id,
    catelog_id: site?.catelog_id,
    nameHtml: escapeHTML(rawName),
    catalogHtml: escapeHTML(rawCatalog),
    descHtml: escapeHTML(rawDesc),
    hasDesc: Boolean(site?.desc && String(site.desc).trim()),
    urlHtml: escapeHTML(normalizedUrl),
    displayUrlHtml: escapeHTML(normalizedUrl || '未提供链接'),
    logoUrlHtml: escapeHTML(logoProxyUrl),
    cardInitialHtml: escapeHTML((rawName.trim().charAt(0) || '站').toUpperCase()),
    hasValidUrl: Boolean(normalizedUrl),
    searchText: buildSearchText(site, normalizedUrl),
  };
}

export function buildCardHydrationState(sites, settings = {}) {
  return {
    config: buildCardTemplateConfig(settings, 'desktop'),
    configs: {
      desktop: buildCardTemplateConfig(settings, 'desktop'),
      mobile: buildCardTemplateConfig(settings, 'mobile'),
    },
    cards: (sites || []).map(site => buildCardViewModel(site)),
  };
}
