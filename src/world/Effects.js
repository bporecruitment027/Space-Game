/**
 * Effects — explosions and destruction particles (Falling Frontier style).
 *
 * When a ship is destroyed or an asteroid is shattered, the world
 * reacts: an expanding shockwave ring, a burst of flying debris sparks,
 * and a brief flash of light. This is the "ships breaking apart" and
 * "explosions" polish that makes the combat read as a simulation rather
 * than an arcade shooter.
 *
 * Everything is pooled (fixed allocation, no GC churn in the hot loop)
 * and headless-safe: with no scene the calls are no-ops, so the
 * authoritative server never touches rendering.
 */

import * as THREE from 'three';

const SPARK_COUNT = 14; // debris sparks per explosion
const POOL_SIZE = 48; // max simultaneous explosions

export class Effects {
  /**
   * @param {THREE.Scene|null} scene  null for headless (server) mode.
   */
  constructor(scene) {
    this.scene = scene;
    this.headless = !scene;
    this.active = [];

    if (this.headless) return;

    // Shared materials (additive, depth-write off for clean layering).
    this._ringMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this._sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // Pre-build the pool: each entry is one explosion's geometry.
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 24), this._ringMat);
      ring.rotation.x = -Math.PI / 2; // lie flat in the XZ plane
      ring.visible = false;
      scene.add(ring);

      const sparks = [];
      for (let s = 0; s < SPARK_COUNT; s++) {
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), this._sparkMat);
        spark.visible = false;
        scene.add(spark);
        sparks.push({ mesh: spark, vx: 0, vz: 0, vy: 0 });
      }
      this.pool.push({ ring, sparks, light: null, life: 0, maxLife: 0, scale: 1, active: false });
    }
  }

  /**
   * Spawn an explosion at a world position.
   * @param {number} x  World X.
   * @param {number} z  World Z.
   * @param {object} [opts] { color, scale, light }
   * @returns {boolean} false if the pool is exhausted.
   */
  explode(x, z, { color = 0xffcc66, scale = 1, light = true } = {}) {
    if (this.headless) return false;
    const fx = this.pool.find((e) => !e.active);
    if (!fx) return false;

    fx.active = true;
    fx.life = fx.maxLife = 0.8;
    fx.scale = scale;
    fx.ring.position.set(x, 0.4, z);
    fx.ring.material = this._ringMat;
    this._ringMat.color.setHex(color);
    fx.ring.visible = true;
    fx.ring.scale.setScalar(0.4 * scale);

    for (const spark of fx.sparks) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (6 + Math.random() * 16) * scale;
      spark.vx = Math.cos(angle) * speed;
      spark.vz = Math.sin(angle) * speed;
      spark.vy = (2 + Math.random() * 8) * scale;
      spark.mesh.position.set(x, 0.4, z);
      spark.mesh.material = this._sparkMat;
      this._sparkMat.color.setHex(color);
      spark.mesh.visible = true;
      spark.mesh.scale.setScalar((0.6 + Math.random() * 0.8) * scale);
    }

    // Brief flash light for the explosion.
    if (light) {
      fx.light = new THREE.PointLight(color, 8 * scale, 30 * scale, 1.5);
      fx.light.position.set(x, 2, z);
      this.scene.add(fx.light);
    }

    this.active.push(fx);
    return true;
  }

  /** Advance all active effects; remove finished ones back to the pool. */
  update(dt) {
    if (this.headless) return;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      const t = fx.life / fx.maxLife; // 1 → 0

      // Shockwave ring grows and fades.
      const ringScale = (0.4 + (1 - t) * 4.5) * fx.scale;
      fx.ring.scale.setScalar(ringScale);
      fx.ring.material.opacity = Math.max(0, t) * 0.9;

      // Debris sparks fly outward and fall/fade.
      for (const spark of fx.sparks) {
        spark.mesh.position.x += spark.vx * dt;
        spark.mesh.position.z += spark.vz * dt;
        spark.mesh.position.y += spark.vy * dt;
        spark.vy -= 18 * dt; // gravity-ish for the spark arc
        spark.mesh.material.opacity = Math.max(0, t);
        spark.mesh.scale.multiplyScalar(1 - 0.4 * dt);
      }
      if (fx.light) fx.light.intensity = Math.max(0, t) * 8 * fx.scale;

      if (fx.life <= 0) {
        fx.ring.visible = false;
        for (const spark of fx.sparks) spark.mesh.visible = false;
        if (fx.light) { this.scene.remove(fx.light); fx.light = null; }
        fx.active = false;
        this.active.splice(i, 1);
      }
    }
  }

  /** Remove all active effects (game reset). */
  clear() {
    if (this.headless) return;
    for (const fx of this.active) {
      fx.ring.visible = false;
      for (const spark of fx.sparks) spark.mesh.visible = false;
      if (fx.light) { this.scene.remove(fx.light); fx.light = null; }
      fx.active = false;
    }
    this.active.length = 0;
  }
}
