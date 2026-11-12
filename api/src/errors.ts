/**
 * Botpex error taxonomy.
 *
 * Every error crossing a public Botpex boundary is a `BotpexError` carrying:
 * - `code`     — stable machine-readable id (`BOTPEX/AREA/REASON`)
 * - `message`  — human-readable description
 * - `details`  — structured context (never secrets)
 * - `hint`     — actionable remediation guidance
 *
 * Rule (see CONTRIBUTING.md): no silent failures. Unsupported operations throw.
 */

export interface BotpexErrorOptions {
  details?: Record<string, unknown>;
  hint?: string;
  cause?: unknown;
}

export class BotpexError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly hint?: string;

  constructor(code: string, message: string, options: BotpexErrorOptions = {}) {
    super(message);
    this.name = 'BotpexError';
    this.code = code;
    if (options.details) this.details = options.details;
    if (options.hint) this.hint = options.hint;
    if (options.cause !== undefined && 'cause' in Error.prototype) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isBotpexError(value: unknown): value is BotpexError {
  return value instanceof BotpexError;
}

/** Factories for every stable error code. Keep messages developer-friendly. */
export const Errors = {
  capabilityUnsupported(key: string, driverName: string, note?: string): BotpexError {
    return new BotpexError(
      'BOTPEX/CAPABILITY/UNSUPPORTED',
      `Runtime "${driverName}" does not support capability "${key}".${note ? ` (${note})` : ''}`,
      {
        details: { capability: key, driver: driverName, note: note ?? null },
        hint: 'Check driver.capabilities() before using this feature, choose a runtime that supports it, or gate the behaviour behind FEATURE_REQUIREMENTS. See documentation/CAPABILITIES.md.'
      }
    );
  },

  configInvalid(field: string, reason: string): BotpexError {
    return new BotpexError('BOTPEX/CONFIG/INVALID', `Invalid configuration: ${field} — ${reason}`, {
      details: { field, reason },
      hint: 'See documentation/GETTING_STARTED.md for a valid createBot() configuration.'
    });
  },

  invalidTransition(from: string, to: string, legal: readonly string[]): BotpexError {
    return new BotpexError(
      'BOTPEX/LIFECYCLE/INVALID_TRANSITION',
      `Illegal lifecycle transition ${from} -> ${to}. Legal next phases: ${legal.join(', ') || 'none'}.`,
      { details: { from, to, legal: [...legal] } }
    );
  },

  notActive(phase: string, action: string): BotpexError {
    return new BotpexError(
      'BOTPEX/LIFECYCLE/NOT_ACTIVE',
      `Cannot ${action} while bot is in phase "${phase}" (expected "active").`,
      { details: { phase, action }, hint: 'await bot.start() and wait for the "active" phase first.' }
    );
  },

  driverNotConnected(driver: string): BotpexError {
    return new BotpexError('BOTPEX/DRIVER/NOT_CONNECTED', `Driver "${driver}" is not connected.`, {
      details: { driver },
      hint: 'connect() must resolve before issuing actions; check the "driver:connected" event.'
    });
  },

  driverAction(driver: string, action: string, cause?: unknown): BotpexError {
    return new BotpexError(
      'BOTPEX/DRIVER/ACTION_FAILED',
      `Driver "${driver}" failed action "${action}".`,
      { details: { driver, action }, hint: 'Inspect details/logs of the cause; server-side rejections are surfaced via driver:error events.', cause }
    );
  },

  connectionFailed(driver: string, reason: string, cause?: unknown): BotpexError {
    return new BotpexError(
      'BOTPEX/DRIVER/CONNECTION_FAILED',
      `Driver "${driver}" could not connect: ${reason}`,
      { details: { driver, reason }, hint: 'Verify host/port/version and authentication mode; run `botpex doctor` for diagnostics.', cause }
    );
  },

  unsupportedPacket(packet: string, version: string): BotpexError {
    return new BotpexError(
      'BOTPEX/DRIVER/UNSUPPORTED_PACKET',
      `Packet "${packet}" is not defined for Minecraft version ${version}.`,
      { details: { packet, version }, hint: 'This Minecraft version is outside the supported matrix; see @botpex/compatibility.' }
    );
  },

  noPath(from: string, goal: string, reason: string): BotpexError {
    return new BotpexError(
      'BOTPEX/NAV/NO_PATH',
      `No path from ${from} to ${goal}: ${reason}`,
      { details: { from, goal, reason }, hint: 'Ensure the goal is inside loaded chunks and reachable on foot; raise maxSearchNodes if the terrain is complex.' }
    );
  },

  goalUnloaded(goal: string): BotpexError {
    return new BotpexError(
      'BOTPEX/NAV/GOAL_UNLOADED',
      `Goal ${goal} lies in unloaded chunks.`,
      { details: { goal }, hint: 'Move closer or keep the area loaded before requesting navigation.' }
    );
  },

  navStuck(at: string, progressMeters: number): BotpexError {
    return new BotpexError(
      'BOTPEX/NAV/STUCK',
      `Navigation gave up at ${at} after insufficient progress (${progressMeters.toFixed(2)} m).`,
      { details: { at, progressMeters }, hint: 'The terrain may be blocked or the movement capability limited; inspect navigation:stuck events for details.' }
    );
  },

  navTimeout(goal: string, ms: number): BotpexError {
    return new BotpexError('BOTPEX/NAV/TIMEOUT', `Navigation to ${goal} exceeded ${ms} ms.`, {
      details: { goal, timeoutMs: ms },
      hint: 'Increase MoveOptions.timeoutMs or reduce the distance.'
    });
  },

  navAborted(from: string, goal: string): BotpexError {
    return new BotpexError('BOTPEX/NAV/ABORTED', `Navigation from ${from} to ${goal} was aborted.`, {
      details: { from, goal }
    });
  },

  combatNoTarget(reason: string): BotpexError {
    return new BotpexError('BOTPEX/COMBAT/NO_TARGET', `Combat target unavailable: ${reason}`, {
      details: { reason },
      hint: 'Validate the target with combat.selectTarget() or subscribe to combat:targetLost.'
    });
  },

  timeout(what: string, ms: number): BotpexError {
    return new BotpexError('BOTPEX/TIMEOUT', `${what} timed out after ${ms} ms.`, {
      details: { what, timeoutMs: ms },
      hint: 'Increase the timeout or investigate why the awaited event never fired.'
    });
  },

  manifestInvalid(kind: 'adapter' | 'extension', id: string, problems: readonly string[]): BotpexError {
    return new BotpexError(
      kind === 'adapter' ? 'BOTPEX/ADAPTER/MANIFEST_INVALID' : 'BOTPEX/EXT/MANIFEST_INVALID',
      `Invalid ${kind} manifest "${id}": ${problems.join('; ')}`,
      { details: { id, problems: [...problems] }, hint: `See documentation/${kind === 'adapter' ? 'ADAPTER_GUIDE' : 'EXTENSION_GUIDE'}.md for the manifest schema.` }
    );
  },

  adapterNotFound(id: string, known: readonly string[]): BotpexError {
    return new BotpexError(
      'BOTPEX/ADAPTER/NOT_FOUND',
      `Adapter "${id}" is not registered. Known adapters: ${known.join(', ') || '(none)'}.`,
      { details: { id, known: [...known] }, hint: 'Register the adapter with the AdapterHost or use a builtin runtime id.' }
    );
  },

  apiMismatch(kind: 'adapter' | 'extension', id: string, required: string, actual: string): BotpexError {
    return new BotpexError(
      'BOTPEX/ADAPTER/API_MISMATCH',
      `${kind} "${id}" requires Botpex API ${required}, but this kernel provides ${actual}.`,
      { details: { id, required, actual }, hint: 'Upgrade Botpex or the adapter to compatible versions.' }
    );
  },

  permissionDenied(permission: string, subject: string): BotpexError {
    return new BotpexError(
      'BOTPEX/EXT/PERMISSION_DENIED',
      `"${subject}" lacks permission "${permission}".`,
      { details: { permission, subject }, hint: 'Add the permission to the extension manifest and re-register.' }
    );
  },

  packageInvalid(problems: readonly string[]): BotpexError {
    return new BotpexError(
      'BOTPEX/PKG/INVALID',
      `Invalid bot package: ${problems.join('; ')}`,
      { details: { problems: [...problems] }, hint: 'See documentation/PACKAGE_SPEC.md for the botpex.json format.' }
    );
  },

  runtimeNotFound(runtime: string, known: readonly string[]): BotpexError {
    return new BotpexError(
      'BOTPEX/RUNTIME/NOT_FOUND',
      `Runtime "${runtime}" is not available. Known: ${known.join(', ')}.`,
      {
        details: { runtime, known: [...known] },
        hint: 'Builtin runtimes: "mock" (always available), "native" (@botpex/runtime-native), "mineflayer" (@botpex/runtime-mineflayer). Install the missing package or pass a DriverFactory.'
      }
    );
  }
};
