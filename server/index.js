/**
 * server/index.js — entry point for the authoritative multiplayer server.
 *
 * Run with: npm run server
 *
 * Starts the GameServer on the configured port and runs the fixed-tick
 * simulation loop. The server owns all world state; clients send inputs
 * and render whatever the server broadcasts.
 */

import { GameServer } from './gameServer.js';

const PORT = Number(process.env.PORT) || 8080;
const TICK_RATE = Number(process.env.TICK_RATE) || 30;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 6;
const ENEMY_COUNT = Number(process.env.ENEMY_COUNT) || 4;

const server = new GameServer({ port: PORT, tickRate: TICK_RATE, maxPlayers: MAX_PLAYERS, enemyCount: ENEMY_COUNT });
server.start();

// Graceful shutdown.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    // eslint-disable-next-line no-console
    console.log(`\n[GameServer] ${sig} received, shutting down…`);
    server.stop();
    process.exit(0);
  });
}
