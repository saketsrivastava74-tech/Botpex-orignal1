# basic-bot template

Scaffold with `botpex init my-bot`. Structure:

```
my-bot/
├── botpex.json      # Botpex package manifest (name, runtimes, permissions)
├── package.json
├── tsconfig.json
└── src/main.ts      # your bot: behaviours, brain, FSM
```

Run `npm run dev` for the deterministic mock runtime, `npm run start:native`
for a real server. Publish your bot by building and distributing the folder —
it is a self-contained Botpex distribution (see
documentation/BUILDING_DISTRIBUTIONS.md).
