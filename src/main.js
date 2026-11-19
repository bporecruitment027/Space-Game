/**
 * main.js — bootstrap: Newtonian space combat vertical slice.
 * See docs/GDD.md for the full design spec.
 *
 * Game loop notes:
 *   - Fixed-timestep physics (120 Hz) decoupled from rendering, so the
 *     simulation is deterministic regardless of display refresh rate.
 *     This is the same pattern Milestone 4's authoritative server needs.
 *   - The Game class owns all rules (ships, AI, weapons, collisions);
 *     this file only wires rendering, input, and UI to it.
 *
 * Milestone 4 — two modes:
 *   - 'local':  the local Game simulates everything (solo skirmish).
 *   - 'network': the authoritative GameServer owns all state; this
 *     client sends input commands and renders the broadcast snapshots
 *     via NetworkClient. No local physics is run in this mode.
 */

import * as THREE from 'three';
import { KeyboardInput } from './input/KeyboardInput.js';
import { createEnvironment } from './world/Environment.js';
import { Effects } from './world/Effects.js';
import { FollowCamera } from './camera/FollowCamera.js';
import { HUD } from './ui/HUD.js';
import { LoadoutUI } from './ui/LoadoutUI.js';
import { MultiplayerUI } from './ui/MultiplayerUI.js';
import { NetworkClient } from './net/NetworkClient.js';
import { Game } from './Game.js';
import { deriveStats } from './modules/Modules.js';

// --- Renderer (pixel ratio capped per Milestone 6 mobile guidance) ---
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080f);
scene.fog = new THREE.Fog(0x05080f, 300, 1600);

const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 0.1, 4000,
);

// --- Lights ---
scene.add(new THREE.AmbientLight(0x334455, 1.2));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 600;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x4488ff, 0.6);
rim.position.set(-100, 40, -120);
scene.add(rim);

// --- World + game ---
const environment = createEnvironment(scene);
const effects = new Effects(scene);

const input = new KeyboardInput();
const followCam = new FollowCamera(camera);
const hud = new HUD();

const game = new Game(scene, { enemyCount: 4, spawnRadius: 42 });

// --- Skirmish loadout screen ---
const loadoutUI = new LoadoutUI();
loadoutUI.onDeploy = (loadout) => {
  game.deploy(loadout);
  loadoutUI.hide();
  syncProgression();
};
// Upgrades: route to the local game or the authoritative server.
loadoutUI.onUpgrade = (id) => {
  if (mode === 'network' && net) {
    net.sendUpgrade(id);
  } else {
    const res = game.buyUpgrade('player', id);
    if (res.ok) {
      loadoutUI.applyUpgrade(id, res.level);
      loadoutUI.setOre(game.player.ore);
    }
  }
};
// Mirror the ship's ore + upgrade levels into the shop UI.
function syncProgression() {
  const ship = mode === 'network' && net && net.shipId
    ? net.remoteShips.get(net.shipId)?.ship
    : game.player;
  if (!ship) return;
  loadoutUI.setOre(ship.ore ?? 0);
  for (const [id, level] of Object.entries(ship.upgrades ?? {})) {
    if ((loadoutUI.levels[id] ?? 0) !== level) loadoutUI.applyUpgrade(id, level);
  }
}
loadoutUI.show(); // start at the loadout screen

// --- Multiplayer (Milestone 4) ---
const netUI = new MultiplayerUI();
let mode = 'local'; // 'local' | 'network'
let net = null;
let netBoost = 1.0; // network-mode boost bar (mirrors server-side drain)
let netAsteroids = new Map(); // key "x,z" → mesh, from server snapshots

netUI.onJoin = (url) => {
  // Tear the local sim out of the scene so only server-owned meshes render.
  effects.clear();
  for (const p of game.players) if (p.mesh) scene.remove(p.mesh);
  for (const e of game.enemies) if (e.mesh) scene.remove(e.mesh);
  if (game.asteroids) game.asteroids.clear();

  const loadout = { ...loadoutUI.state, modules: [...loadoutUI.state.modules] };
  net = new NetworkClient(scene, { url, name: 'pilot', loadout });
  net.onConnect = (welcome) => {
    if (welcome) {
      netUI.hide();
      netUI.setStatus(`connected — ${welcome.shipId}`);
    } else {
      netUI.setStatus('connecting…');
    }
  };
  net.onDisconnect = () => {
    if (mode !== 'network') return;
    mode = 'local';
    netUI.hide();
    netUI.setStatus('');
    netUI.panel.classList.add('hidden');
    netUI.renderLeaderboard([]);
    netAsteroids.forEach((m) => scene.remove(m));
    netAsteroids.clear();
    effects.clear();
    game.reset(); // restore solo play
    loadoutUI.show();
  };
  net.onEvent = (event) => {
    if (event.name === 'kill') {
      toasts.push({ text: `${event.data.victim} destroyed  +${event.data.score}`, t: 2.6 });
      renderToasts();
    } else if (event.name === 'upgrade') {
      // Server confirmed a purchase — sync the shop + toast.
      loadoutUI.applyUpgrade(event.data.upgrade, event.data.level);
      syncProgression();
      toasts.push({ text: `Upgrade: ${event.data.upgrade} → Lv${event.data.level}`, t: 2.6 });
      renderToasts();
    } else if (event.name === 'upgrade-failed') {
      toasts.push({ text: `Upgrade failed: ${event.data}`, t: 2.6 });
      renderToasts();
    }
  };
  net.onSnapshot = (snap) => {
    mode = 'network';
    netUI.panel.classList.remove('hidden');
    netUI.renderLeaderboard(snap.ships);
    renderNetAsteroids(snap.asteroids ?? []);
    syncProgression();
  };
  // Remote ships breaking apart — explosion at their last position.
  net.onDestroy = (x, z, isPlayer) => {
    effects.explode(x, z, { color: isPlayer ? 0xff4444 : 0xff8c4a, scale: isPlayer ? 2.0 : 1.4 });
  };
  net.connect();
};

// Entry point: the MULTIPLAYER button on the controls panel.
document.getElementById('btn-multiplayer').addEventListener('click', () => {
  netUI.show();
});

// --- Toast feed for combat events (kills, game over, resets) ---
const toastBox = document.getElementById('toasts');
const toasts = [];
game.onEvent = (name, data) => {
  if (name === 'kill') {
    toasts.push({ text: `${data.victim} destroyed  +${data.score}`, t: 2.6 });
    if (typeof data.x === 'number') effects.explode(data.x, data.z, { color: 0xff8c4a, scale: 1.4 });
  } else if (name === 'player-killed') {
    if (typeof data.x === 'number') effects.explode(data.x, data.z, { color: 0xff4444, scale: 2.0 });
  } else if (name === 'asteroid-destroyed') {
    effects.explode(data.x, data.z, { color: data.rich ? 0xffd479 : 0xb8a88c, scale: data.rich ? 1.2 : 0.8, light: false });
  } else if (name === 'ore') toasts.push({ text: `+${data.amount} ore${data.rich ? ' (rich!)' : ''}`, t: 2.0 });
  else if (name === 'upgrade') toasts.push({ text: `Upgrade: ${data.upgrade} → Lv${data.level}`, t: 2.6 });
  else if (name === 'game-over') {
    toasts.push({ text: `GAME OVER — score ${data.score} (${data.kills} kills)`, t: 4, big: true });
    loadoutUI.show(); // back to loadout for the next run
  }
  else if (name === 'player-spawned') toasts.push({ text: 'Spawn complete — watch the asteroids', t: 2 });
  while (toasts.length > 4) toasts.shift();
  renderToasts();
};

function renderToasts() {
  toastBox.innerHTML = '';
  for (const t of toasts) {
    const el = document.createElement('div');
    el.className = 'toast' + (t.big ? ' toast-big' : '');
    el.textContent = t.text;
    toastBox.appendChild(el);
  }
}

let paused = false;

// --- Fixed-timestep loop (120 Hz physics, render every rAF) ---
const STEP = 1 / 120;
let accumulator = 0;
let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let fps = 60;

/** Network-mode boost bar: mirror the server's drain/recharge rates. */
function stepNetBoost(dt, command) {
  if (command && command.boost && netBoost > 0) netBoost = Math.max(0, netBoost - 0.35 * dt);
  else netBoost = Math.min(1, netBoost + 0.18 * dt);
}

/** Build the HUD game-state object from a server snapshot. */
function hudStateFromSnapshot(snap, localShip) {
  if (!localShip) return {};
  const players = snap.ships.filter((s) => s.id !== localShip.id);
  return {
    score: localShip.score,
    kills: localShip.kills,
    playerHealth: localShip.health,
    playerMaxHealth: localShip.maxHealth,
    sensorRange: deriveStats(loadoutUI.state).sensorRange,
    enemies: players.map((s) => ({
      id: s.id,
      fraction: s.maxHealth ? s.health / s.maxHealth : 0,
      distance: Math.hypot(s.x - localShip.x, s.z - localShip.z),
    })),
    radar: snap.ships
      .filter((s) => s.id !== localShip.id)
      .map((s) => {
        const dist = Math.hypot(s.x - localShip.x, s.z - localShip.z);
        return {
          position: { x: s.x, z: s.z },
          tracked: true,
          strength: Math.max(0, Math.min(1, 1 - dist / 120)),
        };
      }),
    state: snap.state,
  };
}

/** Pseudo-ship for the HUD, assembled from the snapshot + input. */
function netPseudoShip(localShip, command) {
  if (!localShip) return game.player;
  const speed = Math.hypot(localShip.vx, localShip.vz);
  const forward = { x: Math.sin(localShip.heading), z: Math.cos(localShip.heading) };
  // Drift angle: angle between heading and velocity vector.
  const velAngle = Math.atan2(localShip.vx, localShip.vz);
  let drift = velAngle - localShip.heading;
  while (drift > Math.PI) drift -= Math.PI * 2;
  while (drift < -Math.PI) drift += Math.PI * 2;
  return {
    position: { x: localShip.x, z: localShip.z },
    heading: localShip.heading,
    forward,
    speed,
    thrustLevel: command ? command.thrust : 0,
    driftAngleDeg: (drift * 180) / Math.PI,
    kineticEnergy: 0.5 * 1200 * speed * speed,
    health: localShip.health,
    maxHealth: localShip.maxHealth,
  };
}

/** Render authoritative asteroids from a snapshot (create/update/remove). */
function renderNetAsteroids(asteroids) {
  const seen = new Set();
  for (const a of asteroids) {
    const key = `${a.x.toFixed(0)},${a.z.toFixed(0)}`;
    seen.add(key);
    let mesh = netAsteroids.get(key);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(a.radius, 0),
        new THREE.MeshStandardMaterial({ color: 0x8a7f72, flatShading: true, roughness: 0.95, metalness: 0.05 }),
      );
      scene.add(mesh);
      netAsteroids.set(key, mesh);
    }
    mesh.position.set(a.x, 0, a.z);
    mesh.rotation.y += 0.002;
  }
  for (const [key, mesh] of netAsteroids) {
    if (!seen.has(key)) {
      scene.remove(mesh);
      netAsteroids.delete(key);
    }
  }
}

function stepPhysics(dt) {
  const command = input.getCommand();
  if (mode === 'network') {
    stepNetBoost(dt, command);
    net.sendInput(command);
  } else {
    game.step(dt, command);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.1); // tab-switch guard

  // FPS meter
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
  }

  // Toasts age out.
  for (let i = toasts.length - 1; i >= 0; i--) {
    toasts[i].t -= dt;
    if (toasts[i].t <= 0) toasts.splice(i, 1);
  }
  if (toasts.length > 0) renderToasts();

  // Edge-triggered actions
  for (const ev of input.drainEvents()) {
    if (ev === 'reset' && mode === 'local') { effects.clear(); game.reset(); }
    if (ev === 'camera') followCam.toggleMode();
    if (ev === 'pause') {
      paused = !paused;
      document.getElementById('paused').classList.toggle('hidden', !paused);
    }
  }

  if (!paused) {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepPhysics(STEP);
      accumulator -= STEP;
    }
  }

  // Keep the upgrade shop in sync with mined ore (local + network).
  syncProgression();

  // Advance environment (nebula drift, dust) + explosion effects.
  environment.update(dt);
  effects.update(dt);

  // Resolve the camera target + HUD source for the active mode.
  let camPos, camVel, camHeading, hudShip, hudGame, boostFraction;
  if (mode === 'network' && net && net.shipId) {
    const entry = net.remoteShips.get(net.shipId);
    const localSnap = net.lastSnapshot?.ships.find((s) => s.id === net.shipId);
    if (entry && localSnap) {
      camPos = entry.mesh.position;
      camVel = entry.ship.velocity;
      camHeading = localSnap.heading;
      hudShip = netPseudoShip(localSnap, input.getCommand());
      hudGame = hudStateFromSnapshot(net.lastSnapshot, localSnap);
    }
    boostFraction = netBoost;
  }
  if (!camPos) {
    // Local mode (or network before the first snapshot).
    camPos = game.player.mesh.position;
    camVel = game.player.velocity;
    camHeading = game.player.heading;
    hudShip = game.player;
    hudGame = game.hudState();
    boostFraction = game.boostFraction;
  }

  // Sun shadow frustum follows the camera target so shadows stay crisp.
  sun.position.set(camPos.x + 120, 180, camPos.z + 60);
  sun.target.position.set(camPos.x, 0, camPos.z);
  sun.target.updateMatrixWorld();

  followCam.update(camPos, camVel, camHeading, dt);
  hud.update(hudShip, {
    fps,
    cameraMode: followCam.mode,
    boostFraction,
    game: hudGame,
  });

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(frame);
