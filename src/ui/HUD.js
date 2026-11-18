/**
 * HUD — DOM overlay showing flight + combat readouts.
 *
 * The drift angle and velocity vector are the stars of the show: they
 * make invisible physics visible, which is the whole point of the
 * prototype. The velocity vector is drawn on a small canvas compass
 * (nose up, velocity arrow) so drift is obvious at a glance.
 *
 * M2 additions: score, kills, hull bar, and enemy health bars so the
 * player always knows where the threats are.
 */

export class HUD {
  #frame = 0;

  constructor() {
    this.root = document.getElementById('hud');
    this.enemyBox = document.getElementById('enemies');
    this.el = {};
    for (const id of ['score', 'kills', 'ore', 'speed', 'heading', 'thrust', 'drift', 'energy', 'fps', 'mode', 'boost', 'health']) {
      this.el[id] = document.getElementById(`hud-${id}`);
    }
    this.compass = document.getElementById('hud-compass');
    this.ctx = this.compass.getContext('2d');
    this.radar = document.getElementById('hud-radar');
    this.radarCtx = this.radar.getContext('2d');
    this.#frame = 0;
  }

  /**
   * @param {import('../entities/Ship.js').Ship} ship  Player ship
   * @param {object} opts { fps, cameraMode, boostFraction, game }
   */
  update(ship, { fps, cameraMode, boostFraction, game }) {
    this.#frame++;
    // Throttle text updates to every 3rd frame — cheap and flicker-free.
    if (this.#frame % 3 !== 0) return;

    const g = game ?? {};
    this.el.score.textContent = String(g.score ?? 0);
    this.el.kills.textContent = String(g.kills ?? 0);
    this.el.ore.textContent = String(g.ore ?? 0);

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

    // Player hull bar.
    const hull = (g.playerHealth ?? ship.health) / (g.playerMaxHealth ?? ship.maxHealth);
    this.el.health.style.width = `${Math.max(0, hull) * 100}%`;
    this.el.health.style.background = hull > 0.5
      ? '#4ad96a'
      : hull > 0.25 ? '#e0c13a' : '#e04a4a';

    this.#drawCompass(ship);
    this.#drawRadar(ship, g);
    this.#renderEnemies(g.enemies ?? []);
  }

  #drawRadar(ship, g) {
    const ctx = this.radarCtx;
    const S = this.radar.width;
    const c = S / 2;
    ctx.clearRect(0, 0, S, S);

    // Range rings: sensor range outer, half-range inner.
    const range = g.sensorRange ?? 65;
    const rangePx = S / 2 - 4;
    const scale = rangePx / range;

    ctx.strokeStyle = 'rgba(120,180,255,0.35)';
    ctx.lineWidth = 1;
    for (const frac of [0.5, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, rangePx * frac, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Crosshair
    ctx.beginPath();
    ctx.moveTo(c - 6, c); ctx.lineTo(c + 6, c);
    ctx.moveTo(c, c - 6); ctx.lineTo(c, c + 6);
    ctx.stroke();

    // Player marker at centre with heading tick.
    ctx.fillStyle = '#7fe3ff';
    ctx.beginPath();
    ctx.arc(c, c, 3, 0, Math.PI * 2);
    ctx.fill();
    const nose = ship.forward;
    ctx.strokeStyle = '#7fe3ff';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + nose.x * 8, c - nose.z * 8);
    ctx.stroke();

    // Contacts: live = solid red, ghost = fading outline.
    for (const contact of g.radar ?? []) {
      const dx = (contact.position.x - ship.position.x) * scale;
      const dz = (contact.position.z - ship.position.z) * scale;
      if (Math.hypot(dx, dz) > rangePx + 2) continue; // off-radar
      const x = c + dx;
      const y = c - dz;
      if (contact.tracked) {
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = `rgba(255,107,107,${contact.strength})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  #renderEnemies(enemies) {
    // Only rebuild when the enemy set changes shape (bars would flicker
    // if rebuilt every 3 frames at 60fps).
    const sig = enemies.map((e) => `${e.id}:${e.fraction.toFixed(2)}:${Math.round(e.distance)}`).join('|');
    if (this._enemySig === sig) return;
    this._enemySig = sig;

    this.enemyBox.innerHTML = '';
    if (enemies.length === 0) return;

    const title = document.createElement('div');
    title.className = 'hud-title';
    title.textContent = 'ENEMY THREATS';
    this.enemyBox.appendChild(title);

    for (const e of enemies) {
      const row = document.createElement('div');
      row.className = 'hud-row enemy-row';
      row.innerHTML = `<span>${e.id.replace('enemy-', 'HOSTILE ')} ${Math.round(e.distance)}m</span>`;
      const bar = document.createElement('div');
      bar.className = 'boost-bar';
      const fill = document.createElement('div');
      fill.style.width = `${e.fraction * 100}%`;
      fill.style.background = e.fraction > 0.5 ? '#e05a3a' : '#ff3b3b';
      bar.appendChild(fill);
      row.appendChild(bar);
      this.enemyBox.appendChild(row);
    }
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
