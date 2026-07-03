/**
 * NavDock Card - floating, theme-aware navigation dock for Home Assistant.
 * No runtime dependencies and fully configurable from the visual card editor.
 */

const ND_VERSION = '1.5.0';

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
      media_players: media ? [media] : [],
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
    this._hass = null;
    this._positionTimer = null;
    this._onLocation = () => this._render();
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._render(), 120);
    };
  }

  connectedCallback() { window.addEventListener('location-changed', this._onLocation); window.addEventListener('resize', this._onResize); }
  disconnectedCallback() {
    window.removeEventListener('location-changed', this._onLocation);
    window.removeEventListener('resize', this._onResize);
    clearTimeout(this._resizeTimer);
    clearInterval(this._positionTimer);
  }

  setConfig(config) {
    if (!config) throw new Error('Configuration required');
    this._config = {
      tabs: ND_DEFAULT_TABS,
      media_enabled: true,
      media_players: [],
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

  set hass(value) {
    this._hass = value;
    const media = this._getActiveMedia();
    const signature = this._mediaSignature(media);
    const profileSignature = JSON.stringify(this._getProfileData());
    const profileEntitiesSignature = this._profileEntitiesSignature();
    if (!this.shadowRoot.firstChild || signature !== this._lastMediaSignature || profileSignature !== this._lastProfileSignature || (this._profileOpen && profileEntitiesSignature !== this._lastProfileEntitiesSignature)) {
      this._render();
    } else {
      this._activeMedia = media;
      this._updateLiveMedia();
      if (this._expanded) this._updatePosition();
    }
  }

  getCardSize() { return 1; }

  _getMediaEntities() {
    if (!this._hass) return [];
    return (this._config.media_players || [])
      .map((id) => this._hass.states[id])
      .filter(Boolean);
  }

  _getActiveMedia() {
    const entities = this._getMediaEntities();
    return entities.find((entity) => entity.state === 'playing')
      || entities.find((entity) => ND_ACTIVE_STATES.has(entity.state))
      || null;
  }

  _mediaSignature(entity) {
    if (!entity) return 'none';
    const a = entity.attributes || {};
    return JSON.stringify([
      entity.entity_id, entity.state, a.media_title, a.media_artist,
      a.media_series_title, a.app_name, a.source, a.entity_picture,
      a.media_duration, a.volume_level, a.is_volume_muted,
    ]);
  }

  _render() {
    if (!this._config || !this._hass) return;
    this._activeMedia = this._getActiveMedia();
    if (!this._activeMedia) this._expanded = false;
    this._lastMediaSignature = this._mediaSignature(this._activeMedia);
    this._lastProfileSignature = JSON.stringify(this._getProfileData());
    this._lastProfileEntitiesSignature = this._profileEntitiesSignature();

    const media = this._activeMedia;
    const tabs = Array.isArray(this._config.tabs) ? this._config.tabs : [];
    const profileEnabled = this._config.profile_enabled !== false;
    const mediaVisible = this._config.media_enabled !== false && Boolean(media);
    const maxWidth = Math.max(300, Number(this._config.width) || 520);
    const bottom = Math.max(4, Number(this._config.bottom) || 18);
    const breakpoint = Math.max(480, Math.min(1600, Number(this._config.breakpoint) || 768));
    const isMobile = window.innerWidth < breakpoint;
    const placement = isMobile ? (this._config.mobile_mode || 'docked') : (this._config.desktop_mode || 'floating');
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

    this.shadowRoot.innerHTML = `
      <style>${this._styles(maxWidth, bottom)}</style>
      <div class="spacer" aria-hidden="true"></div>
      ${this._expanded || this._profileOpen ? '<button class="scrim" aria-label="Panel schließen"></button>' : ''}
      <section class="stack ${isMobile ? 'mobile' : 'desktop'} ${placement === 'docked' ? 'docked' : 'floating'} ${showLabels ? '' : 'hide-labels'} ${this._config.shadow === false ? 'no-shadow' : ''}" style="--media-offset:${mediaOffset}px;--nd-height:${height}px;--nd-radius:${radius};--nd-icon-size:${iconSize}px;--nd-label-size:${labelSize}px;--nd-accent:var(--primary-color,#7d8fd3);--nd-max-width:${maxWidth}px">
        ${this._profileOpen ? this._profilePanelTemplate() : ''}
        ${this._expanded && media ? this._expandedTemplate(media) : ''}
        ${mediaVisible && !this._expanded && !this._profileOpen ? this._compactTemplate(media) : ''}
        <nav class="dock" aria-label="Dashboard Navigation">
          ${tabs.map((tab, index) => this._tabTemplate(tab, index)).join('')}
          ${profileEnabled ? this._profileTemplate() : ''}
        </nav>
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
      .stack.docked{left:0;right:0;bottom:0;width:100%;transform:none;gap:6px}
      .docked .dock{width:100%;border-radius:var(--nd-radius) var(--nd-radius) 0 0;padding-bottom:max(6px,env(safe-area-inset-bottom))}
      .docked .compact,.docked .expanded,.docked .profile-panel{width:min(calc(100vw - 16px),var(--nd-max-width));align-self:center}
      .dock,.compact,.expanded,.profile-panel { pointer-events:auto; color:var(--primary-text-color); background:var(--nd-surface); border:var(--ha-card-border-width,1px) solid var(--nd-border); box-shadow:0 9px 28px rgba(0,0,0,.24),0 2px 8px rgba(0,0,0,.16); }
      .no-shadow .dock,.no-shadow .compact,.no-shadow .expanded,.no-shadow .profile-panel{box-shadow:none}
      .dock { min-height:var(--nd-height); border-radius:var(--nd-radius); padding:6px; display:flex; align-items:center; justify-content:space-around; gap:2px; overflow:hidden; }
      .tab { min-width:0; flex:1 1 0; height:calc(var(--nd-height) - 12px); padding:5px 4px; border:0; border-radius:999px; color:var(--secondary-text-color); background:transparent; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer; transition:transform .18s ease,background .18s ease,color .18s ease; }
      .tab:active { transform:scale(.94); }
      .tab.active { color:var(--nd-accent); background:var(--nd-surface-soft); box-shadow:inset 0 0 0 1px var(--nd-border); }
      .tab ha-icon { width:var(--nd-icon-size); height:var(--nd-icon-size); }
      .tab span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--nd-label-size); font-weight:650; }
      .hide-labels .tab>span:not(.avatar){display:none}.hide-labels .tab{gap:0}
      .profile .avatar { width:38px; height:38px; border-radius:50%; overflow:hidden; display:grid; place-items:center; background:var(--nd-surface-soft); }
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
      .expanded { border-radius:var(--nd-radius); padding:18px; animation:nd-sheet .25s cubic-bezier(.2,.8,.2,1); transform-origin:bottom center; }
      .expanded-head { display:grid; grid-template-columns:82px minmax(0,1fr) 40px; gap:14px; align-items:center; }
      .expanded .cover { width:82px; height:82px; border-radius:22px; }
      .expanded .title { font-size:17px; }
      .expanded .subtitle { margin-top:6px; font-size:13px; }
      .timeline { margin-top:18px; }
      input[type=range] { width:100%; accent-color:var(--nd-accent); cursor:pointer; }
      .times { display:flex; justify-content:space-between; color:var(--secondary-text-color); font-size:10px; margin-top:2px; }
      .large-controls { display:flex; justify-content:center; align-items:center; gap:20px; margin:13px 0 7px; }
      .large-controls .icon-btn { width:46px; height:46px; }
      .large-controls .primary { width:58px; height:58px; }
      .volume { display:grid; grid-template-columns:25px 1fr; align-items:center; gap:8px; }
      .volume ha-icon { color:var(--secondary-text-color); }
      .profile-panel{border-radius:var(--nd-radius);padding:18px;animation:nd-sheet .25s cubic-bezier(.2,.8,.2,1);transform-origin:bottom center;max-height:min(560px,calc(100vh - 120px));overflow:auto}.profile-head{display:grid;grid-template-columns:58px 1fr 40px;gap:13px;align-items:center;margin-bottom:15px}.profile-big-avatar{width:58px;height:58px;border-radius:20px;overflow:hidden;display:grid;place-items:center;background:var(--nd-surface-soft)}.profile-big-avatar img{width:100%;height:100%;object-fit:cover}.profile-big-avatar ha-icon{width:30px;height:30px;color:var(--nd-accent)}.profile-name{font-size:18px;font-weight:780}.profile-role{font-size:12px;color:var(--secondary-text-color);margin-top:4px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.info-tile{min-width:0;padding:13px;border-radius:20px;background:var(--nd-surface-soft)}.info-icon{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;color:var(--nd-accent);background:var(--nd-surface)}.info-icon ha-icon{width:20px}.info-label{margin-top:9px;font-size:11px;color:var(--secondary-text-color)}.info-value{margin-top:3px;font-size:13px;font-weight:720;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profile-entities{display:grid;gap:7px;margin-top:12px}.profile-entity{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;padding:10px 12px;border:0;border-radius:18px;color:var(--primary-text-color);background:var(--nd-surface-soft);cursor:pointer;text-align:left}.profile-entity ha-icon{color:var(--nd-accent)}.entity-name{font-size:13px;font-weight:680;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.entity-id{font-size:10px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.entity-state{font-size:12px;font-weight:720;color:var(--nd-accent)}
      .scrim { position:fixed; z-index:5; inset:0; width:100%; height:100%; border:0; padding:0; background:rgba(0,0,0,.16); cursor:default; animation:nd-fade .2s ease; }
      @keyframes nd-sheet { from { opacity:0; transform:translateY(18px) scale(.97); } }
      @keyframes nd-in { from { opacity:0; transform:translateY(8px); } }
      @keyframes nd-fade { from { opacity:0; } }
      @media (max-width:430px) { .stack.floating{width:calc(100vw - 14px);bottom:max(8px,env(safe-area-inset-bottom));}.dock{min-height:64px}.tab{height:52px}.tab span{font-size:10px}.expanded{padding:15px}.compact{grid-template-columns:46px minmax(0,1fr) auto}.compact .cover{width:46px;height:46px}.compact .skip{display:none} }
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
    const active = this._profileOpen || location.pathname.startsWith(this._config.profile_path || '/profile');
    const { picture, userName } = this._getProfileData();
    return `<button class="tab profile ${active ? 'active' : ''}" data-profile title="${ndEsc(userName)}">
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

  _profilePanelTemplate() {
    const { picture, userName } = this._getProfileData();
    const user = this._hass.user || {};
    const tiles = [];
    if (this._config.profile_show_user !== false) tiles.push(this._infoTile('mdi:account-key', 'Benutzer', user.is_owner ? 'Eigentümer' : (user.is_admin ? 'Administrator' : 'Benutzer')));
    if (this._config.profile_show_system !== false) tiles.push(this._infoTile('mdi:home-assistant', this._hass.config?.location_name || 'Home Assistant', `Version ${this._hass.config?.version || '–'}`));
    if (this._config.profile_show_connection !== false) tiles.push(this._infoTile(navigator.onLine ? 'mdi:lan-connect' : 'mdi:lan-disconnect', 'Verbindung', navigator.onLine ? 'Online' : 'Offline'));
    if (this._config.profile_show_device !== false) {
      const device = /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'Apple Mobil' : /Windows/i.test(navigator.userAgent) ? 'Windows' : /Mac/i.test(navigator.userAgent) ? 'macOS' : 'Browser';
      tiles.push(this._infoTile('mdi:devices', 'Dieses Gerät', `${device} · ${window.innerWidth}×${window.innerHeight}`));
    }
    const entities = (this._config.profile_entities || []).map((id) => this._hass.states[id]).filter(Boolean);
    return `<article class="profile-panel" aria-label="Profilinformationen"><div class="profile-head"><span class="profile-big-avatar">${picture ? `<img src="${ndEsc(picture)}" alt="${ndEsc(userName)}">` : '<ha-icon icon="mdi:account"></ha-icon>'}</span><div><div class="profile-name">${ndEsc(userName)}</div><div class="profile-role">${ndEsc(this._hass.config?.location_name || 'Home Assistant')}</div></div><button class="icon-btn" data-close-profile aria-label="Schließen"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div><div class="info-grid">${tiles.join('')}</div>${entities.length ? `<div class="profile-entities">${entities.map((entity) => this._profileEntityTemplate(entity)).join('')}</div>` : ''}</article>`;
  }

  _infoTile(icon, label, value) {
    return `<div class="info-tile"><span class="info-icon"><ha-icon icon="${icon}"></ha-icon></span><div class="info-label">${ndEsc(label)}</div><div class="info-value">${ndEsc(value)}</div></div>`;
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

  _compactTemplate(entity) {
    const a = entity.attributes;
    return `<article class="compact" data-expand role="button" tabindex="0" aria-label="Media Player öffnen">
      ${this._cover(entity)}
      <div class="meta"><div class="title live-title">${ndEsc(a.media_title || a.friendly_name || 'Media Player')}</div><div class="subtitle live-subtitle">${ndEsc(a.media_artist || a.media_series_title || a.app_name || a.source || '')}</div></div>
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

  _expandedTemplate(entity) {
    const a = entity.attributes;
    const duration = Number(a.media_duration) || 0;
    const position = this._position(entity);
    const volume = Math.round((Number(a.volume_level) || 0) * 100);
    return `<article class="expanded" aria-label="Erweiterter Media Player">
      <div class="expanded-head">${this._cover(entity)}<div class="meta"><div class="title live-title">${ndEsc(a.media_title || a.friendly_name || 'Media Player')}</div><div class="subtitle live-subtitle">${ndEsc(a.media_artist || a.media_series_title || a.app_name || a.source || '')}</div></div><button class="icon-btn" data-collapse aria-label="Einklappen"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>
      ${duration ? `<div class="timeline"><input data-seek type="range" min="0" max="${duration}" step="1" value="${position}"><div class="times"><span class="live-position">${ndTime(position)}</span><span>${ndTime(duration)}</span></div></div>` : ''}
      <div class="large-controls"><button class="icon-btn" data-service="media_previous_track"><ha-icon icon="mdi:skip-previous"></ha-icon></button>${this._playButton(entity, true)}<button class="icon-btn" data-service="media_next_track"><ha-icon icon="mdi:skip-next"></ha-icon></button></div>
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
        this._expanded = false;
        this._profileOpen = !this._profileOpen;
        this._render();
      } else ndNavigate(this._config.profile_path || '/profile');
    });
    this.shadowRoot.querySelector('[data-expand]')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-service]')) return;
      if (this._config.expanded_player !== false) { this._profileOpen = false; this._expanded = true; this._render(); }
    });
    this.shadowRoot.querySelector('.scrim')?.addEventListener('click', () => { this._expanded = false; this._profileOpen = false; this._render(); });
    this.shadowRoot.querySelector('[data-collapse]')?.addEventListener('click', () => { this._expanded = false; this._render(); });
    this.shadowRoot.querySelector('[data-close-profile]')?.addEventListener('click', () => { this._profileOpen = false; this._render(); });
    this.shadowRoot.querySelectorAll('[data-profile-entity]').forEach((button) => button.addEventListener('click', () => ndFire(this, 'hass-more-info', { entityId: button.dataset.profileEntity })));
    this.shadowRoot.querySelectorAll('[data-service]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation(); this._call(button.dataset.service);
    }));
    this.shadowRoot.querySelector('[data-seek]')?.addEventListener('change', (event) => this._call('media_seek', { seek_position: Number(event.target.value) }));
    this.shadowRoot.querySelector('[data-volume]')?.addEventListener('change', (event) => this._call('volume_set', { volume_level: Number(event.target.value) / 100 }));
    clearInterval(this._positionTimer);
    if (this._expanded && this._activeMedia?.state === 'playing') this._positionTimer = setInterval(() => this._updatePosition(), 1000);
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
  }
}

class NavDockCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  set hass(value) {
    this._hass = value;
    if (!this.shadowRoot.firstChild) this._render();
    else {
      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => { picker.hass = value; });
      this.shadowRoot.querySelectorAll('ha-icon-picker').forEach((picker) => { picker.hass = value; });
    }
  }
  setConfig(config) { this._config = { tabs: ND_DEFAULT_TABS.map((tab) => ({ ...tab })), ...config }; this._render(); }

  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const media = Array.isArray(c.media_players) ? c.media_players : [];
    const profileEntities = Array.isArray(c.profile_entities) ? c.profile_entities : [];
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;max-width:100%;overflow:hidden;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}*{box-sizing:border-box;min-width:0}.editor{display:grid;gap:10px;width:100%}.group{padding:14px;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,22px);background:var(--ha-card-background,var(--card-background-color));overflow:hidden}.group-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.group-icon{flex:0 0 36px;width:36px;height:36px;border-radius:13px;display:grid;place-items:center;color:var(--primary-color);background:var(--secondary-background-color)}.group-icon ha-icon{width:21px}.group-title{font-size:15px;font-weight:750}.hint{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.subhead{margin:13px 0 5px;font-size:12px;font-weight:750}.row{display:grid;grid-template-columns:1fr;gap:9px;margin-top:10px}.field{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:650;color:var(--secondary-text-color)}input{width:100%;height:44px;padding:0 12px;color:var(--primary-text-color);background:var(--primary-background-color);border:1px solid var(--divider-color);border-radius:14px;outline:none}input:focus{border:2px solid var(--primary-color)}ha-icon-picker{width:100%;max-width:100%;min-height:44px}.icon-choice{display:grid;grid-template-columns:42px minmax(0,1fr);gap:7px;align-items:center;padding:5px;border:1px solid var(--divider-color);border-radius:16px;background:var(--primary-background-color);overflow:hidden}.icon-preview{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:var(--primary-color);background:var(--secondary-background-color)}.toggle-grid{display:grid;grid-template-columns:1fr;gap:7px}.toggle{min-height:48px;padding:8px 11px;border-radius:15px;display:flex;align-items:center;gap:9px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:12px;font-weight:650}.toggle input{width:19px;height:19px;accent-color:var(--primary-color)}.segments{display:flex;gap:5px;padding:4px;border-radius:15px;background:var(--secondary-background-color);overflow:hidden}.segments button{flex:1;min-width:0;padding:7px 5px;font-size:11px}.advanced{margin-top:10px;border-radius:16px;background:var(--secondary-background-color);overflow:hidden}.advanced summary{padding:12px;cursor:pointer;font-size:12px;font-weight:720}.advanced-body{padding:0 12px 12px}.tabedit{margin-top:7px;border-radius:17px;background:var(--secondary-background-color);overflow:hidden}.tabedit summary{display:flex;align-items:center;gap:9px;padding:10px;cursor:pointer;list-style:none}.tabedit summary::-webkit-details-marker{display:none}.tabbody{padding:0 10px 10px}.tabhead{display:flex;align-items:center;justify-content:flex-end;margin-top:8px}.tabnumber{display:flex;align-items:center;gap:9px;font-weight:750;overflow:hidden}.tabnumber>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dragdot{flex:0 0 30px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--primary-background-color);color:var(--primary-color)}.actions{display:flex;gap:5px}button{min-height:36px;border:0;border-radius:12px;padding:7px 10px;color:var(--primary-text-color);background:var(--primary-background-color);cursor:pointer;font-weight:650}.selected,.add{color:var(--text-primary-color,#fff);background:var(--primary-color)}.actions button{width:36px;padding:0}.add{width:100%;margin-top:9px;min-height:44px}.media-row{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:6px;align-items:center;margin-top:7px}.media-row ha-entity-picker{width:100%;max-width:100%}.empty{padding:11px;text-align:center;color:var(--secondary-text-color);font-size:11px;border:1px dashed var(--divider-color);border-radius:14px}
    </style>
    <div class="editor">
      ${this._group('mdi:responsive','Mobil & Desktop','Je Bildschirm automatisch passend',`<div class="subhead">Mobil</div><div class="segments"><button data-placement-key="mobile_mode" data-placement="docked" class="${(c.mobile_mode || 'docked') === 'docked' ? 'selected' : ''}">Angeheftet</button><button data-placement-key="mobile_mode" data-placement="floating" class="${c.mobile_mode === 'floating' ? 'selected' : ''}">Schwebend</button></div><div class="subhead">Desktop</div><div class="segments"><button data-placement-key="desktop_mode" data-placement="floating" class="${(c.desktop_mode || 'floating') === 'floating' ? 'selected' : ''}">Schwebend</button><button data-placement-key="desktop_mode" data-placement="docked" class="${c.desktop_mode === 'docked' ? 'selected' : ''}">Angeheftet</button></div><div class="toggle-grid"><label class="toggle"><input data-check="mobile_show_labels" type="checkbox" ${c.mobile_show_labels === true ? 'checked' : ''}>Labels auf Mobilgeräten</label><label class="toggle"><input data-check="desktop_show_labels" type="checkbox" ${c.desktop_show_labels !== false ? 'checked' : ''}>Labels auf Desktop</label></div>`)}
      ${this._group('mdi:dock-bottom','Aussehen','Einfach dem Theme folgen',`<div class="segments"><button data-radius="0" class="${!Number(c.radius) ? 'selected' : ''}">Theme</button><button data-radius="24" class="${Number(c.radius) === 24 ? 'selected' : ''}">Rund</button><button data-radius="40" class="${Number(c.radius) === 40 ? 'selected' : ''}">Pill</button></div><label class="toggle"><input data-check="shadow" type="checkbox" ${c.shadow !== false ? 'checked' : ''}>Abhebung vom Hintergrund</label><details class="advanced"><summary>Erweiterte Größen</summary><div class="advanced-body"><div class="row"><label class="field">Desktop ab Breite<input data-key="breakpoint" type="number" min="480" max="1600" value="${ndEsc(c.breakpoint ?? 768)}"></label><label class="field">Maximale Breite<input data-key="width" type="number" min="300" max="900" value="${ndEsc(c.width ?? 520)}"></label><label class="field">Abstand unten<input data-key="bottom" type="number" min="4" max="100" value="${ndEsc(c.bottom ?? 18)}"></label><label class="field">Dock-Höhe<input data-key="height" type="number" min="56" max="90" value="${ndEsc(c.height ?? 68)}"></label><label class="field">Eigener Radius (0 = Theme)<input data-key="radius" type="number" min="0" max="60" value="${ndEsc(c.radius ?? 0)}"></label><label class="field">Icon-Größe<input data-key="icon_size" type="number" min="18" max="36" value="${ndEsc(c.icon_size ?? 23)}"></label><label class="field">Text-Größe<input data-key="label_size" type="number" min="9" max="16" value="${ndEsc(c.label_size ?? 11)}"></label></div></div></details>`)}
      ${this._group('mdi:tab','Navigation','Tabs einfach anordnen und bearbeiten',`${(c.tabs || []).map((tab,index)=>this._tabEditor(tab,index)).join('')}<button class="add" data-add-tab>+ Tab hinzufügen</button>`)}
      ${this._group('mdi:play-circle','Media Player','Aktive Player werden automatisch ausgewählt',`<div class="toggle-grid"><label class="toggle"><input data-check="media_enabled" type="checkbox" ${c.media_enabled !== false ? 'checked' : ''}>Media-Zeile</label><label class="toggle"><input data-check="expanded_player" type="checkbox" ${c.expanded_player !== false ? 'checked' : ''}>Großer Player</label></div><div class="media-list">${media.length ? media.map((id,index)=>`<div class="media-row"><ha-entity-picker data-media-index="${index}" value="${ndEsc(id)}" include-domains="media_player"></ha-entity-picker><button data-remove-media="${index}" title="Entfernen">✕</button></div>`).join('') : '<div class="empty">Noch kein Media-Player ausgewählt</div>'}</div><button class="add" data-add-media>+ Media-Player</button>`)}
      ${this._group('mdi:account-circle','Profilpanel','Kleine persönliche Info-Seite direkt über der Dock',`<div class="toggle-grid"><label class="toggle"><input data-check="profile_enabled" type="checkbox" ${c.profile_enabled !== false ? 'checked' : ''}>Profil-Tab anzeigen</label><label class="toggle"><input data-check="profile_panel_enabled" type="checkbox" ${c.profile_panel_enabled !== false ? 'checked' : ''}>Panel beim Tippen</label><label class="toggle"><input data-check="profile_show_user" type="checkbox" ${c.profile_show_user !== false ? 'checked' : ''}>Benutzerrolle</label><label class="toggle"><input data-check="profile_show_system" type="checkbox" ${c.profile_show_system !== false ? 'checked' : ''}>HA-Informationen</label><label class="toggle"><input data-check="profile_show_connection" type="checkbox" ${c.profile_show_connection !== false ? 'checked' : ''}>Verbindung</label><label class="toggle"><input data-check="profile_show_device" type="checkbox" ${c.profile_show_device !== false ? 'checked' : ''}>Dieses Gerät</label></div><div class="row"><label class="field">Bezeichnung<input data-key="profile_label" value="${ndEsc(c.profile_label || 'Profil')}"></label><label class="field">Pfad ohne Panel<input data-key="profile_path" value="${ndEsc(c.profile_path || '/profile')}"></label><label class="field full">Avatar überschreiben (optional)<input data-key="profile_avatar" value="${ndEsc(c.profile_avatar || '')}" placeholder="Automatisch vom aktuellen Benutzer"></label></div><div class="subhead">Entitäten im Panel</div>${profileEntities.length ? profileEntities.map((id,index)=>`<div class="media-row"><ha-entity-picker data-profile-entity-index="${index}" value="${ndEsc(id)}"></ha-entity-picker><button data-remove-profile-entity="${index}" title="Entfernen">✕</button></div>`).join('') : '<div class="empty">Optional eigene Sensoren oder Geräte anzeigen</div>'}<button class="add" data-add-profile-entity>+ Entität</button>`)}
    </div>`;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => { picker.hass = this._hass; if (picker.hasAttribute('data-media-index')) picker.includeDomains = ['media_player']; });
    this.shadowRoot.querySelectorAll('ha-icon-picker').forEach((picker) => { picker.hass = this._hass; });
    this._bind();
  }

  _group(icon, title, hint, content) { return `<section class="group"><div class="group-head"><span class="group-icon"><ha-icon icon="${icon}"></ha-icon></span><div><div class="group-title">${title}</div><div class="hint">${hint}</div></div></div>${content}</section>`; }

  _tabEditor(tab, index) {
    return `<details class="tabedit" data-index="${index}"><summary><span class="dragdot"><ha-icon icon="${ndEsc(tab.icon || 'mdi:circle-outline')}"></ha-icon></span><span class="tabnumber"><span>${ndEsc(tab.label || `Tab ${index + 1}`)}</span></span></summary><div class="tabbody"><div class="tabhead"><span class="actions"><button data-up title="Nach oben">↑</button><button data-down title="Nach unten">↓</button><button data-delete title="Löschen">✕</button></span></div><div class="row"><label class="field">Name<input data-tab-key="label" value="${ndEsc(tab.label || '')}"></label><label class="field">Icon<div class="icon-choice"><span class="icon-preview"><ha-icon icon="${ndEsc(tab.icon || 'mdi:circle-outline')}"></ha-icon></span><ha-icon-picker data-tab-icon="icon" value="${ndEsc(tab.icon || '')}"></ha-icon-picker></div></label><label class="field">Aktives Icon<div class="icon-choice"><span class="icon-preview"><ha-icon icon="${ndEsc(tab.active_icon || tab.icon || 'mdi:circle')}"></ha-icon></span><ha-icon-picker data-tab-icon="active_icon" value="${ndEsc(tab.active_icon || '')}"></ha-icon-picker></div></label><label class="field">Navigationspfad<input data-tab-key="path" value="${ndEsc(tab.path || '')}" placeholder="/dashboard/view"></label></div></div></details>`;
  }

  _emit(next) { this._config = next; ndFire(this, 'config-changed', { config: next }); }
  _bind() {
    this.shadowRoot.querySelectorAll('[data-key]').forEach((input) => input.addEventListener('change', () => {
      const numeric = input.type === 'number'; this._emit({ ...this._config, [input.dataset.key]: numeric ? Number(input.value) : input.value });
    }));
    this.shadowRoot.querySelectorAll('[data-check]').forEach((input) => input.addEventListener('change', () => this._emit({ ...this._config, [input.dataset.check]: input.checked })));
    this.shadowRoot.querySelectorAll('[data-radius]').forEach((button) => button.addEventListener('click', () => { this._emit({ ...this._config, radius: Number(button.dataset.radius) }); this._render(); }));
    this.shadowRoot.querySelectorAll('[data-placement-key]').forEach((button) => button.addEventListener('click', () => { this._emit({ ...this._config, [button.dataset.placementKey]: button.dataset.placement }); this._render(); }));
    this.shadowRoot.querySelectorAll('[data-media-index]').forEach((picker) => picker.addEventListener('value-changed', (event) => { const players = [...(this._config.media_players || [])]; players[Number(picker.dataset.mediaIndex)] = event.detail.value; this._emit({ ...this._config, media_players: players.filter(Boolean) }); }));
    this.shadowRoot.querySelectorAll('[data-remove-media]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.removeMedia); this._emit({ ...this._config, media_players: (this._config.media_players || []).filter((_,i)=>i!==index) }); this._render(); }));
    this.shadowRoot.querySelector('[data-add-media]')?.addEventListener('click', () => { this._emit({ ...this._config, media_players: [...(this._config.media_players || []), ''] }); this._render(); });
    this.shadowRoot.querySelectorAll('[data-profile-entity-index]').forEach((picker) => picker.addEventListener('value-changed', (event) => { const entities = [...(this._config.profile_entities || [])]; entities[Number(picker.dataset.profileEntityIndex)] = event.detail.value; this._emit({ ...this._config, profile_entities: entities.filter(Boolean) }); }));
    this.shadowRoot.querySelectorAll('[data-remove-profile-entity]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.removeProfileEntity); this._emit({ ...this._config, profile_entities: (this._config.profile_entities || []).filter((_,i)=>i!==index) }); this._render(); }));
    this.shadowRoot.querySelector('[data-add-profile-entity]')?.addEventListener('click', () => { this._emit({ ...this._config, profile_entities: [...(this._config.profile_entities || []), ''] }); this._render(); });
    this.shadowRoot.querySelectorAll('.tabedit').forEach((box) => {
      const index = Number(box.dataset.index);
      box.querySelectorAll('[data-tab-key]').forEach((input) => input.addEventListener('change', () => { const tabs = this._config.tabs.map((t) => ({ ...t })); tabs[index][input.dataset.tabKey] = input.value; this._emit({ ...this._config, tabs }); }));
      box.querySelectorAll('[data-tab-icon]').forEach((picker) => picker.addEventListener('value-changed', (event) => { const tabs = this._config.tabs.map((t) => ({ ...t })); tabs[index][picker.dataset.tabIcon] = event.detail.value; this._emit({ ...this._config, tabs }); }));
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
