# Space-Game

Browser-first realistic space combat game — overhead combat, Newtonian
(zero-gravity) flight physics, modular ships, and (from Milestone 4)
authoritative multiplayer. Built with Three.js (WebGL2).

**Current status: Milestone 5 — Content Expansion + Falling Frontier overhaul.**
Skirmish mode with
data-driven loadouts (four hulls, three weapons including homing
missiles, three modules), laser/railgun/missile combat, sensor-based fog
of war with a live radar, an authoritative multiplayer server, and an
asteroid-mining ore economy with a repeatable upgrade shop — restyled
toward Falling Frontier's military space-combat-sim look (explosive
destruction, CIW point defense, missile detonations against asteroid
cover, broadside cannons, LiDAR scan flavour). See
[`docs/GDD.md`](docs/GDD.md) for the full design spec and milestone
plan.

## Run it

```bash
npm run deploy     # one command: demo + multiplayer server (http://localhost:8000, ws://localhost:8137)
npm start          # just the single-player demo (http://localhost:8000)
npm run server     # just the authoritative multiplayer server (ws://localhost:8080)
```

Open the game, pick a loadout on the deploy screen, and fight. Shoot
asteroids down to mine **ore**, then spend it on upgrades in the loadout
shop (damage, hull, thrust, sensor, repair — repeatable levels that
persist across deploys). To play
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

## Deploy

The game is a **static site** — no build step, no bundler. `index.html`
plus `src/`, `vendor/`, and `styles.css` can be dropped onto any static
host (or opened via any static file server) and it runs.

**Single-player (all features):** serve the repo root over HTTP. The
built-in server disables caching so reloads always pick up fresh code:

```bash
npm start                        # or: node server/staticServer.js [port]
PORT=3000 npm start              # custom port
```

**Multiplayer:** the authoritative server is a small Node process with
one dependency (`ws`). It needs a reachable WebSocket port; start it
next to the static host and point clients at its URL:

```bash
npm run server                   # ws://localhost:8080 by default
PORT=9000 TICK_RATE=30 MAX_PLAYERS=6 ENEMY_COUNT=4 npm run server
```

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | static demo port (`npm start`) |
| `WS_PORT` | `8137` | multiplayer WebSocket port (`npm run deploy`) |
| `TICK_RATE` | `30` | server simulation rate (Hz) |
| `MAX_PLAYERS` | `6` | max concurrent players |
| `ENEMY_COUNT` | `4` | enemy ships in the shared world |

`npm run deploy` runs both together with prefixed logs — the simplest
local or single-machine deploy.

## Test

```bash
npm test           # physics + combat + modules + upgrades + networking tests
npm run smoke      # headless boot of the full module graph
node test/e2e-check.mjs    # live end-to-end check (needs a running server)
node test/e2e-m5-check.mjs # live M5 check: mine ore → buy upgrade
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
  modules/            Data-driven loadout tables + upgrade defs
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
(authoritative server, networked client) ✅ → M5 Content (four hulls,
homing missiles, asteroid mining + ore economy, upgrades) ✅ → M6
Optimization & PWA → M7 Release. Details in `docs/GDD.md` §8.
