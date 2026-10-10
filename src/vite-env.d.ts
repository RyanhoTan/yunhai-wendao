/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  score: number;
  targetScore: number;
  complete: boolean;
  failed: boolean;
  phase: string;
  quest: number;
  realm: number;
  health: number;
  qi: number;
  herbs: number;
  pills: number;
  xp: number;
  kills:number;
  flying: boolean;
  weather: import("./systems/WeatherState").WeatherSnapshot & ReturnType<import("./systems/WeatherRenderer").WeatherRenderer["diagnostics"]> & {roofHeight:number;panelOpen:boolean};
  shield: ReturnType<import('./systems/ElementalShield').ElementalShield['diagnostics']> & {cameraInside:boolean};
  elemental: {element:string;cooldown:number;casts:number;hits:number;orbiting:number;flying:number;projectileSlots:number;activeProjectiles:number;trailParticles:number;impactParticles:number;impacts:number;batches:number;vortex:{age:number;center:{x:number;y:number;z:number}}|null;vortexCooldown:number;swallowed:number;fieldParticles:number;pulseAge:number;pulseCooldown:number;pulseHits:number;castingWeight:number;swordArcs:number};
  coast: {shoreline:number;ground:number;waterDepth:number;returningToShore:boolean};
  mountainWater: {d:number;y:number;r:number;segment:number;pool:{x:number;z:number;y:number;rx:number;rz:number}};
  shrines: boolean[];
  interaction: string;
  enemies: { id: number; species:import('./systems/CreatureInteraction').CreatureKind;model:{loaded:boolean;species:string;motion:string;motionTime:number;clips:string[]}|null; health: number; dead: boolean; moving:boolean; position: { x: number; y: number; z: number }; windup: number; bodyClearance:number|null }[];
  combat:{swordHits:number;attackCooldown:number;bodyBlocks:number};
  animation: {model:string;weapon:string;asset:string;sourceClip:string;rootOffset:{x:number;z:number};attackTime:number;leftLeg:number;swordTip:{x:number;y:number;z:number};reducedMotion:boolean;motion:string;bones:number;clips:string[];flightSupportGap:number;flyingSwordVisible:boolean;motionTime:number;castingWeight:number};
  audio: { played: number; muted: boolean; state:string;ambience:boolean;activeSources:number;volume:number };
  physics: { engine: string; timestep: number; colliders: number;blockedPushes:number };
  player: {
    position: { x: number; y: number; z: number };
    renderPosition: { x: number; y: number; z: number };
    speed: number;
    yaw: number;
  };
  camera: { position: { x:number;y:number;z:number }; target: { x:number;y:number;z:number } };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface ThreeGameTestHooks {
  /** QA-only weather time step; does not advance combat or movement. */
  advanceWeather(seconds:number):void|Promise<void>;
  /** Re-seed the game RNG; all gameplay randomness must flow through it. */
  seed(value: number): void | Promise<void>;
  /** Acknowledge after setup/assets are ready; throw for unknown states. */
  setState(name: string): { state: string } | Promise<{ state: string }>;
  /** Stop simulation/state transitions immediately; keep rendering. Await optional synchronization. */
  setPausedForScreenshot(paused: boolean): void | Promise<void>;
  /** Stabilize ambient/idle visuals without requiring an unpaused simulation tick. */
  setReducedMotion(enabled: boolean): void | Promise<void>;
  /** Hide debug UI (lil-gui) before capturing. */
  hideDebugUi(hidden: boolean): void | Promise<void>;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
