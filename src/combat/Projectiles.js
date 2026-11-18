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
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];

    const geo = new THREE.SphereGeometry(0.32, 8, 6);
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x7fe3ff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        active: false,
        ownerId: null,
        position: { x: 0, z: 0 },
        velocity: { x: 0, z: 0 },
        damage: 0,
        life: 0,
      });
    }
  }

  /**
   * Fire one bolt from a ship.
   * @param {Ship} ship          Firing ship (position/heading source).
   * @param {object} opts        { speed, damage, life, color }
   * @returns {boolean} false if the pool is exhausted.
   */
  fire(ship, { speed = 140, damage = 12, life = 2.2, color = 0x7fe3ff } = {}) {
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
    bolt.mesh.material.color.setHex(color);
    bolt.mesh.visible = true;
    bolt.mesh.position.set(bolt.position.x, 0, bolt.position.z);
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
    for (let i = this.active.length - 1; i >= 0; i--) {
      const bolt = this.active[i];
      bolt.life -= dt;
      bolt.position.x += bolt.velocity.x * dt;
      bolt.position.z += bolt.velocity.z * dt;
      bolt.mesh.position.set(bolt.position.x, 0, bolt.position.z);

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
        // vs asteroids
        for (const rock of asteroids) {
          if (!rock.alive) continue;
          const dx = bolt.position.x - rock.position.x;
          const dz = bolt.position.z - rock.position.z;
          const r = rock.radius + 0.4;
          if (dx * dx + dz * dz < r * r) {
            onHit(bolt, { kind: 'asteroid', ref: rock });
            dead = true;
            break;
          }
        }
      }

      if (dead) {
        bolt.active = false;
        bolt.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(this.pool.shift()); // rotate pool
      }
    }
  }

  /** Deactivate everything (used on game reset). */
  clear() {
    for (const bolt of this.active) {
      bolt.active = false;
      bolt.mesh.visible = false;
    }
    this.active.length = 0;
  }
}
