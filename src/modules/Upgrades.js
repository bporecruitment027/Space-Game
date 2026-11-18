/**
 * Upgrades — ore-spent ship improvements (Milestone 5).
 *
 * The resource economy: mining asteroids yields ore, and ore buys
 * permanent (per-ship) upgrades. Upgrades are repeatable levels with
 * scaled costs, so a dedicated miner can grind toward a fully decked
 * out ship.
 *
 * Upgrades modify the ship's derived stats at apply time:
 *   damage  → ship.damageMult   (multiplies weapon damage on fire)
 *   hull    → ship.maxHealth    (scales current health with the max)
 *   thrust  → ship.thrustMult   (scales effective thrust)
 *   sensor  → ship.sensorRange  (extends detection radius)
 *   repair  → ship.regen        (HP per second while undamaged)
 *
 * All effects are plain numbers on the Ship, so the authoritative
 * server applies them identically — no rendering dependency.
 */

export const UPGRADE_DEFS = {
  damage: {
    name: 'Weapon Mastery',
    description: '+12% weapon damage per level',
    baseCost: 30,
  },
  hull: {
    name: 'Hull Reinforcement',
    description: '+20% hull HP per level',
    baseCost: 35,
  },
  thrust: {
    name: 'Engine Tuning',
    description: '+12% thrust per level',
    baseCost: 30,
  },
  sensor: {
    name: 'Sensor Calibration',
    description: '+25% sensor range per level',
    baseCost: 25,
  },
  repair: {
    name: 'Auto-Repair',
    description: '+0.75 HP/s regen while undamaged, per level',
    baseCost: 50,
  },
};

/**
 * Ore cost to buy the next level of an upgrade.
 * @param {string} id       Upgrade id (must exist in UPGRADE_DEFS).
 * @param {number} level    Current level (0 = not bought).
 */
export function upgradeCost(id, level) {
  const def = UPGRADE_DEFS[id];
  if (!def) throw new Error(`Unknown upgrade '${id}'`);
  return def.baseCost * (level + 1);
}

/**
 * Apply one level of an upgrade to a ship. Mutates the ship's stats
 * and upgrade levels. Throws on unknown upgrade ids.
 * @param {import('../entities/Ship.js').Ship} ship
 * @param {string} id  Upgrade id.
 * @returns {number} the new level
 */
export function applyUpgrade(ship, id) {
  const def = UPGRADE_DEFS[id];
  if (!def) throw new Error(`Unknown upgrade '${id}'`);

  const level = (ship.upgrades[id] ?? 0) + 1;
  ship.upgrades[id] = level;
  _applyLevelEffect(ship, id);
  return level;
}

/**
 * Apply one level of an upgrade's stat effect without touching the
 * level counter (used by applyUpgrade and reapplyUpgrades).
 */
function _applyLevelEffect(ship, id) {
  switch (id) {
    case 'damage':
      ship.damageMult *= 1.12;
      break;
    case 'hull': {
      const ratio = ship.maxHealth > 0 ? ship.health / ship.maxHealth : 1;
      ship.maxHealth = Math.round(ship.maxHealth * 1.2);
      ship.health = Math.min(ship.maxHealth, Math.round(ship.maxHealth * ratio));
      break;
    }
    case 'thrust':
      ship.thrustMult *= 1.12;
      break;
    case 'sensor':
      ship.sensorRange = Math.round(ship.sensorRange * 1.25);
      break;
    case 'repair':
      ship.regen += 0.75;
      break;
    default:
      break;
  }
}

/**
 * Re-apply all of a ship's upgrade levels from scratch. Used when a
 * ship is rebuilt (loadout deploy) so purchased upgrades carry over
 * to the new hull. Preserves the current health fraction.
 * @param {import('../entities/Ship.js').Ship} ship
 */
export function reapplyUpgrades(ship) {
  const ratio = ship.maxHealth > 0 ? ship.health / ship.maxHealth : 1;
  ship.maxHealth = ship.baseMaxHealth;
  ship.sensorRange = ship.baseSensorRange;
  ship.damageMult = 1;
  ship.thrustMult = 1;
  ship.regen = 0;
  // Reset levels, then apply each level's effect without incrementing.
  const levels = { ...(ship.upgrades ?? {}) };
  ship.upgrades = {};
  for (const [id, level] of Object.entries(levels)) {
    for (let i = 0; i < level; i++) _applyLevelEffect(ship, id);
    ship.upgrades[id] = level;
  }
  ship.health = Math.min(ship.maxHealth, Math.round(ship.maxHealth * ratio));
}

/** Total ore spent on upgrades so far (for display). */
export function totalSpent(ship) {
  let total = 0;
  for (const [id, level] of Object.entries(ship.upgrades ?? {})) {
    total += upgradeCost(id, 0) * ((level * (level + 1)) / 2);
  }
  return total;
}
