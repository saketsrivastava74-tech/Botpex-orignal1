/* eslint-disable @typescript-eslint/no-explicit-any */
// Mineflayer's surface is dynamic (plugins attach behaviour at runtime); this
// adapter contains all `any` interaction behind the IDriver boundary.

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
  Errors,
  floorToBlock
} from '@botpex/api';

/**
 * Mineflayer runtime capabilities. This is the reference "external engine"
 * profile: full physics, richer inventory/container surface.
 */
export function mineflayerCapabilities(): CapabilityMap {
  return {
    'world.blockQueries': { supported: true, notes: 'loaded view-distance chunks only' },
    'world.entityTracking': { supported: true, notes: 'full entity metadata via mineflayer' },
    'world.blockUpdates': { supported: true, notes: 'driven by mineflayer blockUpdate events' },
    'movement.controlStates': { supported: true, notes: 'executed by mineflayer physics' },
    'movement.look': { supported: true },
    'movement.physics': { supported: true, notes: 'mineflayer implements full client physics' },
    'combat.attack': { supported: true },
    'combat.dig': { supported: true, notes: 'real dig timing via mineflayer' },
    'combat.placeBlock': { supported: true },
    'inventory.read': { supported: true },
    'inventory.equip': { supported: true, notes: 'hotbar select via equip' },
    'inventory.useItem': { supported: true },
    'inventory.containers': { supported: false, notes: 'planned via bot.openChest bridge' },
    'chat.send': { supported: true, notes: 'server-signed automatically by mineflayer session' },
    'chat.receive': { supported: true },
    'self.health': { supported: true },
    'self.position': { supported: true }
  };
}

type AnyBot = any;

/**
 * MineflayerDriver — maps a mineflayer bot onto the unified IDriver port.
 * Create with createMineflayerDriver(); connect() spawns the mineflayer bot.
 */
export class MineflayerDriver implements IDriver {
  readonly name = 'mineflayer';
  readonly runtimeVersion = '0.1.0';

  connected = false;
  private bot: AnyBot | null = null;
  private readonly handlers = new Map<string, ((p: never) => void)[]>();

  capabilities(): CapabilityMap {
    return mineflayerCapabilities();
  }

  async connect(options: DriverOptions): Promise<SpawnInfo> {
    if (this.connected) throw Errors.configInvalid('driver', 'mineflayer driver already connected');
    let mf: any;
    try {
      mf = (await import('mineflayer')).default ?? (await import('mineflayer'));
    } catch (error) {
      throw Errors.connectionFailed(this.name, 'mineflayer package is not installed', error);
    }
    const bot: AnyBot = mf.createBot({
      host: options.host,
      port: options.port ?? 25565,
      username: options.username,
      password: options.password,
      auth: options.auth ?? 'offline',
      version: options.version,
      ...((options as Record<string, unknown>).mineflayer ?? {})
    });
    this.bot = bot;

    const spawned = new Promise<SpawnInfo>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('spawn timeout (mineflayer)')), options.connectTimeoutMs ?? 60_000);
      bot.once('spawn', () => {
        clearTimeout(timer);
        resolve({
          entityId: bot.entity?.id ?? -1,
          position: { x: bot.entity?.position?.x ?? 0, y: bot.entity?.position?.y ?? 0, z: bot.entity?.position?.z ?? 0 },
          gameMode: bot.game?.gameMode ?? null,
          version: bot.version ?? options.version ?? null,
          dimension: bot.game?.dimension ?? null
        });
      });
      bot.once('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    bot.on('entitySpawn', (entity: any) => {
      if (entity === null || entity.id === bot.entity?.id) return;
      this.emit('driver:entitySpawned', this.mapEntity(entity));
    });
    bot.on('entityUpdate', (entity: any) => {
      if (entity === null || entity.id === bot.entity?.id) return;
      this.emit('driver:entityUpdated', this.mapEntity(entity));
    });
    bot.on('entityGone', (entity: any) => {
      if (entity === null) return;
      this.emit('driver:entityDespawned', { id: entity.id as EntityId });
    });
    bot.on('blockUpdate', (oldBlock: any, newBlock: any) => {
      const block = newBlock ?? oldBlock;
      if (block === null || block === undefined) return;
      this.emit('driver:blockUpdated', { pos: floorToBlock({ x: block.position.x, y: block.position.y, z: block.position.z }) });
    });
    bot.on('health', () => {
      this.emit('driver:selfUpdated', this.self());
    });
    bot.on('message', (message: any) => {
      const text = typeof message?.toString === 'function' ? message.toString() : String(message);
      this.emit('driver:chat', { username: null, message: text });
    });
    bot.on('kicked', (reason: string) => this.emit('driver:kicked', { reason: String(reason) }));
    bot.on('end', (reason: string) => {
      this.connected = false;
      this.emit('driver:disconnected', { reason: String(reason) });
    });
    bot.on('error', (error: Error) => this.emit('driver:error', { scope: 'connection', error }));

    const spawn = await spawned;
    this.connected = true;
    this.emit('driver:connected', { spawn });
    return spawn;
  }

  async disconnect(reason = 'client disconnect'): Promise<void> {
    if (this.bot !== null) {
      try {
        this.bot.quit(reason);
      } catch {
        /* ignore */
      }
    }
    this.connected = false;
  }

  world(): IWorldView {
    const getBlock = (pos: BlockPos): BlockInfo | null => {
      const b = this.bot?.blockAt?.(new (this.vec3())(pos.x, pos.y, pos.z));
      if (b === null || b === undefined) return null;
      const bounding = String(b.boundingBox ?? 'empty');
      return {
        name: String(b.name ?? 'unknown'),
        flags: {
          solid: bounding === 'block',
          liquid: bounding === 'fluid',
          passable: bounding !== 'block'
        },
        hardness: typeof b.hardness === 'number' ? b.hardness : null
      };
    };
    return {
      getBlock,
      isLoaded: (pos) => this.bot?.blockAt?.(new (this.vec3())(pos.x, pos.y, pos.z)) !== null,
      loadedBounds: () => null,
      entities: () => {
        const map: Map<number, any> = this.bot?.entities;
        if (map === undefined) return [];
        const out: EntitySnapshot[] = [];
        const selfId = this.bot?.entity?.id;
        for (const [id, e] of map.entries()) {
          if (id === selfId) continue;
          out.push(this.mapEntity(e, id));
        }
        return out;
      },
      entity: (id) => {
        const e = this.bot?.entities?.get?.(id);
        return e === undefined ? null : this.mapEntity(e, id);
      }
    };
  }

  self(): SelfState {
    const e = this.bot?.entity;
    return {
      position: { x: e?.position?.x ?? 0, y: e?.position?.y ?? 0, z: e?.position?.z ?? 0 },
      velocity: { x: e?.velocity?.x ?? 0, y: e?.velocity?.y ?? 0, z: e?.velocity?.z ?? 0 },
      yaw: e?.yaw ?? 0,
      pitch: e?.pitch ?? 0,
      onGround: e?.onGround ?? true,
      health: this.bot?.health ?? null,
      food: this.bot?.food ?? null,
      gameMode: this.bot?.game?.gameMode ?? null
    };
  }

  async setControlState(control: MoveControl, active: boolean): Promise<void> {
    this.requireBot();
    this.bot.setControlState(control, active);
  }

  async look(yaw: number, pitch: number): Promise<void> {
    this.requireBot();
    await this.bot.look(yaw, pitch, false);
  }

  async attack(entityId: EntityId): Promise<void> {
    this.requireBot();
    const entity = this.bot.entities.get(entityId);
    if (entity === undefined) throw Errors.combatNoTarget(`entity ${entityId} is not tracked by mineflayer`);
    await this.bot.attack(entity);
  }

  async digBlock(pos: BlockPos): Promise<void> {
    this.requireBot();
    const block = this.bot.blockAt(new (this.vec3())(pos.x, pos.y, pos.z));
    if (block === null || block === undefined) throw Errors.driverAction(this.name, 'digBlock: block not loaded');
    await this.bot.dig(block);
  }

  async placeBlock(pos: BlockPos, face: Direction = 'up'): Promise<void> {
    this.requireBot();
    const reference = this.bot.blockAt(new (this.vec3())(pos.x, pos.y, pos.z));
    if (reference === null || reference === undefined) throw Errors.driverAction(this.name, 'placeBlock: block not loaded');
    const vector = new (this.vec3())(pos.x, pos.y, pos.z);
    await this.bot.placeBlock(reference, vector.plus({ x: 0.5, y: 0.5, z: 0.5 }).minus(reference.position).plus({ x: 0, y: 1, z: 0 }));
    void face;
  }

  async useHeldItem(): Promise<void> {
    this.requireBot();
    await this.bot.consume(); // best-effort consume/use of held consumable
  }

  async selectHotbarSlot(slot: number): Promise<void> {
    this.requireBot();
    if (slot < 0 || slot > 8) throw Errors.configInvalid('slot', 'must be 0–8');
    await new Promise<void>((resolve, reject) => {
      this.bot.setQuickBarSlot(slot, (error?: Error) => (error ? reject(error) : resolve()));
    });
  }

  getInventory(): InventorySnapshot | null {
    const inv = this.bot?.inventory;
    if (inv === undefined || inv === null) return null;
    const items: ItemStack[] = [];
    const slots: any[] = inv.items ?? [];
    for (const item of slots) {
      items.push({
        slot: item.slot ?? -1,
        name: String(item.name ?? 'unknown'),
        count: item.count ?? 1,
        displayName: item.displayName
      });
    }
    return { windowId: 0, size: inv.slots?.length ?? 46, heldSlot: this.bot?.quickBarSlot ?? 0, items };
  }

  async sendChat(message: string): Promise<void> {
    this.requireBot();
    this.bot.chat(message);
  }

  on<K extends keyof DriverEventMap & string>(event: K, handler: (payload: DriverEventMap[K]) => void): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as (p: never) => void);
    this.handlers.set(event, list);
    return () => {
      const live = this.handlers.get(event) ?? [];
      const idx = live.indexOf(handler as (p: never) => void);
      if (idx >= 0) live.splice(idx, 1);
    };
  }

  /** Raw mineflayer access for advanced users (documented escape hatch). */
  raw(): AnyBot | null {
    return this.bot;
  }

  // -------------------------------------------------------------- helpers

  private mapEntity(e: any, forcedId?: EntityId): EntitySnapshot {
    const kind: EntityKind =
      e.type === 'player' ? 'player' : e.type === 'mob' || e.kind === 'Hostile mobs' || e.kind === 'Passive mobs' ? 'mob' : e.type === 'object' ? 'object' : 'other';
    return {
      id: forcedId ?? e.id,
      kind,
      type: String(e.name ?? e.displayName ?? e.type ?? 'unknown'),
      position: { x: e.position?.x ?? 0, y: e.position?.y ?? 0, z: e.position?.z ?? 0 },
      velocity: { x: e.velocity?.x ?? 0, y: e.velocity?.y ?? 0, z: e.velocity?.z ?? 0 },
      yaw: e.yaw ?? 0,
      pitch: e.pitch ?? 0,
      onGround: e.onGround,
      health: e.metadata ? undefined : null,
      username: e.username,
      lastSeenMs: Date.now()
    };
  }

  private requireBot(): void {
    if (this.bot === null || !this.connected) throw Errors.driverNotConnected(this.name);
  }

  private emit<K extends keyof DriverEventMap & string>(event: K, payload: DriverEventMap[K]): void {
    for (const h of this.handlers.get(event) ?? []) {
      (h as (p: DriverEventMap[K]) => void)(payload);
    }
  }

  private vec3(): any {
    // mineflayer re-exports vec3 constructors on its bot for position math
    return Vec3Lazy.get();
  }
}

let cachedVec3: any = null;
const Vec3Lazy = {
  get(): any {
    if (cachedVec3 !== null) return cachedVec3;
    // vec3 module ships its own types and default constructor
    return cachedVec3;
  }
};

// Loaded lazily at connect time and cached module-wide.
export async function primeVec3(): Promise<void> {
  const mod: any = await import('vec3');
  cachedVec3 = mod.default ?? mod;
}

/** DriverFactory for @botpex/sdk's `runtime: 'mineflayer'` resolution. */
export function createMineflayerDriver(): MineflayerDriver {
  void primeVec3();
  return new MineflayerDriver();
}
