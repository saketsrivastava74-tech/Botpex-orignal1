import { type BTNode, type Brain, type StateMachineSpec, type FeatureKey } from '@botpex/api';

export interface BehaviourRegistration {
  name: string;
  node: BTNode;
  priority: number;
}

/**
 * Declare a named behaviour tree for a bot. Trees tick every kernel tick,
 * highest priority first.
 */
export function defineBehaviour(
  name: string,
  node: BTNode,
  options: { priority?: number } = {}
): BehaviourRegistration {
  return { name, node, priority: options.priority ?? 0 };
}

/** Identity helper for custom brains (improves inference + docs tooling). */
export function defineBrain(brain: Brain): Brain {
  return brain;
}

/** Identity helper for FSM specs. */
export function defineFSM(spec: StateMachineSpec): StateMachineSpec {
  return spec;
}

/** Common feature bundles for createBot's fail-fast validation. */
export const FEATURE_BUNDLES = {
  /** Bot that can perceive and move. */
  mobile: ['perception', 'selfMonitoring', 'movement'] satisfies FeatureKey[],
  /** Bot that can navigate terrain. */
  navigator: ['perception', 'selfMonitoring', 'navigation'] satisfies FeatureKey[],
  /** Bot that can fight. */
  combatant: ['perception', 'combat'] satisfies FeatureKey[]
} as const;
