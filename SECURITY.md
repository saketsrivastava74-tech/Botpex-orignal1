# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ active development line |

## Reporting a vulnerability

**Do not open a public issue for security reports.**

1. Use GitHub's *Private vulnerability reporting* on this repository (Security tab → Report a
   vulnerability), or
2. Email the maintainers at `security@botpex.invalid` (placeholder until the project has a permanent
   domain — replace before public release).

Include: affected package(s) (`@botpex/*`), a minimal reproduction, impact assessment, and any
known workarounds. You will receive an acknowledgement within **5 business days** and a status update
at least every **7 days** until resolution.

## Coordinated disclosure

- We validate, develop a fix, and release a patch before public disclosure.
- Credit is given to reporters in the release notes unless anonymity is requested.
- We ask for **90 days** embargo from the initial report before public details are shared.

## Security model (what is in scope)

- **Extension/adapter loading:** manifests are validated (schema, semver API ranges, capability grants).
  0.1 runs extensions in-process with permission-gated facades — a malicious extension with granted
  permissions *can* act within them by design; sandbox escape scenarios (EXT-002) are in scope and on
  the roadmap.
- **Package loading (`botpex.json`):** validation must not execute package code before validation.
- **Kernel:** event-bus error isolation (one handler must not break the tick), watchdog denial paths,
  unbounded memory growth (chunk/entity caches), path node budget exhaustion.
- **Network runtimes:** packet parser robustness against malformed server data (all parses are
  defensive; malformed input degrades to warnings, never crashes the process).

## Anti-abuse stance

Botpex deliberately provides **no cheat features**: no x-ray (world queries are limited to data the
server has sent), no movement exploits, no packet forgery beyond what the protocol requires. Operators
are responsible for complying with the rules of the servers they connect to. Tooling primarily intended
to attack servers or other players is out of scope for this project and such PRs/issues will be closed.
