/**
 * Environment — starfield and reference grid.
 *
 * The grid exists for one reason: in empty space with no drag, drift is
 * invisible. Fixed reference objects let the player *see* that the ship
 * keeps moving after thrust is cut — the core Newtonian lesson of the
 * prototype. Asteroids moved out of here in Milestone 2: they are now
 * dynamic entities owned by the Game (src/world/Asteroids.js), with
 * fragmentation and respawns.
 */

import * as THREE from 'three';

export function createEnvironment(scene) {
  // --- Starfield: 3 shells of points at increasing distance ---
  const starGeo = new THREE.BufferGeometry();
  const starCount = 4000;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const palette = [
    new THREE.Color(0xffffff), new THREE.Color(0xbfd4ff),
    new THREE.Color(0xffe0b3), new THREE.Color(0xffc4c4),
  ];
  for (let i = 0; i < starCount; i++) {
    const r = 600 + Math.random() * 1400;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = palette[Math.floor(Math.random() * palette.length)];
    const dim = 0.4 + Math.random() * 0.6;
    colors[i * 3] = c.r * dim;
    colors[i * 3 + 1] = c.g * dim;
    colors[i * 3 + 2] = c.b * dim;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  }));
  scene.add(stars);

  // --- Reference grid (1 unit = 1 metre; grid lines every 10 m) ---
  const grid = new THREE.GridHelper(2000, 200, 0x2a4a6a, 0x16283c);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  /**
   * Update environment animations. Starfield and grid are static; the
   * call exists so main.js has a stable hook as the world grows.
   */
  function update(dt) {
    // Reserved for future animated background layers.
    void dt;
  }

  return { update };
}
