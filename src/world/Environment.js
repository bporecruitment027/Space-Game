/**
 * Environment — starfield, reference grid, and placeholder asteroids.
 *
 * The grid + asteroids exist for one reason: in empty space with no drag,
 * drift is invisible. Fixed reference objects let the player *see* that
 * the ship keeps moving after thrust is cut — the core Newtonian lesson
 * of Milestone 1. Asteroids are static placeholders here; Milestone 2
 * gives them physics bodies and fragmentation.
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

  // --- Placeholder asteroids (static, far from spawn) ---
  const asteroids = [];
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x8a7f72, metalness: 0.1, roughness: 0.95, flatShading: true,
  });
  const asteroidSpots = [
    { x: 60, z: -80, s: 9 }, { x: -90, z: -40, s: 14 },
    { x: 40, z: 110, s: 7 }, { x: -50, z: 90, s: 11 },
    { x: 130, z: 40, s: 18 }, { x: -140, z: -110, s: 12 },
  ];
  for (const spot of asteroidSpots) {
    const geo = new THREE.IcosahedronGeometry(spot.s, 1);
    // Displace vertices for a rocky silhouette.
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 0.75 + Math.random() * 0.5;
      v.multiplyScalar(n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(spot.x, 0, spot.z);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    asteroids.push({
      mesh: rock,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1,
      ),
    });
  }

  /** Slowly tumble the placeholder asteroids. */
  function update(dt) {
    for (const a of asteroids) {
      a.mesh.rotation.x += a.spin.x * dt;
      a.mesh.rotation.y += a.spin.y * dt;
      a.mesh.rotation.z += a.spin.z * dt;
    }
  }

  return { update };
}
