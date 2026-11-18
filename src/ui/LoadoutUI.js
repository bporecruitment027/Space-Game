/**
 * LoadoutUI — the skirmish-mode ship customization screen (Milestone 3).
 *
 * A DOM overlay with hull / weapon / module pickers. Selections are
 * validated with the same rules as `deriveStats`, so an invalid pick
 * is rejected with an inline reason instead of crashing at deploy.
 * The summary shows the derived stats (mass, HP, sensor range, fire
 * rate) so the player can feel the trade-offs before committing.
 *
 * The screen is shown/hidden by the game loop; `apply` commits the
 * chosen loadout to the Game.
 */

import {
  HULLS, WEAPON_DEFS, MODULE_DEFS, MAX_MODULES,
  defaultLoadout, deriveStats, validateLoadout, loadoutName,
} from '../modules/Modules.js';

export class LoadoutUI {
  constructor() {
    this.root = document.getElementById('loadout-screen');
    this.state = defaultLoadout();
    this.onDeploy = () => {};
    this.onCancel = () => {};
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="loadout-card">
        <div class="hud-title">SKIRMISH — LOADOUT</div>
        <div class="loadout-section">
          <div class="loadout-label">HULL</div>
          <div class="loadout-choices" id="loadout-hulls"></div>
        </div>
        <div class="loadout-section">
          <div class="loadout-label">WEAPON</div>
          <div class="loadout-choices" id="loadout-weapons"></div>
        </div>
        <div class="loadout-section">
          <div class="loadout-label">MODULES <span class="loadout-count" id="loadout-module-count"></span></div>
          <div class="loadout-choices" id="loadout-modules"></div>
        </div>
        <div class="loadout-stats" id="loadout-stats"></div>
        <div class="loadout-actions">
          <button id="loadout-deploy" class="loadout-btn">DEPLOY</button>
          <button id="loadout-reset" class="loadout-btn ghost">DEFAULTS</button>
        </div>
        <div class="loadout-note">Pick a hull, weapon, and up to ${MAX_MODULES} modules. Stats are derived, not free.</div>
      </div>
    `;

    // Hull buttons.
    const hullBox = this.root.querySelector('#loadout-hulls');
    for (const [id, hull] of Object.entries(HULLS)) {
      hullBox.appendChild(this._choice(id, hull.name, () => this._select('hull', id)));
    }
    // Weapon buttons.
    const weaponBox = this.root.querySelector('#loadout-weapons');
    for (const [id, w] of Object.entries(WEAPON_DEFS)) {
      weaponBox.appendChild(this._choice(id, w.name, () => this._select('weapon', id)));
    }
    // Module buttons (toggle).
    const moduleBox = this.root.querySelector('#loadout-modules');
    for (const [id, m] of Object.entries(MODULE_DEFS)) {
      moduleBox.appendChild(this._choice(id, m.name, () => this._toggleModule(id)));
    }

    this.root.querySelector('#loadout-deploy').addEventListener('click', () => this._deploy());
    this.root.querySelector('#loadout-reset').addEventListener('click', () => {
      this.state = defaultLoadout();
      this._render();
    });
    this._render();
  }

  _choice(id, label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'loadout-choice';
    btn.dataset.id = id;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _select(key, id) {
    this.state[key] = id;
    this._render();
  }

  _toggleModule(id) {
    const i = this.state.modules.indexOf(id);
    if (i >= 0) this.state.modules.splice(i, 1);
    else if (this.state.modules.length < MAX_MODULES) this.state.modules.push(id);
    this._render();
  }

  _render() {
    const valid = validateLoadout(this.state);
    // Highlight current selections.
    for (const btn of this.root.querySelectorAll('.loadout-choice')) {
      const id = btn.dataset.id;
      const active =
        (btn.closest('#loadout-hulls') && this.state.hull === id) ||
        (btn.closest('#loadout-weapons') && this.state.weapon === id) ||
        (btn.closest('#loadout-modules') && this.state.modules.includes(id));
      btn.classList.toggle('active', !!active);
      btn.disabled = btn.closest('#loadout-modules') && !active && this.state.modules.length >= MAX_MODULES;
    }

    this.root.querySelector('#loadout-module-count').textContent =
      `${this.state.modules.length}/${MAX_MODULES}`;

    // Derived stats preview.
    const statsBox = this.root.querySelector('#loadout-stats');
    if (valid.ok) {
      const s = deriveStats(this.state);
      statsBox.innerHTML = `
        <div class="stat-row"><span>Hull HP</span><strong>${s.maxHealth}</strong></div>
        <div class="stat-row"><span>Mass</span><strong>${s.mass} kg</strong></div>
        <div class="stat-row"><span>Thrust</span><strong>${s.maxThrust} N</strong></div>
        <div class="stat-row"><span>Sensor range</span><strong>${s.sensorRange} m</strong></div>
        <div class="stat-row"><span>Weapon</span><strong>${WEAPON_DEFS[this.state.weapon].name} (${Math.round(1 / WEAPON_DEFS[this.state.weapon].cooldown)} shots/s, ${WEAPON_DEFS[this.state.weapon].damage} dmg)</strong></div>
      `;
      statsBox.classList.remove('loadout-error');
    } else {
      statsBox.innerHTML = `<div class="loadout-error">${valid.errors.join('<br/>')}</div>`;
      statsBox.classList.add('loadout-error');
    }

    this.root.querySelector('#loadout-deploy').disabled = !valid.ok;
  }

  _deploy() {
    if (!validateLoadout(this.state).ok) return;
    this.onDeploy({ ...this.state, modules: [...this.state.modules] });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
