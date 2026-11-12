<!--
Thank you for contributing to Botpex!

Rules of thumb:
- The kernel never imports Minecraft libraries or bot frameworks (dependency rule).
- Unsupported operations must fail loudly (BotpexError with code + hint), never silently.
- New runtime features need a capability declaration + contract-suite cases.
- Only MIT-compatible dependencies; never vendor third-party code.
-->

## Summary

What does this PR change and why? Link issues (`Fixes #...`, `Refers to TODO.md ID`).

## Checklist

- [ ] `npm run build` passes
- [ ] `npm test` passes (unit + contract + E2E)
- [ ] New behaviour is covered by tests (unit / fixture / contract)
- [ ] Public API changes: `CHANGELOG.md` entry added; `KERNEL_API_VERSION` bumped if `@botpex/api` contracts changed
- [ ] Capability map updated if runtime feature surface changed
- [ ] Docs updated (README / `documentation/*` / TODO.md statuses)
- [ ] No new dependencies, or they are MIT-compatible and justified below

## Notes for reviewers

Anything subtle: invariants, trade-offs, benchmarks before/after.
