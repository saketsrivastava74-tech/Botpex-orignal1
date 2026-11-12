import type { Vec3, BlockPos, Direction } from './math.js';
import type { EntityId } from './ids.js';

/** Physical classification of a block as the navigation/movement systems need it. */
export interface BlockFlags {
  readonly solid: boolean;
  readonly liquid: boolean;
  readonly passable: boolean;
}

export interface BlockInfo {
  readonly name: string;
  readonly flags: BlockFlags;
  /** Minecraft hardness value, or null when unknown. */
  readonly hardness: number | null;
}

export const AIR_BLOCK: BlockInfo = {
  name: 'air',
  flags: { solid: false, liquid: false, passable: true },
  hardness: 0
};

/** Used when a position cannot be decoded (unloaded/out of range). Treat as blocked. */
export const UNKNOWN_BLOCK: BlockInfo = {
  name: 'unknown',
  flags: { solid: true, liquid: false, passable: false },
  hardness: null
};

export type EntityKind = 'player' | 'mob' | 'object' | 'other';

/** Immutable snapshot of an entity's observable state at a point in time. */
export interface EntitySnapshot {
  readonly id: EntityId;
  readonly kind: EntityKind;
  /** Type string, e.g. "player", "zombie", "item_frame". */
  readonly type: string;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly onGround?: boolean;
  /** May be unknown (null/undefined) depending on runtime fidelity. */
  readonly health?: number | null;
  readonly username?: string;
  /** Millis since epoch of the last update (perception sets this). */
  readonly lastSeenMs?: number;
}

export interface SelfState {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly onGround: boolean;
  readonly health: number | null;
  readonly food: number | null;
  readonly gameMode: string | null;
}

export interface SpawnInfo {
  readonly entityId: EntityId;
  readonly position: Vec3;
  readonly gameMode: string | null;
  readonly version: string | null;
  readonly dimension: string | null;
}

export interface Bounds {
  readonly min: BlockPos;
  readonly max: BlockPos;
}

/**
 * Read-only view of the world as observed by a runtime.
 * `getBlock` returns `null` when the position is not loaded — callers must
 * treat null as "unknown/blocked", never as air.
 */
export interface IWorldView {
  getBlock(pos: BlockPos): BlockInfo | null;
  isLoaded(pos: BlockPos): boolean;
  loadedBounds(): Bounds | null;
  entities(): EntitySnapshot[];
  entity(id: EntityId): EntitySnapshot | null;
}

/** True when the block stops ground movement. Unloaded (null) blocks block. */
export function isBlockingForMovement(info: BlockInfo | null): boolean {
  if (info === null) return true;
  return !info.flags.passable;
}

export function isLiquid(info: BlockInfo | null): boolean {
  return info?.flags.liquid === true;
}

export type { Vec3, BlockPos, Direction };
