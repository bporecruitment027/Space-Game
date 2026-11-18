/**
 * FollowCamera — smoothed overhead follow camera (Milestone 1 default),
 * with an optional chase view toggled by the C key.
 *
 * Overhead mode: fixed tilt (~65° down), follows the ship with critically
 * damped smoothing plus a velocity look-ahead so fast drift doesn't run
 * the ship off-screen. Chase mode: sits behind the ship's nose direction.
 */

import * as THREE from 'three';

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'overhead';
    this.offset = new THREE.Vector3(0, 55, 26); // high + slightly behind
    this.lookAhead = 0.35; // seconds of velocity to lead the target
    this.smooth = 4.5; // smoothing rate (higher = snappier)
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.initialized = false;
  }

  toggleMode() {
    this.mode = this.mode === 'overhead' ? 'chase' : 'overhead';
    return this.mode;
  }

  /**
   * @param {THREE.Vector3} shipPos   Ship world position.
   * @param {{x:number,z:number}} velocity Ship velocity (m/s).
   * @param {number} heading Ship heading in radians.
   */
  update(shipPos, velocity, heading, dt) {
    const lead = {
      x: velocity.x * this.lookAhead,
      z: velocity.z * this.lookAhead,
    };

    if (this.mode === 'overhead') {
      this.desired.set(shipPos.x + lead.x, this.offset.y, shipPos.z + this.offset.z + lead.z);
      this.target.set(shipPos.x + lead.x * 0.5, 0, shipPos.z + lead.z * 0.5);
    } else {
      // Chase: behind the nose, slightly above, looking forward.
      const back = { x: -Math.sin(heading), z: -Math.cos(heading) };
      this.desired.set(
        shipPos.x + back.x * 14 + lead.x * 0.3, 5,
        shipPos.z + back.z * 14 + lead.z * 0.3,
      );
      this.target.set(
        shipPos.x + Math.sin(heading) * 10, 1, shipPos.z + Math.cos(heading) * 10,
      );
    }

    if (!this.initialized) {
      this.camera.position.copy(this.desired);
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-this.smooth * dt);
      this.camera.position.lerp(this.desired, k);
    }
    this.camera.lookAt(this.target);
  }
}
