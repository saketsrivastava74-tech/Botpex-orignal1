import {
  type BlockInfo,
  type BlockPos,
  type CapabilityMap,
  type Direction,
  type DriverEventMap,
  type DriverOptions,
  type EntityId,
  type EntityKind,
  type EntitySnapshot,
  type IDriver,
  type InventorySnapshot,
  type IWorldView,
  type MoveControl,
  type SelfState,
  type SpawnInfo,
  type ItemStack,
  BotpexError,
  Errors,
  blockPos,
  blockKey,
  directionOffset,
  yawBetween
} from '@botpex/api';
import { nativeCapabilities } from './capabilities.js';
import {
  CORRECTIONS_WARN_PER_MIN,
  GRAVITY,
  JUMP_VELOCITY,
  SPEEDS,
  VELOCITY_FACTOR,
  flattenChat,
  hasFlattenedItemIds,
  isModernPacketShape,
  relativeMoveFactor,
  yawToDirection
} from './util.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
// The protocol stack is dynamically shaped per Minecraft version; we access
// it defensively through `any` and contain the risk inside this file only.

interface NativeOptions {
  movementHz?: number;
  connectTimeoutMs?: number;
}

export type { NativeOptions };

/** Internal mutable mirror of SelfState (readonly is a view-side contract). */
interface MutableSelfState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  onGround: boolean;
  health: number | null;
  food: number | null;
  gameMode: string | null;
}

/**
 * Native runtime driver: speaks the Minecraft protocol itself (via the
 * minecraft-protocol library — protocol primitives, NOT a bot framework),
 * maintains world/entity/self state, and drives a kinematic movement model
 * with collision. See capabilities() notes for honest accuracy limits.
 */
export class NativeDriver implements IDriver {
  readonly name = 'native';
  readonly runtimeVersion = '0.1.0';

  connected = false;
  private client: any = null;
  private mcData: any = null;
  private mcWorld: any = null;
  private Column: any = null;
  private version: string | null = null;
  private entityId = -1;
  private readonly opts: Required<NativeOptions>;
  private readonly handlers = new Map<string, ((p: never) => void)[]>();
  private readonly entities = new Map<EntityId, EntitySnapshot>();
  private readonly uuidToName = new Map<string, string>();
  private readonly loadedChunks = new Set<string>();
  private boundsDirty = true;
  private boundsCache: { min: BlockPos; max: BlockPos } | null = null;
  private readonly controls = new Map<MoveControl, boolean>();
  private vy = 0;
  private movementTimer: NodeJS.Timeout | null = null;
  private lastStepAt = 0;
  private corrections: number[] = [];
  private lastCorrectionWarnAt = 0;
  private pendingDigs: { pos: BlockPos; timer: NodeJS.Timeout }[] = [];
  private inventory: InventorySnapshot = { windowId: 0, size: 46, heldSlot: 0, items: [] };
  private selfState: MutableSelfState = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: true,
    health: null,
    food: null,
    gameMode: null
  };

  constructor(options: NativeOptions = {}) {
    this.opts = {
      movementHz: options.movementHz ?? 20,
      connectTimeoutMs: options.connectTimeoutMs ?? 30_000
    };
  }

  capabilities(): CapabilityMap {
    return nativeCapabilities();
  }

  // --------------------------------------------------------------- connect

  async connect(options: DriverOptions): Promise<SpawnInfo> {
    if (this.connected) throw Errors.configInvalid('driver', 'native driver already connected');
    const mc = await importDriver();
    this.version = options.version ?? null;
    this.client = mc.createClient({
      host: options.host,
      port: options.port ?? 25565,
      username: options.username,
      password: options.password,
      auth: options.auth ?? 'offline',
      version: options.version,
      timeout: this.opts.connectTimeoutMs
    });
    this.client.on('error', (error: Error) => {
      this.emit('driver:error', { scope: 'connection', error });
    });
    this.client.on('end', (reason: string) => {
      this.connected = false;
      this.stopMovementLoop();
      this.emit('driver:disconnected', { reason: String(reason) });
    });
    this.client.on('kicked', (reason: string) => {
      this.emit('driver:kicked', { reason: String(reason) });
    });

    try {
      await this.waitFor('login');
    } catch (error) {
      try {
        this.client.end();
      } catch {
        /* ignore */
      }
      throw Errors.connectionFailed(this.name, `no login within ${this.opts.connectTimeoutMs} ms`, error);
    }

    const login = this.client.loginPacket ?? {};
    this.entityId = Number(login.entityId ?? -1);
    this.version = (this.client.version as string | undefined) ?? options.version ?? '1.21.4';
    const mcDataMod: any = await import('minecraft-data');
    this.mcData = (mcDataMod.default ?? mcDataMod)(this.version);
    const pwMod: any = await import('prismarine-world');
    const pcMod: any = await import('prismarine-chunk');
    this.mcWorld = (pwMod.default ?? pwMod)(this.version);
    this.Column = (pcMod.default ?? pcMod)(this.version);
    this.selfState.gameMode = login.gameMode !== undefined ? String(login.gameMode) : null;

    this.attachPacketHandlers();

    // Client settings (best effort; version-shaped fields vary)
    this.safeWrite('settings', {
      locale: 'en_US',
      viewDistance: options.viewDistance ?? 8,
      chatMode: 0,
      chatColors: true,
      displayedSkinParts: 127,
      mainHand: 1
    });

    // Wait for the first position packet (spawn confirmation)
    const firstPos = (await this.waitFor('position', this.opts.connectTimeoutMs)) as {
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
    };
    this.connected = true;
    this.selfState.position = { x: firstPos.x, y: firstPos.y, z: firstPos.z };
    this.selfState.yaw = firstPos.yaw ?? 0;
    this.selfState.pitch = firstPos.pitch ?? 0;
    this.startMovementLoop();
    const spawn: SpawnInfo = {
      entityId: this.entityId,
      position: { ...this.selfState.position },
      gameMode: this.selfState.gameMode,
      version: this.version,
      dimension: null
    };
    this.emit('driver:connected', { spawn });
    return spawn;
  }

  async disconnect(reason = 'client disconnect'): Promise<void> {
    if (!this.connected || this.client === null) return;
    this.connected = false;
    this.stopMovementLoop();
    for (const d of this.pendingDigs) clearTimeout(d.timer);
    this.pendingDigs = [];
    try {
      this.client.end(reason);
    } catch {
      /* ignore */
    }
    this.emit('driver:disconnected', { reason });
  }

  // ------------------------------------------------------------- state I/O

  world(): IWorldView {
    return {
      getBlock: (pos) => this.getBlock(pos),
      isLoaded: (pos) => this.isLoaded(pos),
      loadedBounds: () => this.loadedBounds(),
      entities: () => [...this.entities.values()],
      entity: (id) => this.entities.get(id) ?? null
    };
  }

  self(): SelfState {
    return this.selfState as SelfState;
  }

  private getBlock(pos: BlockPos): BlockInfo | null {
    if (this.mcWorld === null) return null;
    try {
      const block = this.mcWorld.getBlock(new (this.vec3())(pos.x, pos.y, pos.z));
      if (block === null || block === undefined) return null;
      const bounding = String(block.boundingBox ?? 'empty');
      return {
        name: String(block.name ?? 'unknown'),
        flags: {
          solid: bounding === 'block',
          liquid: bounding === 'fluid' || block.name === 'water' || block.name === 'lava',
          passable: bounding !== 'block'
        },
        hardness: typeof block.hardness === 'number' ? block.hardness : null
      };
    } catch {
      return null;
    }
  }

  private isLoaded(pos: BlockPos): boolean {
    if (this.mcWorld === null) return false;
    const column = this.mcWorld.getColumn(Math.floor(pos.x / 16), Math.floor(pos.z / 16));
    return column !== null && column !== undefined;
  }

  private loadedBounds(): { min: BlockPos; max: BlockPos } | null {
    if (this.boundsDirty) {
      let min: BlockPos | null = null;
      let max: BlockPos | null = null;
      for (const key of this.loadedChunks) {
        const [cx, cz] = key.split(',').map((n) => Number.parseInt(n, 10));
        const minX = cx! * 16;
        const minZ = cz! * 16;
        const candidateMin = { x: minX, y: -64, z: minZ };
        const candidateMax = { x: minX + 15, y: 320, z: minZ + 15 };
        if (min === null) {
          min = candidateMin;
          max = candidateMax;
        } else {
          min = {
            x: Math.min(min.x, candidateMin.x),
            y: Math.min(min.y, candidateMin.y),
            z: Math.min(min.z, candidateMin.z)
          };
          max = {
            x: Math.max(max!.x, candidateMax.x),
            y: Math.max(max!.y, candidateMax.y),
            z: Math.max(max!.z, candidateMax.z)
          };
        }
      }
      this.boundsCache = min === null || max === null ? null : { min, max };
      this.boundsDirty = false;
    }
    return this.boundsCache;
  }

  // --------------------------------------------------------------- actions

  async setControlState(control: MoveControl, active: boolean): Promise<void> {
    this.requireConnected('setControlState');
    this.controls.set(control, active);
  }

  async look(yaw: number, pitch: number): Promise<void> {
    this.requireConnected('look');
    this.selfState.yaw = ((yaw % 360) + 360) % 360;
    this.selfState.pitch = pitch;
  }

  async attack(entityId: EntityId): Promise<void> {
    this.requireConnected('attack');
    if (!this.entities.has(entityId)) {
      throw Errors.combatNoTarget(`entity ${entityId} is not tracked`);
    }
    if (isModernPacketShape(this.version ?? '26.1')) {
      this.safeWrite('use_entity', { target: entityId, type: 'attack', sneaking: false });
    } else {
      this.safeWrite('use_entity', { target: entityId, mouseButton: 1, sneaking: false });
    }
    this.safeWrite('arm_animation', { hand: 0 });
  }

  async digBlock(pos: BlockPos): Promise<void> {
    this.requireConnected('digBlock');
    const block = this.getBlock(pos);
    const hardness = block?.hardness ?? 1.5;
    const durationMs = hardness === null ? 1000 : Math.max(50, hardness * 750);
    this.safeWrite('block_dig', { status: 0, location: pos, face: 1 });
    const timer = setTimeout(() => {
      this.safeWrite('block_dig', { status: 2, location: pos, face: 1 });
      this.pendingDigs = this.pendingDigs.filter((d) => d.timer !== timer);
    }, durationMs);
    this.pendingDigs.push({ pos, timer });
  }

  async placeBlock(pos: BlockPos, face: Direction = 'up'): Promise<void> {
    this.requireConnected('placeBlock');
    const off = directionOffset(face);
    const target = { x: pos.x + off.x, y: pos.y + off.y, z: pos.z + off.z };
    this.safeWrite('block_place', {
      location: target,
      direction: directionIndex(face),
      hand: 0,
      cursorX: 0.5,
      cursorY: 0.5,
      cursorZ: 0.5
    });
  }

  async useHeldItem(): Promise<void> {
    this.requireConnected('useHeldItem');
    this.safeWrite('use_item', { hand: 0 });
  }

  async selectHotbarSlot(slot: number): Promise<void> {
    this.requireConnected('selectHotbarSlot');
    if (slot < 0 || slot > 8) throw Errors.configInvalid('slot', 'must be 0–8');
    this.safeWrite('held_item_slot', { slot });
    this.inventory = { ...this.inventory, heldSlot: slot };
  }

  getInventory(): InventorySnapshot {
    return this.inventory;
  }

  async sendChat(message: string): Promise<void> {
    this.requireConnected('sendChat');
    if (isModernPacketShape(this.version ?? '1.21')) {
      this.safeWrite('chat_message', {
        message,
        timestamp: BigInt(Date.now()),
        salt: 0n,
        offset: 0,
        acknowledged: new Array(20).fill(false)
      });
    } else {
      this.safeWrite('chat_message', { message });
    }
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

  // ------------------------------------------------------ packet handlers

  private attachPacketHandlers(): void {
    const client = this.client;

    client.on('map_chunk', (data: any) => {
      try {
        const column = new this.Column();
        column.load(data.blob, false);
        this.mcWorld.setColumn(data.x, data.z, column);
        this.loadedChunks.add(`${data.x},${data.z}`);
        this.boundsDirty = true;
      } catch (error) {
        this.emit('driver:error', { scope: 'world-decode', error: error as Error });
      }
    });

    client.on('unload_chunk', (data: any) => {
      this.mcWorld.deleteColumn?.(data.chunkX, data.chunkZ);
      this.loadedChunks.delete(`${data.chunkX},${data.chunkZ}`);
      this.boundsDirty = true;
    });

    client.on('block_update', (data: any) => {
      try {
        const pos = blockPos(data.location.x, data.location.y, data.location.z);
        const stateId = data.type ?? data.blockStateId ?? 0;
        const block = this.mcData.blocksByStateId?.[stateId];
        const name = block?.name ?? 'unknown';
        this.mcWorld.setBlock?.(new (this.vec3())(pos.x, pos.y, pos.z), this.mcData.blocksByName[name]);
        this.emit('driver:blockUpdated', { pos });
      } catch (error) {
        this.emit('driver:error', { scope: 'block-update', error: error as Error });
      }
    });

    client.on('multi_block_change', (data: any) => {
      try {
        const records: any[] = data.records ?? [];
        for (const rec of records) {
          const stateId = rec.blockId ?? rec.type ?? 0;
          const pos = rec.location ?? rec.pos;
          if (pos === undefined) continue;
          const blockPos3 = blockPos(pos.x, pos.y, pos.z);
          const name = this.mcData.blocksByStateId?.[stateId]?.name ?? 'unknown';
          this.mcWorld.setBlock?.(
            new (this.vec3())(blockPos3.x, blockPos3.y, blockPos3.z),
            this.mcData.blocksByName[name]
          );
          this.emit('driver:blockUpdated', { pos: blockPos3 });
        }
      } catch (error) {
        this.emit('driver:error', { scope: 'multi-block-change', error: error as Error });
      }
    });

    client.on('position', (data: any) => {
      // Server teleport/correction: acknowledge and adopt absolutely.
      if (data.teleportId !== undefined && data.teleportId !== null) {
        this.safeWrite('teleport_confirm', { teleportId: data.teleportId });
        this.corrections.push(Date.now());
        this.pruneCorrections();
      }
      this.selfState.position = { x: data.x, y: data.y, z: data.z };
      if (typeof data.yaw === 'number') this.selfState.yaw = data.yaw;
      if (typeof data.pitch === 'number') this.selfState.pitch = data.pitch;
      this.emit('driver:selfUpdated', { ...this.selfState });
      this.wakeWaiters('position', data);
    });

    client.on('update_health', (data: any) => {
      const prev = this.selfState.health;
      this.selfState = {
        ...this.selfState,
        health: typeof data.health === 'number' ? data.health : this.selfState.health,
        food: typeof data.food === 'number' ? data.food : this.selfState.food
      };
      this.emit('driver:selfUpdated', { ...this.selfState });
      void prev;
    });

    client.on('named_entity_spawn', (data: any) => {
      const username = this.uuidToName.get(String(data.playerUUID)) ?? null;
      const snap: EntitySnapshot = {
        id: data.entityId,
        kind: 'player',
        type: 'player',
        position: { x: data.x, y: data.y, z: data.z },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: data.yaw ?? 0,
        pitch: data.pitch ?? 0,
        health: null,
        username: username ?? undefined,
        lastSeenMs: Date.now()
      };
      this.trackEntity(snap, 'driver:entitySpawned');
    });

    client.on('player_info', (data: any) => {
      // Map UUID → display name for player entities.
      const entries: any[] = data.data ?? [];
      for (const entry of entries) {
        const uuid = entry.UUID ?? entry.uuid;
        const name = entry.name ?? entry.displayName;
        if (uuid !== undefined && typeof name === 'string') {
          this.uuidToName.set(String(uuid), name);
        }
      }
    });

    client.on('spawn_entity_living', (data: any) => this.handleSpawnEntity(data));
    client.on('spawn_entity', (data: any) => this.handleSpawnEntity(data));

    client.on('entity_teleport', (data: any) => {
      const snap = this.entities.get(data.entityId);
      if (snap === undefined) return;
      this.trackEntity(
        { ...snap, position: { x: data.x, y: data.y, z: data.z }, yaw: data.yaw ?? snap.yaw, lastSeenMs: Date.now() },
        'driver:entityUpdated'
      );
    });

    client.on('rel_entity_move', (data: any) => this.handleRelativeMove(data));
    client.on('entity_move_look', (data: any) => this.handleRelativeMove(data));

    client.on('entity_velocity', (data: any) => {
      const snap = this.entities.get(data.entityId);
      if (snap === undefined) return;
      this.trackEntity(
        {
          ...snap,
          velocity: {
            x: data.velocityX / VELOCITY_FACTOR,
            y: data.velocityY / VELOCITY_FACTOR,
            z: data.velocityZ / VELOCITY_FACTOR
          },
          lastSeenMs: Date.now()
        },
        'driver:entityUpdated'
      );
    });

    client.on('destroy_entity', (data: any) => {
      const ids: number[] = data.entityIds ?? [];
      for (const id of ids) {
        this.entities.delete(id);
        this.emit('driver:entityDespawned', { id });
      }
    });

    const chatHandler = (raw: any): void => {
      try {
        const json = raw.message ?? raw.content ?? raw.plainChat ?? raw.unsignedChat ?? raw.formattedMessage;
        const text = typeof json === 'string' ? safeParseAndFlatten(json) : flattenChat(json);
        if (text.length > 0) {
          this.emit('driver:chat', { username: null, message: text });
        }
      } catch (error) {
        this.emit('driver:error', { scope: 'chat-decode', error: error as Error });
      }
    };
    client.on('chat', chatHandler);
    client.on('system_chat_message', chatHandler);
    client.on('player_chat', (data: any) => {
      const text = flattenChat(data.unsignedChat ?? data.plainChat ?? data.formattedMessage);
      if (text.length > 0) this.emit('driver:chat', { username: null, message: text });
    });

    client.on('window_items', (data: any) => {
      try {
        const items: ItemStack[] = [];
        const slots: any[] = data.items ?? [];
        for (let slot = 0; slot < slots.length; slot++) {
          const s = slots[slot];
          if (s === null || s === undefined || (s.itemCount ?? s.count ?? 0) === 0) continue;
          const id = s.itemId ?? s.id ?? s.blockId;
          const name = this.itemName(id, s.metadata);
          items.push({ slot, name, count: s.itemCount ?? s.count ?? 1 });
        }
        this.inventory = { ...this.inventory, items, size: slots.length };
      } catch (error) {
        this.emit('driver:error', { scope: 'inventory-decode', error: error as Error });
      }
    });

    client.on('held_item_slot', (data: any) => {
      this.inventory = { ...this.inventory, heldSlot: data.slot ?? 0 };
    });
  }

  private handleSpawnEntity(data: any): void {
    const typeId = data.type ?? 0;
    const name = this.entityName(typeId);
    const kind: EntityKind = name !== null && name !== undefined ? 'mob' : 'object';
    const snap: EntitySnapshot = {
      id: data.entityId,
      kind,
      type: name ?? `entity_${typeId}`,
      position: { x: data.x, y: data.y, z: data.z },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: data.yaw ?? 0,
      pitch: data.pitch ?? 0,
      health: null,
      lastSeenMs: Date.now()
    };
    this.trackEntity(snap, 'driver:entitySpawned');
  }

  private handleRelativeMove(data: any): void {
    const snap = this.entities.get(data.entityId);
    if (snap === undefined) return;
    const f = relativeMoveFactor(this.version ?? '1.21');
    this.trackEntity(
      {
        ...snap,
        position: {
          x: snap.position.x + data.dx / f,
          y: snap.position.y + data.dy / f,
          z: snap.position.z + data.dz / f
        },
        yaw: data.yaw ?? snap.yaw,
        lastSeenMs: Date.now()
      },
      'driver:entityUpdated'
    );
  }

  private itemName(id: unknown, _metadata: unknown): string {
    if (typeof id !== 'number') return 'unknown';
    if (hasFlattenedItemIds(this.version ?? '1.21')) {
      return this.mcData?.itemsById?.[id]?.name ?? `item_${id}`;
    }
    return `item_${id}`;
  }

  private entityName(typeId: unknown): string | null {
    if (typeof typeId !== 'number') return null;
    return this.mcData?.entitiesArray?.find((e: any) => e.id === typeId)?.name ?? null;
  }

  private trackEntity(snap: EntitySnapshot, event: 'driver:entitySpawned' | 'driver:entityUpdated'): void {
    this.entities.set(snap.id, snap);
    this.emit(event, snap);
  }

  // ----------------------------------------------------- movement stepper

  private startMovementLoop(): void {
    if (this.movementTimer !== null) return;
    this.lastStepAt = Date.now();
    const hz = this.opts.movementHz;
    this.movementTimer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(250, now - this.lastStepAt) / 1000;
      this.lastStepAt = now;
      this.step(dt);
    }, 1000 / hz);
  }

  private stopMovementLoop(): void {
    if (this.movementTimer !== null) {
      clearInterval(this.movementTimer);
      this.movementTimer = null;
    }
  }

  /** Kinematic integration + packet emission (server-authoritative world). */
  private step(dt: number): void {
    if (!this.connected) return;
    const self = this.selfState;
    const forward = this.controls.get('forward') === true;
    const back = this.controls.get('back') === true;
    const left = this.controls.get('left') === true;
    const right = this.controls.get('right') === true;
    const jump = this.controls.get('jump') === true;
    const sprint = this.controls.get('sprint') === true;
    const sneak = this.controls.get('sneak') === true;

    const speed = sneak ? SPEEDS.sneak : sprint ? SPEEDS.sprint : SPEEDS.walk;
    const yawRad = (self.yaw * Math.PI) / 180;
    let vx = 0;
    let vz = 0;
    if (forward) {
      vx += -Math.sin(yawRad);
      vz += Math.cos(yawRad);
    }
    if (back) {
      vx += Math.sin(yawRad);
      vz -= Math.cos(yawRad);
    }
    if (left) {
      vx += Math.cos(yawRad);
      vz += Math.sin(yawRad);
    }
    if (right) {
      vx -= Math.cos(yawRad);
      vz -= Math.sin(yawRad);
    }
    const len = Math.hypot(vx, vz);
    if (len > 0) {
      vx = (vx / len) * speed * dt;
      vz = (vz / len) * speed * dt;
      const moved = this.tryMove(self.position.x + vx, self.position.z + vz);
      void moved;
    }

    // vertical
    if (jump && self.onGround) {
      this.vy = JUMP_VELOCITY;
      self.onGround = false;
    }
    this.vy -= GRAVITY * dt;
    let ny = self.position.y + this.vy * dt;
    const surface = this.surfaceUnder(self.position.x, self.position.z);
    if (ny <= surface) {
      ny = surface;
      this.vy = 0;
      self.onGround = true;
    } else {
      self.onGround = false;
    }
    self.position = { x: self.position.x, y: ny, z: self.position.z };

    // send position (with look when rotation changed)
    const p = self.position;
    this.safeWrite('position_look', { x: p.x, y: p.y, z: p.z, yaw: self.yaw, pitch: self.pitch, onGround: self.onGround });
  }

  private tryMove(nx: number, nz: number): boolean {
    const self = this.selfState;
    const feetY = Math.floor(self.position.y);
    const feet = this.getBlock({ x: Math.floor(nx), y: feetY, z: Math.floor(nz) });
    const head = this.getBlock({ x: Math.floor(nx), y: feetY + 1, z: Math.floor(nz) });
    const blocked = (feet !== null && feet.flags.solid) || (head !== null && head.flags.solid);
    if (!blocked) {
      self.position = { x: nx, y: self.position.y, z: nz };
      return true;
    }
    if (self.onGround && (head === null || head.flags.passable)) {
      // auto-step
      self.position = { x: nx, y: self.position.y + 1, z: nz };
      return true;
    }
    return false;
  }

  /** Highest solid-block top under (x, z) within a small column window. */
  private surfaceUnder(x: number, z: number): number {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const feetY = Math.floor(this.selfState.position.y);
    for (let y = feetY + 1; y >= feetY - 4; y--) {
      const b = this.getBlock({ x: bx, y, z: bz });
      if (b !== null && b.flags.solid) return y + 1;
    }
    return feetY;
  }

  // ------------------------------------------------------------------ util

  private correctionsPerMinute(): number {
    const now = Date.now();
    return this.corrections.filter((t) => now - t < 60_000).length;
  }

  private pruneCorrections(): void {
    const now = Date.now();
    this.corrections = this.corrections.filter((t) => now - t < 120_000);
    if (this.correctionsPerMinute() > CORRECTIONS_WARN_PER_MIN && now - this.lastCorrectionWarnAt > 60_000) {
      this.lastCorrectionWarnAt = now;
      this.emit('driver:error', {
        scope: 'movement',
        error: new BotpexError(
          'BOTPEX/DRIVER/ACTION_FAILED',
          `Server is sending frequent position corrections (${this.correctionsPerMinute()}/min) — movement may be rejected (anti-cheat?). Kinematic movement limitation, see capability 'movement.physics'.`,
          { hint: 'Use the mineflayer runtime (full physics) or a server without strict movement validation.' }
        )
      });
    }
  }

  private safeWrite(packet: string, data: Record<string, unknown>): void {
    try {
      this.client?.write(packet, data);
    } catch (error) {
      this.emit('driver:error', { scope: `write:${packet}`, error: error as Error });
    }
  }

  private requireConnected(action: string): void {
    if (!this.connected || this.client === null) throw Errors.driverNotConnected(this.name);
    void action;
  }

  private vec3(): any {
    // vec3 is a constructor factory in this runtime's deps
    return Vec3Ctor;
  }

  private emit<K extends keyof DriverEventMap & string>(event: K, payload: DriverEventMap[K]): void {
    for (const h of this.handlers.get(event) ?? []) {
      (h as (p: DriverEventMap[K]) => void)(payload);
    }
  }

  private waiters = new Map<string, ((data: unknown) => void)[]>();

  private wakeWaiters(kind: string, data: unknown): void {
    const list = this.waiters.get(kind);
    if (!list) return;
    this.waiters.delete(kind);
    for (const fn of list) fn(data);
  }

  private waitFor(kind: string, timeoutMs = this.opts.connectTimeoutMs): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const list = this.waiters.get(kind) ?? [];
        this.waiters.set(kind, list.filter((f) => f !== wrapped));
        reject(new Error(`timeout waiting for "${kind}"`));
      }, timeoutMs);
      const wrapped = (data: unknown): void => {
        clearTimeout(timer);
        resolve(data);
      };
      const list = this.waiters.get(kind) ?? [];
      list.push(wrapped);
      this.waiters.set(kind, list);

      // also listen on the client for the raw event (login/position)
      if (this.client !== null) {
        this.client.once(kind, (data: unknown) => {
          clearTimeout(timer);
          const list2 = this.waiters.get(kind) ?? [];
          this.waiters.set(kind, list2.filter((f) => f !== wrapped));
          resolve(data);
        });
      }
    });
  }
}

let Vec3Ctor: any = null;
async function ensureVec3(): Promise<void> {
  if (Vec3Ctor === null) {
    const mod = await import('vec3');
    Vec3Ctor = (mod as unknown as { default: any }).default ?? (mod as unknown as any);
  }
}

let driverPromise: Promise<any> | null = null;
async function importDriver(): Promise<any> {
  await ensureVec3();
  if (driverPromise === null) {
    driverPromise = import('minecraft-protocol');
  }
  const mod = await driverPromise;
  return (mod as unknown as { default: any }).default ?? mod;
}

function safeParseAndFlatten(json: string): string {
  try {
    return flattenChat(JSON.parse(json));
  } catch {
    return json;
  }
}

function directionIndex(face: Direction): number {
  // vanilla face enum: 0 down, 1 up, 2 north, 3 south, 4 west, 5 east
  switch (face) {
    case 'down':
      return 0;
    case 'up':
      return 1;
    case 'north':
      return 2;
    case 'south':
      return 3;
    case 'west':
      return 4;
    case 'east':
      return 5;
  }
}

// Prevent unused import warnings for helpers used indirectly.
void yawBetween;
void blockKey;
void yawToDirection;
