/**
 * KeyboardInput — maps physical keys to game commands.
 *
 * Keys (Milestone 1 + 2):
 *   W / ↑        main thruster (forward)
 *   S / ↓        retro thruster (reverse)
 *   A / D / ←/→  yaw left / right (RCS torque)
 *   X / Space    autobrake (counter-thrust until stopped)
 *   Shift        boost (2× thrust — burns "boost" budget, see HUD)
 *   J            fire laser cannon
 *   R            reset ship to spawn
 *   C            toggle overhead / chase camera
 *   P / Esc      pause
 *
 * Edge-triggered actions (reset, camera, pause) are exposed as a queue
 * of events the game loop drains each frame, so input handling stays
 * decoupled from game logic. Fire is edge-triggered for the player's
 * fire-rate limit; the continuous command carries the current state.
 */

export class KeyboardInput {
  constructor() {
    this.keys = new Set();
    this.events = []; // queued edge-triggered action names
    this.enabled = true;

    window.addEventListener('keydown', (e) => this.#onKey(e, true));
    window.addEventListener('keyup', (e) => this.#onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  #onKey(e, down) {
    if (!this.enabled) return;
    const code = e.code;
    // Prevent page scroll / button activation for game keys.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }
    if (down) {
      if (!this.keys.has(code)) {
        if (code === 'KeyR') this.events.push('reset');
        if (code === 'KeyC') this.events.push('camera');
        if (code === 'KeyP' || code === 'Escape') this.events.push('pause');
      }
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  /** Continuous commands for the physics step. */
  getCommand() {
    const k = this.keys;
    let thrust = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) thrust += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) thrust -= 1;

    let yaw = 0;
    if (k.has('KeyD') || k.has('ArrowRight')) yaw += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) yaw -= 1;

    return {
      thrust,
      yaw,
      brake: k.has('KeyX') || k.has('Space'),
      boost: k.has('ShiftLeft') || k.has('ShiftRight'),
      fire: k.has('KeyJ'),
    };
  }

  /** Drain queued edge-triggered actions (e.g. 'reset', 'camera'). */
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
