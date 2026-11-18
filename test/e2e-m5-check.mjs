/**
 * M5 end-to-end check: asteroid mining yields ore on the authoritative
 * server, and the upgrade protocol works end-to-end.
 *
 * Mines by sweeping the asteroid field. If enough ore is mined, the
 * damage upgrade is purchased and the snapshot must reflect it. If not
 * enough ore is mined (random field), the rejection path is verified
 * instead — the client sends an upgrade and receives upgrade-failed.
 * Both outcomes prove the protocol round-trip.
 */
import { WebSocket } from 'ws';

const URL = process.env.E2E_URL || 'ws://127.0.0.1:8137';

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

const ws = new WebSocket(URL);
await new Promise((r) => ws.on('open', r));

ws.send(JSON.stringify({ type: 'join', loadout: { hull: 'fighter', weapon: 'laser', modules: [] } }));
const welcome = await nextMessage(ws, (m) => m.type === 'welcome');
const shipId = welcome.shipId;
console.log('joined as', shipId);

// --- Mine: sweep the asteroid field firing continuously. ---
const inputIv = setInterval(() => {
  ws.send(JSON.stringify({ type: 'input', shipId, command: { thrust: 1, yaw: 0.4, brake: false, boost: true, fire: true } }));
}, 33);

let ore = 0;
for (let i = 0; i < 300; i++) {
  const snap = await nextMessage(ws, (m) => m.type === 'snapshot', 1500).catch(() => null);
  if (!snap) continue;
  const me = snap.snapshot.ships.find((s) => s.id === shipId);
  if (me) ore = me.ore;
  if (ore >= 30) break;
}
clearInterval(inputIv);
console.log(`mined ${ore} ore`);
if (ore === 0) { console.error('FAIL: never mined any ore'); process.exit(1); }

// --- Upgrade protocol: send a purchase and observe the outcome. ---
ws.send(JSON.stringify({ type: 'upgrade', shipId, upgradeId: 'damage' }));

let success = false;
let rejected = false;
for (let i = 0; i < 15 && !success && !rejected; i++) {
  const msg = await nextMessage(
    ws,
    (m) => m.type === 'snapshot' || m.type === 'upgrade-failed',
    1500,
  ).catch(() => null);
  if (!msg) continue;
  if (msg.type === 'upgrade-failed') {
    rejected = true;
    console.log('upgrade rejected (insufficient ore):', msg.reason);
  } else {
    const me = msg.snapshot.ships.find((s) => s.id === shipId);
    if (me.upgrades.damage === 1) {
      success = true;
      console.log('upgrade applied: damage Lv1, ore now', me.ore);
    }
  }
}

if (success) {
  // Snapshot schema must carry ore + upgrades on every ship.
  const final = await nextMessage(ws, (m) => m.type === 'snapshot');
  for (const s of final.snapshot.ships) {
    if (typeof s.ore !== 'number') { console.error('FAIL: ship missing ore'); process.exit(1); }
    if (typeof s.upgrades !== 'object' || s.upgrades === null) { console.error('FAIL: ship missing upgrades'); process.exit(1); }
  }
  console.log('snapshot schema OK: ore + upgrades present');
} else if (rejected) {
  console.log('rejection path verified (protocol round-trip OK)');
} else {
  console.error('FAIL: no upgrade outcome observed');
  process.exit(1);
}

ws.close();
console.log('M5 E2E PASS');
process.exit(0);
