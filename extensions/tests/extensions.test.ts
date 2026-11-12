import { describe, it, expect } from 'vitest';
import { ExtensionHost, validateExtensionManifest } from '../src/index.js';
import { createTestBot, type TestBot } from '@botpex/testing';
import type { BotFacade } from '@botpex/api';

const manifest = {
  spec: '@botpex/extension/v1',
  id: 'guard-helper',
  name: 'Guard Helper',
  version: '1.0.0',
  api: '^0.1.0',
  entry: './index.js',
  license: 'MIT',
  permissions: ['world:read', 'events:subscribe']
};

describe('validateExtensionManifest', () => {
  it('accepts valid manifest', () => {
    expect(validateExtensionManifest(manifest).ok).toBe(true);
  });
  it('rejects unknown permissions', () => {
    const res = validateExtensionManifest({ ...manifest, permissions: ['kernel:root'] });
    expect(res.ok).toBe(false);
  });
});

describe('ExtensionHost', () => {
  let bot: TestBot;

  it('denies unpermitted facade calls with PERMISSION_DENIED', async () => {
    bot = await createTestBot({ botId: 'ext-test' });
    const host = new ExtensionHost(bot.bot, bot.kernel.bus, bot.kernel.log);
    let captured: BotFacade | null = null;
    host.register(manifest, (ctx) => {
      captured = ctx.bot;
    });
    await host.activate('guard-helper');
    expect(captured).not.toBeNull();
    // world:read granted
    expect(captured!.self().position.x).toBeDefined();
    // movement:control NOT granted
    await expect(captured!.moveTo({ x: 0, y: 9, z: 0 })).rejects.toMatchObject({
      code: 'BOTPEX/EXT/PERMISSION_DENIED'
    });
    // events:subscribe granted
    const off = captured!.on('bot:tick', () => {});
    expect(typeof off).toBe('function');
    await bot.stop();
  });

  it('enforces API ranges', async () => {
    const b = await createTestBot({ botId: 'ext-test-2' });
    const host = new ExtensionHost(b.bot, b.kernel.bus, b.kernel.log);
    expect(() => host.register({ ...manifest, api: '^9.0.0' }, () => {})).toThrowError(/API/);
    await b.stop();
  });
});
