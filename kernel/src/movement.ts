import type { CapabilityRegistry } from './capabilities.js';
import {
  type IDriver,
  type IEventBus,
  type Logger,
  type MoveControl,
  type Vec3,
  MOVE_CONTROLS,
  yawBetween,
  pitchBetween,
  Errors
} from '@botpex/api';

export type ControlSet = Partial<Record<MoveControl, boolean>>;

/**
 * Movement System — aggregates control-state channels and look commands.
 * All calls are capability-gated; the system never approximates silently.
 */
export class MovementSystem {
  private readonly active = new Map<MoveControl, boolean>();

  constructor(
    private readonly driver: IDriver,
    private readonly caps: CapabilityRegistry,
    private readonly bus: IEventBus,
    private readonly log: Logger
  ) {}

  async setControl(control: MoveControl, on: boolean): Promise<void> {
    this.caps.require('movement.controlStates');
    if (!MOVE_CONTROLS.includes(control)) {
      throw Errors.configInvalid('control', `unknown movement control "${control}"`);
    }
    if (this.active.get(control) === on) return;
    await this.driver.setControlState(control, on);
    this.active.set(control, on);
  }

  /** Apply a partial control set — only changed channels hit the driver. */
  async applyControls(controls: ControlSet): Promise<void> {
    for (const [control, on] of Object.entries(controls)) {
      if (on === undefined) continue;
      await this.setControl(control as MoveControl, on);
    }
  }

  async stopAll(): Promise<void> {
    this.caps.require('movement.controlStates');
    for (const control of MOVE_CONTROLS) {
      if (this.active.get(control) === true) {
        try {
          await this.driver.setControlState(control, false);
        } catch (error) {
          this.log.warn('failed to release control', { control, error: String(error) });
        }
        this.active.set(control, false);
      }
    }
  }

  isControlActive(control: MoveControl): boolean {
    return this.active.get(control) === true;
  }

  activeControls(): MoveControl[] {
    return MOVE_CONTROLS.filter((c) => this.active.get(c) === true);
  }

  async look(yaw: number, pitch: number): Promise<void> {
    this.caps.require('movement.look');
    await this.driver.look(yaw, pitch);
  }

  /** Face from `from` toward `to` (yaw + pitch in Minecraft conventions). */
  async faceToward(from: Vec3, to: Vec3): Promise<void> {
    await this.look(yawBetween(from, to), pitchBetween(from, to));
  }

  resetTracking(): void {
    this.active.clear();
  }
}
