import {
  type Brain,
  type BrainContext,
  type Decision,
  type IEventBus,
  type Logger,
  type BotFacade,
  type Blackboard,
  type BTContext,
  type BTStatus,
  type SelfState,
  type EntitySnapshot
} from '@botpex/api';

export interface BrainRule {
  /** Human-readable name (logged with decisions). */
  name: string;
  when: (ctx: BrainContext) => boolean | Promise<boolean>;
  then: Decision | ((ctx: BrainContext) => Decision | null);
}

/**
 * RuleBrain — the kernel's rule-based decision system: ordered rules,
 * first match wins. Pure, inspectable, no network. Compose with custom
 * brains or delegate to an external AI model behind the Brain port.
 */
export class RuleBrain implements Brain {
  readonly name: string;
  private readonly entries: BrainRule[] = [];

  constructor(name = 'rule-brain', rules: BrainRule[] = []) {
    this.name = name;
    this.entries.push(...rules);
  }

  addRule(rule: BrainRule): this {
    this.entries.push(rule);
    return this;
  }

  get ruleCount(): number {
    return this.entries.length;
  }

  async decide(ctx: BrainContext): Promise<Decision | null> {
    for (const rule of this.entries) {
      let matched = false;
      try {
        matched = await rule.when(ctx);
      } catch (error) {
        ctx.bot.log.warn('rule predicate failed', { rule: rule.name, error: String(error) });
        continue;
      }
      if (!matched) continue;
      if (typeof rule.then === 'function') return rule.then(ctx);
      return rule.then;
    }
    return null;
  }
}

export interface IntelligenceConfig {
  /** Skip decide() when the previous decision is still "long-running"? (default false) */
  singleDecisionPerTick?: boolean;
}

/**
 * Intelligence System — consults the installed Brain every tick, emits the
 * decision on the bus (inspectability) and executes it through the facade.
 * Kernels ship RuleBrain; anything implementing Brain works, including
 * externally hosted AI models (no mandatory paid APIs — ADR: Intelligence).
 */
export class IntelligenceSystem {
  private brain: Brain | null = null;
  private initialized = false;
  private busy = false;
  private waitUntil = 0;

  constructor(
    private readonly bus: IEventBus,
    private readonly log: Logger
  ) {}

  setBrain(brain: Brain | null): void {
    this.brain = brain;
    this.initialized = brain === null;
    this.busy = false;
    this.waitUntil = 0;
  }

  get currentBrain(): string | null {
    return this.brain?.name ?? null;
  }

  async tick(params: {
    bot: BotFacade;
    blackboard: Blackboard;
    self: SelfState;
    entities: readonly EntitySnapshot[];
    tick: number;
    now: number;
  }): Promise<void> {
    if (this.brain === null || this.busy) return;
    if (params.now < this.waitUntil) return;

    const ctx: BrainContext = {
      bot: params.bot,
      blackboard: params.blackboard,
      self: params.self,
      entities: params.entities,
      tick: params.tick
    };

    if (!this.initialized) {
      this.initialized = true;
      try {
        await this.brain.init?.(ctx);
      } catch (error) {
        this.log.warn('brain init failed', { brain: this.brain.name, error: String(error) });
      }
    }

    this.busy = true;
    let decision: Decision | null = null;
    try {
      decision = await this.brain.decide(ctx);
    } catch (error) {
      this.bus.emit('runtime:taskFailed', {
        name: `brain:${this.brain.name}`,
        error: error instanceof Error ? error : new Error(String(error))
      });
    } finally {
      this.busy = false;
    }

    this.bus.emit('intelligence:decision', { brain: this.brain.name, decision });
    if (decision === null) return;

    try {
      await this.execute(decision, params);
    } catch (error) {
      this.bus.emit('runtime:taskFailed', {
        name: `brain:${this.brain.name}:execute`,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private async execute(
    decision: Decision,
    params: { bot: BotFacade; blackboard: Blackboard; now: number; tick: number }
  ): Promise<void> {
    switch (decision.kind) {
      case 'goto':
        void params.bot.moveTo(decision.goal, decision.options).catch(() => {});
        break;
      case 'stopMove':
        params.bot.stopMove();
        break;
      case 'attack':
        await params.bot.attack(decision.targetId);
        break;
      case 'move': {
        const { controls, durationMs } = decision;
        await params.bot.applyControls(controls);
        if (durationMs > 0) {
          const until = params.now + durationMs;
          const stop = (): void => {
            if (Date.now() >= until) {
              params.bot.stopMove();
              params.bot.events.off('bot:tick', stop);
            }
          };
          params.bot.events.on('bot:tick', stop);
        }
        break;
      }
      case 'lookAt':
        await params.bot.lookAt(decision.position);
        break;
      case 'look':
        await params.bot.look(decision.yaw, decision.pitch);
        break;
      case 'selectHotbar':
        await params.bot.selectHotbar(decision.slot);
        break;
      case 'useHeldItem':
        await params.bot.useHeldItem();
        break;
      case 'chat':
        await params.bot.sendChat(decision.message);
        break;
      case 'wait':
        this.waitUntil = params.now + decision.durationMs;
        break;
      case 'custom': {
        const ctx: BTContext = {
          bot: params.bot,
          blackboard: params.blackboard,
          now: params.now,
          dt: 50
        };
        const status: BTStatus | void = await decision.run(ctx);
        void status;
        break;
      }
    }
  }
}
