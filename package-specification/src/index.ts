import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KERNEL_API_VERSION, Errors } from '@botpex/api';
import semver from 'semver';

export const PACKAGE_SPEC_VERSION = 'botpex/v1';

export interface BotPackageManifest {
  spec: 'botpex/v1';
  /** Kebab-case distribution name, e.g. "crystal-pvp-bot". */
  name: string;
  version: string;
  description?: string;
  /** Entry module (built JS) relative to the package root. */
  main: string;
  /** Semver range of the Botpex kernel API this package targets. */
  kernel: { api: string };
  /** Runtime ids the package supports: "native", "mineflayer", "mock", adapter ids. */
  runtimes: string[];
  permissions?: string[];
  bot?: { displayName?: string; tags?: string[] };
  engines?: { node?: string };
}

const KEBAK = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[\w.-]+)?$/;

export function validateBotPackage(value: unknown): { ok: true; manifest: BotPackageManifest } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object') {
    return { ok: false, problems: ['botpex.json must contain a JSON object'] };
  }
  const m = value as Record<string, unknown>;
  if (m.spec !== PACKAGE_SPEC_VERSION) problems.push(`spec must be "${PACKAGE_SPEC_VERSION}"`);
  if (typeof m.name !== 'string' || !KEBAK.test(m.name)) problems.push('name must be kebab-case');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) problems.push('version must be semver (x.y.z)');
  if (typeof m.main !== 'string' || m.main.length === 0) problems.push('main (entry module) required');
  if (m.kernel === null || typeof m.kernel !== 'object' || !semver.validRange((m.kernel as { api?: string })?.api ?? '')) {
    problems.push('kernel.api must be a semver range');
  }
  if (!Array.isArray(m.runtimes) || m.runtimes.length === 0) {
    problems.push('runtimes must be a non-empty array of runtime ids');
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, manifest: value as unknown as BotPackageManifest };
}

export interface LoadedPackage {
  manifest: BotPackageManifest;
  root: string;
  entryUrl: string;
}

/**
 * Load and validate a bot package directory: reads botpex.json, validates,
 * checks the kernel API range and resolves the entry module URL.
 * Note: this does NOT execute the entry — callers import `entryUrl` after
 * validating (keeps validation before execution, see SECURITY.md).
 */
export function loadBotPackage(dir: string): LoadedPackage {
  const root = resolve(dir);
  let raw: string;
  try {
    raw = readFileSync(resolve(root, 'botpex.json'), 'utf8');
  } catch (error) {
    throw Errors.packageInvalid([`cannot read botpex.json in ${root}: ${String(error)}`]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw Errors.packageInvalid([`botpex.json is not valid JSON: ${String(error)}`]);
  }
  const res = validateBotPackage(parsed);
  if (!res.ok) throw Errors.packageInvalid(res.problems);
  const manifest = res.manifest;
  if (!semver.satisfies(KERNEL_API_VERSION, manifest.kernel.api)) {
    throw Errors.apiMismatch('adapter', manifest.name, manifest.kernel.api, KERNEL_API_VERSION);
  }
  return {
    manifest,
    root,
    entryUrl: pathToFileURL(resolve(root, manifest.main)).href
  };
}

export const SAMPLE_MANIFEST: BotPackageManifest = {
  spec: 'botpex/v1',
  name: 'example-bot',
  version: '0.1.0',
  description: 'An example Botpex distribution.',
  main: './dist/main.js',
  kernel: { api: '^0.1.0' },
  runtimes: ['mock', 'native', 'mineflayer'],
  permissions: ['movement:control', 'combat:attack', 'chat:send', 'events:subscribe', 'world:read'],
  bot: { displayName: 'Example Bot', tags: ['example'] },
  engines: { node: '>=20' }
};
