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
  flying: boolean;
  coast: {shoreline:number;ground:number;waterDepth:number;returningToShore:boolean};
  shrines: boolean[];
  interaction: string;
  enemies: { id: number; health: number; dead: boolean; moving:boolean; position: { x: number; y: number; z: number }; windup: number }[];
  animation: {attackTime:number;leftLeg:number;swordTip:{x:number;y:number;z:number};reducedMotion:boolean};
  audio: { played: number; muted: boolean; state:string;ambience:boolean;activeSources:number;volume:number };
  physics: { engine: string; timestep: number; colliders: number };
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
    yaw: number;
  };
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
