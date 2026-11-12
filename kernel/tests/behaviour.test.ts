import { describe, it, expect } from 'vitest';
import {
  bt,
  StateMachine,
  SimpleBlackboard,
  type BTNode,
  type BTContext
} from '../src/index.js';
import type { BotFacade } from '@botpex/api';

const noopFacade = {
  log: { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } }
} as unknown as BotFacade;

function ctx(over: Partial<BTContext> = {}): BTContext {
  return {
    bot: noopFacade,
    blackboard: new SimpleBlackboard(),
    now: over.now ?? 0,
    dt: over.dt ?? 50,
    ...over
  };
}

function statusNode(status: () => 'success' | 'failure' | 'running'): BTNode {
  let calls = 0;
  return {
    id: 'stub',
    tick() {
      calls++;
      return status();
    },
    reset() {
      calls = 0;
    },
    get calls() {
      return calls;
    }
  };
}

describe('Behaviour trees', () => {
  it('sequence succeeds only when all children succeed', () => {
    const node = bt.sequence('s', bt.condition('c1', () => true), bt.condition('c2', () => true));
    expect(node.tick(ctx())).toBe('success');
    const failing = bt.sequence('s2', bt.condition('c', () => false), bt.condition('never', () => true));
    expect(failing.tick(ctx())).toBe('failure');
  });

  it('selector returns first success', () => {
    const node = bt.selector('sel', bt.condition('no', () => false), bt.condition('yes', () => true));
    expect(node.tick(ctx())).toBe('success');
  });

  it('selector resumes at running child', () => {
    let tickCount = 0;
    const runningThenSuccess: BTNode = {
      id: 'r',
      tick() {
        tickCount++;
        return tickCount >= 3 ? 'success' : 'running';
      },
      reset() {
        tickCount = 0;
      }
    };
    const node = bt.selector('sel', runningThenSuccess);
    expect(node.tick(ctx())).toBe('running');
    expect(node.tick(ctx())).toBe('running');
    expect(node.tick(ctx())).toBe('success');
    // after success, a new evaluation restarts the child from scratch
    expect(node.tick(ctx())).toBe('running');
    expect(tickCount).toBe(1);
  });

  it('parallel respects success/failure policies', () => {
    const all = bt.parallel('p', { success: 'all', failure: 'all' }, bt.condition('a', () => true), bt.condition('b', () => false));
    expect(all.tick(ctx())).toBe('running');
    const anyFail = bt.parallel('p2', {}, bt.condition('a', () => true), bt.condition('b', () => false));
    expect(anyFail.tick(ctx())).toBe('failure');
    const quorum = bt.parallel('p3', { success: 1, failure: 2 }, bt.condition('a', () => true), bt.condition('b', () => false));
    expect(quorum.tick(ctx())).toBe('success');
  });

  it('inverter flips success/failure', () => {
    const node = bt.inverter('i', bt.condition('c', () => false));
    expect(node.tick(ctx())).toBe('success');
  });

  it('repeat succeeds after N completions', () => {
    let n = 0;
    const counter = bt.action('count', () => {
      n++;
    });
    const node = bt.repeat('rep', counter, 3);
    expect(node.tick(ctx())).toBe('running');
    expect(node.tick(ctx())).toBe('running');
    expect(node.tick(ctx())).toBe('success');
    expect(n).toBe(3);
  });

  it('timeout fails a long-running child', () => {
    const forever = statusNode(() => 'running');
    const node = bt.timeout('to', forever, 100);
    expect(node.tick(ctx({ now: 0 }))).toBe('running');
    expect(node.tick(ctx({ now: 50 }))).toBe('running');
    expect(node.tick(ctx({ now: 200 }))).toBe('failure');
  });

  it('action handles async results', async () => {
    let resolved = false;
    const node = bt.action('a', async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
      return 'success' as const;
    });
    expect(node.tick(ctx())).toBe('running');
    await new Promise((r) => setTimeout(r, 20));
    expect(node.tick(ctx())).toBe('success');
    expect(resolved).toBe(true);
  });

  it('wait succeeds after the duration', () => {
    const node = bt.wait('w', 100);
    expect(node.tick(ctx({ now: 0 }))).toBe('running');
    expect(node.tick(ctx({ now: 60 }))).toBe('running');
    expect(node.tick(ctx({ now: 150 }))).toBe('success');
  });

  it('once fires a single time', () => {
    const node = bt.once('o', bt.condition('c', () => true));
    expect(node.tick(ctx())).toBe('success');
    expect(node.tick(ctx())).toBe('failure');
  });

  it('blackboard stores values', () => {
    const bb = new SimpleBlackboard();
    expect(bb.get('k')).toBeUndefined();
    bb.set('k', 42);
    expect(bb.get('k')).toBe(42);
    expect(bb.get('k', 0)).toBe(42);
    expect(bb.get('missing', 7)).toBe(7);
    expect(bb.has('k')).toBe(true);
    bb.remove('k');
    expect(bb.has('k')).toBe(false);
  });
});

describe('StateMachine', () => {
  const busStub = { emit() {}, on() { return () => {}; } } as never;

  it('transitions on guards and fires enter/update', () => {
    const entered: string[] = [];
    const fsm = new StateMachine(
      {
        initial: 'idle',
        states: [
          { name: 'idle', enter: () => entered.push('idle') },
          { name: 'combat', enter: () => entered.push('combat') }
        ],
        transitions: [{ from: 'idle', to: 'combat', when: () => true }]
      },
      { bus: busStub, botId: 'test' }
    );
    const status = fsm.update(ctx());
    expect(fsm.current).toBe('combat');
    expect(entered).toEqual(['idle', 'combat']);
    expect(status).toBe('running');
  });

  it('supports wildcard transitions (evaluated on the next update)', () => {
    const fsm = new StateMachine({
      initial: 'a',
      states: [
        { name: 'a', update: () => 'failure' },
        { name: 'b' },
        { name: 'panic' }
      ],
      transitions: [
        { from: 'a', to: 'b' },
        { from: '*', to: 'panic', when: () => true }
      ]
    });
    fsm.update(ctx());
    expect(fsm.current).toBe('b'); // state transition wins this tick
    fsm.update(ctx());
    expect(fsm.current).toBe('panic'); // wildcard fires next evaluation
  });

  it('throws on unknown target state', () => {
    const fsm = new StateMachine({
      initial: 'a',
      states: [{ name: 'a' }],
      transitions: []
    });
    expect(() => fsm.forceState('nope', ctx())).toThrowError(/not defined/);
  });
});
