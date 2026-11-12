import type { BotHandle } from './create-bot.js';
import type { CreateBotConfig } from './create-bot.js';
import { createConsoleLogger } from '@botpex/kernel';

export interface BotManagerOptions {
  /** Delay between bot startups to spread spawn bursts (default 150 ms). */
  staggerMs?: number;
  log?: ReturnType<typeof createConsoleLogger>;
}

export interface BotStatus {
  botId: string;
  phase: string;
  navigating: boolean;
  engaged: boolean;
}

/**
 * BotManager — "One Kernel. Unlimited Bots."
 * Pools many bot instances in one process with staggered startup and
 * aggregate status. Scale out further by running multiple processes
 * (see documentation/PERFORMANCE.md).
 */
export class BotManager {
  private readonly bots = new Map<string, BotHandle>();
  private readonly staggerMs: number;

  constructor(options: BotManagerOptions = {}) {
    this.staggerMs = options.staggerMs ?? 150;
  }

  /** Register (and start) a bot from a config factory. */
  async spawn(botId: string, config: Omit<CreateBotConfig, 'botId'>): Promise<BotHandle> {
    if (this.bots.has(botId)) throw new Error(`bot "${botId}" already exists in this manager`);
    const handle = await import('./create-bot.js').then((m) => m.createBot({ ...config, botId }));
    this.bots.set(botId, handle);
    await handle.start();
    return handle;
  }

  /** Fire-and-forget staggered spawn for large pools. */
  spawnStaggered(botId: string, config: Omit<CreateBotConfig, 'botId'>): Promise<BotHandle> {
    const delay = (this.bots.size % 50) * this.staggerMs;
    return new Promise<BotHandle>((resolve, reject) => {
      setTimeout(() => {
        this.spawn(botId, config).then(resolve, reject);
      }, delay);
    });
  }

  get(botId: string): BotHandle | undefined {
    return this.bots.get(botId);
  }

  list(): string[] {
    return [...this.bots.keys()];
  }

  status(): BotStatus[] {
    return [...this.bots.values()].map((h) => ({
      botId: h.botId,
      phase: h.phase,
      navigating: h.kernel.navigation.isNavigating,
      engaged: h.kernel.combat.engagedTargetId !== null
    }));
  }

  async stopAll(reason = 'manager stop'): Promise<void> {
    const errors: unknown[] = [];
    for (const handle of this.bots.values()) {
      try {
        await handle.stop(reason);
      } catch (error) {
        errors.push(error);
      }
    }
    this.bots.clear();
    if (errors.length > 0) {
      throw new Error(`stopAll encountered ${errors.length} error(s): ${String(errors[0])}`);
    }
  }
}
