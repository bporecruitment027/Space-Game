# Space-Game

Browser-first realistic space combat game — overhead combat, Newtonian
(zero-gravity) flight physics, modular ships, and (from Milestone 4)
authoritative multiplayer. Built with Three.js (WebGL2).

**Current status: Milestone 2 — Vertical Slice.** A playable combat
prototype: your ship plus hostile AI, laser projectiles, a fragmenting
asteroid field, and health bars — all on the same Newtonian flight
model. See [`docs/GDD.md`](docs/GDD.md) for the full design spec and
milestone plan.

## Run it

```bash
npm start          # serves on http://localhost:8000
```

Then open the URL and fight:

| Input | Action |
|---|---|
| `W` / `↑` | Main thruster |
| `S` / `↓` | Retro thruster |
| `A` `D` / `←` `→` | Yaw (RCS) |
| `J` | Fire laser |
| `X` / `Space` | Autobrake |
| `Shift` | Boost (limited charge) |
| `R` | Reset · `C` camera · `P` pause |

> There is **no drag** in space: cut thrust and you keep drifting.
> Watch the drift-angle readout and brake before the rocks — and
> ram-speed damage means flying into asteroids hurts you.

## Test

```bash
npm test           # physics + combat unit tests (Node's built-in runner)
npm run smoke      # headless boot of the full module graph
```

## Layout

```
index.html            Demo page + HUD/controls overlay
styles.css            HUD styling
src/
  main.js             Bootstrap + fixed-timestep game loop
  Game.js             Orchestrator: ships, AI, weapons, collisions, rules
  physics/            Render-independent Newtonian physics (server-ready)
  input/              Keyboard → command mapping
  ship/               Procedural placeholder ship mesh
  world/              Starfield, reference grid, dynamic asteroids
  combat/             EnemyAI + pooled projectile system
  entities/           Ship (physics + health + mesh)
  camera/             Overhead/chase follow camera
  ui/                 Flight readouts (velocity, drift, energy)
test/                 Physics + combat unit tests, headless smoke test
docs/GDD.md           Game Design Document + milestone roadmap
vendor/               Vendored Three.js build (demo runs offline)
```

## Roadmap

M1 Concept & prototype ✅ → M2 Vertical slice (enemy, weapons, asteroid
collisions) ✅ → M3 MVP (customization, sensors, AI) → M4 Multiplayer
(authoritative server) → M5 Content (mining, economy, more ships) →
M6 Optimization & PWA → M7 Release. Details in `docs/GDD.md` §7.
