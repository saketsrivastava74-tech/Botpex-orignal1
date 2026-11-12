# Integration tests (opt-in)

These tests require a real Minecraft server. They are skipped unless
`BOTPEX_MC_HOST` is set:

```bash
# against a local vanilla/paper/flying-squid server
BOTPEX_MC_HOST=localhost BOTPEX_MC_PORT=25565 BOTPEX_MC_USER=Tester \
  npx vitest run tests/integration
```

Recommended local target: [flying-squid](https://github.com/PrismarineJS/flying-squid)
(a full Minecraft server in JS, ideal for CI; supports 1.8–1.21) or any
vanilla server in the supported matrix (see `@botpex/compatibility`).
