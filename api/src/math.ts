/**
 * Position / orientation math.
 *
 * Conventions (Minecraft Java Edition):
 * - +X = east, +Z = south, +Y = up.
 * - yaw: degrees, 0 = south (+Z), 90 = west (−X), grows clockwise.
 * - pitch: degrees, 0 = level, positive = looking down.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Integer block coordinates. */
export interface BlockPos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function blockPos(x: number, y: number, z: number): BlockPos {
  return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSquared(a, b));
}

export function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function horizontalDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function sameBlock(a: Vec3, b: Vec3): boolean {
  return (
    Math.floor(a.x) === Math.floor(b.x) &&
    Math.floor(a.y) === Math.floor(b.y) &&
    Math.floor(a.z) === Math.floor(b.z)
  );
}

export function floorToBlock(v: Vec3): BlockPos {
  return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) };
}

/** Stable string key for maps: "x,y,z" (integer coords). */
export function blockKey(p: Vec3): string {
  return `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
}

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export const DIRECTIONS: readonly Direction[] = ['north', 'south', 'east', 'west', 'up', 'down'];

export function directionOffset(d: Direction): BlockPos {
  switch (d) {
    case 'north':
      return { x: 0, y: 0, z: -1 };
    case 'south':
      return { x: 0, y: 0, z: 1 };
    case 'east':
      return { x: 1, y: 0, z: 0 };
    case 'west':
      return { x: -1, y: 0, z: 0 };
    case 'up':
      return { x: 0, y: 1, z: 0 };
    case 'down':
      return { x: 0, y: -1, z: 0 };
  }
}

export function offsetBlock(p: BlockPos, d: Direction): BlockPos {
  const o = directionOffset(d);
  return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
}

const DEG = 180 / Math.PI;

/**
 * Yaw (degrees) needed to face from `from` toward `to`.
 * Minecraft convention: yaw = atan2(-dx, dz), normalized to [0, 360).
 */
export function yawBetween(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let yaw = Math.atan2(-dx, dz) * DEG;
  if (yaw < 0) yaw += 360;
  return yaw;
}

/** Pitch (degrees) needed to face from `from` toward `to`. Positive = down. */
export function pitchBetween(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horizontal = Math.sqrt(dx * dx + dz * dz);
  return Math.atan2(-dy, horizontal) * DEG;
}

/** Normalize any yaw (degrees) into [0, 360). */
export function normalizeYaw(yaw: number): number {
  const y = yaw % 360;
  return y < 0 ? y + 360 : y;
}

/** Smallest signed difference between two yaws in degrees, in [-180, 180). */
export function yawDelta(from: number, to: number): number {
  let d = normalizeYaw(to) - normalizeYaw(from);
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
