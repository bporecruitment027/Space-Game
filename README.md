# Space-Game

Browser-first realistic space combat game — overhead combat, Newtonian
(zero-gravity) flight physics, modular ships, and (from Milestone 4)
authoritative multiplayer. Built with Three.js (WebGL2).

**Current status: Milestone 4 — Multiplayer.** Skirmish mode with
data-driven loadouts (hull + weapon + modules), laser/railgun combat,
sensor-based fog of war with a live radar, and an authoritative
multiplayer server (fixed-tick simulation, clients send inputs only).
See [`docs/GDD.md`](docs/GDD.md) for the full design spec and milestone
plan.

## Run it

```bash
npm start          # serves the game on http://localhost:8000
npm run server     # starts the authoritative multiplayer server (ws://localhost:8080)
```

Open the game, pick a loadout on the deploy screen, and fight. To play
multiplayer, click **MULTIPLAYER** on the controls panel, enter the
server URL (default `ws://<host>:8080`), and join — the server owns all
physics; your client sends input and renders the broadcast state. A live
kill leaderboard appears in the corner while connected.

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
npm test           # physics + combat + modules/sensors + networking unit tests
npm run smoke      # headless boot of the full module graph
node test/e2e-check.mjs   # live end-to-end check (needs a running server)
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
  net/                NetworkClient: snapshot rendering + input sending
  ui/                 HUD (compass + radar), loadout picker, MP overlay
server/               Authoritative GameServer (ws) + entry point
test/                 Physics, combat, modules/sensors, networking tests
                   + smoke + live e2e check
docs/GDD.md           Game Design Document + milestone roadmap
vendor/               Vendored Three.js build (demo runs offline)
```

## Roadmap

M1 Concept & prototype ✅ → M2 Vertical slice (enemy, weapons, asteroid
collisions) ✅ → M3 MVP (loadouts, sensors, skirmish) ✅ → M4 Multiplayer
(authoritative server, networked client) ✅ → M5 Content (mining,
economy, more ships) → M6 Optimization & PWA → M7 Release. Details in
`docs/GDD.md` §8.
