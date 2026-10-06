import {WORLD_MAP,WESTERN_FOREST,FOREST_APPROACH} from '../world/WorldLayout';
import { shorelineAt } from '../world/CoastMath';
import {TOWN,TOWN_APPROACH,TOWN_SHOPS} from '../world/TownLayout';
import type { HudView, Landmark, Panel } from '../game/types';

const icons: Record<string, string> = {
  sword: '<path d="m8 31 18-20 4-2-1 5-18 20m-5-6 9 8M7 34l-3 4m8-7 3 3"/>',
  thunder: '<path d="M25 4 11 24h10l-4 16 16-23H23z"/>',
  elemental: '<circle cx="22" cy="22" r="6"/><path d="M22 4 30 13 39 22 30 31 22 40 14 31 5 22 14 13zM22 4v12m17 6H28m-6 18V28M5 22h11m-2-9 8 3 8-3m0 18-8-3-8 3"/>',
  dodge: '<path d="m8 20 11-11m-4 20 13-13M5 30l9-9m8 14 13-13m-16-13 6-1-1 6m4 2 6-1-1 6"/>',
  flight: '<path d="m5 26 22-14 11-1-6 8L8 31zM12 34l17-9M4 18c6 0 6-6 12-6m9 21c6 0 7-5 13-5"/>',
  realm: '<circle cx="22" cy="22" r="11"/><path d="M22 3v7m0 24v7M3 22h7m24 0h7M9 9l5 5m16 16 5 5M9 35l5-5M30 14l5-5m-18 7 5-5 5 5-5 15z"/>',
  pill: '<circle cx="22" cy="24" r="11"/><path d="M14 25c1-6 6-9 11-8M22 4v5m-7-1 3 3m12-3-3 3M16 34h12"/>',
  herb: '<path d="M20 37V18c-9-1-13-5-12-12 10-1 16 4 12 12m0 6c1-11 7-15 15-14 1 9-4 15-15 14m-11 9 11 4 11-6"/>',
  stone: '<path d="m22 5 14 10-4 19-16 5L6 24l6-14zM12 10l10 9 14-4m-14 4 10 15m-10-15-6 20M6 24l16-5"/>',
  map: '<path d="m5 10 11-5 12 5 11-5v29l-11 5-12-5-11 5zM16 5v29m12-24v29"/>',
  journal: '<path d="M9 5h25v34H9c-5 0-5-7 0-7h25M9 5v27m7-18h11m-11 7h11"/>',
  bag: '<path d="m16 5 2 7h8l2-7zM17 12C11 18 5 23 9 34c4 6 23 6 26 0 5-11-1-16-8-22M14 18h15M22 22v10m-4-7h8"/>',
  pause: '<path d="M14 8v28m16-28v28"/>',
  close: '<path d="m11 11 22 22m0-22L11 33"/>',
  lotus: '<path d="M22 35C5 29 6 13 8 9c8 2 13 11 14 26m0 0c17-6 16-22 14-26-8 2-13 11-14 26m0 0C9 21 15 9 22 3c7 6 13 18 0 32M4 27c2 9 10 12 18 8 8 4 16 1 18-8"/>',
};
const icon = (name: string) => `<svg class="ui-icon" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.realm}</svg>`;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const button = (action: string, text: string, primary = false) => `<button class="ink-button ${primary ? 'primary' : ''}" data-action="${action}"><span>${text}</span><i aria-hidden="true">◇</i></button>`;
const realmNames = ['练气初期', '练气圆满', '筑基期'];

/** Persistent HUD: menus rebuild only on a state transition or actual content change. */
export class Hud {
  private root: HTMLDivElement;
  private phaseRoot: HTMLDivElement;
  private panelRoot: HTMLDivElement;
  private fields = new Map<string, HTMLElement>();
  private panelFields = new Map<string, HTMLElement>();
  private valueCache = new Map<string, string>();
  private phaseKey = '';
  private panelKey = '';
  private lastMapTime = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private minimap: HTMLCanvasElement;

  constructor(private onAction: (action: string) => void) {
    this.root = document.createElement('div');
    this.root.id = 'game-ui';
    this.root.innerHTML = `<div class="world-vignette" aria-hidden="true"></div><div class="play-hud">
      <section class="cultivator-status" aria-label="角色状态"><div class="realm-mark">${icon('lotus')}<span data-field="realm-glyph">气</span></div><div class="status-body"><div class="status-heading"><strong data-field="realm-name">练气初期</strong><span class="sect-label">云岚弟子</span></div><div class="meter health"><span class="meter-label">气血</span><div class="meter-track"><i data-field="health-fill"></i></div><span class="meter-number" data-field="health-value"></span></div><div class="meter qi"><span class="meter-label">灵气</span><div class="meter-track"><i data-field="qi-fill"></i></div><span class="meter-number" data-field="qi-value"></span></div><div class="cultivation-line"><div class="xp-track"><i data-field="xp-fill"></i></div><span data-field="xp-value"></span></div></div></section>
      <section class="chapter-objective" aria-label="当前目标"><div class="eyebrow">第一章 · 云岚初境</div><h2 data-field="objective"></h2><p data-field="objective-detail"></p><button class="text-button" data-action="journal">修行札记 <kbd>J</kbd></button></section>
      <section class="navigation-cluster" aria-label="地图与菜单"><div class="minimap-outer"><span class="north-label">北</span><canvas class="minimap" aria-label="当前位置小地图"></canvas><i class="map-corner corner-a"></i><i class="map-corner corner-b"></i><button class="minimap-open" data-action="map" aria-label="打开云岚山地图，M 键"></button></div><div class="location-name" data-field="location"></div><div class="world-currency">${icon('stone')}<span data-field="stones"></span><span>灵石</span></div><nav class="quick-menu"><button data-action="map" aria-label="地图，M 键" title="地图 [M]">${icon('map')}</button><button data-action="journal" aria-label="札记，J 键" title="札记 [J]">${icon('journal')}</button><button data-action="inventory" aria-label="背包，I 键" title="背包 [I]">${icon('bag')}</button><button data-action="pause" aria-label="暂停，Esc 键" title="暂停 [Esc]">${icon('pause')}</button></nav></section>
      <section class="enemy-status" hidden data-field="enemy"><div class="enemy-title"><span>妖气</span><strong data-field="enemy-name"></strong><span data-field="enemy-value"></span></div><div class="enemy-track"><i data-field="enemy-fill"></i></div></section><div class="flight-status" data-field="flight-status" hidden><span class="diamond"></span> 御剑凌空 <span>Space 升高 · C 降低</span></div><div class="interact-prompt" data-field="interact" hidden><kbd>E</kbd><span data-field="interact-text"></span></div>
      <div class="element-selector" aria-label="五行选择">${['metal','wood','water','fire','earth'].map((e,i)=>`<button class="element-choice" data-action="element:${e}" data-field="element-${e}" title="${['飞剑','青藤','流珠','炎羽','岩矢'][i]} [${i+1}]"><kbd>${i+1}</kbd>${['金','木','水','火','土'][i]}</button>`).join('')}<span data-field="element-name"></span></div>
      <div class="combat-bar" aria-label="动作快捷键">${this.skill('sword', '剑斩', '左键', 'attack')}${this.skill('thunder', '御雷', 'Q', 'thunder')}${this.skill('elemental', '五行诀', 'T', 'elemental')}${this.skill('dodge', '闪避', 'Shift', 'dodge')}${this.skill('flight', '御剑', 'F', 'flight')}${this.skill('realm', '突破', 'B', 'breakthrough')}${this.skill('pill', '服丹', 'H', 'heal')}</div><div class="control-caption">W A S D 移动 <span>·</span> 右键拖动视角 <span>·</span> 滚轮远近</div></div>
      <div class="phase-layer"></div><div class="panel-layer" hidden></div><div class="toast-message" role="status" aria-live="polite" hidden><span class="diamond"></span><span data-field="toast"></span></div><div class="desktop-hint">请使用电脑与键盘鼠标游玩，建议窗口宽度至少 1024 像素。</div>`;
    document.body.appendChild(this.root);
    this.phaseRoot = this.root.querySelector('.phase-layer')!;
    this.panelRoot = this.root.querySelector('.panel-layer')!;
    this.minimap = this.root.querySelector('.minimap')!;
    this.root.querySelectorAll<HTMLElement>('[data-field]').forEach(el => this.fields.set(el.dataset.field!, el));
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('input', this.input);
  }
  private skill(symbol: string, name: string, key: string, id: string): string {
    return `<div class="skill-slot" data-field="skill-${id}"><div class="skill-symbol">${icon(symbol)}<span class="cooldown-cover" data-field="cooldown-${id}" hidden></span><span class="skill-lock" data-field="lock-${id}" hidden>未习得</span></div><div class="skill-caption"><span>${name}</span><kbd>${key}</kbd></div><span class="skill-count" data-field="count-${id}"></span></div>`;
  }
  private click = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-action]') : null;
    if (!target || target.disabled || !this.root.contains(target)) return;
    event.stopPropagation();
    this.onAction(target.dataset.action!);
  };
  private input = (event: Event): void => {
    if (event.target instanceof HTMLInputElement && event.target.dataset.input === 'volume') this.onAction(`volume:${event.target.value}`);
  };

  update(view: HudView): void {
    const phaseKey = `${view.phase}:${view.saveAvailable}`;
    const phaseChanged = phaseKey !== this.phaseKey;
    if (phaseChanged) { this.phaseKey = phaseKey; this.renderPhase(view); }
    const panelKey = this.panelRevision(view);
    const panelChanged = panelKey !== this.panelKey;
    if (panelChanged) { this.panelKey = panelKey; this.renderPanel(view); }
    this.root.dataset.phase = view.phase;
    this.root.dataset.panel = view.panel;
    this.root.classList.toggle('reduced-motion', view.reducedMotion);
    this.phaseRoot.hidden = view.panel !== 'none';
    this.set('realm-name', view.realmName); this.set('realm-glyph', ['气', '圆', '基'][view.realm] ?? '道');
    this.set('health-value', `${Math.ceil(view.health)} / ${view.maxHealth}`); this.set('qi-value', `${Math.ceil(view.qi)} / ${view.maxQi}`);
    this.fill('health-fill', view.health / view.maxHealth); this.fill('qi-fill', view.qi / view.maxQi); this.fill('xp-fill', view.realm >= 2 ? 1 : view.xp / view.xpNext);
    this.set('xp-value', view.realm >= 2 ? '筑基已成' : `修为 ${Math.floor(view.xp)} / ${view.xpNext}`);
    this.set('objective', view.objective); this.set('objective-detail', view.objectiveDetail); this.set('location', view.location); this.set('stones', String(view.stones));
    this.show('enemy', view.enemy !== null);
    if (view.enemy) { this.set('enemy-name', view.enemy.name); this.set('enemy-value', `${Math.ceil(view.enemy.health)} / ${view.enemy.maxHealth}`); this.fill('enemy-fill', view.enemy.health / view.enemy.maxHealth); }
    this.show('interact', Boolean(view.interact)); this.set('interact-text', view.interact); this.show('flight-status', view.flying);
    this.fields.get('skill-flight')!.classList.toggle('locked', !view.canFly); this.fields.get('skill-flight')!.classList.toggle('active', view.flying);
    this.fields.get('skill-breakthrough')!.classList.toggle('ready', view.realm < 2 && view.xp >= view.xpNext);
    this.fields.get('skill-heal')!.classList.toggle('locked', view.pills <= 0); this.show('lock-flight', !view.canFly); this.set('count-heal', String(view.pills));
    this.show('cooldown-thunder', view.skillCooldown > 0); this.set('cooldown-thunder', String(Math.ceil(view.skillCooldown)));
    this.show('cooldown-elemental',view.elementalCooldown>0);this.set('cooldown-elemental',String(Math.ceil(view.elementalCooldown)));
    this.fields.get('skill-elemental')!.classList.toggle('locked',view.qi<24);this.set('element-name',view.elementName);
    for(const element of ['metal','wood','water','fire','earth']){const el=this.fields.get(`element-${element}`)!;el.classList.toggle('selected',element===view.element);el.setAttribute('aria-pressed',String(element===view.element));}
    this.updatePanelValues(view);
    const now = performance.now();
    // Newly visible/recreated canvases need their first paint immediately,
    // even when a transition occurs inside the movement redraw throttle.
    if (phaseChanged || panelChanged || now - this.lastMapTime > 100) {
      this.lastMapTime = now;
      if (view.phase !== 'title') this.drawMap(this.minimap, view, false);
      const bigMap = this.panelRoot.querySelector<HTMLCanvasElement>('.world-map');
      if (bigMap) this.drawMap(bigMap, view, true);
    }
  }
  private set(key: string, value: string, panel = false): void {
    const cacheKey = `${panel ? 'panel-' : ''}${key}`;
    if (this.valueCache.get(cacheKey) === value) return;
    const element = (panel ? this.panelFields : this.fields).get(key);
    if (element) { element.textContent = value; this.valueCache.set(cacheKey, value); }
  }
  private fill(key: string, ratio: number): void {
    const value = `${Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 100}%`;
    if (this.valueCache.get(`fill-${key}`) !== value) { this.fields.get(key)!.style.width = value; this.valueCache.set(`fill-${key}`, value); }
  }
  private show(key: string, visible: boolean): void {
    const element = this.fields.get(key);
    if (element && element.hidden === visible) element.hidden = !visible;
  }
  private renderPhase(view: HudView): void {
    const heading = `<div class="ornament-line"><span></span>${icon('lotus')}<span></span></div>`;
    if (view.phase === 'title') {
      this.phaseRoot.innerHTML = `<div class="title-wash"></div><section class="title-screen"><div class="chapter-tag"><span class="red-seal">云<br>岚</span><span>一剑入山海 · 一念问长生</span></div><h1><span>云海</span><span>问道</span></h1><div class="title-chapter"><span></span> 云岚初境 <span></span></div><p class="title-intro">山门之外，万里云生。<br>执剑行走山海，寻灵脉，证筑基。</p><div class="title-actions">${button('new-game', '踏入仙途', true)}${view.saveAvailable ? button('continue', '续写前缘') : ''}<button class="text-button title-settings" data-action="settings">声音与画质 <span>→</span></button></div><div class="title-controls"><span>自由探索</span><i>◇</i><span>御剑凌空</span><i>◇</i><span>即时战斗</span><i>◇</i><span>境界突破</span></div></section><div class="title-world-caption"><span>云岚山脉</span><i></i><small>原创单机修仙 · 第一章</small></div>`;
    } else if (view.phase === 'paused') {
      this.phaseRoot.innerHTML = `<div class="menu-wash"></div><section class="center-menu">${heading}<div class="eyebrow">暂歇片刻</div><h1>静心养息</h1><p>山海仍在，待君归来。</p><div class="menu-actions">${button('resume', '继续行走', true)}${button('save', '保存修行')}${button('settings', '声音与画质')}</div><div class="menu-shortcuts"><button class="text-button" data-action="map">山川图 <kbd>M</kbd></button><button class="text-button" data-action="inventory">乾坤袋 <kbd>I</kbd></button></div><div class="menu-footnote"><kbd>Esc</kbd> 返回天地</div></section>`;
    } else if (view.phase === 'dead') {
      this.phaseRoot.innerHTML = `<div class="menu-wash danger-wash"></div><section class="center-menu fallen-menu">${heading}<div class="eyebrow">身陨道存</div><h1>仙途未尽</h1><p>一次败退，无损问道之心。<br>重整剑心，再入云岚。</p><p>${escape(view.objectiveDetail)}</p><div class="menu-actions">${button('retry', '重燃剑心', true)}${view.saveAvailable ? button('continue', '回到存档') : ''}${button('new-game', '重新启程')}</div><div class="menu-footnote">善用闪避避开妖兽重击，灵丹可恢复气血。</div></section>`;
    } else if (view.phase === 'complete') {
      this.phaseRoot.innerHTML = `<div class="menu-wash complete-wash"></div><section class="center-menu complete-menu">${heading}<div class="eyebrow">第一章 · 云岚初境</div><h1>云岚问道成</h1><p>三脉归一，妖气已散。<br>今日筑基，来日御剑万里。</p><div class="completion-verse">「山海有尽，仙途无涯」</div><div class="menu-actions">${button('explore', '继续游历', true)}${button('save', '铭记此程')}${button('new-game', '重启仙途')}</div><div class="menu-footnote">首章已完成 · 可继续探索山川、收集灵草与奇遇</div></section>`;
    } else this.phaseRoot.innerHTML = '';
  }
  private panelRevision(view: HudView): string {
    if (view.panel === 'journal') return `journal:${JSON.stringify(view.questSteps)}:${view.journalEntries.join('|')}`;
    if (view.panel === 'dialog') return `dialog:${JSON.stringify(view.dialogue)}`;
    if (view.panel === 'map') return `map:${view.landmarks.map(l => `${l.name}:${l.active}`).join('|')}`;
    return view.panel;
  }
  private renderPanel(view: HudView): void {
    this.panelRoot.hidden = view.panel === 'none'; this.panelFields.clear();
    for (const key of this.valueCache.keys()) if (key.startsWith('panel-')) this.valueCache.delete(key);
    if (view.panel === 'none') { this.panelRoot.innerHTML = ''; return; }
    if (view.panel === 'dialog') {
      const d = view.dialogue;
      this.panelRoot.innerHTML = d ? `<div class="dialog-shade"></div><section class="dialog-box" aria-label="对话"><div class="dialog-character">${icon('lotus')}<span>岚</span></div><div class="dialog-content"><div class="dialog-speaker">${escape(d.speaker)}</div><p>${escape(d.text)}</p><button class="dialog-next" data-action="dialog-next">${escape(d.actionLabel || '继续')} <kbd>E</kbd><span>→</span></button></div></section>` : '';
      return;
    }
    const names: Partial<Record<Panel, [string, string]>> = { map: ['山川舆图', '云岚山脉 · 山海行迹'], journal: ['修行札记', '第一章 · 云岚初境'], inventory: ['乾坤袋', '灵物随身 · 修行有备'], settings: ['静心调息', '声音 · 画质 · 舒适体验'] };
    const [name, subtitle] = names[view.panel]!;
    let content = '';
    if (view.panel === 'map') {
      content = `<div class="map-layout"><div class="big-map-frame"><canvas class="world-map" aria-label="云岚山脉地图，正北在上"></canvas><span class="big-map-title">云岚山川</span><span class="map-position" data-panel-field="position"></span></div><aside class="map-legend"><h3>山海胜迹</h3>${view.landmarks.map(l => `<div class="landmark-row ${l.active ? 'attuned' : ''}"><span class="landmark-symbol ${l.kind}">${this.landmarkGlyph(l)}</span><div><strong>${escape(l.name)}</strong><small>${l.active ? '已共鸣' : { sect: '宗门', shrine: '灵脉', boss: '妖气源头', treasure: '山中奇遇', coast: '可探索海岸', town:'可探索市集', forest:'西岭新境 · 可探索森林' }[l.kind]}</small></div></div>`).join('')}<p class="map-key"><i></i> 你的当前位置<br><span>地图上方为北 · 东西800米 · 南北600米</span></p></aside></div>`;
    } else if (view.panel === 'journal') {
      content = `<div class="journal-layout"><section><h3>问道之路</h3><ol class="quest-list">${view.questSteps.map((s, n) => `<li class="${s.done ? 'done' : s.current ? 'current' : ''}"><span class="quest-number">${s.done ? '✓' : String(n + 1).padStart(2, '0')}</span><div><strong>${escape(s.text)}</strong><small>${s.done ? '已完成' : s.current ? '当前修行' : '尚待前行'}</small></div></li>`).join('')}</ol></section><section class="journal-memories"><h3>山海见闻</h3>${view.journalEntries.length ? view.journalEntries.map(text => `<p><span>◇</span>${escape(text)}</p>`).join('') : '<p class="empty-note">行走山川，与人交谈，新的见闻将记于此处。</p>'}</section></div>`;
    } else if (view.panel === 'inventory') {
      content = `<div class="inventory-layout"><div class="item-rack"><div class="item-slot">${icon('herb')}<h3>灵草</h3><strong data-panel-field="herbs"></strong><p>山野灵蕴，可炼回春丹</p></div><div class="item-slot">${icon('pill')}<h3>回春丹</h3><strong data-panel-field="pills"></strong><p>服用后恢复气血</p></div><div class="item-slot">${icon('stone')}<h3>灵石</h3><strong data-panel-field="stones"></strong><p>山川馈赠，修行珍藏</p></div></div><div class="inventory-actions"><section><h3>丹道</h3><p>三株灵草，炼成一枚回春丹。</p>${button('brew', '炼制回春丹', true)}${button('heal', '服用回春丹')}</section><section class="realm-progress"><h3>问道突破</h3><div class="realm-path">${realmNames.map((name, i) => `<span data-realm="${i}">${name}${i < 2 ? '<i>→</i>' : ''}</span>`).join('')}</div><p data-panel-field="cultivation"></p>${button('breakthrough', '感悟 · 突破境界')}</section></div><div class="inventory-note">快捷键：<kbd>H</kbd> 服丹 <span>·</span> <kbd>B</kbd> 境界突破 <span>·</span> <kbd>I</kbd> 收起乾坤袋</div></div>`;
    } else if (view.panel === 'settings') {
      content = `<div class="settings-layout"><div class="setting-row"><div><h3>山海之声</h3><p>环境氛围与战斗音效</p></div><button class="setting-switch" data-action="mute" data-panel-field="mute"></button></div><div class="setting-row"><label for="game-volume"><h3>音量</h3><p data-panel-field="volume-value"></p></label><input id="game-volume" type="range" min="0" max="1" step="0.05" data-input="volume" aria-label="音量"></div><div class="setting-row"><div><h3>山川细节</h3><p>按设备性能选择场景品质</p></div><div class="segmented"><button data-action="quality:high">精致</button><button data-action="quality:low">流畅</button></div></div><div class="setting-row"><div><h3>轻缓动效</h3><p>减少界面动画与画面震动</p></div><button class="setting-switch" data-action="reduced-motion" data-panel-field="motion"></button></div><div class="setting-row"><div><h3>沉浸山海</h3><p>使用整个屏幕游玩</p></div><button class="outline-button" data-action="fullscreen">切换全屏</button></div><p class="settings-note">WASD 移动 · 右键拖动镜头 · 滚轮调整远近<br>左键剑斩 · Q 御雷 · Shift 闪避 · F 御剑<br>M 地图 · J 札记 · I 背包 · Esc 暂停</p></div>`;
    }
    this.panelRoot.innerHTML = `<div class="panel-wash"></div><section class="ink-panel ${view.panel}-panel" role="dialog" aria-modal="true" aria-label="${name}"><header class="panel-header"><div><span class="eyebrow">${subtitle}</span><h2>${name}</h2></div><button class="panel-close" data-action="close" aria-label="关闭">${icon('close')}</button></header><div class="panel-body">${content}</div><footer class="panel-footer"><span>云岚宗 · 云海问道</span><button class="text-button" data-action="close"><kbd>Esc</kbd> 返回</button></footer></section>`;
    this.panelRoot.querySelectorAll<HTMLElement>('[data-panel-field]').forEach(el => this.panelFields.set(el.dataset.panelField!, el));
  }
  private updatePanelValues(view: HudView): void {
    if (view.panel === 'inventory') {
      this.set('herbs', String(view.herbs), true); this.set('pills', String(view.pills), true); this.set('stones', String(view.stones), true);
      this.set('cultivation', view.realm >= 2 ? '筑基道成，首章境界已圆满。' : `修为 ${Math.floor(view.xp)} / ${view.xpNext}，修为充盈时可尝试突破。`, true);
      this.disable('brew', view.herbs < 3); this.disable('heal', view.pills < 1 || view.health >= view.maxHealth); this.disable('breakthrough', view.realm >= 2 || view.xp < view.xpNext);
      this.panelRoot.querySelectorAll<HTMLElement>('[data-realm]').forEach(el => el.classList.toggle('reached', Number(el.dataset.realm) <= view.realm));
    } else if (view.panel === 'settings') {
      this.set('mute', view.muted ? '已静音' : '声音开启', true); this.set('motion', view.reducedMotion ? '已开启' : '未开启', true); this.set('volume-value', `${Math.round(view.volume * 100)}%`, true);
      this.panelFields.get('mute')?.classList.toggle('selected', !view.muted); this.panelFields.get('motion')?.classList.toggle('selected', view.reducedMotion);
      this.panelFields.get('mute')?.setAttribute('aria-pressed', String(view.muted)); this.panelFields.get('motion')?.setAttribute('aria-pressed', String(view.reducedMotion));
      const volume = this.panelRoot.querySelector<HTMLInputElement>('#game-volume');
      if (volume && document.activeElement !== volume) volume.value = String(view.volume);
      this.panelRoot.querySelectorAll<HTMLButtonElement>('[data-action^="quality:"]').forEach(el => { const selected = el.dataset.action === `quality:${view.quality}`; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); });
    } else if (view.panel === 'map') this.set('position', `当前位置  ${Math.round(view.position.x)}, ${Math.round(view.position.z)}`, true);
  }
  private disable(action: string, disabled: boolean): void {
    const el = this.panelRoot.querySelector<HTMLButtonElement>(`[data-action="${action}"]`); if (el) el.disabled = disabled;
  }
  private landmarkGlyph(l: Landmark): string { return { sect: '山', shrine: '灵', boss: '煞', treasure: '宝', coast: '潮',town:'市',forest:'林' }[l.kind]; }
  private drawMap(canvas: HTMLCanvasElement, view: HudView, large: boolean): void {
    const size = canvas.getBoundingClientRect(); if (!size.width || !size.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2); const width = Math.round(size.width * ratio), height = Math.round(size.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const c = canvas.getContext('2d'); if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0); const w = size.width, h = size.height; c.clearRect(0, 0, w, h); c.save();
    if (!large) { c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.clip(); }
    const g = c.createRadialGradient(w * .45, h * .4, 0, w / 2, h / 2, w * .75); g.addColorStop(0, '#254438'); g.addColorStop(1, '#0b2425'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const margin = large ? 32 : 11; const project = (x: number, z: number): [number, number] => [margin + ((x-WORLD_MAP.minX)/(WORLD_MAP.maxX-WORLD_MAP.minX)) * (w - 2 * margin), margin + ((z-WORLD_MAP.minZ)/(WORLD_MAP.maxZ-WORLD_MAP.minZ)) * (h - 2 * margin)];
    c.lineWidth = .6; c.strokeStyle = 'rgba(186,205,177,.10)';
    for(let i=WORLD_MAP.minX;i<=WORLD_MAP.maxX;i+=100){const [x]=project(i,0);c.beginPath();c.moveTo(x,margin);c.lineTo(x,h-margin);c.stroke();}
    for(let i=WORLD_MAP.minZ;i<=WORLD_MAP.maxZ;i+=100){const [,y]=project(0,i);c.beginPath();c.moveTo(margin,y);c.lineTo(w-margin,y);c.stroke();}
    const [fx,fy]=project(WESTERN_FOREST.x,WESTERN_FOREST.z);c.beginPath();c.ellipse(fx,fy,WESTERN_FOREST.rx/(WORLD_MAP.maxX-WORLD_MAP.minX)*(w-2*margin),WESTERN_FOREST.rz/(WORLD_MAP.maxZ-WORLD_MAP.minZ)*(h-2*margin),0,0,Math.PI*2);c.fillStyle='rgba(131,169,111,.24)';c.fill();
    // Authored brush contours and river preserve map readability at small sizes.
    for (let ridge = 0; ridge < 6; ridge++) { c.beginPath(); for (let step = 0; step <= 20; step++) { const x = step / 20 * w, y = h * (.12 + ridge * .14) + Math.sin(step * .44 + ridge * 1.5) * h * .055 + Math.cos(step * .89) * h * .018; if (!step) c.moveTo(x, y); else c.lineTo(x, y); } c.strokeStyle = 'rgba(151,180,133,.19)'; c.lineWidth = large ? 2 : 1; c.stroke(); }
    c.beginPath(); c.moveTo(w * .66, -10); c.bezierCurveTo(w * .87, h * .34, w * .18, h * .54, w * .5, h + 10); c.strokeStyle = 'rgba(107,169,178,.30)'; c.lineWidth = large ? 10 : 3; c.stroke();
    // Southern sea and shore are projected from the same curve used by traversal.
    c.beginPath();
    for(let x=WORLD_MAP.minX;x<=WORLD_MAP.maxX;x+=10){const [px,py]=project(x,shorelineAt(x));if(x===WORLD_MAP.minX)c.moveTo(px,py);else c.lineTo(px,py);}
    c.lineTo(w-margin,h-margin);c.lineTo(margin,h-margin);c.closePath();c.fillStyle='#265761';c.fill();
    c.beginPath();for(let x=WORLD_MAP.minX;x<=WORLD_MAP.maxX;x+=10){const [px,py]=project(x,shorelineAt(x));if(x===WORLD_MAP.minX)c.moveTo(px,py);else c.lineTo(px,py);}c.strokeStyle='rgba(210,221,201,.65)';c.lineWidth=large?2:1;c.stroke();
    c.strokeStyle='rgba(221,199,148,.65)';c.lineWidth=large?2:1;c.beginPath();
    FOREST_APPROACH.forEach((p,i)=>{const [x,y]=project(p.x,p.z);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();c.beginPath();
    TOWN_APPROACH.forEach((p,i)=>{const [x,y]=project(p.x,p.z);if(i)c.lineTo(x,y);else c.moveTo(x,y);});const [sx,sy]=project(TOWN.x,TOWN.north);c.lineTo(sx,sy);c.stroke();
    c.fillStyle='rgba(221,199,148,.40)';for(const s of TOWN_SHOPS){const [x0,y0]=project(s.x,s.z-s.width/2),[x1,y1]=project(s.x+s.side*s.depth,s.z+s.width/2);c.fillRect(Math.min(x0,x1),y0,Math.abs(x1-x0),y1-y0);}
    for (const l of view.landmarks) { const [x, y] = project(l.x, l.z); const color = l.kind === 'boss' ? '#d78e7a' : l.kind === 'shrine' ? (l.active ? '#91d9cb' : '#b8dcd5') : '#d9c092'; c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1; c.beginPath(); const r = large ? 7 : 3.5; c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); if (l.active || l.kind === 'sect'||l.kind==='town') c.fill(); else c.stroke(); if (large) { c.font = '13px "Noto Serif CJK SC", "Songti SC", serif'; c.textAlign = 'center'; c.fillText(l.name, x, Math.min(h - 10, y + 24)); } }
    const [px, py] = project(view.position.x, view.position.z); c.fillStyle = '#eaf7ec'; c.shadowColor = '#c8fff0'; c.shadowBlur = large ? 12 : 6; c.beginPath(); c.arc(px, py, large ? 5 : 3, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; c.strokeStyle = '#e0f5e9'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, large ? 10 : 6, 0, Math.PI * 2); c.stroke();
    if (large) { c.fillStyle = '#c2cebc'; c.font = '15px "Noto Serif CJK SC", serif'; c.textAlign = 'center'; c.fillText('北', w / 2, 21); c.fillText('南', w / 2, h - 11); c.fillText('西', 14, h / 2); c.fillText('东', w - 14, h / 2); }
    c.restore();
  }
  toast(text: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer); this.set('toast', text);
    const element = this.root.querySelector<HTMLElement>('.toast-message')!; element.hidden = false;
    this.toastTimer = setTimeout(() => { element.hidden = true; this.toastTimer = null; }, 3600);
  }
  dispose(): void { if (this.toastTimer) clearTimeout(this.toastTimer); this.root.removeEventListener('click', this.click); this.root.removeEventListener('input', this.input); this.root.remove(); }
}
