import {
  type IEventBus,
  type KernelEventMap,
  type SubscribeOptions,
  type Unsubscribe,
  Errors
} from '@botpex/api';

interface Registration {
  handler: (payload: never) => void;
  priority: number;
  once: boolean;
  seq: number;
}

/**
 * Typed synchronous event bus (ADR-004).
 *
 * - Handlers run in priority order (higher first), stable by registration.
 * - Handler exceptions are isolated: they are reported to `onHandlerError`
 *   and never break dispatch.
 * - `once` handlers are removed after a single invocation.
 * - Mutation during dispatch is safe (snapshot of the handler list).
 */
export class EventBus implements IEventBus {
  private readonly handlers = new Map<string, Registration[]>();
  private seq = 0;
  private errorHandler: (scope: string, error: unknown) => void = (_s, e) =>
    console.error('[botpex] event handler error:', e);

  onHandlerError(fn: (scope: string, error: unknown) => void): void {
    this.errorHandler = fn;
  }

  on<K extends keyof KernelEventMap & string>(
    type: K,
    handler: (payload: KernelEventMap[K]) => void,
    options?: SubscribeOptions
  ): Unsubscribe {
    return this.add(type, handler, options?.priority ?? 0, options?.once === true);
  }

  once<K extends keyof KernelEventMap & string>(
    type: K,
    handler: (payload: KernelEventMap[K]) => void,
    options?: SubscribeOptions
  ): Unsubscribe {
    return this.add(type, handler, options?.priority ?? 0, true);
  }

  off<K extends keyof KernelEventMap & string>(
    type: K,
    handler: (payload: KernelEventMap[K]) => void
  ): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const idx = list.findIndex((r) => r.handler === handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit<K extends keyof KernelEventMap & string>(type: K, payload: KernelEventMap[K]): void {
    const list = this.handlers.get(type);
    if (!list || list.length === 0) return;
    const snapshot = [...list];
    for (const reg of snapshot) {
      if (reg.once) {
        const live = this.handlers.get(type);
        if (live) {
          const idx = live.indexOf(reg);
          if (idx >= 0) live.splice(idx, 1);
        }
      }
      try {
        (reg.handler as (p: KernelEventMap[K]) => void)(payload);
      } catch (error) {
        this.errorHandler(type, error);
      }
    }
  }

  waitFor<K extends keyof KernelEventMap & string>(
    type: K,
    predicate?: (payload: KernelEventMap[K]) => boolean,
    timeoutMs?: number
  ): Promise<KernelEventMap[K]> {
    return new Promise<KernelEventMap[K]>((resolve, reject) => {
      let off: Unsubscribe | null = null;
      let timer: NodeJS.Timeout | null = null;
      let settled = false;
      off = this.on(type, (payload) => {
        if (settled) return;
        if (predicate && !predicate(payload)) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(payload);
      });
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          off?.();
          reject(Errors.timeout(`event "${type}"`, timeoutMs));
        }, timeoutMs);
      }
    });
  }

  listenerCount(type?: string): number {
    if (type !== undefined) return this.handlers.get(type)?.length ?? 0;
    let total = 0;
    for (const list of this.handlers.values()) total += list.length;
    return total;
  }

  private add(
    type: string,
    handler: (payload: never) => void,
    priority: number,
    once: boolean
  ): Unsubscribe {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
    }
    const reg: Registration = { handler, priority, once, seq: this.seq++ };
    list.push(reg);
    list.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    return () => {
      const live = this.handlers.get(type);
      if (!live) return;
      const idx = live.indexOf(reg);
      if (idx >= 0) live.splice(idx, 1);
    };
  }
}
