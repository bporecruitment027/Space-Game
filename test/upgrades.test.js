/**
 * Upgrades + ore economy tests (Milestone 5).
 *
 * Covers the upgrade data table, per-level effects, cost scaling,
 * re-application on ship rebuild, and the Game.buyUpgrade flow
 * (ore deduction, rejection on unknown/insufficient).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  UPGRADE_DEFS, upgradeCost, applyUpgrade, reapplyUpgrades, totalSpent,
} from '../src/modules/Upgrades.js';
import { Game } from '../src/Game.js';
import { Ship } from '../src/entities/Ship.js';

/** A bare headless ship for upgrade unit tests. */
function makeShip() {
  return new Ship({
    id: 'test', isPlayer: true,
    physics: { mass: 1200, yawInertia: 1800, maxThrust: 9000, maxTorque: 2600 },
    maxHealth: 100, radius: 2.2,
    weapon: { name: 'Laser', damage: 14, speed: 150, life: 2.2, cooldown: 0.16 },
    sensorRange: 65,
    headless: true,
  });
}

// ---------------------------------------------------------------------------
// Cost + table
// ---------------------------------------------------------------------------

test('Upgrades: cost scales with current level', () => {
  const def = UPGRADE_DEFS.damage;
  assert.equal(upgradeCost('damage', 0), def.baseCost);
  assert.equal(upgradeCost('damage', 1), def.baseCost * 2);
  assert.equal(upgradeCost('damage', 2), def.baseCost * 3);
});

test('Upgrades: unknown upgrade throws on cost + apply', () => {
  assert.throws(() => upgradeCost('nope', 0), /Unknown upgrade/);
  assert.throws(() => applyUpgrade(makeShip(), 'nope'), /Unknown upgrade/);
});

// ---------------------------------------------------------------------------
// Per-level effects
// ---------------------------------------------------------------------------

test('Upgrades: damage level scales damageMult', () => {
  const ship = makeShip();
  applyUpgrade(ship, 'damage');
  assert.ok(ship.damageMult > 1, 'damageMult increased');
  const before = ship.damageMult;
  applyUpgrade(ship, 'damage');
  assert.ok(ship.damageMult > before, 'stacks per level');
  assert.equal(ship.upgrades.damage, 2);
});

test('Upgrades: hull level increases maxHealth and preserves fraction', () => {
  const ship = makeShip();
  ship.health = 50; // half health
  const frac = ship.health / ship.maxHealth;
  applyUpgrade(ship, 'hull');
  assert.ok(ship.maxHealth > 100, 'maxHealth grew');
  assert.equal(ship.health, Math.round(ship.maxHealth * frac), 'health scaled with max');
});

test('Upgrades: thrust level scales thrustMult', () => {
  const ship = makeShip();
  applyUpgrade(ship, 'thrust');
  assert.ok(ship.thrustMult > 1);
  assert.equal(ship.upgrades.thrust, 1);
});

test('Upgrades: sensor level extends sensorRange', () => {
  const ship = makeShip();
  const base = ship.sensorRange;
  applyUpgrade(ship, 'sensor');
  assert.ok(ship.sensorRange > base);
});

test('Upgrades: repair level adds regen', () => {
  const ship = makeShip();
  applyUpgrade(ship, 'repair');
  assert.equal(ship.regen, 0.75);
  applyUpgrade(ship, 'repair');
  assert.equal(ship.regen, 1.5, 'regen stacks per level');
});

test('Upgrades: reapplyUpgrades reproduces effects from levels', () => {
  const ship = makeShip();
  applyUpgrade(ship, 'damage');
  applyUpgrade(ship, 'damage');
  applyUpgrade(ship, 'hull');
  applyUpgrade(ship, 'sensor');
  const dmg = ship.damageMult;
  const hp = ship.maxHealth;
  const range = ship.sensorRange;

  // Simulate a rebuild: reset to base, then re-apply.
  ship.maxHealth = ship.baseMaxHealth;
  ship.sensorRange = ship.baseSensorRange;
  ship.damageMult = 1;
  reapplyUpgrades(ship);

  assert.equal(ship.damageMult, dmg, 'damageMult restored');
  assert.equal(ship.maxHealth, hp, 'maxHealth restored');
  assert.equal(ship.sensorRange, range, 'sensorRange restored');
  assert.equal(ship.upgrades.damage, 2, 'levels preserved');
});

test('Upgrades: totalSpent sums the triangular cost series', () => {
  const ship = makeShip();
  applyUpgrade(ship, 'damage'); // level 1 → cost base
  applyUpgrade(ship, 'damage'); // level 2 → cost 2*base
  const def = UPGRADE_DEFS.damage;
  assert.equal(totalSpent(ship), def.baseCost + def.baseCost * 2);
});

// ---------------------------------------------------------------------------
// Game.buyUpgrade integration
// ---------------------------------------------------------------------------

test('Game: buyUpgrade deducts ore and applies the effect', () => {
  const scene = new THREE.Scene();
  const game = new Game(scene, { enemyCount: 1 });
  game.deploy({ hull: 'fighter', weapon: 'laser', modules: [] });
  const before = game.player.damageMult;
  game.player.ore = 100;

  const res = game.buyUpgrade('player', 'damage');
  assert.equal(res.ok, true);
  assert.equal(game.player.damageMult > before, true, 'damage applied');
  assert.equal(game.player.ore, 100 - upgradeCost('damage', 0), 'ore deducted');
});

test('Game: buyUpgrade rejects unknown upgrade', () => {
  const scene = new THREE.Scene();
  const game = new Game(scene, { enemyCount: 1 });
  game.deploy({ hull: 'fighter', weapon: 'laser', modules: [] });
  game.player.ore = 1000;
  const res = game.buyUpgrade('player', 'nope');
  assert.equal(res.ok, false);
  assert.match(res.error, /unknown upgrade/);
});

test('Game: buyUpgrade rejects when ore is insufficient', () => {
  const scene = new THREE.Scene();
  const game = new Game(scene, { enemyCount: 1 });
  game.deploy({ hull: 'fighter', weapon: 'laser', modules: [] });
  game.player.ore = 5; // less than any upgrade
  const res = game.buyUpgrade('player', 'damage');
  assert.equal(res.ok, false);
  assert.match(res.error, /not enough ore/);
  assert.equal(game.player.ore, 5, 'ore unchanged on failure');
});

test('Game: deploy carries ore + upgrades to the new hull', () => {
  const scene = new THREE.Scene();
  const game = new Game(scene, { enemyCount: 1 });
  game.deploy({ hull: 'fighter', weapon: 'laser', modules: [] });
  game.player.ore = 77;
  game.buyUpgrade('player', 'damage'); // costs 30 → 47 left
  const mult = game.player.damageMult;
  const oreAfterBuy = game.player.ore;
  assert.equal(oreAfterBuy, 77 - upgradeCost('damage', 0), 'buy deducted ore');

  game.deploy({ hull: 'scout', weapon: 'missile', modules: [] });
  assert.equal(game.player.ore, oreAfterBuy, 'ore persists across deploy');
  assert.equal(game.player.damageMult, mult, 'upgrade effect persists across deploy');
  assert.equal(game.player.weapon.name, 'Missile', 'new loadout applied');
});
