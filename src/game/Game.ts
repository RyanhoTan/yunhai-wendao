import * as THREE from 'three';
import { createEnemy, createHerb, createShrine } from '../assets/Models';
import { createAnimatedCultivator } from '../assets/Cultivator';
import { createWorld, terrainHeight } from '../world/World';
import { SEA_LEVEL, shorelineAt, safeCoastalPosition } from '../world/CoastMath';
import { TOWN, inTown, townShopAt, townRoofAt } from '../world/TownLayout';
import { SHOP_NAMES } from '../world/TownMaterials';
import { AdventureInput } from '../core/AdventureInput';
import { constrainCameraBoom } from '../core/CameraBoom';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { CultivationAudio } from '../systems/CultivationAudio';
import { Hud } from '../ui/Hud';
import type { HudView, Landmark, Panel, Phase, SaveData } from './types';
import { readSave, SAVE_KEY } from './Save';
import { createSeededRandom } from '../utils/random';
import { disposeObject3D } from '../utils/dispose';

interface Enemy {
  id: number; model: ReturnType<typeof createEnemy>; home: THREE.Vector3; health: number; maxHealth: number;
  windup: number; cooldown: number; target: THREE.Vector3; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; dead: boolean; moving: boolean; kind: 'spirit' | 'guardian';
}
interface Herb { id: number; root: THREE.Group; collected: boolean }
interface Shot { root: THREE.Mesh; life: number; damage: number; target: Enemy }
interface Burst { root: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number; size: number }
const REALMS = ['练气初期', '练气圆满', '筑基期'];
const THRESHOLDS = [60, 250, 0];
const SHRINE_COORDS = [[-110, -70], [105, -135], [0, -245]];
const ENEMY_COORDS = [[18,-20],[-28,-25],[36,-65],[-65,-55],[-104,-62],[-121,-84],[-93,-94],[97,-127],[113,-144],[86,-158],[11,-231],[-13,-251],[22,-263],[-155,-145],[0,-280]];
const HERB_COORDS = [[-15,12],[13,4],[-9,-13],[26,-34],[-37,-45],[46,-87],[-56,-65],[-84,-39],[-126,-45],[-139,-98],[-94,-120],[-59,-153],[63,-99],[115,-99],[140,-160],[96,-185],[53,-175],[21,-201],[-37,-210],[-24,-260],[51,-247],[-143,-140],[166,-76],[-179,-31]];
const TREASURES = [[-145,-105],[152,-170],[-45,-236]];
const STEP = 1 / 60;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(57, 1, 0.1, 5000);
  private input: AdventureInput;
  private audio = new CultivationAudio();
  private hud: Hud;
  private world: ReturnType<typeof createWorld>;
  private hero = createAnimatedCultivator();
  private mentor = createAnimatedCultivator();
  private enemies: Enemy[] = [];
  private herbs: Herb[] = [];
  private shrines: THREE.Group[] = [];
  private treasures: THREE.Group[] = [];
  private shots: Shot[] = [];
  private bursts: Burst[] = [];
  private ringGeometry = new THREE.RingGeometry(0.85, 1, 48);
  private shotGeometry = new THREE.IcosahedronGeometry(0.22, 1);
  private shotMaterial = new THREE.MeshBasicMaterial({ color: '#9cfff1' });
  private goldMaterial = new THREE.MeshBasicMaterial({ color: '#ffe2a1', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private velocity = new THREE.Vector3();
  private motion = new THREE.Vector3();
  private cameraTarget = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3();
  private cameraResolvedYaw = 0;
  private environment: THREE.WebGLRenderTarget;
  private loop: Loop;
  private frame = 0;
  private elapsed = 0;
  private accumulator = 0;
  private uiTimer = 0;
  private saveTimer = 0;
  private phase: Phase = 'title';
  private panel: Panel = 'none';
  private returnPhase: Phase = 'playing';
  private health = 100;
  private qi = 100;
  private xp = 0;
  private realm = 0;
  private herbCount = 0;
  private pills = 2;
  private stones = 0;
  private kills = 0;
  private quest = 0;
  private activeShrines = [false, false, false];
  private treasureFlags = new Set<number>();
  private flying = false;
  private returningToShore = false;
  private flightHeight = 5;
  private dashTime = 0;
  private dashCooldown = 0;
  private invulnerable = 0;
  private spellCooldown = 0;
  private attackTime = -1;
  private attackCooldown = 0;
  private hitstop = 0;
  private shake = 0;
  private deathReason = '';
  private interact = '';
  private interaction: (() => void) | null = null;
  private dialogue: HudView['dialogue'] = null;
  private dialogueCallback: (() => void) | null = null;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private quality = 'high';
  private saveAvailable = false;
  private rng = createSeededRandom(42);
  private journalEntries = ['云岚山谷灵脉日渐衰弱。师长沈清尘正在宗门外等候。'];
  private diagnosticsEnabled = import.meta.env.DEV || new URLSearchParams(location.search).has('test');

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas); this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color('#bcd5d0'); this.scene.fog = new THREE.Fog('#bcd5d0', 100, 720);
    // Warm key / cool sky and restrained anti-solar fill, studied in long-wind's environment rig.
    this.scene.add(new THREE.HemisphereLight('#c4dce9', '#908470', 1.12));
    this.sun = new THREE.DirectionalLight('#fff0d7', 2.45); this.sun.position.set(-84, 46, 25); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, {left:-30,right:30,top:30,bottom:-30,far:220});
    this.sun.shadow.bias = -0.00015; this.sun.shadow.normalBias = 0.025; this.scene.add(this.sun, this.sun.target);
    this.fill=new THREE.DirectionalLight('#b8d5e9',.32);this.scene.add(this.fill,this.fill.target);
    this.world = createWorld(this.scene);
    const pmrem = new THREE.PMREMGenerator(this.renderer), environmentScene = new THREE.Scene();
    environmentScene.add(this.world.sky.clone());
    this.environment = pmrem.fromScene(environmentScene, 0, .1, 5000); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.4; pmrem.dispose();
    this.scene.add(this.hero.root, this.mentor.root);
    this.mentor.root.position.set(0, terrainHeight(0,32), 32); this.mentor.root.rotation.y = Math.PI; this.mentor.root.scale.setScalar(1.03);
    this.createEntities(); this.input = new AdventureInput(canvas); this.hud = new Hud(action => this.action(action));
    this.restorePreferences(); this.saveAvailable = readSave() !== null; this.reset(false);
    this.loop = new Loop(dt => this.update(dt), () => this.render()); resizeRenderer(this.renderer, this.camera, 1.5);
    this.updateCamera(1, true); this.updateHud(); document.addEventListener('visibilitychange', this.visibility); window.addEventListener('pagehide', this.pageHide);
    if (this.diagnosticsEnabled) this.installTestHooks(); this.publishDiagnostics();
  }
  start(): void { this.loop.start(); }
  private get maxHealth(): number { return 100 + this.realm * 30; }
  private get maxQi(): number { return 100 + this.realm * 20; }
  private get canFly(): boolean { return this.realm >= 1 && this.quest >= 3; }
  private get boss(): Enemy { return this.enemies[14]; }
  private createEntities(): void {
    ENEMY_COORDS.forEach(([x,z], id) => {
      const kind = id === 14 ? 'guardian' : 'spirit', model = createEnemy(kind), home = new THREE.Vector3(x, terrainHeight(x,z), z); model.root.position.copy(home);
      const ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: '#ef785d', transparent: true, opacity: 0.68, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.visible = false;
      const maxHealth = kind === 'guardian' ? 500 : 65;
      this.enemies.push({ id, kind, model, home, maxHealth, health: maxHealth, windup: -1, cooldown: 1 + id * 0.1, target: new THREE.Vector3(), ring, dead: false, moving:false }); this.scene.add(model.root, ring);
    });
    HERB_COORDS.forEach(([x,z], id) => { const root = createHerb(); root.position.set(x,terrainHeight(x,z),z); this.scene.add(root); this.herbs.push({ id, root, collected: false }); });
    SHRINE_COORDS.forEach(([x,z]) => { const root = createShrine(); root.position.set(x,terrainHeight(x,z),z); this.scene.add(root); this.shrines.push(root); });
    TREASURES.forEach(([x,z]) => {
      const root = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.8,1), new THREE.MeshStandardMaterial({ color: '#355f5a', roughness: 0.4 })); box.position.y = 0.5; root.add(box);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.95,0.13,1.1), new THREE.MeshStandardMaterial({ color: '#c59d50', metalness: 0.7, roughness: 0.35 })); trim.position.y = 0.84; root.add(trim);
      const seal = new THREE.Mesh(new THREE.TorusGeometry(0.18,0.04,6,12), this.goldMaterial); seal.position.set(0,0.6,0.55); root.add(seal);
      root.position.set(x,terrainHeight(x,z),z); this.scene.add(root); this.treasures.push(root);
    });
  }
  private reset(play = true): void {
    this.realm = 0; this.health = 100; this.qi = 100; this.xp = 0; this.herbCount = 0; this.pills = 2; this.stones = 0; this.kills = 0; this.quest = 0; this.elapsed=0; this.accumulator=0;
    this.activeShrines = [false,false,false]; this.treasureFlags.clear(); this.flying = false; this.phase = play ? 'playing' : 'title'; this.returnPhase=this.phase; this.panel = 'none'; this.dialogue=null; this.dialogueCallback=null;
    this.hero.root.position.set(0,terrainHeight(0,50),50); this.hero.root.rotation.y = 0; this.input.clear(); this.input.yaw = 0; this.input.pitch = 0.28;
    if(!play){const z=shorelineAt(0)-12;this.hero.root.position.set(0,terrainHeight(0,z),z);this.hero.root.rotation.y=Math.PI;this.input.yaw=Math.PI;this.input.pitch=.15;}
    this.velocity.set(0,0,0); this.resetCombat(); this.journalEntries = ['云岚山谷灵脉日渐衰弱。师长沈清尘正在宗门外等候。'];
    for (const herb of this.herbs) { herb.collected = false; herb.root.visible = true; }
    for (const enemy of this.enemies) { enemy.dead = false; enemy.moving=false; enemy.health = enemy.maxHealth; enemy.model.root.visible = true; enemy.model.root.position.copy(enemy.home); enemy.windup = -1; enemy.cooldown = 1; enemy.ring.visible = false; }
    this.setShrineVisuals(); for (const treasure of this.treasures) treasure.visible = true; this.updateInteraction(); this.updateCamera(1,true); this.updateHud();
  }
  private resetCombat(): void {
    this.hero.resetPose();
    this.returningToShore=false;
    this.dashTime = 0; this.dashCooldown = 0; this.spellCooldown = 0; this.attackTime = -1; this.attackCooldown = 0; this.invulnerable = 0; this.hitstop = 0; this.shake = 0;
    for (const shot of this.shots) this.scene.remove(shot.root); this.shots.length = 0;
    for (const burst of this.bursts) { this.scene.remove(burst.root); burst.root.material.dispose(); } this.bursts.length = 0;
  }
  private action(action: string): void {
    if (action === 'new-game') { this.reset(); this.save(); void this.audio.unlock().then(() => this.audio.ambience(this.phase==='playing')); this.hud.toast('云岚初境 · 与前方师长交谈'); }
    else if (action === 'continue') this.load();
    else if (action === 'resume' || action === 'close') { this.phase = this.returnPhase === 'title' ? 'title' : 'playing'; this.panel = 'none'; this.input.clear(); this.audio.ambience(this.phase === 'playing'); }
    else if (action === 'pause') { if (this.phase === 'playing') this.openPanel('none'); }
    else if (['map','journal','inventory','settings'].includes(action)) { if (this.phase === 'playing' || (this.phase === 'paused' && this.panel !== 'dialog' && (this.returnPhase !== 'title' || action === 'settings')) || (this.phase === 'title' && action === 'settings')) this.openPanel(action as Panel); }
    else if (action === 'retry') { this.health = this.maxHealth; this.qi = this.maxQi; this.hero.root.position.set(0,terrainHeight(0,50),50); this.flying = false; this.velocity.set(0,0,0); this.resetCombat(); this.phase = 'playing'; this.panel = 'none'; this.input.clear(); for (const enemy of this.enemies) { if (!enemy.dead) enemy.model.root.position.copy(enemy.home); enemy.windup = -1; enemy.ring.visible = false; enemy.cooldown = 2; } this.updateCamera(1,true); this.audio.ambience(true); this.save(); }
    else if (action === 'explore') { this.phase = 'playing'; this.panel = 'none'; this.audio.ambience(true); }
    else if (action === 'save') this.save(true);
    else if (action === 'brew') this.brew();
    else if (action === 'heal') this.heal();
    else if (action === 'breakthrough') this.breakthrough();
    else if (action === 'mute') { this.audio.setMuted(!this.audio.muted); this.savePreferences(); }
    else if (action.startsWith('volume:')) { const value = Number(action.split(':')[1]); if (Number.isFinite(value)) this.audio.setVolume(value); this.savePreferences(); }
    else if (action.startsWith('quality:')) { this.quality = action.endsWith('low') ? 'low' : 'high'; this.renderer.shadowMap.enabled = this.quality === 'high'; this.savePreferences(); }
    else if (action === 'reduced-motion') { this.reducedMotion = !this.reducedMotion; this.savePreferences(); }
    else if (action === 'dialog-next') { const callback = this.dialogueCallback; this.dialogueCallback = null; this.dialogue = null; this.phase = 'playing'; this.panel = 'none'; callback?.(); this.audio.ambience(true); this.input.clear(); }
    else if (action === 'fullscreen') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => this.hud.toast('当前浏览器未允许全屏')); }
    this.updateHud();
  }
  private openPanel(panel: Panel): void { if(this.phase !== 'paused')this.returnPhase=this.phase; this.phase = 'paused'; this.panel = panel; this.input.clear(); this.audio.ambience(false); this.updateHud(); }
  private talk(text: string, actionLabel = '继续', callback?: () => void): void { this.dialogue = { speaker: '沈清尘 · 云岚宗师长', text, actionLabel }; this.dialogueCallback = callback ?? null; this.openPanel('dialog'); }
  private speakToMentor(): void {
    if (this.quest === 0) this.talk('山中灵脉被浊气侵蚀。先去宗门外采集三株青灵草，遇见妖灵时，观察红色蓄力圈，用闪避躲开攻击。带草回来，我传你御剑心诀。', '接下历练', () => { this.quest = 1; this.journalEntries.push('已领取历练：采集三株青灵草，回宗门向沈清尘复命。'); this.save(); });
    else if (this.quest === 1 && this.herbCount >= 3) this.talk('灵草齐备，为你渡入七十点修为。按 B 凝气突破，便能掌握御剑；随后寻访山谷三座阵眼，驱散守卫妖灵，再用 E 注入灵气。', '领悟御剑心诀', () => { this.quest = 2; this.xp += 70; this.stones += 30; this.journalEntries.push('师长传授御剑心诀。三阵眼位于松风林、玉镜潭与望月台。'); this.save(); });
    else if (this.quest === 1) this.talk(`还需带回三株青灵草。你身上已有 ${this.herbCount} 株；草叶上方的青色灵光可帮助辨认。`, '继续采集');
    else if (this.quest === 2) this.talk('修为已足，按 B 凝气突破。御剑以 F 唤出，Space 升高，C 降低；真气耗尽会自动落地。', '前去突破');
    else if (this.quest < 5) this.talk('三阵眼皆醒，镇山石灵才会解除封印。不要贪攻：红圈蓄满前离开区域，落地恢复真气。三株灵草可炼一枚回春丹。', '继续修行');
    else this.talk('你已筑基，云岚灵脉重归清明。大道无涯，山谷中尚有奇遇与宝藏，凭你的心意去探索吧。', '自由探索');
  }
  private breakthrough(): void {
    if (this.realm === 2) { this.hud.toast('已达首章最高境界 · 筑基期'); return; }
    if ((this.realm === 0 && this.quest < 2) || (this.realm === 1 && !this.boss.dead)) { this.hud.toast(this.realm === 0 ? '先完成师长历练，领悟心诀' : '先击败镇山石灵，获得筑基机缘'); return; }
    if (this.xp < THRESHOLDS[this.realm]) { this.hud.toast(`修为不足，还需 ${THRESHOLDS[this.realm] - this.xp} 点`); return; }
    this.xp -= THRESHOLDS[this.realm]; this.realm++; this.health = this.maxHealth; this.qi = this.maxQi;
    this.burst(this.hero.root.position, 0xffe2a1, 2.4); this.shake = 0.2;
    if (this.realm === 1) { this.quest = 3; this.hud.toast('练气圆满 · 御剑已解锁，按 F 飞行'); }
    else { this.quest = 5; this.phase = 'complete'; this.panel = 'none'; this.flying = false; this.audio.ambience(false); this.journalEntries.push('三阵眼重启，镇山石灵归于寂静。筑基成功，首章完成。'); }
    this.audio.play('breakthrough'); this.save(); this.updateHud();
  }
  private brew(): void { if (this.quest < 2) { this.hud.toast('先完成师长的采药历练，再炼丹'); return; } if (this.herbCount < 3) { this.hud.toast('炼制回春丹需要 3 株青灵草'); return; } this.herbCount -= 3; this.pills++; this.audio.play('pickup'); this.hud.toast('炼成回春丹 ×1'); this.save(); }
  private heal(): void { if (this.pills < 1) { this.hud.toast('没有回春丹，可在背包中用灵草炼制'); return; } if (this.health >= this.maxHealth) { this.hud.toast('气血充盈，无需服丹'); return; } this.pills--; this.health = Math.min(this.maxHealth, this.health + 65); this.audio.play('pickup'); this.burst(this.hero.root.position, 0x8fffbb, 1); this.hud.toast('回春丹 · 恢复 65 气血'); this.save(); }
  private update(dt: number): void {
    this.frame++; resizeRenderer(this.renderer,this.camera,this.quality === 'high' ? 1.5 : 1);
    if (this.pausedForScreenshot) { this.publishDiagnostics(); return; }
    this.handleKeys();
    if (this.phase === 'playing') {
      this.elapsed += dt; this.hitstop = Math.max(0,this.hitstop-dt); this.accumulator += this.hitstop > 0 ? dt * 0.15 : dt;
      while (this.accumulator >= STEP && this.phase==='playing') { this.fixedUpdate(STEP); this.accumulator -= STEP; }
      this.audio.update(dt); this.saveTimer += dt; if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
    }
    const animate = this.phase === 'playing' || this.phase === 'title', time = animate ? this.elapsed : 0;
    this.world.update(animate && !this.reducedMotion ? dt : 0,this.reducedMotion?0:time); this.hero.animate(animate ? dt : 0,time,this.velocity.length(),this.flying,this.attackTime >= 0 ? this.attackTime / 0.45 : 0,this.dashTime>0?1-this.dashTime/.28:-1); this.mentor.animate(animate ? dt : 0,time,0,false,0);
    for (const enemy of this.enemies) {enemy.model.setDetail(enemy.model.root.position.distanceTo(this.hero.root.position)<55);enemy.model.animate(animate ? dt : 0,time,enemy.moving,enemy.windup >= 0 ? 1-enemy.windup/0.85 : 0);}
    if (animate) for (const herb of this.herbs) if (!herb.collected) herb.root.rotation.y = Math.sin(time * 0.4 + herb.id) * 0.2;
    if (this.phase === 'playing' || this.phase === 'title') this.updateCamera(dt);
    this.uiTimer += dt; if (this.uiTimer > 0.06) { this.uiTimer = 0; this.updateHud(); } this.publishDiagnostics();
  }
  private handleKeys(): void {
    if(this.phase === 'paused' && this.panel === 'dialog' && this.input.take('KeyE')) this.action('dialog-next');
    if (this.input.take('Escape')) { if (this.phase === 'playing') this.action('pause'); else if (this.phase === 'paused') this.action(this.panel === 'dialog' ? 'dialog-next' : 'resume'); }
    for (const [key, panel] of [['KeyM','map'],['KeyJ','journal'],['KeyI','inventory']] as const) if (this.input.take(key) && (this.phase === 'playing' || (this.phase === 'paused' && this.panel !== 'dialog' && this.returnPhase !== 'title'))) this.action(this.phase === 'paused' && this.panel === panel ? 'resume' : panel);
    if (this.phase !== 'playing') { for(const key of ['Attack','KeyQ','KeyE','KeyF','KeyB','KeyH','ShiftLeft','ShiftRight'])this.input.take(key); return; }
    if (this.input.take('KeyE')) this.interaction?.();
    if(this.phase!=='playing')return;
    if (this.input.take('KeyH')) this.heal(); if (this.input.take('KeyB')) this.breakthrough(); if(this.phase!=='playing')return;
    if (this.input.take('KeyF')) this.toggleFlight(); if (this.input.take('Attack') || this.input.take('KeyR')) this.swordAttack(); if (this.input.take('KeyQ')) this.castSpell();
    const dash = this.input.take('ShiftLeft') || this.input.take('ShiftRight');
    if (dash && !this.flying && this.dashCooldown <= 0 && this.qi >= 12) { this.dashTime = 0.28; this.dashCooldown = 0.85; this.invulnerable = 0.4; this.qi -= 12; if (this.velocity.lengthSq() < 0.01) this.velocity.set(-Math.sin(this.hero.root.rotation.y)*6,0,-Math.cos(this.hero.root.rotation.y)*6); this.audio.play('fly'); this.burst(this.hero.root.position,0x9cfff1,0.6); }
  }
  private fixedUpdate(dt: number): void {
    this.spellCooldown = Math.max(0,this.spellCooldown-dt); this.attackCooldown = Math.max(0,this.attackCooldown-dt); this.dashCooldown = Math.max(0,this.dashCooldown-dt); this.dashTime = Math.max(0,this.dashTime-dt); this.invulnerable = Math.max(0,this.invulnerable-dt);
    this.movePlayer(dt);
    if (this.attackTime >= 0) { const before = this.attackTime; this.attackTime += dt; if (before < 0.16 && this.attackTime >= 0.16) this.swordContact(); if (this.attackTime > 0.45) this.attackTime = -1; }
    for (const enemy of this.enemies) this.updateEnemy(enemy,dt); this.updateShots(dt); this.updateBursts(dt); this.updateInteraction();
    if (this.health <= 0 && this.phase === 'playing') { this.phase = 'dead'; this.panel = 'none'; this.flying = false; this.velocity.set(0,0,0); this.audio.ambience(false); this.audio.play('death'); this.input.clear(); this.updateHud(); }
  }
  private movePlayer(dt: number): void {
    const keys = this.input.keys, forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')), right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const yaw = this.cameraResolvedYaw, boost = this.flying && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    this.motion.set(-Math.sin(yaw)*forward + Math.cos(yaw)*right,0,-Math.cos(yaw)*forward - Math.sin(yaw)*right); if (this.motion.lengthSq() > 0) this.motion.normalize();
    const speed = this.flying ? (boost ? 34 : 20) : this.attackTime >= 0 ? 2.5 : 6.8;
    if(this.returningToShore)this.motion.set(0,0,-16/speed);
    if (this.dashTime <= 0) this.velocity.lerp(this.motion.multiplyScalar(speed),1-Math.exp(-dt*14));
    const p = this.hero.root.position, multiplier = this.dashTime > 0 ? 3.6 : 1;
    p.x = THREE.MathUtils.clamp(p.x + this.velocity.x * dt * multiplier,-294,294); p.z = THREE.MathUtils.clamp(p.z + this.velocity.z * dt * multiplier,-294,294);
    if(!this.flying&&p.z>shorelineAt(p.x)+13){p.z=shorelineAt(p.x)+13;this.velocity.z=Math.min(0,this.velocity.z);}
    const ground = terrainHeight(p.x,p.z);
    if (this.flying) {
      this.qi = Math.max(0,this.qi - dt * (boost ? 8 : 3)); this.flightHeight = Math.max(2.7,Math.min(44,this.flightHeight + (Number(keys.has('Space'))-Number(keys.has('KeyC')))*12*dt));
      const flightGround=p.z>166?Math.max(SEA_LEVEL,ground):ground;
      p.y += (flightGround + this.flightHeight - p.y) * (1-Math.exp(-dt*4));
      if (this.qi <= 0) {
        if(p.z>166&&ground<-.8){if(!this.returningToShore)this.hud.toast('真气耗尽 · 剑灵护送返回浅滩');this.returningToShore=true;this.flightHeight=2.7;}
        else{this.flying=false;this.returningToShore=false;this.hud.toast('真气耗尽 · 自动落地');}
      }
      if (!this.boss.dead && this.activeShrines.every(Boolean) && Math.hypot(p.x,p.z+280)<25) { this.flying = false; this.hud.toast('镇山结界 · 请落地迎战'); }
    } else { p.y += (ground-p.y)*(1-Math.exp(-dt*12)); if (Math.abs(p.y-ground)<0.08) p.y=ground; this.qi = Math.min(this.maxQi,this.qi+dt*8); }
    if (p.y-ground < 3) for (const c of this.world.colliders) { const dx=p.x-c.x,dz=p.z-c.z,r=c.r+0.55,d=Math.hypot(dx,dz); if (d<r) { const safe=Math.max(d,0.001); p.x=c.x+(d<0.001?1:dx/safe)*r; p.z=c.z+dz/safe*r; } }
    for (const wall of this.world.walls) {
      if(p.y+1.8<wall.min.y || p.y>wall.max.y)continue;
      const minX=wall.min.x-0.55,maxX=wall.max.x+0.55,minZ=wall.min.z-0.55,maxZ=wall.max.z+0.55;
      if(p.x>minX&&p.x<maxX&&p.z>minZ&&p.z<maxZ){const sides=[p.x-minX,maxX-p.x,p.z-minZ,maxZ-p.z],nearest=sides.indexOf(Math.min(...sides));if(nearest===0)p.x=minX;else if(nearest===1)p.x=maxX;else if(nearest===2)p.z=minZ;else p.z=maxZ;}
    }
    if (this.velocity.lengthSq()>0.12 && this.attackTime<0) { const angle=Math.atan2(-this.velocity.x,-this.velocity.z),diff=Math.atan2(Math.sin(angle-this.hero.root.rotation.y),Math.cos(angle-this.hero.root.rotation.y)); this.hero.root.rotation.y += diff*(1-Math.exp(-dt*16)); }
  }
  private toggleFlight(): void {
    const p=this.hero.root.position;
    if(this.returningToShore){this.hud.toast('剑灵正在护送返回浅滩');return;}
    const roof=townRoofAt(p.x,p.z);
    if(this.flying&&roof&&p.y>TOWN.groundY+3.5+(roof.storeys-1)*3){this.hud.toast('屋顶上方无法收剑 · 移到长街或巷道落地');return;}
    if(this.flying&&p.z>166&&terrainHeight(p.x,p.z)<-.8){this.hud.toast('深水无法落地 · 御剑返回沙滩或浅滩');return;}
    if (!this.canFly) { this.hud.toast('完成师长历练并突破至练气圆满，解锁御剑'); return; } if (!this.flying && this.qi<10) { this.hud.toast('真气不足，落地调息片刻'); return; }
    this.flying = !this.flying; this.flightHeight = 5; this.audio.play('fly'); this.burst(this.hero.root.position,0x93e8e0,1); this.hud.toast(this.flying ? '御剑 · Space 升高 / C 降低 / Shift 加速' : '收剑落地 · 真气恢复');
  }
  private nearestEnemy(range: number): Enemy | null { let found:Enemy|null=null,best=range; for (const e of this.enemies) { if (e.dead || (e.kind==='guardian' && !this.activeShrines.every(Boolean))) continue; const d=e.model.root.position.distanceTo(this.hero.root.position); if(d<best){best=d;found=e;} } return found; }
  private swordAttack(): void { if (this.attackCooldown>0 || this.flying) return; this.attackTime=0; this.attackCooldown=0.48; const enemy=this.nearestEnemy(4.6); if(enemy){const delta=enemy.model.root.position.clone().sub(this.hero.root.position);this.hero.root.rotation.y=Math.atan2(-delta.x,-delta.z);} this.audio.play('slash'); }
  private swordContact(): void {
    const p=this.hero.root.position,facing=new THREE.Vector3(-Math.sin(this.hero.root.rotation.y),0,-Math.cos(this.hero.root.rotation.y));
    for(const e of this.enemies){if(e.dead || (e.kind==='guardian' && !this.activeShrines.every(Boolean)))continue; const d=e.model.root.position.clone().sub(p),distance=d.length();d.y=0;if(distance<(e.kind==='guardian'?5.2:3.8)&&d.normalize().dot(facing)>0.1)this.damageEnemy(e,26+this.realm*12);}
    const center=p.clone().addScaledVector(facing,1.6);center.y+=0.9;this.burst(center,0xdcfff5,1.4);
  }
  private castSpell(): void {
    if(this.spellCooldown>0)return;if(this.qi<22){this.hud.toast('真气不足 · 落地调息');return;}const target=this.nearestEnemy(38);if(!target){this.hud.toast('附近没有可锁定的妖灵（御雷射程 38 米）');return;}
    this.qi-=22;this.spellCooldown=2.8;const root=new THREE.Mesh(this.shotGeometry,this.shotMaterial);root.position.copy(this.hero.root.position);root.position.y+=1.3;this.scene.add(root);this.shots.push({root,life:2,damage:42+this.realm*18,target});this.audio.play('spell');
  }
  private updateShots(dt:number):void {
    for(let i=this.shots.length-1;i>=0;i--){const shot=this.shots[i];shot.life-=dt;const target=shot.target.model.root.position.clone();target.y+=shot.target.kind==='guardian'?2:0.7;const delta=target.sub(shot.root.position),distance=delta.length(),step=42*dt;
      if(!shot.target.dead&&distance<=step+0.9){this.damageEnemy(shot.target,shot.damage);shot.life=0;}else shot.root.position.add(delta.normalize().multiplyScalar(step));if(shot.life<=0||shot.target.dead){this.scene.remove(shot.root);this.shots.splice(i,1);}}
  }
  private damageEnemy(e:Enemy,damage:number):void {
    e.health=Math.max(0,e.health-damage);this.audio.play('hit');this.hitstop=0.045;this.shake=0.15;this.burst(e.model.root.position,0xffd49a,1.5);if(e.health>0)return;
    e.dead=true;e.model.root.visible=false;e.ring.visible=false;e.windup=-1;this.kills++;this.xp+=e.kind==='guardian'?280:32;this.stones+=e.kind==='guardian'?100:12;
    this.hud.toast(e.kind==='guardian'?'镇山石灵已平息 · 按 B 筑基，完成首章':'妖灵消散 · 修为 +32 / 灵石 +12');if(e.kind==='guardian')this.journalEntries.push('镇山石灵已平息，获得筑基机缘。按 B 完成筑基。');this.save();
  }
  private updateEnemy(e:Enemy,dt:number):void {
    e.moving=false;
    if(e.dead)return;if(e.kind==='guardian'&&!this.activeShrines.every(Boolean)){e.ring.visible=false;return;}
    const p=e.model.root.position,player=this.hero.root.position,distance=Math.hypot(p.x-player.x,p.z-player.z),radius=e.kind==='guardian'?7.5:3.2;e.cooldown=Math.max(0,e.cooldown-dt);
    if(e.windup>=0){e.windup-=dt;const progress=1-Math.max(0,e.windup)/0.85;e.ring.scale.setScalar(radius*(0.25+progress*0.75));e.ring.rotation.z+=dt;
      if(e.windup<=0){e.windup=-1;e.ring.visible=false;e.cooldown=e.kind==='guardian'?1.65:2.15;this.burst(e.target,0xf78665,radius);if(Math.hypot(player.x-e.target.x,player.z-e.target.z)<radius && player.y-terrainHeight(player.x,player.z)<3)this.damagePlayer(e.kind==='guardian'?28:14,e.kind==='guardian'?'镇山石灵的灵压冲击':'妖灵的扑击');}return;}
    if(distance>(e.kind==='guardian'?32:20)){if(p.distanceTo(e.home)>0.3){p.lerp(e.home,dt*0.8);e.moving=dt>0;}return;}
    const dx=player.x-p.x,dz=player.z-p.z;e.model.root.rotation.y=Math.atan2(-dx,-dz);if(distance>radius*0.8){const speed=e.kind==='guardian'?2.5:3.8;p.x+=dx/distance*speed*dt;p.z+=dz/distance*speed*dt;p.y=terrainHeight(p.x,p.z);e.moving=dt>0;}
    if(distance<radius+1&&e.cooldown<=0&&player.y-terrainHeight(player.x,player.z)<3){e.windup=0.85;e.target.copy(e.kind==='guardian'?player:p);e.target.y=terrainHeight(e.target.x,e.target.z)+0.08;e.ring.position.copy(e.target);e.ring.visible=true;e.ring.scale.setScalar(radius*0.25);}
  }
  private damagePlayer(amount:number,reason:string):void {if(this.invulnerable>0)return;this.health=Math.max(0,this.health-amount);this.invulnerable=0.45;this.deathReason=reason;this.shake=0.4;this.audio.play('hit');this.hud.toast(`${reason} · 气血 -${amount}`);}
  private updateInteraction():void {
    this.interact='';this.interaction=null;if(this.flying)return;const p=this.hero.root.position;
    if(p.distanceTo(this.mentor.root.position)<4){this.interact='E 与沈清尘交谈';this.interaction=()=>this.speakToMentor();return;}
    for(const h of this.herbs)if(!h.collected&&p.distanceTo(h.root.position)<2.8){this.interact='E 采集青灵草';this.interaction=()=>{h.collected=true;h.root.visible=false;this.herbCount++;this.audio.play('pickup');this.burst(h.root.position,0x91ffd4,0.8);this.hud.toast(`青灵草 +1 · 当前 ${this.herbCount} 株`);this.save();};return;}
    for(let i=0;i<this.shrines.length;i++)if(!this.activeShrines[i]&&p.distanceTo(this.shrines[i].position)<4.5){const guarded=this.enemies.some(e=>!e.dead&&e.kind!=='guardian'&&e.model.root.position.distanceTo(this.shrines[i].position)<24);
      this.interact=this.quest<3?'阵眼尚未共鸣 · 先领悟御剑':guarded?'阵眼被浊气缠绕 · 击败附近妖灵':'E 注入灵气 · 开启阵眼';
      if(this.quest>=3&&!guarded)this.interaction=()=>{this.activeShrines[i]=true;this.xp+=45;this.stones+=25;this.audio.play('shrine');this.burst(this.shrines[i].position,0xffe2a1,3);this.setShrineVisuals();const n=this.activeShrines.filter(Boolean).length;this.hud.toast(`灵脉阵眼 ${n}/3 · 修为 +45`);if(n===3){this.quest=4;this.journalEntries.push('三座灵脉阵眼全部开启，北方镇山台封印解除。');}this.save();};return;}
    for(let i=0;i<this.treasures.length;i++)if(!this.treasureFlags.has(i)&&p.distanceTo(this.treasures[i].position)<3){this.interact='E 打开遗落的灵匣';this.interaction=()=>{this.treasureFlags.add(i);this.treasures[i].visible=false;this.stones+=50;this.pills++;this.xp+=25;this.audio.play('pickup');this.hud.toast('山谷奇遇 · 灵石 +50 / 回春丹 +1 / 修为 +25');this.journalEntries.push(`寻得第 ${i+1} 处遗落灵匣。`);this.save();};return;}
    if(!this.boss.dead&&!this.activeShrines.every(Boolean)&&p.distanceTo(this.boss.model.root.position)<20)this.interact='镇山石灵封印中 · 先开启三座阵眼';
  }
  private setShrineVisuals():void {this.shrines.forEach((root,i)=>{root.scale.setScalar(this.activeShrines[i]?1.1:1);root.userData.active=this.activeShrines[i];});}
  private burst(position:THREE.Vector3,color:number,size:number):void {if(this.bursts.length>=30)return;const root=new THREE.Mesh(this.ringGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false}));root.position.copy(position);root.position.y+=0.14;root.rotation.x=-Math.PI/2;root.scale.setScalar(size*0.25);this.scene.add(root);this.bursts.push({root,life:0.5,size});}
  private updateBursts(dt:number):void {for(let i=this.bursts.length-1;i>=0;i--){const b=this.bursts[i];b.life-=dt;const progress=1-b.life/0.5;b.root.scale.setScalar(b.size*(0.25+progress));b.root.material.opacity=Math.max(0,0.85*(1-progress));if(b.life<=0){this.scene.remove(b.root);b.root.material.dispose();this.bursts.splice(i,1);}}}
  private updateCamera(dt:number,snap=false):void {
    const p=this.hero.root.position,yaw=this.input.yaw,pitch=this.input.pitch,distance=this.input.distance;this.cameraTarget.copy(p);this.cameraTarget.y+=this.flying?1.1:1.05;
    this.cameraOffset.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance).add(this.cameraTarget);this.cameraOffset.y=Math.max(this.cameraOffset.y,terrainHeight(this.cameraOffset.x,this.cameraOffset.z)+1.1);
    constrainCameraBoom(this.cameraTarget,this.cameraOffset,this.world.cameraOccluders,terrainHeight);
    if(this.cameraTarget.distanceTo(this.cameraOffset)<distance*0.85){
      let best=this.cameraTarget.distanceTo(this.cameraOffset);
      for(const angle of [Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2]){
        const candidate=new THREE.Vector3(Math.sin(yaw+angle)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw+angle)*Math.cos(pitch)*distance).add(this.cameraTarget);
        candidate.y=Math.max(candidate.y,terrainHeight(candidate.x,candidate.z)+1.1);constrainCameraBoom(this.cameraTarget,candidate,this.world.cameraOccluders,terrainHeight);
        const feet=p.clone();feet.y+=0.2;const clearance=candidate.clone();constrainCameraBoom(feet,clearance,this.world.cameraOccluders,terrainHeight);if(clearance.distanceTo(candidate)>0.1)continue;
        const score=this.cameraTarget.distanceTo(candidate)-Math.abs(angle)*0.4;
        if(score>best){best=score;this.cameraOffset.copy(candidate);}
      }
    }
    if(snap)this.camera.position.copy(this.cameraOffset);else this.camera.position.lerp(this.cameraOffset,1-Math.exp(-dt*9));
    constrainCameraBoom(this.cameraTarget,this.camera.position,this.world.cameraOccluders,terrainHeight);
    this.camera.lookAt(this.cameraTarget);
    this.cameraResolvedYaw=Math.atan2(this.camera.position.x-p.x,this.camera.position.z-p.z);
    this.shake=Math.max(0,this.shake-dt*1.4);if(this.shake>0&&!this.reducedMotion){this.camera.position.x+=Math.sin(this.elapsed*75)*this.shake*0.16;this.camera.position.y+=Math.cos(this.elapsed*83)*this.shake*0.09;}
    const fov=this.flying?65:57;if(Math.abs(this.camera.fov-fov)>0.01){this.camera.fov+=(fov-this.camera.fov)*Math.min(1,dt*3);this.camera.updateProjectionMatrix();}
    this.sun.target.position.copy(p);this.sun.position.set(p.x-84,p.y+46,p.z+25);this.sun.target.updateMatrixWorld();
    this.fill.target.position.copy(p);this.fill.position.set(p.x+84,p.y+32,p.z-25);this.fill.target.updateMatrixWorld();
  }
  private objective():[string,string] {
    if(this.quest===0)return ['初入云岚','向前走到宗门外，与沈清尘交谈（E）'];
    if(this.quest===1)return this.herbCount>=3?['归山复命','三株灵草已齐，回宗门与沈清尘交谈']:['采药历练',`采集青灵草 ${Math.min(3,this.herbCount)}/3 · 靠近后按 E`];
    if(this.quest===2)return ['凝气突破','修为已足，按 B 突破至练气圆满，解锁御剑'];
    if(this.quest===3)return ['唤醒灵脉',`开启三座阵眼 ${this.activeShrines.filter(Boolean).length}/3 · M 查看地图`];
    if(this.quest===4)return this.boss.dead?['筑基机缘','镇山石灵已平息 · 按 B 筑基，完成首章']:['镇山试炼','前往最北方镇山台，击败镇山石灵'];
    return ['大道初成','云岚初境已完成 · 山谷仍可自由探索'];
  }
  private landmarks():Landmark[] {return [{name:TOWN.name,x:TOWN.x,z:TOWN.z,kind:'town'},{name:'听潮海岸',x:0,z:shorelineAt(0)-12,kind:'coast'},{name:'云岚宗',x:0,z:32,kind:'sect'},...SHRINE_COORDS.map(([x,z],i)=>({name:['松风林','玉镜潭','望月台'][i],x,z,kind:'shrine' as const,active:this.activeShrines[i]})),{name:'镇山台',x:0,z:-280,kind:'boss',active:this.boss.dead},...TREASURES.map(([x,z],i)=>({name:'遗落灵匣',x,z,kind:'treasure' as const,active:this.treasureFlags.has(i)}))];}
  private updateHud():void {
    if(!this.hud)return;const [objective,objectiveDetail]=this.objective(),p=this.hero.root.position,enemy=this.nearestEnemy(30),shop=townShopAt(p.x,p.z),location=inTown(p.x,p.z)?`听潮坊${shop?` · ${SHOP_NAMES[shop.index]}`:' · 长街'}`:p.z>146?(p.z>shorelineAt(p.x)?'听潮海岸 · 浅海':'听潮海岸 · 沙滩'):p.z>0?'云岚宗':p.z<-220?'望月台 · 镇山古道':p.x<-70?'松风林':p.x>65?'玉镜潭':'云岚山谷';
    this.hud.update({phase:this.phase,panel:this.panel,health:this.health,maxHealth:this.maxHealth,qi:this.qi,maxQi:this.maxQi,xp:this.xp,xpNext:THRESHOLDS[this.realm],realm:this.realm,realmName:REALMS[this.realm],herbs:this.herbCount,pills:this.pills,stones:this.stones,kills:this.kills,shrines:this.activeShrines,objective,objectiveDetail:this.phase==='dead'?`${this.deathReason}。回宗门后保留修为、物品与任务进度。`:objectiveDetail,location,flying:this.flying,canFly:this.canFly,interact:this.interact,skillCooldown:this.spellCooldown,saveAvailable:this.saveAvailable,muted:this.audio.muted,volume:this.audio.volume,quality:this.quality,reducedMotion:this.reducedMotion,enemy:enemy?{name:enemy.kind==='guardian'?'镇山石灵':'浊气妖灵',health:enemy.health,maxHealth:enemy.maxHealth}:null,dialogue:this.dialogue,position:{x:p.x,z:p.z},landmarks:this.landmarks(),questSteps:['与师长交谈，领取历练','采集三株灵草，回山复命','凝气突破，领悟御剑','开启三座灵脉阵眼','击败石灵，筑基'].map((text,i)=>({text,done:this.quest>i,current:this.quest===i})),journalEntries:this.journalEntries});
  }
  private groundedSavePosition(x:number,z:number):{x:number;z:number} {
    return safeCoastalPosition(x,z,(px,pz)=>{
      if(this.world.colliders.some(c=>Math.hypot(px-c.x,pz-c.z)<c.r+.7))return false;
      const y=terrainHeight(px,pz);
      return !this.world.walls.some(w=>px>w.min.x-.7&&px<w.max.x+.7&&pz>w.min.z-.7&&pz<w.max.z+.7&&y+1.8>w.min.y&&y<w.max.y);
    });
  }
  private save(notify=false):void {
    if(this.phase==='title'||this.phase==='dead'||(this.phase==='paused'&&this.returnPhase==='title'))return;const p=this.groundedSavePosition(this.hero.root.position.x,this.hero.root.position.z),data:SaveData={version:1,position:{x:p.x,y:terrainHeight(p.x,p.z),z:p.z},health:this.health,qi:this.qi,xp:this.xp,realm:this.realm,herbs:this.herbCount,pills:this.pills,stones:this.stones,kills:this.kills,quest:this.quest,shrines:[...this.activeShrines],collected:this.herbs.filter(h=>h.collected).map(h=>h.id),defeated:this.enemies.filter(e=>e.dead).map(e=>e.id),treasures:[...this.treasureFlags]};
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(data));this.saveAvailable=true;if(notify)this.hud.toast('修行进度已保存');}catch{if(notify)this.hud.toast('浏览器存储不可用，当前仍可游玩');}
  }
  private load():void {
    const s=readSave();if(!s){this.hud.toast('没有可读取的存档');return;}this.reset();this.realm=s.realm;this.health=Math.max(1,Math.min(this.maxHealth,s.health));this.qi=Math.min(this.maxQi,s.qi);this.xp=s.xp;this.herbCount=s.herbs;this.pills=s.pills;this.stones=s.stones;this.kills=s.kills;this.quest=s.quest;this.activeShrines=[...s.shrines];const grounded=this.groundedSavePosition(s.position.x,s.position.z);this.hero.root.position.set(grounded.x,terrainHeight(grounded.x,grounded.z),grounded.z);
    for(const h of this.herbs){h.collected=s.collected.includes(h.id);h.root.visible=!h.collected;}for(const e of this.enemies){e.dead=s.defeated.includes(e.id);e.health=e.dead?0:e.maxHealth;e.model.root.visible=!e.dead;}
    this.treasureFlags=new Set(s.treasures);this.treasures.forEach((root,i)=>root.visible=!this.treasureFlags.has(i));this.setShrineVisuals();
    if(this.quest>=1)this.journalEntries.push('已领取历练：采集三株青灵草，回宗门向沈清尘复命。');
    if(this.quest>=2)this.journalEntries.push('师长传授御剑心诀。三阵眼位于松风林、玉镜潭与望月台。');
    if(this.activeShrines.every(Boolean))this.journalEntries.push('三座灵脉阵眼全部开启，北方镇山台封印解除。');
    for(const i of this.treasureFlags)this.journalEntries.push(`寻得第 ${i+1} 处遗落灵匣。`);
    if(this.boss.dead)this.journalEntries.push('镇山石灵已平息，获得筑基机缘。按 B 完成筑基。');
    if(this.realm===2)this.journalEntries.push('三阵眼重启，镇山石灵归于寂静。筑基成功，首章完成。');
    this.updateCamera(1,true);this.updateInteraction();void this.audio.unlock().then(()=>this.audio.ambience(this.phase==='playing'));this.hud.toast('已续接上次修行');this.updateHud();
  }
  private savePreferences():void {try{localStorage.setItem('yunhai-wendao-settings',JSON.stringify({volume:this.audio.volume,muted:this.audio.muted,quality:this.quality,reducedMotion:this.reducedMotion}));}catch{/* optional */}}
  private restorePreferences():void {try{const s=JSON.parse(localStorage.getItem('yunhai-wendao-settings')??'{}');if(typeof s.volume==='number'&&Number.isFinite(s.volume))this.audio.setVolume(s.volume);if(typeof s.muted==='boolean')this.audio.setMuted(s.muted);if(s.quality==='low'){this.quality='low';this.renderer.shadowMap.enabled=false;}if(typeof s.reducedMotion==='boolean')this.reducedMotion=s.reducedMotion;}catch{/* corrupt settings reset */}}
  private visibility=():void=>{if(document.hidden&&this.phase==='playing'){this.save();this.openPanel('none');}};
  private pageHide=():void=>{this.save();};
  private render():void {
    // The mentor is only a few pixels at long range; keep the full rig for nearby exploration.
    const mapCovered=this.phase==='paused'&&this.panel==='map';
    this.hero.root.visible=!mapCovered;
    this.mentor.root.visible=!mapCovered&&this.mentor.root.position.distanceToSquared(this.hero.root.position)<100*100;
    this.renderer.render(this.scene,this.camera);
  }
  private installTestHooks():void {
    window.__THREE_GAME_TEST_HOOKS__={seed:(seed)=>{this.rng=createSeededRandom(seed);},setState:(name)=>{
      this.reset();this.pausedForScreenshot=false;
      if(name==='title'){this.phase='title';const z=shorelineAt(0)-12;this.hero.root.position.set(0,terrainHeight(0,z),z);this.hero.root.rotation.y=Math.PI;this.input.yaw=Math.PI;this.input.pitch=.15;}else if(name==='active-play'){this.quest=1;this.hero.root.position.set(0,terrainHeight(0,-3),-3);}
      else if(name==='flight'){this.realm=1;this.quest=3;this.flying=true;this.hero.root.position.set(-30,terrainHeight(-30,-70)+8,-70);this.flightHeight=8;}
      else if(name==='flight-danger'){this.realm=1;this.quest=3;this.health=1;this.flying=true;this.flightHeight=2.7;this.hero.root.position.copy(this.enemies[0].home);const enemy=this.enemies[0];enemy.windup=.06;enemy.target.copy(this.hero.root.position);}
      else if(name==='boss'){this.realm=1;this.quest=4;this.health=this.maxHealth;this.qi=this.maxQi;this.activeShrines=[true,true,true];this.hero.root.position.set(0,terrainHeight(0,-264),-264);this.enemies.filter(e=>e.id>=10&&e.id<14).forEach(e=>{e.dead=true;e.model.root.visible=false;});}
      else if(name==='fail'){this.realm=1;this.quest=4;this.activeShrines=[true,true,true];this.hero.root.position.set(0,terrainHeight(0,-274),-274);this.health=0;this.phase='dead';this.deathReason='镇山石灵的灵压冲击';}
      else if(name==='complete'){this.realm=2;this.health=this.maxHealth;this.qi=this.maxQi;this.quest=5;this.activeShrines=[true,true,true];this.boss.dead=true;this.boss.model.root.visible=false;this.phase='complete';}
      else if(name==='map'){this.realm=1;this.quest=3;this.phase='paused';this.panel='map';}
      else if(name==='town'||name==='town-square'||name==='town-shop'||name==='town-entrance'){this.quest=1;const z=name==='town-entrance'?139:name==='town-square'?44:name==='town-shop'?65.5:124;this.hero.root.position.set(name==='town-shop'?116:125,terrainHeight(125,z),z);this.input.yaw=name==='town-shop'?-Math.PI/2:0;this.input.pitch=.16;this.input.distance=name==='town-shop'?4.3:6.8;}
      else if(name==='town-flight'){this.realm=1;this.quest=3;this.flying=true;this.flightHeight=12;this.hero.root.position.set(116,TOWN.groundY+12,65.5);this.input.yaw=0;this.input.pitch=.3;this.input.distance=9;}
      else if(name==='character-front'||name==='character-back'||name==='character-portrait'){const z=shorelineAt(0)-9;this.quest=1;this.hero.root.position.set(0,terrainHeight(0,z),z);this.input.yaw=name==='character-back'?.3:Math.PI-.28;this.input.pitch=.04;this.input.distance=3.2;}
      else if(name==='coast'){const z=shorelineAt(0)-9;this.hero.root.position.set(0,terrainHeight(0,z),z);this.hero.root.rotation.y=Math.PI;this.input.yaw=Math.PI;this.input.pitch=.13;this.input.distance=6;}
      else if(name==='coast-flight'){this.realm=1;this.quest=3;this.qi=this.maxQi;this.flying=true;this.flightHeight=5;this.hero.root.position.set(-18,5,shorelineAt(-18)+24);this.hero.root.rotation.y=Math.PI/2;this.input.yaw=Math.PI*.62;this.input.pitch=.22;this.input.distance=8;}
      else if(name==='coast-rocks'){const x=64,z=shorelineAt(x)-20;this.hero.root.position.set(x,terrainHeight(x,z),z);this.hero.root.rotation.y=Math.PI+.6;this.input.yaw=Math.PI+.6;this.input.pitch=.16;this.input.distance=8;}
      else if(name==='coast-rock-flight'||name==='coast-over-rock'){this.realm=1;this.quest=3;this.flying=true;this.qi=this.maxQi;this.flightHeight=name==='coast-over-rock'?12:5;const x=175,z=shorelineAt(x)-6;this.hero.root.position.set(x,terrainHeight(x,z)+this.flightHeight,z);this.input.yaw=Math.PI;}
      else if(name==='coast-exhausted'){this.realm=1;this.quest=3;this.qi=.02;this.flying=true;this.flightHeight=5;this.hero.root.position.set(0,5,shorelineAt(0)+24);this.input.yaw=Math.PI;}
      else if(name==='natural-land'){this.realm=1;this.quest=3;this.flying=true;this.flightHeight=28;this.hero.root.position.set(-76,terrainHeight(-76,-105)+28,-105);this.input.yaw=-.7;this.input.pitch=.38;this.input.distance=12;}
      else if(name==='forest'){this.realm=1;this.quest=3;this.hero.root.position.set(-98,terrainHeight(-98,-40),-40);this.input.yaw=-.9;this.input.pitch=.15;this.input.distance=6;}
      else if(name==='woodland-grove'||name==='woodland-floor'||name==='woodland-overlook'||name==='woodland-meadow'){
        this.realm=1;this.quest=3;this.health=this.maxHealth;this.qi=this.maxQi;
        let x=name==='woodland-overlook'?-153:name==='woodland-meadow'?-48:-215,z=name==='woodland-overlook'?-132:name==='woodland-meadow'?-115:-222;
        if(name!=='woodland-overlook')for(const offset of [0,3,-3,6,-6]){if(this.world.colliders.every(c=>Math.hypot(x+offset-c.x,z-c.z)>c.r+.8)){x+=offset;break;}}
        this.flying=name==='woodland-overlook';this.flightHeight=this.flying?32:5;this.hero.root.position.set(x,terrainHeight(x,z)+(this.flying?32:0),z);
        this.input.yaw=name==='woodland-meadow'?.65:-.35;this.input.pitch=name==='woodland-overlook'?.48:name==='woodland-floor'?.36:.13;this.input.distance=name==='woodland-overlook'?12:name==='woodland-floor'?3.7:6.4;
      }
      else if(name==='combat'){this.quest=1;this.hero.root.position.set(18,terrainHeight(18,-14),-14);}
      else throw new Error(`Unknown state: ${name}`);
      this.hero.resetPose(this.flying);this.enemies.forEach(e=>{e.cooldown=0.5+this.rng()*0.5;this.updateEnemy(e,0);e.model.setDetail(e.model.root.position.distanceTo(this.hero.root.position)<55);});this.setShrineVisuals();this.updateInteraction();this.updateCamera(1,true);
      if(name==='character-portrait'){const p=this.hero.root.position;this.camera.position.copy(p).add(new THREE.Vector3(.22,1.50,-.85));this.camera.lookAt(p.clone().add(new THREE.Vector3(0,1.43,0)));}
      this.updateHud();this.render();this.publishDiagnostics();return{state:name};
    },setPausedForScreenshot:(paused)=>{this.pausedForScreenshot=paused;},setReducedMotion:(enabled)=>{this.reducedMotion=enabled;this.shake=0;this.world.update(0,0);this.hero.resetPose(this.flying);this.mentor.resetPose();this.enemies.forEach(e=>e.model.animate(0,0,false,0));this.render();},hideDebugUi:()=>{/* no debug UI */}};
  }
  private publishDiagnostics():void {
    if(!this.diagnosticsEnabled)return;
    const info=this.renderer.info,p=this.hero.root.position;
    const animation={attackTime:this.attackTime,...this.hero.diagnostics(),reducedMotion:this.reducedMotion};
    window.__THREE_GAME_DIAGNOSTICS__={frame:this.frame,elapsed:this.elapsed,score:this.kills+this.activeShrines.filter(Boolean).length,targetScore:18,complete:this.quest===5,failed:this.phase==='dead',phase:this.phase,quest:this.quest,realm:this.realm,health:this.health,qi:this.qi,herbs:this.herbCount,pills:this.pills,xp:this.xp,flying:this.flying,coast:{shoreline:shorelineAt(p.x),ground:terrainHeight(p.x,p.z),waterDepth:p.z>166?Math.max(0,SEA_LEVEL-terrainHeight(p.x,p.z)):0,returningToShore:this.returningToShore},shrines:[...this.activeShrines],interaction:this.interact,enemies:this.enemies.map(e=>({id:e.id,health:e.health,dead:e.dead,moving:e.moving,position:{x:e.model.root.position.x,y:e.model.root.position.y,z:e.model.root.position.z},windup:e.windup})),player:{position:{x:p.x,y:p.y,z:p.z},speed:this.velocity.length(),yaw:this.cameraResolvedYaw},animation,audio:{played:this.audio.played,muted:this.audio.muted,...this.audio.status},physics:{engine:'custom',timestep:STEP,colliders:this.world.colliders.length+this.world.walls.length+this.enemies.length+1},renderer:{calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures},canvas:{clientWidth:this.canvas.clientWidth,clientHeight:this.canvas.clientHeight,width:this.canvas.width,height:this.canvas.height,dpr:Math.min(window.devicePixelRatio||1,this.quality==='high'?1.5:1)}};
  }
  dispose():void {this.loop.stop();this.hero.dispose();this.mentor.dispose();this.input.dispose();this.audio.dispose();this.hud.dispose();document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pagehide',this.pageHide);this.world.dispose();disposeObject3D(this.scene);this.environment.dispose();this.renderer.dispose();window.__THREE_GAME_TEST_HOOKS__=undefined;window.__THREE_GAME_DIAGNOSTICS__=undefined;}
}
