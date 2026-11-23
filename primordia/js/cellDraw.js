// Procedural cell drawing, shared by the game view, the editor and icons.
// Everything is drawn in the cell's local frame: +x is the front.

import { PARTS } from './parts.js';
import { TAU } from './util.js';

const GOLDEN = 2.39996;

function membranePath(ctx, r, t, phase, wob = 1) {
  const n = 30;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr =
      r *
      (1 +
        wob * 0.035 * Math.sin(3 * a + t * 2.1 + phase) +
        wob * 0.025 * Math.sin(5 * a - t * 2.9 + phase * 1.3));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawFlagellum(ctx, a, r, hue, t, thrust, phase) {
  const bx = Math.cos(a) * r * 0.95;
  const by = Math.sin(a) * r * 0.95;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const L = r * 2.3;
  const speed = 5 + 13 * thrust;
  const amp = r * 0.3 * (0.35 + 0.65 * Math.min(1, thrust + 0.2));
  const seg = 14;
  let lx = bx;
  let ly = by;
  ctx.strokeStyle = `hsla(${hue}, 45%, 78%, 0.85)`;
  ctx.lineCap = 'round';
  for (let i = 1; i <= seg; i++) {
    const s = i / seg;
    const w = Math.sin(s * 8.5 - t * speed + phase) * amp * s;
    const x = bx + dx * L * s + px * w;
    const y = by + dy * L * s + py * w;
    ctx.lineWidth = Math.max(0.6, r * 0.13 * (1 - s * 0.75));
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(x, y);
    ctx.stroke();
    lx = x;
    ly = y;
  }
}

function drawCilia(ctx, a, r, hue, t, thrust, phase) {
  const span = PARTS.cilia.arc;
  const n = 8;
  ctx.strokeStyle = `hsla(${hue}, 40%, 82%, 0.8)`;
  ctx.lineWidth = Math.max(0.5, r * 0.045);
  ctx.lineCap = 'round';
  const beat = 0.35 + 0.65 * Math.min(1, thrust + 0.15);
  for (let i = 0; i < n; i++) {
    const th = a - span / 2 + (span * (i + 0.5)) / n;
    const bend = Math.sin(t * 11 + i * 0.9 + phase) * 0.6 * beat;
    const bx = Math.cos(th) * r;
    const by = Math.sin(th) * r;
    const L = r * 0.34;
    const ta = th + bend;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(
      bx + Math.cos(th) * L * 0.6,
      by + Math.sin(th) * L * 0.6,
      bx + Math.cos(ta) * L,
      by + Math.sin(ta) * L
    );
    ctx.stroke();
  }
}

function drawFilter(ctx, a, r, hue, t, phase) {
  ctx.save();
  ctx.rotate(a);
  ctx.translate(r * 0.9, 0);
  ctx.fillStyle = 'rgba(8, 18, 24, 0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.16, r * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue}, 50%, 85%, 0.75)`;
  ctx.lineWidth = Math.max(0.5, r * 0.05);
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const y = (i - 2) * r * 0.16;
    const sway = Math.sin(t * 7 + i * 1.3 + phase) * r * 0.12;
    ctx.beginPath();
    ctx.moveTo(r * 0.05, y);
    ctx.quadraticCurveTo(r * 0.25, y + sway, r * 0.38, y + sway * 1.6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawJaw(ctx, a, r, bite) {
  ctx.save();
  ctx.rotate(a);
  ctx.translate(r * 0.88, 0);
  const open = 0.25 + 0.45 * bite;
  ctx.fillStyle = 'hsl(35, 30%, 86%)';
  ctx.strokeStyle = 'hsl(20, 25%, 30%)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * open);
    ctx.beginPath();
    ctx.moveTo(0, side * r * 0.08);
    ctx.quadraticCurveTo(r * 0.45, side * r * 0.32, r * 0.62, side * r * 0.02);
    ctx.quadraticCurveTo(r * 0.38, side * r * 0.12, 0, side * r * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(40, 5, 10, 0.55)';
  ctx.beginPath();
  ctx.ellipse(r * 0.02, 0, r * 0.1, r * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSpike(ctx, a, r) {
  ctx.save();
  ctx.rotate(a);
  ctx.fillStyle = 'hsl(48, 35%, 88%)';
  ctx.strokeStyle = 'hsl(40, 20%, 45%)';
  ctx.lineWidth = Math.max(0.5, r * 0.035);
  ctx.beginPath();
  ctx.moveTo(r * 0.92, -r * 0.16);
  ctx.lineTo(r * 1.75, 0);
  ctx.lineTo(r * 0.92, r * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawArmor(ctx, a, r, hue) {
  const span = PARTS.armor.arc;
  const segs = 3;
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  for (let i = 0; i < segs; i++) {
    const a0 = a - span / 2 + (span * i) / segs + 0.03;
    const a1 = a - span / 2 + (span * (i + 1)) / segs - 0.03;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.2, a0, a1);
    ctx.arc(0, 0, r * 0.98, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = `hsl(${hue}, 18%, 42%)`;
    ctx.strokeStyle = `hsl(${hue}, 25%, 72%)`;
    ctx.fill();
    ctx.stroke();
  }
}

function drawToxin(ctx, a, r, t, phase) {
  ctx.save();
  ctx.rotate(a);
  ctx.translate(r * 1.05, 0);
  const pulse = 1 + 0.08 * Math.sin(t * 4 + phase);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
  g.addColorStop(0, 'rgba(210, 120, 255, 0.55)');
  g.addColorStop(1, 'rgba(210, 120, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'hsl(285, 65%, 52%)';
  ctx.strokeStyle = 'hsl(285, 70%, 80%)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24 * pulse, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawEye(ctx, a, r, look) {
  const x = Math.cos(a) * r * 0.78;
  const y = Math.sin(a) * r * 0.78;
  const er = r * 0.2;
  ctx.fillStyle = 'rgba(245, 250, 240, 0.95)';
  ctx.strokeStyle = 'rgba(20, 30, 30, 0.6)';
  ctx.lineWidth = Math.max(0.4, r * 0.03);
  ctx.beginPath();
  ctx.arc(x, y, er, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const lx = Math.cos(look) * er * 0.4;
  const ly = Math.sin(look) * er * 0.4;
  ctx.fillStyle = '#10161a';
  ctx.beginPath();
  ctx.arc(x + lx, y + ly, er * 0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(x + lx - er * 0.18, y + ly - er * 0.18, er * 0.16, 0, TAU);
  ctx.fill();
}

export function drawOrganelle(ctx, t, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  switch (t) {
    case 'chloroplast':
      ctx.fillStyle = '#62c24c';
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2d6f27';
      ctx.lineWidth = Math.max(0.4, s * 0.12);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, i * s * 0.22);
        ctx.lineTo(s * 0.6, i * s * 0.22);
        ctx.stroke();
      }
      break;
    case 'mitochondrion':
      ctx.fillStyle = '#e57a48';
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.48, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#8c3216';
      ctx.lineWidth = Math.max(0.4, s * 0.11);
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const xx = -s * 0.7 + (i / 6) * s * 1.4;
        const yy = (i % 2 ? 1 : -1) * s * 0.25;
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      break;
    case 'vacuole':
      ctx.fillStyle = 'rgba(190, 232, 255, 0.32)';
      ctx.strokeStyle = 'rgba(225, 246, 255, 0.7)';
      ctx.lineWidth = Math.max(0.4, s * 0.08);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.95, 0, TAU);
      ctx.fill();
      ctx.stroke();
      break;
    case 'chemosynth':
      ctx.fillStyle = '#f0b53c';
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i * TAU) / 3);
        ctx.translate(s * 0.4, 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.45, s * 0.2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'antifreeze':
      ctx.strokeStyle = '#d2f1ff';
      ctx.lineWidth = Math.max(0.5, s * 0.16);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, 0);
        ctx.lineTo(s * 0.7, 0);
        ctx.stroke();
      }
      break;
    case 'heatshock':
      ctx.fillStyle = '#ff7b54';
      ctx.strokeStyle = '#ffd0b8';
      ctx.lineWidth = Math.max(0.4, s * 0.08);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const xx = Math.cos(a) * s * 0.6;
        const yy = Math.sin(a) * s * 0.6;
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'pigment':
      ctx.fillStyle = '#8a2f1c';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(Math.cos(i * 1.3) * s * 0.5, Math.sin(i * 2.1) * s * 0.5, s * 0.22, 0, TAU);
        ctx.fill();
      }
      break;
    case 'peroxisome':
      ctx.fillStyle = '#b892ff';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4b2a8a';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.2, 0, TAU);
      ctx.fill();
      break;
    case 'detox':
      ctx.fillStyle = '#cfdc4c';
      ctx.strokeStyle = '#59611a';
      ctx.lineWidth = Math.max(0.4, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.65);
      ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(0, s * 0.65);
      ctx.lineTo(-s * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
  }
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
 */
export function drawCell(ctx, g, r, st, t, opts = {}) {
  const hue = g.hue;
  const thrust = st.thrustLevel || 0;
  const phase = st.phase || 0;
  ctx.save();
  ctx.translate(st.x, st.y);
  ctx.rotate(st.heading);

  if (opts.simple) {
    ctx.fillStyle = `hsla(${hue}, 55%, 55%, 0.9)`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Back layer: locomotion.
  for (const p of g.parts) {
    if (p.t === 'flagellum') drawFlagellum(ctx, p.a, r, hue, t, thrust, phase + p.a);
    else if (p.t === 'cilia') drawCilia(ctx, p.a, r, hue, t, thrust, phase + p.a);
  }
  for (const p of g.parts) if (p.t === 'armor') drawArmor(ctx, p.a, r, hue);
  for (const p of g.parts) if (p.t === 'spike') drawSpike(ctx, p.a, r);
  for (const p of g.parts) if (p.t === 'toxin') drawToxin(ctx, p.a, r, t, phase);

  // Body.
  membranePath(ctx, r, t, phase, opts.wobble ?? 1);
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
  grad.addColorStop(0, `hsla(${hue}, 65%, 70%, 0.92)`);
  grad.addColorStop(0.7, `hsla(${hue}, 55%, 48%, 0.88)`);
  grad.addColorStop(1, `hsla(${hue}, 60%, 32%, 0.9)`);
  ctx.fillStyle = grad;
  ctx.fill();

  const c = opts.counts;
  const pigments = c ? c.pigment : g.parts.filter((p) => p.t === 'pigment').length;
  if (pigments) {
    ctx.fillStyle = `rgba(110, 40, 20, ${0.12 * pigments})`;
    ctx.fill();
  }

  // Nucleus.
  ctx.fillStyle = `hsla(${(hue + 30) % 360}, 35%, 28%, 0.55)`;
  ctx.beginPath();
  ctx.arc(-r * 0.18, r * 0.02, r * 0.27, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `hsla(${(hue + 30) % 360}, 40%, 18%, 0.7)`;
  ctx.beginPath();
  ctx.arc(-r * 0.22, r * 0.05, r * 0.09, 0, TAU);
  ctx.fill();

  // Organelles.
  if (r > 7 || opts.detail) {
    for (const o of organellePositions(g, r)) {
      const wob = Math.sin(t * 0.8 + o.rot) * r * 0.03;
      drawOrganelle(ctx, o.t, o.x + wob, o.y - wob, r * 0.17, o.rot + t * 0.15);
    }
  }

  // Membrane outline.
  membranePath(ctx, r, t, phase, opts.wobble ?? 1);
  ctx.lineWidth = Math.max(0.8, r * (0.06 + g.membrane * 0.14));
  ctx.strokeStyle = `hsla(${hue}, 65%, 82%, 0.75)`;
  ctx.stroke();

  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255, 70, 70, ${st.flash * 0.45})`;
    ctx.fill();
  }

  // Front layer.
  for (const p of g.parts) {
    if (p.t === 'filter') drawFilter(ctx, p.a, r, hue, t, phase);
    else if (p.t === 'jaw') drawJaw(ctx, p.a, r, st.biteAnim || 0);
  }
  const look = st.look != null ? st.look - st.heading : 0;
  for (const p of g.parts) if (p.t === 'eyespot') drawEye(ctx, p.a, r, look);

  ctx.restore();
}

/** Small standalone icon of a single part, for palettes and cards. */
export function drawPartIcon(ctx, t, size, hue = 175) {
  const r = size * 0.28;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const part = PARTS[t];
  if (part.ext) {
    // Show the part on a slice of membrane, facing right.
    ctx.translate(size * 0.3, size / 2);
    ctx.fillStyle = `hsla(${hue}, 50%, 45%, 0.9)`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 60%, 80%, 0.8)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const time = 0.6;
    if (t === 'flagellum') drawFlagellum(ctx, 0, r, hue, time, 0.6, 0);
    else if (t === 'cilia') drawCilia(ctx, 0, r, hue, time, 0.6, 0);
    else if (t === 'filter') drawFilter(ctx, 0, r, hue, time, 0);
    else if (t === 'jaw') drawJaw(ctx, 0, r, 0.5);
    else if (t === 'spike') drawSpike(ctx, 0, r);
    else if (t === 'armor') drawArmor(ctx, 0, r, hue);
    else if (t === 'toxin') drawToxin(ctx, 0, r, time, 0);
    else if (t === 'eyespot') drawEye(ctx, 0, r * 1.5, 0);
  } else {
    drawOrganelle(ctx, t, size / 2, size / 2, size * 0.3, -0.4);
  }
  ctx.restore();
}
