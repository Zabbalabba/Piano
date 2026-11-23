// In-game heads-up display: vitals, local conditions, era, pressures, toasts.

import { BIOMES } from './environment.js';
import { formatTime, clamp } from './util.js';

const $ = (id) => document.getElementById(id);

const GAUGES = [
  { key: 'temp', label: 'Temp', min: -5, max: 50, fmt: (v) => `${v.toFixed(0)}°C`, safe: (ph) => [ph.tMin, ph.tMax], margin: 3 },
  { key: 'light', label: 'Light', min: 0, max: 1.2, fmt: (v) => `${Math.round(v * 100)}%`, safe: null },
  { key: 'uv', label: 'UV', min: 0, max: 1, fmt: (v) => `${Math.round(v * 100)}%`, safe: (ph) => [0, ph.uvTol], margin: 0.08 },
  { key: 'o2', label: 'Oxygen', min: 0, max: 1, fmt: (v) => `${Math.round(v * 100)}%`, safe: (ph) => [0, ph.o2Tol], margin: 0.08 },
  { key: 'tox', label: 'Sulfur', min: 0, max: 1, fmt: (v) => `${Math.round(v * 100)}%`, safe: (ph) => [0, ph.toxTol], margin: 0.06 },
];

export class HUD {
  constructor() {
    this.el = $('hud');
    this.timer = 0;
    this.mmTimer = 0;
    this.gaugeEls = {};
    const wrap = $('env-gauges');
    wrap.innerHTML = '';
    for (const g of GAUGES) {
      const row = document.createElement('div');
      row.className = 'gauge';
      row.innerHTML = `<span class="g-label">${g.label}</span><div class="g-track"><div class="g-safe"></div><div class="g-mark"></div></div><span class="g-val"></span>`;
      wrap.appendChild(row);
      this.gaugeEls[g.key] = { row, safe: row.querySelector('.g-safe'), mark: row.querySelector('.g-mark'), val: row.querySelector('.g-val') };
    }
  }

  show(v) {
    this.el.hidden = !v;
  }

  update(dt, world, renderer, force = false) {
    this.timer -= dt;
    this.mmTimer -= dt;
    if (this.mmTimer <= 0 || force) {
      this.mmTimer = 0.25;
      renderer.drawMinimap($('minimap'));
    }
    if (this.timer > 0 && !force) return;
    this.timer = 0.1;
    const p = world.player;
    if (!p) return;
    const ph = p.ph;
    const sp = world.playerSpecies;
    $('hud-species').textContent = sp ? sp.name : '';
    $('hud-gen').textContent = `Gen ${p.generation}`;
    $('bar-hp').style.width = `${clamp(p.hp / ph.maxHP, 0, 1) * 100}%`;
    $('bar-en').style.width = `${clamp(p.energy / ph.maxEnergy, 0, 1) * 100}%`;
    const gr = clamp(p.growth / ph.growthNeeded, 0, 1);
    $('bar-gr').style.width = `${gr * 100}%`;
    $('bar-gr').parentElement.classList.toggle('ready', gr >= 1);
    $('hud-dna').textContent = world.progress.dna;
    $('hud-lineage').textContent = sp ? sp.pop : 1;
    $('hud-diet').textContent = ph.diet;
    $('btn-divide').hidden = !(gr >= 1);
    $('btn-toxin').hidden = !(ph.toxin > 0);
    $('btn-toxin').disabled = p.toxinCd > 0;

    const e = p.env;
    $('hud-biome').textContent = BIOMES[world.env.classify(e)].name;
    for (const g of GAUGES) {
      const el = this.gaugeEls[g.key];
      const v = e[g.key] ?? 0;
      const pos = (x) => clamp((x - g.min) / (g.max - g.min), 0, 1) * 100;
      el.mark.style.left = `${pos(v)}%`;
      el.val.textContent = g.fmt(v);
      if (g.safe) {
        const [a, b] = g.safe(ph);
        el.safe.style.left = `${pos(a)}%`;
        el.safe.style.width = `${pos(b) - pos(a)}%`;
        el.safe.hidden = false;
        const bad = v < a || v > b;
        const near = !bad && ((g.key === 'temp' && v < a + g.margin && a > g.min) || v > b - g.margin);
        el.row.classList.toggle('bad', bad);
        el.row.classList.toggle('near', near);
      } else {
        el.safe.hidden = true;
        el.row.classList.remove('bad', 'near');
      }
    }

    const env = world.env;
    $('hud-era').textContent = env.eraInfo.name;
    $('hud-era-bar').style.width = `${clamp(env.eraElapsed / env.era.duration, 0, 1) * 100}%`;
    $('hud-era-next').textContent = env.nextEraInfo.name;
    $('hud-era-time').textContent = formatTime(env.eraRemaining);
    $('hud-era-next').parentElement.classList.toggle('soon', env.eraRemaining < 60);

    const list = $('pressure-list');
    const top = world.pressures.topLive(4);
    if (!top.length) list.innerHTML = '<div class="muted">None right now.</div>';
    else
      list.innerHTML = top
        .map((p) => `<div class="pressure"><span>${p.label}</span><div class="p-track"><i style="width:${Math.round(p.value * 100)}%;background:${p.color}"></i></div></div>`)
        .join('');
  }

  toast(html, cls = '', dur = 4.5) {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.innerHTML = html;
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 450);
    }, dur * 1000);
  }
}
