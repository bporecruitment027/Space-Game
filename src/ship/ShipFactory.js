/**
 * ShipFactory — builds procedural ship meshes with Three.js.
 *
 * Falling Frontier style: realistic military vessel silhouettes rather
 * than arcade placeholders. One parametric builder produces four distinct
 * hull archetypes from shape parameters (length, beam, wing span,
 * engine layout), so each loadout hull reads differently on the field:
 *
 *   fighter — sleek interceptor, single engine, swept wings
 *   bulwark — stubby escort, twin engines, broad armored hull
 *   scout   — slender courier, long thin hull, minimal profile
 *   heavy   — bulky destroyer, twin nacelles, wide platform
 *
 * No external assets: everything is geometry, so the demo runs with
 * zero downloads. The returned `group` + `setThrustVisuals()` /
 * `flashDamage()` / `updateFlash()` interface is unchanged from M1–M5.
 */

import * as THREE from 'three';

/** Shape parameters per hull archetype. */
const HULL_SHAPES = {
  fighter: { length: 3.4, beam: 1.0, height: 0.5, wing: 2.4, engines: 1, bridge: 0.34 },
  bulwark: { length: 2.8, beam: 1.6, height: 0.6, wing: 2.2, engines: 2, bridge: 0.4 },
  scout: { length: 4.2, beam: 0.7, height: 0.4, wing: 1.4, engines: 1, bridge: 0.28 },
  heavy: { length: 3.6, beam: 2.0, height: 0.7, wing: 2.8, engines: 2, bridge: 0.46 },
};

export function createShip(options = {}) {
  const hullId = options.hull ?? 'fighter';
  const shape = HULL_SHAPES[hullId] ?? HULL_SHAPES.fighter;
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

  const { length, beam, height, wing, engines, bridge } = shape;
  const halfLen = length / 2;

  // --- Main hull: tapered fuselage (extruded box, nose-narrowed) ---
  // Build the hull as a box with a tapered nose via a custom shape.
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-halfLen * 0.7, -beam / 2);
  hullShape.lineTo(halfLen * 0.85, -beam / 2);
  hullShape.lineTo(halfLen, 0); // nose point
  hullShape.lineTo(halfLen * 0.85, beam / 2);
  hullShape.lineTo(-halfLen * 0.7, beam / 2);
  hullShape.lineTo(-halfLen * 0.7, -beam / 2);
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: height, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1,
  });
  hullGeo.rotateX(-Math.PI / 2); // lie flat, nose toward +Z
  hullGeo.translate(0, height / 2, 0);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  group.add(hull);

  // --- Keel / armor spine along the bottom ---
  const keel = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.8, height * 0.4, beam * 0.5), darkMat,
  );
  keel.position.set(0, -height * 0.15, -0.2);
  group.add(keel);

  // --- Bridge / cockpit (raised, toward the front third) ---
  const bridgeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(beam * 0.7, height * 0.8, length * 0.22), darkMat,
  );
  bridgeMesh.position.set(0, height * 0.5, halfLen * 0.35);
  group.add(bridgeMesh);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(bridge, 12, 10), glassMat);
  canopy.scale.set(beam * 0.5, height * 0.5, length * 0.18);
  canopy.position.set(0, height * 0.7, halfLen * 0.4);
  group.add(canopy);

  // --- Wings / fins (swept back, perpendicular to the hull) ---
  const wingGeo = new THREE.BoxGeometry(wing, 0.08, length * 0.42);
  const wings = new THREE.Mesh(wingGeo, darkMat);
  wings.position.set(0, -height * 0.05, -halfLen * 0.25);
  group.add(wings);

  // Wingtip accents (directional markers).
  const tipGeo = new THREE.BoxGeometry(0.1, height * 0.5, length * 0.18);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(tipGeo, accentMat);
    tip.position.set(side * wing / 2, height * 0.1, -halfLen * 0.25);
    group.add(tip);
  }

  // --- Tail fin (vertical stabilizer at the rear) ---
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, height * 1.4, length * 0.22), darkMat,
  );
  fin.position.set(0, height * 0.6, -halfLen * 0.7);
  group.add(fin);

  // --- Engine nacelles + glow + flame ---
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x66d9ff });
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x7fe3ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flames = [];
  const glows = [];
  const engineX = engines === 2 ? [-beam * 0.42, beam * 0.42] : [0];
  for (const ex of engineX) {
    const nacelle = new THREE.Mesh(
      new THREE.CylinderGeometry(beam * 0.16, beam * 0.2, length * 0.3, 10), darkMat,
    );
    nacelle.rotation.x = Math.PI / 2; // cylinder axis along Z
    nacelle.position.set(ex, -height * 0.1, -halfLen * 0.75);
    group.add(nacelle);

    const glow = new THREE.Mesh(new THREE.CircleGeometry(beam * 0.14, 12), glowMat);
    glow.position.set(ex, -height * 0.1, -halfLen * 0.9);
    glow.rotation.y = Math.PI; // face backward
    group.add(glow);
    glows.push(glow);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(beam * 0.13, length * 0.5, 10), flameMat);
    flame.rotation.x = -Math.PI / 2; // tip toward -Z (backward)
    flame.position.set(ex, -height * 0.1, -halfLen * 1.15);
    flame.scale.set(1, 0.001, 1); // hidden until thrusting
    group.add(flame);
    flames.push(flame);
  }

  // --- Engine point light (only visible when thrusting) ---
  const light = new THREE.PointLight(0x66d9ff, 0, 14, 1.5);
  light.position.set(0, -height * 0.1, -halfLen * 1.0);
  group.add(light);

  // --- RCS puff at the nose ---
  const rcsMat = new THREE.MeshBasicMaterial({
    color: 0xffcc66, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rcs = new THREE.Mesh(new THREE.SphereGeometry(beam * 0.12, 8, 8), rcsMat);
  rcs.position.set(0, 0, halfLen * 0.9);
  group.add(rcs);

  // --- Weapon mounts (small turret studs on the wings) ---
  const turretMat = darkMat;
  for (const side of [-1, 1]) {
    const turret = new THREE.Mesh(
      new THREE.CylinderGeometry(beam * 0.1, beam * 0.1, height * 0.3, 8), turretMat,
    );
    turret.position.set(side * wing * 0.55, height * 0.1, halfLen * 0.1);
    group.add(turret);
  }

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  /**
   * Drive thruster visuals from physics state.
   * @param {number} thrustLevel -1..1 smoothed thrust
   * @param {number} yawLevel    -1..1 smoothed yaw command
   */
  function setThrustVisuals(thrustLevel, yawLevel) {
    const t = Math.abs(thrustLevel);
    for (const flame of flames) {
      flame.scale.set(1, Math.max(0.001, t), 1);
      flame.material.opacity = 0.25 + 0.65 * t;
      flame.visible = t > 0.02;
    }
    light.intensity = t * 30;
    for (const glow of glows) {
      glowMat.color.setHex(thrustLevel >= 0 ? 0x66d9ff : 0xffaa55);
    }
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
