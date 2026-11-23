// Ecosystem overview (population chart, species list, events) and milestones.

import { drawCell } from './cellDraw.js';
import { formatTime } from './util.js';
import { ERAS } from './environment.js';

const $ = (id) => document.getElementById(id);

export const GOALS = [
  { id: 'divide', text: 'Divide for the first time', done: (w) => w.progress.divisions >= 1 },
  { id: 'gene', text: 'Absorb a gene from another species', done: (w) => w.progress.genesAcquired >= 1 },
  { id: 'era', text: 'Survive a change of era', done: (w) => w.progress.erasSurvived >= 1 },
  { id: 'gen', text: 'Reach generation 6', done: (w) => w.progress.generation >= 6, prog: (w) => `${Math.min(6, w.progress.generation)}/6` },
  { id: 'pop', text: 'Grow your lineage to 15 living cells', done: (w) => w.progress.peakLineage >= 15, prog: (w) => `${Math.min(15, w.progress.peakLineage)}/15` },
  { id: 'biomes', text: 'Thrive in 2 different habitats', done: (w) => w.progress.biomesThrived.size >= 2, prog: (w) => `${Math.min(2, w.progress.biomesThrived.size)}/2` },
  { id: 'parts', text: 'Evolve a body with 8 parts', done: (w) => (w.player ? w.player.genome.parts.length : 0) >= 8, prog: (w) => `${Math.min(8, w.player ? w.player.genome.parts.length : 0)}/8` },
];

export function renderEco(world) {
  const living = world.species.living();
  $('eco-count').textContent = `· ${living.length} living, ${world.species.all().filter((s) => s.extinctAt !== null).length} extinct`;

  // Species rows.
  const box = $('eco-species');
  box.innerHTML = '';
  const playerId = world.playerSpecies ? world.playerSpecies.id : -1;
  const sorted = [...living].sort((a, b) => (b.id === playerId) - (a.id === playerId) || b.pop - a.pop);
  for (const sp of sorted.slice(0, 40)) {
    const row = document.createElement('div');
    row.className = `sp-row${sp.id === playerId ? ' you' : ''}`;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 68;
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    const g = sp.id === playerId && world.player ? world.player.genome : sp.ref;
    drawCell(ctx, g, 8.5, { x: 17, y: 17, heading: -Math.PI / 2, phase: sp.id }, 0.5, { wobble: 0.5, detail: true });
    row.appendChild(cv);
    const parent = sp.parentId ? world.species.get(sp.parentId) : null;
    row.insertAdjacentHTML(
      'beforeend',
      `<div><div class="sp-name">${sp.name}${sp.id === playerId ? ' (you)' : ''}</div><div class="sp-sub">${sp.diet}${parent ? ` · from ${parent.name}` : ''}</div></div>`
    );
    const spark = document.createElement('canvas');
    spark.width = 140;
    spark.height = 44;
    drawSpark(spark, sp.history, `hsl(${sp.hue}, 65%, 65%)`);
    spark.style.width = '70px';
    spark.style.height = '22px';
    row.appendChild(spark);
    row.insertAdjacentHTML('beforeend', `<div class="sp-pop">${sp.pop}</div>`);
    box.appendChild(row);
  }

  drawChart($('eco-chart'), world);

  // Goals.
  $('eco-goals').innerHTML = GOALS.map((g) => {
    const done = g.done(world);
    return `<div class="goal${done ? ' done' : ''}"><span class="g-check"></span><span class="g-text">${g.text}</span><span class="g-prog">${!done && g.prog ? g.prog(world) : ''}</span></div>`;
  }).join('');

  // Log.
  const log = world.species.log.slice(-30).reverse();
  $('eco-log').innerHTML = log.length ? log.map((l) => `<div><time>${formatTime(l.time)}</time>${l.text}</div>`).join('') : '<div>Nothing yet.</div>';
}

function drawSpark(cv, hist, color) {
  const ctx = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const data = hist.slice(-60);
  if (data.length < 2) return;
  const max = Math.max(4, ...data);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * (w - 6) + 3;
    const y = h - 4 - (v / max) * (h - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawChart(cv, world) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 600;
  const h = cv.clientHeight || 180;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const times = world.species.historyTimes;
  const pad = { l: 30, r: 8, t: 8, b: 20 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  if (times.length < 2) {
    ctx.fillStyle = '#9bb7b2';
    ctx.font = '12px Figtree, sans-serif';
    ctx.fillText('Population history appears after a few seconds of play.', pad.l, h / 2);
    return;
  }
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const X = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * pw;

  // Era bands.
  const eras = world.env.eraHistory;
  eras.forEach((e, i) => {
    const end = i + 1 < eras.length ? eras[i + 1].start : t1;
    if (end < t0) return;
    const x0 = X(Math.max(t0, e.start));
    const x1 = X(end);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x0, pad.t, x1 - x0, ph);
    ctx.fillStyle = '#60807c';
    ctx.font = '10px "JetBrains Mono", monospace';
    if (x1 - x0 > 60) ctx.fillText(ERAS[e.id].name, x0 + 4, pad.t + 11);
  });

  const all = world.species.all().filter((s) => s.history.length);
  const playerId = world.playerSpecies ? world.playerSpecies.id : -1;
  const top = [...all].sort((a, b) => Math.max(...b.history) - Math.max(...a.history)).slice(0, 7);
  if (!top.some((s) => s.id === playerId) && world.playerSpecies) top.push(world.playerSpecies);
  const n = times.length;
  let max = 5;
  for (const s of top) for (const v of s.history.slice(-n)) max = Math.max(max, v);

  // Axes.
  ctx.strokeStyle = 'rgba(170,230,220,0.12)';
  ctx.fillStyle = '#60807c';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.lineWidth = 1;
  const step = max > 60 ? 20 : max > 25 ? 10 : 5;
  for (let v = 0; v <= max; v += step) {
    const y = pad.t + ph - (v / max) * ph;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + pw, y);
    ctx.stroke();
    ctx.fillText(String(v), 4, y + 3);
  }
  ctx.fillText(formatTime(t0), pad.l, h - 5);
  const endLabel = formatTime(t1);
  ctx.fillText(endLabel, pad.l + pw - ctx.measureText(endLabel).width, h - 5);

  for (const s of top) {
    const hist = s.history.slice(-n);
    const offset = n - hist.length;
    const you = s.id === playerId;
    ctx.strokeStyle = you ? '#ff9470' : `hsla(${s.hue}, 60%, 62%, 0.85)`;
    ctx.lineWidth = you ? 2.5 : 1.5;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = X(times[i + offset]);
      const y = pad.t + ph - (v / max) * ph;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
