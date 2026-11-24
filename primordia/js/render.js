// World renderer in the Deep Glow style. The water darkens with depth, life
// glows, and darkness is shaped by what the player's cell can actually see
// (js/vision.js): eyes push it back where they face, and better eyes reveal
// more about what is in view.

import { drawCell, glowSprite } from './cellDraw.js';
import { sightOutline, canSee, glimpseRange, maxRange } from './vision.js';
import { TAU, clamp, RNG } from './util.js';

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const C_ABYSS = [2, 6, 17];
const C_TWILIGHT = [6, 24, 50];
const C_SHALLOW = [12, 58, 86];
const C_COLD = [34, 70, 104];
const C_TOX = [44, 48, 8];
const C_HEAT = [78, 24, 8];

const FOOD_GLOW = { algae: [108, 100, 9], bacteria: [38, 100, 9], detritus: [205, 45, 6], meat: [345, 100, 11] };

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.cam = { x: world.size / 2, y: world.size / 2, zoom: 1 };
    this.userZoom = 1;
    this.bg = document.createElement('canvas');
    this.fog = document.createElement('canvas');
    this.bgTimer = 0;
    this.time = 0;
    this.motes = [];
    const rng = new RNG(7);
    for (let i = 0; i < 90; i++) {
      this.motes.push({ x: rng.float(0, 1), y: rng.float(0, 1), z: rng.float(0.25, 0.9), s: rng.float(0.6, 1.8) });
    }
    this.shafts = [];
    for (let i = 0; i < 4; i++) this.shafts.push({ x: rng.float(-0.3, 1.1), w: rng.float(0.04, 0.12), s: rng.float(0.6, 1.4) });
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
    // Quarter resolution: cheap, and the upscale softens the edge for free.
    this.fog.width = Math.max(1, Math.round(w / 4));
    this.fog.height = Math.max(1, Math.round(h / 4));
  }

  get scale() {
    const m = Math.min(this.w, this.h);
    return (m / (m < 600 ? 470 : 720)) * this.cam.zoom;
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
        let col = e.light > 0.3 ? mix(C_TWILIGHT, C_SHALLOW, clamp((e.light - 0.3) / 0.7, 0, 1)) : mix(C_ABYSS, C_TWILIGHT, clamp(e.light / 0.3, 0, 1));
        col = mix(col, C_COLD, clamp((12 - e.temp) / 16, 0, 1) * 0.5);
        col = mix(col, C_TOX, clamp(e.tox - 0.15, 0, 1) * 0.7);
        col = mix(col, C_HEAT, clamp((e.temp - 30) / 18, 0, 1) * 0.7);
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
      // Zoom out a little for big cells and for long sight.
      const sightK = clamp(1.12 - (maxRange(p) - 220) / 900, 0.8, 1.12);
      const target = this.userZoom * clamp(1.15 - (p.r - 13) / 60, 0.6, 1.2) * sightK;
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
    const player = world.player;
    const clarity = player ? player.ph.sight.clarity : 3;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#01030a';
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

    ctx.globalCompositeOperation = 'lighter';
    // Vents: ember glow with rising sparks.
    for (const v of world.env.vents.concat(world.env.extraVents)) {
      const st = v.strength ?? 1;
      if (!inView(v.x, v.y, 320) || st <= 0.02) continue;
      const pulse = 1 + 0.06 * Math.sin(t * 1.7 + v.x);
      const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 280 * pulse);
      g.addColorStop(0, `rgba(255, 130, 60, ${0.55 * st})`);
      g.addColorStop(0.3, `rgba(255, 60, 70, ${0.16 * st})`);
      g.addColorStop(1, 'rgba(255, 60, 70, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 280 * pulse, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 26; i++) {
        const seed = i * 12.9898 + v.x;
        const life = (t * (0.18 + (i % 5) * 0.04) + (Math.sin(seed) * 0.5 + 0.5)) % 1;
        const a = Math.sin(seed * 3.1) * Math.PI;
        const d = 20 + life * 190;
        const x = v.x + Math.cos(a) * d * 0.6 + Math.sin(t + i) * 6;
        const y = v.y + Math.sin(a) * d * 0.6 - life * 60;
        ctx.fillStyle = `rgba(255, ${150 + (i % 4) * 25}, 80, ${(1 - life) * 0.8 * st})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + (i % 3) * 0.6, 0, TAU);
        ctx.fill();
      }
    }
    for (const sp of world.env.seeps) {
      if (!inView(sp.x, sp.y, 260)) continue;
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 230);
      g.addColorStop(0, 'rgba(200, 230, 60, 0.22)');
      g.addColorStop(1, 'rgba(200, 230, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 230, 0, TAU);
      ctx.fill();
    }

    // Food: small glowing motes.
    const foodGlow = s > 0.7;
    for (const f of world.food) {
      if (!inView(f.x, f.y, 10)) continue;
      const [hue, sat, size] = FOOD_GLOW[f.kind];
      const fade = f.age > f.life - 5 ? Math.max(0, (f.life - f.age) / 5) : 1;
      ctx.globalAlpha = fade;
      if (foodGlow && f.kind !== 'detritus') {
        const tw = 1 + 0.15 * Math.sin(t * 3 + f.rot * 10);
        ctx.drawImage(glowSprite(hue, sat), f.x - size * tw, f.y - size * tw, size * 2 * tw, size * 2 * tw);
      }
      ctx.fillStyle = `hsla(${hue}, ${sat}%, 78%, ${f.kind === 'detritus' ? 0.5 : 0.95})`;
      ctx.fillRect(f.x - 1, f.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Toxin clouds.
    for (const cl of world.clouds) {
      if (!inView(cl.x, cl.y, cl.r)) continue;
      const a = 0.5 * (1 - cl.t / cl.life);
      const g = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r);
      g.addColorStop(0, `rgba(255, 70, 230, ${a})`);
      g.addColorStop(0.7, `rgba(170, 40, 255, ${a * 0.5})`);
      g.addColorStop(1, 'rgba(170, 40, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, TAU);
      ctx.fill();
    }

    // Cells. What the player can't see is left for the glimpse pass.
    const lineage = world.playerSpecies ? world.playerSpecies.id : -1;
    const seen = [];
    const glimpsed = [];
    const glimpseR = player ? glimpseRange(player) : 0;
    const detailR = player ? 60 + player.r * 2.5 : Infinity;
    for (const c of world.cells) {
      if (!inView(c.x, c.y, c.r * 3)) continue;
      if (player && c !== player && c.speciesId !== lineage && !canSee(player, c.x, c.y)) {
        const d = Math.hypot(c.x - player.x, c.y - player.y);
        if (d < glimpseR) glimpsed.push({ c, d });
        continue;
      }
      seen.push(c);
    }
    seen.sort((a, b) => a.r - b.r);
    for (const c of seen) {
      ctx.globalCompositeOperation = 'source-over';
      const simple = c.r * s < 3;
      const d = player ? Math.hypot(c.x - player.x, c.y - player.y) : 0;
      const blob = clarity === 0 && c !== player && c.speciesId !== lineage && d > detailR;
      if (c.speciesId === lineage && !c.isPlayer) {
        ctx.strokeStyle = 'rgba(61, 255, 226, 0.4)';
        ctx.lineWidth = 1.5 / s;
        ctx.setLineDash([4 / s, 5 / s]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * 1.5, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      let look = c.heading;
      if (c.ai.prey && !c.ai.prey.dead) look = Math.atan2(c.ai.prey.y - c.y, c.ai.prey.x - c.x);
      if (c.isPlayer && this.lookTarget) look = Math.atan2(this.lookTarget.y - c.y, this.lookTarget.x - c.x);
      drawCell(ctx, c.genome, c.r, { x: c.x, y: c.y, heading: c.heading, thrustLevel: c.thrustLevel, biteAnim: c.biteAnim, flash: c.flash, phase: c.phase, look }, t, {
        simple,
        blob,
        blobSat: 25,
        counts: c.ph.counts,
        halo: c.isPlayer ? 6.5 : 5,
      });
      // Eye cups and better let you tell threats from prey.
      if (player && clarity >= 2 && c !== player && c.speciesId !== lineage && d < 420) {
        const danger = c.ph.bite > 0 && c.r > player.r * 0.55;
        const edible = !danger && player.ph.bite > 0 && c.r < player.r * 1.25;
        if (danger || edible) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = danger ? 'rgba(255, 61, 93, 0.75)' : 'rgba(106, 255, 61, 0.6)';
          ctx.lineWidth = (danger ? 2 : 1.5) / s;
          if (!danger) ctx.setLineDash([3 / s, 4 / s]);
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r * 1.9 + Math.sin(t * 4) * 1.5, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Effects.
    ctx.globalCompositeOperation = 'lighter';
    for (const f of world.fx) {
      if (!inView(f.x, f.y, 60)) continue;
      const k = f.t / (f.life || 0.8);
      if (f.type === 'burst') {
        ctx.strokeStyle = `hsla(${f.hue}, 100%, 70%, ${1 - k})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 + k * 2), 0, TAU);
        ctx.stroke();
        ctx.drawImage(glowSprite(f.hue), f.x - f.r * 3, f.y - f.r * 3, f.r * 6, f.r * 6);
      } else if (f.type === 'divide') {
        ctx.strokeStyle = `hsla(${f.hue}, 100%, 80%, ${0.9 * (1 - k)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 10 + k * 60, 0, TAU);
        ctx.stroke();
      } else if (f.type === 'bite') {
        ctx.fillStyle = `rgba(255, 60, 90, ${0.8 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 4 + k * 9, 0, TAU);
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
        ctx.fillStyle = `rgba(200, 255, 220, ${0.7 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2 + k * 7, 0, TAU);
        ctx.fill();
      }
    }

    // Outside the pond: dark rock.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(1, 2, 6, 0.95)';
    const S = world.size;
    if (vx0 < 0) ctx.fillRect(vx0, vy0, -vx0, vy1 - vy0);
    if (vx1 > S) ctx.fillRect(S, vy0, vx1 - S, vy1 - vy0);
    if (vy0 < 0) ctx.fillRect(Math.max(0, vx0), vy0, Math.min(S, vx1) - Math.max(0, vx0), -vy0);
    if (vy1 > S) ctx.fillRect(Math.max(0, vx0), S, Math.min(S, vx1) - Math.max(0, vx0), vy1 - S);
    ctx.restore();

    // Light shafts in sunlit water.
    const lightHere = player ? player.env.light ?? 0 : 0.6;
    if (lightHere > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const sh of this.shafts) {
        const x = ((sh.x + Math.sin(t * 0.05 * sh.s) * 0.05 - this.cam.x / 6000) % 1.4) * w;
        const g = ctx.createLinearGradient(x, 0, x + w * 0.25, h);
        const a = 0.07 * clamp((lightHere - 0.15) / 0.7, 0, 1);
        g.addColorStop(0, `rgba(150, 220, 255, ${a})`);
        g.addColorStop(1, 'rgba(150, 220, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + w * sh.w, 0);
        ctx.lineTo(x + w * sh.w + w * 0.3, h);
        ctx.lineTo(x + w * 0.3, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Drifting marine snow.
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const px = (((m.x * w - this.cam.x * s * m.z * 0.3) % w) + w) % w;
      const py = (((m.y * h - this.cam.y * s * m.z * 0.3 + t * 6 * m.z) % h) + h) % h;
      ctx.fillStyle = `rgba(140, 200, 255, ${0.05 + 0.12 * m.z})`;
      ctx.beginPath();
      ctx.arc(px, py, m.s * m.z * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (player) {
      this.drawDarkness(ctx, player, s);
      this.drawGlimpses(ctx, glimpsed, player, clarity, s, t);
      if (clarity >= 3) {
        this.drawTags(ctx, seen, player, lineage, s);
        this.drawThreatArrows(ctx, player, lineage, s, t);
      }
    } else {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(1, 3, 10, 0)');
      g.addColorStop(1, 'rgba(1, 3, 10, 0.75)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** Darkness everywhere except the shape of what the player can see. */
  drawDarkness(ctx, player, s) {
    const fog = this.fog;
    const f = fog.getContext('2d');
    const k = fog.width / this.w;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, fog.width, fog.height);
    f.fillStyle = 'rgba(1, 3, 10, 0.9)';
    f.fillRect(0, 0, fog.width, fog.height);
    f.globalCompositeOperation = 'destination-out';
    const outline = sightOutline(player, 72);
    const c = this.worldToScreen(player.x, player.y);
    // Nested copies of the outline give the edge a soft falloff.
    for (const [scale, alpha] of [[1.18, 0.12], [1.12, 0.16], [1.06, 0.2], [1.0, 0.26], [0.94, 0.34], [0.88, 0.5], [0.82, 1]]) {
      f.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      f.beginPath();
      outline.forEach(([wx, wy], i) => {
        const sx = (c.x + (wx - player.x) * s * scale) * k;
        const sy = (c.y + (wy - player.y) * s * scale) * k;
        if (i === 0) f.moveTo(sx, sy);
        else f.lineTo(sx, sy);
      });
      f.closePath();
      f.fill();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fog, 0, 0, this.w, this.h);
  }

  /** Bioluminescent cells shine through the dark; better eyes show their colour. */
  drawGlimpses(ctx, list, player, clarity, s, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = glimpseRange(player);
    for (const { c, d } of list) {
      const p = this.worldToScreen(c.x, c.y);
      if (p.x < -40 || p.y < -40 || p.x > this.w + 40 || p.y > this.h + 40) continue;
      const fade = clamp(1 - d / gr, 0.15, 1);
      const size = c.r * s * 3.6 * (1 + 0.08 * Math.sin(t * 2 + c.phase));
      ctx.globalAlpha = fade;
      ctx.drawImage(glowSprite(c.genome.hue, clarity >= 1 ? 85 : 15), p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.restore();
  }

  drawTags(ctx, seen, player, lineage, s) {
    const near = seen
      .filter((c) => c !== player && c.speciesId !== lineage)
      .map((c) => ({ c, d: Math.hypot(c.x - player.x, c.y - player.y) }))
      .filter((o) => o.d < 300)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    ctx.save();
    ctx.font = '600 11px Manrope, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (const { c } of near) {
      const sp = this.world.species.get(c.speciesId);
      if (!sp) continue;
      const p = this.worldToScreen(c.x, c.y + c.r * 2.2);
      const danger = c.ph.bite > 0 && c.r > player.r * 0.55;
      ctx.fillStyle = 'rgba(2, 6, 17, 0.7)';
      const tw = ctx.measureText(sp.name).width + 10;
      ctx.fillRect(p.x - tw / 2, p.y + 2, tw, 16);
      ctx.fillStyle = danger ? '#ff8aa0' : `hsl(${c.genome.hue}, 100%, 78%)`;
      ctx.fillText(sp.name, p.x, p.y + 14);
    }
    ctx.restore();
  }

  /** Ocelloids spot hunters before they come into view. */
  drawThreatArrows(ctx, player, lineage, s, t) {
    const range = glimpseRange(player) * 1.3;
    const m = 34;
    for (const c of this.world.cells) {
      if (c.speciesId === lineage || c.ph.bite <= 0 || c.r < player.r * 0.55) continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d > range) continue;
      const p = this.worldToScreen(c.x, c.y);
      if (p.x > 0 && p.y > 0 && p.x < this.w && p.y < this.h) continue;
      const cx = this.w / 2;
      const cy = this.h / 2;
      const a = Math.atan2(p.y - cy, p.x - cx);
      const k = Math.min((cx - m) / Math.abs(Math.cos(a) || 1e-6), (cy - m) / Math.abs(Math.sin(a) || 1e-6));
      const x = cx + Math.cos(a) * k;
      const y = cy + Math.sin(a) * k;
      const hunting = c.ai.prey === player;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = hunting ? 0.75 + 0.25 * Math.sin(t * 8) : 0.55;
      ctx.fillStyle = '#ff3d5d';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -9);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-6, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
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
    ctx.filter = 'brightness(2.4)';
    ctx.drawImage(this.bg, 0, 0, size, size);
    ctx.filter = 'none';
    const world = this.world;
    for (const v of world.env.vents.concat(world.env.extraVents)) {
      if ((v.strength ?? 1) < 0.05) continue;
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.arc(v.x * k, v.y * k, 3, 0, TAU);
      ctx.fill();
    }
    const lin = world.playerSpecies ? world.playerSpecies.id : -1;
    ctx.fillStyle = 'rgba(61, 255, 226, 0.9)';
    for (const c of world.cells) {
      if (c.speciesId !== lin || c.isPlayer) continue;
      ctx.fillRect(c.x * k - 1, c.y * k - 1, 2, 2);
    }
    const p = world.player;
    if (p) {
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
