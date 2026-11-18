/**
 * Game — the simulation orchestrator.
 *
 * Owns the world state and rules: player ship (built from a loadout),
 * enemy flights, asteroid field, projectile pool, and sensors. Each
 * tick it:
 *   1. decides enemy commands via EnemyAI,
 *   2. integrates every ship's physics,
 *   3. runs weapon + collision rules (bolts vs ships/asteroids, rams),
 *   4. scans sensors for fog-of-war contacts,
 *   5. emits events the UI layer consumes (score, deaths, game over).
 *
 * The class is rendering-agnostic: it touches meshes only to move them
 * (entity sync), which means the rules can be unit-tested headless.
 */

import { Ship } from './entities/Ship.js';
import { Projectiles } from './combat/Projectiles.js';
import { EnemyAI } from './combat/EnemyAI.js';
import { Asteroids } from './world/Asteroids.js';
import { Sensors } from './systems/Sensors.js';
import { deriveStats, defaultLoadout } from './modules/Modules.js';

const ENEMY_TUNING = {
  mass: 950, yawInertia: 2400, maxThrust: 7200, maxTorque: 3000,
  maxHealth: 60, radius: 2.0,
};

const BOOST_MULTIPLIER = 2.0;
const BOOST_DRAIN = 0.35; // per second while boosting
const BOOST_RECHARGE = 0.18; // per second while idle

export class Game {
  /**
   * @param {THREE.Scene|null} scene  null for headless (server) mode.
   * @param {object} [opts] { enemyCount, spawnRadius, playerLoadout, headless }
   */
  constructor(scene, { enemyCount = 4, spawnRadius = 40, playerLoadout = defaultLoadout(), headless = false } = {}) {
    this.scene = scene;
    this.headless = headless || !scene;
    this.enemyCount = enemyCount;
    this.spawnRadius = spawnRadius;
    this.playerLoadout = playerLoadout;
    this.boostFraction = 1.0; // player boost budget (0..1)
    this._boostHeld = false;

    const stats = deriveStats(playerLoadout);
    this.player = new Ship({
      id: 'player', isPlayer: true,
      physics: stats,
      meshOptions: {
        hullColor: stats.colors.hull,
        darkColor: stats.colors.dark,
        accentColor: stats.colors.accent,
      },
      maxHealth: stats.maxHealth,
      radius: stats.radius,
      weapon: stats.fire,
      sensorRange: stats.sensorRange,
      headless: this.headless,
    });
    this.enemies = [];
    this.players = [this.player]; // registry of player-controlled ships
    this.projectiles = new Projectiles(scene);
    this.asteroids = new Asteroids(scene, { headless: this.headless });
    this.ai = new EnemyAI();
    this.sensors = new Sensors();

    this.state = 'deploying'; // 'deploying' | 'running' | 'over'
    this.onEvent = () => {}; // callback(event) for HUD/toasts
    this._tick = 0;

    this.spawnPlayer();
    this.spawnEnemies();
  }

  /**
   * Deploy a loadout: rebuild the player ship and start the run.
   * @param {object} loadout { hull, weapon, modules[] }
   */
  deploy(loadout) {
    const stats = deriveStats(loadout);
    this.playerLoadout = loadout;
    const old = this.player;
    this.player = new Ship({
      id: 'player', isPlayer: true,
      physics: stats,
      meshOptions: {
        hullColor: stats.colors.hull,
        darkColor: stats.colors.dark,
        accentColor: stats.colors.accent,
      },
      maxHealth: stats.maxHealth,
      radius: stats.radius,
      weapon: stats.fire,
      sensorRange: stats.sensorRange,
    });
    if (old && !this.headless) this.scene.remove(old.mesh);
    if (!this.headless) this.scene.add(this.player.mesh);
    this.sensors.clear();
    this.spawnPlayer();
    // Keep the players registry in sync — deploy() replaces the ship.
    const deployIdx = this.players.indexOf(old);
    if (deployIdx >= 0) this.players[deployIdx] = this.player;
    this.player.score = 0;
    this.player.kills = 0;
    this.boostFraction = 1.0;
    this.state = 'running';
    this.emit('deployed', { loadout });
  }

  /** Reset everything to a fresh run (keeps the current loadout). */
  reset() {
    this.projectiles.clear();
    this.asteroids.clear();
    this.asteroids = new Asteroids(this.scene);
    this.enemies.forEach((e) => { if (!this.headless) this.scene.remove(e.mesh); });
    this.enemies.length = 0;
    this.sensors.clear();
    for (const p of this.players) { p.score = 0; p.kills = 0; }
    this.state = 'running';
    this.boostFraction = 1.0;
    this.spawnPlayer();
    this.spawnEnemies();
    this.emit('reset');
  }

  spawnPlayer() {
    this.player.spawn(0, 0, 0, 2.0); // 2s spawn protection
    this.emit('player-spawned');
  }

  spawnEnemies() {
    for (let i = 0; i < this.enemyCount; i++) {
      const angle = (i / this.enemyCount) * Math.PI * 2 + Math.random() * 0.4;
      const r = this.spawnRadius * (0.6 + Math.random() * 0.4);
      const ship = new Ship({
        id: `enemy-${i}`, isPlayer: false,
        physics: ENEMY_TUNING,
        meshOptions: { hullColor: 0x8f3a3a, darkColor: 0x2a1414, accentColor: 0xff3b3b },
        maxHealth: 60, radius: 2.0,
        headless: this.headless,
      });
      if (!this.headless) this.scene.add(ship.mesh);
      ship.spawn(Math.cos(angle) * r, Math.sin(angle) * r, angle + Math.PI + Math.random() * 0.6, 1.0);
      this.enemies.push(ship);
    }
  }

  emit(name, data = {}) {
    this.onEvent(name, data);
  }

  /**
   * Advance the simulation one step.
   * @param {number} dt   Fixed physics step (1/120).
   * @param {object|object[]} inputs Player commands. A single command
   *   object applies to the local player; an array/map of {shipId: cmd}
   *   applies to each registered player (multiplayer server).
   */
  step(dt, inputs) {
    if (this.state !== 'running') return;

    // Normalise inputs: single command → map for the local player.
    const inputMap = this._normalizeInputs(inputs);

    // 1. Enemy decisions. Each AI picks the nearest alive player as target.
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const target = this._nearestPlayer(enemy);
      const cmd = this.ai.decide({ ship: enemy, target, asteroids: this.asteroids, dt });
      this._applyShipCommand(enemy, cmd, dt);
    }

    // 2. Players (local + remote).
    for (const player of this.players) {
      if (!player.alive) continue;
      const cmd = inputMap.get(player.id) ?? { thrust: 0, yaw: 0, brake: false, boost: false, fire: false };
      this._applyShipCommand(player, cmd, dt);
    }

    // 3. Bolt rules.
    this.projectiles.update(dt, (bolt, hit) => this._onBoltHit(bolt, hit), this._allShips(), this.asteroids.entities);

    // 4. Rams: ships into asteroids and ships into ships.
    this._resolveRams();

    // 5. Asteroid field.
    this.asteroids.update(dt, this.players[0]);

    // 6. Sensor scan (fog of war) — each player gets their own scan.
    this.sensors.track(this._allShips());
    for (const player of this.players) {
      this.sensors.scan(player, dt);
    }

    // 7. Check deaths.
    for (const player of this.players) {
      if (player.health <= 0 && this.state === 'running') {
        this.state = 'over';
        this.emit('game-over', { score: player.score, kills: player.kills });
        return;
      }
    }
  }

  _normalizeInputs(inputs) {
    const map = new Map();
    if (!inputs) return map;
    if (Array.isArray(inputs)) {
      for (const entry of inputs) {
        if (entry && entry.shipId) map.set(entry.shipId, entry.command ?? entry);
      }
      return map;
    }
    if (typeof inputs === 'object' && inputs.shipId) {
      map.set(inputs.shipId, inputs.command ?? inputs);
      return map;
    }
    // Single command object → local player.
    map.set(this.player.id, inputs);
    return map;
  }

  _nearestPlayer(from) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.position.x - from.position.x, p.position.z - from.position.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ?? this.player;
  }

  _allShips() {
    return [...this.players, ...this.enemies];
  }

  _applyShipCommand(ship, cmd, dt) {
    // Boost: applies only to forward thrust, only with budget remaining.
    let { thrust } = cmd;
    if (ship.isPlayer && cmd.boost && thrust > 0 && this.boostFraction > 0.01) {
      thrust *= BOOST_MULTIPLIER;
      this.boostFraction = Math.max(0, this.boostFraction - BOOST_DRAIN * dt);
    } else if (ship.isPlayer) {
      this.boostFraction = Math.min(1, this.boostFraction + BOOST_RECHARGE * dt);
    }

    ship.update(dt, { thrust, yaw: cmd.yaw, brake: cmd.brake });
    if (cmd.fire && ship.fireCooldown <= 0 && ship.alive) {
      // Weapon stats come from the ship's loadout (laser/railgun).
      const w = ship.weapon;
      const ok = this.projectiles.fire(ship, {
        speed: w.speed,
        damage: w.damage,
        life: w.life,
        color: ship.isPlayer ? w.color : 0xff6b4a,
        scale: w.scale,
      });
      if (ok) ship.fireCooldown = w.cooldown;
    }
  }

  _onBoltHit(bolt, hit) {
    if (hit.kind === 'ship') {
      const target = hit.ref;
      const killed = target.takeDamage(bolt.damage);
      if (killed && !target.isPlayer) {
        // Credit the kill to the shooter's ship (player or AI).
        const shooter = this._shipById(bolt.ownerId);
        if (shooter) {
          shooter.score += 100;
          shooter.kills += 1;
        }
        this.emit('kill', { by: bolt.ownerId, victim: target.id, score: shooter ? shooter.score : 0 });
        this._respawnEnemy(target);
      } else if (killed) {
        this.emit('player-killed', { victim: target.id });
      } else {
        this.emit('hit', { target: target.id });
      }
    } else if (hit.kind === 'asteroid') {
      const rock = hit.ref;
      this.asteroids.hit(rock, bolt.damage);
      this.emit('asteroid-hit');
    }
  }

  _shipById(id) {
    return this._allShips().find((s) => s.id === id);
  }

  _respawnEnemy(enemy) {
    const angle = Math.random() * Math.PI * 2;
    const r = this.spawnRadius * (0.7 + Math.random() * 0.3);
    enemy.spawn(Math.cos(angle) * r, Math.sin(angle) * r, angle + Math.PI, 1.0);
    this.ai.reset();
  }

  _resolveRams() {
    // Ships vs asteroids.
    for (const ship of this._allShips()) {
      if (!ship.alive || ship.invulnerableTime > 0) continue;
      for (const rock of this.asteroids.shipCollisionCandidates(ship)) {
        const dmg = ship.isPlayer ? this.asteroids.ramDamage(ship) : 18;
        const killed = ship.takeDamage(dmg);
        rock.damage += 25;
        rock.flashTime = 0.1;
        // Kick both apart so they don't sit overlapping.
        const dx = ship.position.x - rock.position.x;
        const dz = ship.position.z - rock.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const push = (ship.radius + rock.radius) * 0.4;
        ship.position.x += (dx / d) * push;
        ship.position.z += (dz / d) * push;
        rock.velocity.x += (dx / d) * 4;
        rock.velocity.z += (dz / d) * 4;
        if (killed && ship.isPlayer) this.emit('player-killed', { victim: ship.id });
      }
    }

    // Ships vs ships (all pairs — player vs enemy, player vs player).
    const all = this._allShips();
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (!a.alive || a.invulnerableTime > 0) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (!b.alive || b.invulnerableTime > 0) continue;
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const r = a.radius + b.radius;
        if (dx * dx + dz * dz < r * r) {
          const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.z - b.velocity.z);
          const dmg = Math.min(35, 12 + speed * 0.05);
          const killedA = a.takeDamage(dmg);
          const killedB = b.takeDamage(dmg);
          // Separate.
          const d = Math.hypot(dx, dz) || 1;
          const push = (a.radius + b.radius) * 0.5;
          a.position.x += (dx / d) * push; a.position.z += (dz / d) * push;
          b.position.x -= (dx / d) * push; b.position.z -= (dz / d) * push;
          // Credit ramming kills.
          if (killedA && b.isPlayer) {
            b.score += 100; b.kills += 1;
            this.emit('kill', { by: b.id, victim: a.id, score: b.score });
            if (!a.isPlayer) this._respawnEnemy(a);
          }
          if (killedB && a.isPlayer) {
            a.score += 100; a.kills += 1;
            this.emit('kill', { by: a.id, victim: b.id, score: a.score });
            if (!b.isPlayer) this._respawnEnemy(b);
          }
          if (killedA && a.isPlayer) this.emit('player-killed', { victim: a.id });
          if (killedB && b.isPlayer) this.emit('player-killed', { victim: b.id });
        }
      }
    }
  }

  /** HUD state snapshot for this frame (local player's view). */
  hudState() {
    const p = this.player;
    return {
      score: p.score,
      kills: p.kills,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
      enemies: this.enemies
        .filter((e) => e.alive)
        .map((e) => ({ id: e.id, fraction: e.healthFraction, distance: Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) })),
      playerHealth: p.health,
      playerMaxHealth: p.maxHealth,
      boostFraction: this.boostFraction,
      state: this.state,
      loadout: this.playerLoadout,
      radar: this.sensors.getRadarContacts(p),
      sensorRange: p.sensorRange,
    };
  }

  /**
   * Register a remote player ship (called by the server on join).
   * @param {string} id Unique player id.
   * @param {object} loadout { hull, weapon, modules[] }
   * @returns {Ship} the new player ship
   */
  addPlayer(id, loadout = defaultLoadout()) {
    const stats = deriveStats(loadout);
    const ship = new Ship({
      id, isPlayer: true,
      physics: stats,
      meshOptions: {
        hullColor: stats.colors.hull,
        darkColor: stats.colors.dark,
        accentColor: stats.colors.accent,
      },
      maxHealth: stats.maxHealth,
      radius: stats.radius,
      weapon: stats.fire,
      sensorRange: stats.sensorRange,
      headless: this.headless,
    });
    if (!this.headless) this.scene.add(ship.mesh);
    // Spawn at a random point on the ring, facing the centre.
    const angle = Math.random() * Math.PI * 2;
    const r = this.spawnRadius * (0.7 + Math.random() * 0.3);
    ship.spawn(Math.cos(angle) * r, Math.sin(angle) * r, angle + Math.PI, 2.0);
    this.players.push(ship);
    this.emit('player-joined', { id });
    return ship;
  }

  /** Remove a remote player ship (called by the server on disconnect). */
  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [removed] = this.players.splice(idx, 1);
    if (!this.headless && removed.mesh) this.scene.remove(removed.mesh);
    this.sensors.clear();
    this.emit('player-left', { id });
  }

  /**
   * Serialise the authoritative world state for network broadcast.
   * @returns {object} plain-JSON-safe snapshot of all ships + state.
   */
  snapshot() {
    const shipState = (s) => ({
      id: s.id,
      isPlayer: s.isPlayer,
      x: s.position.x,
      z: s.position.z,
      vx: s.velocity.x,
      vz: s.velocity.z,
      heading: s.heading,
      health: s.health,
      maxHealth: s.maxHealth,
      alive: s.alive,
      score: s.score,
      kills: s.kills,
    });
    return {
      state: this.state,
      tick: this._tick,
      ships: this._allShips().map(shipState),
      asteroids: this.asteroids.entities
        .filter((a) => a.alive)
        .map((a) => ({ x: a.position.x, z: a.position.z, radius: a.radius })),
    };
  }

  /** Advance the internal tick counter (server uses this for snapshots). */
  tickStep() {
    this._tick = (this._tick ?? 0) + 1;
  }
}
