import {
  type IWorldView,
  type BlockInfo,
  type BlockPos,
  type Bounds,
  type EntityId,
  type EntitySnapshot,
  blockKey
} from '@botpex/api';
import type { EntityRegistry } from './entity.js';

/** Read-through block source (usually `driver.world()`). */
export interface BlockSource {
  getBlock(pos: BlockPos): BlockInfo | null;
  isLoaded(pos: BlockPos): boolean;
  loadedBounds(): Bounds | null;
}

export interface WorldModelOptions {
  /** LRU capacity for the decoded-block cache (default 60000 entries). */
  blockCacheSize?: number;
}

/**
 * World-state representation: an LRU-cached read-through view over the
 * driver's block source, combined with the kernel's EntityRegistry.
 * Block updates invalidate exactly the affected keys.
 */
export class WorldModel implements IWorldView {
  private readonly cache = new Map<string, BlockInfo | null>();
  private readonly cacheSize: number;

  constructor(
    private readonly blocks: BlockSource,
    private readonly entitiesStore: EntityRegistry,
    options: WorldModelOptions = {}
  ) {
    this.cacheSize = options.blockCacheSize ?? 60_000;
  }

  getBlock(pos: BlockPos): BlockInfo | null {
    const key = blockKey(pos);
    const cached = this.cache.get(key);
    if (cached !== undefined || this.cache.has(key)) {
      // LRU refresh
      if (this.cache.delete(key)) this.cache.set(key, cached ?? null);
      return cached ?? null;
    }
    const value = this.blocks.getBlock(pos);
    this.cache.set(key, value);
    if (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    return value ?? null;
  }

  isLoaded(pos: BlockPos): boolean {
    return this.blocks.isLoaded(pos);
  }

  loadedBounds(): Bounds | null {
    return this.blocks.loadedBounds();
  }

  entities(): EntitySnapshot[] {
    return this.entitiesStore.all();
  }

  entity(id: EntityId): EntitySnapshot | null {
    return this.entitiesStore.get(id);
  }

  invalidate(pos: BlockPos): void {
    this.cache.delete(blockKey(pos));
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  get cachedBlockCount(): number {
    return this.cache.size;
  }
}
