# Space-Game

Browser-first realistic space combat game — overhead combat, Newtonian
(zero-gravity) flight physics, modular ships, and (from Milestone 4)
authoritative multiplayer. Built with Three.js (WebGL2).

**Current status: Milestone 1 — Concept & Pre-Production.** A runnable
proof-of-concept: one ship under mass/inertia physics with an overhead
follow camera. See [`docs/GDD.md`](docs/GDD.md) for the full design
spec and milestone plan.

## Run it

```bash
npm start          # serves on http://localhost:8000
```

Then open the URL and fly:

| Input | Action |
|---|---|
| `W` / `↑` | Main thruster |
| `S` / `↓` | Retro thruster |
| `A` `D` / `←` `→` | Yaw (RCS) |
| `X` / `Space` | Autobrake |
| `Shift` | Boost (limited charge) |
| `R` | Reset · `C` camera · `P` pause |

> There is **no drag** in space: cut thrust and you keep drifting.
> Watch the drift-angle readout and brake before the rocks.

## Test

```bash
npm test           # physics unit tests (Node's built-in runner)
```

## Layout

```
index.html            Demo page + HUD overlay
styles.css            HUD styling
src/
  main.js             Bootstrap + fixed-timestep game loop
  physics/            Render-independent Newtonian physics (server-ready)
  input/              Keyboard → command mapping
  ship/               Procedural placeholder ship mesh
  world/              Starfield, reference grid, placeholder asteroids
  camera/             Overhead/chase follow camera
  ui/                 Flight readouts (velocity, drift, energy)
test/                 Physics unit tests
docs/GDD.md           Game Design Document + milestone roadmap
vendor/               Vendored Three.js build (demo runs offline)
```

## Roadmap

M1 Concept & prototype ✅ → M2 Vertical slice (enemy, weapons, asteroid
collisions) → M3 MVP (customization, sensors, AI) → M4 Multiplayer
(authoritative server) → M5 Content (mining, economy, more ships) →
M6 Optimization & PWA → M7 Release. Details in `docs/GDD.md` §6.
