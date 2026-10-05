import type { SaveData } from './types';
export const SAVE_KEY = 'yunhai-wendao-save-v1';
const numberIn = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const ids = (value: unknown, max: number): value is number[] => Array.isArray(value) && value.length <= max + 1 && value.every(v => Number.isInteger(v) && v >= 0 && v <= max) && new Set(value).size === value.length;
export function validateSave(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<SaveData>;
  return s.version === 1 && !!s.position && numberIn(s.position.x, -300, 300) && numberIn(s.position.z, -300, 300) && numberIn(s.position.y, -50, 200)
    && numberIn(s.health, 0, 200) && numberIn(s.qi, 0, 150) && numberIn(s.xp, 0, 1000000)
    && Number.isInteger(s.realm) && numberIn(s.realm, 0, 2) && Number.isInteger(s.quest) && numberIn(s.quest, 0, 5)
    && Number.isInteger(s.herbs) && numberIn(s.herbs, 0, 10000) && Number.isInteger(s.pills) && numberIn(s.pills, 0, 10000)
    && Number.isInteger(s.stones) && numberIn(s.stones, 0, 1000000) && Number.isInteger(s.kills) && numberIn(s.kills, 0, 10000)
    && Array.isArray(s.shrines) && s.shrines.length === 3 && s.shrines.every(v => typeof v === 'boolean')
    && ids(s.collected, 23) && ids(s.defeated, 14) && ids(s.treasures, 2);
}
export function readSave(): SaveData | null { try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const value: unknown = JSON.parse(raw); return validateSave(value) ? value : null; } catch { return null; } }
