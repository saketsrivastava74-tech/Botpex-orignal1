# Licensing & attribution

## Botpex core

Apache License 2.0. See `LICENSE`. Each source file may carry the SPDX
identifier `Apache-2.0` (headers optional in this repo; the LICENSE file
governs).

## Third-party runtime dependencies (verified 2026-11-10)

| Package | License | Role |
| --- | --- | --- |
| `minecraft-protocol` | MIT | protocol encode/decode for the native runtime |
| `minecraft-data` | MIT | per-version block/item/entity/protocol data |
| `prismarine-world` | MIT | chunk storage for the native runtime |
| `prismarine-chunk` | MIT | chunk (de)serialization |
| `vec3` | MIT | vector type used by the prismarine stack |
| `mineflayer` | MIT | external engine behind its adapter |
| `semver` | ISC | manifest range checks |

Upstream notices are preserved through npm package metadata; Botpex does **not
vendor, copy or modify** third-party source. Upgrades happen via dependency
versions only.

## Policy

1. Runtime dependencies must be MIT/ISC/BSD/Apache-compatible. Copyleft
   (GPL/LGPL/AGPL) code may not be linked, bundled or vendored into the tree;
   out-of-tree integration is possible via cross-process adapters (ADP-004).
2. New dependencies require justification in the PR (size, maintenance,
   license, why the kernel can't do without it).
3. Botpex ships no Mojang game code or assets and is not affiliated with Mojang
   or Microsoft. "Minecraft" is a trademark of Mojang Synergies AB; references
   are nominative.
4. Distributions built on Botpex choose their own licenses for their own code;
   they must keep the Apache-2.0 notice for kernel files they redistribute and
   must not imply endorsement.

## Attribution

Built on the shoulders of the PrismarineJS community (protocol knowledge that
only exists because of years of reverse-engineering), GeyserMC's MCProtocolLib
(as the reference JVM design), and the broader open-source Minecraft tooling
ecosystem. See `documentation/research/RESEARCH.md` for the surveyed projects.
