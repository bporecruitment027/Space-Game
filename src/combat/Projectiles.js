/**
 * Projectiles — pooled bolt entities with straight-line ballistic motion.
 *
 * In free space there is no gravity, so a bolt flies on its initial
 * velocity vector until it expires or hits something (Milestone 5 adds
 * homing missiles with their own steering). Bolts are pooled (fixed
 * array, no allocation in the hot loop) per the roadmap's GC guidance.
 *
 * Collision is circle-vs-circle in the XZ plane, checked each physics
 * step. Ownership matters: player bolts only damage hostiles and
 * asteroids; hostile bolts only damage the player and asteroids.
 */

import * as THREE from 'three';

const POOL_SIZE = 160;

export class Projectiles {
  /**
   * @param {THREE.Scene|null} scene  null for headless (server) mode.
   */
  constructor(scene) {
    this.scene = scene;
    this.headless = !scene;
    this.pool = [];
    this.active = [];

    const geo = this.headless ? null : new THREE.SphereGeometry(0.32, 8, 6);
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = this.headless ? null : new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x7fe3ff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      if (mesh) {
        mesh.visible = false;
        scene.add(mesh);
      }
      // Missile exhaust trail (only used for homing bolts).
      const trailMat = new THREE.MeshBasicMaterial({
        color: 0xffd479, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const trail = this.headless ? null : new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 2.4), trailMat,
      );
      if (trail) { trail.visible = false; scene.add(trail); }

      this.pool.push({
        mesh,
        trail,
        active: false,
        ownerId: null,
        position: { x: 0, z: 0 },
        velocity: { x: 0, z: 0 },
        damage: 0,
        life: 0,
        scale: 1,
        homing: false,
        turnRate: 0,
        seekRange: 0,
        targetId: null,
        interceptor: false, // CIW bolt: swats missiles, harms nothing else
      });
    }
  }

  /**
   * Fire one bolt from a ship.
   * @param {Ship} ship          Firing ship (position/heading source).
   * @param {object} opts        { speed, damage, life, color, scale }
   * @returns {boolean} false if the pool is exhausted.
   */
  fire(ship, { speed = 140, damage = 12, life = 2.2, color = 0x7fe3ff, scale = 1, homing = false, turnRate = 0, seekRange = 0, targetId = null, interceptor = false } = {}) {
    const bolt = this.pool.find((b) => !b.active);
    if (!bolt) return false;

    const f = ship.physics.forward;
    const muzzle = 2.6; // just ahead of the nose
    bolt.active = true;
    bolt.ownerId = ship.id;
    bolt.position.x = ship.position.x + f.x * muzzle;
    bolt.position.z = ship.position.z + f.z * muzzle;
    bolt.velocity.x = f.x * speed + ship.velocity.x * 0.5; // inherit some ship motion
    bolt.velocity.z = f.z * speed + ship.velocity.z * 0.5;
    bolt.damage = damage;
    bolt.life = life;
    bolt.scale = scale;
    bolt.homing = homing;
    bolt.turnRate = turnRate;
    bolt.seekRange = seekRange;
    bolt.targetId = targetId;
    bolt.interceptor = interceptor;
    if (!this.headless) {
      bolt.mesh.material.color.setHex(color);
      bolt.mesh.scale.setScalar(scale);
      bolt.mesh.visible = true;
      bolt.mesh.position.set(bolt.position.x, 0, bolt.position.z);
      if (bolt.trail) {
        bolt.trail.visible = homing;
        bolt.trail.material.color.setHex(color);
      }
    }
    this.active.push(bolt);
    return true;
  }

  /**
   * Advance all bolts. Collision is delegated to the caller via
   * `onHit(bolt, target)` so this class stays free of game rules.
   * @param {number} dt
   * @param {(bolt: object, target: object) => void} onHit
   *   target is { kind: 'ship'|'asteroid', ref } — caller applies damage.
   * @param {Array} ships      Ships to test against (alive only).
   * @param {Array} asteroids  Asteroids to test against.
   */
  update(dt, onHit, ships, asteroids) {
    // CIW interception (Falling Frontier "long war" flavour): interceptor
    // bolts home onto the nearest incoming missile and detonate it mid-flight.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ic = this.active[i];
      if (!ic.interceptor) continue;
      let best = null;
      let bestD = 2.0; // detonation radius
      for (const m of this.active) {
        if (m === ic || !m.homing || m.ownerId === ic.ownerId) continue;
        const dx = m.position.x - ic.position.x;
        const dz = m.position.z - ic.position.z;
        const d = Math.hypot(dx, dz);
        if (d < bestD) { bestD = d; best = m; }
      }
      if (best) {
        onHit(ic, { kind: 'missile', ref: best });
        // Take the missile down with the interceptor.
        best.life = 0;
        best.active = false;
        if (!this.headless) {
          best.mesh.visible = false;
          if (best.trail) best.trail.visible = false;
        }
        this.active.splice(this.active.indexOf(best), 1);
        this.pool.push(this.pool.shift());
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const bolt = this.active[i];
      bolt.life -= dt;

      // Homing missiles (Milestone 5): steer toward the locked target,
      // falling back to the nearest enemy within seek range. Pure
      // simulation — no rendering, safe for the authoritative server.
      if (bolt.homing) {
        const target = this._findTarget(bolt, ships);
        if (target) {
          const dx = target.position.x - bolt.position.x;
          const dz = target.position.z - bolt.position.z;
          const dist = Math.hypot(dx, dz) || 1;
          const desired = { x: dx / dist, z: dz / dist };
          const speed = Math.hypot(bolt.velocity.x, bolt.velocity.z) || 1;
          const cur = { x: bolt.velocity.x / speed, z: bolt.velocity.z / speed };
          // Angle between current and desired heading (XZ plane).
          const cross = cur.x * desired.z - cur.z * desired.x; // sin of angle
          const dot = cur.x * desired.x + cur.z * desired.z;     // cos of angle
          const angle = Math.atan2(cross, dot);
          const turn = Math.max(-bolt.turnRate * dt, Math.min(bolt.turnRate * dt, angle));
          const cos = Math.cos(turn), sin = Math.sin(turn);
          bolt.velocity.x = (cur.x * cos - cur.z * sin) * speed;
          bolt.velocity.z = (cur.x * sin + cur.z * cos) * speed;
        }
      }

      bolt.position.x += bolt.velocity.x * dt;
      bolt.position.z += bolt.velocity.z * dt;
      if (!this.headless) {
        bolt.mesh.position.set(bolt.position.x, 0, bolt.position.z);
        // Missile exhaust trail: stretched opposite the velocity.
        if (bolt.trail && bolt.trail.visible) {
          const speed = Math.hypot(bolt.velocity.x, bolt.velocity.z) || 1;
          const ux = bolt.velocity.x / speed;
          const uz = bolt.velocity.z / speed;
          bolt.trail.position.set(
            bolt.position.x - ux * 1.4, 0,
            bolt.position.z - uz * 1.4,
          );
          bolt.trail.rotation.y = Math.atan2(uz, ux);
          bolt.trail.scale.set(1, 1, 1 + speed * 0.02);
        }
      }

      let dead = bolt.life <= 0;

      if (!dead) {
        // vs ships (never hits its owner)
        for (const ship of ships) {
          if (!ship.alive || ship.id === bolt.ownerId) continue;
          const dx = bolt.position.x - ship.position.x;
          const dz = bolt.position.z - ship.position.z;
          const r = ship.radius + 0.4;
          if (dx * dx + dz * dz < r * r) {
            onHit(bolt, { kind: 'ship', ref: ship });
            dead = true;
            break;
          }
        }
      }

      if (!dead) {
        // vs asteroids. Homing missiles that stray into the rock field
        // detonate on the rock (Falling Frontier: missiles get lost to
        // asteroids); conventional bolts carve into the rock normally.
        for (const rock of asteroids) {
          if (!rock.alive) continue;
          const dx = bolt.position.x - rock.position.x;
          const dz = bolt.position.z - rock.position.z;
          const r = rock.radius + (bolt.homing ? 3.0 : 0.4);
          if (dx * dx + dz * dz < r * r) {
            onHit(bolt, { kind: 'asteroid', ref: rock, detonate: !!bolt.homing });
            dead = true;
            break;
          }
        }
      }

      if (dead) {
        bolt.active = false;
        if (!this.headless) {
          bolt.mesh.visible = false;
          bolt.mesh.scale.setScalar(1); // reset for the next pooled reuse
          if (bolt.trail) bolt.trail.visible = false;
        }
        this.active.splice(i, 1);
        this.pool.push(this.pool.shift()); // rotate pool
      }
    }
  }

  /**
   * Resolve a homing bolt's target: the locked ship id if still alive,
   * otherwise the nearest alive non-owner ship within seek range.
   * @param {object} bolt  Bolt with targetId/seekRange.
   * @param {Array} ships  All ships (alive checked here).
   */
  _findTarget(bolt, ships) {
    if (bolt.targetId) {
      const locked = ships.find((s) => s.id === bolt.targetId && s.alive);
      if (locked) return locked;
    }
    let best = null;
    let bestD = bolt.seekRange > 0 ? bolt.seekRange : Infinity;
    for (const s of ships) {
      if (!s.alive || s.id === bolt.ownerId) continue;
      const d = Math.hypot(s.position.x - bolt.position.x, s.position.z - bolt.position.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Deactivate everything (used on game reset). */
  clear() {
    for (const bolt of this.active) {
      bolt.active = false;
      if (!this.headless) {
        bolt.mesh.visible = false;
        if (bolt.trail) bolt.trail.visible = false;
      }
    }
    this.active.length = 0;
  }
}
