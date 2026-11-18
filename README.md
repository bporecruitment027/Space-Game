# Space-Game

Browser-first realistic space combat game — overhead combat, Newtonian
(zero-gravity) flight physics, modular ships, and (from Milestone 4)
authoritative multiplayer. Built with Three.js (WebGL2).

**Current status: Milestone 3 — Core Mechanics & MVP.** Skirmish mode
with data-driven loadouts (hull + weapon + modules), laser/railgun
combat, sensor-based fog of war with a live radar, and the same
Newtonian flight model throughout. See [`docs/GDD.md`](docs/GDD.md)
for the full design spec and milestone plan.

## Run it

```bash
npm start          # serves on http://localhost:8000
```

Then open the URL, pick a loadout on the deploy screen, and fight:

| Input | Action |
|---|---|
| `W` / `↑` | Main thruster |
| `S` / `↓` | Retro thruster |
| `A` `D` / `←` `→` | Yaw (RCS) |
| `J` | Fire weapon |
| `X` / `Space` | Autobrake |
| `Shift` | Boost (limited charge) |
| `R` | Reset · `C` camera · `P` pause |

> There is **no drag** in space: cut thrust and you keep drifting.
> Watch the drift-angle readout and brake before the rocks — and
> ram-speed damage means flying into asteroids hurts you. Enemies
> outside your sensor range appear as fading ghosts on the radar.

## Test

```bash
npm test           # physics + combat + modules/sensors unit tests
npm run smoke      # headless boot of the full module graph
```

## Layout

```
index.html            Demo page + HUD/controls/loadout overlay
styles.css            HUD + loadout screen styling
src/
  main.js             Bootstrap + fixed-timestep game loop
  Game.js             Orchestrator: ships, AI, weapons, sensors, rules
  physics/            Render-independent Newtonian physics (server-ready)
  input/              Keyboard → command mapping
  ship/               Procedural placeholder ship mesh
  world/              Starfield, reference grid, dynamic asteroids
  combat/             EnemyAI + pooled projectile system
  entities/           Ship (physics + health + weapon + mesh)
  modules/            Data-driven loadout tables (hulls/weapons/modules)
  systems/            Sensors: contact tracking + fog of war
  camera/             Overhead/chase follow camera
  ui/                 HUD (compass + radar), loadout picker
test/                 Physics, combat, and modules/sensors unit tests + smoke
docs/GDD.md           Game Design Document + milestone roadmap
vendor/               Vendored Three.js build (demo runs offline)
```

## Roadmap

M1 Concept & prototype ✅ → M2 Vertical slice (enemy, weapons, asteroid
collisions) ✅ → M3 MVP (loadouts, sensors, skirmish) ✅ → M4
Multiplayer (authoritative server) → M5 Content (mining, economy, more
ships) → M6 Optimization & PWA → M7 Release. Details in
`docs/GDD.md` §8.
