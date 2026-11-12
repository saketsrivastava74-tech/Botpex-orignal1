import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/bus.js';
import { Errors } from '@botpex/api';

describe('EventBus', () => {
  it('dispatches to handlers in priority order (higher first)', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on('bot:tick', () => calls.push('low'), { priority: 0 });
    bus.on('bot:tick', () => calls.push('high'), { priority: 10 });
    bus.on('bot:tick', () => calls.push('mid'), { priority: 5 });
    bus.emit('bot:tick', { tick: 1, dtMs: 50 });
    expect(calls).toEqual(['high', 'mid', 'low']);
  });

  it('supports once handlers', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('self:health', fn);
    bus.emit('self:health', { health: 10, prev: null });
    bus.emit('self:health', { health: 9, prev: 10 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('self:health')).toBe(0);
  });

  it('off() removes a handler', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('bot:tick', fn);
    off();
    bus.emit('bot:tick', { tick: 1, dtMs: 50 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('isolates handler errors', () => {
    const bus = new EventBus();
    const errors: unknown[] = [];
    bus.onHandlerError((_scope, e) => errors.push(e));
    const after = vi.fn();
    bus.on('bot:tick', () => {
      throw new Error('boom');
    });
    bus.on('bot:tick', after);
    bus.emit('bot:tick', { tick: 1, dtMs: 50 });
    expect(errors).toHaveLength(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('waitFor resolves on matching payload and rejects on timeout', async () => {
    const bus = new EventBus();
    const p = bus.waitFor('navigation:arrived', (e) => e.elapsedMs > 0, 500);
    setTimeout(() => bus.emit('navigation:arrived', { goal: { x: 0, y: 0, z: 0 }, elapsedMs: 5 }), 5);
    await expect(p).resolves.toMatchObject({ elapsedMs: 5 });

    const p2 = bus.waitFor('navigation:arrived', undefined, 20);
    await expect(p2).rejects.toMatchObject({ code: 'BOTPEX/TIMEOUT' });
  });

  it('timeout error carries hint', async () => {
    const err = Errors.timeout('x', 10);
    expect(err.code).toBe('BOTPEX/TIMEOUT');
    expect(err.hint).toBeDefined();
  });
});
