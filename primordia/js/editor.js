// Division editor: free mutation offers, DNA-funded edits, live stats and a
// habitat forecast for now and the next era.

import { PARTS, CATEGORIES, PART_IDS } from './parts.js';
import { cloneGenome, phenotype, canAddPart, placeAngleFor, normAngle, SIZE_MIN, SIZE_MAX, countParts } from './genome.js';
import { drawCell, drawPartIcon } from './cellDraw.js';
import { habitatFit } from './biology.js';
import { BIOMES, BIOME_IDS, ERAS } from './environment.js';
import { angleDiff, clamp, TAU } from './util.js';

const $ = (id) => document.getElementById(id);
const UP = -Math.PI / 2;
const SIZE_COST = 40; // DNA per 1.0 of size change
const MEM_COST = 30;

export class Editor {
  constructor(onDone) {
    this.onDone = onDone;
    this.canvas = $('ed-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.open_ = false;
    this.bind();
  }

  bind() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => this.onUp());
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
    this.reset();
    $('ed-gen').textContent = p.generation + 1;
    $('ed-name').value = world.playerSpecies.name;
    this.open_ = true;
    $('screen-editor').hidden = false;
    this.resize();
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
      const unlocked = o.kind !== 'part' || this.world.progress.unlocked.has(o.part);
      b.insertAdjacentHTML(
        'beforeend',
        `<div class="o-title">${o.title}</div><div class="o-effect">${o.effect}</div><div class="o-tag">${o.kind === 'part' && !unlocked ? 'New gene' : o.cat}</div><div class="o-reason">${o.reason}</div>`
      );
      const ictx = icon.getContext('2d');
      ictx.scale(2, 2);
      if (o.kind === 'part') drawPartIcon(ictx, o.part, 44, this.orig.hue);
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

  chooseOffer(i) {
    // Undo the previous choice.
    const prev = this.offers[this.chosen];
    this.draft.parts = this.draft.parts.filter((p) => p.o !== 'mut');
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
    const btns = $('ed-offer-list').children;
    for (let k = 0; k < btns.length; k++) btns[k].setAttribute('aria-pressed', String(k === (i < 0 ? btns.length - 1 : i)));
    this.selected = null;
    this.refresh();
  }

  // ------------------------------------------------------------ palette

  renderPalette() {
    const pal = $('ed-palette');
    pal.innerHTML = '';
    this.paletteBtns = {};
    for (const cat of CATEGORIES) {
      const h = document.createElement('div');
      h.className = 'cat-title';
      h.textContent = cat;
      pal.appendChild(h);
      for (const id of PART_IDS.filter((p) => PARTS[p].cat === cat)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'part-btn';
        const icon = document.createElement('canvas');
        icon.width = icon.height = 68;
        b.appendChild(icon);
        b.insertAdjacentHTML('beforeend', `<div><div class="pb-name">${PARTS[id].name}</div><div class="pb-sub"></div></div><div class="pb-cost">${PARTS[id].dna}</div>`);
        b.title = PARTS[id].desc;
        b.addEventListener('click', () => this.pickPart(id));
        pal.appendChild(b);
        this.paletteBtns[id] = { b, icon, sub: b.querySelector('.pb-sub') };
      }
    }
    this.drawPaletteIcons();
  }

  drawPaletteIcons() {
    for (const [id, el] of Object.entries(this.paletteBtns || {})) {
      const ctx = el.icon.getContext('2d');
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      drawPartIcon(ctx, id, 34, this.draft ? this.draft.hue : 175);
    }
  }

  updatePalette() {
    const c = countParts(this.draft);
    const unlocked = this.world.progress.unlocked;
    for (const [id, el] of Object.entries(this.paletteBtns)) {
      const locked = !unlocked.has(id) && !this.draft.parts.some((p) => p.t === id && p.o === 'mut');
      el.b.classList.toggle('locked', locked);
      el.b.setAttribute('aria-pressed', String(this.placing === id));
      el.sub.textContent = locked ? 'Locked' : `${c[id]} / ${PARTS[id].max} · ${PARTS[id].effect}`;
    }
  }

  pickPart(id) {
    const unlocked = this.world.progress.unlocked.has(id);
    if (!unlocked) {
      this.hint(`${PARTS[id].name} is locked. Mutations and absorbing genes from cells that have it can unlock it.`);
      return;
    }
    if (!canAddPart(this.draft, id)) {
      this.hint(`You can't fit another ${PARTS[id].name.toLowerCase()}.`);
      return;
    }
    if (!PARTS[id].ext) {
      this.draft.parts.push({ t: id, a: 0, o: 'new' });
      this.placing = null;
      this.refresh();
      return;
    }
    this.placing = this.placing === id ? null : id;
    this.selected = null;
    this.hint(this.placing ? `Click the membrane to place the ${PARTS[id].name.toLowerCase()}. The top of the cell is the front.` : null);
    this.refresh();
  }

  hint(text) {
    $('ed-hint').textContent = text || 'Pick a part on the left, then click the membrane to place it. Drag placed parts to move them.';
  }

  // ------------------------------------------------------------ canvas

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
    return Math.min(this.cw, this.ch) * 0.115 * (0.8 + 0.2 * this.draft.size);
  }

  localAngle(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left - this.cw / 2;
    const y = e.clientY - r.top - this.ch / 2;
    return { a: normAngle(angleDiff(Math.atan2(y, x), UP)), d: Math.hypot(x, y), x, y };
  }

  hitPart(pt) {
    const R = this.R;
    let best = null;
    let bd = Infinity;
    for (const p of this.draft.parts) {
      if (!PARTS[p.t].ext) continue;
      const sa = UP + p.a;
      const reach = p.t === 'flagellum' ? 1.8 : p.t === 'spike' ? 1.35 : 1.05;
      const px = Math.cos(sa) * R * reach;
      const py = Math.sin(sa) * R * reach;
      const d = Math.hypot(pt.x - px, pt.y - py);
      if (d < Math.max(18, R * 0.45) && d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  onDown(e) {
    if (!this.open_) return;
    const pt = this.localAngle(e);
    this.pointer = pt;
    if (this.placing) {
      if (pt.d < this.R * 0.3) return;
      if (canAddPart(this.draft, this.placing)) {
        const part = { t: this.placing, a: pt.a, o: 'new' };
        this.draft.parts.push(part);
        this.selected = part;
      }
      if (!canAddPart(this.draft, this.placing)) this.placing = null;
      this.hint(this.placing ? 'Click again to add another, or pick a different part.' : null);
      this.refresh();
      return;
    }
    const hit = this.hitPart(pt);
    this.selected = hit;
    this.dragging = hit;
    if (hit) this.canvas.setPointerCapture?.(e.pointerId);
    this.refresh();
  }

  onMove(e) {
    if (!this.open_) return;
    const pt = this.localAngle(e);
    this.pointer = pt;
    if (this.dragging) {
      this.dragging.a = pt.a;
      this.refreshStats();
    }
  }

  onUp() {
    if (this.dragging) {
      this.dragging = null;
      this.refresh();
    }
  }

  draw(t) {
    if (!this.cw) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    const cx = this.cw / 2;
    const cy = this.ch / 2;
    const R = this.R;

    // Coverage arc for the selected part (mouth reach, armor cover, eye cone).
    const sel = this.selected;
    if (sel && PARTS[sel.t].ext && PARTS[sel.t].arc > 0) {
      const arc = PARTS[sel.t].arc;
      ctx.fillStyle = 'rgba(255, 148, 112, 0.12)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R * 2.4, UP + sel.a - arc / 2, UP + sel.a + arc / 2);
      ctx.closePath();
      ctx.fill();
    }
    // Faint rings for scale.
    ctx.strokeStyle = 'rgba(170, 230, 220, 0.06)';
    ctx.lineWidth = 1;
    for (const k of [1.5, 2.5]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * k, 0, TAU);
      ctx.stroke();
    }
    drawCell(ctx, this.draft, R, { x: cx, y: cy, heading: UP, thrustLevel: 0.45, biteAnim: (Math.sin(t * 3) + 1) * 0.25, phase: 1, look: UP }, t, { detail: true });

    if (sel && PARTS[sel.t].ext) {
      const sa = UP + sel.a;
      ctx.strokeStyle = '#ff9470';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(sa) * R * 1.05, cy + Math.sin(sa) * R * 1.05, Math.max(10, R * 0.32), 0, TAU);
      ctx.stroke();
    }
    if (this.placing && this.pointer && this.pointer.d > R * 0.3) {
      const sa = UP + this.pointer.a;
      ctx.fillStyle = 'rgba(255, 148, 112, 0.85)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(sa) * R, cy + Math.sin(sa) * R, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 148, 112, 0.5)';
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
    for (const p of this.draft.parts) if (p.o === 'new') c += PARTS[p.t].dna;
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
    this.updatePalette();
    this.renderSelected();
    this.renderInternal();
    this.refreshStats();
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
    const origin = sel.o === 'mut' ? 'Free mutation' : sel.o === 'new' ? `Bought for ${P.dna} DNA` : 'Inherited';
    const canMirror = P.ext && this.world.progress.unlocked.has(sel.t) && canAddPart(this.draft, sel.t) && Math.abs(Math.abs(sel.a) - Math.PI) > 0.15 && Math.abs(sel.a) > 0.15;
    box.innerHTML = `<b>${P.name}</b><span class="grow">${P.desc} <i>${origin}.</i></span>`;
    if (canMirror) {
      const m = document.createElement('button');
      m.className = 'btn';
      m.textContent = `Mirror (${P.dna})`;
      m.addEventListener('click', () => {
        const part = { t: sel.t, a: normAngle(-sel.a), o: 'new' };
        this.draft.parts.push(part);
        this.selected = part;
        this.refresh();
      });
      box.appendChild(m);
    }
    const rm = document.createElement('button');
    rm.className = 'btn';
    rm.textContent = 'Remove';
    rm.addEventListener('click', () => this.removePart(sel));
    box.appendChild(rm);
  }

  removePart(part) {
    const c = countParts(this.draft);
    if ((part.t === 'flagellum' || part.t === 'cilia') && c.flagellum + c.cilia <= 1) {
      this.hint('Your cell needs at least one flagellum or patch of cilia to move.');
      return;
    }
    this.draft.parts.splice(this.draft.parts.indexOf(part), 1);
    if (part.o === 'mut') {
      this.chosen = -1;
      const btns = $('ed-offer-list').children;
      for (let k = 0; k < btns.length; k++) btns[k].setAttribute('aria-pressed', String(k === btns.length - 1));
    }
    if (this.selected === part) this.selected = null;
    this.refresh();
  }

  renderInternal() {
    const box = $('ed-internal');
    box.innerHTML = '';
    for (const p of this.draft.parts) {
      if (PARTS[p.t].ext) continue;
      const chip = document.createElement('span');
      chip.className = `org-chip${p.o === 'mut' ? ' mut' : ''}`;
      chip.textContent = PARTS[p.t].name;
      const x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${PARTS[p.t].name}`);
      x.textContent = '×';
      x.addEventListener('click', () => this.removePart(p));
      chip.appendChild(x);
      box.appendChild(chip);
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
      ['Vision', ph.vision, o.vision, (v) => `${v.toFixed(0)} µm`, 1],
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
    $('ed-stat-list').innerHTML = html;

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

    const cost = this.cost();
    const dna = this.world.progress.dna;
    $('ed-dna').textContent = dna;
    $('ed-cost').textContent = cost;
    $('ed-left').textContent = dna - cost;
    $('ed-left').classList.toggle('neg', dna - cost < 0);
    const warn = [];
    if (cost > dna) warn.push('Not enough DNA. Remove something or pick a free mutation instead.');
    if (ph.plantEff === 0 && ph.meatEff === 0 && ph.photo === 0 && ph.chemo === 0) warn.push('This cell has no way to get energy.');
    $('ed-warn').textContent = warn.join(' ');
    $('ed-done').disabled = cost > dna;
  }

  finish() {
    const cost = this.cost();
    const world = this.world;
    if (cost > world.progress.dna) return;
    world.progress.dna -= cost;
    const o = this.offers[this.chosen];
    let newGene = null;
    if (o && o.kind === 'part' && !world.progress.unlocked.has(o.part)) {
      world.progress.unlocked.add(o.part);
      newGene = o.part;
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

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function fitColor(s) {
  if (s < 0.2) return '#ff5d73';
  if (s < 0.45) return '#ffc45c';
  return '#8fdc6a';
}
