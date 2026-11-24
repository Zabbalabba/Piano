// Division editor: free mutation offers, DNA-funded edits, live stats and a
// habitat forecast for now and the next era.
//
// Part origins in the draft: 'orig' inherited, 'mut' free mutation, 'new'
// bought this division, 'up' an inherited eye evolved with DNA (upFrom holds
// its old type). A part with mutFrom is an inherited eye evolved by mutation.

import { PARTS, CATEGORIES, PART_IDS } from './parts.js';
import { cloneGenome, phenotype, canAddPart, placeAngleFor, normAngle, SIZE_MIN, SIZE_MAX, countParts } from './genome.js';
import { drawCell, drawPartIcon } from './cellDraw.js';
import { habitatFit } from './biology.js';
import { BIOMES, BIOME_IDS, ERAS } from './environment.js';
import { angleDiff, clamp, TAU } from './util.js';
import { CLARITY, BINS } from './vision.js';

const $ = (id) => document.getElementById(id);
const UP = -Math.PI / 2;
const SIZE_COST = 40; // DNA per 1.0 of size change
const MEM_COST = 30;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 4;
const DEFAULT_HINT = 'Tap a part on the left and then the membrane to place it, or use + to add one. Drag parts to move them. Pinch, scroll or use the buttons to zoom.';

const isHad = (p) => p.o === 'orig' || p.o === 'up' || !!p.mutFrom;

/** Human-readable direction of a part, e.g. "front-right, 30°". */
export function positionLabel(a) {
  const deg = Math.round((normAngle(a) * 180) / Math.PI);
  const abs = Math.abs(deg);
  const side = deg > 0 ? 'right' : 'left';
  if (abs <= 15) return 'front';
  if (abs >= 165) return 'rear';
  if (abs < 70) return `front-${side}, ${abs}°`;
  if (abs <= 110) return `${side}, ${abs}°`;
  return `rear-${side}, ${abs}°`;
}

export class Editor {
  constructor(onDone) {
    this.onDone = onDone;
    this.canvas = $('ed-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.open_ = false;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.pointers = new Map();
    this.bind();
  }

  bind() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointercancel', (e) => this.onUp(e));
    cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    $('ed-zoom-in').addEventListener('click', () => this.setZoom(this.zoom * 1.35));
    $('ed-zoom-out').addEventListener('click', () => this.setZoom(this.zoom / 1.35));
    $('ed-zoom-fit').addEventListener('click', () => {
      this.pan = { x: 0, y: 0 };
      this.setZoom(1);
    });
    $('ed-size').addEventListener('input', (e) => {
      this.draft.size = Number(e.target.value);
      this.refresh();
    });
    $('ed-mem').addEventListener('input', (e) => {
      this.draft.membrane = Number(e.target.value);
      this.refresh();
    });
    $('ed-hue').addEventListener('input', (e) => {
      this.draft.hue = Number(e.target.value);
      this.drawPaletteIcons();
    });
    $('ed-reset').addEventListener('click', () => this.reset());
    $('ed-done').addEventListener('click', () => this.finish());
  }

  open(world) {
    this.world = world;
    const p = world.player;
    this.orig = cloneGenome(p.genome);
    this.origPh = phenotype(this.orig);
    this.offers = world.pressures.generateOffers(p.genome, world.rng, 3);
    this.lineageCauses = { ...(world.lineageCauses || {}) };
    this.prepareForecast();
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.reset();
    $('ed-gen').textContent = p.generation + 1;
    $('ed-name').value = world.playerSpecies.name;
    this.open_ = true;
    $('screen-editor').hidden = false;
    this.resize();
    this.setZoom(1);
    const loop = (t) => {
      if (!this.open_) return;
      this.draw(t / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  close() {
    this.open_ = false;
    $('screen-editor').hidden = true;
  }

  reset() {
    this.draft = cloneGenome(this.orig);
    for (const p of this.draft.parts) p.o = 'orig';
    this.baseSize = this.orig.size;
    this.baseMem = this.orig.membrane;
    this.chosen = -1;
    this.selected = null;
    this.placing = null;
    this.renderOffers();
    this.renderPalette();
    this.hint(null);
    this.refresh();
  }

  prepareForecast() {
    const world = this.world;
    const env = world.env;
    this.nowSummary = env.biomeSummary();
    this.nextSummary = env.biomeSummary(env.modsFor(env.nextEraId));
    // Food density per biome, as a 0..1 hint for the forecast.
    const plant = {};
    const meat = {};
    const tmp = {};
    for (const id of BIOME_IDS) plant[id] = meat[id] = 0;
    for (const f of world.food) {
      const b = env.classify(env.sample(f.x, f.y, tmp));
      if (f.meat) meat[b] += f.energy;
      else plant[b] += f.energy;
    }
    for (const c of world.cells) {
      if (c.speciesId === world.playerSpecies.id) continue;
      meat[env.classify(c.env)] += c.ph.maxHP * 0.15;
    }
    const norm = (obj) => {
      const dens = {};
      let max = 0;
      for (const id of BIOME_IDS) {
        const share = this.nowSummary[id].share;
        dens[id] = share > 0 ? obj[id] / share : 0;
        max = Math.max(max, dens[id]);
      }
      for (const id of BIOME_IDS) dens[id] = max > 0 ? dens[id] / max : 0;
      return dens;
    };
    this.foodHint = { plant: norm(plant), meat: norm(meat) };
  }

  // ------------------------------------------------------------ offers

  renderOffers() {
    const list = $('ed-offer-list');
    list.innerHTML = '';
    this.offers.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'offer';
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      const icon = document.createElement('canvas');
      icon.width = icon.height = 88;
      b.appendChild(icon);
      const gene = o.kind === 'part' ? o.part : o.kind === 'upgrade' ? o.to : null;
      const isNew = gene && !this.world.progress.unlocked.has(gene);
      b.insertAdjacentHTML(
        'beforeend',
        `<div class="o-title">${o.title}</div><div class="o-effect">${o.effect}</div><div class="o-tag">${isNew ? 'New gene' : o.cat}</div><div class="o-reason">${o.reason}</div>`
      );
      const ictx = icon.getContext('2d');
      ictx.scale(2, 2);
      if (o.kind === 'part') drawPartIcon(ictx, o.part, 44, this.orig.hue);
      else if (o.kind === 'upgrade') drawPartIcon(ictx, o.to, 44, this.orig.hue);
      else drawCell(ictx, this.orig, o.kind === 'size' ? (o.delta > 0 ? 15 : 10) : 13, { x: 22, y: 22, heading: UP, phase: 0 }, 0, { wobble: 0 });
      b.addEventListener('click', () => this.chooseOffer(i));
      list.appendChild(b);
    });
    const none = document.createElement('button');
    none.className = 'offer none';
    none.type = 'button';
    none.setAttribute('aria-pressed', 'true');
    none.innerHTML = '<div class="o-title">No mutation</div><div class="o-reason">Keep the inherited body and spend DNA freely.</div>';
    none.addEventListener('click', () => this.chooseOffer(-1));
    list.appendChild(none);
  }

  markOffer(i) {
    const btns = $('ed-offer-list').children;
    for (let k = 0; k < btns.length; k++) btns[k].setAttribute('aria-pressed', String(k === (i < 0 ? btns.length - 1 : i)));
  }

  chooseOffer(i) {
    // Undo the previous choice.
    const prev = this.offers[this.chosen];
    this.draft.parts = this.draft.parts.filter((p) => p.o !== 'mut');
    for (const p of this.draft.parts) {
      if (p.mutFrom) {
        p.t = p.mutFrom;
        delete p.mutFrom;
      }
    }
    if (prev && prev.kind === 'size') {
      if (Math.abs(this.draft.size - this.baseSize) < 0.001) this.draft.size = this.orig.size;
      this.baseSize = this.orig.size;
    }
    if (prev && prev.kind === 'membrane') {
      if (Math.abs(this.draft.membrane - this.baseMem) < 0.001) this.draft.membrane = this.orig.membrane;
      this.baseMem = this.orig.membrane;
    }
    this.chosen = i;
    const o = this.offers[i];
    if (o) {
      if (o.kind === 'part') {
        if (!canAddPart(this.draft, o.part)) {
          // Make room by dropping a purchased copy of the same part.
          const idx = this.draft.parts.findIndex((p) => p.t === o.part && p.o === 'new');
          if (idx >= 0) this.draft.parts.splice(idx, 1);
        }
        if (canAddPart(this.draft, o.part)) {
          const a = PARTS[o.part].ext ? normAngle(o.angle ?? placeAngleFor(o.part, this.draft)) : 0;
          this.draft.parts.push({ t: o.part, a, o: 'mut' });
        }
      } else if (o.kind === 'upgrade') {
        // Evolve the matching eye in place (the one closest to the offer's angle).
        const cands = this.draft.parts.filter((p) => p.t === o.from && !p.mutFrom);
        cands.sort((a, b) => Math.abs(angleDiff(a.a, o.angle)) - Math.abs(angleDiff(b.a, o.angle)));
        if (cands[0]) {
          cands[0].mutFrom = cands[0].t;
          cands[0].t = o.to;
        }
      } else if (o.kind === 'size') {
        const nb = clamp(this.orig.size + o.delta, SIZE_MIN, SIZE_MAX);
        if (Math.abs(this.draft.size - this.baseSize) < 0.001) this.draft.size = nb;
        this.baseSize = nb;
      } else if (o.kind === 'membrane') {
        const nb = clamp(this.orig.membrane + o.delta, 0, 1);
        if (Math.abs(this.draft.membrane - this.baseMem) < 0.001) this.draft.membrane = nb;
        this.baseMem = nb;
      }
    }
    this.markOffer(i);
    if (this.selected && !this.draft.parts.includes(this.selected)) this.selected = null;
    this.refresh();
  }

  // ------------------------------------------------------------ palette

  renderPalette() {
    const pal = $('ed-palette');
    pal.innerHTML = '';
    this.tiles = {};
    for (const cat of CATEGORIES) {
      const h = document.createElement('div');
      h.className = 'cat-title';
      h.textContent = cat;
      pal.appendChild(h);
      for (const id of PART_IDS.filter((p) => PARTS[p].cat === cat)) {
        const P = PARTS[id];
        const tile = document.createElement('div');
        tile.className = 'part-tile';
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'pt-main';
        main.title = P.desc;
        const icon = document.createElement('canvas');
        icon.width = icon.height = 68;
        main.appendChild(icon);
        main.insertAdjacentHTML('beforeend', `<span class="pt-text"><span class="pb-name">${P.name}</span><span class="pb-sub"></span></span>`);
        main.addEventListener('click', () => this.pickPart(id));
        const step = document.createElement('div');
        step.className = 'pt-step';
        step.innerHTML = `<span class="pb-cost" title="DNA per part">${P.dna}</span><button type="button" class="pt-btn" aria-label="Remove one ${P.name}">−</button><span class="pt-count">0</span><button type="button" class="pt-btn" aria-label="Add one ${P.name}">+</button>`;
        const [minus, plus] = step.querySelectorAll('button');
        minus.addEventListener('click', () => this.stepPart(id, -1));
        plus.addEventListener('click', () => this.stepPart(id, 1));
        tile.append(main, step);
        pal.appendChild(tile);
        this.tiles[id] = { tile, main, icon, sub: main.querySelector('.pb-sub'), minus, plus, count: step.querySelector('.pt-count'), cost: step.querySelector('.pb-cost') };
      }
    }
    this.drawPaletteIcons();
  }

  drawPaletteIcons() {
    for (const [id, el] of Object.entries(this.tiles || {})) {
      const ctx = el.icon.getContext('2d');
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      drawPartIcon(ctx, id, 34, this.draft ? this.draft.hue : 175);
    }
  }

  isLocked(id) {
    return !this.world.progress.unlocked.has(id) && !this.draft.parts.some((p) => p.t === id && (p.o === 'mut' || p.mutFrom));
  }

  /** How many of this part the cell had before this division (the minus floor). */
  floorOf(id) {
    return this.draft.parts.filter((p) => p.t === id && isHad(p)).length;
  }

  updatePalette() {
    const c = countParts(this.draft);
    const left = this.world.progress.dna - this.cost();
    for (const [id, el] of Object.entries(this.tiles)) {
      const locked = this.isLocked(id);
      el.tile.classList.toggle('locked', locked);
      el.tile.classList.toggle('placing', this.placing === id);
      el.tile.classList.toggle('pricey', !locked && PARTS[id].dna > left);
      el.main.setAttribute('aria-pressed', String(this.placing === id));
      const from = PARTS[id].evolvesFrom;
      el.sub.textContent = locked ? (from ? `Evolves from ${PARTS[from].name.toLowerCase()}` : 'Locked') : PARTS[id].effect;
      el.count.textContent = c[id];
      el.count.title = `${c[id]} of ${PARTS[id].max}`;
      el.minus.disabled = c[id] <= this.floorOf(id);
      el.minus.title = el.minus.disabled && c[id] > 0 ? 'You can’t go below what your cell already has.' : '';
      el.plus.disabled = locked || !canAddPart(this.draft, id);
    }
  }

  /** The − / + buttons on a palette tile. */
  stepPart(id, dir) {
    if (dir > 0) {
      if (this.isLocked(id)) return this.pickPart(id);
      if (!canAddPart(this.draft, id)) {
        this.hint(`You can't fit another ${PARTS[id].name.toLowerCase()}.`);
        return;
      }
      const part = { t: id, a: PARTS[id].ext ? placeAngleFor(id, this.draft) : 0, o: 'new' };
      this.draft.parts.push(part);
      this.selected = part;
      this.placing = null;
      if (PARTS[id].ext) this.hint(`Added ${withArticle(PARTS[id].name)} on the ${positionLabel(part.a).split(',')[0]}. Drag it, or use the arrows below, to move it.`);
      this.refresh();
      return;
    }
    // Remove the most recent copy bought this division, then a mutation copy.
    // Inherited copies set the floor and are never removed here.
    let idx = -1;
    for (let i = this.draft.parts.length - 1; i >= 0; i--) {
      if (this.draft.parts[i].t === id && this.draft.parts[i].o === 'new') {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = this.draft.parts.findIndex((p) => p.t === id && p.o === 'mut');
    if (idx < 0) return;
    this.removePart(this.draft.parts[idx]);
  }

  pickPart(id) {
    if (this.isLocked(id)) {
      const from = PARTS[id].evolvesFrom;
      this.hint(
        from
          ? `${PARTS[id].name} evolves from an ${PARTS[from].name.toLowerCase()}. Live one generation with an ${PARTS[from].name.toLowerCase()} and you can upgrade it, or wait for the mutation.`
          : `${PARTS[id].name} is locked. Mutations and absorbing genes from cells that have it can unlock it.`
      );
      return;
    }
    if (!canAddPart(this.draft, id)) {
      this.hint(`You can't fit another ${PARTS[id].name.toLowerCase()}.`);
      return;
    }
    if (!PARTS[id].ext) {
      this.stepPart(id, 1);
      return;
    }
    this.placing = this.placing === id ? null : id;
    this.selected = null;
    this.hint(this.placing ? `Tap the membrane to place the ${PARTS[id].name.toLowerCase()}. The top of the cell is the front.` : null);
    this.refresh();
  }

  hint(text) {
    $('ed-hint').textContent = text || DEFAULT_HINT;
  }

  // ------------------------------------------------------------ canvas view

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    this.cw = r.width;
    this.ch = r.height;
  }

  get R() {
    return Math.min(this.cw, this.ch) * 0.115 * (0.8 + 0.2 * this.draft.size) * this.zoom;
  }

  get center() {
    return { x: this.cw / 2 + this.pan.x, y: this.ch / 2 + this.pan.y };
  }

  /** Zoom, keeping the screen point (sx, sy) fixed when given. */
  setZoom(z, sx = null, sy = null) {
    const nz = clamp(z, ZOOM_MIN, ZOOM_MAX);
    if (sx != null) {
      const c = this.center;
      const k = nz / this.zoom;
      this.pan.x += (sx - c.x) * (1 - k);
      this.pan.y += (sy - c.y) * (1 - k);
    }
    this.zoom = nz;
    this.clampPan();
    $('ed-zoom-val').textContent = `${Math.round(nz * 100)}%`;
  }

  clampPan() {
    const lim = Math.max(this.cw, this.ch) * 0.5 * this.zoom;
    this.pan.x = clamp(this.pan.x, -lim, lim);
    this.pan.y = clamp(this.pan.y, -lim, lim);
  }

  localPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const c = this.center;
    const x = sx - c.x;
    const y = sy - c.y;
    return { a: normAngle(angleDiff(Math.atan2(y, x), UP)), d: Math.hypot(x, y), x, y, sx, sy };
  }

  anchorOf(p) {
    const R = this.R;
    const sa = UP + p.a;
    const reach = p.t === 'flagellum' ? 1.8 : p.t === 'spike' ? 1.35 : PARTS[p.t].eye ? 0.8 : 1.05;
    return { x: Math.cos(sa) * R * reach, y: Math.sin(sa) * R * reach };
  }

  /** All external parts under a point, nearest first. */
  hitParts(pt) {
    const rad = Math.max(16, this.R * 0.42);
    return this.draft.parts
      .filter((p) => PARTS[p.t].ext)
      .map((p) => {
        const a = this.anchorOf(p);
        return { p, d: Math.hypot(pt.x - a.x, pt.y - a.y) };
      })
      .filter((h) => h.d < rad)
      .sort((a, b) => a.d - b.d)
      .map((h) => h.p);
  }

  onWheel(e) {
    if (!this.open_) return;
    e.preventDefault();
    const pt = this.localPoint(e);
    this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015), pt.sx, pt.sy);
  }

  onDown(e) {
    if (!this.open_) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      // Second finger: switch to pinch zoom, cancel any drag.
      this.dragging = null;
      this.panning = null;
      this.pinch = this.pinchState();
      return;
    }
    const pt = this.localPoint(e);
    this.pointer = pt;
    if (this.placing) {
      if (pt.d < this.R * 0.3) return;
      if (canAddPart(this.draft, this.placing)) {
        const part = { t: this.placing, a: pt.a, o: 'new' };
        this.draft.parts.push(part);
        this.selected = part;
      }
      if (!canAddPart(this.draft, this.placing)) this.placing = null;
      this.hint(this.placing ? 'Tap again to add another, or pick a different part.' : null);
      this.refresh();
      return;
    }
    const hits = this.hitParts(pt);
    this.pendingCycle = null;
    if (hits.length) {
      const idx = hits.indexOf(this.selected);
      if (idx >= 0) {
        // Tapping the selected part again moves on to the next overlapping one.
        if (hits.length > 1) this.pendingCycle = hits[(idx + 1) % hits.length];
      } else this.selected = hits[0];
      this.dragging = this.selected;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragMoved = false;
      if (hits.length > 1) this.hint(`${hits.length} parts overlap here. Tap again to switch between them, or pick one in the list below.`);
      this.refresh();
    } else {
      this.panning = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, moved: false };
    }
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, zoom: this.zoom, px: this.pan.x, py: this.pan.y };
  }

  onMove(e) {
    if (!this.open_) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const now = this.pinchState();
      const r = this.canvas.getBoundingClientRect();
      this.pan.x = this.pinch.px + (now.mx - this.pinch.mx);
      this.pan.y = this.pinch.py + (now.my - this.pinch.my);
      this.setZoom((this.pinch.zoom * now.d) / Math.max(1, this.pinch.d), now.mx - r.left, now.my - r.top);
      this.pinch = { ...now, zoom: this.zoom, px: this.pan.x, py: this.pan.y };
      return;
    }
    const pt = this.localPoint(e);
    this.pointer = pt;
    if (this.dragging) {
      if (!this.dragMoved && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) < 5) return;
      this.dragMoved = true;
      this.pendingCycle = null;
      this.dragging.a = pt.a;
      this.updateAngleUI();
      this.refreshStats();
    } else if (this.panning) {
      this.pan.x = this.panning.px + (e.clientX - this.panning.x);
      this.pan.y = this.panning.py + (e.clientY - this.panning.y);
      if (Math.hypot(e.clientX - this.panning.x, e.clientY - this.panning.y) > 4) this.panning.moved = true;
      this.clampPan();
    }
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    if (this.dragging) {
      if (!this.dragMoved && this.pendingCycle) this.selected = this.pendingCycle;
      this.dragging = null;
      this.pendingCycle = null;
      this.refresh();
    } else if (this.panning) {
      // A tap on empty water clears the selection.
      if (!this.panning.moved && this.selected) {
        this.selected = null;
        this.refresh();
      }
      this.panning = null;
    }
  }

  draw(t) {
    if (!this.cw) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    const { x: cx, y: cy } = this.center;
    const R = this.R;

    // Coverage arc for the selected part (mouth reach, armor cover, eye cone).
    const sel = this.selected;
    if (sel && PARTS[sel.t].ext && PARTS[sel.t].arc > 0) {
      const arc = PARTS[sel.t].arc;
      ctx.fillStyle = 'rgba(61, 255, 226, 0.1)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R * 2.4, UP + sel.a - arc / 2, UP + sel.a + arc / 2);
      ctx.closePath();
      ctx.fill();
    }
    // Faint rings and spokes for orientation.
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.07)';
    ctx.lineWidth = 1;
    for (const k of [1.5, 2.5]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * k, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = UP + (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 1.3, cy + Math.sin(a) * R * 1.3);
      ctx.lineTo(cx + Math.cos(a) * R * 2.5, cy + Math.sin(a) * R * 2.5);
      ctx.stroke();
    }
    drawCell(ctx, this.draft, R, { x: cx, y: cy, heading: UP, thrustLevel: 0.45, biteAnim: (Math.sin(t * 3) + 1) * 0.25, phase: 1, look: UP }, t, { detail: true });

    if (sel && PARTS[sel.t].ext) {
      const a = this.anchorOf(sel);
      ctx.strokeStyle = '#3dffe2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + a.x, cy + a.y, Math.max(10, R * 0.3), 0, TAU);
      ctx.stroke();
    }
    if (this.placing && this.pointer && this.pointer.d > R * 0.3) {
      const sa = UP + this.pointer.a;
      ctx.fillStyle = 'rgba(61, 255, 226, 0.9)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(sa) * R, cy + Math.sin(sa) * R, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(61, 255, 226, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sa) * R * 2, cy + Math.sin(sa) * R * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ------------------------------------------------------------ panels

  cost() {
    let c = 0;
    for (const p of this.draft.parts) {
      if (p.o === 'new') c += PARTS[p.t].dna;
      else if (p.o === 'up') c += PARTS[p.t].dna - PARTS[p.upFrom].dna;
    }
    c += Math.round(Math.abs(this.draft.size - this.baseSize) * SIZE_COST);
    c += Math.round(Math.abs(this.draft.membrane - this.baseMem) * MEM_COST);
    return c;
  }

  refresh() {
    $('ed-size').value = this.draft.size;
    $('ed-mem').value = this.draft.membrane;
    $('ed-hue').value = this.draft.hue;
    $('ed-size-val').textContent = `${this.draft.size.toFixed(2)}×`;
    $('ed-mem-val').textContent = `${Math.round(this.draft.membrane * 100)}%`;
    this.refreshStats();
    this.updatePalette();
    this.renderSelected();
    this.renderPartsList();
  }

  originLabel(p) {
    if (p.o === 'mut' || p.mutFrom) return 'Free mutation';
    if (p.o === 'new') return `Bought · ${PARTS[p.t].dna} DNA`;
    if (p.o === 'up') return `Evolved · ${PARTS[p.t].dna - PARTS[p.upFrom].dna} DNA`;
    return 'Inherited';
  }

  renderSelected() {
    const box = $('ed-selected');
    const sel = this.selected;
    if (!sel) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const P = PARTS[sel.t];
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'sel-head';
    head.innerHTML = `<b>${P.name}</b> <span class="sel-origin">${this.originLabel(sel)}</span><span class="grow">${P.desc}</span>`;
    box.appendChild(head);

    if (P.ext) {
      // Fine positioning without dragging: useful when parts overlap.
      const rot = document.createElement('div');
      rot.className = 'sel-rotate';
      rot.innerHTML = `<span class="sel-pos" id="ed-sel-pos">${positionLabel(sel.a)}</span>
        <button type="button" class="btn" aria-label="Rotate left 15 degrees">↺</button>
        <input id="ed-angle" type="range" min="-180" max="180" step="1" aria-label="Position around the membrane, in degrees">
        <button type="button" class="btn" aria-label="Rotate right 15 degrees">↻</button>`;
      const [left, right] = rot.querySelectorAll('button');
      const slider = rot.querySelector('input');
      slider.value = Math.round((sel.a * 180) / Math.PI);
      const setA = (deg) => {
        sel.a = normAngle((deg * Math.PI) / 180);
        this.updateAngleUI();
        this.refreshStats();
        this.renderPartsList();
      };
      left.addEventListener('click', () => setA(Math.round((sel.a * 180) / Math.PI) - 15));
      right.addEventListener('click', () => setA(Math.round((sel.a * 180) / Math.PI) + 15));
      slider.addEventListener('input', () => setA(Number(slider.value)));
      box.appendChild(rot);
    }

    const actions = document.createElement('div');
    actions.className = 'sel-actions';
    const addBtn = (label, cls, fn, disabled = false, title = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.disabled = disabled;
      if (title) b.title = title;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    const canMirror = P.ext && !this.isLocked(sel.t) && canAddPart(this.draft, sel.t) && Math.abs(Math.abs(sel.a) - Math.PI) > 0.15 && Math.abs(sel.a) > 0.15;
    if (canMirror) {
      addBtn(`Mirror (${P.dna})`, '', () => {
        const part = { t: sel.t, a: normAngle(-sel.a), o: 'new' };
        this.draft.parts.push(part);
        this.selected = part;
        this.refresh();
      });
    }
    // Eyes can evolve to the next tier in place.
    const next = P.evolvesTo;
    if (next && !sel.mutFrom) {
      const nextUnlocked = this.world.progress.unlocked.has(next);
      const room = countParts(this.draft)[next] < PARTS[next].max;
      addBtn(
        `Evolve into ${PARTS[next].name} (${PARTS[next].dna - P.dna})`,
        'primary',
        () => {
          if (sel.o === 'orig') {
            sel.o = 'up';
            sel.upFrom = sel.t;
          }
          sel.t = next;
          this.refresh();
        },
        !nextUnlocked || !room,
        nextUnlocked ? '' : `Live one generation with an ${P.name.toLowerCase()} first.`
      );
    }
    if (sel.o === 'up') {
      addBtn(`Undo evolution`, '', () => {
        sel.t = sel.upFrom;
        sel.o = 'orig';
        delete sel.upFrom;
        this.refresh();
      });
    }
    if (isHad(sel)) {
      addBtn('Lose this part', 'ghost', () => this.removePart(sel), false, 'Evolution can lose parts too. This is free.');
    } else {
      addBtn(sel.o === 'mut' ? 'Remove (cancels the mutation)' : `Remove (refund ${P.dna})`, '', () => this.removePart(sel));
    }
    box.appendChild(actions);
  }

  /** Update angle readouts without rebuilding the panel (keeps slider focus). */
  updateAngleUI() {
    const sel = this.selected;
    if (!sel) return;
    const pos = $('ed-sel-pos');
    if (pos) pos.textContent = positionLabel(sel.a);
    const slider = $('ed-angle');
    if (slider && document.activeElement !== slider) slider.value = Math.round((sel.a * 180) / Math.PI);
  }

  removePart(part) {
    const c = countParts(this.draft);
    if ((part.t === 'flagellum' || part.t === 'cilia') && c.flagellum + c.cilia <= 1) {
      this.hint('Your cell needs at least one flagellum or patch of cilia to move.');
      return;
    }
    this.draft.parts.splice(this.draft.parts.indexOf(part), 1);
    if (part.o === 'mut' || part.mutFrom) {
      this.chosen = -1;
      this.markOffer(-1);
    }
    if (this.selected === part) this.selected = null;
    this.refresh();
  }

  /** Every part on the cell as a tappable tile, so overlapping parts are easy to pick. */
  renderPartsList() {
    const box = $('ed-parts');
    box.innerHTML = '';
    const ext = this.draft.parts.filter((p) => PARTS[p.t].ext).sort((a, b) => Math.abs(a.a) - Math.abs(b.a) || a.a - b.a);
    const int = this.draft.parts.filter((p) => !PARTS[p.t].ext);
    for (const p of [...ext, ...int]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `part-chip${p.o === 'new' ? ' is-new' : ''}${p.o === 'mut' || p.mutFrom ? ' is-mut' : ''}`;
      b.setAttribute('aria-pressed', String(p === this.selected));
      const icon = document.createElement('canvas');
      icon.width = icon.height = 56;
      b.appendChild(icon);
      const where = PARTS[p.t].ext ? positionLabel(p.a) : 'inside';
      b.insertAdjacentHTML('beforeend', `<span class="pc-text"><span class="pc-name">${PARTS[p.t].name}</span><span class="pc-sub">${where} · ${this.originLabel(p)}</span></span>`);
      const ictx = icon.getContext('2d');
      ictx.setTransform(2, 0, 0, 2, 0, 0);
      drawPartIcon(ictx, p.t, 28, this.draft.hue);
      b.addEventListener('click', () => {
        this.selected = p;
        this.placing = null;
        this.refresh();
      });
      box.appendChild(b);
    }
  }

  refreshStats() {
    const ph = phenotype(this.draft);
    const o = this.origPh;
    const rows = [
      ['Top speed', ph.topSpeed, o.topSpeed, (v) => `${v.toFixed(0)} µm/s`, 1],
      ['Turning', ph.turn, o.turn, (v) => `${Math.round((v * 180) / Math.PI)}°/s`, 1],
      ['Health', ph.maxHP, o.maxHP, (v) => v.toFixed(0), 1],
      ['Energy store', ph.maxEnergy, o.maxEnergy, (v) => v.toFixed(0), 1],
      ['Upkeep', ph.upkeep, o.upkeep, (v) => `${v.toFixed(2)}/s`, -1],
      ['Sight ahead', ph.sight.ahead, o.sight.ahead, (v) => `${v.toFixed(0)} µm`, 1],
      ['Sight behind', ph.sight.behind, o.sight.behind, (v) => `${v.toFixed(0)} µm`, 1],
      ['Coldest', ph.tMin, o.tMin, (v) => `${v.toFixed(0)}°C`, -1],
      ['Hottest', ph.tMax, o.tMax, (v) => `${v.toFixed(0)}°C`, 1],
      ['UV limit', ph.uvTol, o.uvTol, pct, 1],
      ['Oxygen limit', ph.o2Tol, o.o2Tol, pct, 1],
      ['Sulfur limit', ph.toxTol, o.toxTol, pct, 1],
    ];
    if (ph.photo || o.photo) rows.push(['Photosynthesis', ph.photo, o.photo, (v) => `${v.toFixed(2)}/s`, 1]);
    if (ph.chemo || o.chemo) rows.push(['Chemosynthesis', ph.chemo, o.chemo, (v) => `${v.toFixed(2)}/s`, 1]);
    if (ph.mito || o.mito) rows.push(['O₂ savings', ph.mito, o.mito, pct, 1]);
    if (ph.bite || o.bite) rows.push(['Bite', ph.bite, o.bite, (v) => v.toFixed(1), 1]);
    if (ph.spike || o.spike) rows.push(['Spike', ph.spike, o.spike, (v) => v.toFixed(1), 1]);
    rows.push(['Plant digestion', ph.plantEff, o.plantEff, pct, 1]);
    rows.push(['Meat digestion', ph.meatEff, o.meatEff, pct, 1]);
    rows.push(['Division cost', ph.growthNeeded, o.growthNeeded, (v) => v.toFixed(0), -1]);
    let html = '';
    for (const [name, v, ov, fmt, dir] of rows) {
      const d = v - ov;
      let delta = '';
      if (Math.abs(d) > 1e-3 * Math.max(1, Math.abs(ov))) {
        const good = d * dir > 0;
        delta = `<span class="s-delta ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}</span>`;
      } else delta = '<span class="s-delta"></span>';
      html += `<span class="s-name">${name}</span><span class="s-val">${fmt(v)}</span>${delta}`;
    }
    html += `<span class="s-name">Diet</span><span class="s-val">${ph.diet}</span><span class="s-delta"></span>`;
    const cl = ph.sight.clarity;
    const dc = cl - o.sight.clarity;
    html += `<span class="s-name">Clarity</span><span class="s-val">${CLARITY[cl].short}</span><span class="s-delta ${dc > 0 ? 'up' : dc < 0 ? 'down' : ''}">${dc > 0 ? '▲' : dc < 0 ? '▼' : ''}</span>`;
    $('ed-stat-list').innerHTML = html;
    this.drawSight(ph, o);

    // Habitat forecast.
    const fitHtml = [];
    const nextName = ERAS[this.world.env.nextEraId].name;
    $('ed-next-label').textContent = 'next era';
    $('ed-next-label').title = nextName;
    for (const id of BIOME_IDS) {
      const now = this.nowSummary[id];
      const nxt = this.nextSummary[id];
      if (now.n === 0 && nxt.n === 0) continue;
      const food = { plant: this.foodHint.plant[id], meat: this.foodHint.meat[id] };
      const fNow = now.n ? habitatFit(ph, now, food) : null;
      const fNext = nxt.n ? habitatFit(ph, nxt, food) : null;
      const bar = (f) => (f ? `<div class="fit-bar" title="${Math.round(f.score * 100)}%"><i style="width:${Math.max(4, f.score * 100)}%;background:${fitColor(f.score)}"></i></div>` : '<div class="muted small">absent</div>');
      const notes = [];
      if (fNow && fNow.notes.length) notes.push(fNow.notes.join(', '));
      if (fNext) {
        const extra = fNext.notes.filter((n) => !fNow || !fNow.notes.includes(n));
        if (extra.length) notes.push(`next era: ${extra.join(', ')}`);
      }
      fitHtml.push(
        `<div class="fit-row"><span class="f-name"><span class="f-dot" style="background:${BIOMES[id].color}"></span>${BIOMES[id].name}</span>${bar(fNow)}${bar(fNext)}${notes.length ? `<span class="f-notes">${notes.join(' · ')}</span>` : ''}</div>`
      );
    }
    $('ed-fit-list').innerHTML = fitHtml.join('');
    const causes = Object.entries(this.lineageCauses).sort((a, b) => b[1] - a[1]).slice(0, 3);
    $('ed-lineage-note').innerHTML = `Next era: <b>${nextName}</b> in ${Math.max(0, Math.round(this.world.env.eraRemaining / 60))} min. ${ERAS[this.world.env.nextEraId].hint}${
      causes.length ? `<br>Your lineage has died from: ${causes.map(([k, v]) => `${k} ×${v}`).join(', ')}.` : ''
    }`;

    // Wallet: pinned in the footer, so it stays in view while scrolling.
    const cost = this.cost();
    const dna = this.world.progress.dna;
    const left = dna - cost;
    $('ed-dna').textContent = dna;
    $('ed-cost').textContent = cost;
    const leftEl = $('ed-left');
    if (leftEl.textContent !== String(left)) {
      leftEl.classList.remove('bump');
      void leftEl.offsetWidth;
      leftEl.classList.add('bump');
    }
    leftEl.textContent = left;
    leftEl.classList.toggle('neg', left < 0);
    const warn = [];
    if (cost > dna) warn.push('Not enough DNA.');
    if (ph.plantEff === 0 && ph.meatEff === 0 && ph.photo === 0 && ph.chemo === 0) warn.push('This cell has no way to get energy.');
    $('ed-warn').textContent = warn.join(' ');
    $('ed-done').disabled = cost > dna;
    if (this.tiles) {
      for (const [id, el] of Object.entries(this.tiles)) el.tile.classList.toggle('pricey', !el.tile.classList.contains('locked') && PARTS[id].dna > left);
    }
  }

  /** Top-down diagram of what the cell can see, compared with the parent. */
  drawSight(ph, o) {
    const cv = $('ed-sight');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth || 140;
    const H = cv.clientHeight || 140;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;
    const k = (Math.min(W, H) / 2 - 6) / 650;
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.12)';
    ctx.fillStyle = 'rgba(169, 195, 214, 0.75)';
    ctx.font = '10px "JetBrains Mono", monospace';
    for (const rr of [200, 400, 600]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr * k, 0, TAU);
      ctx.stroke();
    }
    ctx.fillText('600 µm', cx + 4, cy - 600 * k + 11);
    const shape = (sp) => {
      const p = new Path2D();
      for (let i = 0; i <= BINS; i++) {
        const b = i % BINS;
        const a = UP + (b / BINS) * TAU;
        const r = (sp.base + sp.eye[b]) * k;
        if (i === 0) p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      p.closePath();
      return p;
    };
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(169, 195, 214, 0.5)';
    ctx.stroke(shape(o.sight));
    ctx.setLineDash([]);
    const now = shape(ph.sight);
    ctx.fillStyle = 'rgba(61, 255, 226, 0.14)';
    ctx.fill(now);
    ctx.strokeStyle = '#3dffe2';
    ctx.lineWidth = 1.5;
    ctx.stroke(now);
    ctx.fillStyle = `hsl(${this.draft.hue}, 100%, 62%)`;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx - 3, cy - 4);
    ctx.lineTo(cx + 3, cy - 4);
    ctx.fill();
    const c = CLARITY[ph.sight.clarity];
    $('ed-sight-text').innerHTML = `<b>${c.name}.</b> ${c.desc} Dashed: your current body. Eyes see farthest where they face, and less in dark water.`;
  }

  finish() {
    const cost = this.cost();
    const world = this.world;
    if (cost > world.progress.dna) return;
    world.progress.dna -= cost;
    const o = this.offers[this.chosen];
    let newGene = null;
    const gene = o ? (o.kind === 'part' ? o.part : o.kind === 'upgrade' ? o.to : null) : null;
    if (gene && !world.progress.unlocked.has(gene)) {
      world.progress.unlocked.add(gene);
      newGene = gene;
    }
    const g = cloneGenome(this.draft); // drops editor-only fields
    const name = $('ed-name').value.trim();
    if (name) {
      world.playerSpecies.name = name;
      world.playerSpecies.genus = name.split(' ')[0];
    }
    world.playerDivide(g);
    this.close();
    this.onDone({ cost, mutation: o ? o.title : null, newGene });
  }
}

/** "a flagellum", "an eyespot", "cilia" (already plural). */
function withArticle(name) {
  const n = name.toLowerCase();
  if (n === 'cilia') return n;
  return `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
}

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function fitColor(s) {
  if (s < 0.2) return '#ff5d73';
  if (s < 0.45) return '#ffc45c';
  return '#8fdc6a';
}
