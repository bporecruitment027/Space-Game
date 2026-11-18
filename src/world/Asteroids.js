/**
 * Asteroids — dynamic field of rogue rocks providing cover and hazards.
 *
 * Asteroids drift on their own ballistic paths and tumble. Bolts chip
 * them: each impact flashes the rock and deals damage; when damage
 * exceeds the rock's mass-proportional threshold it fragments into two
 * smaller chunks (the loop bottoms out at a minimum size, matching the
 * "min fragment size" rule in the GDD). A ship that rams an asteroid
 * takes ram damage proportional to closing speed; the rock absorbs a
 * fixed amount per impact. The field respawns over time so the arena
 * always has cover without needing a level file.
 */

import * as THREE from 'three';

const MIN_RADIUS = 1.4;

function wobbleGeometry(geo, wobble) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setXYZ(i, x * wobble, y * wobble, z * wobble);
  }
  geo.computeVertexNormals();
}

export class Asteroids {
  /**
   * @param {THREE.Scene|null} scene  null for headless (server) mode.
   * @param {object} [opts] { count, fieldSize, baseSpeed, headless }
   */
  constructor(scene, { count = 26, fieldSize = 90, baseSpeed = 22, headless = false } = {}) {
    this.scene = scene;
    this.headless = headless || !scene;
    this.fieldSize = fieldSize;
    this.baseSpeed = baseSpeed;
    this.entities = [];
    if (!this.headless) {
      this._matA = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.95, metalness: 0.05, flatShading: true });
      this._matB = new THREE.MeshStandardMaterial({ color: 0x5d544b, roughness: 0.95, metalness: 0.05, flatShading: true });
      this._flashMat = new THREE.MeshStandardMaterial({ color: 0xb8a88c, roughness: 0.8, metalness: 0.05, flatShading: true, emissive: 0x442a11, emissiveIntensity: 0.8 });
      this._richMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.6, metalness: 0.3, flatShading: true, emissive: 0x6b4a14, emissiveIntensity: 0.5 });
    }

    // Asteroids destroyed this tick (ore credit for the Game). Reset
    // at the start of each update, populated by fragment().
    this.destroyedThisTick = [];

    for (let i = 0; i < count; i++) this.spawn(true);
  }

  _makeMesh(radius, rich = false) {
    const geo = new THREE.IcosahedronGeometry(radius, 0);
    wobbleGeometry(geo, 0.72 + Math.random() * 0.55);
    const mat = rich ? this._richMat : (radius > 4 ? this._matA : this._matB);
    const mesh = new THREE.Mesh(geo, mat);
    if (!this.headless) this.scene.add(mesh);
    return { geo, mesh };
  }

  /**
   * Spawn one asteroid.
   * @param {boolean} [outer] Place outside the central spawn zone.
   * @param {object} [overrides] { position, velocity, radius, damage }
   * @returns {object} asteroid entity
   */
  spawn(outer = true, overrides = {}) {
    let { x = 0, z = 0 } = overrides.position ?? {};
    if (outer) {
      const angle = Math.random() * Math.PI * 2;
      const r = this.fieldSize * (0.35 + Math.random() * 0.6);
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
    }

    const radius = overrides.radius ?? (MIN_RADIUS + Math.random() * 6);
    // Ore economy (Milestone 5): rocks carry ore; a quarter are rich
    // and worth 2.5x. Rich rocks render in gold so miners can spot them.
    const rich = overrides.rich ?? Math.random() < 0.25;
    const { geo, mesh } = this._makeMesh(radius, rich);
    mesh.position.set(x, 0, z);

    const dir = Math.random() * Math.PI * 2;
    const speed = this.baseSpeed * (0.5 + Math.random() * 0.5);
    const asteroid = {
      mesh,
      geo,
      radius,
      position: { x, z },
      velocity: overrides.velocity ?? { x: Math.cos(dir) * speed, z: Math.sin(dir) * speed },
      rotation: { x: Math.random() * Math.PI, y: Math.random() * Math.PI, z: Math.random() * Math.PI },
      spin: { x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.5) * 0.8, z: (Math.random() - 0.5) * 0.4 },
      damage: overrides.damage ?? 0,
      maxDamage: 25 + radius * 6, // mass-proportional HP
      alive: true,
      flashTime: 0,
      rich,
      ore: Math.round((4 + Math.random() * 10) * (rich ? 2.5 : 1)),
      lastHitBy: null, // ship id that dealt the killing blow (ore credit)
    };
    this.entities.push(asteroid);
    return asteroid;
  }

  /** Impact from a bolt: chip damage + visual flash. Records the shooter
   *  so the killing blow can be credited with the rock's ore. */
  hit(asteroid, damage, shooterId = null) {
    asteroid.damage += damage;
    asteroid.flashTime = 0.08;
    if (shooterId) asteroid.lastHitBy = shooterId;
  }

  /** Ram damage to a ship: scaled by its closing speed. */
  ramDamage(ship) {
    const speed = Math.hypot(ship.velocity.x, ship.velocity.z);
    return Math.min(60, 8 + speed * 0.08);
  }

  update(dt) {
    this.destroyedThisTick.length = 0;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const a = this.entities[i];
      if (!a.alive) continue;

      a.position.x += a.velocity.x * dt;
      a.position.z += a.velocity.z * dt;
      a.rotation.x += a.spin.x * dt;
      a.rotation.y += a.spin.y * dt;
      a.rotation.z += a.spin.z * dt;

      if (a.flashTime > 0) {
        a.flashTime -= dt;
        if (!this.headless) {
          a.mesh.material = a.flashTime > 0 ? this._flashMat : (a.radius > 4 ? this._matA : this._matB);
        }
      }

      if (!this.headless) {
        a.mesh.position.set(a.position.x, 0, a.position.z);
        a.mesh.rotation.set(a.rotation.x, a.rotation.y, a.rotation.z);
      }

      // Bounce off the field ring so drift stays in-arena.
      const limit = this.fieldSize;
      if (Math.abs(a.position.x) > limit) { a.velocity.x *= -1; a.position.x = Math.sign(a.position.x) * limit; }
      if (Math.abs(a.position.z) > limit) { a.velocity.z *= -1; a.position.z = Math.sign(a.position.z) * limit; }

      // Fragment when damaged past threshold. Fragments don't subdivide.
      if (a.damage >= a.maxDamage && a.radius > MIN_RADIUS + 0.5) {
        this.destroyedThisTick.push(a);
        this.fragment(a);
      }
    }

    // Keep the field populated: slow trickle respawn.
    if (this.entities.filter((e) => e.alive).length < 14 && Math.random() < dt * 0.25) {
      this.spawn(true);
    }
  }

  /** Split an asteroid into two smaller chunks flying apart. */
  fragment(a) {
    a.alive = false;
    if (!this.headless && a.mesh && a.geo) {
      this.scene.remove(a.mesh);
      a.geo.dispose();
    }

    for (let i = 0; i < 2; i++) {
      const child = this.spawn(false, {
        position: { x: a.position.x, z: a.position.z },
        radius: Math.max(MIN_RADIUS, a.radius * 0.62),
        damage: a.damage * 0.5,
        rich: a.rich,
      });
      // Fragments carry a share of the parent's ore; each child is
      // worth 60% so mining a big rock down yields more than it held.
      child.ore = Math.max(1, Math.round(a.ore * 0.6));
      child.lastHitBy = a.lastHitBy;
      const dir = i === 0 ? 1 : -1;
      child.velocity = {
        x: a.velocity.x + dir * (6 + Math.random() * 6),
        z: a.velocity.z + (Math.random() * 2 - 1) * (6 + Math.random() * 6),
      };
    }
  }

  /** Asteroids overlapping the given ship (for ram checks). */
  shipCollisionCandidates(ship) {
    const out = [];
    for (const a of this.entities) {
      if (!a.alive) continue;
      const dx = ship.position.x - a.position.x;
      const dz = ship.position.z - a.position.z;
      const r = ship.radius + a.radius;
      if (dx * dx + dz * dz < r * r) out.push(a);
    }
    return out;
  }

  /** Remove everything (game reset). */
  clear() {
    for (const a of this.entities) {
      if (!this.headless && a.mesh && a.geo) {
        this.scene.remove(a.mesh);
        a.geo.dispose();
      }
    }
    this.entities.length = 0;
  }
}
