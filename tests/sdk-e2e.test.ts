/**
 * E2E: SDK createBot over the mock runtime — behaviours, brain, lifecycle.
 */
import { describe, it, expect } from 'vitest';
import { createBot, defineBehaviour, BotManager } from '@botpex/sdk';
import { bt } from '@botpex/kernel';
import { createMockDriver } from '@botpex/testing';
import { blockPos, distance } from '@botpex/api';

describe('createBot (mock runtime)', () => {
  it('starts, perceives, navigates and stops', async () => {
    const handle = await createBot({
      botId: 'sdk-e2e',
      runtime: createMockDriver,
      driver: { host: 'mock', username: 'E2E' }
    });
    await handle.start();
    expect(handle.phase).toBe('active');
    expect(handle.capabilities['movement.physics']?.supported).toBe(true);

    const arrived = new Promise<void>((resolve) => handle.on('navigation:arrived', () => resolve()));
    await handle.bot.moveTo(blockPos(5, 9, 0), { timeoutMs: 20_000 });
    await arrived;
    const d = distance(handle.bot.self().position, { x: 5.5, y: 9, z: 0.5 });
    expect(d).toBeLessThan(2.0);

    await handle.stop('test done');
    expect(handle.phase).toBe('stopped');
  });

  it('runs behaviours and brains on the tick loop', async () => {
    let actionRuns = 0;
    let decisions = 0;
    const handle = await createBot({
      botId: 'sdk-behav',
      runtime: 'mock',
      driver: { host: 'mock', username: 'Beh' },
      behaviours: [
        defineBehaviour(
          'counter',
          bt.sequence('c', bt.wait('w', 10), bt.action('inc', () => {
            actionRuns++;
          }))
        )
      ],
      brain: () => {
        decisions++;
        return null;
      },
      kernel: { tickIntervalMs: 20 }
    });
    await handle.start();
    (handle.kernel.driver as unknown as { startClock: () => void }).startClock();
    await new Promise((r) => setTimeout(r, 400));
    await handle.stop('done');
    expect(actionRuns).toBeGreaterThan(2);
    expect(decisions).toBeGreaterThan(2);
  });

  it('resolves "native" runtime and fails fast when missing', async () => {
    // native IS installed in this monorepo, so use a bogus runtime id
    await expect(
      createBot({ botId: 'x', runtime: 'does-not-exist' as 'mock', driver: { host: 'x', username: 'x' } })
    ).rejects.toMatchObject({ code: 'BOTPEX/RUNTIME/NOT_FOUND' });
  });

  it('BotManager pools multiple bots', async () => {
    const manager = new BotManager({ staggerMs: 10 });
    const mk = () => ({
      runtime: 'mock' as const,
      driver: { host: 'mock', username: 'Pool' },
      kernel: { tickIntervalMs: 1000 }
    });
    await manager.spawn('bot-1', mk());
    await manager.spawn('bot-2', mk());
    await manager.spawn('bot-3', mk());
    expect(manager.list()).toEqual(['bot-1', 'bot-2', 'bot-3']);
    const statuses = manager.status();
    expect(statuses.every((s) => s.phase === 'active')).toBe(true);
    await manager.stopAll('test done');
    expect(manager.list()).toHaveLength(0);
  });
});
