import {
  type EntitySnapshot,
  type EntityId,
  type IEventBus,
  type Logger,
  type SelfState,
  type IDriver,

  type Vec3,
  type BlockInfo,
  EntityKind,
  distance,
  Errors
} from '@botpex/api';
import type { WorldModel } from './world.js';
import type { CapabilityRegistry } from './capabilities.js';

export interface CombatConfig {
  /** Max attack distance in meters (default 3.0, vanilla reach). */
  reach?: number;
  /** Attack cooldown in ms (default 600 ≈ 1.9+ full charge). */
  cooldownMs?: number;
  /** Drop target when farther than reach + this (default 2.0). */
  loseRadiusMargin?: number;
  /** Require unobstructed line of sight (default true). */
  requireLineOfSight?: boolean;
  /** Entity kinds eligible by default (default player + mob). */
  targetKinds?: readonly EntityKind[];
}

export type TargetSelector = (
  candidates: readonly EntitySnapshot[],
  self: SelfState
) => EntitySnapshot | null;

export const targetSelectors = {
  /** Nearest entity of the given kinds (independent of the system defaults). */
  nearest(kinds: readonly EntityKind[] = ['player', 'mob']): TargetSelector {
    return (candidates, self) => {
      let best: EntitySnapshot | null = null;
      let bestD = Infinity;
      for (const e of candidates) {
        if (!kinds.includes(e.kind)) continue;
        const d = distance(e.position, self.position);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    };
  },

  /** Highest score wins; return candidates with score > 0 only. */
  highestScore(score: (e: EntitySnapshot, self: SelfState) => number): TargetSelector {
    return (candidates, self) => {
      let best: EntitySnapshot | null = null;
      let bestScore = 0;
      for (const e of candidates) {
        const s = score(e, self);
        if (s > bestScore) {
          bestScore = s;
          best = e;
        }
      }
      return best;
    };
  }
};

/**
 * Combat System — target selection, reach/LOS validation, cooldown-paced
 * attacks, engagement lifecycle. Enemy health is treated as unknown unless
 * the runtime provides it; target validity = presence + range + LOS.
 */
export class CombatSystem {
  private readonly cfg: Required<CombatConfig>;
  private engagingId: EntityId | null = null;
  private lastAttackAt = 0;

  constructor(
    private readonly world: WorldModel,
    private readonly driver: IDriver,
    private readonly caps: CapabilityRegistry,
    private readonly selfProvider: () => SelfState,
    private readonly bus: IEventBus,
    private readonly log: Logger,
    config: CombatConfig = {}
  ) {
    this.cfg = {
      reach: config.reach ?? 3.0,
      cooldownMs: config.cooldownMs ?? 600,
      loseRadiusMargin: config.loseRadiusMargin ?? 2.0,
      requireLineOfSight: config.requireLineOfSight ?? true,
      targetKinds: config.targetKinds ?? ['player', 'mob']
    };
  }

  get engagedTargetId(): EntityId | null {
    return this.engagingId;
  }

  get cooldownRemainingMs(): number {
    return Math.max(0, this.cfg.cooldownMs - (Date.now() - this.lastAttackAt));
  }

  /** Select a target using a selector; default = nearest eligible entity. */
  selectTarget(selector?: TargetSelector): EntitySnapshot | null {
    const self = this.selfProvider();
    const candidates = this.world.entities();
    if (selector === undefined) {
      let best: EntitySnapshot | null = null;
      let bestD = Infinity;
      for (const e of candidates) {
        if (!this.cfg.targetKinds.includes(e.kind)) continue;
        const d = distance(e.position, self.position);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    }
    return selector(candidates, self);
  }

  /** Begin persistent engagement: tick() will attack while the target is valid. */
  engage(targetId: EntityId): void {
    this.caps.require('combat.attack');
    const target = this.world.entity(targetId);
    if (target === null) {
      throw Errors.combatNoTarget(`entity ${targetId} is not tracked`);
    }
    const changed = this.engagingId !== targetId;
    this.engagingId = targetId;
    if (changed) this.bus.emit('combat:targetAcquired', { target });
  }

  disengage(reason: string): void {
    if (this.engagingId === null) return;
    const target = this.world.entity(this.engagingId);
    this.engagingId = null;
    this.bus.emit('combat:targetLost', { target, reason });
  }

  /** One-shot validated attack. Throws on invalid target/conditions. */
  async attack(targetId: EntityId): Promise<void> {
    this.caps.require('combat.attack');
    const self = this.selfProvider();
    const target = this.world.entity(targetId);
    if (target === null) throw Errors.combatNoTarget(`entity ${targetId} is not tracked`);
    const d = distance(target.position, self.position);
    if (d > this.cfg.reach) {
      throw Errors.combatNoTarget(`entity ${targetId} out of reach (${d.toFixed(2)} m > ${this.cfg.reach} m)`);
    }
    if (this.cfg.requireLineOfSight && !this.hasLineOfSight(self.position, target.position)) {
      throw Errors.combatNoTarget(`entity ${targetId} has no line of sight`);
    }
    this.bus.emit('combat:attack', { targetId, position: target.position });
    await this.driver.attack(targetId);
    this.lastAttackAt = Date.now();
    this.bus.emit('combat:hit', { targetId, position: target.position });
  }

  /** True when the engagement cooldown has elapsed and the target is attackable. */
  canAttack(targetId: EntityId): boolean {
    if (Date.now() - this.lastAttackAt < this.cfg.cooldownMs) return false;
    const self = this.selfProvider();
    const target = this.world.entity(targetId);
    if (target === null) return false;
    if (distance(target.position, self.position) > this.cfg.reach) return false;
    if (this.cfg.requireLineOfSight && !this.hasLineOfSight(self.position, target.position)) {
      return false;
    }
    return true;
  }

  /** Engagement maintenance; called once per kernel tick. */
  async tick(now: number): Promise<void> {
    if (this.engagingId === null) return;
    const self = this.selfProvider();
    const target = this.world.entity(this.engagingId);
    if (target === null) {
      this.disengage('target disappeared');
      return;
    }
    const d = distance(target.position, self.position);
    if (d > this.cfg.reach + this.cfg.loseRadiusMargin) {
      this.disengage(`target out of range (${d.toFixed(2)} m)`);
      return;
    }
    if (now - this.lastAttackAt >= this.cfg.cooldownMs && this.canAttack(this.engagingId)) {
      try {
        await this.attack(this.engagingId);
      } catch (error) {
        this.log.debug('attack attempt failed', { error: String(error) });
      }
    }
  }

  /**
   * Voxel-traversal (DDA) line-of-sight check through the world model.
   * Eyes at self + 1.62 (standard player eye height).
   */
  hasLineOfSight(selfPos: Vec3, targetPos: Vec3): boolean {
    const from: Vec3 = { x: selfPos.x, y: selfPos.y + 1.62, z: selfPos.z };
    const to: Vec3 = { x: targetPos.x, y: targetPos.y + 1.0, z: targetPos.z };
    return raycastClear(this.world, from, to);
  }
}

/** Amanatides–Woo voxel traversal; true when no solid block between points. */
export function raycastClear(
  blocks: { getBlock(pos: { x: number; y: number; z: number }): BlockInfo | null },
  from: Vec3,
  to: Vec3
): boolean {
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  let z = Math.floor(from.z);
  const endX = Math.floor(to.x);
  const endY = Math.floor(to.y);
  const endZ = Math.floor(to.z);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX =
    dx !== 0 ? (stepX > 0 ? x + 1 - from.x : from.x - x) * tDeltaX : Infinity;
  let tMaxY =
    dy !== 0 ? (stepY > 0 ? y + 1 - from.y : from.y - y) * tDeltaY : Infinity;
  let tMaxZ =
    dz !== 0 ? (stepZ > 0 ? z + 1 - from.z : from.z - z) * tDeltaZ : Infinity;

  for (let i = 0; i < 512; i++) {
    if (x === endX && y === endY && z === endZ) return true;
    const block = blocks.getBlock({ x, y, z });
    if (block !== null && block.flags.solid && !(x === Math.floor(from.x) && y === Math.floor(from.y) && z === Math.floor(from.z))) {
      return false;
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > 1) return true;
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > 1) return true;
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      if (tMaxZ > 1) return true;
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  return true;
}
