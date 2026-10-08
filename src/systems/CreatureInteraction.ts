/** Metre-scale gameplay proxies; tails, fingers and gaps between legs are decorative. */
export type CreatureKind = 'spirit' | 'guardian';
export interface Position { x: number; y: number; z: number }
export const PLAYER_BODY = { radius: .55, height: 1.8 };
export const CREATURE_BODIES = {
  spirit: { radius: .34, back: .65, front: -.8, height: 1.6 },
  guardian: { radius: 1.8, back: 0, front: 0, height: 5.1 },
} as const;
export const SWORD_RULES = { contact: .16, duration: .45, cooldown: .48, spiritRange: 3.8, guardianRange: 5.2, facingDot: .1 };

/** Signed clearance from the player's cylinder to a rotated horizontal body capsule. */
export function creatureContact(player: Position, creature: Position, yaw: number, kind: CreatureKind) {
  const body = CREATURE_BODIES[kind];
  if (player.y >= creature.y + body.height || player.y + PLAYER_BODY.height <= creature.y) return null;
  const sin = Math.sin(yaw), cos = Math.cos(yaw), dx = player.x - creature.x, dz = player.z - creature.z;
  const localZ = Math.max(body.front, Math.min(body.back, sin * dx + cos * dz));
  const nx = dx - sin * localZ, nz = dz - cos * localZ, distance = Math.hypot(nx, nz);
  // At an exact centre overlap use the capsule's side, never an undefined normal.
  return { clearance: distance - body.radius - PLAYER_BODY.radius, nx: distance > 1e-8 ? nx / distance : cos, nz: distance > 1e-8 ? nz / distance : -sin };
}

/** Centre-distance + forward arc, evaluated once at the animation's contact time. */
export function swordCanHit(player: Position, yaw: number, creature: Position, kind: CreatureKind): boolean {
  const dx = creature.x - player.x, dy = creature.y - player.y, dz = creature.z - player.z;
  const range = kind === 'guardian' ? SWORD_RULES.guardianRange : SWORD_RULES.spiritRange;
  const horizontal = Math.hypot(dx, dz);
  return horizontal > 1e-8 && Math.hypot(dx, dy, dz) < range && (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / horizontal > SWORD_RULES.facingDot;
}
