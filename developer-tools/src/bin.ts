#!/usr/bin/env node
/**
 * botpex — developer CLI.
 *
 *   botpex init [dir] [--template basic-bot]
 *   botpex run <projectDir> [--runtime mock|native|mineflayer] [--host H] [--port P] [--username U] [--version V]
 *   botpex doctor
 *   botpex list-runtimes
 *
 * Zero external CLI framework — predictable, inspectable (ADR: DX tooling).
 */
import { runInit } from './commands/init.js';
import { runRun } from './commands/run.js';
import { runDoctor } from './commands/doctor.js';
import { runListRuntimes } from './commands/list-runtimes.js';

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parse(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));
  switch (args.command) {
    case 'init':
      return runInit(args.positional[0] ?? '.', args.flags.get('template')?.toString() ?? 'basic-bot');
    case 'run':
      return runRun(args.positional[0] ?? '.', args.flags);
    case 'doctor':
      return runDoctor();
    case 'list-runtimes':
      return runListRuntimes();
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return 0;
    case '--version':
    case 'version':
      console.log('botpex CLI 0.1.0 (kernel API 0.1.0)');
      return 0;
    default:
      console.error(`Unknown command: ${args.command}\n`);
      printHelp();
      return 1;
  }
}

function printHelp(): void {
  console.log(`botpex — One Kernel. Unlimited Bots.

Usage:
  botpex init [dir] [--template basic-bot]   Scaffold a bot project
  botpex run <dir> [options]                 Run a bot package (botpex.json)
      --runtime mock|native|mineflayer       Runtime selection (default from botpex.json or mock)
      --host H --port P --username U --version V   Connection options
  botpex doctor                              Environment + compatibility diagnostics
  botpex list-runtimes                       Builtin runtimes and their capabilities
  botpex version                             Print versions
`);
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('botpex:', error instanceof Error ? error.message : error);
    if (error && typeof error === 'object' && 'hint' in error) {
      console.error('hint:', (error as { hint: string }).hint);
    }
    process.exit(1);
  });
