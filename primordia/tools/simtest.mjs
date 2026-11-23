// Headless balance check: runs the ecosystem without rendering and prints
// populations per species over time. Usage: node tools/simtest.mjs [minutes] [seed] [--player]
import { World } from '../js/world.js';

const minutes = Number(process.argv[2] || 12);
const seed = Number(process.argv[3] || 12345);
const withPlayer = process.argv.includes('--player');
const w = new World(seed, { autopilot: true });
w.populate();
const startArg = (process.argv.find((a) => a.startsWith('--start=')) || '--start=shallows').slice(8);
if (withPlayer) w.spawnPlayer(startArg);
let firstDiv = null;
const dt = 1 / 30;
const t0 = Date.now();
let lastEra = '';
for (let s = 0; s < minutes * 60 * 30; s++) {
  w.step(dt);
  if (w.player && w.progress.readyToDivide) { if (firstDiv === null) firstDiv = w.time; w.playerDivide(w.player.genome); }
  if (s % (30 * 30) === 0) {
    const sp = w.species.living().slice(0, 9).map((x) => `${x.name.split(' ').map(p=>p.slice(0,5)).join('.')}:${x.pop}`).join(' ');
    const era = w.env.era.id;
    console.log(`${(w.time / 60).toFixed(1)}m [${era}] cells=${w.cells.length} food=${w.food.length} species=${w.species.living().length} | ${sp}`);
    lastEra = era;
  }
  for (const e of w.events) if (['era','extinct','respawn'].includes(e.type)) console.log('  EVENT', e.type, e.name || e.cause || '');
  w.events.length = 0;
}
const ms = Date.now() - t0;
console.log(`sim ${minutes}m in ${ms}ms (${(ms / (minutes * 60 * 30)).toFixed(2)} ms/step)`);
console.log("deaths", JSON.stringify(w.deathStats));
console.log('log tail:', w.species.log.slice(-8).map(l=>l.text).join(' | '));
if (withPlayer) console.log('player progress', JSON.stringify({ ...w.progress, unlocked: [...w.progress.unlocked], biomesThrived: [...w.progress.biomesThrived] }));
console.log('first division at', firstDiv && firstDiv.toFixed(0), 's');
