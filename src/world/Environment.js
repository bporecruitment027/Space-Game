/**
 * Environment — starfield, nebula backdrop, and reference grid.
 *
 * Falling Frontier style deep-space: a layered starfield (far field +
 * a closer dust layer) over a soft nebula backdrop that gives the void
 * depth and color. The reference grid remains for one reason: in empty
 * space with no drag, drift is invisible — fixed reference objects let
 * the player *see* that the ship keeps moving after thrust is cut, the
 * core Newtonian lesson of the prototype.
 *
 * Asteroids moved out of here in Milestone 2: they are dynamic entities
 * owned by the Game (src/world/Asteroids.js), with fragmentation and
 * respawns.
 */

import * as THREE from 'three';

export function createEnvironment(scene) {
  // --- Far starfield: shell of points at increasing distance ---
  const farGeo = new THREE.BufferGeometry();
  const farCount = 5000;
  const farPos = new Float32Array(farCount * 3);
  const farCol = new Float32Array(farCount * 3);
  const palette = [
    new THREE.Color(0xffffff), new THREE.Color(0xbfd4ff),
    new THREE.Color(0xffe0b3), new THREE.Color(0xffc4c4),
  ];
  for (let i = 0; i < farCount; i++) {
    const r = 700 + Math.random() * 1800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    farPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    farPos[i * 3 + 1] = r * Math.cos(phi);
    farPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = palette[Math.floor(Math.random() * palette.length)];
    const dim = 0.35 + Math.random() * 0.65;
    farCol[i * 3] = c.r * dim;
    farCol[i * 3 + 1] = c.g * dim;
    farCol[i * 3 + 2] = c.b * dim;
  }
  farGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3));
  farGeo.setAttribute('color', new THREE.BufferAttribute(farCol, 3));
  const farStars = new THREE.Points(farGeo, new THREE.PointsMaterial({
    size: 2.4, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  }));
  scene.add(farStars);

  // --- Close dust layer: nearer, brighter points around the arena ---
  const dustGeo = new THREE.BufferGeometry();
  const dustCount = 900;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 120 + Math.random() * 480;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dustPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.5; // flatten toward the plane
    dustPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = palette[Math.floor(Math.random() * palette.length)];
    dustCol[i * 3] = c.r;
    dustCol[i * 3 + 1] = c.g;
    dustCol[i * 3 + 2] = c.b;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 1.6, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.5, depthWrite: false,
  }));
  scene.add(dust);

  // --- Nebula backdrop: large soft colored planes far behind ---
  // Gives the void depth and color without any texture downloads.
  const nebulaColors = [0x2a3a6a, 0x4a2a5a, 0x1a4a4a, 0x5a3a2a];
  const nebulas = [];
  for (let i = 0; i < 4; i++) {
    const size = 1400 + Math.random() * 600;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: nebulaColors[i], transparent: true, opacity: 0.16,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(geo, mat);
    const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
    const r = 1600 + Math.random() * 400;
    plane.position.set(Math.cos(angle) * r, -200 + Math.random() * 400, Math.sin(angle) * r);
    plane.lookAt(0, 0, 0);
    scene.add(plane);
    nebulas.push(plane);
  }

  // --- Reference grid (1 unit = 1 metre; grid lines every 10 m) ---
  const grid = new THREE.GridHelper(2000, 200, 0x2a4a6a, 0x16283c);
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  scene.add(grid);

  /**
   * Update environment animations. The nebula planes drift slowly and
   * the dust layer rotates for a living deep-space feel.
   */
  function update(dt) {
    for (let i = 0; i < nebulas.length; i++) {
      const n = nebulas[i];
      n.rotation.z += dt * 0.004 * (i % 2 === 0 ? 1 : -1);
    }
    dust.rotation.y += dt * 0.008;
  }

  return { update };
}
