# Extension guide

Extensions are permission-gated add-ons that run against a bot's facade —
behaviours, brains and hooks shipped as packages. They cannot bypass the
kernel: every capability-requiring call checks the extension's permission set.

## Manifest

```jsonc
{
  "spec": "@botpex/extension/v1",
  "id": "auto-eat",
  "name": "Auto Eat",
  "version": "1.0.0",
  "api": "^0.1.0",
  "entry": "./dist/index.js",
  "license": "MIT",
  "permissions": ["events:subscribe", "self.health", "inventory:useItem"],
  "provides": ["hooks"]
}
```

Valid permissions: `events:subscribe`, `world:read`, `movement:control`,
`combat:attack`, `inventory:read`, `inventory:equip`, `inventory:useItem`,
`chat:send`, `navigation:use`.

## Entry point

```ts
import type { ExtensionContext } from '@botpex/extensions';

export default async function activate(ctx: ExtensionContext): Promise<void> {
  ctx.on('self:health', ({ health }) => {
    if (health < 10) ctx.log.warn('low health!');
  });
}
```

## Activate on a bot

```ts
import { ExtensionHost } from '@botpex/extensions';

const host = new ExtensionHost(handle.bot, handle.kernel.bus, handle.kernel.log);
host.register(manifest, activate);
await host.activate('auto-eat');
```

## Permission model

- The extension receives a **ScopedFacade**: same `BotFacade` interface, but
  every method checks permissions.
- Missing permission → `BotpexError('BOTPEX/EXT/PERMISSION_DENIED')` with the
  extension id and the permission name. Never a silent no-op.
- `events:subscribe` gates both `ctx.on(...)` and `ctx.bot.on(...)`.

## Security model (honest scope)

0.1 runs extensions **in-process** with validated manifests, semver API
ranges, permission-gated facades and namespaced logs. This contains accidents
and enforces least privilege, but a malicious extension with granted
permissions can act within them by design. Process/worker sandboxing is
tracked as **TODO EXT-002**; until then, only install extensions you trust —
same trust model as npm dev dependencies.

## Packaging & distribution

Extensions are plain npm packages exporting their manifest + activate
function. Distribute on npm/GitHub; hosts choose what to install and grant.
See `BUILDING_DISTRIBUTIONS.md` for shipping a bot+extensions bundle.
