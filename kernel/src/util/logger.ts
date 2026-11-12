import type { Logger, LogFields, LogLevel } from '@botpex/api';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

class ConsoleLogger implements Logger {
  constructor(
    private readonly scope: string,
    private readonly level: LogLevel,
    private readonly sink: (line: string) => void
  ) {}

  debug(message: string, fields?: LogFields): void {
    this.write('debug', message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.write('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.write('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.write('error', message, fields);
  }

  child(scope: string): Logger {
    return new ConsoleLogger(`${this.scope}.${scope}`, this.level, this.sink);
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const ts = new Date().toISOString();
    const extra = fields ? ` ${JSON.stringify(fields)}` : '';
    this.sink(`${ts} ${level.toUpperCase().padEnd(5)} [${this.scope}] ${message}${extra}`);
  }
}

export function createConsoleLogger(
  scope = 'botpex',
  level: LogLevel = 'info',
  sink: (line: string) => void = (line) => console.log(line)
): Logger {
  return new ConsoleLogger(scope, level, sink);
}

/** Logger that stores lines in memory — used by tests and quiet hosts. */
export class MemoryLogger implements Logger {
  readonly lines: { level: LogLevel; scope: string; message: string; fields?: LogFields }[] = [];

  constructor(private readonly scope = 'botpex') {}

  debug(message: string, fields?: LogFields): void {
    this.push('debug', message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.push('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.push('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.push('error', message, fields);
  }

  child(scope: string): Logger {
    return new MemoryLogger(`${this.scope}.${scope}`);
  }

  has(pattern: string | RegExp): boolean {
    return this.lines.some((l) =>
      typeof pattern === 'string' ? l.message.includes(pattern) : pattern.test(l.message)
    );
  }

  private push(level: LogLevel, message: string, fields?: LogFields): void {
    this.lines.push({ level, scope: this.scope, message, fields });
  }
}
