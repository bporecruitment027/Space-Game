# Space Combat — Game Design Document

**Status:** Milestone 1 (Concept & Pre-Production) — proof-of-concept delivered.
**Last updated:** 2026-11-18

This document is the living design spec for the roadmap. Each milestone
below maps to the development roadmap; only Milestone 1 is implemented
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

## 3. Controls (Milestone 1)

| Input | Action |
|---|---|
| `W` / `↑` | Main thruster (forward) |
| `S` / `↓` | Retro thruster (reverse) |
| `A` `D` / `←` `→` | Yaw left/right (RCS torque) |
| `X` / `Space` | Autobrake (counter-thrust to a stop) |
| `Shift` | Boost (2× thrust, limited charge) |
| `R` | Reset to spawn |
| `C` | Toggle overhead / chase camera |
| `P` / `Esc` | Pause |

Touch controls and gamepad support are deferred to Milestone 6.

## 4. Flight model & tuning (Milestone 1)

The ship is a rigid body with mass `m` and yaw moment of inertia `I`:

- Thrust force `F = thrust · maxThrust` along the nose; `a = F / m`.
- Yaw torque `τ = yaw · maxTorque`; angular acceleration `α = τ / I`.
- **No drag, no speed cap.** Velocity persists until counter-thrust.
- Autobrake applies `maxThrust` opposing the velocity vector and clamps
  at zero speed (never reverses).

**Fighter-class placeholder stats** (`src/main.js`):

| Stat | Value | Derived |
|---|---|---|
| Mass | 1,200 kg | — |
| Max thrust | 9,000 N | 7.5 m/s² acceleration |
| Yaw inertia | 1,800 kg·m² | — |
| Max yaw torque | 2,600 N·m | 1.44 rad/s² yaw accel. |
| Boost | 2× thrust | drains 35%/s, recharges 18%/s |

Simulation runs at a fixed 120 Hz timestep, decoupled from rendering,
so motion is identical at 60 Hz and 144 Hz displays — and identical on
a future authoritative server (Milestone 4).

## 5. Technology decisions (Milestone 1)

| Concern | Choice | Rationale |
|---|---|---|
| Engine | **Three.js** (WebGL2) | Small, dependency-light, PBR-capable; glTF 2.0 loading built in for Milestone 5 assets. PlayCanvas/Babylon.js remain viable swaps if WebGPU is needed. |
| Physics | **Custom Newtonian integrator** (`src/physics/ShipPhysics.js`) | Zero WASM load latency, fully unit-testable, and the exact semantics Rapier would provide. The class is the adapter seam: Milestone 2+ can back it with Rapier without touching game code. |
| Assets | Procedural placeholder meshes | Zero downloads for the prototype; Blender → glTF 2.0 (Draco/KTX2) pipeline arrives in Milestone 5. |
| Networking | Deferred (Milestone 4) | Physics module is already render-independent so it can run server-side unchanged. |
| Packaging | Deferred (Milestone 6) | PWA manifest + service worker; pixel ratio already capped at 1.5. |

## 6. Milestone plan (from the roadmap)

- **M1 — Concept & Pre-Production (this branch):** design spec + runnable
  demo: one ship under Newtonian physics, overhead follow camera,
  keyboard thrust/rotation. ✅
- **M2 — Vertical Slice:** enemy ship with AI, projectiles, asteroid
  collisions + fragmentation, health bars, one playable arena.
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

## 7. Acceptance criteria — Milestone 1

- [x] Written design spec (this document).
- [x] Runnable browser demo: one ship with mass/inertia physics —
      thrust causes realistic drift, rotation via torque.
- [x] Overhead camera follows the ship; keyboard thrust + rotation work.
- [x] Physics unit tests pass (`npm test`).

## 8. Known risks & mitigations

- **Realistic physics feels awkward.** Mitigation: autobrake, boost,
  velocity look-ahead camera, and HUD drift readouts teach the model.
- **Engine choice locks us in.** Mitigation: rendering isolated behind
  `ShipFactory`/`Environment`/`FollowCamera`; physics has no rendering
  dependency at all.
- **Scope creep in later milestones.** Mitigation: each milestone has
  explicit acceptance criteria above; customization options are capped
  (2 weapons, 2 modules) for the MVP.
