// Entry point: screens, input, the game loop and event handling.

import { World } from './world.js';
import { Renderer } from './render.js';
import { HUD } from './hud.js';
import { Editor } from './editor.js';
import { renderEco, GOALS } from './eco.js';
import { PLAYER_STARTS, speciesName, cloneGenome } from './genome.js';
import { drawCell } from './cellDraw.js';
import { PARTS } from './parts.js';
import { RNG, formatTime } from './util.js';
import { BIOMES, ERAS } from './environment.js';
import { SaveStore, deserialize } from './save.js';

const $ = (id) => document.getElementById(id);
const SIM_DT = 1 / 30;

const state = {
  mode: 'title', // title | play | editor | eco | pause | help | over
  world: null,
  renderer: null,
  start: 'shallows',
  speed: 1,
  keys: new Set(),
  pointer: { x: 0, y: 0, down: false, inside: false },
  sprintHeld: false,
  goalsDone: new Set(),
  won: false,
  returnMode: 'play',
};

const canvas = $('game');
const hud = new HUD();
const editor = new Editor(onEditorDone);
const saves = new SaveStore();
let savedGame = null;

// ---------------------------------------------------------------- worlds

function makeAttractWorld() {
  const w = new World((Math.random() * 1e9) | 0);
  w.populate();
  for (let i = 0; i < 300; i++) w.step(SIM_DT);
  return w;
}

function setWorld(w) {
  state.world = w;
  if (!state.renderer) state.renderer = new Renderer(canvas, w);
  else {
    state.renderer.world = w;
    state.renderer.buildBackground();
  }
}

// ---------------------------------------------------------------- saving

function hasLineage() {
  const w = state.world;
  return !!(w && w.playerSpecies && !w.gameOver);
}

function saveMeta() {
  return { goalsDone: [...state.goalsDone], won: state.won, speed: state.speed };
}

function saveGame(cloud = true) {
  if (!hasLineage()) return;
  saves.save(state.world, saveMeta(), { cloud });
}

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

async function refreshContinue() {
  savedGame = await saves.peek();
  const has = !!savedGame;
  $('continue-card').hidden = !has;
  $('new-label').hidden = !has;
  $('btn-start').textContent = has ? 'Begin a new lineage' : 'Begin';
  if (!has) return;
  const sm = savedGame.summary || {};
  $('cc-name').textContent = sm.name || 'Your lineage';
  const era = ERAS[sm.era] ? ERAS[sm.era].name : '';
  const where = savedGame.source === 'account' ? 'your account' : 'this device';
  $('cc-meta').textContent = `Generation ${sm.generation ?? 1} · ${formatTime(sm.time || 0)} played${era ? ` · ${era}` : ''} · saved ${ago(savedGame.savedAt)} on ${where}`;
}

function continueGame() {
  if (!savedGame) return;
  let restored;
  try {
    restored = deserialize(savedGame.snapshot);
  } catch {
    $('cc-meta').textContent = 'This save could not be loaded.';
    return;
  }
  const { world: w, meta } = restored;
  setWorld(w);
  state.goalsDone = new Set(meta.goalsDone || []);
  state.won = !!meta.won;
  state.speed = meta.speed || 1;
  $('btn-speed').textContent = `${state.speed}×`;
  if (w.player) {
    state.renderer.cam.x = w.player.x;
    state.renderer.cam.y = w.player.y;
  }
  setMode('play');
  hud.update(0, w, state.renderer, true);
  hud.toast(`<b>Welcome back.</b> ${w.playerSpecies ? w.playerSpecies.name : 'Your lineage'}, generation ${w.progress.generation}.`, 'good', 5);
}

function updateSaveStatus() {
  const parts = [];
  if (saves.lastSaved) parts.push(`Saved ${ago(saves.lastSaved)} on this device`);
  if (saves.lastCloudSaved) parts.push(`to your account ${ago(saves.lastCloudSaved)}`);
  $('save-status').textContent = parts.length ? `${parts.join(', ')}. Progress saves automatically.` : 'Your progress saves automatically.';
}

function startGame() {
  const name = $('species-input').value.trim() || speciesName(PLAYER_STARTS[state.start].genome, new RNG());
  const w = new World((Math.random() * 1e9) | 0);
  w.populate();
  for (let i = 0; i < 90; i++) w.step(SIM_DT); // let the pond settle
  w.spawnPlayer(state.start, name);
  w.events.length = 0;
  setWorld(w);
  state.renderer.cam.x = w.player.x;
  state.renderer.cam.y = w.player.y;
  state.goalsDone = new Set();
  state.won = false;
  state.speed = 1;
  $('btn-speed').textContent = '1×';
  setMode('play');
  hud.update(0, w, state.renderer, true);
  const start = PLAYER_STARTS[state.start];
  hud.toast(`<b>${name}</b> begins in the ${start.label.toLowerCase()}. Eat, grow, and divide.`, 'good', 6);
  setTimeout(() => hud.toast('Watch the gauges on the left. Going past your limits hurts.', '', 6), 2500);
}

// ---------------------------------------------------------------- screens

function setMode(mode) {
  state.mode = mode;
  $('screen-title').hidden = mode !== 'title';
  $('screen-help').hidden = mode !== 'help';
  $('screen-eco').hidden = mode !== 'eco';
  $('screen-pause').hidden = mode !== 'pause';
  $('screen-over').hidden = mode !== 'over';
  if (mode !== 'editor') editor.open_ && editor.close();
  hud.show(mode !== 'title' && mode !== 'editor');
  if (mode === 'eco') renderEco(state.world);
  if (mode === 'pause') updateSaveStatus();
  if (mode === 'title') refreshContinue();
}

function openHelp(from) {
  state.returnMode = from;
  setMode('help');
}

function buildTitle() {
  const grid = $('start-grid');
  grid.innerHTML = '';
  for (const [key, s] of Object.entries(PLAYER_STARTS)) {
    const b = document.createElement('button');
    b.className = 'start-card';
    b.type = 'button';
    b.setAttribute('aria-pressed', String(key === state.start));
    const cv = document.createElement('canvas');
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend', `<span class="sc-title">${s.label}</span><span class="sc-blurb">${s.blurb}</span>`);
    b.addEventListener('click', () => {
      state.start = key;
      for (const c of grid.children) c.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      rerollName();
    });
    grid.appendChild(b);
    requestAnimationFrame(() => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, r.width * dpr);
      cv.height = Math.max(1, r.height * dpr);
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      const g = ctx.createRadialGradient(r.width / 2, r.height / 2, 0, r.width / 2, r.height / 2, r.width / 2);
      g.addColorStop(0, BIOMES[s.biome].color + '55');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r.width, r.height);
      drawCell(ctx, s.genome, Math.min(r.height * 0.2, 22), { x: r.width / 2, y: r.height / 2, heading: -0.3, thrustLevel: 0.5, phase: 2 }, 0.8, { detail: true });
    });
  }
  rerollName();
}

function rerollName() {
  $('species-input').value = speciesName(PLAYER_STARTS[state.start].genome, new RNG());
}

function showOver(kind) {
  const w = state.world;
  const pr = w.progress;
  const stats = [
    ['Time survived', formatTime(w.time)],
    ['Generations', pr.generation],
    ['Largest lineage', pr.peakLineage],
    ['Eras survived', pr.erasSurvived],
    ['Genes absorbed', pr.genesAcquired],
    ['Cells eaten', pr.kills],
    ['Species alive in the pond', w.species.living().length],
  ];
  $('over-stats').innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (kind === 'win') {
    $('over-eyebrow').textContent = 'Milestones complete';
    $('over-title').textContent = 'Ready for multicellularity';
    $('over-text').textContent = 'Your lineage has proven it can adapt to a changing sea. In the full game, this is where cells would start to cling together and form the first multicellular creature. You can keep playing this stage.';
    $('btn-continue').hidden = false;
  } else {
    const cause = kind.cause || 'unknown causes';
    $('over-eyebrow').textContent = 'Extinction';
    $('over-title').textContent = 'Your lineage is gone';
    $('over-text').textContent = `The last of ${w.playerSpecies?.name || 'your species'} died of ${cause}. The pond carries on without you.`;
    $('btn-continue').hidden = true;
    saves.clear().then(() => (savedGame = null));
  }
  setMode('over');
}

// ---------------------------------------------------------------- events

function handleEvents() {
  const w = state.world;
  if (!w) return;
  const playing = !!w.player || w.gameOver;
  for (const e of w.events) {
    if (state.mode === 'title') continue;
    switch (e.type) {
      case 'era':
        hud.toast(`<b>New era: ${e.name}</b><br>${e.desc}`, 'era', 9);
        break;
      case 'vents':
        hud.toast(`<b>${e.count} new vents</b> have opened on the sea floor.`, 'era', 6);
        break;
      case 'ready':
        hud.toast('<b>Ready to divide.</b> Press R or tap Divide.', 'good', 5);
        break;
      case 'gene':
        hud.toast(`<b>Gene absorbed: ${e.name}</b>${e.from ? ` from ${e.from}` : ''}. You can now add it when you divide.`, 'gene', 6);
        break;
      case 'eyeTier':
        hud.toast(`<b>Your ${e.from.toLowerCase()} can now evolve</b> into an ${e.to.toLowerCase()} when you next divide.`, 'gene', 6);
        break;
      case 'kill':
        hud.toast(`You consumed a <i>${e.name}</i>.`, '', 3);
        break;
      case 'respawn':
        hud.toast(`<b>You died (${e.cause}).</b> You continue as a relative ${Math.round(e.distance)} µm away.`, 'bad', 6);
        break;
      case 'extinct':
        if (playing) setTimeout(() => showOver({ cause: e.cause }), 1200);
        break;
      case 'aging':
        hud.toast('Your cell is getting old. Divide soon to renew it.', 'bad', 5);
        break;
      case 'toxin':
        break;
      case 'speciation':
      case 'extinction':
      case 'migration': {
        // Only mention events that involve species you could plausibly meet.
        if (e.type === 'migration') hud.toast(e.text, '', 4);
        break;
      }
    }
  }
  w.events.length = 0;
}

let goalTimer = 0;
function checkGoals(dt) {
  goalTimer -= dt;
  if (goalTimer > 0) return;
  goalTimer = 1;
  const w = state.world;
  if (!w || !w.player) return;
  for (const g of GOALS) {
    if (!state.goalsDone.has(g.id) && g.done(w)) {
      state.goalsDone.add(g.id);
      hud.toast(`<b>Milestone:</b> ${g.text}`, 'good', 5);
    }
  }
  if (!state.won && state.goalsDone.size === GOALS.length) {
    state.won = true;
    setTimeout(() => showOver('win'), 1500);
  }
}

function onEditorDone(info) {
  setMode('play');
  const parts = [];
  if (info.mutation) parts.push(`mutation: ${info.mutation}`);
  if (info.cost) parts.push(`${info.cost} DNA spent`);
  hud.toast(`<b>Divided.</b> Generation ${state.world.player.generation}${parts.length ? ` · ${parts.join(' · ')}` : ''}.`, 'good', 5);
  if (info.newGene) hud.toast(`${PARTS[info.newGene].name} is now part of your genome.`, 'gene', 5);
  saveGame();
}

function tryDivide() {
  const w = state.world;
  if (state.mode !== 'play' || !w.player || !w.progress.readyToDivide) return;
  state.mode = 'editor';
  hud.show(false);
  editor.open(w);
}

// ---------------------------------------------------------------- input

const KEYMAP = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const m = state.mode;
  if (KEYMAP[e.code] || e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.keys.add(e.code);
  if (e.code === 'Tab') {
    e.preventDefault();
    if (m === 'play') setMode('eco');
    else if (m === 'eco') setMode('play');
  } else if (e.code === 'KeyR' || e.code === 'Enter') {
    if (m === 'play') tryDivide();
  } else if (e.code === 'KeyE' || e.code === 'Space') {
    if (m === 'play' && state.world.player) {
      e.preventDefault();
      state.world.releaseToxin(state.world.player);
    }
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (m === 'play') setMode('pause');
    else if (m === 'pause' || m === 'eco') setMode('play');
    else if (m === 'help') setMode(state.returnMode);
  } else if (e.code === 'KeyH') {
    if (m === 'play') openHelp('play');
  }
});
window.addEventListener('keyup', (e) => state.keys.delete(e.code));
window.addEventListener('blur', () => {
  state.keys.clear();
  state.pointer.down = false;
});

canvas.addEventListener('pointerdown', (e) => {
  if (state.mode !== 'play') return;
  state.pointer.down = true;
  state.pointer.id = e.pointerId;
  state.pointer.x = e.clientX;
  state.pointer.y = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  state.pointer.x = e.clientX;
  state.pointer.y = e.clientY;
  state.pointer.inside = true;
});
canvas.addEventListener('pointerup', () => (state.pointer.down = false));
canvas.addEventListener('pointercancel', () => (state.pointer.down = false));
canvas.addEventListener('pointerleave', () => (state.pointer.inside = false));
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!state.renderer) return;
    e.preventDefault();
    const r = state.renderer;
    r.userZoom = Math.min(2.5, Math.max(0.45, r.userZoom * Math.exp(-e.deltaY * 0.0012)));
  },
  { passive: false }
);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function applyControls() {
  const w = state.world;
  const p = w && w.player;
  if (!p || state.mode !== 'play') return;
  let dx = 0;
  let dy = 0;
  for (const k of state.keys) {
    const v = KEYMAP[k];
    if (v) {
      dx += v[0];
      dy += v[1];
    }
  }
  const r = state.renderer;
  let thrust = dx || dy ? 1 : 0;
  if (state.pointer.down) {
    const s = r.worldToScreen(p.x, p.y);
    const vx = state.pointer.x - s.x;
    const vy = state.pointer.y - s.y;
    const d = Math.hypot(vx, vy);
    if (d > 6) {
      dx = vx;
      dy = vy;
      thrust = Math.min(1, d / 60);
    }
  }
  p.ctrl.dx = dx;
  p.ctrl.dy = dy;
  p.ctrl.thrust = thrust;
  p.ctrl.boost = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.sprintHeld;
  r.lookTarget = state.pointer.inside || state.pointer.down ? r.screenToWorld(state.pointer.x, state.pointer.y) : null;
}

// ---------------------------------------------------------------- buttons

$('btn-start').addEventListener('click', startGame);
$('btn-continue-save').addEventListener('click', continueGame);
$('btn-save-now').addEventListener('click', () => {
  saveGame();
  updateSaveStatus();
});
$('btn-reroll').addEventListener('click', rerollName);
$('btn-howto').addEventListener('click', () => openHelp('title'));
$('btn-help2').addEventListener('click', () => openHelp('pause'));
$('btn-divide').addEventListener('click', tryDivide);
$('btn-toxin').addEventListener('click', () => state.world.player && state.world.releaseToxin(state.world.player));
$('btn-eco').addEventListener('click', () => setMode(state.mode === 'eco' ? 'play' : 'eco'));
$('btn-pause').addEventListener('click', () => setMode('pause'));
$('btn-speed').addEventListener('click', () => {
  state.speed = state.speed >= 3 ? 1 : state.speed + 1;
  $('btn-speed').textContent = `${state.speed}×`;
});
const sprint = $('btn-sprint');
sprint.addEventListener('pointerdown', () => (state.sprintHeld = true));
sprint.addEventListener('pointerup', () => (state.sprintHeld = false));
sprint.addEventListener('pointerleave', () => (state.sprintHeld = false));
$('btn-quit').addEventListener('click', () => {
  saveGame();
  setWorld(makeAttractWorld());
  setMode('title');
});
// Save when the tab is hidden or closed, so leaving never loses progress.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode !== 'title') saveGame();
});
window.addEventListener('pagehide', () => {
  if (state.mode !== 'title' && hasLineage()) saves.saveLocal(state.world, saveMeta());
});
$('btn-again').addEventListener('click', () => {
  setWorld(makeAttractWorld());
  setMode('title');
});
$('btn-continue').addEventListener('click', () => setMode('play'));
for (const el of document.querySelectorAll('[data-close]')) {
  el.addEventListener('click', () => {
    if (state.mode === 'help') setMode(state.returnMode);
    else setMode('play');
  });
}
window.addEventListener('resize', () => {
  state.renderer?.resize();
  if (editor.open_) editor.resize();
});

// ---------------------------------------------------------------- loop

let last = performance.now();
let acc = 0;
let ecoTimer = 0;
let autosaveTimer = 20;
let cloudTimer = 60;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const w = state.world;
  const r = state.renderer;
  const simulating = state.mode === 'play' || state.mode === 'title';
  if (simulating && w) {
    applyControls();
    acc += dt * (state.mode === 'title' ? 1 : state.speed);
    let steps = 0;
    while (acc >= SIM_DT && steps < 8) {
      w.step(SIM_DT);
      acc -= SIM_DT;
      steps++;
    }
    if (steps >= 8) acc = 0;
  }
  if (r && w) {
    if (state.mode === 'title') {
      // Slow drift across the pond behind the title.
      r.cam.x = w.size / 2 + Math.cos(now / 30000) * 900;
      r.cam.y = w.size / 2 + Math.sin(now / 24000) * 700;
      r.cam.zoom = 0.9;
    }
    if (state.mode !== 'editor') {
      r.update(simulating ? dt : 0);
      r.render();
    }
  }
  if (w && state.mode !== 'title') {
    handleEvents();
    if (state.mode === 'play') {
      hud.update(dt, w, r);
      checkGoals(dt);
      // Autosave: locally every 20 s, to the account every minute.
      autosaveTimer -= dt;
      cloudTimer -= dt;
      if (autosaveTimer <= 0) {
        autosaveTimer = 20;
        const cloud = cloudTimer <= 0;
        if (cloud) cloudTimer = 60;
        saveGame(cloud);
      }
    }
    if (state.mode === 'eco') {
      ecoTimer -= dt;
      if (ecoTimer <= 0) {
        ecoTimer = 2;
        renderEco(w);
      }
    }
  } else if (w) w.events.length = 0;
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

buildTitle();
setWorld(makeAttractWorld());
setMode('title');
requestAnimationFrame(frame);

// Debug handle for the console.
window.primordia = { state, cloneGenome, editor, saves };
