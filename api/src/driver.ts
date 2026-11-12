import type { BlockPos, Direction } from './math.js';
import type { EntityId } from './ids.js';
import type { CapabilityMap } from './capabilities.js';
import type { IWorldView, SelfState, SpawnInfo } from './world.js';
import type { InventorySnapshot } from './inventory.js';
import type { DriverEventMap, Unsubscribe } from './events.js';

/** Movement control channels a driver may expose. */
export const MOVE_CONTROLS = ['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint'] as const;
export type MoveControl = (typeof MOVE_CONTROLS)[number];

/** Partial map of control channels to desired state. */
export type ControlSet = Partial<Record<MoveControl, boolean>>;

export interface DriverOptions {
  host: string;
  port?: number;
  username: string;
  /** Minecraft version, e.g. "1.21.4". Runtime may auto-negotiate when omitted. */
  version?: string;
  auth?: 'offline' | 'microsoft';
  password?: string;
  connectTimeoutMs?: number;
  viewDistance?: number;
  /** Adapter-specific options are passed through. */
  [extra: string]: unknown;
}

export interface DriverMeta {
  readonly name: string;
  readonly runtimeVersion: string;
  readonly capabilities: CapabilityMap;
}

/**
 * The single integration port between the kernel and any execution
 * environment (protocol client, external engine, test double).
 *
 * Contract:
 * - Methods whose feature is not covered by capabilities() MUST throw
 *   BotpexError('BOTPEX/CAPABILITY/UNSUPPORTED') — never fail silently.
 * - Actions before a successful connect() MUST throw BOTPEX/DRIVER/NOT_CONNECTED.
 * - All events are emitted synchronously from the driver's context.
 */
export interface IDriver {
  readonly name: string;
  readonly runtimeVersion: string;
  capabilities(): CapabilityMap;
  connect(options: DriverOptions): Promise<SpawnInfo>;
  disconnect(reason?: string): Promise<void>;
  readonly connected: boolean;

  world(): IWorldView;
  self(): SelfState;

  setControlState(control: MoveControl, active: boolean): Promise<void>;
  look(yaw: number, pitch: number): Promise<void>;

  attack(entityId: EntityId): Promise<void>;
  digBlock(pos: BlockPos): Promise<void>;
  placeBlock(pos: BlockPos, face?: Direction): Promise<void>;

  useHeldItem(): Promise<void>;
  selectHotbarSlot(slot: number): Promise<void>;
  /** null when the runtime cannot observe the inventory. */
  getInventory(): InventorySnapshot | null;

  sendChat(message: string): Promise<void>;

  on<K extends keyof DriverEventMap & string>(
    event: K,
    handler: (payload: DriverEventMap[K]) => void
  ): Unsubscribe;
}

export interface DriverFactory {
  (): IDriver | Promise<IDriver>;
  /** Optional static metadata so hosts can inspect without instantiation. */
  readonly meta?: DriverMeta;
}

export function driverMeta(factory: DriverFactory): DriverMeta | undefined {
  return factory.meta;
}
