/**
 * server/launcher.js — one-command deploy for the whole game.
 *
 * Run with: npm run deploy
 *
 * Starts both processes the game needs and keeps them alive together:
 *   1. staticServer.js — the single-player demo (serves the repo root
 *      with caching disabled; no build step, it's a static site).
 *   2. index.js        — the authoritative multiplayer server (WebSocket).
 *
 * Log lines from each child are prefixed so you can tell them apart.
 * Ctrl+C (SIGINT/SIGTERM) tears both down cleanly.
 *
 * Env (all optional):
 *   PORT          static demo port              (default 8000)
 *   WS_PORT       multiplayer WebSocket port    (default 8137)
 *   TICK_RATE     server simulation rate Hz     (default 30)
 *   MAX_PLAYERS   max concurrent players        (default 6)
 *   ENEMY_COUNT   enemy ships in the world      (default 4)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATIC_PORT = process.env.PORT || '8000';
const WS_PORT = process.env.WS_PORT || '8137';

function start(name, script, env) {
  const child = spawn(process.execPath, [path.join(__dirname, script)], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `[${name}]`;
  const pipe = (stream, out) => {
    stream.setEncoding('utf8');
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out(`${prefix} ${line}`);
    });
  };
  pipe(child.stdout, (line) => console.log(line));
  pipe(child.stderr, (line) => console.error(line));
  child.on('exit', (code) => {
    console.log(`${prefix} exited with code ${code}`);
    shutdown();
  });
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nShutting down…');
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
  process.exit(0);
}

const children = [
  start('static', 'staticServer.js', { PORT: STATIC_PORT }),
  start('ws', 'index.js', {
    PORT: WS_PORT,
    TICK_RATE: process.env.TICK_RATE,
    MAX_PLAYERS: process.env.MAX_PLAYERS,
    ENEMY_COUNT: process.env.ENEMY_COUNT,
  }),
];

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, shutdown);
}

console.log(`Deploying — demo: http://localhost:${STATIC_PORT}  |  multiplayer WS: ws://localhost:${WS_PORT}`);
console.log('Press Ctrl+C to stop both.');
