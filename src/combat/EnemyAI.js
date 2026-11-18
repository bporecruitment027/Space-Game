/**
 * EnemyAI — steering logic for hostile ships.
 *
 * The AI is deliberately simple and readable (the GDD calls for
 * "simple steering + aim logic" in M2, with behaviour trees in M3):
 *
 *  - Far from the player: close the distance, keep some speed.
 *  - In weapon range: hold distance and yaw to aim before firing.
 *  - Low health: disengage and flee.
 *  - An asteroid between ship and player: steer around it.
 *
 * `decide()` is a pure function of the world state — no rendering — so
 * it can be unit-tested directly in Node (test/enemy_ai.test.js).
 */

/** Sign of a, with a dead-zone to avoid jitter. */
const sign = (a) => (a > 0.01 ? 1 : a < -0.01 ? -1 : 0);

export class EnemyAI {
  /**
   * @param {object} [opts]
   * @param {number} [opts.engageRange]  Distance to start holding.
   * @param {number} [opts.fireRange]    Max bolt travel distance.
   * @param {number} [opts.fleeHealth]   Health fraction below which the
   *   enemy turns tail.
   * @param {number} [opts.fireInterval] Seconds between bolts.
   * @param {number} [opts.aimTolerance] Rad/s yaw-rate cap for aiming.
   */
  constructor({
    engageRange = 34,
    fireRange = 46,
    fleeHealth = 0.3,
    fireInterval = 0.62,
    aimTolerance = 1.1,
  } = {}) {
    this.engageRange = engageRange;
    this.fireRange = fireRange;
    this.fleeHealth = fleeHealth;
    this.fireInterval = fireInterval;
    this.aimTolerance = aimTolerance;
  }

  /**
   * Produce an input command for one enemy this tick.
   *
   * @param {object} args
   * @param {Ship} args.ship     The enemy.
   * @param {Ship} args.target   The player (or whatever to hunt).
   * @param {Asteroids} [args.asteroids] Field for avoidance.
   * @param {number} [args.dt]
   * @returns {{ thrust: number, yaw: number, brake: boolean, boost: boolean, fire: boolean }}
   */
  decide({ ship, target, asteroids, dt = 1 / 120 }) {
    if (!target || !target.alive) {
      return { thrust: 0.4, yaw: 0, brake: false, boost: false, fire: false };
    }

    // Vector to target, distance, and angle of error between nose and target.
    // forward = (sin h, cos h), so the direction angle of (dx, dz) is
    // atan2(dx, dz) — measured from +Z, matching the heading convention.
    const dx = target.position.x - ship.position.x;
    const dz = target.position.z - ship.position.z;
    const distance = Math.hypot(dx, dz) || 0.0001;
    const targetAngle = Math.atan2(dx, dz);
    const error = this.wrapAngle(targetAngle - ship.heading);
    const aligned = Math.abs(error) < 0.22; // ~12.6° nose-on

    const lowHealth = ship.healthFraction < this.fleeHealth;
    const inRange = distance <= this.fireRange;

    // --- Thrust policy ---------------------------------------------------
    let thrust;
    let brake = false;
    let boost = false;

    if (lowHealth && inRange) {
      // Flee: back off toward the engage boundary.
      thrust = distance > this.engageRange + 12 ? 1 : 0.35;
      boost = distance < this.engageRange + 6;
    } else if (distance > this.engageRange) {
      thrust = 1; // close the distance
      if (distance < this.engageRange + 8 && !aligned) brake = true;
    } else if (distance < this.engageRange * 0.55) {
      thrust = 0.4; // don't overshoot into the player's pocket
      brake = !aligned;
    } else {
      thrust = 0.35; // hold station
      if (!aligned && distance > this.engageRange * 0.7) brake = true;
    }

    // --- Yaw policy -----------------------------------------------------
    // Aim at the target, but cap the turn rate so the AI feels human and
    // can be out-turned by a skilled player.
    let yaw = 0;
    const yawDemand = sign(error);
    if (Math.abs(error) > 0.05) {
      const rate = Math.min(1, Math.abs(error) / this.aimTolerance) * yawDemand;
      // Steer one way only; never spin.
      yaw = Math.abs(rate) < 1 ? rate : yawDemand;
    }

    // --- Asteroid avoidance -------------------------------------------
    // If an asteroid sits between the ship and the target, steer away from
    // the obstacle on the side with more room.
    if (asteroids) {
      const nearest = this._nearestAsteroidAhead(ship, asteroids, target, distance);
      if (nearest && nearest.avoid) {
        const dodge = -sign(nearest.avoid) || 1;
        yaw = dodge * 1.0;
        thrust = Math.min(thrust, 0.6);
      }
    }

    // --- Weapon policy --------------------------------------------------
    let fire = false;
    if (aligned && inRange && !lowHealth) {
      this._fireTimer = Math.max(0, (this._fireTimer ?? 0) - dt);
      if (this._fireTimer <= 0) {
        fire = true;
        this._fireTimer = this.fireInterval;
      }
    } else {
      this._fireTimer = 0;
    }

    return { thrust, yaw, brake, boost, fire };
  }

  /** Nearest asteroid roughly between the ship and the target, with a steer side. */
  _nearestAsteroidAhead(ship, asteroids, target, distance) {
    let best = null;
    for (const a of asteroids.entities) {
      if (!a.alive) continue;
      const dx = a.position.x - ship.position.x;
      const dz = a.position.z - ship.position.z;
      const d = Math.hypot(dx, dz);
      if (d > distance * 1.15 || d < 3) continue; // only in the corridor
      // Is it in front of the ship?
      const fx = target.position.x - ship.position.x;
      const fz = target.position.z - ship.position.z;
      const dot = dx * fx + dz * fz;
      if (dot <= 0) continue;
      // Steer away: cross product sign tells which side.
      const cross = fx * dz - fz * dx;
      if (!best || d < best.distance) {
        best = { ref: a, distance: d, avoid: cross };
      }
    }
    return best;
  }

  /** Wrap an angle to (-pi, pi]. */
  wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle <= -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  /** Reset internal timers (on spawn/respawn). */
  reset() {
    this._fireTimer = 0;
  }
}
