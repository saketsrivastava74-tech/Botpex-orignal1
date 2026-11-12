# Contributing to Botpex

First: **Botpex is the kernel, not the bot.** Contributions should strengthen the common foundation —
kernel systems, runtimes, adapters, SDK, docs, tests — not harden it around one particular bot.

## Development setup

```bash
git clone <your fork>
cd Botpex
npm ci          # installs all workspaces
npm run build   # builds workspaces in dependency order
npm test        # builds, then runs the full test suite
```

Requirements: Node.js ≥ 20, npm ≥ 10.

## Repository layout

See `documentation/ARCHITECTURE.md` for the module map and the dependency rule
(`api → kernel → everything else`). In short:

- `api/` — public contracts only, zero dependencies.
- `kernel/` — the kernel systems; depends only on `api`.
- `runtimes/*` — one package per execution environment (protocol client, external engine).
- `adapters/`, `extensions/` — manifest, registry, permission infrastructure.
- `sdk/` — the developer-facing public surface.

## Ground rules

1. **The dependency rule is enforced in review.** The kernel must never import a Minecraft library,
   a runtime, or another bot framework. Protocol knowledge lives in runtimes only.
2. **No silent failures.** Unsupported operations must throw `BotpexError` with a code, details and a
   hint. Never return fake success.
3. **Capability honesty.** If you add a runtime feature, declare the capability it provides, document
   accuracy notes, and add cases to the driver contract suite (`testing/src/contract.ts`).
4. **License hygiene.** Only MIT-compatible runtime dependencies (see `documentation/LICENSING.md`).
   Never vendor third-party source; never copy code from GPL projects (e.g. Carpet) into this repo.
5. **Tests for behaviour, not for coverage numbers.** New kernel systems need unit tests; new runtime
   features need fixture tests; contract changes need contract-suite cases.
6. **Type safety.** `strict` TypeScript, no `any` in public API signatures, no non-null assertions
   without a comment explaining the invariant.

## Coding standards

- ESM only (`"type": "module"`), NodeNext module resolution, `.js` extensions in relative imports.
- Formatting: 2-space indent, double quotes, trailing commas — keep diffs minimal; a formatter config
  may be added later (open an issue first).
- Public API changes require an entry in `CHANGELOG.md` under `Unreleased` with the semver impact.
- Errors: use the factories in `@botpex/api` (`Errors.*`); never `throw new Error()` across API
  boundaries.

## Commit & PR conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`, `chore:`).
- One logical change per PR. Fill the PR template; link related issues.
- CI must pass (build + tests on Node 20 and 22).

## Versioning & release

- Semver. The kernel API version (`KERNEL_API_VERSION` in `@botpex/api`) gates adapters and
  extensions via their manifests.
- Release process: see `SECURITY.md` for reporting and `CODE_OF_CONDUCT.md` for behaviour.

## Areas that need help (see TODO.md)

- Full client physics for the native runtime (NR-010)
- Container windows over the protocol (NR-011)
- flying-squid CI integration job (NR-012)
- HeroBot / PaperMC server-side adapters (ER-003/004)
- Sandboxed extension isolation (EXT-002)
- Coverage gates (TRL-005), TypeDoc reference (DOC-004)
