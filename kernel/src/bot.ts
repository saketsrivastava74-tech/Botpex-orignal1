import {
  type BotFacade,
  type BTContext,
  type DriverOptions,
  type FeatureKey,
  type KernelEventMap,
  type Logger,
  type LogLevel,
  type Vec3,
  type BlockPos,
  type ControlSet,
  type CapabilityMap,
  type SelfState,
  type EntitySnapshot,
  type BlockInfo,
  type MoveOptions,
  type LifecyclePhase,
  type Blackboard,
  BotpexError,
  Errors
} from '@botpex/api';
import { EventBus } from './bus.js';
import { CapabilityRegistry } from './capabilities.js';
import { EntityRegistry } from './entity.js';
import { WorldModel } from './world.js';
import { PerceptionSystem } from './perception.js';
import { MovementSystem } from './movement.js';
import { NavigationSystem } from './navigation/navigation.js';
import { CombatSystem } from './combat.js';
import { InventorySystem } from './inventory.js';
import { BehaviourSystem } from './behaviour/system.js';
import { SimpleBlackboard } from './behaviour/blackboard.js';
import { IntelligenceSystem } from './intelligence.js';
import { RuntimeSystem, Scheduler } from './runtime.js';
import { createConsoleLogger } from './util/logger.js';

export interface KernelConfig {
  botId?: string;
  log?: Logger;
  logLevel?: LogLevel;
  tickIntervalMs?: number;
  /** Features that must be supported by the driver or start() fails fast. */
  requiredFeatures?: readonly FeatureKey[];
  navigation?: import('./navigation/navigation.js').NavigationConfig;
  combat?: import('./combat.js').CombatConfig;
  inventory?: import('./inventory.js').InventoryConfig;
  perception?: import('./perception.js').PerceptionOptions;
  entity?: import('./entity.js').EntityRegistryOptions;
  world?: import('./world.js').WorldModelOptions;
}

/**
 * The BotKernel wires the ten kernel systems around a connected driver and
 * owns the lifecycle. One kernel = one bot; use @botpex/sdk's BotManager for
 * many.
 */
export class BotKernel {
  readonly botId: string;
  readonly driver: import('@botpex/api').IDriver;
  readonly bus: EventBus;
  readonly caps: CapabilityRegistry;
  readonly entities: EntityRegistry;
  readonly world: WorldModel;
  readonly perception: PerceptionSystem;
  readonly movement: MovementSystem;
  readonly navigation: NavigationSystem;
  readonly combat: CombatSystem;
  readonly inventory: InventorySystem;
  readonly behaviour: BehaviourSystem;
  readonly intelligence: IntelligenceSystem;
  readonly scheduler: Scheduler;
  readonly runtime: RuntimeSystem;
  readonly facade: BotFacade;
  readonly blackboard: Blackboard;
  readonly log: Logger;

  private readonly requiredFeatures: readonly FeatureKey[];
  private perceptionAttached = false;

  constructor(driver: import('@botpex/api').IDriver, config: KernelConfig = {}) {
    this.driver = driver;
    this.botId = config.botId ?? driver.name;
    this.log = config.log ?? createConsoleLogger(`botpex.${this.botId}`, config.logLevel ?? 'info');
    this.bus = new EventBus();
    this.bus.onHandlerError((scope, error) => {
      this.log.error('event handler error', { scope, error: String(error) });
    });
    this.caps = new CapabilityRegistry(driver.capabilities(), driver.name);
    this.entities = new EntityRegistry(config.entity);
    this.world = new WorldModel(driver.world(), this.entities, config.world);
    this.perception = new PerceptionSystem(driver, this.entities, this.world, this.bus, this.log, config.perception);
    this.movement = new MovementSystem(driver, this.caps, this.bus, this.log);
    this.navigation = new NavigationSystem(this.world, this.movement, () => driver.self(), this.bus, this.log, config.navigation);
    this.combat = new CombatSystem(this.world, driver, this.caps, () => driver.self(), this.bus, this.log, config.combat);
    this.inventory = new InventorySystem(driver, this.caps, this.bus, this.log, config.inventory);
    this.behaviour = new BehaviourSystem(this.bus, this.botId);
    this.blackboard = new SimpleBlackboard();
    this.intelligence = new IntelligenceSystem(this.bus, this.log);
    this.scheduler = new Scheduler(this.bus, this.log);
    this.runtime = new RuntimeSystem(this.bus, this.log, this.scheduler, {
      tickIntervalMs: config.tickIntervalMs
    });
    this.requiredFeatures = config.requiredFeatures ?? [];
    this.facade = new KernelFacade(this);
  }

  get phase(): LifecyclePhase {
    return this.runtime.currentPhase;
  }

  /** Connect (unless already) and run the lifecycle to "active". */
  async start(options: DriverOptions): Promise<void> {
    this.runtime.transition('connecting');
    try {
      if (!this.driver.connected) {
        await this.driver.connect(options);
      }
      this.runtime.transition('spawning');

      if (!this.perceptionAttached) {
        this.perception.attach();
        this.perceptionAttached = true;
      }
      this.world.invalidateAll();
      const now = Date.now();
      for (const snap of this.driver.world().entities()) {
        this.perception.ingest({ ...snap, lastSeenMs: now });
      }
      this.inventory.invalidate();
      this.inventory.refresh(now);
      this.movement.resetTracking();

      const missing = this.caps.missingForFeatures(this.requiredFeatures);
      if (missing.length > 0) {
        this.bus.emit('bot:capabilityReport', { unsupported: missing });
        const detail = missing.map((m) => `${m.feature}: ${m.missing.join(', ')}`).join('; ');
        throw new BotpexError(
          'BOTPEX/CAPABILITY/UNSUPPORTED',
          `Runtime "${this.driver.name}" cannot satisfy required features: ${detail}`,
          {
            details: { missing },
            hint: 'Pick another runtime or drop the feature from requiredFeatures. See documentation/CAPABILITIES.md.'
          }
        );
      }

      this.runtime.transition('active');
      this.runtime.startTickLoop((t, dt, n) => this.onTick(t, dt, n));
    } catch (error) {
      if (['connecting', 'spawning'].includes(this.runtime.currentPhase)) {
        try {
          this.runtime.transition('failed');
        } catch {
          /* already failed */
        }
      }
      throw error;
    }
  }

  async stop(reason = 'stopped by caller'): Promise<void> {
    const phase = this.runtime.currentPhase;
    if (!['active', 'paused', 'connecting', 'spawning'].includes(phase)) {
      if (phase === 'stopping') return;
      throw Errors.notActive(phase, 'stop()');
    }
    this.runtime.transition('stopping');
    this.navigation.stop();
    try {
      await this.movement.stopAll();
    } catch {
      /* driver may already be gone */
    }
    this.behaviour.reset();
    this.runtime.stopTickLoop();
    try {
      if (this.driver.connected) await this.driver.disconnect(reason);
    } catch (error) {
      this.log.warn('driver disconnect failed', { error: String(error) });
    }
    this.runtime.transition('stopped');
  }

  pause(): void {
    this.runtime.transition('paused');
  }

  resume(): void {
    this.runtime.transition('active');
  }

  /** Core tick body; also used by runtime.manualTick in tests. */
  async onTick(now: number, dtMs: number, tick: number): Promise<void> {
    this.bus.emit('bot:tick', { tick, dtMs });
    this.perception.tick(now);
    this.inventory.refresh(now);

    const ctx: BTContext = { bot: this.facade, blackboard: this.blackboard, now, dt: dtMs };
    this.behaviour.tick(ctx);

    await this.combat.tick(now);
    await this.navigation.tick(now);
    await this.intelligence.tick({
      bot: this.facade,
      blackboard: this.blackboard,
      self: this.driver.self(),
      entities: this.world.entities(),
      tick,
      now
    });
    await this.runtime.scheduler.tick(now);
  }
}

class KernelFacade implements BotFacade {
  constructor(private readonly kernel: BotKernel) {}

  get botId(): string {
    return this.kernel.botId;
  }

  get phase(): LifecyclePhase {
    return this.kernel.phase;
  }

  get capabilities(): CapabilityMap {
    return this.kernel.caps.declared;
  }

  get events(): import('@botpex/api').IEventBus {
    return this.kernel.bus;
  }

  get blackboard(): Blackboard {
    return this.kernel.blackboard;
  }

  get log(): Logger {
    return this.kernel.log;
  }

  self(): SelfState {
    return this.kernel.driver.self();
  }

  entities(): EntitySnapshot[] {
    return this.kernel.world.entities();
  }

  entity(id: number): EntitySnapshot | null {
    return this.kernel.world.entity(id);
  }

  blockAt(pos: BlockPos): BlockInfo | null {
    return this.kernel.world.getBlock(pos);
  }

  moveTo(goal: BlockPos, options?: MoveOptions): Promise<void> {
    return this.kernel.navigation.goto(goal, options);
  }

  stopMove(): void {
    this.kernel.navigation.stop();
  }

  async lookAt(position: Vec3): Promise<void> {
    const self = this.self();
    await this.kernel.movement.faceToward(self.position, position);
  }

  async look(yaw: number, pitch: number): Promise<void> {
    await this.kernel.movement.look(yaw, pitch);
  }

  async applyControls(controls: ControlSet): Promise<void> {
    await this.kernel.movement.applyControls(controls);
  }

  async attack(entityId: number): Promise<void> {
    await this.kernel.combat.attack(entityId);
  }

  async selectHotbar(slot: number): Promise<void> {
    await this.kernel.inventory.selectHotbar(slot);
  }

  async useHeldItem(): Promise<void> {
    await this.kernel.inventory.useHeldItem();
  }

  async sendChat(message: string): Promise<void> {
    this.kernel.caps.require('chat.send');
    await this.kernel.driver.sendChat(message);
  }

  now(): number {
    return Date.now();
  }

  on<K extends keyof KernelEventMap & string>(
    event: K,
    handler: (payload: KernelEventMap[K]) => void
  ): () => void {
    return this.kernel.bus.on(event, handler);
  }
}
