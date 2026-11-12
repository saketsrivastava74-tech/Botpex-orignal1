import { BotKernel, type KernelConfig } from '@botpex/kernel';
import type { BotFacade } from '@botpex/api';
import { MockDriver } from './mock-driver.js';
import { MemoryWorld } from './memory-world.js';

export interface TestBot {
  kernel: BotKernel;
  driver: MockDriver;
  bot: BotFacade;
  world: MemoryWorld;
  stop(): Promise<void>;
}

export interface CreateTestBotOptions {
  botId?: string;
  username?: string;
  /** Capability keys to disable on the mock driver. */
  disableCapabilities?: readonly string[];
  kernel?: Omit<KernelConfig, 'log' | 'botId'>;
  /** Start the mock physics clock automatically (default false — advance manually). */
  autoClock?: boolean;
}

/**
 * Build a fully started kernel over the mock driver with a memory logger.
 * Tests drive physics with `driver.advance(ms)` and kernel ticks with
 * `advanceTicks(kernel, n)`.
 */
export async function createTestBot(options: CreateTestBotOptions = {}): Promise<TestBot> {
  const driver = new MockDriver({ disableCapabilities: options.disableCapabilities });
  await driver.connect({ host: 'mock', username: options.username ?? 'TestBot' });
  if (options.autoClock) driver.startClock();
  const { MemoryLogger } = await import('@botpex/kernel');
  const kernel = new BotKernel(driver, {
    botId: options.botId ?? 'test-bot',
    log: new MemoryLogger('test'),
    ...options.kernel
  });
  // start() would try to connect again; driver is already connected so this is a no-op connect
  await kernel.start({ host: 'mock', username: options.username ?? 'TestBot' });
  return {
    kernel,
    driver,
    bot: kernel.facade,
    world: driver.memoryWorld,
    async stop() {
      await kernel.stop();
    }
  };
}

/** Drive the kernel tick loop manually (deterministic tests). */
export async function advanceTicks(kernel: BotKernel, count: number, dtMs = 50): Promise<void> {
  for (let i = 0; i < count; i++) {
    await kernel.onTick(Date.now(), dtMs, i + 1);
  }
}

/** Advance both mock physics and the kernel in lock-step. */
export async function simulate(kernel: BotKernel, driver: MockDriver, ms: number, stepMs = 50): Promise<void> {
  const steps = Math.ceil(ms / stepMs);
  for (let i = 0; i < steps; i++) {
    driver.advance(stepMs);
    await kernel.onTick(Date.now(), stepMs, i + 1);
  }
}
