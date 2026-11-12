# Botpex — Stage 1 Research Report

> Research date: 2026-11-10 · Scope: existing Minecraft bot frameworks, their architecture, licenses,
> limitations and integration possibilities, plus Minecraft server integration options.
> All findings below were verified against live sources on the research date; links are cited inline.

## 1. Ecosystem context

Minecraft Java Edition moved to **calendar-year versioning in December 2025**: the major version is the
release year ("26" for 2026) followed by the drop number, e.g. `26.1` ("Tiny Takeover", released
2026-03-24) with hotfixes like `26.1.1` ([minecraft.net announcement](https://www.minecraft.net/en-us/article/minecraft-new-version-numbering-system),
[minecraft.wiki/w/Java_Edition_26.1](https://minecraft.wiki/w/Java_Edition_26.1)).
Protocol-level tooling therefore has to track a **moving version matrix**, which directly motivates
Botpex's compatibility layer and capability-discovery design (ADR-002, ADR-003).

There are two fundamentally different places a "player-like bot" can live:

1. **Protocol clients** — a separate process speaks the Minecraft protocol to a server, exactly like a
   real player's client. Full realism, but the bot must implement client-side physics, world decoding
   and packet-level behaviour, and it is subject to server-side anti-cheat validation.
2. **Server-side fake players** — code running inside the server (plugin/mod) spawns a real server-side
   player entity. Movement/combat are server-authoritative (no anti-cheat issues), but the bot is tied
   to one server implementation.

## 2. Framework survey

| Project | Language / platform | License (verified) | Versions | Architecture notes | Relevance to Botpex |
| --- | --- | --- | --- | --- | --- |
| [Mineflayer](https://github.com/PrismarineJS/mineflayer) | Node.js/TS | MIT (repo LICENSE) | 1.8 → 26.1 (README); 1.21.11 confirmed working per maintainer in [#3893](https://github.com/PrismarineJS/mineflayer/issues/3893) | Monolithic `bot` object + plugin system; entity tracking, physics, pathfinding plugin ([pathfinder](https://context7.com/prismarinejs/mineflayer-pathfinder)), [pvp](https://prismarinejs.github.io/mineflayer), [collectblock](https://github.com/PrismarineJS/mineflayer-collectblock) | The most complete open bot stack. Prime candidate for an **external engine adapter**. Not a kernel: protocol, physics, AI are tightly coupled in one object graph. |
| [node-minecraft-protocol](https://github.com/PrismarineJS/node-minecraft-protocol) | Node.js | MIT ([library list](https://minecraft.wiki/w/Minecraft_Wiki:Projects/wiki.vg_merge/Library_List)) | 1.7.10 → 26.1 (README, v1.68.0 published 2026-08) | Parse/serialize every packet, auth (online+offline), encryption, keep-alive. A **library, not a bot framework**. | Foundation for Botpex's **native runtime** (protocol layer only). Using it does not couple the kernel to any bot framework. |
| [prismarine-world](https://www.npmjs.com/package/prismarine-world) / [prismarine-chunk](https://github.com/PrismarineJS/prismarine-chunk) | Node.js | MIT (npm / repo LICENSE) | 1.8 → 1.20+ chunk formats | Infinite chunk storage, block get/set, column (de)serialization. | World-state substrate for the native runtime's world tracker. |
| [MCProtocolLib](https://github.com/GeyserMC/MCProtocolLib) | Java | MIT ([repo](https://github.com/GeyserMC/MCProtocolLib)) | Tracks latest MC (1.21.4-1 release line) | Protocol client/server library used by Geyser. | Reference for a future **JVM kernel distribution**; Botpex's adapter spec keeps that door open (ADR-001). |
| [Botcraft](https://github.com/adepierre/Botcraft) | C++ | MIT | Modern versions | Cross-platform protocol bot with optional renderer. | Proof that independent protocol stacks exist; not integrated in 0.1. |
| [HeroBot](https://github.com/HerobaneNair/HeroBot) | Java (Fabric mod) | Repo-published, see repo | Fabric server-side | **Framework for fabric-based server-side players** "made for datapack makers to make bots that can fight back… much higher parity with a vanilla client compared to carpet" ([CurseForge page](https://www.curseforge.com/minecraft/mc-mods/herobot), ~104K downloads). | Confirms demand for server-side, combat-capable bot frameworks. Candidate for a future **server-side adapter** family; not a 0.1 integration. |
| Carpet `/player` bots | Java (Fabric mod) | LGPL-3.0 (upstream) | Modern | Command-spawned server-side fake players. | The classic server-side approach; API surface too narrow to build a kernel on. |
| [FakePlayerPlugin](https://hangar.papermc.io/Janky-Development/FakePlayerPlugin) (Paper) | Java | MIT | Paper 1.21 → 26.3, Folia-ready | Server-side bot entities with A* pathfinding, PvE combat, dig/place. | Shows the Paper API **can** host player-like bots at scale; informs the "server integration" adapter category. |
| [FakePlayer-CE](https://hangar.papermc.io/EndlessPixel/FakePlayer-CE) (Paper) | Java | Open source | 1.20.1 → 26.3 | Community fork of Carpet-style FakePlayer, Gradle multi-module. | Same category as above. |
| [flying-squid](https://github.com/PrismarineJS/flying-squid) | Node.js | MIT | ~1.8 → 1.21 | Full Minecraft server in JS. | **Integration-test target**: spin a local server in CI and verify the native runtime end-to-end. |

Server-side integration on Paper generally requires non-public entity plumbing
(`EntityPlayer` construction — see [Paper discussion #10584](https://github.com/PaperMC/Paper/discussions/10584));
there is no stable public "spawn a controllable player" API, which means any Paper adapter must pin
against a specific API surface and be kept in its own adapter module (ADR-006 isolation).

## 3. License analysis

- The entire PrismarineJS stack (mineflayer, node-minecraft-protocol, prismarine-world/chunk,
  minecraft-data) is **MIT-licensed**. MCProtocolLib is MIT. FakePlayerPlugin is MIT.
- MIT code is compatible with the Apache-2.0 core: Botpex may depend on MIT packages at runtime and
  must retain copyright/license notices (done via `documentation/LICENSING.md` + upstream NOTICE files,
  shipped through npm's package metadata rather than vendoring source).
- **Policy adopted:** Botpex never copies, bundles, redistributes or modifies external project code;
  external engines are consumed through adapters as versioned dependencies, or connected as external
  processes. Anything GPL/LGPL (e.g. Carpet) is kept strictly out-of-tree.
- Minecraft itself: Mojang's EULA governs servers/clients; Botpex ships no Mojang code or assets and
  documents an anti-abuse stance (no x-ray, no cheat modules, respect server rules) in SECURITY.md /
  CONTRIBUTING.md.

## 4. Gap analysis — why a kernel

Studied solutions share these weaknesses:

1. **Monolithic coupling.** Mineflayer fuses protocol, physics, entity tracking and AI into one object;
   you cannot swap the runtime without forking the framework.
2. **No capability honesty.** Frameworks expose one API and fail (or silently no-op) when a feature is
   unavailable for a version/backend; callers cannot discover what a backend supports.
3. **No distribution model.** Nobody can take "the kernel" and ship a distinct bot product/distribution
   the way Linux distros ship an OS. Bot projects are forks, not distributions.
4. **No packaging/dependency story for bots** (manifests, permission model, version ranges).
5. **Weak multi-bot story.** Most frameworks assume one bot per process with ad-hoc scaling.

Botpex addresses these directly: hybrid kernel with pluggable runtimes (§ADR-002), explicit capability
negotiation (ADR-003), bot package specification + permission model (ADR-007), and a scheduler designed
for many bot instances per process (ADR-005).

## 5. Design implications

1. Build the **kernel as a zero-dependency TypeScript library** over abstract ports (`IDriver`,
   `IWorldView`); protocol access via `node-minecraft-protocol` lives only in the native runtime package;
   Mineflayer lives only in its adapter package.
2. The native runtime is **our own bot core on top of protocol primitives** (position, world, entity,
   inventory, combat packets) — it does not import Mineflayer. Mineflayer is an *external engine* adapter,
   symmetric with any future HeroBot/Botcraft adapter.
3. Expose a **unified capability map** at connect time; every feature request is gated and every
   unsupported operation fails loudly with an actionable error (never silently).
4. Ship a **driver contract test suite** that every runtime must pass, so "unified API" is enforced by CI,
   not by documentation.
5. Target the version matrix through a **compatibility package** with data refreshed from minecraft-data;
   0.1 explicitly targets vanilla servers in the 1.20.4 → 26.1 range with per-version notes, and
   declares per-capability accuracy notes (e.g. item naming exact for 1.13+, chat signing limitations
   on 1.19.1+).
