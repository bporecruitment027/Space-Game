/**
 * Combat unit tests (Milestone 2) — all rules, no rendering.
 *
 * Runs headless in Node: Three.js is importable without a browser, and
 * Game/Ship/Projectiles/Asteroids/EnemyAI are all rendering-agnostic
 * enough for headless testing (meshes are created but never drawn).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { Game } from '../src/Game.js';
import { EnemyAI } from '../src/combat/EnemyAI.js';
import { Projectiles } from '../src/combat/Projectiles.js';
import { Asteroids } from '../src/world/Asteroids.js';
import { Ship } from '../src/entities/Ship.js';

/** Build a Game on a throwaway scene, deploy it, and return it. */
function makeGame(enemyCount = 2) {
  const scene = new THREE.Scene();
  const game = new Game(scene, { enemyCount, spawnRadius: 42 });
  game.deploy({ hull: 'fighter', weapon: 'laser', modules: [] });
  return { scene, game };
}

// ---------------------------------------------------------------------------
// Ship entity
// ---------------------------------------------------------------------------

test('Ship: starts at spawn with full health and spawn protection', () => {
  const ship = new Ship({
    id: 'player', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  ship.spawn(10, -5, 0, 2.0);
  assert.equal(ship.alive, true);
  assert.equal(ship.health, 100);
  assert.equal(ship.invulnerableTime, 2.0);
  assert.deepEqual(ship.position, { x: 10, z: -5 });
});

test('Ship: takeDamage kills at zero and blocks during invulnerability', () => {
  const ship = new Ship({
    id: 'e', isPlayer: false,
    physics: { mass: 950, yawInertia: 2400, maxThrust: 7200, maxTorque: 3000 },
    maxHealth: 60,
  });
  ship.spawn(0, 0, 0, 0);
  assert.equal(ship.takeDamage(40), false);
  assert.equal(ship.health, 20);
  assert.equal(ship.takeDamage(20), true); // lethal
  assert.equal(ship.alive, false);
  assert.equal(ship.health, 0);

  ship.spawn(0, 0, 0, 1.5);
  assert.equal(ship.takeDamage(500), false); // invulnerable window blocks damage
});

// ---------------------------------------------------------------------------
// EnemyAI
// ---------------------------------------------------------------------------

test('EnemyAI: closes distance when the target is far away', () => {
  const ai = new EnemyAI();
  const enemy = new Ship({
    id: 'e', isPlayer: false,
    physics: { mass: 950, yawInertia: 2400, maxThrust: 7200, maxTorque: 3000 },
    maxHealth: 60,
  });
  enemy.spawn(0, 0, 0, 0);
  const player = new Ship({
    id: 'p', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  player.spawn(100, 0, 0, 0); // well beyond engage range

  const cmd = ai.decide({ ship: enemy, target: player });
  assert.equal(cmd.thrust, 1, 'should thrust full toward a distant target');
});

test('EnemyAI: holds range and yaws to aim when in weapon range', () => {
  const ai = new EnemyAI();
  const enemy = new Ship({
    id: 'e', isPlayer: false,
    physics: { mass: 950, yawInertia: 2400, maxThrust: 7200, maxTorque: 3000 },
    maxHealth: 60,
  });
  enemy.spawn(0, 0, 0, 0);
  const player = new Ship({
    id: 'p', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  // 28 m away at 45° to the nose — in range, not aligned.
  player.spawn(20, 20, 0, 0);

  const cmd = ai.decide({ ship: enemy, target: player });
  assert.ok(Math.abs(cmd.yaw) > 0, 'should yaw toward the target');
  assert.equal(cmd.thrust, 0.35, 'should hold station at engage distance');
  assert.equal(cmd.fire, false, 'must not fire while not aligned');
});

test('EnemyAI: fires only when aligned and in range', () => {
  const ai = new EnemyAI();
  const enemy = new Ship({
    id: 'e', isPlayer: false,
    physics: { mass: 950, yawInertia: 2400, maxThrust: 7200, maxTorque: 3000 },
    maxHealth: 60,
  });
  enemy.spawn(0, 0, 0, 0);
  const player = new Ship({
    id: 'p', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  // Directly ahead (aligned), inside fire range.
  // forward = (sin h, cos h): heading 0 faces +Z, straight at the player.
  player.spawn(0, 20, 0, 0);
  enemy.physics.heading = 0;

  const cmd = ai.decide({ ship: enemy, target: player });
  assert.equal(cmd.fire, true, 'aligned in-range enemy should fire');

  // Out of range: no fire.
  player.spawn(0, 80, 0, 0);
  const cmd2 = ai.decide({ ship: enemy, target: player });
  assert.equal(cmd2.fire, false);
});

test('EnemyAI: flees when health is low', () => {
  const ai = new EnemyAI({ fleeHealth: 0.3 });
  const enemy = new Ship({
    id: 'e', isPlayer: false,
    physics: { mass: 950, yawInertia: 2400, maxThrust: 7200, maxTorque: 3000 },
    maxHealth: 60,
  });
  enemy.spawn(0, 0, 0, 0);
  enemy.health = 10; // fraction 0.167 < 0.3
  const player = new Ship({
    id: 'p', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  player.spawn(0, 15, 0, 0);

  const cmd = ai.decide({ ship: enemy, target: player });
  assert.equal(cmd.thrust, 0.35, 'low-health enemy should back off, not close in');
  assert.equal(cmd.fire, false, 'fleeing enemy should not fire');
});

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

test('Projectiles: fires from the nose, travels, and despawns on life expiry', () => {
  const scene = new THREE.Scene();
  const p = new Projectiles(scene);
  const ship = new Ship({
    id: 'player', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  ship.spawn(0, 0, 0, 0);

  assert.equal(p.fire(ship, { speed: 100, life: 1 }), true);
  assert.equal(p.active.length, 1);
  const bolt = p.active[0];
  assert.equal(bolt.ownerId, 'player');
  // Nose points +Z at heading 0 → muzzle should be ahead on +Z.
  assert.ok(bolt.position.z > ship.position.z, 'bolt spawns ahead of the nose');

  // Advance half a second of life with no targets → still flying.
  p.update(0.5, () => {}, [], []);
  assert.equal(p.active.length, 1);
  assert.ok(bolt.position.z > 40, 'bolt travelled along +Z');

  // Let life expire.
  p.update(0.6, () => {}, [], []);
  assert.equal(p.active.length, 0, 'bolt despawns when life runs out');
});

test('Projectiles: pool reuses despawned bolts', () => {
  const scene = new THREE.Scene();
  const p = new Projectiles(scene);
  const ship = new Ship({
    id: 'p', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  ship.spawn(0, 0, 0, 0);

  p.fire(ship, { life: 0.001 });
  p.update(0.1, () => {}, [], []);
  assert.equal(p.active.length, 0);
  assert.equal(p.fire(ship, { life: 5 }), true, 'pool slot reused after despawn');
});

test('Projectiles: bolts never hit their own owner', () => {
  const scene = new THREE.Scene();
  const p = new Projectiles(scene);
  const shooter = new Ship({
    id: 'player', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100, radius: 2.2,
  });
  shooter.spawn(0, 0, 0, 0);
  p.fire(shooter, { speed: 10, life: 10 });

  // Place the shooter directly in the bolt's path.
  let hitCount = 0;
  const shots = [];
  for (let i = 0; i < 40; i++) {
    p.update(0.1, (_b, h) => { hitCount++; shots.push(h); }, [shooter], []);
  }
  assert.equal(hitCount, 0, 'a bolt cannot damage its own ship');
});

// ---------------------------------------------------------------------------
// Asteroids
// ---------------------------------------------------------------------------

test('Asteroids: bolts chip damage and trigger fragmentation', () => {
  const scene = new THREE.Scene();
  const field = new Asteroids(scene, { count: 3, fieldSize: 60, baseSpeed: 0 });
  // Disable drift so positions stay predictable.
  for (const a of field.entities) { a.velocity = { x: 0, z: 0 }; }

  // Pick the largest rock so the radius always clears the fragment
  // threshold (radius > MIN_RADIUS + 0.5) regardless of random spawn.
  let rock = field.entities.reduce((a, b) => (a.radius > b.radius ? a : b));
  const startRadius = rock.radius;
  field.hit(rock, rock.maxDamage);
  field.update(1 / 120);

  assert.equal(rock.alive, false, 'over-damaged asteroid fragments');
  assert.ok(
    field.entities.filter((e) => e.alive).length >= 3,
    'fragmentation spawns replacements',
  );
  assert.ok(
    field.entities.some((e) => e.alive && e.radius < startRadius),
    'fragments are smaller than the original',
  );
});

test('Asteroids: ram damage scales with ship speed', () => {
  const scene = new THREE.Scene();
  const field = new Asteroids(scene, { count: 1, baseSpeed: 0 });
  const a = field.entities[0];
  a.velocity = { x: 0, z: 0 };

  const slow = new Ship({
    id: 'p', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  slow.spawn(0, 0, 0, 0);
  const fast = new Ship({
    id: 'p2', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100,
  });
  fast.spawn(0, 0, 0, 0);
  fast.physics.velocity = { x: 200, z: 0 };

  assert.ok(field.ramDamage(fast) > field.ramDamage(slow), 'faster ram hurts more');
});

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

test('Game: player bolts damage and kill enemies, awarding score', () => {
  const { game } = makeGame(1);
  const enemy = game.enemies[0];

  // Park an enemy directly in front of the player, aligned.
  // forward = (sin h, cos h): enemy at (0,15) faces the player at origin
  // with heading π; the player at origin faces +Z (heading 0) at the enemy.
  enemy.spawn(0, 15, Math.PI);
  enemy.invulnerableTime = 0;
  game.player.spawn(0, 0, 0, 0);
  // Stub out asteroids (including respawn) so the bolt flight is clean.
  game.asteroids = { entities: [], update() {}, hit() {}, clear() {}, shipCollisionCandidates() { return []; }, ramDamage: () => 0 };

  const events = [];
  game.onEvent = (name, data) => events.push([name, data]);

  // Fire a bolt and step until it connects (or timeout).
  let killed = false;
  for (let i = 0; i < 240 && !killed; i++) {
    game.step(1 / 120, { thrust: 0, yaw: 0, brake: false, boost: false, fire: true });
    if (game.player.score > 0) killed = true;
  }
  assert.ok(killed, 'player bolt should kill the aligned enemy');
  assert.ok(game.player.score >= 100, 'kill awards score');
  assert.equal(game.player.kills, 1);
  assert.ok(events.some((e) => e[0] === 'kill'), 'kill event emitted');
});

test('Game: enemy bolts damage the player and game over ends the run', () => {
  const { game } = makeGame(1);
  const enemy = game.enemies[0];
  // forward = (sin h, cos h): enemy at (0,12) faces the player at the
  // origin with heading π; the player at the origin faces +Z (heading 0).
  enemy.spawn(0, 12, Math.PI);
  enemy.invulnerableTime = 0;
  game.player.spawn(0, 0, 0, 0);
  game.player.invulnerableTime = 0;
  // Stub out asteroids (including respawn) so enemy bolts reach the
  // player and the enemy can't die to a ram.
  game.asteroids = { entities: [], update() {}, hit() {}, clear() {}, shipCollisionCandidates() { return []; }, ramDamage: () => 0 };

  // Disable AI fleeing and force the enemy to hold and fire.
  game.ai = new EnemyAI({ fireInterval: 0.1, fleeHealth: 0 });

  let over = false;
  game.onEvent = (name, data) => { if (name === 'game-over') over = data; };

  let steps = 0;
  for (let i = 0; i < 3600 && !over; i++) {
    game.step(1 / 120, { thrust: 0, yaw: 0, brake: false, boost: false, fire: false });
    steps++;
    if (game.state === 'over') break;
  }
  assert.ok(over, `game should end within ${steps} steps of enemy fire`);
  assert.equal(game.state, 'over');
});

test('Game: reset clears bolts, enemies, and score', () => {
  const { game } = makeGame(2);
  game.player.score = 500;
  game.player.kills = 3;
  game.player.invulnerableTime = 0;
  // Fire some bolts.
  for (let i = 0; i < 10; i++) game.step(1 / 120, { thrust: 0, yaw: 0, brake: false, boost: false, fire: true });
  game.reset();

  assert.equal(game.player.score, 0);
  assert.equal(game.player.kills, 0);
  assert.equal(game.state, 'running');
  assert.equal(game.player.health, game.player.maxHealth);
  assert.equal(game.enemies.filter((e) => e.alive).length, 2);
});
