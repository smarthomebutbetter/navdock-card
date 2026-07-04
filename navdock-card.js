/**
 * NavDock Card - floating, theme-aware navigation dock for Home Assistant.
 * No runtime dependencies and fully configurable from the visual card editor.
 */

const ND_VERSION = '0.7.5';

const ND_DEFAULT_TABS = [
  { label: 'Brief', icon: 'mdi:creation-outline', active_icon: 'mdi:creation', path: '/dashboard-home/tab-brief' },
  { label: 'Räume', icon: 'mdi:home-outline', active_icon: 'mdi:home', path: '/dashboard-home/tab-gerate' },
  { label: 'Home', icon: 'mdi:home-assistant', path: '/dashboard-home/home' },
  { label: 'Apps', icon: 'mdi:view-grid-outline', active_icon: 'mdi:view-grid', path: '/dashboard-home/apps' },
];

const ND_ACTIVE_STATES = new Set(['playing', 'paused', 'buffering', 'on']);

const ndEsc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function ndFire(node, type, detail = {}) {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

function ndNavigate(path) {
  if (!path) return;
  history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
}

function ndTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const min = Math.floor(value / 60);
  const sec = Math.floor(value % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

class NavDockCard extends HTMLElement {
  static getConfigElement() { return document.createElement('navdock-card-editor'); }

  static getStubConfig(hass) {
    const media = Object.keys(hass?.states || {}).find((id) => id.startsWith('media_player.'));
    return {
      tabs: ND_DEFAULT_TABS.map((tab) => ({ ...tab })),
      media_enabled: true,
      media_auto_discover: false,
      media_players: media ? [media] : [],
      media_exclude: [],
      media_include_on: true,
      media_type_overrides: {},
      expanded_player: true,
      breakpoint: 768,
      mobile_mode: 'docked',
      desktop_mode: 'floating',
      mobile_show_labels: false,
      desktop_show_labels: true,
      profile_enabled: true,
      profile_panel_enabled: true,
      profile_label: 'Profil',
      profile_path: '/profile',
      profile_show_user: true,
      profile_show_system: true,
      profile_show_connection: true,
      profile_show_device: true,
      profile_entities: [],
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._expanded = false;
    this._profileOpen = false;
    this._mediaIndex = 0;
    this._hass = null;
    this._positionTimer = null;
    this._previousFocusedElement = null;
    this._justClosed = false;
    this._onLocation = () => this._render();
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._render(), 120);
    };
    this._onKeydown = (event) => {
      if (event.key === 'Escape' && (this._expanded || this._profileOpen)) {
        event.preventDefault();
        this._justClosed = true;
        this._expanded = false;
        this._profileOpen = false;
        this._render();
        setTimeout(() => { this._justClosed = false; }, 0);
        if (this._previousFocusedElement) {
          this._previousFocusedElement.focus();
          this._previousFocusedElement = null;
        }
      }
    };
    this._onDocumentClick = (event) => {
      if (!this._expanded && !this._profileOpen) return;
      const isClickInside = event.composedPath().some(el => el === this || (el.classList && (el.classList.contains('expanded') || el.classList.contains('profile-panel'))));
      if (!isClickInside && event.target !== this.shadowRoot.querySelector('[data-profile]') && event.target !== this.shadowRoot.querySelector('[data-expand]')) {
        this._expanded = false;
        this._profileOpen = false;
        this._render();
        if (this._previousFocusedElement) {
          this._previousFocusedElement.focus();
          this._previousFocusedElement = null;
        }
      }
    };
  }

  connectedCallback() {
    window.addEventListener('location-changed', this._onLocation);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('keydown', this._onKeydown, true);
    document.addEventListener('click', this._onDocumentClick, true);
    this._render();
  }
  disconnectedCallback() {
    window.removeEventListener('location-changed', this._onLocation);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('keydown', this._onKeydown, true);
    document.removeEventListener('click', this._onDocumentClick, true);
    clearTimeout(this._resizeTimer);
    clearInterval(this._positionTimer);
  }

  setConfig(config) {
    if (!config) throw new Error('Configuration required');
    this._config = {
      tabs: ND_DEFAULT_TABS,
      media_enabled: true,
      media_auto_discover: false,
      media_players: [],
      media_exclude: [],
      media_include_on: true,
      media_type_overrides: {},
      expanded_player: true,
      breakpoint: 768,
      mobile_mode: 'docked',
      desktop_mode: 'floating',
      mobile_show_labels: false,
      desktop_show_labels: true,
      profile_enabled: true,
      profile_panel_enabled: true,
      profile_label: 'Profil',
      profile_path: '/profile',
      profile_show_user: true,
      profile_show_system: true,
      profile_show_connection: true,
      profile_show_device: true,
      profile_entities: [],
      width: 520,
      bottom: 18,
      height: 68,
      show_labels: true,
      shadow: true,
      ...config,
    };
    this._render();
  }

  set preview(value) { this._preview = Boolean(value); this._render(); }

  set hass(value) {
    this._hass = value;
    const media = this._getActiveMedia();
    const signature = this._mediaCollectionSignature();
    const profileSignature = this._profileOpen ? JSON.stringify(this._getProfileData()) : null;
    const profileEntitiesSignature = this._profileOpen ? this._profileEntitiesSignature() : null;
    if (!this.shadowRoot.firstChild || signature !== this._lastMediaSignature || (this._profileOpen && (profileSignature !== this._lastProfileSignature || profileEntitiesSignature !== this._lastProfileEntitiesSignature))) {
      this._render();
    } else {
      this._activeMedia = media;
      this._updateLiveMedia();
      if (this._expanded) this._updatePosition();
    }
  }

  getCardSize() { return 1; }

  _isPreview() {
    if (this._preview || this.hasAttribute('preview')) return true;
    let node = this;
    const markers = ['hui-card-preview', 'hui-card-options', 'hui-dialog-edit-card', 'hui-card-editor'];
    while (node) {
      const name = String(node.tagName || '').toLowerCase();
      if (markers.some((marker) => name.includes(marker))) return true;
      const root = node.getRootNode?.();
      node = node.parentElement || (root && root.host ? root.host : null);
    }
    return false;
  }

  _getMediaEntities() {
    if (!this._hass) return [];
    const configured = this._config.media_players || [];
    const discovered = this._config.media_auto_discover
      ? Object.keys(this._hass.states).filter((id) => id.startsWith('media_player.'))
      : [];
    const excluded = new Set(this._config.media_exclude || []);
    return [...new Set([...configured, ...discovered])]
      .filter((id) => !excluded.has(id))
      .map((id) => this._hass.states[id])
      .filter(Boolean);
  }

  _getActiveMediaEntities() {
    const activeStates = this._config.media_include_on !== false
      ? ND_ACTIVE_STATES
      : new Set(['playing', 'paused', 'buffering']);
    return this._getMediaEntities()
      .filter((entity) => activeStates.has(entity.state))
      .sort((a, b) => Number(b.state === 'playing') - Number(a.state === 'playing'));
  }

  _getActiveMedia() {
    const entities = this._getActiveMediaEntities();
    if (!entities.length) { this._mediaIndex = 0; return null; }
    this._mediaIndex = Math.max(0, Math.min(this._mediaIndex, entities.length - 1));
    return entities[this._mediaIndex];
  }

  _mediaSignature(entity) {
    if (!entity) return 'none';
    const a = entity.attributes || {};
    const picturePath = String(a.entity_picture || '').split('?')[0];
    return JSON.stringify([
      entity.entity_id, entity.state, a.media_title, a.media_artist,
      a.media_series_title, a.app_name, a.source, picturePath,
      a.media_duration,
    ]);
  }

  _mediaCollectionSignature() {
    return this._getActiveMediaEntities().map((entity) => this._mediaSignature(entity)).join('||') || 'none';
  }

  _render() {
    if (!this._config || !this._hass) return;
    this._activeMedia = this._getActiveMedia();
    if (!this._activeMedia) this._expanded = false;
    this._lastMediaSignature = this._mediaCollectionSignature();
    this._lastProfileSignature = JSON.stringify(this._getProfileData());
    this._lastProfileEntitiesSignature = this._profileEntitiesSignature();

    const media = this._activeMedia;
    const tabs = Array.isArray(this._config.tabs) ? this._config.tabs : [];
    const profileEnabled = this._config.profile_enabled !== false;
    const mediaVisible = this._config.media_enabled !== false && Boolean(media);
    const preview = this._isPreview();
    if (preview) { this._expanded = false; this._profileOpen = false; }
    const maxWidth = Math.max(300, Number(this._config.width) || 520);
    const panelWidth = Math.max(300, Number(this._config.panel_width) || maxWidth);
    const bottom = Math.max(4, Number(this._config.bottom) || 18);
    const breakpoint = Math.max(480, Math.min(1600, Number(this._config.breakpoint) || 768));
    const isMobile = window.innerWidth < breakpoint;
    const placement = isMobile ? (this._config.mobile_mode || 'docked') : 'floating';
    const showLabels = isMobile
      ? (this._config.mobile_show_labels ?? this._config.show_labels ?? false)
      : (this._config.desktop_show_labels ?? this._config.show_labels ?? true);
    const height = Math.max(56, Math.min(90, Number(this._config.height) || 68));
    const iconSize = Math.max(18, Math.min(36, Number(this._config.icon_size) || 23));
    const labelSize = Math.max(9, Math.min(16, Number(this._config.label_size) || 11));
    const radius = Number(this._config.radius) > 0
      ? `${Math.min(60, Number(this._config.radius))}px`
      : 'var(--ha-card-border-radius,var(--card-border-radius,28px))';
    const mediaOffset = 78;

    const isDarkMode = Boolean(this._hass?.themes?.darkMode);
    const shadowStyle = isDarkMode
      ? '0 0 0 1px rgba(255,255,255,.075),0 14px 42px rgba(0,0,0,.38),0 3px 10px rgba(0,0,0,.24)'
      : '0 6px 20px rgba(0,0,0,.14),0 2px 6px rgba(0,0,0,.08)';
    const isMobileSheet = isMobile && (this._expanded || this._profileOpen);
    const closingClass = this._justClosed ? 'closing' : '';
    this.shadowRoot.innerHTML = `
      <style>${this._styles(maxWidth, bottom)}</style>
      <div class="spacer" aria-hidden="true"></div>
      ${!preview && (this._expanded || this._profileOpen) && !isMobileSheet ? '<button class="scrim" aria-label="Panel schließen"></button>' : ''}
      <section class="stack ${preview ? 'preview' : ''} ${isMobile ? 'mobile' : 'desktop'} ${isMobileSheet ? 'mobile-sheet' : ''} ${placement === 'docked' ? 'docked' : 'floating'} ${showLabels ? '' : 'hide-labels'} ${this._config.shadow === false ? 'no-shadow' : ''} ${closingClass}" style="--media-offset:${mediaOffset}px;--nd-height:${height}px;--nd-radius:${radius};--nd-icon-size:${iconSize}px;--nd-label-size:${labelSize}px;--nd-accent:var(--primary-color,#7d8fd3);--nd-max-width:${maxWidth}px;--nd-panel-width:${panelWidth}px;--nd-shadow:${shadowStyle}">
        ${this._profileOpen ? this._profilePanelTemplate(isMobileSheet) : ''}
        ${this._expanded && media ? this._expandedTemplate(media, isMobileSheet) : ''}
        ${!preview && mediaVisible && !this._expanded && !this._profileOpen ? this._compactTemplate(media) : ''}
        ${!isMobileSheet || (!this._expanded && !this._profileOpen) ? '<nav class="dock" aria-label="Dashboard Navigation">'+tabs.map((tab, index) => this._tabTemplate(tab, index)).join('')+(profileEnabled ? this._profileTemplate() : '')+'</nav>' : ''}
      </section>`;

    this._bindEvents();
  }

  _styles(maxWidth, bottom) {
    return `
      :host { display:block; min-height:1px; --nd-surface:var(--ha-card-background,var(--card-background-color,var(--primary-background-color,#fff))); --nd-surface-soft:var(--secondary-background-color,var(--primary-background-color,#eee)); --nd-border:var(--divider-color,rgba(127,127,127,.24)); font-family:var(--paper-font-body1_-_font-family,inherit); }
      *, *::before, *::after { box-sizing:border-box; }
      button { font:inherit; }
      .spacer { height:1px; }
      .stack { position:fixed; z-index:6; display:flex; flex-direction:column; gap:8px; pointer-events:none; transition:width .2s ease,bottom .2s ease; }
      .stack.floating{left:50%;bottom:${bottom}px;width:min(calc(100vw - 24px),var(--nd-max-width));transform:translateX(-50%)}
      .mobile.floating{bottom:calc(${bottom}px + 8px + env(safe-area-inset-bottom));width:min(calc(100vw - 48px),var(--nd-max-width))}
      .stack.docked{left:0;right:0;bottom:0;width:100%;transform:none;gap:6px}
      .stack.preview{position:relative;z-index:0;left:auto;right:auto;bottom:auto;width:min(100%,var(--nd-max-width));transform:none;margin:8px auto;pointer-events:none}
      .stack.mobile-sheet{position:fixed;bottom:0;left:50%;transform:translateX(-50%);z-index:99;flex-direction:column;gap:0;background:var(--nd-surface);border-radius:var(--nd-radius);width:calc(100vw - 24px);max-height:calc(100dvh - env(safe-area-inset-top) - 24px);overflow:hidden;pointer-events:auto}
      .stack.mobile-sheet .dock{position:relative}
      .stack.mobile-sheet .expanded,.stack.mobile-sheet .profile-panel{width:100%;max-height:calc(100dvh - env(safe-area-inset-top) - 24px - var(--nd-height) - 20px);border:0;box-shadow:none;border-radius:0;animation:none;padding:16px 16px;overflow:auto}
      .stack.mobile-sheet.closing .compact{animation:none}
      .preview .dock,.preview .tab{pointer-events:none}
      .preview.docked .dock{border-radius:var(--nd-radius);padding-bottom:6px}
      .docked .dock{width:100%;border-radius:var(--nd-radius) var(--nd-radius) 0 0;padding-bottom:max(6px,env(safe-area-inset-bottom))}
      .docked .compact{width:min(calc(100vw - 16px),var(--nd-max-width));align-self:center}.docked .expanded,.docked .profile-panel{width:min(calc(100vw - 16px),var(--nd-panel-width));align-self:center}
      .dock,.compact,.expanded,.profile-panel { pointer-events:auto; color:var(--primary-text-color); background:var(--nd-surface); border:var(--ha-card-border-width,1px) solid var(--nd-border); box-shadow:var(--nd-shadow,0 0 0 1px rgba(255,255,255,.075),0 14px 42px rgba(0,0,0,.38),0 3px 10px rgba(0,0,0,.24)); }
      .no-shadow .dock,.no-shadow .compact,.no-shadow .expanded,.no-shadow .profile-panel{box-shadow:none}
      .dock { min-height:var(--nd-height); border-radius:var(--nd-radius); padding:6px; display:flex; align-items:center; justify-content:space-around; gap:2px; overflow:hidden; }
      .tab { min-width:0; flex:1 1 0; height:calc(var(--nd-height) - 12px); padding:5px 4px; border:0; border-radius:999px; color:var(--secondary-text-color); background:transparent; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer; transition:transform .18s ease,background .18s ease,color .18s ease; }
      .tab:active { transform:scale(.94); }
      .tab.active { color:var(--nd-accent); background:var(--nd-surface-soft); box-shadow:inset 0 0 0 1px var(--nd-border); }
      .tab ha-icon { width:var(--nd-icon-size); height:var(--nd-icon-size); }
      .tab span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--nd-label-size); font-weight:650; }
      .hide-labels .tab>span:not(.avatar){display:none}.hide-labels .tab{gap:0}
      .profile .avatar { width:38px; height:38px; border-radius:50%; overflow:hidden; display:grid; place-items:center; background:var(--nd-surface-soft); }
      .profile.profile-ring-active .avatar { box-shadow:inset 0 0 0 2px var(--nd-accent); }
      .avatar img { width:100%; height:100%; object-fit:cover; }
      .avatar ha-icon { width:23px; height:23px; }
      .profile span { display:none; }
      .compact { min-height:var(--nd-height); border-radius:var(--nd-radius); padding:7px 8px; display:grid; grid-template-columns:50px minmax(0,1fr) auto; align-items:center; gap:10px; cursor:pointer; animation:nd-in .22s ease-out; }
      .cover { width:50px; height:50px; border-radius:17px; object-fit:cover; background:var(--nd-surface-soft); }
      .cover.fallback { display:grid; place-items:center; }
      .cover.fallback ha-icon { width:27px; height:27px; color:var(--nd-accent); }
      .meta { min-width:0; text-align:left; }
      .title,.subtitle { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .title { font-size:13px; font-weight:750; }
      .subtitle { margin-top:3px; color:var(--secondary-text-color); font-size:11px; font-weight:550; }
      .controls { display:flex; align-items:center; gap:2px; }
      .icon-btn { width:42px; height:42px; border:0; border-radius:50%; display:grid; place-items:center; cursor:pointer; color:var(--primary-text-color); background:transparent; }
      .icon-btn.primary { width:50px; height:50px; color:var(--text-primary-color,#fff); background:var(--nd-accent); box-shadow:0 7px 17px rgba(0,0,0,.18); }
      .icon-btn ha-icon { width:24px; height:24px; }
      .expanded { width:min(calc(100vw - 24px),var(--nd-panel-width));min-height:390px;align-self:center;border-radius:var(--nd-radius); padding:24px; animation:nd-sheet .25s cubic-bezier(.2,.8,.2,1); transform-origin:bottom center;display:flex;flex-direction:column;justify-content:space-between;touch-action:pan-y; }
      .expanded-head { display:grid; grid-template-columns:96px minmax(0,1fr) 40px; gap:16px; align-items:center; }
      .expanded .cover { width:96px; height:96px; border-radius:26px; }
      .expanded .title { font-size:19px; }
      .expanded .subtitle { margin-top:6px; font-size:13px; }
      .timeline { margin-top:18px; }
      input[type=range] { width:100%; accent-color:var(--nd-accent); cursor:pointer; }
      .times { display:flex; justify-content:space-between; color:var(--secondary-text-color); font-size:10px; margin-top:2px; }
      .large-controls { display:flex; justify-content:center; align-items:center; gap:20px; margin:13px 0 7px; }
      .large-controls .icon-btn { width:46px; height:46px; }
      .large-controls .primary { width:66px; height:66px; }
      .volume { display:grid; grid-template-columns:25px 1fr; align-items:center; gap:8px; }
      .volume ha-icon { color:var(--secondary-text-color); }
      .media-kind{display:inline-flex;margin-bottom:5px;padding:4px 8px;border-radius:999px;background:var(--nd-surface-soft);color:var(--nd-accent);font-size:10px;font-weight:750}.media-switcher{display:flex;align-items:center;gap:5px;margin-top:7px}.media-dot{width:4px;height:4px;min-width:4px;padding:0;border:0;border-radius:50%;background:var(--secondary-text-color);opacity:.4;cursor:pointer}.media-dot.active{width:5px;opacity:.8}.source-picker{display:grid;gap:7px;margin:16px 0;font-size:11px;font-weight:700;color:var(--secondary-text-color)}.source-picker select{width:100%;height:48px;padding:0 14px;border:1px solid var(--nd-border);border-radius:16px;color:var(--primary-text-color);background:var(--nd-surface-soft);font:inherit}.compact{touch-action:pan-y}
      .profile-panel{border-radius:var(--nd-radius);padding:16px;animation:nd-sheet .25s cubic-bezier(.2,.8,.2,1);transform-origin:bottom center;max-height:min(560px,calc(100vh - 120px));overflow:auto}.profile-header{display:grid;grid-template-columns:64px 1fr 40px;gap:14px;align-items:center;margin-bottom:18px}.profile-avatar-large{width:64px;height:64px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:var(--nd-surface-soft);flex-shrink:0}.profile-avatar-large img{width:100%;height:100%;object-fit:cover}.profile-avatar-large ha-icon{width:32px;height:32px;color:var(--nd-accent)}.profile-info{min-width:0}.profile-name{font-size:18px;font-weight:780;line-height:1.2}.profile-role{font-size:12px;color:var(--secondary-text-color);margin-top:2px;line-height:1.3}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.info-tile{display:grid;grid-template-columns:44px 1fr;gap:12px;align-items:start;padding:12px;border-radius:16px;background:var(--nd-surface-soft)}.info-icon{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:var(--nd-accent);background:var(--nd-surface);flex-shrink:0}.info-icon ha-icon{width:22px}.info-text{min-width:0}.info-label{font-size:10px;color:var(--secondary-text-color);font-weight:700;text-transform:uppercase;letter-spacing:.5px}.info-value{margin-top:3px;font-size:14px;font-weight:720;line-height:1.3}.profile-entities{display:grid;gap:9px}.profile-entity{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;width:100%;padding:11px;border:0;border-radius:14px;color:var(--primary-text-color);background:var(--nd-surface-soft);cursor:pointer;text-align:left}.profile-entity ha-icon{color:var(--nd-accent);width:20px}.entity-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.entity-id{font-size:10px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.entity-state{font-size:13px;font-weight:720;color:var(--nd-accent);white-space:nowrap}
      .profile-panel{width:min(calc(100vw - 24px),var(--nd-panel-width));min-height:370px;align-self:center;max-height:min(620px,calc(100vh - 120px))}
      .scrim { position:fixed; z-index:5; inset:0; width:100%; height:100%; border:0; padding:0; background:rgba(0,0,0,.16); cursor:default; animation:nd-fade .2s ease; }
      .closing .compact, .closing .expanded, .closing .profile-panel { animation:none !important; }
      @keyframes nd-sheet { from { opacity:0; transform:translateY(18px) scale(.97); } }
      @keyframes nd-in { from { opacity:0; transform:translateY(8px); } }
      @keyframes nd-fade { from { opacity:0; } }
      @media (max-width:430px) { .stack.floating{width:calc(100vw - 14px);bottom:max(8px,env(safe-area-inset-bottom));}.dock{min-height:64px}.tab{height:52px}.tab span{font-size:10px}.expanded{min-height:350px;padding:18px}.expanded-head{grid-template-columns:82px minmax(0,1fr) 36px}.expanded .cover{width:82px;height:82px}.profile-panel{min-height:330px;padding:14px}.profile-header{grid-template-columns:54px 1fr 36px;gap:12px;margin-bottom:14px}.profile-avatar-large{width:54px;height:54px}.profile-avatar-large ha-icon{width:28px}.info-grid{gap:8px;margin-bottom:12px}.info-tile{gap:10px;padding:10px}.info-icon{width:40px;height:40px;border-radius:12px}.info-icon ha-icon{width:20px}.compact{grid-template-columns:46px minmax(0,1fr) auto}.compact .cover{width:46px;height:46px}.compact .skip{display:none} }
      @media (prefers-reduced-motion:reduce) { * { animation:none!important; transition:none!important; } }
    `;
  }

  _tabTemplate(tab, index) {
    const path = String(tab.path || '');
    const active = path && (location.pathname === path || location.pathname.startsWith(`${path}/`));
    const icon = active && tab.active_icon ? tab.active_icon : (tab.icon || 'mdi:circle-outline');
    return `<button class="tab ${active ? 'active' : ''}" data-tab="${index}" title="${ndEsc(tab.label)}">
      <ha-icon icon="${ndEsc(icon)}"></ha-icon><span>${ndEsc(tab.label || `Tab ${index + 1}`)}</span>
    </button>`;
  }

  _profileTemplate() {
    const panelEnabled = this._config.profile_panel_enabled !== false;
    const active = !panelEnabled && location.pathname.startsWith(this._config.profile_path || '/profile');
    const { picture, userName } = this._getProfileData();
    const avatarClass = panelEnabled && this._profileOpen ? 'profile-ring-active' : '';
    return `<button class="tab profile ${active ? 'active' : ''} ${avatarClass}" data-profile title="${ndEsc(userName)}">
      <span class="avatar">${picture ? `<img src="${ndEsc(picture)}" alt="${ndEsc(userName)}">` : '<ha-icon icon="mdi:account"></ha-icon>'}</span>
      <span>${ndEsc(this._config.profile_label || 'Profil')}</span>
    </button>`;
  }

  _getProfileData() {
    const user = this._hass.user || {};
    const person = Object.values(this._hass.states || {}).find((entity) =>
      entity.entity_id.startsWith('person.') && entity.attributes?.user_id === user.id);
    const picture = this._config.profile_avatar || person?.attributes?.entity_picture || user.picture || user.image;
    const userName = user.name || this._config.profile_label || 'Profil';
    return { picture: picture || '', userName, person: person?.entity_id || '', userId: user.id || '' };
  }

  _profileEntitiesSignature() {
    return (this._config.profile_entities || []).map((id) => {
      const entity = this._hass?.states?.[id];
      return entity ? [id, entity.state, entity.attributes?.friendly_name, entity.attributes?.icon] : [id, null];
    }).flat().join('|');
  }

  _profilePanelTemplate(isMobileSheet) {
    const { picture, userName } = this._getProfileData();
    const user = this._hass.user || {};
    const tiles = [];
    if (this._config.profile_show_user !== false) tiles.push(this._infoTile('mdi:account-key', 'Benutzer', user.is_owner ? 'Eigentümer' : (user.is_admin ? 'Administrator' : 'Benutzer')));
    if (this._config.profile_show_system !== false) tiles.push(this._infoTile('mdi:home-assistant', this._hass.config?.location_name || 'Home Assistant', `Version ${this._hass.config?.version || '–'}`));
    if (this._config.profile_show_connection !== false) tiles.push(this._infoTile(navigator.onLine ? 'mdi:lan-connect' : 'mdi:lan-disconnect', 'Verbindung', navigator.onLine ? 'Online' : 'Offline'));
    if (this._config.profile_show_device !== false) {
      const device = /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'Apple' : /Windows/i.test(navigator.userAgent) ? 'Windows' : /Mac/i.test(navigator.userAgent) ? 'macOS' : 'Browser';
      tiles.push(this._infoTile('mdi:devices', 'Gerät', `${device} · ${window.innerWidth}×${window.innerHeight}`));
    }
    const entities = (this._config.profile_entities || []).map((id) => this._hass.states[id]).filter(Boolean);
    const closeIcon = isMobileSheet ? 'mdi:close' : 'mdi:chevron-down';
    return `<article class="profile-panel${isMobileSheet ? ' mobile-sheet' : ''}" aria-label="Profilinformationen"><div class="profile-header"><div class="profile-avatar-large">${picture ? `<img src="${ndEsc(picture)}" alt="${ndEsc(userName)}">` : '<ha-icon icon="mdi:account"></ha-icon>'}</div><div class="profile-info"><div class="profile-name">${ndEsc(userName)}</div><div class="profile-role">${ndEsc(this._hass.config?.location_name || 'Home Assistant')}</div></div><button class="icon-btn" data-close-profile aria-label="${isMobileSheet ? 'Schließen' : 'Einklappen'}"><ha-icon icon="${closeIcon}"></ha-icon></button></div>${tiles.length ? '<div class="info-grid">'+tiles.join('')+'</div>' : ''}${entities.length ? '<div class="profile-entities">'+entities.map((entity) => this._profileEntityTemplate(entity)).join('')+'</div>' : ''}</article>`;
  }

  _infoTile(icon, label, value) {
    return `<div class="info-tile"><div class="info-icon"><ha-icon icon="${icon}"></ha-icon></div><div class="info-text"><div class="info-label">${ndEsc(label)}</div><div class="info-value">${ndEsc(value)}</div></div></div>`;
  }

  _profileEntityTemplate(entity) {
    const icon = entity.attributes.icon || 'mdi:circle-outline';
    const name = entity.attributes.friendly_name || entity.entity_id;
    const state = this._hass.formatEntityState ? this._hass.formatEntityState(entity) : entity.state;
    return `<button class="profile-entity" data-profile-entity="${ndEsc(entity.entity_id)}"><ha-icon icon="${ndEsc(icon)}"></ha-icon><span><div class="entity-name">${ndEsc(name)}</div><div class="entity-id">${ndEsc(entity.entity_id)}</div></span><span class="entity-state">${ndEsc(state)}</span></button>`;
  }

  _cover(entity, className = '') {
    const picture = entity.attributes.entity_picture;
    if (picture) return `<img class="cover ${className}" src="${ndEsc(picture)}" alt="">`;
    return `<span class="cover fallback ${className}"><ha-icon icon="mdi:music-note"></ha-icon></span>`;
  }

  _mediaKind(entity) {
    const overrides = this._config.media_type_overrides || {};
    if (overrides[entity.entity_id]) return overrides[entity.entity_id];
    const a = entity.attributes || {};
    const haystack = [a.device_class, a.media_content_type, a.app_name, a.source, a.friendly_name].join(' ').toLowerCase();
    return /tv|television|video|receiver|magenta|netflix|prime|plex/.test(haystack) ? 'tv' : 'music';
  }

  _mediaDots() {
    const entities = this._getActiveMediaEntities();
    if (entities.length < 2) return '';
    return `<div class="media-switcher" aria-label="Aktive Media Player">${entities.map((entity, index) => `<button class="media-dot ${index === this._mediaIndex ? 'active' : ''}" data-media-select="${index}" title="${ndEsc(entity.attributes.friendly_name || entity.entity_id)}"></button>`).join('')}</div>`;
  }

  _compactTemplate(entity) {
    const a = entity.attributes;
    const kind = this._mediaKind(entity);
    return `<article class="compact" data-expand data-swipe-media role="button" tabindex="0" aria-label="Media Player öffnen">
      ${this._cover(entity)}
      <div class="meta"><div class="title live-title">${ndEsc(a.media_title || a.friendly_name || 'Media Player')}</div><div class="subtitle live-subtitle">${kind === 'tv' ? 'TV · ' : 'Musik · '}${ndEsc(a.media_artist || a.media_series_title || a.app_name || a.source || '')}</div>${this._mediaDots()}</div>
      <div class="controls">
        <button class="icon-btn skip" data-service="media_previous_track" aria-label="Zurück"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
        ${this._playButton(entity, false)}
        <button class="icon-btn skip" data-service="media_next_track" aria-label="Weiter"><ha-icon icon="mdi:skip-next"></ha-icon></button>
      </div>
    </article>`;
  }

  _playButton(entity, large) {
    const icon = entity.state === 'playing' ? 'mdi:pause' : 'mdi:play';
    return `<button class="icon-btn primary ${large ? 'large' : ''}" data-service="toggle_playback" aria-label="Wiedergabe"><ha-icon icon="${icon}"></ha-icon></button>`;
  }

  _expandedTemplate(entity, isMobileSheet) {
    const a = entity.attributes;
    const kind = this._mediaKind(entity);
    const duration = Number(a.media_duration) || 0;
    const position = this._position(entity);
    const volume = Math.round((Number(a.volume_level) || 0) * 100);
    const sources = Array.isArray(a.source_list) ? a.source_list : [];
    const closeIcon = isMobileSheet ? 'mdi:close' : 'mdi:chevron-down';
    return `<article class="expanded ${kind}${isMobileSheet ? ' mobile-sheet' : ''}" data-swipe-media aria-label="Erweiterter Media Player">
      <div class="expanded-head">${this._cover(entity)}<div class="meta"><div class="media-kind">${kind === 'tv' ? 'Fernsehen' : 'Musik'}</div><div class="title live-title">${ndEsc(a.media_title || a.friendly_name || 'Media Player')}</div><div class="subtitle live-subtitle">${ndEsc(a.media_artist || a.media_series_title || a.app_name || a.source || '')}</div>${!isMobileSheet ? this._mediaDots() : ''}</div><button class="icon-btn" data-collapse aria-label="${isMobileSheet ? 'Schließen' : 'Einklappen'}"><ha-icon icon="${closeIcon}"></ha-icon></button></div>
      ${duration ? `<div class="timeline"><input data-seek type="range" min="0" max="${duration}" step="1" value="${position}"><div class="times"><span class="live-position">${ndTime(position)}</span><span>${ndTime(duration)}</span></div></div>` : ''}
      ${kind === 'tv' && sources.length ? `<label class="source-picker"><span>Sender / Quelle</span><select data-source>${sources.map((source) => `<option value="${ndEsc(source)}" ${source === a.source ? 'selected' : ''}>${ndEsc(source)}</option>`).join('')}</select></label>` : ''}
      <div class="large-controls"><button class="icon-btn" data-service="media_previous_track"><ha-icon icon="${kind === 'tv' ? 'mdi:chevron-left' : 'mdi:skip-previous'}"></ha-icon></button>${this._playButton(entity, true)}<button class="icon-btn" data-service="media_next_track"><ha-icon icon="${kind === 'tv' ? 'mdi:chevron-right' : 'mdi:skip-next'}"></ha-icon></button></div>
      <div class="volume"><ha-icon icon="${a.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-medium'}"></ha-icon><input data-volume type="range" min="0" max="100" step="1" value="${volume}"></div>
    </article>`;
  }

  _position(entity) {
    let position = Number(entity.attributes.media_position) || 0;
    const updated = entity.attributes.media_position_updated_at;
    if (entity.state === 'playing' && updated) position += Math.max(0, (Date.now() - Date.parse(updated)) / 1000);
    return Math.min(position, Number(entity.attributes.media_duration) || position);
  }

  _call(service, data = {}) {
    const entity = this._activeMedia;
    if (!entity) return;
    const resolvedService = service === 'toggle_playback'
      ? (entity.state === 'playing' ? 'media_pause' : 'media_play')
      : service;
    Promise.resolve(this._hass.callService('media_player', resolvedService, { entity_id: entity.entity_id, ...data }))
      .catch((error) => console.warn('[NavDock] media service failed', resolvedService, error));
  }

  _bindEvents() {
    this.shadowRoot.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
      const tab = this._config.tabs[Number(button.dataset.tab)];
      if (tab?.path) ndNavigate(tab.path);
    }));
    this.shadowRoot.querySelector('[data-profile]')?.addEventListener('click', () => {
      if (this._config.profile_panel_enabled !== false) {
        this._previousFocusedElement = this.shadowRoot.querySelector('[data-profile]');
        this._expanded = false;
        this._profileOpen = !this._profileOpen;
        this._render();
        if (this._profileOpen) {
          setTimeout(() => this._focusFirstInteractive('.profile-panel'), 0);
        }
      } else ndNavigate(this._config.profile_path || '/profile');
    });
    this.shadowRoot.querySelector('[data-expand]')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-service],[data-media-select]')) return;
      if (this._config.expanded_player !== false) {
        this._previousFocusedElement = this.shadowRoot.querySelector('[data-expand]');
        this._profileOpen = false;
        this._expanded = true;
        this._render();
        setTimeout(() => this._focusFirstInteractive('.expanded'), 0);
      }
    });
    this.shadowRoot.querySelector('.scrim')?.addEventListener('click', () => {
      this._justClosed = true;
      this._expanded = false;
      this._profileOpen = false;
      this._render();
      setTimeout(() => { this._justClosed = false; }, 0);
    });
    this.shadowRoot.querySelector('[data-collapse]')?.addEventListener('click', () => {
      this._justClosed = true;
      this._expanded = false;
      this._render();
      setTimeout(() => { this._justClosed = false; }, 0);
    });
    this.shadowRoot.querySelector('[data-close-profile]')?.addEventListener('click', () => {
      this._justClosed = true;
      this._profileOpen = false;
      this._render();
      setTimeout(() => { this._justClosed = false; }, 0);
    });
    this.shadowRoot.querySelectorAll('[data-profile-entity]').forEach((button) => button.addEventListener('click', () => ndFire(this, 'hass-more-info', { entityId: button.dataset.profileEntity })));
    this.shadowRoot.querySelectorAll('[data-service]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation(); this._call(button.dataset.service);
    }));
    this.shadowRoot.querySelectorAll('[data-media-select]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation(); this._mediaIndex = Number(button.dataset.mediaSelect); this._render();
    }));
    this.shadowRoot.querySelector('[data-source]')?.addEventListener('change', (event) => this._call('select_source', { source: event.target.value }));
    this.shadowRoot.querySelector('[data-seek]')?.addEventListener('change', (event) => this._call('media_seek', { seek_position: Number(event.target.value) }));
    const volumeSlider = this.shadowRoot.querySelector('[data-volume]');
    if (volumeSlider) {
      volumeSlider.addEventListener('pointerdown', () => { this._volumeSliderActive = true; });
      volumeSlider.addEventListener('pointerup', () => { this._volumeSliderActive = false; });
      volumeSlider.addEventListener('change', (event) => this._call('volume_set', { volume_level: Number(event.target.value) / 100 }));
    }
    const compactCover = this.shadowRoot.querySelector('.compact .cover');
    if (compactCover && this._activeMedia?.attributes.entity_picture) {
      compactCover.addEventListener('load', () => {});
      compactCover.src = this._activeMedia.attributes.entity_picture;
    }
    this.shadowRoot.querySelectorAll('[data-swipe-media]').forEach((element) => this._bindMediaSwipe(element));
    clearInterval(this._positionTimer);
    if (this._expanded && this._activeMedia?.state === 'playing') this._positionTimer = setInterval(() => this._updatePosition(), 1000);
  }

  _bindMediaSwipe(element) {
    let startX = null;
    element.addEventListener('pointerdown', (event) => { if (!event.target.closest('input,select,button')) startX = event.clientX; });
    element.addEventListener('pointerup', (event) => {
      if (startX === null) return;
      const delta = event.clientX - startX;
      startX = null;
      const count = this._getActiveMediaEntities().length;
      if (count < 2 || Math.abs(delta) < 45) return;
      this._mediaIndex = delta < 0 ? (this._mediaIndex + 1) % count : (this._mediaIndex - 1 + count) % count;
      this._render();
    });
    element.addEventListener('pointercancel', () => { startX = null; });
  }

  _focusFirstInteractive(selector) {
    const panel = this.shadowRoot.querySelector(selector);
    if (!panel) return;
    const focusable = panel.querySelector('button,input,[tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  }

  _updatePosition() {
    const entity = this._getActiveMedia();
    const input = this.shadowRoot.querySelector('[data-seek]');
    const label = this.shadowRoot.querySelector('.live-position');
    if (!entity || !input) return;
    const value = this._position(entity);
    input.value = value;
    if (label) label.textContent = ndTime(value);
  }

  _updateLiveMedia() {
    const entity = this._getActiveMedia();
    if (!entity) return this._render();
    const title = entity.attributes.media_title || entity.attributes.friendly_name || 'Media Player';
    const subtitle = entity.attributes.media_artist || entity.attributes.media_series_title || entity.attributes.app_name || entity.attributes.source || '';
    this.shadowRoot.querySelectorAll('.live-title').forEach((node) => { node.textContent = title; });
    this.shadowRoot.querySelectorAll('.live-subtitle').forEach((node) => { node.textContent = subtitle; });
    const playIcon = entity.state === 'playing' ? 'mdi:pause' : 'mdi:play';
    this.shadowRoot.querySelectorAll('[data-service="toggle_playback"] ha-icon').forEach((node) => node.setAttribute('icon', playIcon));
    const volumeSlider = this.shadowRoot.querySelector('[data-volume]');
    if (volumeSlider && !this._volumeSliderActive) {
      const volume = Math.round((Number(entity.attributes.volume_level) || 0) * 100);
      volumeSlider.value = volume;
    }
    const volumeIcon = this.shadowRoot.querySelector('.volume ha-icon');
    if (volumeIcon) {
      const icon = entity.attributes.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-medium';
      volumeIcon.setAttribute('icon', icon);
    }
  }
}

class NavDockCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); this._editorPage = 'dock'; this._selfUpdate = false; }
  set hass(value) {
    this._hass = value;
    if (!this.shadowRoot.firstChild) this._render();
    else {
      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => { picker.hass = value; });
      this.shadowRoot.querySelectorAll('ha-icon-picker').forEach((picker) => { picker.hass = value; });
    }
  }
  setConfig(config) { this._config = { tabs: ND_DEFAULT_TABS.map((tab) => ({ ...tab })), ...config }; if (!this._selfUpdate) this._render(); this._selfUpdate = false; }

  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const media = Array.isArray(c.media_players) ? c.media_players : [];
    const profileEntities = Array.isArray(c.profile_entities) ? c.profile_entities : [];
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;max-width:100%;overflow:hidden;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}*{box-sizing:border-box;min-width:0}.editor{display:grid;gap:10px;width:100%}.group{padding:14px;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,22px);background:var(--ha-card-background,var(--card-background-color));overflow:hidden}.group-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.group-icon{flex:0 0 36px;width:36px;height:36px;border-radius:13px;display:grid;place-items:center;color:var(--primary-color);background:var(--secondary-background-color)}.group-icon ha-icon{width:21px}.group-title{font-size:15px;font-weight:750}.hint{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.subhead{margin:13px 0 5px;font-size:12px;font-weight:750}.row{display:grid;grid-template-columns:1fr;gap:9px;margin-top:10px}.field{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:650;color:var(--secondary-text-color)}input{width:100%;height:44px;padding:0 12px;color:var(--primary-text-color);background:var(--primary-background-color);border:1px solid var(--divider-color);border-radius:14px;outline:none}input:focus{border:2px solid var(--primary-color)}ha-icon-picker{width:100%;max-width:100%;min-height:44px}.icon-choice{display:grid;grid-template-columns:42px minmax(0,1fr);gap:7px;align-items:center;padding:5px;border:1px solid var(--divider-color);border-radius:16px;background:var(--primary-background-color);overflow:hidden}.icon-preview{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:var(--primary-color);background:var(--secondary-background-color)}.toggle-grid{display:grid;grid-template-columns:1fr;gap:7px}.toggle{min-height:48px;padding:8px 11px;border-radius:15px;display:flex;align-items:center;gap:9px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:12px;font-weight:650}.toggle input{width:19px;height:19px;accent-color:var(--primary-color)}.segments{display:flex;gap:5px;padding:4px;border-radius:15px;background:var(--secondary-background-color);overflow:hidden}.segments button{flex:1;min-width:0;padding:7px 5px;font-size:11px}.advanced{margin-top:10px;border-radius:16px;background:var(--secondary-background-color);overflow:hidden}.advanced summary{padding:12px;cursor:pointer;font-size:12px;font-weight:720}.advanced-body{padding:0 12px 12px}.tabedit{margin-top:7px;border-radius:17px;background:var(--secondary-background-color);overflow:hidden}.tabedit summary{display:flex;align-items:center;gap:9px;padding:10px;cursor:pointer;list-style:none}.tabedit summary::-webkit-details-marker{display:none}.tabbody{padding:0 10px 10px}.tabhead{display:flex;align-items:center;justify-content:flex-end;margin-top:8px}.tabnumber{display:flex;align-items:center;gap:9px;font-weight:750;overflow:hidden}.tabnumber>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dragdot{flex:0 0 30px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--primary-background-color);color:var(--primary-color)}.actions{display:flex;gap:5px}button{min-height:36px;border:0;border-radius:12px;padding:7px 10px;color:var(--primary-text-color);background:var(--primary-background-color);cursor:pointer;font-weight:650}.selected,.add{color:var(--text-primary-color,#fff);background:var(--primary-color)}.actions button{width:36px;padding:0}.add{width:100%;margin-top:9px;min-height:44px}.media-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;margin-top:7px}.media-row ha-entity-picker{width:100%;max-width:100%}.media-type{min-height:44px;padding:0 10px;color:var(--primary-text-color);background:var(--primary-background-color);border:1px solid var(--divider-color);border-radius:14px;outline:none;font-size:11px;font-weight:650}.media-type:focus{border:2px solid var(--primary-color)}.empty{padding:11px;text-align:center;color:var(--secondary-text-color);font-size:11px;border:1px dashed var(--divider-color);border-radius:14px}
      .page-nav{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:5px;margin-bottom:2px;border-radius:17px;background:var(--secondary-background-color)}.page-nav button{display:grid;place-items:center;gap:2px;padding:7px 3px;font-size:10px;background:transparent}.page-nav button ha-icon{width:20px}.page-nav button.selected{color:var(--text-primary-color,#fff);background:var(--primary-color)}
    </style>
    <div class="editor">
      <nav class="page-nav"><button data-editor-page="dock" class="${this._editorPage === 'dock' ? 'selected' : ''}"><ha-icon icon="mdi:dock-bottom"></ha-icon>Dock</button><button data-editor-page="tabs" class="${this._editorPage === 'tabs' ? 'selected' : ''}"><ha-icon icon="mdi:tab"></ha-icon>Tabs</button><button data-editor-page="media" class="${this._editorPage === 'media' ? 'selected' : ''}"><ha-icon icon="mdi:play-circle"></ha-icon>Medien</button><button data-editor-page="profile" class="${this._editorPage === 'profile' ? 'selected' : ''}"><ha-icon icon="mdi:account-circle"></ha-icon>Profil</button></nav>
      ${this._editorPage === 'dock' ? this._group('mdi:responsive','Dock','Mobil und Desktop automatisch passend',`<div class="subhead">Mobil</div><div class="segments"><button data-placement-key="mobile_mode" data-placement="docked" class="${(c.mobile_mode || 'docked') === 'docked' ? 'selected' : ''}">Angeheftet</button><button data-placement-key="mobile_mode" data-placement="floating" class="${c.mobile_mode === 'floating' ? 'selected' : ''}">Schwebend</button></div><div class="subhead">Desktop</div><div class="segments"><button data-placement-key="desktop_mode" data-placement="floating" class="${(c.desktop_mode || 'floating') === 'floating' ? 'selected' : ''}">Schwebend</button><button data-placement-key="desktop_mode" data-placement="docked" class="${c.desktop_mode === 'docked' ? 'selected' : ''}">Angeheftet</button></div><div class="toggle-grid"><label class="toggle"><input data-check="mobile_show_labels" type="checkbox" ${c.mobile_show_labels === true ? 'checked' : ''}>Labels mobil</label><label class="toggle"><input data-check="desktop_show_labels" type="checkbox" ${c.desktop_show_labels !== false ? 'checked' : ''}>Labels Desktop</label><label class="toggle"><input data-check="shadow" type="checkbox" ${c.shadow !== false ? 'checked' : ''}>Abhebung vom Hintergrund</label></div><details class="advanced"><summary>Aussehen & Größe</summary><div class="advanced-body"><div class="segments"><button data-radius="0" class="${!Number(c.radius) ? 'selected' : ''}">Theme</button><button data-radius="24" class="${Number(c.radius) === 24 ? 'selected' : ''}">Rund</button><button data-radius="40" class="${Number(c.radius) === 40 ? 'selected' : ''}">Pill</button></div><div class="row"><label class="field">Desktop ab Breite<input data-key="breakpoint" type="number" value="${ndEsc(c.breakpoint ?? 768)}"></label><label class="field">Maximale Breite<input data-key="width" type="number" value="${ndEsc(c.width ?? 520)}"></label><label class="field">Abstand unten<input data-key="bottom" type="number" value="${ndEsc(c.bottom ?? 18)}"></label><label class="field">Dock-Höhe<input data-key="height" type="number" value="${ndEsc(c.height ?? 68)}"></label></div></div></details>`) : ''}
      ${this._editorPage === 'tabs' ? this._group('mdi:tab','Navigation','Tab antippen, um ihn zu bearbeiten',`${(c.tabs || []).map((tab,index)=>this._tabEditor(tab,index)).join('')}<button class="add" data-add-tab>+ Tab hinzufügen</button>`) : ''}
      ${this._editorPage === 'media' ? this._group('mdi:play-circle','Medien','Aktive Player erkennen und per Wischgeste wechseln',`<div class="toggle-grid"><label class="toggle"><input data-check="media_enabled" type="checkbox" ${c.media_enabled !== false ? 'checked' : ''}>Media-Player anzeigen</label><label class="toggle"><input data-check="expanded_player" type="checkbox" ${c.expanded_player !== false ? 'checked' : ''}>Großes Panel</label><label class="toggle"><input data-check="media_auto_discover" type="checkbox" ${c.media_auto_discover === true ? 'checked' : ''}>Player automatisch erkennen</label><label class="toggle"><input data-check="media_include_on" type="checkbox" ${c.media_include_on !== false ? 'checked' : ''}>Zustand "on" als aktiv</label></div><details class="advanced"><summary>Player manuell auswählen</summary><div class="advanced-body"><div class="media-list">${media.length ? media.map((id,index)=>'<div class="media-row"><ha-entity-picker data-media-index="'+index+'" value="'+ndEsc(id)+'"></ha-entity-picker><select data-media-type="'+index+'" class="media-type"><option value="">Auto</option><option value="music" '+(c.media_type_overrides?.[id] === 'music' ? 'selected' : '')+'>Musik</option><option value="tv" '+(c.media_type_overrides?.[id] === 'tv' ? 'selected' : '')+'>TV</option></select><button data-remove-media="'+index+'">✕</button></div>').join('') : '<div class="empty">Keine manuelle Auswahl</div>'}</div><button class="add" data-add-media>+ Player</button></div></details>${c.media_auto_discover === true ? '<details class="advanced"><summary>Player ausschließen</summary><div class="advanced-body"><div class="media-list">'+((c.media_exclude || []).length ? (c.media_exclude || []).map((id,index)=>'<div class="media-row"><ha-entity-picker data-exclude-index="'+index+'" value="'+ndEsc(id)+'"></ha-entity-picker><button data-remove-exclude="'+index+'">✕</button></div>').join('') : '<div class="empty">Keine Ausschlüsse</div>')+'</div><button class="add" data-add-exclude>+ Ausschließen</button></div></details>' : ''}`) : ''}
      ${this._editorPage === 'profile' ? this._group('mdi:account-circle','Profil','Persönliche Infos und eigene Entitäten',`<div class="toggle-grid"><label class="toggle"><input data-check="profile_enabled" type="checkbox" ${c.profile_enabled !== false ? 'checked' : ''}>Profil anzeigen</label><label class="toggle"><input data-check="profile_panel_enabled" type="checkbox" ${c.profile_panel_enabled !== false ? 'checked' : ''}>Panel beim Tippen</label><label class="toggle"><input data-check="profile_show_user" type="checkbox" ${c.profile_show_user !== false ? 'checked' : ''}>Benutzerrolle</label><label class="toggle"><input data-check="profile_show_system" type="checkbox" ${c.profile_show_system !== false ? 'checked' : ''}>HA-Informationen</label><label class="toggle"><input data-check="profile_show_connection" type="checkbox" ${c.profile_show_connection !== false ? 'checked' : ''}>Verbindung</label><label class="toggle"><input data-check="profile_show_device" type="checkbox" ${c.profile_show_device !== false ? 'checked' : ''}>Dieses Gerät</label></div><details class="advanced"><summary>Weitere Profiloptionen</summary><div class="advanced-body"><div class="row"><label class="field">Bezeichnung<input data-key="profile_label" value="${ndEsc(c.profile_label || 'Profil')}"></label><label class="field">Pfad ohne Panel<input data-key="profile_path" value="${ndEsc(c.profile_path || '/profile')}"></label><label class="field">Avatar optional<input data-key="profile_avatar" value="${ndEsc(c.profile_avatar || '')}"></label></div><div class="subhead">Entitäten</div>${profileEntities.length ? profileEntities.map((id,index)=>`<div class="media-row"><ha-entity-picker data-profile-entity-index="${index}" value="${ndEsc(id)}"></ha-entity-picker><button data-remove-profile-entity="${index}">✕</button></div>`).join('') : '<div class="empty">Keine zusätzlichen Entitäten</div>'}<button class="add" data-add-profile-entity>+ Entität</button></div></details>`) : ''}
    </div>`;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => {
      picker.hass = this._hass;
      if (picker.hasAttribute('data-media-index') || picker.hasAttribute('data-exclude-index')) picker.includeDomains = ['media_player'];
    });
    this.shadowRoot.querySelectorAll('ha-icon-picker').forEach((picker) => { picker.hass = this._hass; });
    this._bind();
  }

  _group(icon, title, hint, content) { return `<section class="group"><div class="group-head"><span class="group-icon"><ha-icon icon="${icon}"></ha-icon></span><div><div class="group-title">${title}</div><div class="hint">${hint}</div></div></div>${content}</section>`; }

  _tabEditor(tab, index) {
    return `<details class="tabedit" data-index="${index}"><summary><span class="dragdot"><ha-icon icon="${ndEsc(tab.icon || 'mdi:circle-outline')}"></ha-icon></span><span class="tabnumber"><span>${ndEsc(tab.label || `Tab ${index + 1}`)}</span></span></summary><div class="tabbody"><div class="tabhead"><span class="actions"><button data-up title="Nach oben">↑</button><button data-down title="Nach unten">↓</button><button data-delete title="Löschen">✕</button></span></div><div class="row"><label class="field">Name<input data-tab-key="label" value="${ndEsc(tab.label || '')}"></label><label class="field">Icon<div class="icon-choice"><span class="icon-preview"><ha-icon icon="${ndEsc(tab.icon || 'mdi:circle-outline')}"></ha-icon></span><ha-icon-picker data-tab-icon="icon" value="${ndEsc(tab.icon || '')}"></ha-icon-picker></div></label><label class="field">Aktives Icon<div class="icon-choice"><span class="icon-preview"><ha-icon icon="${ndEsc(tab.active_icon || tab.icon || 'mdi:circle')}"></ha-icon></span><ha-icon-picker data-tab-icon="active_icon" value="${ndEsc(tab.active_icon || '')}"></ha-icon-picker></div></label><label class="field">Navigationspfad<input data-tab-key="path" value="${ndEsc(tab.path || '')}" placeholder="/dashboard/view"></label></div></div></details>`;
  }

  _emit(next) { this._config = next; this._selfUpdate = true; ndFire(this, 'config-changed', { config: next }); }
  _bind() {
    this.shadowRoot.querySelectorAll('[data-editor-page]').forEach((button) => button.addEventListener('click', () => { this._editorPage = button.dataset.editorPage; this._render(); }));
    this.shadowRoot.querySelectorAll('[data-key]').forEach((input) => input.addEventListener('change', () => {
      const numeric = input.type === 'number';
      if (numeric && input.value === '') {
        const next = { ...this._config };
        delete next[input.dataset.key];
        this._emit(next);
      } else {
        this._emit({ ...this._config, [input.dataset.key]: numeric ? Number(input.value) : input.value });
      }
    }));
    this.shadowRoot.querySelectorAll('[data-check]').forEach((input) => input.addEventListener('change', () => this._emit({ ...this._config, [input.dataset.check]: input.checked })));
    this.shadowRoot.querySelectorAll('[data-radius]').forEach((button) => button.addEventListener('click', () => { this._emit({ ...this._config, radius: Number(button.dataset.radius) }); this._render(); }));
    this.shadowRoot.querySelectorAll('[data-placement-key]').forEach((button) => button.addEventListener('click', () => { this._emit({ ...this._config, [button.dataset.placementKey]: button.dataset.placement }); this._render(); }));
    this.shadowRoot.querySelectorAll('[data-media-index]').forEach((picker) => picker.addEventListener('value-changed', (event) => {
      const players = [...(this._config.media_players || [])];
      players[Number(picker.dataset.mediaIndex)] = event.detail.value;
      const filtered = players.filter(Boolean);
      this._emit({ ...this._config, media_players: filtered });
      if (filtered.length < players.length) this._render();
    }));
    this.shadowRoot.querySelectorAll('[data-media-type]').forEach((select) => select.addEventListener('change', () => {
      const index = Number(select.dataset.mediaType);
      const playerId = this._config.media_players[index];
      const overrides = { ...(this._config.media_type_overrides || {}) };
      if (select.value) overrides[playerId] = select.value;
      else delete overrides[playerId];
      this._emit({ ...this._config, media_type_overrides: overrides });
    }));
    this.shadowRoot.querySelectorAll('[data-remove-media]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.removeMedia); this._emit({ ...this._config, media_players: (this._config.media_players || []).filter((_,i)=>i!==index) }); this._render(); }));
    this.shadowRoot.querySelector('[data-add-media]')?.addEventListener('click', () => { this._emit({ ...this._config, media_players: [...(this._config.media_players || []), ''] }); this._render(); });
    this.shadowRoot.querySelectorAll('[data-exclude-index]').forEach((picker) => picker.addEventListener('value-changed', (event) => {
      const excluded = [...(this._config.media_exclude || [])];
      excluded[Number(picker.dataset.excludeIndex)] = event.detail.value;
      this._emit({ ...this._config, media_exclude: excluded.filter(Boolean) });
    }));
    this.shadowRoot.querySelectorAll('[data-remove-exclude]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.removeExclude); this._emit({ ...this._config, media_exclude: (this._config.media_exclude || []).filter((_,i)=>i!==index) }); this._render(); }));
    this.shadowRoot.querySelector('[data-add-exclude]')?.addEventListener('click', () => { this._emit({ ...this._config, media_exclude: [...(this._config.media_exclude || []), ''] }); this._render(); });
    this.shadowRoot.querySelectorAll('[data-profile-entity-index]').forEach((picker) => picker.addEventListener('value-changed', (event) => {
      const entities = [...(this._config.profile_entities || [])];
      entities[Number(picker.dataset.profileEntityIndex)] = event.detail.value;
      const filtered = entities.filter(Boolean);
      this._emit({ ...this._config, profile_entities: filtered });
      if (filtered.length < entities.length) this._render();
    }));
    this.shadowRoot.querySelectorAll('[data-remove-profile-entity]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.removeProfileEntity); this._emit({ ...this._config, profile_entities: (this._config.profile_entities || []).filter((_,i)=>i!==index) }); this._render(); }));
    this.shadowRoot.querySelector('[data-add-profile-entity]')?.addEventListener('click', () => { this._emit({ ...this._config, profile_entities: [...(this._config.profile_entities || []), ''] }); this._render(); });
    this.shadowRoot.querySelectorAll('.tabedit').forEach((box) => {
      const index = Number(box.dataset.index);
      box.querySelectorAll('[data-tab-key]').forEach((input) => input.addEventListener('change', () => { const tabs = this._config.tabs.map((t) => ({ ...t })); tabs[index][input.dataset.tabKey] = input.value; this._emit({ ...this._config, tabs }); }));
      box.querySelectorAll('[data-tab-icon]').forEach((picker) => picker.addEventListener('value-changed', (event) => {
        const tabs = this._config.tabs.map((t) => ({ ...t }));
        tabs[index][picker.dataset.tabIcon] = event.detail.value;
        this._emit({ ...this._config, tabs });
        const preview = picker.closest('.icon-choice')?.querySelector('.icon-preview ha-icon');
        if (preview) preview.setAttribute('icon', event.detail.value || 'mdi:circle-outline');
      }));
      box.querySelector('[data-delete]').addEventListener('click', () => { const tabs = this._config.tabs.filter((_, i) => i !== index); this._emit({ ...this._config, tabs }); this._render(); });
      box.querySelector('[data-up]').addEventListener('click', () => this._move(index, -1));
      box.querySelector('[data-down]').addEventListener('click', () => this._move(index, 1));
    });
    this.shadowRoot.querySelector('[data-add-tab]')?.addEventListener('click', () => { const tabs = [...(this._config.tabs || []), { label: 'Neuer Tab', icon: 'mdi:circle-outline', path: '' }]; this._emit({ ...this._config, tabs }); this._render(); });
  }
  _move(index, delta) { const target = index + delta; const tabs = [...this._config.tabs]; if (target < 0 || target >= tabs.length) return; [tabs[index], tabs[target]] = [tabs[target], tabs[index]]; this._emit({ ...this._config, tabs }); this._render(); }
}

if (!customElements.get('navdock-card')) customElements.define('navdock-card', NavDockCard);
if (!customElements.get('navdock-card-editor')) customElements.define('navdock-card-editor', NavDockCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'navdock-card',
  name: 'NavDock Card',
  description: 'Schwebende, responsive Navigation mit erweitertem Media Player und Profil.',
  preview: true,
});

console.info(`%c NAVDOCK-CARD %c v${ND_VERSION} `, 'color:white;background:#6878b8;font-weight:700', 'color:#6878b8;background:#eef0ff');
