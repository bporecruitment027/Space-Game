# Space Combat — Game Design Document

**Status:** Milestone 3 (Core Mechanics & MVP) — loadouts, sensors, and skirmish mode delivered.
**Last updated:** 2026-11-18

This document is the living design spec for the roadmap. Each milestone
below maps to the development roadmap; Milestones 1–3 are implemented
in this branch. Later milestones extend it without changing the core
flight model.

---

## 1. High concept

A browser-first, realistic space combat game. Ships fly with **Newtonian
(zero-gravity) physics**: thrust accelerates, nothing slows you down, and
the only way to stop is to burn retro thrust. Combat is overhead
(top-down) with sensor ranges, modular ship loadouts, and destructible
asteroid fields. Target: modern WebGL2/WebGPU-capable browsers, 60 fps
on desktop, ~30 fps on mobile.

## 2. Design pillars

1. **Physics you can feel.** Drift, momentum, and braking are the game.
   The HUD teaches them (velocity vector, drift angle) instead of hiding
   them behind arcade damping.
2. **Readable combat.** Overhead camera, clear sensor contacts, instant
   feedback on hits. If a player can't tell what happened, the UI failed.
3. **Modular ships.** Hull + engine + weapon modules define stats and
   behaviour; loadouts are data, not code (Milestone 3+).
4. **Performance budget first.** Instancing, object pooling, capped
   pixel ratio, compressed assets — designed in from Milestone 1.

## 3. Controls

| Input | Action |
|---|---|
| `W` / `↑` | Main thruster (forward) |
| `S` / `↓` | Retro thruster (reverse) |
| `A` `D` / `←` `→` | Yaw left/right (RCS torque) |
| `J` | Fire laser cannon |
| `X` / `Space` | Autobrake (counter-thrust to a stop) |
| `Shift` | Boost (2× thrust, limited charge) |
| `R` | Reset the run (respawn player, clear score) |
| `C` | Toggle overhead / chase camera |
| `P` / `Esc` | Pause |

Touch controls and gamepad support are deferred to Milestone 6.

## 4. Flight model & tuning

The ship is a rigid body with mass `m` and yaw moment of inertia `I`:

- Thrust force `F = thrust · maxThrust` along the nose; `a = F / m`.
- Yaw torque `τ = yaw · maxTorque`; angular acceleration `α = τ / I`.
- **No drag, no speed cap.** Velocity persists until counter-thrust.
- Autobrake applies `maxThrust` opposing the velocity vector and clamps
  at zero speed (never reverses).

**Fighter-class placeholder stats** (`src/Game.js`):

| Stat | Player | Enemy |
|---|---|---|
| Mass | 1,200 kg | 950 kg |
| Max thrust | 9,000 N (7.5 m/s²) | 7,200 N (7.6 m/s²) |
| Yaw inertia | 1,800 kg·m² | 2,400 kg·m² (turns slower) |
| Max yaw torque | 2,600 N·m | 3,000 N·m |
| Hull | 100 HP | 60 HP |
| Boost | 2× thrust | — |

Boost drains 35%/s and recharges 18%/s.

Simulation runs at a fixed 120 Hz timestep, decoupled from rendering,
so motion is identical at 60 Hz and 144 Hz displays — and identical on
a future authoritative server (Milestone 4).

## 5. Combat systems (Milestone 2)

**Entities.** `Ship` (shared by player and enemies) pairs `ShipPhysics`
with a health pool, spawn protection, and damage flashing. Enemy ships
use the same physics with slightly different tuning so the player can
tell friend and foe apart by feel.

**Weapons.** Lasers fire straight-line bolts (no leading, no drag —
ballistic in the Newtonian sense). Bolts inherit ~50% of the ship's
velocity, are pooled (160 instances, no per-shot allocation), and
expire after ~2.2 s. A bolt never hits its own ship.

**Asteroids.** The field drifts ballistically and tumbles. Bolts chip
them (mass-proportional HP); a rock past its damage threshold
fragments into two smaller chunks flying apart, down to a minimum
radius. Ramming an asteroid deals closing-speed-scaled damage to the
ship and pushes both apart. The field trickles respawns so the arena
keeps cover without a level file.

**Enemy AI.** Simple steering state machine (behaviour trees arrive in
M3): close distance when far, hold range and yaw to aim when in
weapon range, fire only when aligned, flee at low health, and steer
around asteroids between ship and target. The AI's yaw rate is capped
so a skilled player can out-turn it.

**Ramming.** Ships ramming each other trade damage scaled by closing
speed. Enemy kills award 100 points and respawn after a short delay.

**Game loop.** `Game.step(dt, playerInput)` is the single simulation
entry point: AI decisions → ship updates → bolt/collision rules →
death checks. It is rendering-agnostic, so the same step runs in tests
and, in Milestone 4, on the authoritative server.

## 6. Loadouts & sensors (Milestone 3)

**Loadouts are data.** A loadout is `{ hull, weapon, modules[] }` and
all derived stats come from `src/modules/Modules.js`:

| Part | Options | Effect |
|---|---|---|
| Hull | Fighter, Bulwark | mass, inertia, thrust, base HP, size |
| Weapon | Laser, Railgun | damage, fire rate, bolt speed |
| Modules (max 2) | Sensor Array, Reinforced Armor | +sensor range, +HP |

The loadout picker validates selections and shows derived stats before
deploy. `Game.deploy(loadout)` rebuilds the player ship from the
composition — adding a new hull or weapon is a table entry, not code.

**Sensors & fog of war.** Every ship has a sensor range (base 65 m,
+70 m with Sensor Array). Targets within range become **live contacts**
(radar: solid marker); when they leave range they decay into **ghosts**
(fading outline) over ~4.5 s and then vanish — unless re-detected. The
radar shows both, so the player can read pursuit from the last-known
positions. A target that was never detected produces no contact at all.

**Skirmish flow.** Loadout screen → deploy → fight → on death, back to
the loadout screen with the score shown. The run loop is driven by
`Game`'s state machine: `deploying` → `running` → `over` → `deploying`.

## 7. Technology decisions

| Concern | Choice | Rationale |
|---|---|---|
| Engine | **Three.js** (WebGL2) | Small, dependency-light, PBR-capable; glTF 2.0 loading built in for Milestone 5 assets. PlayCanvas/Babylon.js remain viable swaps if WebGPU is needed. |
| Physics | **Custom Newtonian integrator** (`src/physics/ShipPhysics.js`) | Zero WASM load latency, fully unit-testable, and the exact semantics Rapier would provide. The class is the adapter seam: Milestone 2+ can back it with Rapier without touching game code. |
| Assets | Procedural placeholder meshes | Zero downloads for the prototype; Blender → glTF 2.0 (Draco/KTX2) pipeline arrives in Milestone 5. |
| Networking | Deferred (Milestone 4) | Physics module is already render-independent so it can run server-side unchanged. |
| Packaging | Deferred (Milestone 6) | PWA manifest + service worker; pixel ratio already capped at 1.5. |

## 8. Milestone plan (from the roadmap)

- **M1 — Concept & Pre-Production:** design spec + runnable
  demo: one ship under Newtonian physics, overhead follow camera,
  keyboard thrust/rotation. ✅
- **M2 — Vertical Slice (this branch):** enemy ship with AI,
  projectiles, asteroid collisions + fragmentation, health bars, one
  playable arena. ✅
- **M3 — Core Mechanics & MVP:** ship customization (hull + weapon
  modules), sensor/fog-of-war contacts, full UI overlays, skirmish mode.
- **M4 — Multiplayer:** authoritative Node.js server (Socket.IO/ws),
  fixed-tick simulation, clients send inputs only.
- **M5 — Content Expansion:** more hulls/weapons (laser, railgun,
  missile), asteroid mining + resource economy, upgrades.
- **M6 — Optimization & Deployment:** LOD/instancing, KTX2/Draco assets,
  PWA + optional Capacitor/TWA wrappers, 60 fps desktop / 30 fps mobile.
- **M7 — Release & Post-Release:** Playwright tests, Sentry telemetry,
  store submission, live-ops patches.

## 9. Acceptance criteria

**Milestone 1**
- [x] Written design spec (this document).
- [x] Runnable browser demo: one ship with mass/inertia physics —
      thrust causes realistic drift, rotation via torque.
- [x] Overhead camera follows the ship; keyboard thrust + rotation work.
- [x] Physics unit tests pass (`npm test`).

**Milestone 2**
- [x] Enemy ship with AI (close, hold, aim, fire, flee, avoid).
- [x] Projectiles: pooled laser bolts, damage, owner-safe collisions.
- [x] Asteroid field: drift, chip damage, fragmentation, ram damage.
- [x] Health bars for player and enemies; score and kill counter.
- [x] One playable arena; reset and game-over flows work.
- [x] Combat unit tests pass (`npm test` — 22 tests).

**Milestone 3**
- [x] Loadout system: hull + weapon + module slots, all data-driven
      (`src/modules/Modules.js`); stats derived from the composition.
- [x] Skirmish mode: loadout-picker screen with live stat preview,
      deploy → fight → game-over → redeploy loop.
- [x] Sensors + fog of war: contacts within range are live, lost
      contacts decay to fading ghosts on the radar.
- [x] Radar overlay: live contacts (solid) vs ghosts (fading outline).
- [x] Weapon variety: laser (fast, light) and railgun (slow, heavy).
- [x] Module variety: Sensor Array (+range), Reinforced Armor (+HP).
- [x] Module + sensor unit tests pass (`npm test` — 39 tests).

## 10. Known risks & mitigations

- **Realistic physics feels awkward.** Mitigation: autobrake, boost,
  velocity look-ahead camera, and HUD drift readouts teach the model.
- **Engine choice locks us in.** Mitigation: rendering isolated behind
  `ShipFactory`/`Environment`/`FollowCamera`; physics has no rendering
  dependency at all.
- **Scope creep in later milestones.** Mitigation: each milestone has
  explicit acceptance criteria above; customization options are capped
  (2 weapons, 2 modules) for the MVP.
