/**
 * Module system + sensor tests (Milestone 3).
 *
 * Covers: loadout validation, stat derivation, module effects, and the
 * sensor scan / decay / radar logic. All headless in Node.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HULLS, WEAPON_DEFS, MODULE_DEFS, MAX_MODULES, BASE_SENSOR_RANGE,
  defaultLoadout, validateLoadout, deriveStats, loadoutName,
} from '../src/modules/Modules.js';
import { Sensors } from '../src/systems/Sensors.js';

// ---------------------------------------------------------------------------
// Loadout validation
// ---------------------------------------------------------------------------

test('Modules: default loadout is valid', () => {
  const loadout = defaultLoadout();
  assert.equal(validateLoadout(loadout).ok, true);
  assert.equal(loadout.hull, 'fighter');
  assert.equal(loadout.weapon, 'laser');
  assert.deepEqual(loadout.modules, []);
});

test('Modules: rejects unknown hull / weapon / module', () => {
  assert.equal(validateLoadout({ hull: 'x', weapon: 'laser', modules: [] }).ok, false);
  assert.equal(validateLoadout({ hull: 'fighter', weapon: 'x', modules: [] }).ok, false);
  assert.equal(validateLoadout({ hull: 'fighter', weapon: 'laser', modules: ['x'] }).ok, false);
});

test('Modules: rejects more than MAX_MODULES and duplicates', () => {
  const tooMany = { hull: 'fighter', weapon: 'laser', modules: ['sensor', 'armor', 'sensor'] };
  const res = validateLoadout(tooMany);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('at most')), 'too many modules rejected');
  assert.ok(res.errors.some((e) => e.includes('duplicate')), 'duplicate module rejected');
});

test('Modules: defaultLoadout returns fresh arrays (no shared mutation)', () => {
  const a = defaultLoadout();
  const b = defaultLoadout();
  a.modules.push('sensor');
  assert.equal(b.modules.length, 0, 'mutating one loadout must not affect others');
});

// ---------------------------------------------------------------------------
// Stat derivation
// ---------------------------------------------------------------------------

test('Modules: fighter+laser derives baseline stats', () => {
  const s = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  assert.equal(s.mass, HULLS.fighter.mass);
  assert.equal(s.maxHealth, HULLS.fighter.maxHealth);
  assert.equal(s.maxThrust, HULLS.fighter.maxThrust);
  assert.equal(s.sensorRange, BASE_SENSOR_RANGE);
  assert.equal(s.fire.name, 'Laser');
  assert.equal(s.fire.damage, WEAPON_DEFS.laser.damage);
});

test('Modules: bulwark has more HP and mass than fighter', () => {
  const fighter = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  const bulwark = deriveStats({ hull: 'bulwark', weapon: 'laser', modules: [] });
  assert.ok(bulwark.maxHealth > fighter.maxHealth);
  assert.ok(bulwark.mass > fighter.mass);
});

test('Modules: armor multiplies hull HP', () => {
  const base = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  const armed = deriveStats({ hull: 'fighter', weapon: 'laser', modules: ['armor'] });
  assert.equal(armed.maxHealth, Math.round(base.maxHealth * MODULE_DEFS.armor.healthMultiplier));
});

test('Modules: sensor module extends detection range', () => {
  const base = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  const withSensor = deriveStats({ hull: 'fighter', weapon: 'laser', modules: ['sensor'] });
  assert.equal(withSensor.sensorRange, base.sensorRange + MODULE_DEFS.sensor.sensorRange);
});

test('Modules: railgun has higher damage but longer cooldown', () => {
  const laser = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  const rail = deriveStats({ hull: 'fighter', weapon: 'railgun', modules: [] });
  assert.ok(rail.fire.damage > laser.fire.damage);
  assert.ok(rail.fire.cooldown > laser.fire.cooldown);
});

test('Modules: deriveStats throws on invalid loadout', () => {
  assert.throws(() => deriveStats({ hull: 'nope', weapon: 'laser', modules: [] }), /Invalid loadout/);
});

test('Modules: loadoutName joins all selected parts', () => {
  const name = loadoutName({ hull: 'bulwark', weapon: 'railgun', modules: ['sensor', 'armor'] });
  assert.ok(name.includes('Bulwark'));
  assert.ok(name.includes('Railgun'));
  assert.ok(name.includes('Sensor Array'));
  assert.ok(name.includes('Reinforced Armor'));
});

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

function makeObserver(x, z, range) {
  return { id: 'observer', position: { x, z }, sensorRange: range, alive: true };
}
function makeTarget(id, x, z, heading = 0) {
  return { id, position: { x, z }, heading, alive: true };
}

test('Sensors: detects targets within range', () => {
  const sensors = new Sensors();
  sensors.track([makeTarget('e1', 10, 0)]);
  const observer = makeObserver(0, 0, 50);
  const contacts = sensors.scan(observer, 0.01);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].tracked, true);
  assert.equal(contacts[0].id, 'e1');
});

test('Sensors: ignores targets beyond range (no contact for never-detected targets)', () => {
  const sensors = new Sensors({ blipLife: 5 });
  sensors.track([makeTarget('e1', 100, 0)]);
  const observer = makeObserver(0, 0, 50);
  const contacts = sensors.scan(observer, 0.01);
  assert.equal(contacts.length, 0); // beyond range → no contact at all
  assert.equal(sensors.contacts.has('e1'), false);
});

test('Sensors: does not detect itself', () => {
  const sensors = new Sensors();
  const observer = makeObserver(0, 0, 50);
  sensors.track([observer]);
  const contacts = sensors.scan(observer, 0.01);
  assert.equal(contacts.length, 0);
});

test('Sensors: contact becomes ghost and decays after blipLife', () => {
  const sensors = new Sensors({ blipLife: 2 });
  const observer = makeObserver(0, 0, 50);
  // First: close target → tracked.
  sensors.track([makeTarget('e1', 10, 0)]);
  sensors.scan(observer, 0.01);
  assert.equal(sensors.contacts.get('e1').tracked, true);

  // Move target out of range, advance time past blipLife.
  sensors.track([makeTarget('e1', 200, 0)]);
  for (let i = 0; i < 250; i++) sensors.scan(observer, 0.01);
  assert.equal(sensors.contacts.has('e1'), false, 'blip fades after blipLife');
});

test('Sensors: radar strength is 1 for live, 0..1 for ghosts', () => {
  const sensors = new Sensors({ blipLife: 4 });
  const observer = makeObserver(0, 0, 50);
  sensors.track([makeTarget('e1', 10, 0)]);
  sensors.scan(observer, 0.01);
  const live = sensors.getRadarContacts(observer).find((c) => c.id === 'e1');
  assert.equal(live.strength, 1);

  // Move out of range and let it decay.
  sensors.track([makeTarget('e1', 200, 0)]);
  sensors.scan(observer, 2); // age = 2
  const ghost = sensors.getRadarContacts(observer).find((c) => c.id === 'e1');
  assert.equal(ghost.tracked, false);
  assert.ok(ghost.strength < 1 && ghost.strength > 0, 'ghost has fading strength');
});

test('Sensors: dead targets are removed from contacts', () => {
  const sensors = new Sensors();
  const observer = makeObserver(0, 0, 50);
  const target = makeTarget('e1', 10, 0);
  sensors.track([target]);
  sensors.scan(observer, 0.01);
  assert.ok(sensors.contacts.has('e1'));

  target.alive = false;
  sensors.track([target]);
  sensors.scan(observer, 0.01);
  assert.equal(sensors.contacts.has('e1'), false);
});

// ---------------------------------------------------------------------------
// Milestone 5: expanded content (scout/heavy hulls, missile, engine module)
// ---------------------------------------------------------------------------

test('M5: scout is faster and more agile but fragile', () => {
  const fighter = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  const scout = deriveStats({ hull: 'scout', weapon: 'laser', modules: [] });
  assert.ok(scout.maxThrust > fighter.maxThrust, 'scout has more thrust');
  assert.ok(scout.mass < fighter.mass, 'scout is lighter');
  assert.ok(scout.maxHealth < fighter.maxHealth, 'scout is fragile');
  assert.ok(scout.sensorRange > fighter.sensorRange, 'scout has longer sensors');
});

test('M5: heavy is a slow tank with the most HP', () => {
  const heavy = deriveStats({ hull: 'heavy', weapon: 'laser', modules: [] });
  const bulwark = deriveStats({ hull: 'bulwark', weapon: 'laser', modules: [] });
  assert.ok(heavy.maxHealth > bulwark.maxHealth, 'heavy out-tanks bulwark');
  assert.ok(heavy.maxThrust < bulwark.maxThrust, 'heavy is slow');
  assert.ok(heavy.radius > bulwark.radius, 'heavy is the biggest hull');
});

test('M5: missile is a homing weapon with high damage and long cooldown', () => {
  const m = WEAPON_DEFS.missile;
  assert.equal(m.homing, true, 'missile is homing');
  assert.ok(m.damage > WEAPON_DEFS.laser.damage, 'missile out-damages laser');
  assert.ok(m.cooldown > WEAPON_DEFS.railgun.cooldown, 'missile has the longest cooldown');
  assert.ok(m.turnRate > 0 && m.seekRange > 0, 'missile has steering + seek range');
});

test('M5: engine module boosts thrust', () => {
  const base = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  const tuned = deriveStats({ hull: 'fighter', weapon: 'laser', modules: ['engine'] });
  assert.equal(tuned.maxThrust, Math.round(base.maxThrust * (1 + MODULE_DEFS.engine.thrustBonus)));
});

test('M5: hull sensor bonus applies to derived range', () => {
  const scout = deriveStats({ hull: 'scout', weapon: 'laser', modules: [] });
  assert.equal(scout.sensorRange, BASE_SENSOR_RANGE + HULLS.scout.sensorBonus);
});

test('M5: missile loadout validates and derives', () => {
  const loadout = { hull: 'scout', weapon: 'missile', modules: ['sensor', 'engine'] };
  assert.equal(validateLoadout(loadout).ok, true);
  const s = deriveStats(loadout);
  assert.equal(s.fire.name, 'Missile');
  assert.equal(s.hull, 'scout');
});

test('FF: point defense module grants CIW intercept range', () => {
  const stats = deriveStats({ hull: 'fighter', weapon: 'laser', modules: ['pointdefense'] });
  assert.equal(stats.interceptRange, 48);
});

test('FF: default loadout has no CIW intercept range', () => {
  const stats = deriveStats({ hull: 'fighter', weapon: 'laser', modules: [] });
  assert.equal(stats.interceptRange, undefined);
});
