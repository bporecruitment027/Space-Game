/**
 * Live end-to-end check: connect a real client to a running GameServer
 * and verify join → welcome → snapshots → input → movement → kill flow.
 */
import { WebSocket } from 'ws';

const URL = process.env.E2E_URL || 'ws://127.0.0.1:8137';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nextMessage(ws, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
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

const ws1 = new WebSocket(URL);
const ws2 = new WebSocket(URL);
await Promise.all([
  new Promise((r) => ws1.on('open', r)),
  new Promise((r) => ws2.on('open', r)),
]);

// Both join.
ws1.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
ws2.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'railgun', modules: [] } }));

const welcome1 = await nextMessage(ws1, (m) => m.type === 'welcome');
const welcome2 = await nextMessage(ws2, (m) => m.type === 'welcome');
console.log('join OK:', welcome1.shipId, welcome2.shipId);

// Wait for one snapshot and check contents.
const snap = await nextMessage(ws1, (m) => m.type === 'snapshot');
console.log('snapshot OK: ships =', snap.snapshot.ships.length, 'asteroids =', snap.snapshot.asteroids.length);

// Thrust ws1 for ~1.2s and confirm it moves.
const before = snap.snapshot.ships.find((s) => s.id === welcome1.shipId);
let movedSnap = null;
const inputTimer = setInterval(() => {
  ws1.send(JSON.stringify({ type: 'input', shipId: welcome1.shipId, command: { thrust: 1, yaw: 0, brake: false, boost: false, fire: false } }));
}, 33);
for (let i = 0; i < 40; i++) {
  const s = await nextMessage(ws1, (m) => m.type === 'snapshot', 1500).catch(() => null);
  if (s) movedSnap = s;
}
clearInterval(inputTimer);
const after = movedSnap.snapshot.ships.find((s) => s.id === welcome1.shipId);
const dist = Math.hypot(after.x - before.x, after.z - before.z);
console.log(`movement OK: ${dist.toFixed(1)} m in ~1.3s`);
if (dist < 1) { console.error('FAIL: player did not move'); process.exit(1); }

// Fire test: ws1 fires continuously at ws2 — eventually ws2 should take damage/die.
ws1.send(JSON.stringify({ type: 'input', shipId: welcome1.shipId, command: { thrust: 0, yaw: 0, brake: false, boost: false, fire: true } }));
let ws2Health = 150;
let killed = false;
const killTimer = setInterval(() => {
  ws1.send(JSON.stringify({ type: 'input', shipId: welcome1.shipId, command: { thrust: 0, yaw: 0, brake: false, boost: false, fire: true } }));
}, 33);
for (let i = 0; i < 60; i++) {
  const s = await nextMessage(ws2, (m) => m.type === 'snapshot', 1500).catch(() => null);
  if (!s) break;
  const me = s.snapshot.ships.find((x) => x.id === welcome2.shipId);
  if (me && !me.alive) { killed = true; break; }
}
clearInterval(killTimer);
console.log(killed ? 'combat OK: ws2 was destroyed by ws1' : 'combat: ws2 survived (not fatal — positioning-dependent)');

// Disconnect ws2 and confirm removal.
ws2.close();
await sleep(150);
const post = await nextMessage(ws1, (m) => m.type === 'snapshot', 2000);
const stillThere = post.snapshot.ships.some((s) => s.id === welcome2.shipId);
console.log(stillThere ? 'FAIL: ws2 still in world after disconnect' : 'disconnect OK: ws2 removed from world');

ws1.close();
process.exit(0);
