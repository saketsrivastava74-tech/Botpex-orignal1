import { type EntityId, type EntitySnapshot, type Vec3, distanceSquared } from '@botpex/api';

export interface EntityRegistryOptions {
  /** Maximum tracked entities; oldest non-player entries are evicted. */
  cacheCap?: number;
}

/**
 * Entity System — in-memory index of entity snapshots.
 * Snapshots are replaced wholesale on update (immutable semantics).
 */
export class EntityRegistry {
  private readonly entities = new Map<EntityId, EntitySnapshot>();
  private readonly cacheCap: number;

  constructor(options: EntityRegistryOptions = {}) {
    this.cacheCap = options.cacheCap ?? 2048;
  }

  /** @returns 'spawned' when new, 'updated' when replaced. */
  upsert(snapshot: EntitySnapshot): 'spawned' | 'updated' {
    const result = this.entities.has(snapshot.id) ? 'updated' : 'spawned';
    this.entities.set(snapshot.id, snapshot);
    this.evictIfNeeded();
    return result;
  }

  remove(id: EntityId): EntitySnapshot | null {
    const last = this.entities.get(id) ?? null;
    this.entities.delete(id);
    return last;
  }

  get(id: EntityId): EntitySnapshot | null {
    return this.entities.get(id) ?? null;
  }

  all(): EntitySnapshot[] {
    return [...this.entities.values()];
  }

  count(): number {
    return this.entities.size;
  }

  byRadius(center: Vec3, radius: number, filter?: (e: EntitySnapshot) => boolean): EntitySnapshot[] {
    const r2 = radius * radius;
    const out: EntitySnapshot[] = [];
    for (const e of this.entities.values()) {
      if (filter && !filter(e)) continue;
      if (distanceSquared(center, e.position) <= r2) out.push(e);
    }
    out.sort(
      (a, b) => distanceSquared(center, a.position) - distanceSquared(center, b.position)
    );
    return out;
  }

  clear(): void {
    this.entities.clear();
  }

  private evictIfNeeded(): void {
    if (this.entities.size <= this.cacheCap) return;
    // Evict the oldest non-player entries first.
    const candidates = [...this.entities.values()]
      .filter((e) => e.kind !== 'player')
      .sort((a, b) => (a.lastSeenMs ?? 0) - (b.lastSeenMs ?? 0));
    const toRemove = this.entities.size - this.cacheCap;
    for (let i = 0; i < toRemove && i < candidates.length; i++) {
      const victim = candidates[i];
      if (victim) this.entities.delete(victim.id);
    }
  }
}
