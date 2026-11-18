/**
 * Modules — data-driven ship customization (Milestone 3 MVP).
 *
 * A loadout is pure data: one hull, one weapon, and up to two modules.
 * Every derived stat (mass, inertia, thrust, hull HP, sensor range,
 * fire parameters) comes from these tables, so balancing is a data
 * edit and new ship archetypes need no code.
 *
 * MVP cap per the GDD: 2 weapons, 2 modules.
 */

export const HULLS = {
  fighter: {
    name: 'Fighter',
    mass: 1200,
    yawInertia: 1800,
    maxThrust: 9000,
    maxTorque: 2600,
    maxHealth: 100,
    radius: 2.2,
    colors: { hull: 0xb8c4d4, dark: 0x2a3342, accent: 0xff8c2e },
  },
  bulwark: {
    name: 'Bulwark',
    mass: 1700,
    yawInertia: 2600,
    maxThrust: 8200,
    maxTorque: 2400,
    maxHealth: 150,
    radius: 2.6,
    colors: { hull: 0x94a3b4, dark: 0x333b48, accent: 0x4ad96a },
  },
};

export const WEAPON_DEFS = {
  laser: {
    name: 'Laser',
    damage: 14,
    speed: 150,
    life: 2.2,
    cooldown: 0.16,
    color: 0x7fe3ff,
    scale: 1.0,
  },
  railgun: {
    name: 'Railgun',
    damage: 42,
    speed: 105,
    life: 2.5,
    cooldown: 0.8,
    color: 0xb06bff,
    scale: 1.8,
  },
};

export const MODULE_DEFS = {
  sensor: { name: 'Sensor Array', sensorRange: 70 },
  armor: { name: 'Reinforced Armor', healthMultiplier: 1.5 },
};

export const MAX_MODULES = 2;
export const BASE_SENSOR_RANGE = 65; // metres

export const DEFAULT_LOADOUT = { hull: 'fighter', weapon: 'laser', modules: [] };

/** A fresh, safe default loadout (fresh array so callers can mutate). */
export function defaultLoadout() {
  return { ...DEFAULT_LOADOUT, modules: [] };
}

/**
 * Validate a loadout object. Returns { ok, errors[] } — never throws,
 * so UI code can render the reasons inline.
 */
export function validateLoadout(loadout) {
  const errors = [];
  if (!loadout || typeof loadout !== 'object') {
    return { ok: false, errors: ['loadout must be an object'] };
  }
  if (!(loadout.hull in HULLS)) errors.push(`unknown hull '${loadout.hull}'`);
  if (!(loadout.weapon in WEAPON_DEFS)) errors.push(`unknown weapon '${loadout.weapon}'`);

  const mods = loadout.modules ?? [];
  if (!Array.isArray(mods)) {
    errors.push('modules must be an array');
  } else {
    for (const m of mods) {
      if (!(m in MODULE_DEFS)) errors.push(`unknown module '${m}'`);
    }
    if (mods.length > MAX_MODULES) errors.push(`at most ${MAX_MODULES} modules`);
    if (new Set(mods).size !== mods.length) errors.push('duplicate modules');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Compose a loadout into concrete ship stats.
 * @param {{hull: string, weapon: string, modules: string[]}} loadout
 * @returns derived stats (mass, inertia, thrust, HP, sensor range, fire)
 * @throws if the loadout is invalid (use validateLoadout first for a
 *   non-throwing check).
 */
export function deriveStats(loadout) {
  const { ok, errors } = validateLoadout(loadout);
  if (!ok) throw new Error(`Invalid loadout: ${errors.join('; ')}`);

  const hull = HULLS[loadout.hull];
  const weapon = WEAPON_DEFS[loadout.weapon];

  const stats = {
    hull: loadout.hull,
    weapon: loadout.weapon,
    modules: [...loadout.modules],
    mass: hull.mass,
    yawInertia: hull.yawInertia,
    maxThrust: hull.maxThrust,
    maxTorque: hull.maxTorque,
    maxHealth: Math.round(hull.maxHealth),
    radius: hull.radius,
    sensorRange: BASE_SENSOR_RANGE,
    colors: hull.colors,
    fire: { ...weapon },
  };

  for (const id of loadout.modules) {
    const m = MODULE_DEFS[id];
    if (m.sensorRange) stats.sensorRange += m.sensorRange;
    if (m.healthMultiplier) stats.maxHealth = Math.round(stats.maxHealth * m.healthMultiplier);
  }

  return stats;
}

/** Human-readable loadout summary, e.g. "Fighter · Laser · Sensor Array". */
export function loadoutName(loadout) {
  return [
    HULLS[loadout.hull].name,
    WEAPON_DEFS[loadout.weapon].name,
    ...loadout.modules.map((m) => MODULE_DEFS[m].name),
  ].join(' · ');
}
