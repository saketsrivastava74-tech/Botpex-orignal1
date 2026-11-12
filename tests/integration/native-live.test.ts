/**
 * Integration with a live Minecraft server (opt-in).
 *
 * Set BOTPEX_MC_HOST (+ optional BOTPEX_MC_PORT / BOTPEX_MC_USER / BOTPEX_MC_VERSION)
 * to run against a real server, e.g. a local flying-squid or vanilla server:
 *
 *   BOTPEX_MC_HOST=localhost npx vitest run tests/integration
 *
 * Skipped (not failed) when the env var is absent — CI runs unit + contract
 * suites without a server.
 */
import { describe, it, expect } from 'vitest';
import { NativeDriver } from '@botpex/runtime-native';
import { runDriverContract } from '@botpex/testing';
import { blockPos } from '@botpex/api';

const host = process.env.BOTPEX_MC_HOST;
const d = describe.skipIf(!host);

d('native runtime against a live server', () => {
  it(
    'passes the driver contract suite',
    async () => {
      const driver = new NativeDriver({ connectTimeoutMs: 30_000 });
      const report = await runDriverContract(driver, {
        connectOptions: {
          host: host!,
          port: process.env.BOTPEX_MC_PORT !== undefined ? Number(process.env.BOTPEX_MC_PORT) : undefined,
          username: process.env.BOTPEX_MC_USER ?? 'BotpexContract',
          version: process.env.BOTPEX_MC_VERSION
        },
        advance: undefined
      });
      console.log(report.checks.map((c) => `${c.status.toUpperCase().padEnd(4)} ${c.name}`).join('\n'));
      expect(report.failed).toBe(0);
    },
    120_000
  );

  it('reads loaded world blocks', async () => {
    const driver = new NativeDriver();
    await driver.connect({
      host: host!,
      port: process.env.BOTPEX_MC_PORT !== undefined ? Number(process.env.BOTPEX_MC_PORT) : undefined,
      username: process.env.BOTPEX_MC_USER ?? 'BotpexWorld',
      version: process.env.BOTPEX_MC_VERSION
    });
    // wait a moment for chunks to stream in
    await new Promise((r) => setTimeout(r, 3000));
    const pos = blockPos(driver.self().position);
    const block = driver.world().getBlock({ x: pos.x, y: pos.y - 2, z: pos.z });
    expect(block).not.toBeNull();
    await driver.disconnect('test done');
  }, 60_000);
});
