import { type BTContext, type BTNode, type BTStatus } from '@botpex/api';

/**
 * Behaviour tree node library (Behaviour System).
 *
 * Conventions:
 * - `tick` is synchronous; async work is modelled by nodes returning
 *   'running' until their internal promise settles.
 * - Nodes must be resettable so trees can be re-entered cleanly.
 */

let nextNodeId = 0;
function nodeId(prefix: string): string {
  nextNodeId += 1;
  return `${prefix}#${nextNodeId}`;
}

/** Runs children in order; succeeds when all succeed. Remembers the running child. */
export function sequence(id?: string, ...children: BTNode[]): BTNode {
  let cursor = 0;
  return {
    id: id ?? nodeId('seq'),
    tick(ctx) {
      for (; cursor < children.length; cursor++) {
        const child = children[cursor];
        if (!child) return 'failure';
        const status = child.tick(ctx);
        if (status === 'running') return 'running';
        if (status === 'failure') {
          resetFrom(children, 0);
          cursor = 0;
          return 'failure';
        }
      }
      const done = cursor >= children.length;
      resetFrom(children, 0);
      cursor = 0;
      return done ? 'success' : 'failure';
    },
    reset() {
      cursor = 0;
      resetFrom(children, 0);
    }
  };
}

/** Runs children in order; succeeds at the first success. */
export function selector(id?: string, ...children: BTNode[]): BTNode {
  let cursor = 0;
  return {
    id: id ?? nodeId('sel'),
    tick(ctx) {
      for (; cursor < children.length; cursor++) {
        const child = children[cursor];
        if (!child) continue;
        const status = child.tick(ctx);
        if (status === 'running') return 'running';
        if (status === 'success') {
          resetFrom(children, 0);
          cursor = 0;
          return 'success';
        }
      }
      resetFrom(children, 0);
      cursor = 0;
      return 'failure';
    },
    reset() {
      cursor = 0;
      resetFrom(children, 0);
    }
  };
}

export interface ParallelPolicy {
  /** Required successes before overall success: number | 'all' (default 'all'). */
  success?: number | 'all';
  /** Failures before overall failure: number | 'any' | 'all' (default 'any'). */
  failure?: number | 'any' | 'all';
}

/** Ticks all children each call, aggregates by policy. */
export function parallel(id?: string, policy: ParallelPolicy = {}, ...children: BTNode[]): BTNode {
  return {
    id: id ?? nodeId('par'),
    tick(ctx) {
      let success = 0;
      let failure = 0;
      let running = 0;
      for (const child of children) {
        const status = child.tick(ctx);
        if (status === 'success') success++;
        else if (status === 'failure') failure++;
        else running++;
      }
      const needSuccess =
        policy.success === 'all' || policy.success === undefined ? children.length : policy.success;
      const failMode = policy.failure ?? 'any';
      if (failMode === 'any' && failure > 0) {
        resetFrom(children, 0);
        return 'failure';
      }
      if (failMode === 'all' && failure === children.length) {
        resetFrom(children, 0);
        return 'failure';
      }
      if (typeof failMode === 'number' && failure >= failMode) {
        resetFrom(children, 0);
        return 'failure';
      }
      if (success >= needSuccess) {
        resetFrom(children, 0);
        return 'success';
      }
      return 'running';
    },
    reset() {
      resetFrom(children, 0);
    }
  };
}

export function inverter(id?: string, child?: BTNode): BTNode {
  return {
    id: id ?? nodeId('inv'),
    tick(ctx) {
      if (!child) return 'failure';
      const status = child.tick(ctx);
      if (status === 'running') return 'running';
      return status === 'success' ? 'failure' : 'success';
    },
    reset() {
      child?.reset();
    }
  };
}

/** Repeats a child up to `times` (Infinity allowed); success carried forward. */
export function repeat(id: string | undefined, child: BTNode | undefined, times = Infinity): BTNode {
  let count = 0;
  return {
    id: id ?? nodeId('rep'),
    tick(ctx) {
      if (!child) return 'failure';
      if (count >= times) {
        count = 0;
        return 'success';
      }
      const status = child.tick(ctx);
      if (status === 'running') return 'running';
      if (status === 'failure') {
        count = 0;
        return 'failure';
      }
      count++;
      if (count >= times) {
        count = 0;
        return 'success';
      }
      return 'running';
    },
    reset() {
      count = 0;
      child?.reset();
    }
  };
}

/** Fails when the child takes longer than `ms`. */
export function timeout(id: string | undefined, child: BTNode | undefined, ms: number): BTNode {
  let startedAt: number | null = null;
  return {
    id: id ?? nodeId('to'),
    tick(ctx) {
      if (!child) return 'failure';
      if (startedAt === null) startedAt = ctx.now;
      if (ctx.now - startedAt > ms) {
        child.reset();
        startedAt = null;
        return 'failure';
      }
      const status = child.tick(ctx);
      if (status !== 'running') startedAt = null;
      return status;
    },
    reset() {
      startedAt = null;
      child?.reset();
    }
  };
}

/** Immediate evaluation of a predicate. */
export function condition(id?: string, fn: (ctx: BTContext) => boolean = () => true): BTNode {
  return {
    id: id ?? nodeId('cond'),
    tick(ctx) {
      return fn(ctx) ? 'success' : 'failure';
    },
    reset() {}
  };
}

/** Executes a (possibly async) action; returns 'running' until it settles. */
export function action(
  id?: string,
  fn: (ctx: BTContext) => BTStatus | void | Promise<BTStatus | void> = () => undefined
): BTNode {
  let pending: Promise<void> | null = null;
  let settled: BTStatus | null = null;
  return {
    id: id ?? nodeId('act'),
    tick(ctx) {
      if (settled !== null) {
        const status = settled;
        settled = null;
        return status;
      }
      if (pending !== null) return 'running';
      const result = fn(ctx);
      if (result instanceof Promise) {
        pending = result.then(
          (status) => {
            settled = (status ?? 'success') as BTStatus;
            pending = null;
          },
          () => {
            settled = 'failure';
            pending = null;
          }
        );
        return 'running';
      }
      return result ?? 'success';
    },
    reset() {
      pending = null;
      settled = null;
    }
  };
}

/** Succeeds after `ms` have elapsed (running until then). */
export function wait(id?: string, ms = 0): BTNode {
  let startedAt: number | null = null;
  return {
    id: id ?? nodeId('wait'),
    tick(ctx) {
      if (startedAt === null) startedAt = ctx.now;
      if (ctx.now - startedAt >= ms) {
        startedAt = null;
        return 'success';
      }
      return 'running';
    },
    reset() {
      startedAt = null;
    }
  };
}

/** One-shot: succeeds on first tick, then fails until reset. */
export function once(id?: string, child?: BTNode): BTNode {
  let fired = false;
  return {
    id: id ?? nodeId('once'),
    tick(ctx) {
      if (fired) return 'failure';
      if (!child) {
        fired = true;
        return 'success';
      }
      const status = child.tick(ctx);
      if (status !== 'running') fired = true;
      return status;
    },
    reset() {
      fired = false;
      child?.reset();
    }
  };
}

function resetFrom(children: readonly BTNode[], from: number): void {
  for (let i = from; i < children.length; i++) {
    children[i]?.reset();
  }
}

/** Convenience namespace. */
export const bt = {
  sequence,
  selector,
  parallel,
  inverter,
  repeat,
  timeout,
  condition,
  action,
  wait,
  once
};
