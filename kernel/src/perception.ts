import {
  type EntitySnapshot,
  type Vec3,
  type Bounds,
  type IDriver,
  type IEventBus,
  type Logger,
  distance,
  sameBlock
} from '@botpex/api';
import type { EntityRegistry } from './entity.js';
import type { WorldModel } from './world.js';

export interface PerceptionOptions {
  /** Minimum movement (m) before an entity is considered "moved" (default 0.05). */
  moveEpsilon?: number;
}

/**
 * Perception System — bridges raw driver events into semantic kernel events
 * and keeps the EntityRegistry/WorldModel in sync. Pull-reconciles entities
 * every tick so runtimes without full event coverage still converge.
 */
export class PerceptionSystem {
  private readonly moveEps: number;
  private lastBoundsKey: string | null = null;
  private lastSelfKey: string | null = null;

  constructor(
    private readonly driver: IDriver,
    private readonly entities: EntityRegistry,
    private readonly world: WorldModel,
    private readonly bus: IEventBus,
    private readonly log: Logger,
    options: PerceptionOptions = {}
  ) {
    this.moveEps = options.moveEpsilon ?? 0.05;
  }

  /** Subscribe to driver feeds. Call once during startup. */
  attach(): void {
    this.driver.on('driver:entitySpawned', (snap) => this.ingest(snap));
    this.driver.on('driver:entityUpdated', (snap) => this.ingest(snap));
    this.driver.on('driver:entityDespawned', ({ id }) => {
      const last = this.entities.remove(id);
      this.bus.emit('perception:entityDespawned', { id, last });
    });
    this.driver.on('driver:blockUpdated', ({ pos }) => {
      this.world.invalidate(pos);
      this.bus.emit('perception:blockUpdated', { pos, block: this.world.getBlock(pos) });
    });
  }

  /** One reconciliation pass per kernel tick. */
  tick(now: number): void {
    // Self state diffs
    const self = this.driver.self();
    const selfKey = `${self.position.x},${self.position.y},${self.position.z},${self.yaw},${self.pitch},${self.health},${self.food}`;
    if (selfKey !== this.lastSelfKey) {
      if (this.lastSelfKey !== null) {
        // Only emit diffs after the first sample (skip initial burst).
        const prevParts = this.lastSelfKey.split(',');
        const prevPos: Vec3 = {
          x: Number(prevParts[0]),
          y: Number(prevParts[1]),
          z: Number(prevParts[2])
        };
        if (!sameBlock(prevPos, self.position)) {
          this.bus.emit('self:position', { position: self.position, prev: prevPos });
        }
        if (self.health !== null && prevParts[3] !== undefined) {
          const prevHealth = Number(prevParts[5]);
          if (!Number.isNaN(prevHealth) && prevHealth !== self.health) {
            this.bus.emit('self:health', { health: self.health, prev: prevHealth });
          }
        }
        if (self.food !== null && prevParts[4] !== undefined) {
          const prevFood = Number(prevParts[6]);
          if (!Number.isNaN(prevFood) && prevFood !== self.food) {
            this.bus.emit('self:food', { food: self.food, prev: prevFood });
          }
        }
      }
      this.lastSelfKey = selfKey;
    }

    // Entity reconciliation (pull)
    for (const snap of this.driver.world().entities()) {
      this.ingest({ ...snap, lastSeenMs: now }, true);
    }

    // Loaded-bounds change (chunk load/unload signal)
    const bounds: Bounds | null = this.world.loadedBounds();
    const key = bounds ? `${bounds.min.x},${bounds.min.z},${bounds.max.x},${bounds.max.z}` : null;
    if (key !== this.lastBoundsKey) {
      this.lastBoundsKey = key;
      this.bus.emit('perception:worldBounds', bounds);
    }
  }

  /** Ingest an entity snapshot, emitting semantic diff events. */
  ingest(snap: EntitySnapshot, suppressSpawns = false): void {
    const stamped: EntitySnapshot = { ...snap, lastSeenMs: snap.lastSeenMs ?? Date.now() };
    const prev = this.entities.get(stamped.id);
    const result = this.entities.upsert(stamped);
    if (result === 'spawned') {
      if (!suppressSpawns) this.bus.emit('perception:entitySpawned', stamped);
    } else if (prev) {
      if (distance(prev.position, stamped.position) >= this.moveEps) {
        this.bus.emit('perception:entityMoved', { entity: stamped, prev: prev.position });
      }
    }
  }
}
