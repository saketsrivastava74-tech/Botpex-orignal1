# patrol-guard

An example **distribution** built on Botpex: a guard that patrols waypoints,
detects hostiles within `--radius`, engages them with the kernel combat
system (reach + line-of-sight + cooldowns), and resumes its route.

```bash
npm run start                        # mock runtime with a scripted zombie intrusion
npm run start:native -- --host localhost --username Guard --radius 10
```

Read `src/main.ts` top-to-bottom — it is the template for real bot products:
FSM ↔ behaviour tree ↔ brain ↔ kernel systems, each doing one job.
