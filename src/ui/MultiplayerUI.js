/**
 * MultiplayerUI — connection overlay + live leaderboard (Milestone 4).
 *
 * A DOM overlay with a server-URL field and a Join button, plus a
 * compact leaderboard panel showing every ship in the authoritative
 * world with its kills and score (the server owns the numbers; this
 * panel just renders the latest snapshot).
 *
 * Also exposes a `status` line for connection state and a
 * `disconnect()` action to return to solo play.
 */

export class MultiplayerUI {
  constructor() {
    this.root = document.getElementById('net-screen');
    this.panel = document.getElementById('net-leaderboard');
    this.statusEl = document.getElementById('net-status');
    this.onJoin = () => {};
    this.onDisconnect = () => {};
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="loadout-card">
        <div class="hud-title">MULTIPLAYER — CONNECT</div>
        <div class="loadout-note">
          Join an authoritative server. The server owns all physics and
          combat; your client sends input commands and renders the
          broadcast state.
        </div>
        <div class="loadout-section">
          <div class="loadout-label">SERVER URL</div>
          <input id="net-url" type="text" placeholder="ws://host:8080" value="" />
        </div>
        <div class="loadout-actions">
          <button id="net-join" class="loadout-btn">JOIN</button>
          <button id="net-cancel" class="loadout-btn ghost">CANCEL</button>
        </div>
        <div class="loadout-note" id="net-error"></div>
      </div>
    `;

    const urlInput = this.root.querySelector('#net-url');
    // Pre-fill with the current origin on a non-standard port.
    urlInput.value = `ws://${window.location.hostname}:8080`;

    this.root.querySelector('#net-join').addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) return;
      this._error('');
      this.onJoin(url);
    });
    this.root.querySelector('#net-cancel').addEventListener('click', () => this.hide());
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.root.querySelector('#net-join').click();
    });
  }

  _error(msg) {
    const el = this.root.querySelector('#net-error');
    el.textContent = msg;
    el.classList.toggle('loadout-error', !!msg);
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  /** Render the leaderboard from a server snapshot's ships array. */
  renderLeaderboard(ships) {
    if (!this.panel) return;
    // Sort by kills desc, then score desc.
    const sorted = [...ships].sort((a, b) => b.kills - a.kills || b.score - a.score);
    this.panel.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'hud-title';
    title.textContent = 'KILL LEADERBOARD';
    this.panel.appendChild(title);
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const row = document.createElement('div');
      row.className = 'lb-row' + (s.isPlayer ? ' lb-me' : '');
      row.innerHTML = `<span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${s.id}</span>
        <span class="lb-kills">${s.kills}</span>
        <span class="lb-score">${s.score}</span>`;
      this.panel.appendChild(row);
    }
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
