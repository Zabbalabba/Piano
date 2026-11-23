// World renderer: water, terrain tint, food, clouds, effects, cells, fog.

import { drawCell } from './cellDraw.js';
import { effectiveVision } from './ai.js';
import { TAU, clamp, RNG } from './util.js';

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const C_DEEP = [6, 14, 34];
const C_MID = [14, 52, 72];
const C_SHALLOW = [46, 128, 122];
const C_COLD = [150, 196, 222];
const C_TOX = [150, 146, 40];
const C_HEAT = [210, 92, 40];

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.cam = { x: world.size / 2, y: world.size / 2, zoom: 1 };
    this.userZoom = 1;
    this.bg = document.createElement('canvas');
    this.bgTimer = 0;
    this.time = 0;
    this.motes = [];
    const rng = new RNG(7);
    for (let i = 0; i < 140; i++) {
      this.motes.push({ x: rng.float(0, 1), y: rng.float(0, 1), z: rng.float(0.25, 0.9), s: rng.float(0.6, 1.8) });
    }
    this.texture = this.makeTexture();
    this.buildBackground();
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.w = w;
    this.h = h;
  }

  get scale() {
    // Show roughly 900 world units across the shorter screen side.
    const m = Math.min(this.w, this.h);
    return (m / (m < 600 ? 470 : 720)) * this.cam.zoom;
  }

  makeTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const rng = new RNG(99);
    for (let i = 0; i < 260; i++) {
      const px = rng.float(0, 256);
      const py = rng.float(0, 256);
      const r = rng.float(4, 26);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      const a = rng.float(0.02, 0.07);
      g.addColorStop(0, `rgba(200, 255, 240, ${a})`);
      g.addColorStop(1, 'rgba(200, 255, 240, 0)');
      x.fillStyle = g;
      // Draw wrapped copies so the tile repeats without seams.
      for (const ox of [-256, 0, 256]) {
        for (const oy of [-256, 0, 256]) {
          x.save();
          x.translate(ox, oy);
          x.fillRect(px - r, py - r, r * 2, r * 2);
          x.restore();
        }
      }
    }
    return c;
  }

  buildBackground() {
    const env = this.world.env;
    const n = env.n;
    this.bg.width = n;
    this.bg.height = n;
    const x = this.bg.getContext('2d');
    const img = x.createImageData(n, n);
    const tmp = {};
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const e = env.sample(i * 40, j * 40, tmp);
        let col = e.light > 0.35 ? mix(C_MID, C_SHALLOW, clamp((e.light - 0.35) / 0.65, 0, 1)) : mix(C_DEEP, C_MID, clamp(e.light / 0.35, 0, 1));
        const coldness = clamp((12 - e.temp) / 16, 0, 1);
        col = mix(col, C_COLD, coldness * 0.45);
        col = mix(col, C_TOX, clamp(e.tox - 0.15, 0, 1) * 0.6);
        col = mix(col, C_HEAT, clamp((e.temp - 30) / 18, 0, 1) * 0.6);
        const k = (i + j * n) * 4;
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    // Pre-upscale with smoothing so the water never shows grid blocks.
    if (!this.bgHi) this.bgHi = document.createElement('canvas');
    this.bgHi.width = n * 8;
    this.bgHi.height = n * 8;
    const hx = this.bgHi.getContext('2d');
    hx.imageSmoothingEnabled = true;
    hx.imageSmoothingQuality = 'high';
    hx.filter = 'blur(6px)';
    hx.drawImage(this.bg, -1, -1, n * 8 + 2, n * 8 + 2);
    hx.filter = 'none';
  }

  worldToScreen(wx, wy) {
    const s = this.scale;
    return { x: (wx - this.cam.x) * s + this.w / 2, y: (wy - this.cam.y) * s + this.h / 2 };
  }
  screenToWorld(sx, sy) {
    const s = this.scale;
    return { x: (sx - this.w / 2) / s + this.cam.x, y: (sy - this.h / 2) / s + this.cam.y };
  }

  update(dt) {
    this.time += dt;
    this.bgTimer -= dt;
    if (this.bgTimer <= 0) {
      this.bgTimer = 2;
      this.buildBackground();
    }
    const p = this.world.player;
    if (p) {
      const k = 1 - Math.exp(-dt * 5);
      this.cam.x += (p.x - this.cam.x) * k;
      this.cam.y += (p.y - this.cam.y) * k;
      // Zoom out a little for big cells.
      const target = this.userZoom * clamp(1.15 - (p.r - 13) / 60, 0.6, 1.2);
      this.cam.zoom += (target - this.cam.zoom) * (1 - Math.exp(-dt * 2));
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const s = this.scale;
    const world = this.world;
    const t = this.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#030a12';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-this.cam.x, -this.cam.y);

    const vx0 = this.cam.x - w / 2 / s - 60;
    const vx1 = this.cam.x + w / 2 / s + 60;
    const vy0 = this.cam.y - h / 2 / s - 60;
    const vy1 = this.cam.y + h / 2 / s + 60;
    const inView = (x, y, r = 0) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

    // Water.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.bgHi || this.bg, -20, -20, world.size + 40, world.size + 40);
    if (!this.pattern) this.pattern = ctx.createPattern(this.texture, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(Math.sin(t * 0.05) * 40, t * 3);
    ctx.fillStyle = this.pattern;
    ctx.fillRect(vx0 - 80, vy0 - 80 - t * 3, vx1 - vx0 + 160, vy1 - vy0 + 160);
    ctx.restore();

    // Vents.
    for (const v of world.env.vents.concat(world.env.extraVents)) {
      const st = v.strength ?? 1;
      if (!inView(v.x, v.y, 300) || st <= 0.02) continue;
      const pulse = 1 + 0.06 * Math.sin(t * 1.7 + v.x);
      const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 260 * pulse);
      g.addColorStop(0, `rgba(255, 170, 90, ${0.5 * st})`);
      g.addColorStop(0.25, `rgba(240, 110, 50, ${0.22 * st})`);
      g.addColorStop(1, 'rgba(240, 110, 50, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 260 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(40, 18, 10, ${0.8 * st})`;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 22, 0, TAU);
      ctx.fill();
      // Rising shimmer rings.
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.35 + i / 4) % 1;
        ctx.strokeStyle = `rgba(255, 200, 150, ${(1 - ph) * 0.35 * st})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 24 + ph * 150, 0, TAU);
        ctx.stroke();
      }
    }
    for (const sp of world.env.seeps) {
      if (!inView(sp.x, sp.y, 260)) continue;
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 220);
      g.addColorStop(0, 'rgba(230, 225, 80, 0.28)');
      g.addColorStop(1, 'rgba(230, 225, 80, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 220, 0, TAU);
      ctx.fill();
    }

    // Food.
    for (const f of world.food) {
      if (!inView(f.x, f.y, 8)) continue;
      this.drawFood(ctx, f, t);
    }

    // Toxin clouds.
    for (const cl of world.clouds) {
      if (!inView(cl.x, cl.y, cl.r)) continue;
      const a = 0.45 * (1 - cl.t / cl.life);
      const g = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r);
      g.addColorStop(0, `rgba(190, 90, 255, ${a})`);
      g.addColorStop(0.7, `rgba(150, 60, 220, ${a * 0.6})`);
      g.addColorStop(1, 'rgba(150, 60, 220, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, TAU);
      ctx.fill();
    }

    // Cells, small ones first so big ones sit on top.
    const visible = world.cells.filter((c) => inView(c.x, c.y, c.r * 3));
    visible.sort((a, b) => a.r - b.r);
    const player = world.player;
    const lineage = world.playerSpecies ? world.playerSpecies.id : -1;
    for (const c of visible) {
      const simple = c.r * s < 3;
      if (c.speciesId === lineage && !c.isPlayer) {
        ctx.strokeStyle = 'rgba(255, 236, 170, 0.35)';
        ctx.lineWidth = 1.5 / s;
        ctx.setLineDash([4 / s, 4 / s]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * 1.45, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (c.isPlayer) {
        const g = ctx.createRadialGradient(c.x, c.y, c.r, c.x, c.y, c.r * 2.4);
        g.addColorStop(0, 'rgba(255, 240, 190, 0.18)');
        g.addColorStop(1, 'rgba(255, 240, 190, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * 2.4, 0, TAU);
        ctx.fill();
      }
      let look = c.heading;
      if (c.ai.prey && !c.ai.prey.dead) look = Math.atan2(c.ai.prey.y - c.y, c.ai.prey.x - c.x);
      if (c.isPlayer && this.lookTarget) look = Math.atan2(this.lookTarget.y - c.y, this.lookTarget.x - c.x);
      drawCell(ctx, c.genome, c.r, { x: c.x, y: c.y, heading: c.heading, thrustLevel: c.thrustLevel, biteAnim: c.biteAnim, flash: c.flash, phase: c.phase, look }, t, { simple, counts: c.ph.counts });
    }

    // Effects.
    for (const f of world.fx) {
      if (!inView(f.x, f.y, 60)) continue;
      const k = f.t / (f.life || 0.8);
      if (f.type === 'burst') {
        ctx.strokeStyle = `hsla(${f.hue}, 70%, 75%, ${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 + k * 1.8), 0, TAU);
        ctx.stroke();
      } else if (f.type === 'divide') {
        ctx.strokeStyle = `hsla(${f.hue}, 80%, 85%, ${0.8 * (1 - k)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 10 + k * 50, 0, TAU);
        ctx.stroke();
      } else if (f.type === 'bite') {
        ctx.fillStyle = `rgba(255, 90, 90, ${0.7 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 4 + k * 8, 0, TAU);
        ctx.fill();
      } else if (f.type === 'spark') {
        ctx.strokeStyle = `rgba(255, 250, 220, ${1 - k})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26 + f.x;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * 3, f.y + Math.sin(a) * 3);
          ctx.lineTo(f.x + Math.cos(a) * (5 + k * 12), f.y + Math.sin(a) * (5 + k * 12));
          ctx.stroke();
        }
      } else if (f.type === 'eat') {
        ctx.fillStyle = `rgba(220, 255, 200, ${0.6 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2 + k * 6, 0, TAU);
        ctx.fill();
      }
    }

    // Outside the pond: dark rock.
    ctx.fillStyle = 'rgba(3, 8, 12, 0.92)';
    const S = world.size;
    if (vx0 < 0) ctx.fillRect(vx0, vy0, -vx0, vy1 - vy0);
    if (vx1 > S) ctx.fillRect(S, vy0, vx1 - S, vy1 - vy0);
    if (vy0 < 0) ctx.fillRect(Math.max(0, vx0), vy0, Math.min(S, vx1) - Math.max(0, vx0), -vy0);
    if (vy1 > S) ctx.fillRect(Math.max(0, vx0), S, Math.min(S, vx1) - Math.max(0, vx0), vy1 - S);
    ctx.strokeStyle = 'rgba(160, 220, 230, 0.18)';
    ctx.lineWidth = 3 / s;
    ctx.strokeRect(0, 0, S, S);
    ctx.restore();

    // Parallax motes in screen space.
    for (const m of this.motes) {
      const px = (((m.x * w - this.cam.x * s * m.z * 0.3) % w) + w) % w;
      const py = (((m.y * h - this.cam.y * s * m.z * 0.3 + t * 6 * m.z) % h) + h) % h;
      ctx.fillStyle = `rgba(200, 240, 230, ${0.08 + 0.12 * m.z})`;
      ctx.beginPath();
      ctx.arc(px, py, m.s * m.z * 1.5, 0, TAU);
      ctx.fill();
    }

    // Vision fog around the player.
    if (player) {
      const p = this.worldToScreen(player.x, player.y);
      const vr = effectiveVision(player) * s;
      const outer = Math.max(w, h) * 1.2;
      const g = ctx.createRadialGradient(p.x, p.y, vr * 0.7, p.x, p.y, Math.max(vr * 1.25, vr + 40));
      g.addColorStop(0, 'rgba(2, 6, 12, 0)');
      g.addColorStop(1, 'rgba(2, 6, 12, 0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - outer, p.y - outer, outer * 2, outer * 2);
    }
  }

  drawFood(ctx, f, t) {
    const fade = f.age > f.life - 5 ? Math.max(0, (f.life - f.age) / 5) : 1;
    ctx.globalAlpha = fade;
    if (f.kind === 'algae') {
      ctx.fillStyle = '#5fcf6a';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b6f5a8';
      ctx.beginPath();
      ctx.arc(f.x - f.r * 0.3, f.y - f.r * 0.3, f.r * 0.4, 0, TAU);
      ctx.fill();
    } else if (f.kind === 'bacteria') {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.fillStyle = '#f1a64a';
      ctx.beginPath();
      ctx.ellipse(0, 0, f.r * 1.4, f.r * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (f.kind === 'detritus') {
      ctx.fillStyle = 'rgba(196, 180, 150, 0.75)';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.fillStyle = '#e8687a';
      ctx.beginPath();
      ctx.ellipse(0, 0, f.r * 1.2, f.r * 0.85, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffb3bd';
      ctx.beginPath();
      ctx.arc(-f.r * 0.3, -f.r * 0.2, f.r * 0.35, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawMinimap(mm) {
    const ctx = mm.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = mm.clientWidth;
    if (mm.width !== Math.round(size * dpr)) {
      mm.width = Math.round(size * dpr);
      mm.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = size / this.world.size;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bg, 0, 0, size, size);
    const world = this.world;
    for (const v of world.env.vents.concat(world.env.extraVents)) {
      if ((v.strength ?? 1) < 0.05) continue;
      ctx.fillStyle = '#ffb070';
      ctx.beginPath();
      ctx.arc(v.x * k, v.y * k, 3, 0, TAU);
      ctx.fill();
    }
    const lin = world.playerSpecies ? world.playerSpecies.id : -1;
    ctx.fillStyle = 'rgba(255, 230, 150, 0.9)';
    for (const c of world.cells) {
      if (c.speciesId !== lin || c.isPlayer) continue;
      ctx.fillRect(c.x * k - 1, c.y * k - 1, 2, 2);
    }
    const p = world.player;
    if (p) {
      // View rectangle.
      const s = this.scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect((this.cam.x - this.w / 2 / s) * k, (this.cam.y - this.h / 2 / s) * k, (this.w / s) * k, (this.h / s) * k);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x * k, p.y * k, 3, 0, TAU);
      ctx.fill();
    }
  }
}
