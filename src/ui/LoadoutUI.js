/**
 * LoadoutUI — the skirmish-mode ship customization screen (Milestone 3),
 * expanded in Milestone 5 with an upgrades shop.
 *
 * A DOM overlay with hull / weapon / module pickers plus an upgrades
 * section. Selections are validated with the same rules as
 * `deriveStats`, so an invalid pick is rejected with an inline reason
 * instead of crashing at deploy. The summary shows the derived stats
 * (mass, HP, sensor range, fire rate) so the player can feel the
 * trade-offs before committing.
 *
 * Upgrades (M5): ore mined from asteroids buys repeatable ship
 * upgrades. The shop shows current ore, each upgrade's cost and level,
 * and a BUY button that's disabled when ore is insufficient. Buying
 * calls `onUpgrade(id)`; the game applies it and reports back via
 * `setOre` / `applyUpgrade`.
 *
 * The screen is shown/hidden by the game loop; `apply` commits the
 * chosen loadout to the Game.
 */

import {
  HULLS, WEAPON_DEFS, MODULE_DEFS, MAX_MODULES,
  defaultLoadout, deriveStats, validateLoadout, loadoutName,
} from '../modules/Modules.js';
import { UPGRADE_DEFS, upgradeCost } from '../modules/Upgrades.js';

export class LoadoutUI {
  constructor() {
    this.root = document.getElementById('loadout-screen');
    this.state = defaultLoadout();
    this.ore = 0;
    this.levels = {}; // upgrade id → level (mirrors the ship)
    this.onDeploy = () => {};
    this.onCancel = () => {};
    this.onUpgrade = () => {};
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="loadout-card">
        <div class="hud-title">SKIRMISH — LOADOUT</div>
        <div class="loadout-ore" id="loadout-ore">Ore: 0</div>
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
        <div class="loadout-section">
          <div class="loadout-label">UPGRADES</div>
          <div class="loadout-choices" id="loadout-upgrades"></div>
        </div>
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
    // Upgrade buy buttons.
    const upgradeBox = this.root.querySelector('#loadout-upgrades');
    for (const [id, u] of Object.entries(UPGRADE_DEFS)) {
      const btn = document.createElement('button');
      btn.className = 'loadout-choice upgrade-buy';
      btn.dataset.id = id;
      btn.addEventListener('click', () => this._buyUpgrade(id));
      upgradeBox.appendChild(btn);
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

  _buyUpgrade(id) {
    if (!(id in UPGRADE_DEFS)) return;
    this.onUpgrade(id);
  }

  /** Update the ore display (called by the game after mining/buying).
   *  Skips the re-render when the value is unchanged — the shop is
   *  synced every frame, so this keeps the hot path cheap. */
  setOre(ore) {
    if (this.ore === ore) return;
    this.ore = ore;
    this._render();
  }

  /** Record a successful upgrade purchase (called by the game). */
  applyUpgrade(id, level) {
    this.levels[id] = level;
    this._render();
  }

  _render() {
    const valid = validateLoadout(this.state);
    // Highlight current selections.
    for (const btn of this.root.querySelectorAll('.loadout-choice')) {
      const id = btn.dataset.id;
      const isUpgrade = btn.classList.contains('upgrade-buy');
      if (isUpgrade) continue;
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

    // Ore + upgrades.
    this.root.querySelector('#loadout-ore').textContent = `Ore: ${this.ore}`;
    for (const [id, u] of Object.entries(UPGRADE_DEFS)) {
      const btn = this.root.querySelector(`.upgrade-buy[data-id="${id}"]`);
      const level = this.levels[id] ?? 0;
      const cost = upgradeCost(id, level);
      btn.textContent = `${u.name} · Lv${level} · ${cost} ore`;
      btn.title = u.description;
      btn.disabled = this.ore < cost;
    }
  }

  _deploy() {
    if (!validateLoadout(this.state).ok) return;
    this.onDeploy({ ...this.state, modules: [...this.state.modules] });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
