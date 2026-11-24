// Procedural cell drawing in the Deep Glow style, shared by the game view,
// the editor and icons. Everything is drawn in the cell's local frame:
// +x is the front. Glow comes from additive blending and cached sprites,
// not canvas blur, so a few hundred cells stay cheap.

import { PARTS } from './parts.js';
import { TAU } from './util.js';

const GOLDEN = 2.39996;
const spriteCache = new Map();

export function glowColor(hue, l = 62, a = 1) {
  return `hsla(${hue}, 100%, ${l}%, ${a})`;
}

/** Cached soft radial glow for a hue (64 px, drawn scaled). */
export function glowSprite(hue, sat = 100, strength = 1) {
  const key = `${Math.round(hue / 6) * 6}:${sat}:${strength}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `hsla(${hue}, ${sat}%, 70%, ${0.55 * strength})`);
  g.addColorStop(0.35, `hsla(${hue}, ${sat}%, 60%, ${0.22 * strength})`);
  g.addColorStop(1, `hsla(${hue}, ${sat}%, 55%, 0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  spriteCache.set(key, c);
  return c;
}

function sprite(ctx, img, x, y, size) {
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

function membranePath(r, t, phase, wob = 1) {
  const p = new Path2D();
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + wob * 0.035 * Math.sin(3 * a + t * 2.1 + phase) + wob * 0.025 * Math.sin(5 * a - t * 2.9 + phase * 1.3));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

/** Two strokes, one wide and faint, one thin and bright: a cheap glow. */
function glowStroke(ctx, path, hue, width, bright = 70) {
  ctx.strokeStyle = glowColor(hue, 62, 0.22);
  ctx.lineWidth = width * 3.2;
  ctx.stroke(path);
  ctx.strokeStyle = glowColor(hue, bright, 0.95);
  ctx.lineWidth = width;
  ctx.stroke(path);
}

function flagellumPath(a, r, t, thrust, phase) {
  const p = new Path2D();
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const L = r * 2.3;
  const speed = 5 + 13 * thrust;
  const amp = r * 0.3 * (0.35 + 0.65 * Math.min(1, thrust + 0.2));
  const seg = 16;
  for (let i = 0; i <= seg; i++) {
    const s = i / seg;
    const w = Math.sin(s * 8.5 - t * speed + phase) * amp * s;
    const x = dx * r * 0.95 + dx * L * s + px * w;
    const y = dy * r * 0.95 + dy * L * s + py * w;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  return p;
}

function ciliaPath(a, r, t, thrust, phase) {
  const span = PARTS.cilia.arc;
  const n = 8;
  const beat = 0.35 + 0.65 * Math.min(1, thrust + 0.15);
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const th = a - span / 2 + (span * (i + 0.5)) / n;
    const bend = Math.sin(t * 11 + i * 0.9 + phase) * 0.6 * beat;
    const bx = Math.cos(th) * r;
    const by = Math.sin(th) * r;
    const L = r * 0.36;
    p.moveTo(bx, by);
    p.quadraticCurveTo(bx + Math.cos(th) * L * 0.6, by + Math.sin(th) * L * 0.6, bx + Math.cos(th + bend) * L, by + Math.sin(th + bend) * L);
  }
  return p;
}

function local(path, a, tx = 0) {
  const q = new Path2D();
  q.addPath(path, new DOMMatrix().rotateSelf((a * 180) / Math.PI).translateSelf(tx, 0));
  return q;
}

function drawFilter(ctx, a, r, hue, t, phase) {
  const open = new Path2D();
  open.ellipse(0, 0, r * 0.16, r * 0.36, 0, 0, TAU);
  const tent = new Path2D();
  for (let i = 0; i < 5; i++) {
    const y = (i - 2) * r * 0.16;
    const sway = Math.sin(t * 7 + i * 1.3 + phase) * r * 0.12;
    tent.moveTo(r * 0.05, y);
    tent.quadraticCurveTo(r * 0.25, y + sway, r * 0.4, y + sway * 1.6);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(1, 4, 10, 0.75)';
  ctx.fill(local(open, a, r * 0.9));
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  glowStroke(ctx, local(tent, a, r * 0.9), hue, Math.max(0.7, r * 0.045), 78);
}

function drawJaw(ctx, a, r, hue, bite) {
  const open = 0.25 + 0.45 * bite;
  for (const side of [-1, 1]) {
    const m = new Path2D();
    m.moveTo(0, side * r * 0.08);
    m.quadraticCurveTo(r * 0.45, side * r * 0.32, r * 0.62, side * r * 0.02);
    m.quadraticCurveTo(r * 0.38, side * r * 0.12, 0, side * r * 0.24);
    m.closePath();
    const q = new Path2D();
    q.addPath(m, new DOMMatrix().rotateSelf((a * 180) / Math.PI).translateSelf(r * 0.88, 0).rotateSelf((side * open * 180) / Math.PI));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(30, 4, 12, 0.8)';
    ctx.fill(q);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 240, 245, 0.9)';
    ctx.lineWidth = Math.max(0.7, r * 0.045);
    ctx.stroke(q);
    ctx.strokeStyle = glowColor(hue, 62, 0.3);
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.stroke(q);
  }
}

function drawSpike(ctx, a, r, hue) {
  const p = new Path2D();
  p.moveTo(r * 0.92, -r * 0.16);
  p.lineTo(r * 1.75, 0);
  p.lineTo(r * 0.92, r * 0.16);
  p.closePath();
  const q = local(p, a);
  ctx.fillStyle = glowColor(hue, 60, 0.18);
  ctx.fill(q);
  glowStroke(ctx, q, hue, Math.max(0.7, r * 0.05), 80);
}

function drawArmor(ctx, a, r, hue) {
  const span = PARTS.armor.arc;
  for (let i = 0; i < 3; i++) {
    const a0 = a - span / 2 + (span * i) / 3 + 0.04;
    const a1 = a - span / 2 + (span * (i + 1)) / 3 - 0.04;
    const p = new Path2D();
    p.arc(0, 0, r * 1.2, a0, a1);
    p.arc(0, 0, r * 0.99, a1, a0, true);
    p.closePath();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `hsla(${hue}, 60%, 14%, 0.85)`;
    ctx.fill(p);
    ctx.globalCompositeOperation = 'lighter';
    glowStroke(ctx, p, hue, Math.max(0.7, r * 0.04), 72);
  }
}

function drawToxin(ctx, a, r, t, phase) {
  const x = Math.cos(a) * r * 1.05;
  const y = Math.sin(a) * r * 1.05;
  const pulse = 1 + 0.12 * Math.sin(t * 4 + phase);
  sprite(ctx, glowSprite(300), x, y, r * 1.3 * pulse);
  ctx.fillStyle = 'hsla(300, 100%, 70%, 0.85)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.2 * pulse, 0, TAU);
  ctx.fill();
}

/** Eyes look different at each tier so progress is visible on the creature. */
function drawEye(ctx, t, a, r, hue, look) {
  ctx.globalCompositeOperation = 'source-over';
  if (t === 'eyespot') {
    // A spot of pigment: an ember-coloured dot, no pupil.
    const x = Math.cos(a) * r * 0.8;
    const y = Math.sin(a) * r * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    sprite(ctx, glowSprite(18), x, y, r * 0.7);
    ctx.fillStyle = 'hsl(18, 100%, 62%)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.12, 0, TAU);
    ctx.fill();
    return;
  }
  const big = t === 'ocelloid';
  const er = r * (big ? 0.3 : 0.21);
  const x = Math.cos(a) * r * (big ? 0.86 : 0.78);
  const y = Math.sin(a) * r * (big ? 0.86 : 0.78);
  const lx = Math.cos(look) * er * 0.38;
  const ly = Math.sin(look) * er * 0.38;
  ctx.globalCompositeOperation = 'lighter';
  sprite(ctx, glowSprite(big ? 190 : hue, 60), x, y, er * 4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#eafcff';
  ctx.beginPath();
  ctx.arc(x, y, er, 0, TAU);
  ctx.fill();
  if (big) {
    // Iris and lens.
    ctx.fillStyle = 'hsl(185, 90%, 45%)';
    ctx.beginPath();
    ctx.arc(x + lx, y + ly, er * 0.62, 0, TAU);
    ctx.fill();
  } else {
    // The rim of the cup.
    ctx.strokeStyle = `hsla(${hue}, 80%, 35%, 0.9)`;
    ctx.lineWidth = Math.max(0.6, er * 0.25);
    ctx.beginPath();
    ctx.arc(x, y, er * 0.9, a - 1.9, a + 1.9, true);
    ctx.stroke();
  }
  ctx.fillStyle = '#020611';
  ctx.beginPath();
  ctx.arc(x + lx, y + ly, er * (big ? 0.34 : 0.5), 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(x + lx - er * 0.22, y + ly - er * 0.22, er * (big ? 0.18 : 0.14), 0, TAU);
  ctx.fill();
}

const ORG_HUE = { chloroplast: 108, mitochondrion: 18, vacuole: 200, chemosynth: 42, antifreeze: 195, heatshock: 8, pigment: 350, peroxisome: 270, detox: 65 };

export function drawOrganelle(ctx, t, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const h = ORG_HUE[t] ?? 180;
  ctx.fillStyle = `hsl(${h}, 95%, 62%)`;
  ctx.strokeStyle = `hsl(${h}, 100%, 82%)`;
  ctx.lineWidth = Math.max(0.5, s * 0.12);
  ctx.beginPath();
  switch (t) {
    case 'chloroplast':
      ctx.ellipse(0, 0, s, s * 0.55, 0, 0, TAU);
      break;
    case 'mitochondrion':
      ctx.ellipse(0, 0, s, s * 0.45, 0, 0, TAU);
      break;
    case 'vacuole':
      ctx.fillStyle = 'rgba(160, 220, 255, 0.25)';
      ctx.arc(0, 0, s * 0.95, 0, TAU);
      break;
    case 'chemosynth':
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        ctx.moveTo(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.85);
        ctx.ellipse(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4, s * 0.45, s * 0.2, a, 0, TAU);
      }
      break;
    case 'antifreeze':
      ctx.fillStyle = 'transparent';
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(-Math.cos(a) * s * 0.7, -Math.sin(a) * s * 0.7);
        ctx.lineTo(Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7);
      }
      ctx.lineWidth = Math.max(0.6, s * 0.18);
      break;
    case 'heatshock':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        if (i === 0) ctx.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
        else ctx.lineTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
      }
      ctx.closePath();
      break;
    case 'pigment':
      for (let i = 0; i < 5; i++) {
        const px = Math.cos(i * 1.3) * s * 0.5;
        const py = Math.sin(i * 2.1) * s * 0.5;
        ctx.moveTo(px + s * 0.22, py);
        ctx.arc(px, py, s * 0.22, 0, TAU);
      }
      break;
    case 'peroxisome':
      ctx.arc(0, 0, s * 0.5, 0, TAU);
      break;
    case 'detox':
      ctx.moveTo(0, -s * 0.65);
      ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(0, s * 0.65);
      ctx.lineTo(-s * 0.5, 0);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Positions for internal parts, stable per index. */
export function organellePositions(g, r) {
  const internal = g.parts.filter((p) => !PARTS[p.t].ext);
  const n = internal.length;
  return internal.map((p, i) => {
    const rad = r * 0.6 * Math.sqrt((i + 0.7) / (n + 0.7));
    const ang = i * GOLDEN + 0.9;
    return { t: p.t, x: Math.cos(ang) * rad + r * 0.06, y: Math.sin(ang) * rad, rot: ang * 1.7 };
  });
}

/**
 * Draw a cell. `st` carries animation state: heading, thrustLevel, biteAnim,
 * flash, phase, look (world angle the eyes track), x, y.
 * opts.blob draws only a soft glow (what an eyeless viewer makes out at range).
 */
export function drawCell(ctx, g, r, st, t, opts = {}) {
  const hue = g.hue;
  const thrust = st.thrustLevel || 0;
  const phase = st.phase || 0;
  ctx.save();
  ctx.translate(st.x, st.y);
  ctx.rotate(st.heading);
  ctx.globalCompositeOperation = 'lighter';

  if (opts.blob || opts.simple) {
    const pulse = 1 + 0.06 * Math.sin(t * 2 + phase);
    sprite(ctx, glowSprite(hue, opts.blobSat ?? 100), 0, 0, r * 4.2 * pulse);
    ctx.fillStyle = `hsla(${hue}, ${opts.blobSat ?? 100}%, 70%, 0.35)`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }

  sprite(ctx, glowSprite(hue), 0, 0, r * (opts.halo ?? 5));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Back layer: locomotion.
  const lw = Math.max(0.8, r * 0.07);
  for (const p of g.parts) {
    if (p.t === 'flagellum') glowStroke(ctx, flagellumPath(p.a, r, t, thrust, phase + p.a), hue, lw);
    else if (p.t === 'cilia') {
      ctx.strokeStyle = glowColor(hue, 75, 0.75);
      ctx.lineWidth = Math.max(0.5, r * 0.04);
      ctx.stroke(ciliaPath(p.a, r, t, thrust, phase + p.a));
    }
  }
  for (const p of g.parts) if (p.t === 'armor') drawArmor(ctx, p.a, r, hue);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.parts) if (p.t === 'spike') drawSpike(ctx, p.a, r, hue);
  for (const p of g.parts) if (p.t === 'toxin') drawToxin(ctx, p.a, r, t, phase);

  // Body: a dark translucent interior with a glowing rim.
  const body = membranePath(r, t, phase, opts.wobble ?? 1);
  ctx.globalCompositeOperation = 'source-over';
  const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  fill.addColorStop(0, `hsla(${hue}, 80%, 14%, 0.75)`);
  fill.addColorStop(1, `hsla(${hue}, 90%, 26%, 0.6)`);
  ctx.fillStyle = fill;
  ctx.fill(body);
  const c = opts.counts;
  const pigments = c ? c.pigment : g.parts.filter((p) => p.t === 'pigment').length;
  if (pigments) {
    ctx.fillStyle = `rgba(40, 0, 10, ${0.15 * pigments})`;
    ctx.fill(body);
  }
  ctx.globalCompositeOperation = 'lighter';
  const rim = ctx.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
  rim.addColorStop(0, glowColor(hue, 60, 0));
  rim.addColorStop(1, glowColor(hue, 60, 0.35));
  ctx.fillStyle = rim;
  ctx.fill(body);

  // Nucleus.
  const nx = -r * 0.18;
  const nucleus = ctx.createRadialGradient(nx, 0, 0, nx, 0, r * 0.3);
  nucleus.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  nucleus.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = nucleus;
  ctx.beginPath();
  ctx.arc(nx, 0, r * 0.3, 0, TAU);
  ctx.fill();

  // Organelles: glowing dots.
  if (r > 6 || opts.detail) {
    for (const o of organellePositions(g, r)) {
      const wob = Math.sin(t * 0.8 + o.rot) * r * 0.03;
      const s = r * 0.16;
      sprite(ctx, glowSprite(ORG_HUE[o.t] ?? 180), o.x + wob, o.y - wob, s * 4);
      if (r > 10 || opts.detail) {
        ctx.globalCompositeOperation = 'source-over';
        drawOrganelle(ctx, o.t, o.x + wob, o.y - wob, s, o.rot + t * 0.15);
        ctx.globalCompositeOperation = 'lighter';
      }
    }
  }

  // Membrane.
  glowStroke(ctx, body, hue, Math.max(1, r * (0.05 + g.membrane * 0.1)));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = Math.max(0.5, r * 0.025);
  ctx.stroke(body);

  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255, 60, 90, ${st.flash * 0.5})`;
    ctx.fill(body);
  }

  // Front layer.
  for (const p of g.parts) {
    if (p.t === 'filter') drawFilter(ctx, p.a, r, hue, t, phase);
    else if (p.t === 'jaw') drawJaw(ctx, p.a, r, hue, st.biteAnim || 0);
  }
  const look = st.look != null ? st.look - st.heading : 0;
  for (const p of g.parts) if (PARTS[p.t].eye) drawEye(ctx, p.t, p.a, r, hue, look);

  ctx.restore();
}

/** Small standalone icon of a single part, for palettes and cards. */
export function drawPartIcon(ctx, t, size, hue = 172) {
  const r = size * 0.28;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const part = PARTS[t];
  if (part.ext) {
    // Show the part on a slice of membrane, facing right.
    ctx.translate(size * 0.3, size / 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `hsla(${hue}, 80%, 16%, 0.9)`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const ring = new Path2D();
    ring.arc(0, 0, r, 0, TAU);
    glowStroke(ctx, ring, hue, 1.2);
    const time = 0.6;
    ctx.lineCap = 'round';
    if (t === 'flagellum') glowStroke(ctx, flagellumPath(0, r, time, 0.6, 0), hue, 1.4);
    else if (t === 'cilia') {
      ctx.strokeStyle = glowColor(hue, 75, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke(ciliaPath(0, r, time, 0.6, 0));
    } else if (t === 'filter') drawFilter(ctx, 0, r, hue, time, 0);
    else if (t === 'jaw') drawJaw(ctx, 0, r, hue, 0.5);
    else if (t === 'spike') drawSpike(ctx, 0, r, hue);
    else if (t === 'armor') drawArmor(ctx, 0, r, hue);
    else if (t === 'toxin') drawToxin(ctx, 0, r, time, 0);
    else if (part.eye) drawEye(ctx, t, 0, r * 1.5, hue, 0);
  } else {
    ctx.globalCompositeOperation = 'lighter';
    sprite(ctx, glowSprite(ORG_HUE[t] ?? 180), size / 2, size / 2, size);
    ctx.globalCompositeOperation = 'source-over';
    drawOrganelle(ctx, t, size / 2, size / 2, size * 0.3, -0.4);
  }
  ctx.restore();
}
