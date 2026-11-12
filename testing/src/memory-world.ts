import {
  type BlockInfo,
  type BlockPos,
  type Bounds,
  type EntityId,
  type EntityKind,
  type EntitySnapshot,
  type SelfState,
  type Vec3,
  blockKey
} from '@botpex/api';
import { blockByName } from './blocks.js';

export interface MemoryWorldOptions {
  /** Flat ground top surface y (default 8 → feet on y=9). */
  groundY?: number;
}

/**
 * Deterministic in-memory world: flat grass plane with an override map for
 * walls/holes/edits. Entities live here; the MockDriver integrates movement
 * against this world's collision.
 */
export class MemoryWorld {
  readonly groundY: number;
  /** Change hooks — MockDriver wires these to driver events. */
  onBlockChanged: ((pos: BlockPos) => void) | null = null;
  onEntityAdded: ((snap: EntitySnapshot) => void) | null = null;
  onEntityUpdated: ((snap: EntitySnapshot) => void) | null = null;
  onEntityRemoved: ((id: EntityId) => void) | null = null;
  private readonly overrides = new Map<string, BlockInfo>();
  private readonly entityMap = new Map<EntityId, EntitySnapshot>();
  private selfState: SelfState = {
    position: { x: 0.5, y: 9, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: true,
    health: 20,
    food: 20,
    gameMode: 'survival'
  };

  constructor(options: MemoryWorldOptions = {}) {
    this.groundY = options.groundY ?? 8;
  }

  // ----- blocks -----

  getBlock(pos: BlockPos): BlockInfo | null {
    const key = blockKey(pos);
    if (this.overrides.has(key)) return this.overrides.get(key) ?? null;
    if (pos.y === this.groundY) return blockByName('grass_block');
    if (pos.y < this.groundY) return blockByName(pos.y <= 0 ? 'bedrock' : 'dirt');
    return blockByName('air');
  }

  isLoaded(pos: BlockPos): boolean {
    return Math.abs(pos.x) <= 128 && Math.abs(pos.z) <= 128 && pos.y >= -64 && pos.y <= 320;
  }

  loadedBounds(): Bounds | null {
    return {
      min: { x: -128, y: -64, z: -128 },
      max: { x: 128, y: 320, z: 128 }
    };
  }

  setBlock(pos: BlockPos, name: string | null): void {
    const key = blockKey(pos);
    if (name === null) this.overrides.delete(key);
    else this.overrides.set(key, blockByName(name));
    this.onBlockChanged?.(pos);
  }

  /** Highest y where a bot could stand at column (feet y = top + 1). */
  surfaceY(x: number, z: number): number {
    for (let y = 320; y >= -64; y--) {
      const b = this.getBlock({ x, y, z });
      if (b !== null && b.flags.solid) return y + 1;
    }
    return this.groundY + 1;
  }

  // ----- entities -----

  spawnEntity(opts: {
    id?: EntityId;
    kind?: EntityKind;
    type?: string;
    position?: Vec3;
    health?: number | null;
    username?: string;
  }): EntitySnapshot {
    let id = opts.id ?? nextEntityId();
    while (this.entityMap.has(id)) id += 1;
    const snap: EntitySnapshot = {
      id,
      kind: opts.kind ?? 'mob',
      type: opts.type ?? 'zombie',
      position: opts.position ?? { x: 3.5, y: 9, z: 3.5 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      onGround: true,
      health: opts.health ?? 20,
      username: opts.username,
      lastSeenMs: Date.now()
    };
    this.entityMap.set(id, snap);
    this.onEntityAdded?.(snap);
    return snap;
  }

  entity(id: EntityId): EntitySnapshot | null {
    return this.entityMap.get(id) ?? null;
  }

  entities(): EntitySnapshot[] {
    return [...this.entityMap.values()];
  }

  updateEntity(id: EntityId, patch: Partial<EntitySnapshot>): EntitySnapshot | null {
    const cur = this.entityMap.get(id);
    if (!cur) return null;
    const next: EntitySnapshot = { ...cur, ...patch, id };
    this.entityMap.set(id, next);
    this.onEntityUpdated?.(next);
    return next;
  }

  removeEntity(id: EntityId): EntitySnapshot | null {
    const last = this.entityMap.get(id) ?? null;
    this.entityMap.delete(id);
    if (last !== null) this.onEntityRemoved?.(id);
    return last;
  }

  // ----- self -----

  get self(): SelfState {
    return this.selfState;
  }

  setSelf(patch: Partial<SelfState>): void {
    this.selfState = { ...this.selfState, ...patch };
  }
}

let ids = 1000;
export function nextEntityId(): number {
  ids += 1;
  return ids;
}
