/**
 * GameServer — authoritative multiplayer server (Milestone 4).
 *
 * Runs the exact same `Game` simulation as the browser client, but
 * headless (no Three.js rendering). Clients connect over WebSocket and
 * send ONLY their input commands; the server owns all state and
 * broadcasts authoritative snapshots at a fixed tick rate.
 *
 * Wire protocol (JSON messages):
 *   Client → Server:
 *     { type: 'join', name, loadout }        Request to join
 *     { type: 'input', shipId, command }     Per-tick input command
 *     { type: 'leave' }                      Disconnect (implicit on close)
 *   Server → Client:
 *     { type: 'welcome', shipId, snapshot }  Join accepted + initial state
 *     { type: 'snapshot', snapshot }         Authoritative world state
 *     { type: 'event', event }               Kill / player-killed / etc.
 *     { type: 'kick', reason }               Removed (game over / full)
 *
 * The server is the single source of truth: clients never simulate
 * physics, they render whatever the server says. This is the pattern
 * the GDD mandates for M4 and the foundation for M5+ content.
 */

import { WebSocketServer } from 'ws';
import { Game } from '../src/Game.js';

export class GameServer {
  /**
   * @param {object} [opts]
   * @param {number} [opts.port] WebSocket port.
   * @param {number} [opts.tickRate] Server simulation ticks per second.
   * @param {number} [opts.maxPlayers] Max connected players.
   * @param {number} [opts.enemyCount] AI enemies in the arena.
   */
  constructor({ port = 8080, tickRate = 30, maxPlayers = 6, enemyCount = 4 } = {}) {
    this.port = port;
    this.tickRate = tickRate;
    this.maxPlayers = maxPlayers;
    this.enemyCount = enemyCount;
    this.dt = 1 / tickRate;

    // Headless Game — no scene, no rendering.
    this.game = new Game(null, { enemyCount, spawnRadius: 45, headless: true });
    this.game.state = 'running'; // server runs immediately, no loadout screen
    // The constructor's phantom local player would be shot by the AI
    // before any real client joins, flipping the game to 'over' and
    // freezing the tick loop. Evict it so only connected players count.
    this.game.removePlayer('player');

    // Broadcast game events (kills, player join/leave) to all clients.
    this.game.onEvent = (name, data) => this._broadcast({ type: 'event', event: { name, data } });

    // Map of shipId → WebSocket for input routing.
    this.connections = new Map();
    this.wss = null;
  }

  /** Start the WebSocket server and the fixed-tick loop. */
  start() {
    this.wss = new WebSocketServer({ port: this.port });
    this.wss.on('connection', (ws) => this._onConnection(ws));
    // Fixed-tick loop: step physics, then broadcast snapshot.
    this._interval = setInterval(() => this._tick(), 1000 / this.tickRate);
    // eslint-disable-next-line no-console
    console.log(`[GameServer] listening on ws://0.0.0.0:${this.port} (${this.tickRate} Hz, max ${this.maxPlayers} players)`);
  }

  _onConnection(ws) {
    ws._shipId = null;

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      this._onMessage(ws, msg);
    });

    ws.on('close', () => this._onDisconnect(ws));
    ws.on('error', () => this._onDisconnect(ws));
  }

  _onMessage(ws, msg) {
    switch (msg.type) {
      case 'join':
        this._handleJoin(ws, msg);
        break;
      case 'input':
        this._handleInput(ws, msg);
        break;
      case 'leave':
        this._onDisconnect(ws);
        break;
      default:
        break; // ignore unknown message types
    }
  }

  _handleJoin(ws, msg) {
    if (this.connections.size >= this.maxPlayers) {
      this._send(ws, { type: 'kick', reason: 'server full' });
      ws.close();
      return;
    }
    const shipId = `player-${this.connections.size + 1}`;
    const loadout = msg.loadout ?? { hull: 'fighter', weapon: 'laser', modules: [] };
    const ship = this.game.addPlayer(shipId, loadout);
    ws._shipId = shipId;
    this.connections.set(shipId, ws);

    this._send(ws, { type: 'welcome', shipId, snapshot: this.game.snapshot() });
    // eslint-disable-next-line no-console
    console.log(`[GameServer] ${shipId} joined (${this.connections.size}/${this.maxPlayers})`);
  }

  _handleInput(ws, msg) {
    const shipId = ws._shipId;
    if (!shipId || shipId !== msg.shipId) return;
    // Buffer the latest command — applied on the next tick.
    this.game._pendingInputs ??= new Map();
    this.game._pendingInputs.set(shipId, msg.command);
  }

  _onDisconnect(ws) {
    const shipId = ws._shipId;
    if (!shipId || !this.connections.has(shipId)) return;
    this.connections.delete(shipId);
    this.game.removePlayer(shipId);
    // eslint-disable-next-line no-console
    console.log(`[GameServer] ${shipId} disconnected (${this.connections.size}/${this.maxPlayers})`);
  }

  _tick() {
    if (this.game.state === 'over') {
      // A round ended: give clients a moment to see the game-over
      // event, then auto-reset the world for the next round.
      if (!this._resetting) {
        this._resetting = true;
        setTimeout(() => {
          this.game.reset();
          this._resetting = false;
        }, 3000);
      }
      return;
    }
    if (this.game.state !== 'running') return;

    // Collect buffered inputs for all connected players.
    const inputs = [];
    if (this.game._pendingInputs) {
      for (const [shipId, command] of this.game._pendingInputs) {
        inputs.push({ shipId, command });
      }
      this.game._pendingInputs.clear();
    }

    this.game.step(this.dt, inputs.length > 0 ? inputs : null);
    this.game.tickStep();
    this._broadcast({ type: 'snapshot', snapshot: this.game.snapshot() });
  }

  _broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.connections.values()) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  _send(ws, msg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  /** Stop the server and close all connections. */
  stop() {
    if (this._interval) clearInterval(this._interval);
    for (const ws of this.connections.values()) ws.close();
    if (this.wss) this.wss.close();
  }
}
