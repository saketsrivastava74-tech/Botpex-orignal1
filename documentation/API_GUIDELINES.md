# API guidelines

Public surface = `@botpex/api` + `@botpex/sdk`. Everything else is
kernel-internal and may change between minors. These rules keep the surface
stable, predictable and honest.

## 1. Naming

- Types: `PascalCase`, no `I` prefix (`IDriver` is historical — keep it).
- Functions: verb-first (`createBot`, `findPath`); factories: `createX`/`defineX`.
- Events: `domain:pastTenseOrNoun` (`navigation:arrived`, `combat:attack`).
- Booleans read as predicates (`isNavigating`, `connected`).

## 2. Errors

- Always `BotpexError` via the `Errors.*` factories; codes are stable API:
  `BOTPEX/<AREA>/<REASON>`.
- Every error carries `details` (structured) and `hint` (actionable) where a
  remediation exists. Bad: `"invalid slot"`. Good: `hint: 'hotbar slot must be
  0–8'`.
- Never throw plain `Error` across boundaries; never swallow — emit
  `runtime:taskFailed` or rethrow.

## 3. Async & determinism

- Kernel actions return Promises that resolve on *outcomes* (`moveTo` resolves
  on arrival, rejects on `NAV/*` codes) — not on "request accepted".
- The tick is synchronous-first: handlers that need async work schedule tasks
  (`Scheduler`), they do not block the tick.
- All time flows through injected `now`/timelines so tests are deterministic
  (`simulate()` in `@botpex/testing`).

## 4. Types

- `strict` + `noUncheckedIndexedAccess`; no `any` in public signatures.
- Snapshot types are `readonly`; treat every returned object as immutable —
  request a fresh one instead of mutating.
- Prefer discriminated unions (`Decision`, `BTStatus`) over string flags.

## 5. Versioning

- Semver. Breaking changes to `@botpex/api` bump `KERNEL_API_VERSION`; the
  adapter/extension/package hosts enforce compatibility ranges
  (`BOTPEX/ADAPTER/API_MISMATCH`).
- Deprecation protocol: mark `@deprecated` with the migration hint, keep for
  one minor, document in CHANGELOG under **Unreleased**.

## 6. Capability honesty

Any new feature surface ships with: capability key(s), `FEATURE_REQUIREMENTS`
entry (if user-facing), contract-suite cases, and notes for partial support.
See `CAPABILITIES.md`.
