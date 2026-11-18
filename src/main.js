/**
 * main.js — Milestone 1 bootstrap: one ship, Newtonian physics, overhead
 * follow camera. See docs/GDD.md for the full design spec.
 *
 * Game loop notes:
 *   - Fixed-timestep physics (120 Hz) decoupled from rendering, so the
 *     simulation is deterministic regardless of display refresh rate.
 *     This is the same pattern Milestone 4's authoritative server needs.
 *   - Boost is a limited resource (drains while held, recharges when
 *     idle) so it can't be a permanent speed hack.
 */

import * as THREE from 'three';
import { ShipPhysics } from './physics/ShipPhysics.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { createShip } from './ship/ShipFactory.js';
import { createEnvironment } from './world/Environment.js';
import { FollowCamera } from './camera/FollowCamera.js';
import { HUD } from './ui/HUD.js';

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

// --- World + ship ---
const environment = createEnvironment(scene);

// Fighter-class placeholder stats (see GDD §4 for the tuning table).
const ship = new ShipPhysics({
  mass: 1200,          // kg
  yawInertia: 1800,    // kg·m²
  maxThrust: 9000,     // N  → 7.5 m/s² acceleration
  maxTorque: 2600,     // N·m → ~1.44 rad/s² yaw acceleration
});
const { group: shipMesh, setThrustVisuals } = createShip();
scene.add(shipMesh);

// Sun shadow camera follows the ship so shadows stay crisp everywhere.
const followCam = new FollowCamera(camera);
const input = new KeyboardInput();
const hud = new HUD();

let paused = false;
let boostFraction = 1.0; // 0..1
const BOOST_DRAIN = 0.35; // per second while boosting
const BOOST_RECHARGE = 0.18; // per second while not boosting
const BOOST_MULTIPLIER = 2.0;

// --- Fixed-timestep loop (120 Hz physics, render every rAF) ---
const STEP = 1 / 120;
let accumulator = 0;
let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let fps = 60;

function stepPhysics(dt) {
  const cmd = input.getCommand();

  // Boost only applies to forward thrust and only while budget remains.
  let thrust = cmd.thrust;
  const boosting = cmd.boost && cmd.thrust > 0 && boostFraction > 0.01;
  if (boosting) {
    thrust *= BOOST_MULTIPLIER;
    boostFraction = Math.max(0, boostFraction - BOOST_DRAIN * dt);
  } else {
    boostFraction = Math.min(1, boostFraction + BOOST_RECHARGE * dt);
  }

  ship.update(dt, { thrust, yaw: cmd.yaw, brake: cmd.brake });
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

  // Edge-triggered actions
  for (const ev of input.drainEvents()) {
    if (ev === 'reset') ship.reset();
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
    environment.update(dt);
  }

  // Sync mesh to physics state (y = 0 flight plane).
  shipMesh.position.set(ship.position.x, 0, ship.position.z);
  shipMesh.rotation.y = ship.heading;
  // Bank into turns for feel (visual only — physics stays yaw-only).
  shipMesh.rotation.z = -ship.yawLevel * 0.35;
  shipMesh.rotation.x = ship.thrustLevel * 0.04;
  setThrustVisuals(ship.thrustLevel, ship.yawLevel);

  // Keep sun + shadow frustum centred on the ship.
  sun.position.set(ship.position.x + 120, 180, ship.position.z + 60);
  sun.target.position.set(ship.position.x, 0, ship.position.z);
  sun.target.updateMatrixWorld();

  followCam.update(shipMesh.position, ship.velocity, ship.heading, dt);
  hud.update(ship, { fps, cameraMode: followCam.mode, boostFraction });

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(frame);
