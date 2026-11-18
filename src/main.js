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
 */

import * as THREE from 'three';
import { KeyboardInput } from './input/KeyboardInput.js';
import { createEnvironment } from './world/Environment.js';
import { FollowCamera } from './camera/FollowCamera.js';
import { HUD } from './ui/HUD.js';
import { Game } from './Game.js';

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
createEnvironment(scene);

const input = new KeyboardInput();
const followCam = new FollowCamera(camera);
const hud = new HUD();

const game = new Game(scene, { enemyCount: 4, spawnRadius: 42 });

// Toast feed for combat events (kills, game over, resets).
const toastBox = document.getElementById('toasts');
const toasts = [];
game.onEvent = (name, data) => {
  if (name === 'kill') toasts.push({ text: `${data.victim} destroyed  +${data.score}`, t: 2.6 });
  else if (name === 'game-over') toasts.push({ text: `GAME OVER — score ${data.score} (${data.kills} kills)`, t: 4, big: true });
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

function stepPhysics(dt) {
  game.step(dt, input.getCommand());
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
    if (ev === 'reset') game.reset();
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

  // Sun shadow frustum follows the player so shadows stay crisp.
  sun.position.set(game.player.position.x + 120, 180, game.player.position.z + 60);
  sun.target.position.set(game.player.position.x, 0, game.player.position.z);
  sun.target.updateMatrixWorld();

  followCam.update(
    game.player.mesh.position, game.player.velocity, game.player.heading, dt,
  );
  hud.update(game.player, {
    fps,
    cameraMode: followCam.mode,
    boostFraction: game.boostFraction,
    game: game.hudState(),
  });

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(frame);
