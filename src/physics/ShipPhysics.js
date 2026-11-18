/**
 * ShipPhysics — Newtonian rigid-body physics for a single ship.
 *
 * Milestone 1 scope: planar motion in the XZ plane with yaw rotation.
 * The ship is a rigid body with mass and yaw moment of inertia:
 *
 *   - Thrust applies a force along the ship's forward axis:  F = thrust * maxThrust
 *   - Acceleration follows Newton's second law:              a = F / mass
 *   - Yaw torque produces angular acceleration:               α = torque / yawInertia
 *   - There is NO drag and NO speed cap by default: in vacuum the ship
 *     keeps drifting forever until counter-thrust is applied. This is
 *     the core "realistic" feel the roadmap calls for — the player must
 *     learn to brake, not just accelerate.
 *
 * This module is intentionally free of any rendering dependency so it can
 * be unit-tested in Node and, in Milestone 4, reused verbatim on an
 * authoritative server (the server trusts inputs, never positions).
 * When we later adopt Rapier/Ammo, this class becomes the adapter
 * between game input and the physics engine's rigid body.
 *
 * Conventions:
 *   - heading = 0 faces +Z; forward = (sin(heading), cos(heading)) in XZ.
 *   - Positive yaw input rotates the ship to the right (clockwise from above),
 *     matching the Three.js rotation.y sign when the nose points +Z.
 */

export class ShipPhysics {
  /**
   * @param {object} opts
   * @param {number} opts.mass        Ship mass in kg (e.g. 1200).
   * @param {number} opts.yawInertia  Yaw moment of inertia in kg·m².
   * @param {number} opts.maxThrust   Main engine thrust in newtons.
   * @param {number} opts.maxTorque   RCS yaw torque in newton-metres.
   * @param {{x:number,z:number}} [opts.position] Start position.
   * @param {number} [opts.heading]   Start heading in radians.
   */
  constructor({ mass, yawInertia, maxThrust, maxTorque, position, heading }) {
    if (!(mass > 0)) throw new Error('mass must be > 0');
    if (!(yawInertia > 0)) throw new Error('yawInertia must be > 0');
    if (!(maxThrust > 0)) throw new Error('maxThrust must be > 0');
    if (!(maxTorque > 0)) throw new Error('maxTorque must be > 0');

    this.mass = mass;
    this.yawInertia = yawInertia;
    this.maxThrust = maxThrust;
    this.maxTorque = maxTorque;

    this.position = { x: position?.x ?? 0, z: position?.z ?? 0 };
    this.velocity = { x: 0, z: 0 };
    this.heading = heading ?? 0;
    this.angularVelocity = 0; // rad/s

    // Smoothed values for visuals/HUD (not used by the integrator).
    this.thrustLevel = 0; // -1..1, eased toward commanded thrust
    this.yawLevel = 0;
  }

  /** Unit forward vector in XZ for the current heading. */
  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** Current linear speed in m/s. */
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * Angle (degrees, 0..180) between the nose direction and the velocity
   * vector. 0 = flying where you're pointing; 90 = pure sideways drift.
   * This is the single most useful "Newtonian feel" teaching readout.
   */
  get driftAngleDeg() {
    if (this.speed < 0.01) return 0;
    const f = this.forward;
    const dot = (f.x * this.velocity.x + f.z * this.velocity.z) / this.speed;
    return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
  }

  /** Total kinetic energy in joules (translational + rotational). */
  get kineticEnergy() {
    const v2 = this.velocity.x ** 2 + this.velocity.z ** 2;
    return 0.5 * this.mass * v2 + 0.5 * this.yawInertia * this.angularVelocity ** 2;
  }

  /** Linear momentum magnitude in kg·m/s. */
  get momentum() {
    return this.mass * this.speed;
  }

  /**
   * Advance the simulation.
   * @param {number} dt    Elapsed time in seconds (clamped internally).
   * @param {object} input Commanded inputs, each in [-1, 1]:
   * @param {number} input.thrust  +1 = full ahead, -1 = full retro.
   * @param {number} input.yaw     +1 = turn right, -1 = turn left.
   * @param {boolean} [input.brake] If true, apply retro thrust opposing
   *   the velocity vector (an "autobrake") until speed reaches zero.
   */
  update(dt, input) {
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);
    const thrust = clamp(input.thrust ?? 0, -1, 1);
    const yaw = clamp(input.yaw ?? 0, -1, 1);

    // Substep so large frame hitches can't tunnel the integrator.
    const steps = Math.max(1, Math.ceil(clampedDt / (1 / 240)));
    const h = clampedDt / steps;

    for (let i = 0; i < steps; i++) {
      // --- Angular: torque -> angular acceleration -> heading ---
      const torque = yaw * this.maxTorque;
      this.angularVelocity += (torque / this.yawInertia) * h;
      this.heading += this.angularVelocity * h;

      // --- Linear: thrust force along the (updated) forward axis ---
      const f = this.forward;
      const force = thrust * this.maxThrust;
      this.velocity.x += ((force * f.x) / this.mass) * h;
      this.velocity.z += ((force * f.z) / this.mass) * h;

      // --- Autobrake: decelerate along -velocity, never reverse ---
      if (input.brake) {
        const speed = this.speed;
        if (speed > 0) {
          const decel = (this.maxThrust / this.mass) * h;
          const newSpeed = Math.max(0, speed - decel);
          const scale = newSpeed / speed;
          this.velocity.x *= scale;
          this.velocity.z *= scale;
        }
      }

      // --- Integrate position (semi-implicit Euler) ---
      this.position.x += this.velocity.x * h;
      this.position.z += this.velocity.z * h;
    }

    // Ease visual levels toward commanded values (frame-rate independent).
    const ease = 1 - Math.exp(-10 * clampedDt);
    this.thrustLevel += (thrust - this.thrustLevel) * ease;
    this.yawLevel += (yaw - this.yawLevel) * ease;
  }

  /** Teleport back to spawn with zero velocity (used by the R key). */
  reset(position = { x: 0, z: 0 }, heading = 0) {
    this.position = { ...position };
    this.velocity = { x: 0, z: 0 };
    this.heading = heading;
    this.angularVelocity = 0;
    this.thrustLevel = 0;
    this.yawLevel = 0;
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
