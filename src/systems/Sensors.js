/**
 * Sensors — contact tracking and fog of war (Milestone 3).
 *
 * Every ship emits a sensor signature. A player's sensors detect any
 * ship within `sensorRange` metres; beyond that range a contact becomes
 * a "blip" — its last known position and heading, decaying over
 * `blipLife` seconds and fading out. This is the core of the
 * radar/fog-of-war mechanic: you chase ghosts across the arena and
 * cross the sensor boundary to turn them into live contacts.
 *
 * Rendering-agnostic: the system stores plain data; the HUD radar
 * draws from `getRadarContacts()` after each `scan()`.
 */

export class Sensors {
  /**
   * @param {object} [opts]
   * @param {number} [opts.blipLife] Seconds a lost contact stays as a
   *   fading ghost on radar.
   */
  constructor({ blipLife = 4.5 } = {}) {
    this.blipLife = blipLife;
    this.contacts = new Map(); // id → contact
    this._targets = []; // ships tracked by this sensor system
  }

  /** Register the ships this sensor system watches (call once per frame). */
  track(targets) {
    this._targets = targets;
  }

  /**
   * Scan for detections. Any ship within the observer's range becomes
   * (or refreshes) a live contact; contacts outside the range decay
   * into blips.
   *
   * @param {object} observer  The sensing ship (needs position, sensorRange).
   * @param {number} dt
   * @returns {object[]} contacts sorted by distance (nearest first),
   *   each { id, position, heading, tracked, age, distance }.
   */
  scan(observer, dt) {
    const range = observer.sensorRange ?? 65;

    for (const target of this._targets) {
      if (target.id === observer.id) continue;
      if (!target.alive) {
        this.contacts.delete(target.id);
        continue;
      }

      const dx = target.position.x - observer.position.x;
      const dz = target.position.z - observer.position.z;
      const distance = Math.hypot(dx, dz);

      let c = this.contacts.get(target.id);

      if (distance <= range) {
        // Live detection: create or refresh the contact.
        if (!c) {
          c = { id: target.id, position: { x: 0, z: 0 }, heading: 0, tracked: false, age: 0 };
          this.contacts.set(target.id, c);
        }
        c.tracked = true;
        c.position = { x: target.position.x, z: target.position.z };
        c.heading = target.heading;
        c.age = 0;
      } else if (c) {
        // Out of range: decay an existing ghost. Do NOT create a contact
        // for a target we never detected — otherwise a faded blip would
        // be re-created forever by an out-of-range target.
        c.tracked = false;
        c.age += dt; // decay toward fade-out
      }
    }

    // Drop blips that faded completely.
    for (const [id, c] of this.contacts) {
      if (!c.tracked && c.age > this.blipLife) this.contacts.delete(id);
    }

    const out = [];
    for (const c of this.contacts.values()) {
      const dx = c.position.x - observer.position.x;
      const dz = c.position.z - observer.position.z;
      out.push({
        id: c.id,
        position: { ...c.position },
        heading: c.heading,
        tracked: c.tracked,
        age: c.age,
        distance: Math.hypot(dx, dz),
      });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  /**
   * Radar contacts for the HUD: live contacts plus fading blips,
   * each with a `strength` (0..1) for radar opacity.
   */
  getRadarContacts(observer) {
    return [...this.contacts.values()]
      .map((c) => {
        const dx = c.position.x - observer.position.x;
        const dz = c.position.z - observer.position.z;
        return {
          id: c.id,
          position: { ...c.position },
          heading: c.heading,
          tracked: c.tracked,
          age: c.age,
          distance: Math.hypot(dx, dz),
          strength: c.tracked ? 1 : Math.max(0, 1 - c.age / this.blipLife),
        };
      })
      .sort((a, b) => a.distance - b.distance);
  }

  /** Clear all contacts (on game reset). */
  clear() {
    this.contacts.clear();
  }
}
