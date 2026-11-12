/**
 * Minimal structured logging contract used across Botpex.
 * Kernels, adapters and extensions all log through this interface so hosts
 * can route, scope and format logs however they want.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger with an additional scope label (dot-joined). */
  child(scope: string): Logger;
}
