/**
 * Unit tests for ShipPhysics — run with: npm test
 *
 * These pin down the Newtonian contract that Milestone 4's authoritative
 * server will rely on: same inputs → same motion, on client or server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShipPhysics } from '../src/physics/ShipPhysics.js';

function makeShip(overrides = {}) {
  return new ShipPhysics({
    mass: 1200,
    yawInertia: 1800,
    maxThrust: 9000, // → 7.5 m/s²
    maxTorque: 2600,
    ...overrides,
  });
}

function simulate(ship, seconds, input) {
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) ship.update(dt, input);
}

test('thrust accelerates the ship along its heading', () => {
  const ship = makeShip();
  simulate(ship, 2, { thrust: 1, yaw: 0 });
  // a = 9000/1200 = 7.5 m/s² → after 2 s, v ≈ 15 m/s toward +Z (heading 0)
  assert.ok(Math.abs(ship.speed - 15) < 0.2, `speed=${ship.speed}`);
  assert.ok(Math.abs(ship.velocity.z - 15) < 0.2);
  assert.ok(Math.abs(ship.velocity.x) < 0.01);
});

test('no thrust means no drag: velocity persists (Newton 1st law)', () => {
  const ship = makeShip();
  simulate(ship, 1, { thrust: 1, yaw: 0 });
  const vBefore = { ...ship.velocity };
  simulate(ship, 3, { thrust: 0, yaw: 0 });
  assert.deepEqual(ship.velocity, vBefore);
  // ...and the ship keeps travelling during the coast.
  assert.ok(ship.position.z > 10, `z=${ship.position.z}`);
});

test('yaw torque rotates the ship; heavier inertia turns slower', () => {
  const light = makeShip({ yawInertia: 900 });
  const heavy = makeShip({ yawInertia: 3600 });
  simulate(light, 1, { thrust: 0, yaw: 1 });
  simulate(heavy, 1, { thrust: 0, yaw: 1 });
  assert.ok(light.heading > heavy.heading, `${light.heading} vs ${heavy.heading}`);
  assert.ok(light.heading > 0.5, `heading=${light.heading}`);
});

test('autobrake stops the ship without reversing', () => {
  const ship = makeShip();
  simulate(ship, 2, { thrust: 1, yaw: 0 });
  simulate(ship, 5, { thrust: 0, yaw: 0, brake: true });
  assert.ok(ship.speed < 0.01, `speed=${ship.speed}`);
});

test('drift angle is 0 when flying nose-first, 90° when sliding sideways', () => {
  const ship = makeShip();
  simulate(ship, 1, { thrust: 1, yaw: 0 });
  assert.ok(ship.driftAngleDeg < 1, `drift=${ship.driftAngleDeg}`);
  ship.heading = Math.PI / 2; // nose now points +X while moving +Z
  assert.ok(Math.abs(ship.driftAngleDeg - 90) < 1, `drift=${ship.driftAngleDeg}`);
});

test('retro thrust decelerates and can reverse the ship', () => {
  const ship = makeShip();
  simulate(ship, 1, { thrust: 1, yaw: 0 });
  simulate(ship, 3, { thrust: -1, yaw: 0 });
  assert.ok(ship.velocity.z < 0, `vz=${ship.velocity.z}`);
});

test('kinetic energy grows with speed (0.5·m·v²)', () => {
  const ship = makeShip();
  simulate(ship, 2, { thrust: 1, yaw: 0 });
  const expected = 0.5 * 1200 * ship.speed ** 2;
  assert.ok(Math.abs(ship.kineticEnergy - expected) < 1, `${ship.kineticEnergy} vs ${expected}`);
});

test('reset returns the ship to spawn at rest', () => {
  const ship = makeShip();
  simulate(ship, 2, { thrust: 1, yaw: 1 });
  ship.reset();
  assert.equal(ship.speed, 0);
  assert.deepEqual(ship.position, { x: 0, z: 0 });
  assert.equal(ship.heading, 0);
});
