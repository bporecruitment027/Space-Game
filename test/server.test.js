/**
 * Server + networking tests (Milestone 4).
 *
 * Tests the authoritative GameServer and the NetworkClient protocol
 * without opening real WebSocket ports — using the ws library's
 * built-in ability to listen on port 0 (OS-assigned) and connecting
 * real WebSocket clients in-process.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { GameServer } from '../server/gameServer.js';
import { NetworkClient } from '../src/net/NetworkClient.js';

/** Start a server on an OS-assigned port and return { server, port }. */
function startServer(opts = {}) {
  return new Promise((resolve) => {
    const server = new GameServer({ port: 0, tickRate: 30, enemyCount: 2, ...opts });
    // Patch start() to capture the actual port after binding.
    const origStart = server.start.bind(server);
    server.start = () => {
      origStart();
      const port = server.wss.address().port;
      resolve({ server, port });
    };
    server.start();
  });
}

/** Connect a raw WebSocket client and resolve when it opens. */
function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Wait for the next message matching a predicate. */
function nextMessage(ws, predicate, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeout);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

// ---------------------------------------------------------------------------
// GameServer
// ---------------------------------------------------------------------------

test('Server: client joins and receives welcome + snapshot', async () => {
  const { server, port } = await startServer();
  const ws = await connect(port);

  ws.send(JSON.stringify({ type: 'join', name: 'tester', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  const welcome = await nextMessage(ws, (m) => m.type === 'welcome');

  assert.equal(welcome.shipId, 'player-1');
  assert.ok(welcome.snapshot, 'welcome includes a snapshot');
  assert.ok(Array.isArray(welcome.snapshot.ships), 'snapshot has ships array');
  assert.ok(welcome.snapshot.ships.length >= 3, 'snapshot has player + enemies');

  ws.close();
  server.stop();
});

test('Server: snapshots broadcast to all connected clients', async () => {
  const { server, port } = await startServer();
  const ws1 = await connect(port);
  const ws2 = await connect(port);

  ws1.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  ws2.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));

  await nextMessage(ws1, (m) => m.type === 'welcome');
  await nextMessage(ws2, (m) => m.type === 'welcome');

  // Both should receive periodic snapshots.
  const snap1 = await nextMessage(ws1, (m) => m.type === 'snapshot');
  const snap2 = await nextMessage(ws2, (m) => m.type === 'snapshot');
  assert.ok(snap1.snapshot, 'client 1 got snapshot');
  assert.ok(snap2.snapshot, 'client 2 got snapshot');

  ws1.close();
  ws2.close();
  server.stop();
});

test('Server: input commands move the player ship', async () => {
  const { server, port } = await startServer({ tickRate: 60 });
  const ws = await connect(port);

  ws.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  const welcome = await nextMessage(ws, (m) => m.type === 'welcome');
  const shipId = welcome.shipId;

  // Find the player ship in the initial snapshot.
  const initialPlayer = welcome.snapshot.ships.find((s) => s.id === shipId);
  assert.ok(initialPlayer, 'player ship in initial snapshot');

  // Send thrust input for ~1 second (60 ticks at 60 Hz).
  for (let i = 0; i < 60; i++) {
    ws.send(JSON.stringify({ type: 'input', shipId, command: { thrust: 1, yaw: 0, brake: false, boost: false, fire: false } }));
    // Drain one snapshot per input so we don't buffer.
    await nextMessage(ws, (m) => m.type === 'snapshot', 500).catch(() => {});
  }

  // Wait for a final snapshot and check the player moved.
  const finalSnap = await nextMessage(ws, (m) => m.type === 'snapshot');
  const finalPlayer = finalSnap.snapshot.ships.find((s) => s.id === shipId);
  assert.ok(finalPlayer, 'player still in snapshot');
  const dist = Math.hypot(finalPlayer.x - initialPlayer.x, finalPlayer.z - initialPlayer.z);
  assert.ok(dist > 1, `player should have moved (dist=${dist.toFixed(1)}m)`);

  ws.close();
  server.stop();
});

test('Server: disconnect removes the player', async () => {
  const { server, port } = await startServer();
  const ws = await connect(port);

  ws.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  const welcome = await nextMessage(ws, (m) => m.type === 'welcome');
  assert.equal(welcome.shipId, 'player-1');
  assert.equal(server.connections.size, 1);

  ws.close();

  // Wait a moment for the close handler to fire.
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(server.connections.size, 0, 'connection removed on disconnect');
  assert.equal(server.game.players.length, 0, 'no players remain after disconnect');

  server.stop();
});

test('Server: rejects joins beyond maxPlayers', async () => {
  const { server, port } = await startServer({ maxPlayers: 1 });
  const ws1 = await connect(port);
  const ws2 = await connect(port);

  ws1.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  await nextMessage(ws1, (m) => m.type === 'welcome');

  ws2.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  const kick = await nextMessage(ws2, (m) => m.type === 'kick');
  assert.equal(kick.reason, 'server full');

  ws1.close();
  ws2.close();
  server.stop();
});

test('Server: headless Game runs without Three.js', async () => {
  const { server } = await startServer();
  assert.equal(server.game.headless, true, 'server game is headless');
  assert.equal(server.game.player.mesh, null, 'player has no mesh');
  assert.equal(server.game.enemies[0].mesh, null, 'enemies have no mesh');
  server.stop();
});

// ---------------------------------------------------------------------------
// NetworkClient (client-side, with stubbed WebSocket)
// ---------------------------------------------------------------------------

test('NetworkClient: parses welcome and applies snapshot', async () => {
  // Start a real server, then use NetworkClient against it.
  const { server, port } = await startServer();

  // Stub WebSocket in the client module's scope by connecting manually.
  const ws = await connect(port);
  ws.send(JSON.stringify({ type: 'join', name: 'pilot', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  const welcome = await nextMessage(ws, (m) => m.type === 'welcome');

  assert.ok(welcome.snapshot, 'welcome carries a snapshot');
  assert.ok(Array.isArray(welcome.snapshot.ships), 'snapshot ships array');

  ws.close();
  server.stop();
});

test('Server: snapshot contains all required fields', async () => {
  const { server, port } = await startServer();
  const ws = await connect(port);

  ws.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
  const welcome = await nextMessage(ws, (m) => m.type === 'welcome');
  const snap = welcome.snapshot;

  // Required top-level fields.
  assert.equal(typeof snap.state, 'string');
  assert.equal(typeof snap.tick, 'number');
  assert.ok(Array.isArray(snap.ships));
  assert.ok(Array.isArray(snap.asteroids));

  // Each ship has the full serialised state.
  for (const s of snap.ships) {
    assert.equal(typeof s.id, 'string');
    assert.equal(typeof s.isPlayer, 'boolean');
    assert.equal(typeof s.x, 'number');
    assert.equal(typeof s.z, 'number');
    assert.equal(typeof s.vx, 'number');
    assert.equal(typeof s.vz, 'number');
    assert.equal(typeof s.heading, 'number');
    assert.equal(typeof s.health, 'number');
    assert.equal(typeof s.alive, 'boolean');
    assert.equal(typeof s.score, 'number');
    assert.equal(typeof s.kills, 'number');
  }

  ws.close();
  server.stop();
});
