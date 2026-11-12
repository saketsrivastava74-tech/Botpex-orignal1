# Bot package specification — `botpex.json` v1

> Spec id: `botpex/v1` · Validator: `@botpex/package-spec` · Status: stable for 0.1

A bot package is a directory containing `botpex.json`. The loader
(`loadBotPackage(dir)`) reads, validates and resolves the entry **without
executing it** — validation happens before any code runs (see SECURITY.md).

## Fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `spec` | string | ✓ | exactly `"botpex/v1"` |
| `name` | string | ✓ | kebab-case (`/^[a-z0-9]+(-[a-z0-9]+)*$/`) |
| `version` | string | ✓ | semver `x.y.z[-prerelease]` |
| `description` | string | – | one line |
| `main` | string | ✓ | path to built entry JS, relative to package root |
| `kernel.api` | string | ✓ | semver **range** against `KERNEL_API_VERSION` |
| `runtimes` | string[] | ✓ | non-empty; subset of `mock`, `native`, `mineflayer`, registered adapter ids |
| `permissions` | string[] | – | declared permission usage (documentation/consent) |
| `bot.displayName` | string | – | human name |
| `bot.tags` | string[] | – | discovery tags |
| `engines.node` | string | – | e.g. `">=20"` |

Validation errors aggregate: all problems are reported at once with
`BOTPEX/PKG/INVALID`.

## Example

```jsonc
{
  "spec": "botpex/v1",
  "name": "survival-automation-bot",
  "version": "1.2.0",
  "description": "Farms, mines and stocks chests while you are away.",
  "main": "./dist/main.js",
  "kernel": { "api": "^0.1.0" },
  "runtimes": ["native", "mineflayer"],
  "permissions": ["world:read", "events:subscribe", "movement:control", "navigation:use", "combat:attack", "inventory:read", "inventory:equip", "inventory:useItem"],
  "bot": { "displayName": "Survival Automation Bot", "tags": ["survival", "automation"] },
  "engines": { "node": ">=20" }
}
```

## Versioning policy

- Distribution version is independent of the kernel version.
- `kernel.api` ranges follow npm semver semantics; `^0.1.0` means
  `>=0.1.0 <0.2.0` (0.x is treated as unstable upstream — intended).
- Breaking kernel API changes bump `KERNEL_API_VERSION`; old distributions
  keep working against older kernels they pin.

## Extension packages

Extensions use their own manifest (`@botpex/extension/v1`) — see
`EXTENSION_GUIDE.md`. A distribution may bundle extensions by activating them
from its entry.
