import type { Vec3, BlockPos } from './math.js';
import type { EntityId } from './ids.js';
import type { CapabilityMap } from './capabilities.js';
import type { BlockInfo, EntitySnapshot, SelfState } from './world.js';
import type { MoveControl } from './driver.js';
import type { IEventBus, Unsubscribe, KernelEventMap } from './events.js';
import type { Logger } from './log.js';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type LifecyclePhase =
  | 'idle'
  | 'connecting'
  | 'spawning'
  | 'active'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed';

/** Legal lifecycle transitions of RuntimeSystem. */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecyclePhase, readonly LifecyclePhase[]>> = {
  idle: ['connecting', 'stopped', 'failed'],
  connecting: ['spawning', 'failed', 'stopping'],
  spawning: ['active', 'failed', 'stopping'],
  active: ['paused', 'stopping', 'failed'],
  paused: ['active', 'stopping', 'failed'],
  stopping: ['stopped', 'failed'],
  stopped: ['connecting', 'idle'],
  failed: ['stopped', 'idle']
};

// ---------------------------------------------------------------------------
// Navigation types
// ---------------------------------------------------------------------------

export interface NavPath {
  /** Waypoints in order; first is (near) start, last is the goal. */
  readonly points: readonly Vec3[];
  readonly cost: number;
  readonly computedAt: number;
}

export interface MoveOptions {
  /** Abort with BOTPEX/NAV/TIMEOUT after this long (default 120000). */
  timeoutMs?: number;
  /** Consider arrived within this distance of the goal (default 1.0 m). */
  goalRadius?: number;
  /** Sprint while following the path (default false). */
  sprint?: boolean;
  /** How many times to replan when the path breaks (default 3). */
  maxReplans?: number;
  /** Periodic replan interval in ms (default 0 = only on invalidation/stuck). */
  repathMs?: number;
  /** Accept a partial path ending at the closest reachable point (default false). */
  acceptPartial?: boolean;
}

// ---------------------------------------------------------------------------
// Behaviour engine (behaviour trees + finite state machines)
// ---------------------------------------------------------------------------

export type BTStatus = 'success' | 'failure' | 'running';

export interface Blackboard {
  get<T>(key: string): T | undefined;
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  remove(key: string): void;
  clear(): void;
}

/** Context handed to every BT node / FSM state on each tick. */
export interface BTContext {
  readonly bot: BotFacade;
  readonly blackboard: Blackboard;
  /** Epoch ms. */
  readonly now: number;
  /** Milliseconds since the previous tick. */
  readonly dt: number;
}

export interface BTNode {
  readonly id: string;
  tick(ctx: BTContext): BTStatus;
  /** Clear internal state (run when the node is re-entered or cancelled). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Finite state machines
// ---------------------------------------------------------------------------

export interface FSMState {
  readonly name: string;
  enter?(ctx: BTContext): void | Promise<void>;
  update?(ctx: BTContext): BTStatus | void;
  exit?(ctx: BTContext): void | Promise<void>;
}

export interface FSMTransition {
  /** Source state, or '*' for any state. */
  from: string | '*';
  to: string;
  when?: (ctx: BTContext) => boolean;
}

export interface StateMachineSpec {
  initial: string;
  states: readonly FSMState[];
  transitions: readonly FSMTransition[];
}

// ---------------------------------------------------------------------------
// Intelligence (Brain port)
// ---------------------------------------------------------------------------

/**
 * A decision is a declarative action request the kernel executes on the
 * bot's behalf. `custom` runs arbitrary logic — everything else keeps the
 * brain pure and inspectable (logged on `intelligence:decision`).
 */
export type Decision =
  | { kind: 'goto'; goal: BlockPos; options?: MoveOptions }
  | { kind: 'stopMove' }
  | { kind: 'attack'; targetId: EntityId }
  | { kind: 'move'; controls: Partial<Record<MoveControl, boolean>>; durationMs: number }
  | { kind: 'lookAt'; position: Vec3 }
  | { kind: 'look'; yaw: number; pitch: number }
  | { kind: 'selectHotbar'; slot: number }
  | { kind: 'useHeldItem' }
  | { kind: 'chat'; message: string }
  | { kind: 'wait'; durationMs: number }
  | { kind: 'custom'; run: (ctx: BTContext) => BTStatus | Promise<BTStatus> };

export interface BrainContext {
  readonly bot: BotFacade;
  readonly blackboard: Blackboard;
  readonly self: SelfState;
  readonly entities: readonly EntitySnapshot[];
  readonly tick: number;
}

/**
 * The intelligence port. Brains are consulted every tick after behaviours;
 * they see the world through the same facade as behaviours and may be
 * rule-based, statistical or backed by an external AI service — the kernel
 * never requires a paid API (ADR: Intelligence system).
 */
export interface Brain {
  readonly name: string;
  init?(ctx: BrainContext): void | Promise<void>;
  decide(ctx: BrainContext): Decision | null | Promise<Decision | null>;
}

// ---------------------------------------------------------------------------
// BotFacade — the safe developer surface (what behaviours/brains/extensions see)
// ---------------------------------------------------------------------------

export interface BotFacade {
  readonly botId: string;
  readonly phase: LifecyclePhase;
  readonly capabilities: CapabilityMap;

  self(): SelfState;
  entities(): EntitySnapshot[];
  entity(id: EntityId): EntitySnapshot | null;
  blockAt(pos: BlockPos): BlockInfo | null;

  /** Navigate to a block. Resolves on arrival; rejects with NAV/* error codes. */
  moveTo(goal: BlockPos, options?: MoveOptions): Promise<void>;
  stopMove(): void;
  lookAt(position: Vec3): Promise<void>;
  /** Raw look by yaw/pitch (gated by movement.look). */
  look(yaw: number, pitch: number): Promise<void>;
  /** Apply movement control states (gated by movement.controlStates). */
  applyControls(controls: Partial<Record<MoveControl, boolean>>): Promise<void>;

  attack(entityId: EntityId): Promise<void>;
  selectHotbar(slot: number): Promise<void>;
  useHeldItem(): Promise<void>;
  sendChat(message: string): Promise<void>;

  events: IEventBus;
  blackboard: Blackboard;
  now(): number;
  log: Logger;

  /** Subscribe scoped to this bot's events (identical to events.on). */
  on<K extends keyof KernelEventMap & string>(
    event: K,
    handler: (payload: KernelEventMap[K]) => void
  ): Unsubscribe;
}
