export type Phase = 'title' | 'playing' | 'paused' | 'dead' | 'complete';
export type Panel = 'none' | 'map' | 'journal' | 'inventory' | 'settings' | 'dialog';
export interface Landmark { name: string; x: number; z: number; kind: 'sect' | 'shrine' | 'boss' | 'treasure' | 'coast' | 'town' | 'forest'; active?: boolean }
export interface HudView {
  phase: Phase; panel: Panel; health: number; maxHealth: number; qi: number; maxQi: number;
  xp: number; xpNext: number; realm: number; realmName: string; herbs: number; pills: number;
  stones: number; kills: number; shrines: boolean[]; objective: string; objectiveDetail: string;
  location: string; flying: boolean; canFly: boolean; interact: string; skillCooldown: number;
  element: string; elementName: string; elementalCooldown: number; vortexCooldown:number; pulseCooldown:number;
  saveAvailable: boolean; muted: boolean; volume: number; quality: string; reducedMotion: boolean;
  enemy: { name: string; health: number; maxHealth: number } | null;
  dialogue: { speaker: string; text: string; actionLabel: string } | null;
  position: { x: number; z: number }; landmarks: Landmark[];
  questSteps: { text: string; done: boolean; current: boolean }[]; journalEntries: string[];
}
export interface SaveData {
  version: 1; position: { x: number; y: number; z: number }; health: number; qi: number;
  xp: number; realm: number; herbs: number; pills: number; stones: number; kills: number;
  quest: number; shrines: boolean[]; collected: number[]; defeated: number[]; treasures: number[];
}
