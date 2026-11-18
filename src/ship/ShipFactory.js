/**
 * ShipFactory — builds the player ship mesh procedurally with Three.js.
 *
 * Milestone 1 uses placeholder geometry (no external assets) so the demo
 * runs with zero downloads. The ship is built nose-first toward +Z to
 * match ShipPhysics' forward convention (forward = sin/cos of heading).
 *
 * In Milestone 5 this factory is replaced by a glTF 2.0 loader
 * (Blender-authored hulls, Draco/KTX2 compressed) — the returned
 * `group` + `setThrustVisuals()` interface stays the same.
 */

import * as THREE from 'three';

export function createShip(options = {}) {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: options.hullColor ?? 0xb8c4d4, metalness: 0.85, roughness: 0.35,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: options.darkColor ?? 0x2a3342, metalness: 0.7, roughness: 0.5,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: options.accentColor ?? 0xff8c2e, metalness: 0.4, roughness: 0.4,
    emissive: options.accentColor ?? 0xff8c2e, emissiveIntensity: 0.25,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x66ccff, metalness: 0.1, roughness: 0.1,
    emissive: 0x113355, emissiveIntensity: 0.8,
  });

  // --- Fuselage: tapered box + nose cone ---
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 3.2), hullMat);
  fuselage.position.z = 0.2;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 8), hullMat);
  nose.rotation.x = Math.PI / 2; // cone tip toward +Z
  nose.position.z = 2.5;
  group.add(nose);

  // --- Cockpit canopy ---
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), glassMat);
  canopy.scale.set(0.9, 0.55, 1.6);
  canopy.position.set(0, 0.28, 0.9);
  group.add(canopy);

  // --- Wings (swept back) ---
  const wingGeo = new THREE.BoxGeometry(2.6, 0.08, 1.0);
  const wings = new THREE.Mesh(wingGeo, darkMat);
  wings.position.set(0, -0.05, -0.9);
  group.add(wings);

  const wingTipGeo = new THREE.BoxGeometry(0.12, 0.3, 0.7);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(wingTipGeo, accentMat);
    tip.position.set(side * 1.3, 0.1, -0.9);
    group.add(tip);
  }

  // --- Tail fin ---
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.9), darkMat);
  fin.position.set(0, 0.4, -1.3);
  group.add(fin);

  // --- Engine block + glow discs ---
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.5), darkMat);
  engine.position.set(0, 0, -1.6);
  group.add(engine);

  const glowMat = new THREE.MeshBasicMaterial({ color: 0x66d9ff });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), glowMat);
  glow.position.set(0, 0, -1.86);
  glow.rotation.y = Math.PI; // face backward
  group.add(glow);

  // --- Thruster flame (scaled by thrust level) ---
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x7fe3ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 12), flameMat);
  flame.rotation.x = -Math.PI / 2; // tip toward -Z (backward)
  flame.position.set(0, 0, -2.9);
  flame.scale.set(1, 0.001, 1); // hidden until thrusting
  group.add(flame);

  // --- Engine point light (only visible when thrusting) ---
  const light = new THREE.PointLight(0x66d9ff, 0, 12, 1.5);
  light.position.set(0, 0, -2.2);
  group.add(light);

  // --- RCS puffs: small quads at the nose that flash on yaw input ---
  const rcsMat = new THREE.MeshBasicMaterial({
    color: 0xffcc66, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rcs = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), rcsMat);
  rcs.position.set(0, 0, 2.2);
  group.add(rcs);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  /**
   * Drive thruster visuals from physics state.
   * @param {number} thrustLevel -1..1 smoothed thrust
   * @param {number} yawLevel    -1..1 smoothed yaw command
   */
  function setThrustVisuals(thrustLevel, yawLevel) {
    const t = Math.abs(thrustLevel);
    flame.scale.set(1, Math.max(0.001, t), 1);
    flame.material.opacity = 0.25 + 0.65 * t;
    flame.visible = t > 0.02;
    light.intensity = t * 30;
    glowMat.color.setHex(thrustLevel >= 0 ? 0x66d9ff : 0xffaa55);
    rcsMat.opacity = Math.min(1, Math.abs(yawLevel) * 1.2);
    rcs.position.x = -yawLevel * 0.5; // puff on the side opposite the turn
  }

  // Collect emissive-capable materials for damage flashes.
  const flashMats = [];
  group.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) flashMats.push(o.material);
  });
  let flashTime = 0;

  /** Brief red emissive flash when the ship takes a hit. */
  function flashDamage() {
    flashTime = 0.12;
    for (const m of flashMats) m.emissive.setHex(0xff2222);
  }

  /** Call every frame; decays the damage flash back to normal. */
  function updateFlash(dt) {
    if (flashTime > 0) {
      flashTime -= dt;
      if (flashTime <= 0) {
        for (const m of flashMats) {
          m.emissive.setHex(m === accentMat ? (options.accentColor ?? 0xff8c2e) : 0x000000);
          m.emissiveIntensity = m === accentMat ? 0.25 : 1;
        }
      }
    }
  }

  return { group, setThrustVisuals, flashDamage, updateFlash };
}
