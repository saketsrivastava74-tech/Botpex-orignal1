import { type BTContext, type BTNode, type StateMachineSpec, type IEventBus } from '@botpex/api';
import { StateMachine } from './fsm.js';

interface RegisteredTree {
  name: string;
  node: BTNode;
  priority: number;
}

/**
 * Behaviour System — hosts named behaviour trees (priority-ordered) and an
 * optional top-level FSM. The FSM is updated first, then trees.
 */
export class BehaviourSystem {
  private trees: RegisteredTree[] = [];
  private fsm: StateMachine | null = null;

  constructor(private readonly bus: IEventBus, private readonly botId: string) {}

  registerTree(name: string, node: BTNode, priority = 0): void {
    this.unregisterTree(name);
    this.trees.push({ name, node, priority });
    this.trees.sort((a, b) => b.priority - a.priority);
  }

  unregisterTree(name: string): void {
    this.trees = this.trees.filter((t) => t.name !== name);
  }

  get treeNames(): string[] {
    return this.trees.map((t) => t.name);
  }

  setFSM(spec: StateMachineSpec): void {
    this.fsm = new StateMachine(spec, { bus: this.bus, botId: this.botId });
  }

  clearFSM(): void {
    this.fsm = null;
  }

  get fsmState(): string | null {
    return this.fsm?.current ?? null;
  }

  tick(ctx: BTContext): void {
    this.fsm?.update(ctx);
    for (const tree of this.trees) {
      try {
        tree.node.tick(ctx);
      } catch (error) {
        this.bus.emit('runtime:taskFailed', { name: `behaviour:${tree.name}`, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
  }

  reset(): void {
    for (const tree of this.trees) tree.node.reset();
  }
}
