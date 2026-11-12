import {
  type BTContext,
  type BTStatus,
  type FSMState,
  type StateMachineSpec,
  type IEventBus
} from '@botpex/api';

interface CompiledTransition {
  from: string;
  to: string;
  when: ((ctx: BTContext) => boolean) | null;
}

/**
 * Finite State Machine with guarded transitions (Behaviour System).
 *
 * - `update` evaluates transitions from the current state (declaration order),
 *   then wildcard ('*') transitions.
 * - `enter`/`exit` hooks may be async; they are awaited where possible and
 *   failures are logged, never thrown into the tick loop.
 */
export class StateMachine {
  private readonly states = new Map<string, FSMState>();
  private readonly transitions: CompiledTransition[] = [];
  private currentName: string | null = null;
  private readonly emitter: { bus: IEventBus; botId: string } | null;

  constructor(
    spec: StateMachineSpec,
    emitter: { bus: IEventBus; botId: string } | null = null
  ) {
    for (const state of spec.states) {
      this.states.set(state.name, state);
    }
    for (const t of spec.transitions) {
      this.transitions.push({ from: t.from, to: t.to, when: t.when ?? null });
    }
    this.emitter = emitter;
    if (!this.states.has(spec.initial)) {
      throw new Error(`FSM initial state "${spec.initial}" is not defined`);
    }
    this.initialName = spec.initial;
  }

  private readonly initialName: string;

  get current(): string | null {
    return this.currentName;
  }

  /** Enter the initial state (idempotent). */
  start(ctx: BTContext): void {
    if (this.currentName !== null) return;
    this.enterState(this.initialName, ctx);
  }

  /** Evaluate transitions and tick the active state. Returns its BTStatus. */
  update(ctx: BTContext): BTStatus {
    this.start(ctx);
    const name = this.currentName;
    if (name === null) return 'failure';
    const state = this.states.get(name);
    if (!state) return 'failure';

    for (const t of this.transitions) {
      if (t.from !== name && t.from !== '*') continue;
      if (t.from === '*' && t.to === name) continue;
      if (t.when !== null && !t.when(ctx)) continue;
      if (t.to === name) continue;
      this.forceState(t.to, ctx);
      return 'running';
    }

    const result = state.update?.(ctx);
    if (typeof result === 'string') return result;
    return 'running';
  }

  /** Force a state transition (fires exit/enter hooks + events). */
  forceState(to: string, ctx: BTContext): void {
    if (!this.states.has(to)) {
      throw new Error(`FSM state "${to}" is not defined`);
    }
    if (this.currentName === to) return;
    const prev = this.currentName;
    if (prev !== null) {
      const fromState = this.states.get(prev);
      try {
        fromState?.exit?.(ctx);
      } catch (error) {
        ctx.bot.log.warn('FSM exit hook failed', { state: prev, error: String(error) });
      }
      this.emitter?.bus.emit('behaviour:stateExit', { state: prev });
    }
    this.enterState(to, ctx);
  }

  private enterState(name: string, ctx: BTContext): void {
    this.currentName = name;
    const state = this.states.get(name);
    try {
      void state?.enter?.(ctx);
    } catch (error) {
      ctx.bot.log.warn('FSM enter hook failed', { state: name, error: String(error) });
    }
    this.emitter?.bus.emit('behaviour:stateEnter', { state: name });
  }
}
