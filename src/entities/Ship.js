/**
 * Ship — game entity combining physics, mesh, health, and weapon state.
 *
 * One class serves both the player and AI enemies (Milestone 3's ECS
 * will split these concerns; for the vertical slice a single entity
 * type keeps the combat code simple). The Game orchestrator feeds it
 * inputs (keyboard for the player, EnemyAI for hostiles) and reads
 * back events (damage, death) from its methods.
 */

import { ShipPhysics } from '../physics/ShipPhysics.js';
import { createShip } from '../ship/ShipFactory.js';
import { WEAPON_DEFS, BASE_SENSOR_RANGE } from '../modules/Modules.js';

export class Ship {
  /**
   * @param {object} opts
   * @param {string} opts.id            Unique id, e.g. 'player' / 'enemy'.
   * @param {boolean} opts.isPlayer
   * @param {object} opts.physics       ShipPhysics constructor args.
   * @param {object} [opts.meshOptions] ShipFactory colour options.
   * @param {number} [opts.maxHealth]
   * @param {number} [opts.radius]      Collision radius in metres.
   * @param {object} [opts.weapon]      Weapon fire params (from WEAPON_DEFS).
   * @param {number} [opts.sensorRange] Sensor detection radius in metres.
   */
  constructor({ id, isPlayer, physics, meshOptions, maxHealth = 100, radius = 2.2, weapon, sensorRange }) {
    this.id = id;
    this.isPlayer = isPlayer;
    this.physics = new ShipPhysics(physics);
    const built = createShip(meshOptions);
    this.mesh = built.group;
    this.setThrustVisuals = built.setThrustVisuals;
    this.flashDamage = built.flashDamage;
    this.updateFlash = built.updateFlash;

    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.radius = radius;
    this.alive = true;
    this.invulnerableTime = 0; // spawn protection / respawn grace
    this.fireCooldown = 0;
    this.ramCooldown = 0; // asteroid-impact damage cooldown

    // Weapon + sensor stats come from the ship's loadout (Milestone 3).
    this.weapon = weapon ?? WEAPON_DEFS.laser;
    this.sensorRange = sensorRange ?? BASE_SENSOR_RANGE;
  }

  get position() { return this.physics.position; }
  get velocity() { return this.physics.velocity; }
  get heading() { return this.physics.heading; }
  get healthFraction() { return Math.max(0, this.health / this.maxHealth); }

  /** Place the ship (spawn/respawn) and restore full health. */
  spawn(x, z, heading, invulnerableSeconds = 0) {
    this.physics.reset({ x, z }, heading);
    this.health = this.maxHealth;
    this.alive = true;
    this.invulnerableTime = invulnerableSeconds;
    this.fireCooldown = 0;
    this.ramCooldown = 0;
    this.mesh.visible = true;
    this.syncMesh(0);
  }

  /** Apply damage. Returns true if this hit killed the ship. */
  takeDamage(amount) {
    if (!this.alive || this.invulnerableTime > 0) return false;
    this.health -= amount;
    this.flashDamage();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  /** Advance timers + physics with the given input command. */
  update(dt, input) {
    if (!this.alive) return;
    this.invulnerableTime = Math.max(0, this.invulnerableTime - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.physics.update(dt, input);
    this.syncMesh(dt);
    // Blink while invulnerable so the player can see the grace period.
    this.mesh.visible = this.invulnerableTime <= 0 || Math.floor(this.invulnerableTime * 8) % 2 === 0;
  }

  syncMesh(dt) {
    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.mesh.rotation.y = this.heading;
    // Bank into turns (visual only).
    this.mesh.rotation.z = -this.physics.yawLevel * 0.35;
    this.mesh.rotation.x = this.physics.thrustLevel * 0.04;
    this.setThrustVisuals(this.physics.thrustLevel, this.physics.yawLevel);
    this.updateFlash(dt);
  }
}
