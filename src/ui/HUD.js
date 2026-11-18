/**
 * HUD — DOM overlay showing the Newtonian flight readouts.
 *
 * The drift angle and velocity vector are the stars of the show: they
 * make invisible physics visible, which is the whole point of the
 * Milestone 1 prototype. The velocity vector is drawn on a small
 * canvas compass (nose up, velocity arrow) so drift is obvious at a
 * glance.
 */

export class HUD {
  #frame = 0;

  constructor() {
    this.root = document.getElementById('hud');
    this.el = {};
    for (const id of ['speed', 'heading', 'thrust', 'drift', 'energy', 'fps', 'mode', 'boost']) {
      this.el[id] = document.getElementById(`hud-${id}`);
    }
    this.compass = document.getElementById('hud-compass');
    this.ctx = this.compass.getContext('2d');
    this.#frame = 0;
  }

  /**
   * @param {import('../physics/ShipPhysics.js').ShipPhysics} ship
   * @param {object} opts { fps, cameraMode, boostFraction }
   */
  update(ship, { fps, cameraMode, boostFraction }) {
    this.#frame++;
    // Throttle text updates to every 3rd frame — cheap and flicker-free.
    if (this.#frame % 3 !== 0) return;

    const headingDeg = ((ship.heading * 180) / Math.PI % 360 + 360) % 360;
    this.el.speed.textContent = `${ship.speed.toFixed(1)} m/s`;
    this.el.heading.textContent = `${headingDeg.toFixed(0).padStart(3, '0')}°`;
    this.el.thrust.textContent = `${Math.round(ship.thrustLevel * 100)}%`;
    this.el.drift.textContent = `${ship.driftAngleDeg.toFixed(0)}°`;
    this.el.energy.textContent = `${(ship.kineticEnergy / 1000).toFixed(1)} kJ`;
    this.el.fps.textContent = `${fps.toFixed(0)} fps`;
    this.el.mode.textContent = cameraMode.toUpperCase();
    this.el.boost.textContent = `${Math.round(boostFraction * 100)}%`;
    this.el.boost.style.width = `${boostFraction * 100}%`;

    this.#drawCompass(ship);
  }

  #drawCompass(ship) {
    const ctx = this.ctx;
    const S = this.compass.width;
    const c = S / 2;
    ctx.clearRect(0, 0, S, S);

    // Ring
    ctx.strokeStyle = 'rgba(120,180,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, Math.PI * 2);
    ctx.stroke();

    // Nose marker (ship forward = up on the compass).
    ctx.fillStyle = '#7fe3ff';
    ctx.beginPath();
    ctx.moveTo(c, 6);
    ctx.lineTo(c - 5, 16);
    ctx.lineTo(c + 5, 16);
    ctx.closePath();
    ctx.fill();

    // Velocity arrow, rotated by drift angle relative to the nose.
    if (ship.speed > 0.5) {
      const driftRad = (ship.driftAngleDeg * Math.PI) / 180;
      // Sign: cross product of forward × velocity (positive = drifting right).
      const f = ship.forward;
      const cross = f.x * ship.velocity.z - f.z * ship.velocity.x;
      const signed = cross >= 0 ? driftRad : -driftRad;
      const len = Math.min(c - 8, 8 + ship.speed * 0.6);
      const x = c + Math.sin(signed) * len;
      const y = c - Math.cos(signed) * len;
      ctx.strokeStyle = '#ffb347';
      ctx.fillStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
