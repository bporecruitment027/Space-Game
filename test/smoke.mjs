/**
 * Headless smoke test: boots the full module graph (main.js) with a
 * minimal DOM/WebGL stub to catch wiring errors that unit tests can't.
 * Not part of npm test — run manually: `npm run smoke`.
 */

// --- Minimal DOM stub ---
function makeEl() {
  const el = {
    id: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    innerHTML: '',
    textContent: '',
    appendChild() {},
    removeChild() {},
    remove() {},
    getContext: () => makeWebGL(),
    width: 72,
    height: 72,
    addEventListener() {},
  };
  return el;
}

const elements = {};
globalThis.document = {
  getElementById: (id) => (elements[id] ??= Object.assign(makeEl(), { id })),
  createElement: () => makeEl(),
  addEventListener() {},
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener() {},
  requestAnimationFrame: () => 0,
};
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;

// --- WebGL stub: a Proxy that answers any GL call/constant ---
function makeWebGL() {
  const target = function () {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') return undefined; // avoid thenable detection
      if (prop === Symbol.toPrimitive || prop === 'valueOf' || prop === 'toString') {
        return () => 1; // numeric coercions succeed
      }
      if (prop === 'getParameter') {
        return (_p) => 'WebGL 2.0'; // three parses this for version detection
      }
      return makeWebGL(); // any method call or constant reads as a value
    },
    apply() { return makeWebGL(); },
  });
}

const three = await import('three');

await import('../src/main.js');

// main.js scheduled one rAF (stubbed to a no-op). Run a couple of
// physics steps through the module's Game by importing Game directly.
const { Game } = await import('../src/Game.js');
const scene = new three.Scene();
const game = new Game(scene, { enemyCount: 4 });

let fpsSteps = 0;
for (let i = 0; i < 240; i++) { // 2 simulated seconds
  game.step(1 / 120, { thrust: 1, yaw: 0.3, brake: false, boost: false, fire: true });
  fpsSteps++;
}

if (!game.player.alive && game.state === 'over') {
  console.log('SMOKE OK — game ran', fpsSteps, 'steps; final state:', game.state);
  console.log('score:', game.score, 'kills:', game.kills, 'enemies alive:', game.enemies.filter((e) => e.alive).length);
} else {
  console.log('SMOKE OK — game ran', fpsSteps, 'steps; player alive:', game.player.alive, 'state:', game.state);
}

// HUD render path
const { HUD } = await import('../src/ui/HUD.js');
const hud = new HUD();
hud.update(game.player, { fps: 60, cameraMode: 'overhead', boostFraction: 0.8, game: game.hudState() });
console.log('SMOKE OK — HUD update ran without DOM errors');
