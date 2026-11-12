import {
  type CapabilityMap,
  type Direction,
  type DriverOptions,
  type EntityId,
  type IDriver,
  type InventorySnapshot,
  type IWorldView,
  type MoveControl,
  type SelfState,
  type SpawnInfo,
  type ItemStack,
  type DriverEventMap,
  type BlockInfo,
  type BlockPos,
  Errors,
  directionOffset
} from '@botpex/api';
import { MemoryWorld } from './memory-world.js';

export interface MockDriverOptions {
  /** Capability keys to report as unsupported (for gating tests). */
  disableCapabilities?: readonly string[];
  /** Simulated connection latency per action (ms, default 0). */
  actionLatencyMs?: number;
  /** Run the physics clock automatically after connect (default false). */
  autoClock?: boolean;
}

const WALK_SPEED = 4.317; // m/s
const SPRINT_SPEED = 5.612;
const SNEAK_SPEED = 1.31;
const GRAVITY = 32; // m/s²
const JUMP_VELOCITY = 8.4; // ≈ 1.25-block jump

/**
 * Fully deterministic in-memory `IDriver` — the reference implementation of
 * the driver contract. Movement integrates a kinematic model with collision
 * against the MemoryWorld; attacks apply simple damage; digs edit blocks
 * after an estimated delay.
 */
export class MockDriver implements IDriver {
  readonly name = 'mock';
  readonly runtimeVersion = '0.1.0';
  readonly memoryWorld: MemoryWorld = new MemoryWorld();

  connected = false;
  private entityId = 1;
  private username = 'MockBot';
  private readonly disabled: ReadonlySet<string>;
  private readonly latencyMs: number;
  private readonly controls = new Map<MoveControl, boolean>();
  private vy = 0;
  private clock: NodeJS.Timeout | null = null;
  private lastStepAt = 0;
  private pendingDigs: { pos: BlockPos; doneAt: number }[] = [];
  private inventoryItems: ItemStack[] = [];
  private heldSlot = 0;

  private readonly autoClock: boolean;

  constructor(options: MockDriverOptions = {}) {
    this.disabled = new Set(options.disableCapabilities ?? []);
    this.latencyMs = options.actionLatencyMs ?? 0;
    this.autoClock = options.autoClock === true;
    // World mutations surface as driver events (contract: block updates,
    // entity spawns/updates/despawns are observable).
    this.memoryWorld.onBlockChanged = (pos) => this.emit('driver:blockUpdated', { pos });
    this.memoryWorld.onEntityAdded = (snap) => this.emit('driver:entitySpawned', snap);
    this.memoryWorld.onEntityUpdated = (snap) => this.emit('driver:entityUpdated', snap);
    this.memoryWorld.onEntityRemoved = (id) => this.emit('driver:entityDespawned', { id });
  }

  capabilities(): CapabilityMap {
    const all: CapabilityMap = {
      'world.blockQueries': { supported: true },
      'world.entityTracking': { supported: true },
      'world.blockUpdates': { supported: true },
      'movement.controlStates': { supported: true },
      'movement.look': { supported: true },
      'movement.physics': { supported: true },
      'combat.attack': { supported: true },
      'combat.dig': { supported: true, notes: 'instant to 250 ms simulated timing' },
      'combat.placeBlock': { supported: true },
      'inventory.read': { supported: true },
      'inventory.equip': { supported: true },
      'inventory.useItem': { supported: true },
      'inventory.containers': { supported: false, notes: 'not implemented in mock' },
      'chat.send': { supported: true },
      'chat.receive': { supported: true },
      'self.health': { supported: true },
      'self.position': { supported: true }
    };
    const out: Record<string, { supported: boolean; notes?: string }> = {};
    for (const [key, value] of Object.entries(all)) {
      if (this.disabled.has(key)) {
        out[key] = { supported: false, notes: 'disabled for testing' };
      } else {
        out[key] = value as { supported: boolean; notes?: string };
      }
    }
    return out;
  }

  async connect(options: DriverOptions): Promise<SpawnInfo> {
    this.username = options.username;
    this.connected = true;
    if (this.autoClock) this.startClock();
    const spawn: SpawnInfo = {
      entityId: this.entityId,
      position: { ...this.memoryWorld.self.position },
      gameMode: 'survival',
      version: options.version ?? '1.21.4',
      dimension: 'overworld'
    };
    this.emit('driver:connected', { spawn });
    return spawn;
  }

  async disconnect(reason = 'client disconnect'): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    this.stopClock();
    this.emit('driver:disconnected', { reason });
  }

  world(): IWorldView {
    const w = this.memoryWorld;
    return {
      getBlock: (pos) => w.getBlock(pos),
      isLoaded: (pos) => w.isLoaded(pos),
      loadedBounds: () => w.loadedBounds(),
      entities: () => w.entities(),
      entity: (id) => w.entity(id)
    };
  }

  self(): SelfState {
    return this.memoryWorld.self;
  }

  async setControlState(control: MoveControl, active: boolean): Promise<void> {
    this.require('movement.controlStates', 'setControlState');
    this.controls.set(control, active);
    await this.delay();
  }

  async look(yaw: number, pitch: number): Promise<void> {
    this.require('movement.look', 'look');
    this.memoryWorld.setSelf({ yaw: ((yaw % 360) + 360) % 360, pitch });
    await this.delay();
  }

  async attack(entityTarget: EntityId): Promise<void> {
    this.require('combat.attack', 'attack');
    const entity = this.memoryWorld.entity(entityTarget);
    if (entity === null) throw Errors.combatNoTarget(`entity ${entityTarget} does not exist`);
    if (entity.health !== null && entity.health !== undefined) {
      const hp = entity.health - 2;
      if (hp <= 0) {
        this.memoryWorld.removeEntity(entityTarget);
        this.emit('driver:entityDespawned', { id: entityTarget });
      } else {
        this.memoryWorld.updateEntity(entityTarget, { health: hp });
        this.emit('driver:entityUpdated', this.memoryWorld.entity(entityTarget)!);
      }
    }
    await this.delay();
  }

  async digBlock(pos: BlockPos): Promise<void> {
    this.require('combat.dig', 'digBlock');
    const block = this.memoryWorld.getBlock(pos);
    const hardness = block?.hardness ?? 1.5;
    const duration = hardness === null ? 500 : Math.max(50, hardness * 250);
    if (duration <= 50) {
      this.completeDig(pos);
    } else {
      this.pendingDigs.push({ pos, doneAt: Date.now() + duration });
    }
    await this.delay();
  }

  async placeBlock(pos: BlockPos, face: Direction = 'up'): Promise<void> {
    this.require('combat.placeBlock', 'placeBlock');
    const off = directionOffset(face);
    const target: BlockPos = { x: pos.x + off.x, y: pos.y + off.y, z: pos.z + off.z };
    this.memoryWorld.setBlock(target, 'stone');
    this.emit('driver:blockUpdated', { pos: target });
    await this.delay();
  }

  async useHeldItem(): Promise<void> {
    this.require('inventory.useItem', 'useHeldItem');
    await this.delay();
  }

  async selectHotbarSlot(slot: number): Promise<void> {
    this.require('inventory.equip', 'selectHotbarSlot');
    if (slot < 0 || slot > 8) throw Errors.configInvalid('slot', 'must be 0–8');
    this.heldSlot = slot;
    await this.delay();
  }

  getInventory(): InventorySnapshot | null {
    if (this.disabled.has('inventory.read')) return null;
    return {
      windowId: 0,
      size: 46,
      heldSlot: this.heldSlot,
      items: [...this.inventoryItems]
    };
  }

  async sendChat(message: string): Promise<void> {
    this.require('chat.send', 'sendChat');
    this.emit('driver:chat', { username: this.username, message });
    await this.delay();
  }

  on<K extends keyof DriverEventMap & string>(
    event: K,
    handler: (payload: DriverEventMap[K]) => void
  ): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as (p: never) => void);
    this.handlers.set(event, list);
    return () => {
      const live = this.handlers.get(event) ?? [];
      const idx = live.indexOf(handler as (p: never) => void);
      if (idx >= 0) live.splice(idx, 1);
    };
  }

  // ----- test utilities -----

  private readonly handlers = new Map<string, ((p: never) => void)[]>();

  emit<K extends keyof DriverEventMap & string>(event: K, payload: DriverEventMap[K]): void {
    for (const h of this.handlers.get(event) ?? []) {
      (h as (p: DriverEventMap[K]) => void)(payload);
    }
  }

  setInventoryItems(items: ItemStack[]): void {
    this.inventoryItems = items;
  }

  teleport(pos: Partial<{ x: number; y: number; z: number }>): void {
    const self = this.memoryWorld.self;
    this.memoryWorld.setSelf({ position: { ...self.position, ...pos } });
  }

  /** Manual physics step (ms). Called by advance() and the internal clock. */
  step(dtMs: number): void {
    if (!this.connected) return;
    const dt = dtMs / 1000;
    const self = this.memoryWorld.self;
    let { x, y, z } = self.position;

    // digs completion
    const now = Date.now();
    this.pendingDigs = this.pendingDigs.filter((d) => {
      if (d.doneAt <= now) {
        this.completeDig(d.pos);
        return false;
      }
      return true;
    });

    // horizontal movement from controls + yaw
    const yaw = (self.yaw * Math.PI) / 180;
    const forward = this.controls.get('forward') === true;
    const back = this.controls.get('back') === true;
    const left = this.controls.get('left') === true;
    const right = this.controls.get('right') === true;
    const sprint = this.controls.get('sprint') === true;
    const sneak = this.controls.get('sneak') === true;
    let speed = sneak ? SNEAK_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED;
    if (this.memoryWorld.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) })?.flags.liquid) {
      speed *= 0.5;
    }
    let vx = 0;
    let vz = 0;
    if (forward) {
      vx += -Math.sin(yaw);
      vz += Math.cos(yaw);
    }
    if (back) {
      vx += Math.sin(yaw);
      vz -= Math.cos(yaw);
    }
    if (left) {
      vx += Math.cos(yaw);
      vz += Math.sin(yaw);
    }
    if (right) {
      vx -= Math.cos(yaw);
      vz -= Math.sin(yaw);
    }
    const len = Math.hypot(vx, vz);
    if (len > 0) {
      vx = (vx / len) * speed * dt;
      vz = (vz / len) * speed * dt;
      this.tryMoveHorizontally(x + vx, z + vz);
      ({ x, z } = this.memoryWorld.self.position);
    }

    // vertical
    const onGroundBefore = self.onGround;
    if (this.controls.get('jump') === true && onGroundBefore) {
      this.vy = JUMP_VELOCITY;
      this.memoryWorld.setSelf({ onGround: false });
    }
    this.vy -= GRAVITY * dt;
    let ny = y + this.vy * dt;
    const surface = this.memoryWorld.surfaceY(Math.floor(x), Math.floor(z));
    if (ny <= surface) {
      ny = surface;
      this.vy = 0;
      this.memoryWorld.setSelf({ onGround: true });
    } else {
      this.memoryWorld.setSelf({ onGround: false });
    }
    this.memoryWorld.setSelf({ position: { x, y: ny, z } });
  }

  startClock(hz = 20): void {
    if (this.clock !== null) return;
    this.lastStepAt = Date.now();
    this.clock = setInterval(() => {
      const now = Date.now();
      const dt = now - this.lastStepAt;
      this.lastStepAt = now;
      this.step(dt);
    }, 1000 / hz);
  }

  stopClock(): void {
    if (this.clock !== null) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  /** Deterministic advance for tests. */
  advance(dtMs: number): void {
    this.step(dtMs);
  }

  private tryMoveHorizontally(nx: number, nz: number): void {
    const self = this.memoryWorld.self;
    const feet: BlockPos = { x: Math.floor(nx), y: Math.floor(self.position.y), z: Math.floor(nz) };
    const head: BlockPos = { x: feet.x, y: feet.y + 1, z: feet.z };
    const feetBlock = this.memoryWorld.getBlock(feet);
    const headBlock = this.memoryWorld.getBlock(head);
    const blocked = (feetBlock !== null && feetBlock.flags.solid) || (headBlock !== null && headBlock.flags.solid);
    if (!blocked) {
      this.memoryWorld.setSelf({ position: { x: nx, y: self.position.y, z: nz } });
      return;
    }
    // auto-step: feet blocked, head-level free, and space above target free
    const above: BlockPos = { x: feet.x, y: feet.y + 1, z: feet.z };
    const aboveBlock = this.memoryWorld.getBlock(above);
    if (self.onGround && feetBlock?.flags.solid === true && aboveBlock !== null && aboveBlock.flags.passable) {
      this.memoryWorld.setSelf({ position: { x: nx, y: self.position.y + 1, z: nz } });
    }
    // else: movement cancelled by collision
  }

  private completeDig(pos: BlockPos): void {
    this.memoryWorld.setBlock(pos, 'air');
    this.emit('driver:blockUpdated', { pos });
  }

  private require(capability: string, action: string): void {
    if (this.disabled.has(capability)) {
      throw Errors.capabilityUnsupported(capability, this.name, 'disabled for testing');
    }
    if (!this.connected) throw Errors.driverNotConnected(this.name);
    void action;
  }

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }
}
