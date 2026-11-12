import {
  type BotFacade,
  type Brain,
  type BrainContext,
  type Decision,
  type DriverOptions,
  type DriverFactory,
  type FeatureKey,
  type KernelEventMap,
  type LifecyclePhase,
  type LogLevel,
  type RuntimeId,
  type StateMachineSpec,
  type CapabilityMap,
  Errors
} from '@botpex/api';
import { BotKernel, RuleBrain, createConsoleLogger, type KernelConfig } from '@botpex/kernel';
import type { Logger } from '@botpex/api';
import type { BehaviourRegistration } from './define.js';

export interface CreateBotConfig {
  botId?: string;
  /** Builtin id ("mock" | "native" | "mineflayer"), a DriverFactory, or an adapter spec. */
  runtime: RuntimeId | DriverFactory | { adapter: RuntimeId; options?: Record<string, unknown> };
  /** Options forwarded to driver.connect(). */
  driver: DriverOptions;
  kernel?: Omit<KernelConfig, 'botId' | 'log'>;
  behaviours?: BehaviourRegistration[];
  /** Brain to install; a plain function becomes a single-rule RuleBrain. */
  brain?: Brain | ((ctx: import('@botpex/api').BrainContext) => Decision | null | Promise<Decision | null>);
  fsm?: StateMachineSpec;
  logLevel?: LogLevel;
  log?: Logger;
  /** Fail fast unless the runtime supports all of these (default: perception + self). */
  requiredFeatures?: readonly FeatureKey[];
}

export interface BotHandle {
  readonly kernel: BotKernel;
  readonly bot: BotFacade;
  readonly botId: string;
  get phase(): LifecyclePhase;
  get capabilities(): CapabilityMap;
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  on<K extends keyof KernelEventMap & string>(
    event: K,
    handler: (payload: KernelEventMap[K]) => void
  ): () => void;
}

/**
 * Create a bot on any runtime. Resolution order: DriverFactory → adapter
 * object → builtin id. Builtin "native"/"mineflayer" are optional peer
 * dependencies and produce actionable errors when missing.
 */
export async function createBot(config: CreateBotConfig): Promise<BotHandle> {
  const log = config.log ?? createConsoleLogger(`botpex.${config.botId ?? 'bot'}`, config.logLevel ?? 'info');
  const driver = await resolveRuntime(config.runtime, log);
  const kernel = new BotKernel(driver, {
    botId: config.botId,
    log,
    ...(config.kernel ?? {}),
    requiredFeatures: config.requiredFeatures ?? ['perception', 'selfMonitoring']
  });

  for (const behaviour of config.behaviours ?? []) {
    kernel.behaviour.registerTree(behaviour.name, behaviour.node, behaviour.priority);
  }
  if (config.fsm) kernel.behaviour.setFSM(config.fsm);
  if (config.brain) {
    const specified = config.brain;
    const brain: Brain =
      typeof specified === 'function'
        ? new RuleBrain('inline-brain', [
            { name: 'inline', when: () => true, then: (ctx: BrainContext) => specified(ctx) as Decision | null }
          ])
        : specified;
    kernel.intelligence.setBrain(brain);
  }

  const handle: BotHandle = {
    kernel,
    bot: kernel.facade,
    botId: kernel.botId,
    get phase() {
      return kernel.phase;
    },
    get capabilities() {
      return kernel.caps.declared;
    },
    start: () => kernel.start(config.driver),
    stop: (reason?: string) => kernel.stop(reason),
    on: (event, handler) => kernel.bus.on(event, handler)
  };
  return handle;
}

async function resolveRuntime(
  runtime: CreateBotConfig['runtime'],
  log: Logger
): Promise<import('@botpex/api').IDriver> {
  if (typeof runtime === 'function') {
    return await runtime();
  }
  const id = typeof runtime === 'string' ? runtime : runtime.adapter;
  const extra = typeof runtime === 'object' && 'options' in runtime ? runtime.options : undefined;

  switch (id) {
    case 'mock': {
      const mod = await importOrNull('@botpex/testing');
      if (mod === null) throw missingRuntime('mock', '@botpex/testing');
      const factory = mod as { createMockDriver?: (o?: unknown) => Promise<import('@botpex/api').IDriver> | import('@botpex/api').IDriver };
      if (typeof factory.createMockDriver !== 'function') {
        throw Errors.configInvalid('runtime', '@botpex/testing does not export createMockDriver()');
      }
      return await factory.createMockDriver(extra);
    }
    case 'native': {
      const mod = await importOrNull('@botpex/runtime-native');
      if (mod === null) throw missingRuntime('native', '@botpex/runtime-native');
      const factory = mod as { createNativeDriver?: (o?: unknown) => Promise<import('@botpex/api').IDriver> | import('@botpex/api').IDriver };
      if (typeof factory.createNativeDriver !== 'function') {
        throw Errors.configInvalid('runtime', '@botpex/runtime-native does not export createNativeDriver()');
      }
      return await factory.createNativeDriver(extra);
    }
    case 'mineflayer': {
      const mod = await importOrNull('@botpex/runtime-mineflayer');
      if (mod === null) throw missingRuntime('mineflayer', '@botpex/runtime-mineflayer');
      const factory = mod as { createMineflayerDriver?: (o?: unknown) => Promise<import('@botpex/api').IDriver> | import('@botpex/api').IDriver };
      if (typeof factory.createMineflayerDriver !== 'function') {
        throw Errors.configInvalid('runtime', '@botpex/runtime-mineflayer does not export createMineflayerDriver()');
      }
      return await factory.createMineflayerDriver(extra);
    }
    default:
      log.warn('unknown runtime id; trying registered adapters', { runtime: id });
      throw Errors.runtimeNotFound(id, ['mock', 'native', 'mineflayer']);
  }
}

async function importOrNull(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(/* webpackIgnore: true */ specifier)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function missingRuntime(runtime: string, pkg: string): Error {
  return Errors.runtimeNotFound(runtime, ['mock (needs ' + pkg + ')']);
}
