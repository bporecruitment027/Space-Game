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
   * @param {THREE.Scene} scene
   * @param {object} [opts] { enemyCount, spawnRadius, playerLoadout }
   */
  constructor(scene, { enemyCount = 4, spawnRadius = 40, playerLoadout = defaultLoadout() } = {}) {
    this.scene = scene;
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
    });
    this.enemies = [];
    this.projectiles = new Projectiles(scene);
    this.asteroids = new Asteroids(scene);
    this.ai = new EnemyAI();
    this.sensors = new Sensors();

    this.score = 0;
    this.kills = 0;
    this.state = 'deploying'; // 'deploying' | 'running' | 'over'
    this.onEvent = () => {}; // callback(event) for HUD/toasts

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
    if (old) this.scene.remove(old.mesh);
    this.scene.add(this.player.mesh);
    this.sensors.clear();
    this.spawnPlayer();
    this.score = 0;
    this.kills = 0;
    this.boostFraction = 1.0;
    this.state = 'running';
    this.emit('deployed', { loadout });
  }

  /** Reset everything to a fresh run (keeps the current loadout). */
  reset() {
    this.projectiles.clear();
    this.asteroids.clear();
    this.asteroids = new Asteroids(this.scene);
    this.enemies.forEach((e) => this.scene.remove(e.mesh));
    this.enemies.length = 0;
    this.sensors.clear();
    this.score = 0;
    this.kills = 0;
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
      });
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
   * @param {object} input Player command (KeyboardInput output).
   */
  step(dt, input) {
    if (this.state !== 'running') return;

    // 1. Enemy decisions.
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const cmd = this.ai.decide({ ship: enemy, target: this.player, asteroids: this.asteroids, dt });
      this._applyShipCommand(enemy, cmd, dt);
    }

    // 2. Player.
    if (this.player.alive) {
      this._applyShipCommand(this.player, input, dt);
    }

    // 3. Bolt rules.
    this.projectiles.update(dt, (bolt, hit) => this._onBoltHit(bolt, hit), this._allShips(), this.asteroids.entities);

    // 4. Rams: ships into asteroids and ships into ships.
    this._resolveRams();

    // 5. Asteroid field.
    this.asteroids.update(dt, this.player);

    // 6. Sensor scan (fog of war) — player radar reads the results.
    this.sensors.track(this._allShips());
    this.sensors.scan(this.player, dt);

    // 7. Check deaths.
    if (this.player.health <= 0 && this.state === 'running') {
      this.state = 'over';
      this.emit('game-over', { score: this.score, kills: this.kills });
    }
  }

  _allShips() {
    return [this.player, ...this.enemies];
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
        this.score += 100;
        this.kills += 1;
        this.emit('kill', { by: bolt.ownerId, victim: target.id, score: this.score });
        this._respawnEnemy(target);
      } else if (killed) {
        this.emit('player-killed');
      } else {
        this.emit('hit', { target: target.id });
      }
    } else if (hit.kind === 'asteroid') {
      const rock = hit.ref;
      this.asteroids.hit(rock, bolt.damage);
      this.emit('asteroid-hit');
    }
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
        const dmg = ship === this.player ? this.asteroids.ramDamage(ship) : 18;
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
        if (killed && ship.isPlayer) this.emit('player-killed');
      }
    }

    // Ships vs ships (both take ramming damage).
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.alive || a.invulnerableTime > 0) continue;
      const dx = a.position.x - this.player.position.x;
      const dz = a.position.z - this.player.position.z;
      const r = a.radius + this.player.radius;
      if (dx * dx + dz * dz < r * r && this.player.alive && this.player.invulnerableTime <= 0) {
        const speed = Math.hypot(this.player.velocity.x - a.velocity.x, this.player.velocity.z - a.velocity.z);
        const dmg = Math.min(35, 12 + speed * 0.05);
        const killedEnemy = a.takeDamage(dmg);
        const killedPlayer = this.player.takeDamage(dmg * 0.7);
        // Separate.
        const d = Math.hypot(dx, dz) || 1;
        const push = (a.radius + this.player.radius) * 0.5;
        a.position.x += (dx / d) * push; a.position.z += (dz / d) * push;
        this.player.position.x -= (dx / d) * push; this.player.position.z -= (dz / d) * push;
        if (killedEnemy) {
          this.score += 100; this.kills += 1;
          this.emit('kill', { by: 'player', victim: a.id, score: this.score });
          this._respawnEnemy(a);
        }
        if (killedPlayer) this.emit('player-killed');
      }
    }
  }

  /** HUD state snapshot for this frame. */
  hudState() {
    return {
      score: this.score,
      kills: this.kills,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
      enemies: this.enemies
        .filter((e) => e.alive)
        .map((e) => ({ id: e.id, fraction: e.healthFraction, distance: Math.hypot(e.position.x - this.player.position.x, e.position.z - this.player.position.z) })),
      playerHealth: this.player.health,
      playerMaxHealth: this.player.maxHealth,
      boostFraction: this.boostFraction,
      state: this.state,
      loadout: this.playerLoadout,
      radar: this.sensors.getRadarContacts(this.player),
      sensorRange: this.player.sensorRange,
    };
  }
}
