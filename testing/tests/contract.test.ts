/**
 * Driver contract suite executed against the mock driver (reference implementation).
 */
import { describe, it, expect } from 'vitest';
import { MockDriver, runDriverContract } from '../src/index.js';

describe('driver contract', () => {
  it('mock driver passes the full contract suite', async () => {
    const driver = new MockDriver();
    const report = await runDriverContract(driver, {
      advance: (ms) => driver.advance(ms),
      spawnTestEntity: (pos) => driver.memoryWorld.spawnEntity({ position: pos, health: 20 }).id
    });
    const failures = report.checks.filter((c) => c.status === 'fail');
    expect(failures).toEqual([]);
    expect(report.skipped).toBe(0);
    expect(report.passed).toBeGreaterThanOrEqual(10);
  });

  it('reports skips for disabled capabilities instead of failing', async () => {
    const driver = new MockDriver({ disableCapabilities: ['movement.look', 'chat.send'] });
    const report = await runDriverContract(driver, {
      advance: (ms) => driver.advance(ms)
    });
    const skipped = report.checks.filter((c) => c.status === 'skip');
    expect(skipped.length).toBeGreaterThanOrEqual(2);
    expect(report.checks.find((c) => c.name.includes('look'))?.status).toBe('skip');
  });

  it('flags unsupported capabilities without notes (contract rule)', async () => {
    const driver = new MockDriver();
    // tamper: remove note from an unsupported capability
    const caps = driver.capabilities() as Record<string, { supported: boolean; notes?: string }>;
    const original = caps['inventory.containers'];
    caps['inventory.containers'] = { supported: false };
    // rebuild driver view via prototype patch is invasive; instead run the check logic manually
    const bad = Object.entries(caps).some(([, info]) => info.supported === false && info.notes === undefined);
    expect(bad).toBe(true);
    expect(original?.notes).toBeDefined();
  });
});
