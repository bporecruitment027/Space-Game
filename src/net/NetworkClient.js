/**
 * NetworkClient — client-side multiplayer networking (Milestone 4).
 *
 * Connects to the authoritative GameServer over WebSocket. Sends the
 * player's input commands each tick and receives authoritative world
 * snapshots. The client NEVER simulates physics — it renders whatever
 * the server says, applying snapshots to the local Three.js scene.
 *
 * The client owns a local "remote world" of ship meshes that it
 * creates/updates/removes from incoming snapshots. The local player
 * ship is driven by keyboard input (sent to the server) and its mesh
 * is positioned from the server's snapshot (authoritative position).
 *
 * Usage:
 *   const net = new NetworkClient(scene, { url });
 *   net.connect();
 *   // Each frame: net.sendInput(command) and net.applyToScene(scene);
 */

import * as THREE from 'three';
import { Ship } from '../entities/Ship.js';
import { deriveStats, defaultLoadout } from '../modules/Modules.js';

export class NetworkClient {
  /**
   * @param {THREE.Scene} scene  The local rendering scene.
   * @param {object} [opts]
   * @param {string} [opts.url]  WebSocket URL.
   * @param {string} [opts.name] Player name.
   * @param {object} [opts.loadout] Initial loadout.
   */
  constructor(scene, { url, name = 'pilot', loadout = defaultLoadout() } = {}) {
    this.scene = scene;
    this.url = url ?? `ws://${window.location.hostname}:8080`;
    this.name = name;
    this.loadout = loadout;

    this.ws = null;
    this.shipId = null;
    this.connected = false;

    // Last authoritative snapshot (stored for the HUD/camera).
    this.lastSnapshot = null;

    // Remote ship meshes managed from snapshots: id → { ship, mesh }.
    this.remoteShips = new Map();

    // Events the caller can hook.
    this.onConnect = () => {};
    this.onDisconnect = () => {};
    this.onEvent = () => {};
    this.onSnapshot = () => {};
    // Called when a remote ship is destroyed (for explosion effects).
    this.onDestroy = () => {};
  }

  /** Open the WebSocket and request to join. */
  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.connected = true;
      this.ws.send(JSON.stringify({ type: 'join', name: this.name, loadout: this.loadout }));
      this.onConnect();
    };
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this._onMessage(msg);
    };
    this.ws.onclose = () => {
      this.connected = false;
      this._clearRemoteShips();
      this.onDisconnect();
    };
    this.ws.onerror = () => { /* close handler will fire */ };
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this.shipId = msg.shipId;
        this.onConnect(msg);
        this._applySnapshot(msg.snapshot);
        break;
      case 'snapshot':
        this._applySnapshot(msg.snapshot);
        break;
      case 'event':
        this.onEvent(msg.event);
        break;
      case 'upgrade-failed':
        this.onEvent({ name: 'upgrade-failed', data: msg.reason });
        break;
      case 'kick':
        if (this.ws) this.ws.close();
        break;
      default:
        break;
    }
  }

  /**
   * Send the player's input command to the server.
   * @param {object} command { thrust, yaw, brake, boost, fire }
   */
  sendInput(command) {
    if (!this.connected || !this.shipId) return;
    this.ws.send(JSON.stringify({ type: 'input', shipId: this.shipId, command }));
  }

  /**
   * Request an upgrade purchase from the authoritative server.
   * The server validates ore and applies the effect; the next
   * snapshot reflects the result.
   * @param {string} upgradeId
   */
  sendUpgrade(upgradeId) {
    if (!this.connected || !this.shipId) return;
    this.ws.send(JSON.stringify({ type: 'upgrade', shipId: this.shipId, upgradeId }));
  }

  /**
   * Apply an authoritative snapshot to the local scene. Creates,
   * updates, or removes ship meshes to match the server's world.
   * @param {object} snapshot { ships: [...], asteroids: [...] }
   */
  _applySnapshot(snapshot) {
    if (!snapshot) return;
    this.lastSnapshot = snapshot;
    const seen = new Set();

    for (const s of snapshot.ships) {
      seen.add(s.id);
      let entry = this.remoteShips.get(s.id);

      if (!entry) {
        // New ship: create a Ship entity as a data holder. The client
        // never simulates it — the server is authoritative — but we
        // reuse Ship's fields (physics, health, score) to mirror state.
        const stats = deriveStats(defaultLoadout());
        const ship = new Ship({
          id: s.id,
          isPlayer: s.isPlayer,
          physics: stats,
          maxHealth: s.maxHealth,
          radius: stats.radius,
          weapon: stats.fire,
          sensorRange: stats.sensorRange,
          headless: true,
        });
        ship.mesh = this._makeShipMesh(this._colorsFor(s.id, s.isPlayer));
        this.scene.add(ship.mesh);
        entry = { ship, mesh: ship.mesh };
        this.remoteShips.set(s.id, entry);
      }

      // Update the Ship's internal state from the authoritative values.
      // position/velocity/heading are getters on physics — mutate there.
      entry.ship.physics.position.x = s.x;
      entry.ship.physics.position.z = s.z;
      entry.ship.physics.velocity.x = s.vx;
      entry.ship.physics.velocity.z = s.vz;
      entry.ship.physics.heading = s.heading;
      entry.ship.health = s.health;
      entry.ship.alive = s.alive;
      entry.ship.score = s.score;
      entry.ship.kills = s.kills;
      entry.ship.ore = s.ore ?? 0;
      entry.ship.upgrades = { ...(s.upgrades ?? {}) };

      // Detect destruction: alive true → false spawns an explosion.
      const wasAlive = entry.ship.alive;
      entry.ship.alive = s.alive;
      entry.mesh.visible = s.alive;
      entry.mesh.position.set(s.x, 0, s.z);
      entry.mesh.rotation.y = s.heading;
      if (wasAlive && !s.alive) this.onDestroy(s.x, s.z, s.isPlayer);
    }

    // Remove ships no longer in the snapshot.
    for (const [id, entry] of this.remoteShips) {
      if (!seen.has(id)) {
        this.scene.remove(entry.mesh);
        this.remoteShips.delete(id);
      }
    }

    this.onSnapshot(snapshot);
  }

  _colorsFor(id, isPlayer) {
    if (isPlayer) {
      // Local player: distinct colour.
      return { hullColor: 0x4ad96a, darkColor: 0x1a3a2a, accentColor: 0x7fff8c };
    }
    // Enemies: red-ish, vary slightly by id hash.
    return { hullColor: 0x8f4444, darkColor: 0x2a1414, accentColor: 0xff3b3b };
  }

  _makeShipMesh(colors) {
    // Minimal visual: a hull box + nose cone, enough to read on the radar.
    const group = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.5, 4.2),
      new THREE.MeshStandardMaterial({ color: colors.hullColor, metalness: 0.7, roughness: 0.4 }),
    );
    group.add(hull);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(1.0, 2.0, 4),
      new THREE.MeshStandardMaterial({ color: colors.accentColor, metalness: 0.4, roughness: 0.5, emissive: colors.accentColor, emissiveIntensity: 0.2 }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 2.6;
    group.add(nose);
    return group;
  }

  _clearRemoteShips() {
    for (const [, entry] of this.remoteShips) {
      this.scene.remove(entry.mesh);
    }
    this.remoteShips.clear();
  }

  disconnect() {
    if (this.ws) {
      this.ws.send(JSON.stringify({ type: 'leave' }));
      this.ws.close();
    }
  }
}
