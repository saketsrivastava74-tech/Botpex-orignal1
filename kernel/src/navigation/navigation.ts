import {
  type BlockPos,
  type IEventBus,
  type Logger,
  type MoveOptions,
  type NavPath,
  type SelfState,
  type Vec3,
  Errors,
  blockKey,
  distance,
  horizontalDistance
} from '@botpex/api';
import { WorldModel } from '../world.js';
import { MovementSystem } from '../movement.js';
import { findPath } from './astar.js';

export interface NavigationConfig {
  /** Node budget for A* (default 20000). */
  maxSearchNodes?: number;
  /** No-progress window before "stuck" (default 2000 ms). */
  stuckTimeoutMs?: number;
  /** Minimum movement within the stuck window (default 0.3 m). */
  stuckEpsilon?: number;
  /** Default goal radius (default 1.0 m). */
  goalRadius?: number;
}

interface NavJob {
  goal: BlockPos;
  options: MoveOptions;
  path: NavPath;
  index: number;
  startedAt: number;
  lastProgressAt: number;
  lastProgressPos: Vec3;
  replans: number;
  nextRepathAt: number;
  resolve: () => void;
  reject: (error: Error) => void;
  finished: boolean;
}

/**
 * Navigation System — plans with grid A* and executes paths through the
 * Movement System, with replanning on invalidation, periodic repath,
 * stuck detection and promise-based completion.
 */
export class NavigationSystem {
  private job: NavJob | null = null;
  private readonly cfg: Required<NavigationConfig>;

  constructor(
    private readonly world: WorldModel,
    private readonly movement: MovementSystem,
    private readonly selfProvider: () => SelfState,
    private readonly bus: IEventBus,
    private readonly log: Logger,
    config: NavigationConfig = {}
  ) {
    this.cfg = {
      maxSearchNodes: config.maxSearchNodes ?? 20_000,
      stuckTimeoutMs: config.stuckTimeoutMs ?? 2000,
      stuckEpsilon: config.stuckEpsilon ?? 0.3,
      goalRadius: config.goalRadius ?? 1.0
    };
  }

  get isNavigating(): boolean {
    return this.job !== null;
  }

  get currentGoal(): BlockPos | null {
    return this.job?.goal ?? null;
  }

  /** Plan a path without executing it. Throws NAV errors. */
  findPath(goal: BlockPos, options: { acceptPartial?: boolean } = {}): NavPath {
    const self = this.selfProvider();
    if (!this.world.isLoaded(goal)) {
      throw Errors.goalUnloaded(blockKey(goal));
    }
    const result = findPath(
      this.world,
      self.position,
      goal,
      { maxNodes: this.cfg.maxSearchNodes, acceptPartial: options.acceptPartial === true }
    );
    if (result === null) {
      throw Errors.noPath(
        blockKey(self.position),
        blockKey(goal),
        options.acceptPartial === true
          ? 'not even a partial path could be constructed'
          : 'no reachable route in loaded chunks (or search budget exhausted)'
      );
    }
    return result.path;
  }

  /**
   * Navigate to `goal`. Resolves on arrival; rejects with
   * BOTPEX/NAV/{NO_PATH, TIMEOUT, STUCK, ABORTED, GOAL_UNLOADED}.
   */
  async goto(goal: BlockPos, options: MoveOptions = {}): Promise<void> {
    const path = this.findPath(goal, { acceptPartial: options.acceptPartial === true });
    this.abortActive('superseded by a new goto()');
    return new Promise<void>((resolve, reject) => {
      const now = Date.now();
      this.job = {
        goal,
        options,
        path,
        index: this.initialIndex(path, this.selfProvider().position),
        startedAt: now,
        lastProgressAt: now,
        lastProgressPos: this.selfProvider().position,
        replans: 0,
        nextRepathAt: options.repathMs ? now + options.repathMs : 0,
        resolve,
        reject,
        finished: false
      };
      this.bus.emit('navigation:planned', { path, goal });
      this.bus.emit('navigation:waypoint', { index: this.job.index, point: path.points[this.job.index] ?? goal });
    });
  }

  stop(): void {
    this.abortActive('stop() called');
  }

  /** Called once per kernel tick while active. */
  async tick(now: number): Promise<void> {
    const job = this.job;
    if (job === null || job.finished) return;
    const self = this.selfProvider();
    const timeoutMs = job.options.timeoutMs ?? 120_000;
    if (now - job.startedAt > timeoutMs) {
      this.failJob(job, Errors.navTimeout(blockKey(job.goal), timeoutMs));
      return;
    }

    const goalRadius = job.options.goalRadius ?? this.cfg.goalRadius;
    if (
      horizontalDistance(self.position, job.goal) <= goalRadius + 0.5 &&
      Math.abs(self.position.y - job.goal.y) <= 1.5
    ) {
      this.finishJob(job);
      return;
    }

    // Waypoint advancement
    let wp = job.path.points[job.index];
    while (wp !== undefined) {
      const wpRadius = job.index === job.path.points.length - 1 ? goalRadius : 0.9;
      if (distance(self.position, wp) <= wpRadius + (job.index === job.path.points.length - 1 ? 0 : 0.1)) {
        job.index++;
        this.bus.emit('navigation:waypoint', { index: job.index, point: wp });
        wp = job.path.points[job.index];
      } else {
        break;
      }
    }
    if (wp === undefined) {
      // Walked all waypoints but outside goal radius tolerance: accept if close.
      if (distance(self.position, job.goal) <= goalRadius + 1.0) {
        this.finishJob(job);
      } else {
        this.replan(job, now, 'waypoints exhausted short of goal');
      }
      return;
    }

    // Path invalidation: next waypoint block must still be standable.
    const wpBlock: BlockPos = { x: Math.floor(wp.x), y: Math.floor(wp.y), z: Math.floor(wp.z) };
    const below = this.world.getBlock({ x: wpBlock.x, y: wpBlock.y - 1, z: wpBlock.z });
    const at = this.world.getBlock(wpBlock);
    const pathBroken = (below !== null && !below.flags.solid) || (at !== null && !at.flags.passable);
    if (pathBroken) {
      this.replan(job, now, 'path invalidated by block change');
      return;
    }

    // Stuck detection
    const moved = distance(self.position, job.lastProgressPos);
    if (moved >= this.cfg.stuckEpsilon) {
      job.lastProgressAt = now;
      job.lastProgressPos = self.position;
    } else if (now - job.lastProgressAt > this.cfg.stuckTimeoutMs) {
      this.bus.emit('navigation:stuck', { at: self.position, progressMeters: moved });
      const maxReplans = job.options.maxReplans ?? 3;
      if (job.replans >= maxReplans) {
        this.failJob(job, Errors.navStuck(blockKey(self.position), moved));
      } else {
        this.replan(job, now, 'stuck');
      }
      return;
    }

    // Periodic repath
    if (job.nextRepathAt !== 0 && now >= job.nextRepathAt) {
      this.replan(job, now, 'periodic repath');
      return;
    }

    // Drive toward waypoint
    try {
      await this.movement.faceToward(self.position, { x: wp.x, y: self.position.y, z: wp.z });
    } catch {
      // look capability missing — movement still works headless
    }
    const needsJump = wp.y > Math.floor(self.position.y) + 0.4;
    const straight = this.straightRunLength(job);
    const wantSprint = job.options.sprint === true && straight >= 3;
    await this.movement.applyControls({
      forward: true,
      back: false,
      left: false,
      right: false,
      jump: needsJump,
      sprint: wantSprint
    });
  }

  /** Release all movement controls (call when navigation ends). */
  async releaseControls(): Promise<void> {
    try {
      await this.movement.stopAll();
    } catch (error) {
      this.log.warn('failed to release movement controls', { error: String(error) });
    }
  }

  private straightRunLength(job: NavJob): number {
    let total = 0;
    for (let i = job.index; i < Math.min(job.path.points.length, job.index + 6); i++) {
      const a = job.path.points[i];
      const b = job.path.points[i + 1];
      if (!a || !b) break;
      if (Math.abs(a.y - b.y) > 0.01) break;
      total += horizontalDistance(a, b);
    }
    return total;
  }

  private initialIndex(path: NavPath, pos: Vec3): number {
    // Skip the first waypoint if we are effectively standing on it.
    const first = path.points[0];
    if (first && distance(pos, first) <= 1.0 && path.points.length > 1) return 1;
    return 0;
  }

  private replan(job: NavJob, now: number, reason: string): void {
    try {
      const self = this.selfProvider();
      const result = findPath(
        this.world,
        self.position,
        job.goal,
        { maxNodes: this.cfg.maxSearchNodes, acceptPartial: false }
      );
      job.replans++;
      if (result === null) {
        this.failJob(job, Errors.noPath(blockKey(self.position), blockKey(job.goal), `replan failed (${reason})`));
        return;
      }
      job.path = result.path;
      job.index = this.initialIndex(result.path, self.position);
      job.lastProgressAt = now;
      job.lastProgressPos = self.position;
      job.nextRepathAt = job.options.repathMs ? now + job.options.repathMs : 0;
      this.bus.emit('navigation:replanned', { path: result.path, reason });
    } catch (error) {
      this.failJob(job, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private finishJob(job: NavJob): void {
    if (job.finished) return;
    job.finished = true;
    this.job = null;
    this.bus.emit('navigation:arrived', { goal: job.goal, elapsedMs: Date.now() - job.startedAt });
    void this.releaseControls();
    job.resolve();
  }

  private failJob(job: NavJob, error: Error): void {
    if (job.finished) return;
    job.finished = true;
    this.job = null;
    this.bus.emit('navigation:failed', {
      goal: job.goal,
      code: (error as { code?: string }).code ?? 'BOTPEX/NAV/FAILED',
      message: error.message
    });
    void this.releaseControls();
    job.reject(error);
  }

  private abortActive(reason: string): void {
    const job = this.job;
    if (job === null || job.finished) return;
    job.finished = true;
    this.job = null;
    this.bus.emit('navigation:failed', {
      goal: job.goal,
      code: 'BOTPEX/NAV/ABORTED',
      message: reason
    });
    void this.releaseControls();
    job.reject(Errors.navAborted(blockKey({ x: 0, y: 0, z: 0 }), blockKey(job.goal)));
  }
}
