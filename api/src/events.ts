import type { Vec3, BlockPos } from './math.js';
import type { EntityId } from './ids.js';
import type { EntitySnapshot, SelfState, SpawnInfo, BlockInfo } from './world.js';
import type { InventorySnapshot as InvSnapshot } from './inventory.js';
import type { NavPath, Decision, LifecyclePhase } from './behaviour.js';
import type { CapabilityKey } from './capabilities.js';

export type DriverEventMap = {
  'driver:connected': { spawn: SpawnInfo };
  'driver:disconnected': { reason: string };
  'driver:kicked': { reason: string };
  'driver:error': { scope: string; error: Error };
  'driver:entitySpawned': EntitySnapshot;
  'driver:entityUpdated': EntitySnapshot;
  'driver:entityDespawned': { id: EntityId };
  'driver:blockUpdated': { pos: BlockPos };
  'driver:selfUpdated': SelfState;
  'driver:chat': { username: string | null; message: string };
};

export interface CancellableEvent {
  /** Handlers may set this to veto an action (checked before execution). */
  cancelled?: boolean;
}

/** Full catalog of kernel-bus events. All payloads are readonly snapshots. */
export type KernelEventMap = DriverEventMap & {
  // lifecycle
  'bot:phase': { from: LifecyclePhase | null; to: LifecyclePhase };
  'bot:tick': { tick: number; dtMs: number };
  // capability negotiation
  'bot:capabilityReport': { unsupported: { feature: string; missing: CapabilityKey[] }[] };
  // perception (semantic diffs)
  'perception:entitySpawned': EntitySnapshot;
  'perception:entityMoved': { entity: EntitySnapshot; prev: Vec3 };
  'perception:entityDespawned': { id: EntityId; last: EntitySnapshot | null };
  'perception:blockUpdated': { pos: BlockPos; block: BlockInfo | null };
  'perception:worldBounds': { min: BlockPos; max: BlockPos } | null;
  // self
  'self:position': { position: Vec3; prev: Vec3 };
  'self:health': { health: number; prev: number | null };
  'self:food': { food: number; prev: number | null };
  // navigation
  'navigation:planned': { path: NavPath; goal: BlockPos };
  'navigation:replanned': { path: NavPath; reason: string };
  'navigation:waypoint': { index: number; point: Vec3 };
  'navigation:arrived': { goal: BlockPos; elapsedMs: number };
  'navigation:failed': { goal: BlockPos; code: string; message: string };
  'navigation:stuck': { at: Vec3; progressMeters: number };
  // combat
  'combat:targetAcquired': { target: EntitySnapshot };
  'combat:targetLost': { target: EntitySnapshot | null; reason: string };
  'combat:attack': { targetId: EntityId; position: Vec3 };
  'combat:hit': { targetId: EntityId; position: Vec3 };
  // inventory
  'inventory:updated': { snapshot: InvSnapshot };
  // behaviour
  'behaviour:stateEnter': { state: string };
  'behaviour:stateExit': { state: string };
  // intelligence
  'intelligence:decision': { brain: string; decision: Decision | null };
  // runtime
  'runtime:taskScheduled': { name: string; intervalMs: number | null; delayMs: number | null };
  'runtime:taskCompleted': { name: string; durationMs: number };
  'runtime:taskFailed': { name: string; error: Error };
  'runtime:warning': { scope: string; message: string };
};

export type SubscribeOptions = {
  /** Higher priority handlers run first (default 0). */
  priority?: number;
  /** Remove after first invocation. */
  once?: boolean;
};

export type Unsubscribe = () => void;

export interface IEventBus<M extends object = KernelEventMap> {
  on<K extends keyof M & string>(
    type: K,
    handler: (payload: M[K]) => void,
    options?: SubscribeOptions
  ): Unsubscribe;
  once<K extends keyof M & string>(
    type: K,
    handler: (payload: M[K]) => void,
    options?: SubscribeOptions
  ): Unsubscribe;
  off<K extends keyof M & string>(type: K, handler: (payload: M[K]) => void): void;
  emit<K extends keyof M & string>(type: K, payload: M[K]): void;
  /** Resolves on the next matching event; rejects with BOTPEX/TIMEOUT when expired. */
  waitFor<K extends keyof M & string>(
    type: K,
    predicate?: (payload: M[K]) => boolean,
    timeoutMs?: number
  ): Promise<M[K]>;
  listenerCount(type?: string): number;
}
