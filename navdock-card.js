/**
 * NavDock Card - floating, theme-aware navigation dock for Home Assistant.
 * No runtime dependencies and fully configurable from the visual card editor.
 */

const ND_VERSION = '1.1.1';

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
      profile_enabled: true,
      profile_label: 'Profil',
      profile_path: '/profile',
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._expanded = false;
    this._hass = null;
    this._positionTimer = null;
    this._onLocation = () => this._render();
  }

  connectedCallback() { window.addEventListener('location-changed', this._onLocation); }
  disconnectedCallback() {
    window.removeEventListener('location-changed', this._onLocation);
    clearInterval(this._positionTimer);
  }

  setConfig(config) {
    if (!config) throw new Error('Configuration required');
    this._config = {
      tabs: ND_DEFAULT_TABS,
      media_enabled: true,
      media_players: [],
      expanded_player: true,
      profile_enabled: true,
      profile_label: 'Profil',
      profile_path: '/profile',
      width: 520,
      bottom: 18,
      ...config,
    };
    this._render();
  }

  set hass(value) {
    this._hass = value;
    const media = this._getActiveMedia();
    const signature = this._mediaSignature(media);
    const profileSignature = JSON.stringify(this._getProfileData());
    if (!this.shadowRoot.firstChild || signature !== this._lastMediaSignature || profileSignature !== this._lastProfileSignature) {
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

    const media = this._activeMedia;
    const tabs = Array.isArray(this._config.tabs) ? this._config.tabs : [];
    const profileEnabled = this._config.profile_enabled !== false;
    const mediaVisible = this._config.media_enabled !== false && Boolean(media);
    const maxWidth = Math.max(300, Number(this._config.width) || 520);
    const bottom = Math.max(4, Number(this._config.bottom) || 18);
    const mediaOffset = 78;

    this.shadowRoot.innerHTML = `
      <style>${this._styles(maxWidth, bottom)}</style>
      <div class="spacer" aria-hidden="true"></div>
      ${this._expanded && media ? '<button class="scrim" aria-label="Player schließen"></button>' : ''}
      <section class="stack" style="--media-offset:${mediaOffset}px">
        ${this._expanded && media ? this._expandedTemplate(media) : ''}
        ${mediaVisible && !this._expanded ? this._compactTemplate(media) : ''}
        <nav class="dock" aria-label="Dashboard Navigation">
          ${tabs.map((tab, index) => this._tabTemplate(tab, index)).join('')}
          ${profileEnabled ? this._profileTemplate() : ''}
        </nav>
      </section>`;

    this._bindEvents();
  }

  _styles(maxWidth, bottom) {
    return `
      :host { display:block; min-height:1px; --nd-accent:var(--primary-color,#7d8fd3); --nd-surface:var(--ha-card-background,var(--card-background-color,var(--primary-background-color,#fff))); --nd-surface-soft:var(--secondary-background-color,var(--primary-background-color,#eee)); --nd-border:var(--divider-color,rgba(127,127,127,.24)); font-family:var(--paper-font-body1_-_font-family,inherit); }
      *, *::before, *::after { box-sizing:border-box; }
      button { font:inherit; }
      .spacer { height:1px; }
      .stack { position:fixed; z-index:6; left:50%; bottom:${bottom}px; width:min(calc(100vw - 24px),${maxWidth}px); transform:translateX(-50%); display:flex; flex-direction:column; gap:8px; pointer-events:none; }
      .dock,.compact,.expanded { pointer-events:auto; color:var(--primary-text-color); background:var(--nd-surface); border:1px solid var(--nd-border); box-shadow:var(--ha-card-box-shadow,0 10px 26px rgba(0,0,0,.18)); }
      .dock { min-height:68px; border-radius:34px; padding:6px; display:flex; align-items:center; justify-content:space-around; gap:2px; overflow:hidden; }
      .tab { min-width:0; flex:1 1 0; height:56px; padding:5px 4px; border:0; border-radius:28px; color:var(--secondary-text-color); background:transparent; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer; transition:transform .18s ease,background .18s ease,color .18s ease; }
      .tab:active { transform:scale(.94); }
      .tab.active { color:var(--nd-accent); background:var(--nd-surface-soft); box-shadow:inset 0 0 0 1px var(--nd-border); }
      .tab ha-icon { width:23px; height:23px; }
      .tab span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; font-weight:650; }
      .profile .avatar { width:38px; height:38px; border-radius:50%; overflow:hidden; display:grid; place-items:center; background:var(--nd-surface-soft); }
      .avatar img { width:100%; height:100%; object-fit:cover; }
      .avatar ha-icon { width:23px; height:23px; }
      .profile span { display:none; }
      .compact { min-height:68px; border-radius:34px; padding:7px 8px; display:grid; grid-template-columns:50px minmax(0,1fr) auto; align-items:center; gap:10px; cursor:pointer; animation:nd-in .22s ease-out; }
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
      .expanded { border-radius:30px; padding:18px; animation:nd-sheet .25s cubic-bezier(.2,.8,.2,1); transform-origin:bottom center; }
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
      .scrim { position:fixed; z-index:5; inset:0; width:100%; height:100%; border:0; padding:0; background:rgba(0,0,0,.16); cursor:default; animation:nd-fade .2s ease; }
      @keyframes nd-sheet { from { opacity:0; transform:translateY(18px) scale(.97); } }
      @keyframes nd-in { from { opacity:0; transform:translateY(8px); } }
      @keyframes nd-fade { from { opacity:0; } }
      @media (max-width:430px) { .stack{width:calc(100vw - 14px);bottom:max(8px,env(safe-area-inset-bottom));}.dock{min-height:64px}.tab{height:52px}.tab span{font-size:10px}.expanded{padding:15px}.compact{grid-template-columns:46px minmax(0,1fr) auto}.compact .cover{width:46px;height:46px}.compact .skip{display:none} }
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
    const active = location.pathname.startsWith(this._config.profile_path || '/profile');
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
    this.shadowRoot.querySelector('[data-profile]')?.addEventListener('click', () => ndNavigate(this._config.profile_path || '/profile'));
    this.shadowRoot.querySelector('[data-expand]')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-service]')) return;
      if (this._config.expanded_player !== false) { this._expanded = true; this._render(); }
    });
    this.shadowRoot.querySelector('.scrim')?.addEventListener('click', () => { this._expanded = false; this._render(); });
    this.shadowRoot.querySelector('[data-collapse]')?.addEventListener('click', () => { this._expanded = false; this._render(); });
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
  set hass(value) { this._hass = value; this._render(); }
  setConfig(config) { this._config = { tabs: ND_DEFAULT_TABS.map((tab) => ({ ...tab })), ...config }; this._render(); }

  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const media = Array.isArray(c.media_players) ? c.media_players : [];
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;color:var(--primary-text-color)}*{box-sizing:border-box}.section{padding:14px 0;border-bottom:1px solid var(--divider-color)}h3{font-size:15px;margin:0 0 12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:9px 0}.full{grid-column:1/-1}label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color)}input,select{width:100%;height:40px;padding:0 10px;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:10px}.check{flex-direction:row;align-items:center;gap:9px}.check input{width:18px;height:18px}.tabedit{padding:10px;margin:8px 0;border:1px solid var(--divider-color);border-radius:14px}.tabhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.actions{display:flex;gap:4px}button{border:0;border-radius:9px;padding:8px 10px;color:var(--primary-text-color);background:var(--secondary-background-color);cursor:pointer}.add{width:100%;margin-top:8px;color:var(--primary-color)}@media(max-width:500px){.row{grid-template-columns:1fr}}
    </style>
    <div class="section"><h3>Dock</h3><div class="row"><label>Maximale Breite (px)<input data-key="width" type="number" min="300" max="900" value="${ndEsc(c.width ?? 520)}"></label><label>Abstand unten (px)<input data-key="bottom" type="number" min="4" max="100" value="${ndEsc(c.bottom ?? 18)}"></label></div></div>
    <div class="section"><h3>Tabs</h3>${(c.tabs || []).map((tab, index) => this._tabEditor(tab, index)).join('')}<button class="add" data-add-tab>+ Tab hinzufügen</button></div>
    <div class="section"><h3>Media Player</h3><div class="row"><label class="check"><input data-check="media_enabled" type="checkbox" ${c.media_enabled !== false ? 'checked' : ''}>Media-Zeile anzeigen</label><label class="check"><input data-check="expanded_player" type="checkbox" ${c.expanded_player !== false ? 'checked' : ''}>Großen Player aktivieren</label></div><label>Media-Player (mehrere mit Komma trennen)<input data-media value="${ndEsc(media.join(', '))}" placeholder="media_player.wohnzimmer"></label></div>
    <div class="section"><h3>Profil</h3><div class="row"><label class="check full"><input data-check="profile_enabled" type="checkbox" ${c.profile_enabled !== false ? 'checked' : ''}>Profil-Tab anzeigen</label><label>Bezeichnung<input data-key="profile_label" value="${ndEsc(c.profile_label || 'Profil')}"></label><label>Pfad<input data-key="profile_path" value="${ndEsc(c.profile_path || '/profile')}"></label><label class="full">Avatar-URL (optional)<input data-key="profile_avatar" value="${ndEsc(c.profile_avatar || '')}" placeholder="/local/avatar.png"></label></div></div>`;
    this._bind();
  }

  _tabEditor(tab, index) {
    return `<div class="tabedit" data-index="${index}"><div class="tabhead"><strong>Tab ${index + 1}</strong><span class="actions"><button data-up title="Nach oben">↑</button><button data-down title="Nach unten">↓</button><button data-delete title="Löschen">✕</button></span></div><div class="row"><label>Name<input data-tab-key="label" value="${ndEsc(tab.label || '')}"></label><label>Icon<input data-tab-key="icon" value="${ndEsc(tab.icon || '')}" placeholder="mdi:home"></label><label class="full">Navigationspfad<input data-tab-key="path" value="${ndEsc(tab.path || '')}" placeholder="/dashboard-name/view"></label></div></div>`;
  }

  _emit(next) { this._config = next; ndFire(this, 'config-changed', { config: next }); }
  _bind() {
    this.shadowRoot.querySelectorAll('[data-key]').forEach((input) => input.addEventListener('change', () => {
      const numeric = input.type === 'number'; this._emit({ ...this._config, [input.dataset.key]: numeric ? Number(input.value) : input.value });
    }));
    this.shadowRoot.querySelectorAll('[data-check]').forEach((input) => input.addEventListener('change', () => this._emit({ ...this._config, [input.dataset.check]: input.checked })));
    this.shadowRoot.querySelector('[data-media]')?.addEventListener('change', (event) => this._emit({ ...this._config, media_players: event.target.value.split(',').map((v) => v.trim()).filter(Boolean) }));
    this.shadowRoot.querySelectorAll('.tabedit').forEach((box) => {
      const index = Number(box.dataset.index);
      box.querySelectorAll('[data-tab-key]').forEach((input) => input.addEventListener('change', () => { const tabs = this._config.tabs.map((t) => ({ ...t })); tabs[index][input.dataset.tabKey] = input.value; this._emit({ ...this._config, tabs }); }));
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
