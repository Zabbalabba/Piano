// Save round-trip check: simulate, snapshot, restore, compare, keep running.
import { World } from '../js/world.js';
import { serialize, deserialize } from '../js/save.js';

const w = new World(4242, { autopilot: true });
w.populate();
w.spawnPlayer('shallows', 'Testus savedus');
for (let i = 0; i < 30 * 200; i++) {
  w.step(1 / 30);
  if (w.player && w.progress.readyToDivide) w.playerDivide(w.player.genome);
}
const snap = serialize(w, { goalsDone: ['divide'], won: false });
const json = JSON.stringify(snap);
const gz = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
console.log('save json', (json.length / 1024).toFixed(0), 'KB; gzip', (gz.length / 1024).toFixed(0), 'KB; base64 ~', ((gz.length * 4) / 3 / 1024).toFixed(0), 'KB');
const { world: r, meta } = deserialize(JSON.parse(json));
r.autopilot = true;
const cmp = (label, a, b) => console.log(label.padEnd(18), a, b, a === b ? 'ok' : 'DIFF');
cmp('time', Math.round(w.time), Math.round(r.time));
cmp('cells', w.cells.length, r.cells.length);
cmp('food', w.food.length, r.food.length);
cmp('species', w.species.all().length, r.species.all().length);
cmp('player gen', w.player.generation, r.player.generation);
cmp('dna', w.progress.dna, r.progress.dna);
cmp('era', w.env.era.id, r.env.era.id);
cmp('lineage', w.playerSpecies.name, r.playerSpecies.name);
cmp('unlocked', [...w.progress.unlocked].join(), [...r.progress.unlocked].join());
cmp('player hp', Math.round(w.player.hp), Math.round(r.player.hp));
console.log('meta', JSON.stringify(meta));
for (let i = 0; i < 30 * 60; i++) {
  r.step(1 / 30);
  if (r.player && r.progress.readyToDivide) r.playerDivide(r.player.genome);
}
console.log('restored world ran 60s more: cells', r.cells.length, 'time', Math.round(r.time), 'gameOver', r.gameOver);
