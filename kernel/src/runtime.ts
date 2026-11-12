import {
  type LifecyclePhase,
  type IEventBus,
  type Logger,
  LIFECYCLE_TRANSITIONS,
  Errors
} from '@botpex/api';

export interface ScheduledTask {
  readonly name: string;
  readonly kind: 'interval' | 'delay';
  cancel(): void;
}

interface TaskRecord {
  name: string;
  kind: 'interval' | 'delay';
  intervalMs: number | null;
  fireAt: number;
  fn: () => void | Promise<void>;
  cancelled: boolean;
  running: boolean;
}

/**
 * Tick-driven scheduler: tasks fire on the kernel tick timeline (deterministic
 * under test via manual ticks). Overlapping async executions are skipped with
 * a warning — a slow task never stacks.
 */
export class Scheduler {
  private readonly tasks: TaskRecord[] = [];
  private stats = { scheduled: 0, completed: 0, failed: 0 };

  constructor(
    private readonly bus: IEventBus,
    private readonly log: Logger
  ) {}

  schedule(options: {
    name: string;
    intervalMs?: number;
    delayMs?: number;
    fn: () => void | Promise<void>;
  }): ScheduledTask {
    const kind: 'interval' | 'delay' = options.intervalMs !== undefined ? 'interval' : 'delay';
    const record: TaskRecord = {
      name: options.name,
      kind,
      intervalMs: options.intervalMs ?? null,
      fireAt:
        Date.now() +
        (options.delayMs ?? options.intervalMs ?? 0),
      fn: options.fn,
      cancelled: false,
      running: false
    };
    this.tasks.push(record);
    this.stats.scheduled += 1;
    this.bus.emit('runtime:taskScheduled', {
      name: record.name,
      intervalMs: record.intervalMs,
      delayMs: options.delayMs ?? null
    });
    return {
      name: record.name,
      kind,
      cancel: () => {
        record.cancelled = true;
      }
    };
  }

  /** Advance the timeline; called once per kernel tick. */
  async tick(now: number): Promise<void> {
    for (const task of this.tasks) {
      if (task.cancelled) continue;
      if (now < task.fireAt) continue;
      if (task.running) {
        this.log.warn('scheduler task overlap skipped', { task: task.name });
        if (task.intervalMs !== null) task.fireAt = now + task.intervalMs;
        continue;
      }
      task.running = true;
      const startedAt = Date.now();
      try {
        await task.fn();
        this.stats.completed += 1;
        this.bus.emit('runtime:taskCompleted', { name: task.name, durationMs: Date.now() - startedAt });
      } catch (error) {
        this.stats.failed += 1;
        this.bus.emit('runtime:taskFailed', {
          name: task.name,
          error: error instanceof Error ? error : new Error(String(error))
        });
      } finally {
        task.running = false;
        if (task.cancelled) continue;
        if (task.intervalMs !== null) {
          task.fireAt = now + task.intervalMs;
        } else {
          task.cancelled = true;
        }
      }
    }
    // prune cancelled
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i]?.cancelled) this.tasks.splice(i, 1);
    }
  }

  cancelAll(): void {
    for (const task of this.tasks) task.cancelled = true;
    this.tasks.length = 0;
  }

  get activeCount(): number {
    return this.tasks.filter((t) => !t.cancelled).length;
  }

  get statistics(): { scheduled: number; completed: number; failed: number } {
    return { ...this.stats };
  }
}

export interface RuntimeConfig {
  tickIntervalMs?: number;
  /** Warn when a tick takes longer than this fraction of the interval (default 0.8). */
  tickOverloadRatio?: number;
  /** Watchdog check interval (default 1000 ms); warns when ticks stall. */
  watchdogMaxStallMs?: number;
}

/**
 * Runtime System — lifecycle FSM, drift-compensated tick loop, scheduler
 * and heartbeat watchdog.
 */
export class RuntimeSystem {
  private phase: LifecyclePhase = 'idle';
  private tickTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastTickAt = 0;
  private tickCount = 0;
  private readonly tickIntervalMs: number;
  private readonly overloadRatio: number;
  private readonly watchdogMaxStallMs: number;

  constructor(
    private readonly bus: IEventBus,
    private readonly log: Logger,
    readonly scheduler: Scheduler,
    config: RuntimeConfig = {}
  ) {
    this.tickIntervalMs = config.tickIntervalMs ?? 50;
    this.overloadRatio = config.tickOverloadRatio ?? 0.8;
    this.watchdogMaxStallMs = config.watchdogMaxStallMs ?? 5000;
  }

  get currentPhase(): LifecyclePhase {
    return this.phase;
  }

  get ticks(): number {
    return this.tickCount;
  }

  transition(to: LifecyclePhase): void {
    const legal = LIFECYCLE_TRANSITIONS[this.phase];
    if (!legal.includes(to)) {
      throw Errors.invalidTransition(this.phase, to, legal);
    }
    const from = this.phase;
    this.phase = to;
    this.bus.emit('bot:phase', { from, to });
  }

  /** Start the drift-compensated tick loop. */
  startTickLoop(onTick: (now: number, dtMs: number, tick: number) => void | Promise<void>): void {
    if (this.tickTimer !== null) return;
    this.lastTickAt = Date.now();
    let nextDeadline = Date.now();
    let n = 0;
    const loop = async (): Promise<void> => {
      const startedAt = Date.now();
      const now = startedAt;
      const dt = now - this.lastTickAt;
      this.lastTickAt = now;
      this.tickCount += 1;
      try {
        await onTick(now, dt, this.tickCount);
      } catch (error) {
        this.log.error('tick handler failed', { tick: this.tickCount, error: String(error) });
      }
      const duration = Date.now() - startedAt;
      if (duration > this.tickIntervalMs * this.overloadRatio) {
        this.bus.emit('runtime:warning', {
          scope: 'tick-loop',
          message: `tick #${this.tickCount} took ${duration} ms (interval ${this.tickIntervalMs} ms)`
        });
      }
      n += 1;
      nextDeadline = this.lastTickAt + this.tickIntervalMs;
      const delay = Math.max(1, nextDeadline - Date.now());
      this.tickTimer = setTimeout(loop, delay);
      void n;
    };
    this.tickTimer = setTimeout(loop, this.tickIntervalMs);

    this.watchdogTimer = setInterval(() => {
      const stalledFor = Date.now() - this.lastTickAt;
      if (stalledFor > this.watchdogMaxStallMs) {
        this.bus.emit('runtime:warning', {
          scope: 'watchdog',
          message: `tick loop stalled for ${stalledFor} ms`
        });
      }
    }, 1000);
    if (this.watchdogTimer.unref) this.watchdogTimer.unref();
  }

  stopTickLoop(): void {
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.scheduler.cancelAll();
  }

  /** Manually drive one tick (used by tests and the mock harness). */
  async manualTick(
    onTick: (now: number, dtMs: number, tick: number) => void | Promise<void>
  ): Promise<void> {
    const now = Date.now();
    const dt = now - this.lastTickAt;
    this.lastTickAt = now;
    this.tickCount += 1;
    await onTick(now, dt, this.tickCount);
  }
}
