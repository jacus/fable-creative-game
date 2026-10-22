'use strict';
/* Smocza Poczta / Dragon Mail – a 2.5D dreamy flying game. Everything is drawn in code: no images, no libraries.
   Rendering pipeline: parallax layers (sky → sun & rays → far mountains → far clouds → back islands → world → front clouds)
   plus a separate low-resolution "glow" buffer for emissive things that is upscaled over the frame (cheap soft bloom). */

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const TAU = Math.PI * 2;
function mulberry(seed) { return function () { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shade = (c, k) => c.map(v => clamp(v * k, 0, 255));
const emoji = (ctx, e, x, y, size) => { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y); };
const isTouch = matchMedia('(pointer:coarse)').matches;
// roundRect polyfill (older iPads / WebViews / Firefox < 112 have no CanvasRenderingContext2D.roundRect)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Array.isArray(r) ? r : [r, r, r, r]; const [tl, tr, br, bl] = rr.length === 4 ? rr : [rr[0], rr[0], rr[0], rr[0]];
    this.moveTo(x + tl, y); this.lineTo(x + w - tr, y); this.arcTo(x + w, y, x + w, y + tr, tr); this.lineTo(x + w, y + h - br); this.arcTo(x + w, y + h, x + w - br, y + h, br);
    this.lineTo(x + bl, y + h); this.arcTo(x, y + h, x, y + h - bl, bl); this.lineTo(x, y + tl); this.arcTo(x, y, x + tl, y, tl); this.closePath();
  };
}

// ---------- canvas & sizing ----------
// Logical world height is always 720. Width follows the screen. In portrait the logical viewport is taller than
// the world (VH > 720) and the world band is centred (OY), with sky above and cloud sea below: nothing is ever squashed.
const cv = $('#game');
const ctx = cv.getContext('2d');
const H = 720; let W = 1280, VH = 720, OY = 0, DPR = 1, scale = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vh / H, vw / 820); // landscape: fit height; portrait: fit width (≥ 820 logical px wide)
  scale = Math.max(scale, vw / 2400);
  W = vw / scale; VH = vh / scale; OY = Math.max(0, (VH - H) / 2);
  cv.width = Math.round(vw * DPR); cv.height = Math.round(vh * DPR);
  cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  glow.width = Math.ceil(W / 6); glow.height = Math.ceil(VH / 6);
  vignette = null;
}
const glow = document.createElement('canvas'); const gctx = glow.getContext('2d');
window.addEventListener('resize', resize);

// ---------- settings & save ----------
const SAVE_KEY = 'smocza-poczta-save';
const SKINS = [
  { id: 'green', pl: 'Zielony', en: 'Green', body: '#5fd36a', belly: '#d9f7a8', wing: '#3aa75a', horn: '#ffd166', unlock: 0 },
  { id: 'sky', pl: 'Błękitny', en: 'Sky blue', body: '#4fb8ff', belly: '#d8f3ff', wing: '#2b7fd6', horn: '#fff3b0', unlock: 3 },
  { id: 'sunset', pl: 'Ognisty', en: 'Fiery', body: '#ff8a4c', belly: '#ffe3b3', wing: '#e0553a', horn: '#fff0a0', unlock: 8 },
  { id: 'night', pl: 'Nocny', en: 'Night', body: '#8f6cff', belly: '#e4d8ff', wing: '#5e3fc9', horn: '#ffd9f6', unlock: 15 },
  { id: 'gold', pl: 'Złoty', en: 'Golden', body: '#ffcc3d', belly: '#fff6cf', wing: '#e39a0e', horn: '#ffffff', unlock: 25 },
];
const HATS = [
  { id: 'none', pl: 'Bez czapki', en: 'No hat', cost: 0, icon: '🚫' },
  { id: 'party', pl: 'Czapka urodzinowa', en: 'Party hat', cost: 30, icon: '🥳' },
  { id: 'pilot', pl: 'Gogle pilota', en: 'Pilot goggles', cost: 60, icon: '🥽' },
  { id: 'crown', pl: 'Korona', en: 'Crown', cost: 100, icon: '👑' },
  { id: 'wizard', pl: 'Czapka czarodzieja', en: 'Wizard hat', cost: 150, icon: '🧙' },
];
const HATS_IDS = HATS.map(h => h.id);
const DAY_GOAL = 5; // letters per "postman day"
let save = { stars: 0, mail: 0, friends: [], bestCombo: 0, days: 0, hats: ['none'], nextIsland: 0, missed: [], settings: { age: '5', words: LANG, voice: '1', skin: 'green', hat: 'none' } };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s === 'object') save = { ...save, ...s, settings: { ...save.settings, ...(s.settings || {}) } }; } catch (e) {}
if (!Array.isArray(save.hats)) save.hats = ['none'];
if (!Array.isArray(save.missed)) save.missed = []; if (!Array.isArray(save.friends)) save.friends = [];
for (const k of ['stars', 'mail', 'bestCombo', 'days', 'nextIsland']) save[k] = Math.max(0, Math.floor(+save[k] || 0));
save.missed = save.missed.filter(i => Number.isInteger(i)); if (!HATS_IDS.includes(save.settings.hat)) save.settings.hat = 'none';
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const S = save.settings;
const skinOf = (id) => SKINS.find(s => s.id === id) || SKINS[0];

// ---------- time of day & palette ----------
const DAY_LEN = 170; // seconds for a full day
const KEYS = [ // t, top, mid, bottom, sun, mountain, haze
  [0.00, '#ffb3c7', '#ffd9a8', '#fff3dc', '#ffd27a', '#c98fb5', '#ffe1d6'],
  [0.22, '#3f9bff', '#8fd0ff', '#dbf3ff', '#fff2b0', '#8aa8e6', '#dff2ff'],
  [0.50, '#5b3fa0', '#ff7e9d', '#ffc37a', '#ffb347', '#a4679b', '#ffd2b0'],
  [0.74, '#0b0e3a', '#1b1f66', '#3a2e7a', '#eef3ff', '#2f2a66', '#443a8a'],
  [1.00, '#ffb3c7', '#ffd9a8', '#fff3dc', '#ffd27a', '#c98fb5', '#ffe1d6'],
].map(k => [k[0], ...k.slice(1).map(hex2rgb)]);
function palette(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0; while (KEYS[i + 1][0] < t) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = ease((t - a[0]) / (b[0] - a[0]));
  const night = t > 0.62 && t < 0.9 ? 1 - Math.abs((t - 0.76) / 0.14) : 0;
  return { top: mix(a[1], b[1], k), mid: mix(a[2], b[2], k), bottom: mix(a[3], b[3], k), sun: mix(a[4], b[4], k), mount: mix(a[5], b[5], k), haze: mix(a[6], b[6], k), night: clamp(night * 1.4, 0, 1), t };
}

// ---------- biomes ----------
const BIOMES = [
  { id: 'meadow', pl: 'Łąkowe Wyspy', en: 'Meadow Islands', grass: '#7ddc6c', grass2: '#4fb95a', rock: '#b57a4e', rock2: '#7a4a2c', tree: 'round', house: ['#ff8c69', '#ffd166', '#9ad2ff'], roof: 'tile' },
  { id: 'candy', pl: 'Cukierkowe Wyspy', en: 'Candy Islands', grass: '#ffb3e6', grass2: '#ff7ccf', rock: '#c98bd9', rock2: '#8e4fb0', tree: 'lolly', house: ['#fff0a0', '#b0f2ff', '#ffc3d9'], roof: 'candy' },
  { id: 'dino', pl: 'Wyspy Dinozaurów', en: 'Dino Islands', grass: '#b6e35a', grass2: '#6ba82e', rock: '#9c6b3c', rock2: '#5a3a1e', tree: 'palm', house: ['#f2b56b', '#c9e36b', '#ffd4a0'], roof: 'straw' },
  { id: 'ice', pl: 'Lodowe Wyspy', en: 'Ice Islands', grass: '#f4fbff', grass2: '#bfe6ff', rock: '#7fb6e6', rock2: '#3f73b3', tree: 'pine', house: ['#dff5ff', '#ffe0f0', '#fff6c2'], roof: 'snow' },
  { id: 'crystal', pl: 'Kryształowe Wyspy', en: 'Crystal Islands', grass: '#b89cff', grass2: '#7b5ce6', rock: '#4a3a8c', rock2: '#2a1f5e', tree: 'crystal', house: ['#ffd6f6', '#c2f0ff', '#fff2a8'], roof: 'spire' },
];
const ISLAND_GAP = 1500;
const biomeOf = (i) => BIOMES[Math.floor(i / 4) % BIOMES.length];

// ---------- procedural art: clouds, glow sprite, small icons ----------
function makeCloud(seed, w, h, soft) {
  const r = mulberry(seed);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const n = 6 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const cx = w * (0.15 + 0.7 * (i / (n - 1))) + (r() - 0.5) * w * 0.1;
    const rad = h * (0.22 + r() * 0.22) * (1 - Math.abs(i / (n - 1) - 0.5) * 0.7);
    const cy = h * 0.62 - rad * 0.45 + (r() - 0.5) * h * 0.1;
    const g = x.createRadialGradient(cx, cy, rad * (soft ? 0 : 0.5), cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft ? 0.5 : 0.85, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill();
  }
  x.globalCompositeOperation = 'source-atop';
  const sh = x.createLinearGradient(0, h * 0.35, 0, h); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(180,170,230,0.45)');
  x.fillStyle = sh; x.fillRect(0, 0, w, h);
  return c;
}
const CLOUDS = { far: [], mid: [], front: [] };
for (let i = 0; i < 4; i++) { CLOUDS.far.push(makeCloud(100 + i, 220, 90, false)); CLOUDS.mid.push(makeCloud(200 + i, 360, 150, false)); CLOUDS.front.push(makeCloud(300 + i, 700, 300, true)); }
// one white radial glow sprite; tinted copies are cached per colour (no per-frame gradients for bloom)
const GLOW_SPRITE = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; })();
const tintCache = new Map();
function tinted(col) { let c = tintCache.get(col); if (c) return c; c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.drawImage(GLOW_SPRITE, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, 64, 64); tintCache.set(col, c); return c; }
// soft sun rays, drawn once
const RAYS = (() => { const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); x.translate(512, 512); for (let i = 0; i < 9; i++) { const a = i * (TAU / 9); const g = x.createLinearGradient(0, 0, Math.cos(a) * 512, Math.sin(a) * 512); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a - 0.09) * 520, Math.sin(a - 0.09) * 520); x.lineTo(Math.cos(a + 0.09) * 520, Math.sin(a + 0.09) * 520); x.fill(); } return c; })();
function drawStar(x, px, py, r, col = '#ffd93d', rot = 0) { x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = col; x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.arc(-r * 0.2, -r * 0.2, r * 0.25, 0, TAU); x.fill(); x.restore(); }
function drawHeart(x, px, py, r, col = '#ff6fb5') { x.save(); x.translate(px, py); x.scale(r / 20, r / 20); x.fillStyle = col; x.beginPath(); x.moveTo(0, 18); x.bezierCurveTo(-24, 0, -18, -20, 0, -8); x.bezierCurveTo(18, -20, 24, 0, 0, 18); x.fill(); x.restore(); }
function drawEnvelope(x, px, py, w) { const h = w * 0.68; x.save(); x.translate(px - w / 2, py - h / 2); x.fillStyle = '#fff'; x.beginPath(); x.roundRect(0, 0, w, h, 4); x.fill(); x.strokeStyle = '#ff5a6e'; x.lineWidth = w * 0.07; x.lineJoin = 'round'; x.beginPath(); x.moveTo(0, 2); x.lineTo(w / 2, h * 0.58); x.lineTo(w, 2); x.stroke(); x.fillStyle = '#ffd93d'; x.beginPath(); x.arc(w / 2, h * 0.58, w * 0.08, 0, TAU); x.fill(); x.restore(); }

// ---------- procedural art: trees, houses ----------
function tree(x, kind, px, py, s, r, b) {
  const g1 = hex2rgb(b.grass), g2 = hex2rgb(b.grass2);
  x.save(); x.translate(px, py); x.scale(s, s);
  if (kind === 'round') {
    x.fillStyle = '#8a5a3a'; x.fillRect(-4, -34, 8, 34);
    for (const [ox, oy, rr, k] of [[0, -52, 26, 0.9], [-16, -38, 18, 1], [16, -40, 18, 1.1], [0, -34, 20, 1.05]]) {
      x.fillStyle = rgb(shade(mix(g1, g2, 0.5), k)); x.beginPath(); x.arc(ox, oy, rr, 0, TAU); x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(-8, -60, 9, 0, TAU); x.fill();
    if (r() < 0.6) { x.fillStyle = '#ff5a6e'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc((r() - 0.5) * 36, -50 + (r() - 0.5) * 24, 3.5, 0, TAU); x.fill(); } }
  } else if (kind === 'lolly') {
    x.fillStyle = '#fff'; x.fillRect(-3, -40, 6, 40);
    const cols = ['#ff6fb5', '#ffd93d', '#5fe3b0', '#8b6cff'];
    x.fillStyle = cols[Math.floor(r() * cols.length)]; x.beginPath(); x.arc(0, -58, 24, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(0, -58, 22, 0, TAU); x.clip();
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 5; x.beginPath();
    for (let a = 0; a < TAU * 2.2; a += 0.15) { const rr = a * 1.6; x.lineTo(Math.cos(a) * rr, -58 + Math.sin(a) * rr); } x.stroke(); x.restore();
  } else if (kind === 'palm') {
    x.strokeStyle = '#9a6a3a'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(10, -40, 4, -70); x.stroke();
    x.fillStyle = rgb(g2);
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.5; x.beginPath(); x.moveTo(4, -70); x.quadraticCurveTo(4 + Math.cos(a) * 30, -70 + Math.sin(a) * 30 - 10, 4 + Math.cos(a) * 46, -70 + Math.sin(a) * 46 + 14); x.quadraticCurveTo(4 + Math.cos(a) * 24, -70 + Math.sin(a) * 24 + 4, 4, -70); x.fill(); }
    x.fillStyle = '#c9772b'; x.beginPath(); x.arc(0, -66, 5, 0, TAU); x.arc(8, -64, 5, 0, TAU); x.fill();
  } else if (kind === 'pine') {
    x.fillStyle = '#6b4a30'; x.fillRect(-3, -22, 6, 22);
    for (let i = 0; i < 3; i++) { const y = -22 - i * 18, w = 30 - i * 7; x.fillStyle = '#2f8f5b'; x.beginPath(); x.moveTo(-w, y); x.lineTo(0, y - 26); x.lineTo(w, y); x.fill(); x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.moveTo(-w * 0.8, y - 2); x.lineTo(-w * 0.3, y - 12); x.lineTo(0, y - 4); x.lineTo(w * 0.35, y - 11); x.lineTo(w * 0.8, y - 2); x.lineTo(w * 0.6, y + 2); x.lineTo(-w * 0.6, y + 2); x.fill(); }
  } else if (kind === 'crystal') {
    const cols = ['#c2a0ff', '#8ee8ff', '#ffb0f0'];
    for (let i = 0; i < 3; i++) {
      const c = cols[(i + Math.floor(r() * 3)) % 3], ox = (i - 1) * 14, h = 40 + r() * 30;
      x.fillStyle = c; x.beginPath(); x.moveTo(ox - 10, 0); x.lineTo(ox - 2, -h); x.lineTo(ox + 6, -h + 10); x.lineTo(ox + 12, 0); x.fill();
      x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(ox - 6, 0); x.lineTo(ox - 2, -h); x.lineTo(ox + 1, -h + 14); x.lineTo(ox - 1, 0); x.fill();
    }
  }
  x.restore();
}
function house(x, px, py, col, s, isl, night) {
  const b = isl.biome, delivered = isl.delivered, roofCol = isl.roofCol || '#ff5a6e';
  x.save(); x.translate(px, py); x.scale(s, s);
  x.fillStyle = col; x.fillRect(-30, -50, 60, 50);
  x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(-30, -50, 60, 8);
  // roof by biome
  if (b.roof === 'snow') { x.fillStyle = roofCol; x.beginPath(); x.moveTo(-38, -48); x.lineTo(0, -82); x.lineTo(38, -48); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-38, -48); x.lineTo(0, -82); x.lineTo(38, -48); x.lineTo(30, -48); x.lineTo(0, -70); x.lineTo(-30, -48); x.fill(); }
  else if (b.roof === 'candy') { x.fillStyle = roofCol; x.beginPath(); x.arc(0, -50, 38, Math.PI, TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,.8)'; for (let i = -3; i <= 3; i += 2) { x.beginPath(); x.moveTo(i * 10 - 4, -50); x.lineTo(i * 10 + 2, -50 - Math.sqrt(Math.max(0, 38 * 38 - (i * 10) ** 2))); x.lineTo(i * 10 + 6, -50 - Math.sqrt(Math.max(0, 38 * 38 - (i * 10 + 4) ** 2))); x.lineTo(i * 10 + 2, -50); x.fill(); } x.fillStyle = '#ff5a6e'; x.beginPath(); x.arc(0, -92, 6, 0, TAU); x.fill(); }
  else if (b.roof === 'straw') { x.fillStyle = '#d9a55a'; x.beginPath(); x.moveTo(-42, -46); x.quadraticCurveTo(0, -100, 42, -46); x.closePath(); x.fill(); x.strokeStyle = 'rgba(120,70,20,.35)'; x.lineWidth = 2; for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(i * 10, -48); x.lineTo(i * 8, -70); x.stroke(); } }
  else if (b.roof === 'spire') { x.fillStyle = roofCol; x.beginPath(); x.moveTo(-36, -48); x.lineTo(0, -104); x.lineTo(36, -48); x.closePath(); x.fill(); x.fillStyle = 'rgba(255,255,255,.4)'; x.beginPath(); x.moveTo(-36, -48); x.lineTo(0, -104); x.lineTo(0, -60); x.fill(); }
  else { x.fillStyle = roofCol; x.beginPath(); x.moveTo(-38, -48); x.lineTo(0, -82); x.lineTo(38, -48); x.closePath(); x.fill(); x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(-38, -48); x.lineTo(0, -82); x.lineTo(0, -70); x.lineTo(-28, -48); x.fill(); x.fillStyle = '#c46a52'; x.fillRect(14, -76, 10, 16); }
  // door, window
  x.fillStyle = '#7a4a2c'; x.beginPath(); x.roundRect(-10, -26, 20, 26, [10, 10, 0, 0]); x.fill();
  x.fillStyle = delivered || night ? '#fff2a0' : '#9fc7ff'; x.beginPath(); x.roundRect(14, -40, 14, 14, 3); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(14, -40, 14, 14);
  // mailbox on a pole, flag up when delivered
  x.fillStyle = '#6b4a30'; x.fillRect(42, -30, 4, 30);
  x.fillStyle = delivered ? '#ffcc3d' : '#4fb8ff'; x.beginPath(); x.roundRect(34, -44, 22, 16, 5); x.fill();
  x.fillStyle = '#ff5a6e'; x.fillRect(54, delivered ? -58 : -46, 3, 14);
  if (delivered) { x.fillStyle = '#ff5a6e'; x.beginPath(); x.moveTo(57, -58); x.lineTo(68, -54); x.lineTo(57, -50); x.fill(); }
  x.restore();
}

// ---------- procedural art: island sprite (cached, day and night copies) ----------
const islandCache = new Map(), backCache = new Map();
function buildIsland(isl) {
  const r = mulberry(isl.i * 7919 + 13), b = isl.biome;
  const w = isl.w + 80, h = 420;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const cx = w / 2, top = 40, hw = isl.w / 2;
  const rk = hex2rgb(b.rock), rk2 = hex2rgb(b.rock2);
  x.beginPath(); x.moveTo(cx - hw, top + 10);
  const pts = 7; const bottom = top + 150 + r() * 120;
  for (let i = 1; i < pts; i++) { const t = i / pts; const px = cx - hw + t * hw * 2; const py = top + 10 + Math.sin(t * Math.PI) * (bottom - top) * (0.7 + r() * 0.4) + (r() - 0.5) * 30; x.lineTo(px, py); }
  x.lineTo(cx + hw, top + 10); x.closePath();
  const rg = x.createLinearGradient(0, top, 0, bottom); rg.addColorStop(0, rgb(rk)); rg.addColorStop(1, rgb(rk2));
  x.fillStyle = rg; x.fill();
  x.save(); x.clip();
  x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 6; i++) { const y = top + 30 + i * 35 + r() * 20; x.beginPath(); x.ellipse(cx + (r() - 0.5) * hw, y, hw * (0.3 + r() * 0.5), 6 + r() * 6, 0, 0, TAU); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.ellipse(cx - hw * 0.5, top + 40, hw * 0.35, 18, 0.3, 0, TAU); x.fill();
  x.restore();
  x.strokeStyle = rgb(shade(rk2, 0.8)); x.lineWidth = 3; x.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const px = cx + (r() - 0.5) * hw * 1.4; x.beginPath(); x.moveTo(px, top + 60); x.quadraticCurveTo(px + (r() - 0.5) * 30, top + 150, px + (r() - 0.5) * 50, bottom + r() * 60); x.stroke(); }
  const g1 = hex2rgb(b.grass), g2 = hex2rgb(b.grass2);
  x.fillStyle = rgb(g2); x.beginPath(); x.ellipse(cx, top + 14, hw + 8, 34, 0, 0, TAU); x.fill();
  for (let i = 0; i < 14; i++) { const t = i / 13; x.beginPath(); x.arc(cx - hw - 4 + t * (hw * 2 + 8), top + 26 + Math.sin(t * Math.PI) * 18, 10 + r() * 8, 0, TAU); x.fill(); }
  const gg = x.createLinearGradient(0, top - 20, 0, top + 40); gg.addColorStop(0, rgb(shade(g1, 1.1))); gg.addColorStop(1, rgb(g1));
  x.fillStyle = gg; x.beginPath(); x.ellipse(cx, top + 4, hw, 26, 0, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.ellipse(cx - hw * 0.3, top - 6, hw * 0.4, 8, 0, 0, TAU); x.fill();
  for (let i = 0; i < 10; i++) { x.fillStyle = ['#ff6fb5', '#ffd93d', '#fff', '#8b6cff'][Math.floor(r() * 4)]; x.beginPath(); x.arc(cx + (r() - 0.5) * hw * 1.6, top + (r() - 0.5) * 30, 2.5, 0, TAU); x.fill(); }
  const nT = 2 + Math.floor(r() * 3);
  for (let i = 0; i < nT; i++) { const side = i % 2 ? 1 : -1; tree(x, b.tree, cx + side * (hw * 0.55 + r() * hw * 0.3), top + 8 + r() * 10, 0.75 + r() * 0.45, r, b); }
  if (b.id === 'dino' && r() < 0.7) { x.fillStyle = '#6b4a30'; x.beginPath(); x.moveTo(cx + hw * 0.1, top + 10); x.lineTo(cx + hw * 0.32, top - 70); x.lineTo(cx + hw * 0.54, top + 10); x.fill(); x.fillStyle = '#ff6a3d'; x.beginPath(); x.arc(cx + hw * 0.32, top - 68, 7, 0, TAU); x.fill(); }
  if (b.id === 'ice') { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx + hw * 0.55, top + 8, 26, 20, 0, Math.PI, TAU); x.fill(); x.fillStyle = '#7fb6e6'; x.beginPath(); x.ellipse(cx + hw * 0.55, top + 8, 8, 10, 0, Math.PI, TAU); x.fill(); }
  // night copy: same sprite tinted deep blue (drawn over the day one with alpha = night)
  const n = document.createElement('canvas'); n.width = w; n.height = h; const nx = n.getContext('2d');
  nx.drawImage(c, 0, 0); nx.globalCompositeOperation = 'source-atop'; nx.fillStyle = 'rgba(20,18,80,.55)'; nx.fillRect(0, 0, w, h);
  return { c, n, w, h, top, cx, bottom };
}
function islandSprite(isl) { let s = islandCache.get(isl.i); if (!s) { s = buildIsland(isl); islandCache.set(isl.i, s); if (islandCache.size > 10) islandCache.delete(islandCache.keys().next().value); } return s; }
function backSprite(k, pal) { // small hazy islands for the back layer; a few variants, re-tinted only when the sky changes a lot
  const key = ((k % 6) + 6) % 6 + ':' + Math.round(pal.t * 12);
  let c = backCache.get(key); if (c) return c;
  const r = mulberry(k * 311 + 5); const isl = { i: 50000 + ((k % 6) + 6) % 6, w: 200 + r() * 120, biome: BIOMES[((k % BIOMES.length) + BIOMES.length) % BIOMES.length] };
  const sp = buildIsland(isl); c = document.createElement('canvas'); c.width = sp.w / 2; c.height = sp.h / 2; const x = c.getContext('2d');
  x.drawImage(sp.c, 0, 0, c.width, c.height); x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgb(pal.haze, 0.55); x.fillRect(0, 0, c.width, c.height);
  if (backCache.size > 12) backCache.delete(backCache.keys().next().value);
  backCache.set(key, c); return c;
}

// ---------- procedural art: creatures (island friends) ----------
const SYL = ['Bu', 'Mi', 'Lo', 'Fa', 'Pi', 'Ko', 'Ru', 'Zu', 'Ti', 'Ne', 'Ga', 'Mo', 'Li', 'Pu', 'Do', 'Ki'];
const CREATURE_COLS = ['#ff9ecb', '#9ad2ff', '#ffd166', '#b5f28a', '#c9a6ff', '#ffb37a', '#8ee8e0', '#ff8a8a'];
function makeCreature(i) {
  const r = mulberry(i * 31337 + 7);
  const name = SYL[Math.floor(r() * SYL.length)] + SYL[Math.floor(r() * SYL.length)].toLowerCase() + (r() < 0.4 ? SYL[Math.floor(r() * SYL.length)].toLowerCase() : '');
  return { i, name, col: CREATURE_COLS[Math.floor(r() * CREATURE_COLS.length)], ears: Math.floor(r() * 4), hat: Math.floor(r() * 4), eye: 0.8 + r() * 0.5, tall: 0.85 + r() * 0.4, spots: r() < 0.5, body: Math.floor(r() * 3) /* 0 egg, 1 round blob with legs, 2 tall with arms */ };
}
function drawCreature(x, c, px, py, s, t, mood) {
  const bob = Math.sin(t * 3 + c.i) * 2, jump = mood === 1 ? Math.abs(Math.sin(t * 8)) * 18 : 0;
  x.save(); x.translate(px, py - jump); x.scale(s, s);
  const squash = mood === 1 ? 1 + Math.sin(t * 8) * 0.08 : 1; x.scale(1 / squash, squash);
  const body = hex2rgb(c.col);
  const bh = (c.body === 2 ? 64 : c.body === 1 ? 44 : 52) * c.tall, bw = c.body === 1 ? 52 : 40;
  x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(0, 2 + jump, 24, 6, 0, 0, TAU); x.fill();
  x.fillStyle = rgb(body);
  if (c.ears === 1) { x.beginPath(); x.ellipse(-16, -bh - 6, 7, 18, -0.2, 0, TAU); x.ellipse(16, -bh - 6, 7, 18, 0.2, 0, TAU); x.fill(); }
  if (c.ears === 2) { x.beginPath(); x.moveTo(-22, -bh + 10); x.lineTo(-12, -bh - 16); x.lineTo(-2, -bh + 6); x.moveTo(22, -bh + 10); x.lineTo(12, -bh - 16); x.lineTo(2, -bh + 6); x.fill(); }
  if (c.ears === 3) { x.strokeStyle = rgb(shade(body, 0.8)); x.lineWidth = 3; x.beginPath(); x.moveTo(0, -bh + 4); x.quadraticCurveTo(6, -bh - 14, 14, -bh - 18); x.stroke(); x.fillStyle = '#ffd93d'; x.beginPath(); x.arc(15, -bh - 19, 5, 0, TAU); x.fill(); }
  if (c.body === 1) { x.fillStyle = rgb(shade(body, 0.8)); x.beginPath(); x.ellipse(-14, -4, 8, 10, 0, 0, TAU); x.ellipse(14, -4, 8, 10, 0, 0, TAU); x.fill(); } // legs
  const bg = x.createRadialGradient(-10, -bh * 0.7, 4, 0, -bh / 2, bh); bg.addColorStop(0, rgb(shade(body, 1.18))); bg.addColorStop(1, rgb(shade(body, 0.85)));
  x.fillStyle = bg; x.beginPath();
  if (c.body === 1) x.ellipse(0, -bh / 2 - 6 + bob * 0.3, bw / 2 + 2, bh / 2 + 2, 0, 0, TAU);
  else if (c.body === 2) x.roundRect(-bw / 2 - 2, -bh + bob * 0.3, bw + 4, bh, [20, 20, 12, 12]);
  else x.ellipse(0, -bh / 2 + bob * 0.3, bw / 2 + 2, bh / 2 + 2, 0, 0, TAU);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.ellipse(0, -bh * 0.35, bw * 0.3, bh * 0.28, 0, 0, TAU); x.fill();
  if (c.spots) { x.fillStyle = rgb(shade(body, 0.75)); x.beginPath(); x.arc(-13, -bh * 0.8, 4, 0, TAU); x.arc(14, -bh * 0.6, 3, 0, TAU); x.arc(-10, -bh * 0.25, 3, 0, TAU); x.fill(); }
  if (c.body === 2) { const wave = mood === 1 ? Math.sin(t * 10) * 0.6 : 0; x.strokeStyle = rgb(shade(body, 0.85)); x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(-bw / 2, -bh * 0.5); x.lineTo(-bw / 2 - 12, -bh * 0.5 + 16 - wave * 30); x.moveTo(bw / 2, -bh * 0.5); x.lineTo(bw / 2 + 12, -bh * 0.5 + 16 - wave * 30); x.stroke(); }
  if (c.body !== 1) { x.fillStyle = rgb(shade(body, 0.8)); x.beginPath(); x.ellipse(-11, 0, 9, 5, 0, 0, TAU); x.ellipse(11, 0, 9, 5, 0, 0, TAU); x.fill(); }
  const blink = (Math.sin(t * 1.3 + c.i * 2) > 0.97) ? 0.1 : 1;
  const ey = -bh * 0.72, er = 7 * c.eye;
  for (const ox of [-10, 10]) {
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ox, ey, er, er * blink, 0, 0, TAU); x.fill();
    x.fillStyle = '#2a1d4e'; x.beginPath(); x.ellipse(ox + 2, ey + 1, er * 0.55, er * 0.55 * blink, 0, 0, TAU); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(ox + 4, ey - 2, er * 0.22, 0, TAU); x.fill();
  }
  x.fillStyle = 'rgba(255,110,150,.45)'; x.beginPath(); x.arc(-16, ey + 10, 5, 0, TAU); x.arc(16, ey + 10, 5, 0, TAU); x.fill();
  x.strokeStyle = '#2a1d4e'; x.lineWidth = 2.2; x.lineCap = 'round'; x.beginPath();
  if (mood === 1) { x.arc(0, ey + 10, 7, 0.1, Math.PI - 0.1); } else if (mood === 2) { x.moveTo(-5, ey + 13); x.lineTo(5, ey + 13); } else { x.arc(0, ey + 9, 5, 0.2, Math.PI - 0.2); }
  x.stroke();
  if (c.hat === 1) { x.fillStyle = '#ffd166'; x.beginPath(); x.moveTo(-14, -bh - 2); x.lineTo(-10, -bh - 16); x.lineTo(-4, -bh - 6); x.lineTo(0, -bh - 20); x.lineTo(4, -bh - 6); x.lineTo(10, -bh - 16); x.lineTo(14, -bh - 2); x.fill(); }
  if (c.hat === 2) { x.fillStyle = '#ff5a6e'; x.beginPath(); x.moveTo(-14, -bh); x.lineTo(0, -bh - 30); x.lineTo(14, -bh); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, -bh - 30, 4, 0, TAU); x.fill(); }
  if (c.hat === 3) { x.fillStyle = '#3d8bff'; x.beginPath(); x.ellipse(0, -bh - 2, 20, 5, 0, 0, TAU); x.fill(); x.fillRect(-10, -bh - 18, 20, 16); }
  x.restore();
}

// ---------- procedural art: the dragon ----------
function drawHat(x, id) { // drawn in head space: head centre ≈ (44,-28), top of head ≈ y -49
  if (id === 'party') { x.fillStyle = '#ff6fb5'; x.beginPath(); x.moveTo(30, -46); x.lineTo(42, -84); x.lineTo(56, -48); x.fill(); x.fillStyle = '#ffd93d'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(38 + i * 4, -58 - i * 8, 3, 0, TAU); x.fill(); } x.beginPath(); x.arc(42, -86, 5, 0, TAU); x.fill(); }
  else if (id === 'pilot') { x.fillStyle = '#8a5a3a'; x.beginPath(); x.roundRect(28, -54, 36, 12, 6); x.fill(); x.fillStyle = '#9fe8ff'; x.beginPath(); x.arc(38, -48, 7, 0, TAU); x.arc(56, -48, 7, 0, TAU); x.fill(); x.strokeStyle = '#5a3a1e'; x.lineWidth = 2.5; x.beginPath(); x.arc(38, -48, 7, 0, TAU); x.moveTo(63, -48); x.arc(56, -48, 7, 0, TAU); x.stroke(); }
  else if (id === 'crown') { x.fillStyle = '#ffcc3d'; x.beginPath(); x.moveTo(28, -46); x.lineTo(30, -70); x.lineTo(40, -58); x.lineTo(46, -74); x.lineTo(52, -58); x.lineTo(62, -70); x.lineTo(62, -46); x.closePath(); x.fill(); x.fillStyle = '#ff5a6e'; x.beginPath(); x.arc(45, -52, 3.5, 0, TAU); x.fill(); x.fillStyle = '#4fb8ff'; x.beginPath(); x.arc(35, -52, 3, 0, TAU); x.arc(55, -52, 3, 0, TAU); x.fill(); }
  else if (id === 'wizard') { x.fillStyle = '#5e3fc9'; x.beginPath(); x.moveTo(24, -46); x.quadraticCurveTo(44, -60, 50, -98); x.quadraticCurveTo(50, -66, 66, -46); x.closePath(); x.fill(); x.fillStyle = '#8f6cff'; x.beginPath(); x.ellipse(45, -46, 26, 6, 0, 0, TAU); x.fill(); drawStar(x, 44, -66, 5, '#ffd93d'); drawStar(x, 50, -84, 3.5, '#fff'); }
}
function drawDragon(x, px, py, ang, flap, skin, s, t, opts = {}) {
  const body = hex2rgb(skin.body), belly = hex2rgb(skin.belly), wing = hex2rgb(skin.wing);
  x.save(); x.translate(px, py); x.rotate(ang); x.scale(s, s);
  if (opts.dizzy) x.rotate(Math.sin(t * 20) * 0.3);
  const wa = Math.sin(flap) * 0.9;
  const drawWing = (far) => {
    x.save(); x.translate(far ? -6 : -14, far ? -14 : -8); x.rotate((far ? -0.5 : -0.75) + wa * (far ? -1 : 1) * 0.9 - (far ? 0.4 : 0));
    const L = far ? 74 : 86;
    x.fillStyle = rgb(far ? shade(wing, 0.78) : wing);
    x.beginPath(); x.moveTo(0, 0);
    x.quadraticCurveTo(L * 0.3, -L * 0.6, L, -L * 0.55); x.quadraticCurveTo(L * 0.8, -L * 0.25, L * 0.86, -L * 0.1);
    x.quadraticCurveTo(L * 0.62, -L * 0.1, L * 0.62, L * 0.08); x.quadraticCurveTo(L * 0.4, L * 0.02, L * 0.34, L * 0.16);
    x.quadraticCurveTo(L * 0.15, L * 0.1, 0, L * 0.12); x.closePath(); x.fill();
    x.strokeStyle = rgb(shade(wing, 0.7)); x.lineWidth = 2.5; x.lineCap = 'round';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(L, -L * 0.55); x.moveTo(0, 0); x.lineTo(L * 0.86, -L * 0.1); x.moveTo(0, 0); x.lineTo(L * 0.62, L * 0.08); x.stroke();
    x.restore();
  };
  drawWing(true);
  const tw = Math.sin(t * 6) * 0.15;
  x.strokeStyle = rgb(body); x.lineWidth = 16; x.lineCap = 'round';
  x.beginPath(); x.moveTo(-26, 4); x.quadraticCurveTo(-60, 10 + tw * 40, -82, -6 + tw * 60); x.stroke();
  x.lineWidth = 9; x.beginPath(); x.moveTo(-60, 8 + tw * 30); x.quadraticCurveTo(-85, -2 + tw * 60, -104, -22 + tw * 80); x.stroke();
  x.fillStyle = '#ff6fb5'; x.save(); x.translate(-104, -22 + tw * 80); x.rotate(-0.6 + tw); x.beginPath(); x.moveTo(0, -14); x.lineTo(12, 6); x.lineTo(-12, 6); x.closePath(); x.fill(); x.restore();
  x.fillStyle = rgb(hex2rgb(skin.horn));
  for (let i = 0; i < 4; i++) { const sx = -30 + i * 14, sy = -20 + Math.abs(i - 1.5) * 2; x.beginPath(); x.moveTo(sx - 6, sy + 4); x.lineTo(sx, sy - 10); x.lineTo(sx + 6, sy + 4); x.fill(); }
  const bg = x.createRadialGradient(-10, -14, 6, 0, 0, 60); bg.addColorStop(0, rgb(shade(body, 1.2))); bg.addColorStop(1, rgb(shade(body, 0.88)));
  x.fillStyle = bg; x.beginPath(); x.ellipse(-4, 0, 42, 27, -0.08, 0, TAU); x.fill();
  x.fillStyle = rgb(belly); x.beginPath(); x.ellipse(-2, 10, 30, 14, -0.05, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 1.5; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(-2, 4 + i * 5, 28 - i * 2, 4, 0, 0.3, Math.PI - 0.3); x.stroke(); }
  x.fillStyle = rgb(shade(body, 0.85)); x.beginPath(); x.ellipse(-18, 22, 9, 7, 0.3, 0, TAU); x.ellipse(10, 24, 9, 7, -0.3, 0, TAU); x.fill();
  // mail bag
  x.save(); x.translate(8, 8); x.rotate(0.15);
  x.strokeStyle = '#8a5a3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(-14, -22); x.quadraticCurveTo(-4, -30, 8, -18); x.stroke();
  x.fillStyle = '#c98b5a'; x.beginPath(); x.roundRect(-6, -14, 24, 20, 6); x.fill();
  x.fillStyle = '#a66f44'; x.beginPath(); x.roundRect(-6, -14, 24, 9, [6, 6, 2, 2]); x.fill();
  drawEnvelope(x, 8, -18, 12);
  x.restore();
  x.fillStyle = rgb(body); x.beginPath(); x.ellipse(28, -14, 16, 14, 0.5, 0, TAU); x.fill();
  const hg = x.createRadialGradient(38, -34, 4, 42, -26, 34); hg.addColorStop(0, rgb(shade(body, 1.2))); hg.addColorStop(1, rgb(shade(body, 0.9)));
  x.fillStyle = hg; x.beginPath(); x.ellipse(44, -28, 26, 21, 0.1, 0, TAU); x.fill();
  x.fillStyle = rgb(shade(body, 0.95)); x.beginPath(); x.ellipse(62, -20, 14, 10, 0.1, 0, TAU); x.fill();
  x.fillStyle = '#2a1d4e'; x.beginPath(); x.ellipse(70, -24, 2, 1.5, 0, 0, TAU); x.fill();
  x.strokeStyle = '#2a1d4e'; x.lineWidth = 2; x.beginPath(); if (opts.sleepy) { x.moveTo(56, -14); x.lineTo(66, -14); } else x.arc(60, -16, 7, 0.2, Math.PI * 0.8); x.stroke();
  x.fillStyle = rgb(hex2rgb(skin.horn));
  x.beginPath(); x.moveTo(30, -42); x.lineTo(22, -62); x.lineTo(40, -46); x.fill();
  x.beginPath(); x.moveTo(44, -46); x.lineTo(42, -68); x.lineTo(54, -48); x.fill();
  const blink = opts.sleepy ? 0.12 : (Math.sin(t * 1.7) > 0.96) ? 0.15 : 1;
  const ex = 50, ey = -34;
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, 10, 11 * blink, 0, 0, TAU); x.fill();
  x.fillStyle = opts.dizzy ? '#ff6fb5' : '#2a1d4e'; x.beginPath(); x.ellipse(ex + 3, ey + 1, 6, 7 * blink, 0, 0, TAU); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(ex + 5, ey - 3, 2.5, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,110,150,.5)'; x.beginPath(); x.ellipse(56, -14, 6, 4, 0, 0, TAU); x.fill();
  if (opts.hat && opts.hat !== 'none') drawHat(x, opts.hat);
  drawWing(false);
  x.restore();
}
// storm cloud body as a sprite (5 radial gradients otherwise, per cloud, per frame)
const STORM_SPRITE = (() => { const c = document.createElement('canvas'); c.width = 200; c.height = 150; const x = c.getContext('2d'); x.translate(100, 70); for (const [ox, oy, rr] of [[-40, 10, 32], [0, -6, 42], [40, 10, 32], [-10, 20, 30], [22, 22, 28]]) { const g = x.createRadialGradient(ox - 8, oy - 10, 4, ox, oy, rr); g.addColorStop(0, '#a8a6c8'); g.addColorStop(1, '#5b5680'); x.fillStyle = g; x.beginPath(); x.arc(ox, oy, rr, 0, TAU); x.fill(); } return c; })();

// ---------- world ----------
const world = { islands: [], stars: [], storms: [], parts: [], birds: [], rainbows: [], gen: 0, firstIslandAt: 1100, seq: [], base: 0 };
// k = position in this run, i = the island's identity (creature, biome). Missed islands come back first, then new ones.
function islandIndexAt(k) { return k < world.seq.length ? world.seq[k] : world.base + (k - world.seq.length); }
function islandAt(k) {
  const i = islandIndexAt(k);
  const r = mulberry(i * 1013 + 99);
  const w = 300 + Math.floor(r() * 180);
  return { i, k, x: world.firstIslandAt + k * ISLAND_GAP + (r() - 0.5) * 300, top: 400 + (r() - 0.5) * 120, w, biome: biomeOf(i), creature: makeCreature(i), delivered: false, visited: false, light: 0, waterfall: r() < 0.5, bob: r() * TAU, gift: null, roofCol: null };
}
function generateUpTo(i) {
  while (world.gen <= i) {
    const isl = islandAt(world.gen); world.islands.push(isl);
    const r = mulberry(world.gen * 517 + 3);
    // stars: fat straight-ish lines a small child can follow, the last ones lead into the ring
    const x0 = isl.x - ISLAND_GAP + 420, x1 = isl.x - 360;
    const kind = Math.floor(r() * 3);
    const n = 6 + Math.floor(r() * 4);
    const baseY = 160 + r() * 360, ringY = isl.top - 170;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1); let sx = lerp(x0, x1, t), sy = baseY;
      if (kind === 0) sy = lerp(baseY, ringY, t); // a gentle slope into the ring
      else if (kind === 1) sy = baseY + Math.sin(t * Math.PI) * -120;
      else sy = lerp(baseY, ringY, ease(t)) + Math.sin(t * TAU) * 40;
      world.stars.push({ x: sx, y: clamp(sy, 230, 560), got: false, ph: r() * TAU, big: k === n - 1 });
    }
    if (world.gen >= 2) { const nS = world.gen < 6 ? 1 : 1 + Math.floor(r() * 2); for (let k = 0; k < nS; k++) world.storms.push({ x: lerp(x0, x1, 0.25 + r() * 0.5) + k * 300, y: 140 + r() * 380, vx: (r() - 0.5) * 50, ph: r() * TAU, mood: 0, gone: 0 }); }
    world.gen++;
  }
  world.islands = world.islands.filter(o => o.x > dragon.x - 2000);
  world.stars = world.stars.filter(o => o.x > dragon.x - 600 && !o.got);
  world.storms = world.storms.filter(o => o.x > dragon.x - 800 && o.gone < 1);
  if (world.rainbows.length > 40) world.rainbows.shift();
}

// ---------- game state ----------
const dragon = { x: 0, y: 360, vy: 0, vx: 230, ang: 0, flap: 0, dizzy: 0, fire: 0, fireCd: 0, trail: 0, state: 'menu', landT: 0, from: null, to: null, idle: 0, auto: false };
let stars = save.stars, mail = save.mail, combo = 0, comboT = 0, bestCombo = save.bestCombo || 0, dayMail = 0;
let cam = { x: 0, y: 0 }, time = 0, dayT = 0.12, paused = false, running = false, speedKey = 0, shake = 0;
let dayGifts = [], lastQType = null, currentQ = null, currentIsl = null, quizTries = 0, quizLocked = false;
const input = { hold: false };
const overlayOpen = () => ['#start', '#quiz', '#pause', '#album', '#dayend'].some(s => !$(s).classList.contains('hidden'));

function resetRun() {
  world.islands = []; world.stars = []; world.storms = []; world.parts = []; world.birds = []; world.rainbows = []; world.gen = 0; islandCache.clear(); world.seq = save.missed.slice(0, 6); world.base = save.nextIsland;
  dragon.x = 0; dragon.y = 360; dragon.vy = 0; dragon.dizzy = 0; dragon.state = 'fly'; dragon.fire = 0; dragon.idle = 0; dragon.auto = false;
  cam.x = dragon.x - W * 0.32; cam.y = 0; combo = 0; dayT = 0.12; time = 0; dayMail = 0; dayGifts = [];
  generateUpTo(3);
}
function spawn(n, f) { for (let i = 0; i < n; i++) world.parts.push(f(i)); if (world.parts.length > 500) world.parts.splice(0, world.parts.length - 500); }
function burst(x, y, cols, n = 24, speed = 260, g = 300) { spawn(n, () => { const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7); return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.7, r: 3 + Math.random() * 5, col: cols[Math.floor(Math.random() * cols.length)], g, kind: 'dot' }; }); }
function confetti(x, y, n = 40) { spawn(n, () => ({ x: x + (Math.random() - 0.5) * 80, y, vx: (Math.random() - 0.5) * 300, vy: -200 - Math.random() * 300, life: 0, max: 1.4 + Math.random(), r: 4 + Math.random() * 4, col: ['#ff6fb5', '#ffd93d', '#5fe3b0', '#8b6cff', '#4fb8ff', '#fff'][Math.floor(Math.random() * 6)], g: 500, kind: 'conf', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 })); }

// ---------- UI helpers ----------
let toastT = null;
function toast(msg, ms = 1600) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }
function hint(msg) { const el = $('#hint'); if (!msg) { el.classList.add('hidden'); return; } el.textContent = msg; el.classList.remove('hidden'); }
function bump(sel) { const el = $(sel); el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 150); }
function updateHud() { $('#stars').textContent = stars; $('#mail').textContent = `${dayMail}/${DAY_GOAL}`; const m = multiplier(); $('#comboPill').classList.toggle('hidden', m < 2); $('#combo').textContent = 'x' + m; }
const multiplier = () => combo >= 12 ? 4 : combo >= 8 ? 3 : combo >= 4 ? 2 : 1;
let persistT = 0, moodT = 0, autoHinted = -99;
function addStars(n) { stars = Math.max(0, stars + n); save.stars = stars; updateHud(); bump('#starPill'); persistT = 2; }

// ---------- update ----------
function update(dt) {
  time += dt; dayT = (dayT + dt / DAY_LEN) % 1;
  if (dragon.fireCd > 0) dragon.fireCd -= dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 3);
  if (persistT > 0) { persistT -= dt; if (persistT <= 0) persist(); }
  if (dragon.state === 'fly') { comboT -= dt; if (comboT <= 0 && combo > 0) { combo = 0; updateHud(); } }
  if ((moodT += dt) > 2) { moodT = 0; const near = world.islands.find(o => o.x > dragon.x - 400) || world.islands[0]; Audio.setMood({ biome: near ? Math.floor(near.i / 4) : 0, night: palette(dayT).night }); }

  if (dragon.state === 'fly') {
    const target = clamp(230 + speedKey * 90, 150, 330);
    dragon.vx = lerp(dragon.vx, target + (multiplier() - 1) * 15, dt * 2);
    dragon.x += dragon.vx * dt;
    // autopilot: only when nobody has touched anything for a while (a very small child, or a parent watching)
    dragon.idle = input.hold ? 0 : dragon.idle + dt;
    dragon.auto = dragon.idle > 6;
    const next = world.islands.find(o => !o.visited && o.x > dragon.x - 80);
    const g = 520, lift = 1500;
    let want = null; // autopilot target y
    if (dragon.auto) {
      const st = world.stars.find(s => !s.got && s.x > dragon.x + 40); want = next && dragon.x > next.x - 500 ? next.top - 170 : st ? st.y : 360;
      const storm = world.storms.find(s => s.gone === 0 && s.x > dragon.x && s.x < dragon.x + 320 && Math.abs(s.y - dragon.y) < 150);
      if (storm) { if (Math.abs(storm.y - want) < 150) want = storm.y > 360 ? storm.y - 180 : storm.y + 180; if (storm.x < dragon.x + 300 && Math.abs(storm.y - dragon.y) < 110) fireBreath(false); }
      if (time - autoHinted > 20) { autoHinted = time; hint(tr(isTouch ? 'Smok leci sam… dotknij ekranu, żeby sterować! 👆' : 'Smok leci sam… wciśnij Spację, żeby sterować! 👆', isTouch ? 'The dragon flies by itself… touch the screen to steer! 👆' : 'The dragon flies by itself… press Space to steer! 👆')); setTimeout(() => hint(null), 5000); }
    }
    const flapping = (input.hold || (want !== null && dragon.y > want + 10)) && dragon.dizzy <= 0;
    if (flapping) { dragon.vy -= lift * dt; dragon.flap += dt * 14; } else dragon.flap += dt * 5;
    dragon.vy += g * dt;
    dragon.vy = clamp(dragon.vy, -330, 380);
    // a small landing assist right at the ring, so a near miss still counts (not a magnet across the screen)
    if (next) { const rx = next.x, ry = next.top - 170; if (dragon.x > rx - 120 && dragon.x < rx && Math.abs(dragon.y - ry) < 110) dragon.vy = lerp(dragon.vy, clamp((ry - dragon.y) * 2.5, -330, 330), dt * 1.4); }
    dragon.y += dragon.vy * dt;
    for (const o of world.islands) { const ahead = o.x - o.w * 0.5 - dragon.x; if (ahead < 160 && ahead > -o.w - 30 && dragon.y > o.top - 80 && dragon.y < o.top + 260) { dragon.y = Math.max(o.top - 80, dragon.y - 560 * dt); if (dragon.vy > -60) dragon.vy = -60; } }
    const ceil = 60 + Math.max(0, 125 - OY); if (dragon.y < ceil) { dragon.y = ceil; dragon.vy = Math.max(0, dragon.vy); }
    if (dragon.y > 560) dragon.vy -= (dragon.y - 560) * 14 * dt; // soft floor: the cloud sea pushes you up
    if (dragon.y > 600) { dragon.y = 600; dragon.vy = Math.min(0, dragon.vy); }
    dragon.ang = lerp(dragon.ang, clamp(dragon.vy / 700, -0.45, 0.5), dt * 6);
    if (dragon.dizzy > 0) dragon.dizzy -= dt;
    dragon.trail += dt;
    if (dragon.trail > 0.035) { dragon.trail = 0; const m = multiplier(); const cols = m > 1 ? ['#ff6fb5', '#ffd93d', '#5fe3b0', '#4fb8ff', '#b46cff'] : ['#fff8e0', '#ffe8a8']; spawn(1, () => ({ x: dragon.x - 90, y: dragon.y + 4 + (Math.random() - 0.5) * 16, vx: -40 + (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0, max: 0.5 + Math.random() * 0.4 + (m > 1 ? 0.4 : 0), r: 2 + Math.random() * 3 + (m > 1 ? 2 : 0), col: cols[Math.floor(Math.random() * cols.length)], g: -20, kind: m > 1 ? 'glow' : 'dot' })); }
    if (dragon.fire > 0) {
      dragon.fire -= dt;
      spawn(4, () => ({ x: dragon.x + 70, y: dragon.y - 20, vx: 520 + Math.random() * 200, vy: (Math.random() - 0.5) * 160 + dragon.ang * 300, life: 0, max: 0.35 + Math.random() * 0.25, r: 6 + Math.random() * 10, col: ['#fff2a0', '#ffb347', '#ff6a3d', '#ff3d8b'][Math.floor(Math.random() * 4)], g: -200, kind: 'fire' }));
      for (const s of world.storms) if (s.gone === 0 && s.x > dragon.x + 30 && s.x < dragon.x + 340 && Math.abs(s.y - dragon.y) < 120) popStorm(s);
    }
    for (const s of world.stars) {
      if (s.got) continue;
      const dx = s.x - dragon.x, dy = s.y - dragon.y;
      if (dx * dx + dy * dy < 70 * 70 || (multiplier() > 1 && dx * dx + dy * dy < 110 * 110)) {
        s.got = true; if (!dragon.auto) { combo++; comboT = 3; bestCombo = Math.max(bestCombo, combo); save.bestCombo = bestCombo; }
        const v = dragon.auto ? 1 : (s.big ? 5 : 1) * multiplier(); addStars(v); Audio.sfx.star(combo);
        burst(s.x, s.y, ['#ffd93d', '#fff6c2', '#ff9f2e'], s.big ? 30 : 10, 180, 80);
        if (combo === 4 || combo === 8 || combo === 12) { toast(`Combo x${multiplier()}! 🔥`); Audio.sfx.ring(); }
      }
    }
    for (const s of world.storms) {
      s.ph += dt; s.x += s.vx * dt; s.y += Math.sin(s.ph * 1.5) * 20 * dt;
      if (s.gone > 0) { s.gone += dt * 1.2; continue; }
      if (s.mood > 0) s.mood -= dt;
      const dx = s.x - dragon.x, dy = s.y - dragon.y;
      if (dragon.dizzy <= 0 && s.mood <= 0 && dx * dx + dy * dy < 80 * 80) {
        // a grumpy cloud bounces you, makes you dizzy and breaks the combo; it never takes stars
        dragon.dizzy = 0.9; dragon.vy = dy > 0 ? -260 : 260; s.mood = 2.5; shake = 0.8; combo = 0; updateHud(); Audio.sfx.bonk();
        toast(tr('Ojej! Zła chmura! Zdmuchnij ją ogniem 🔥', 'Oops! A grumpy cloud! Blow it away with fire 🔥'));
      }
    }
    for (const isl of world.islands) {
      if (isl.visited) continue;
      const rx = isl.x, ry = isl.top - 170, dx = rx - dragon.x, dy = ry - dragon.y;
      if (dx * dx + dy * dy < 95 * 95) { if (dx * dx + dy * dy < 38 * 38 && !dragon.auto) { addStars(5); toast(tr('Idealnie w kółko! +5 ⭐', 'Right through the ring! +5 ⭐')); burst(dragon.x, dragon.y, ['#fff', '#ffd93d'], 24, 220, 60); } startLanding(isl); break; }
      if (dragon.x > isl.x + 240) { isl.visited = true; if (!save.missed.includes(isl.i)) { save.missed.push(isl.i); if (save.missed.length > 12) save.missed.shift(); } save.nextIsland = Math.max(save.nextIsland, isl.i + 1); persistT = 1; if (!dragon.auto) toast(tr(`${isl.creature.name} czeka na list… następnym razem! 💌`, `${isl.creature.name} is waiting for a letter… next time! 💌`)); }
    }
    generateUpTo(Math.floor((dragon.x - world.firstIslandAt) / ISLAND_GAP) + 3);
    if (Math.random() < dt * 0.08 && world.birds.length < 2) world.birds.push({ x: dragon.x + W + 200, y: 80 + Math.random() * 250, ph: 0, n: 3 + Math.floor(Math.random() * 4) });
  } else if (dragon.state === 'landing') {
    dragon.landT += dt / 1.1; const k = ease(clamp(dragon.landT, 0, 1));
    dragon.x = lerp(dragon.from.x, dragon.to.x, k); dragon.y = lerp(dragon.from.y, dragon.to.y, k) - Math.sin(k * Math.PI) * 40;
    dragon.ang = lerp(dragon.ang, 0.1, dt * 4); dragon.flap += dt * 10; dragon.vy = 0;
    if (dragon.landT >= 1) { dragon.state = 'landed'; Audio.sfx.land(); burst(dragon.x, dragon.y + 26, ['#fff', '#e8f5e0'], 12, 120, 200); setTimeout(() => { if (!paused) openQuiz(currentIsl); else dragon.state = 'landed'; }, 350); }
  } else if (dragon.state === 'landed') {
    if (!paused && $('#quiz').classList.contains('hidden') && !currentQ && !$('#dayend').offsetParent && dragon.landT >= 1 && currentIsl && !currentIsl.delivered && !overlayOpen()) openQuiz(currentIsl); // paused during landing → open now
  } else if (dragon.state === 'takeoff') {
    dragon.landT += dt / 0.8; const k = clamp(dragon.landT, 0, 1);
    dragon.vx = lerp(100, 230, k); dragon.x += dragon.vx * dt; dragon.y = lerp(dragon.from.y, dragon.from.y - 120, ease(k)); dragon.flap += dt * 14; dragon.ang = lerp(dragon.ang, -0.3, dt * 4);
    if (k >= 1) { dragon.state = 'fly'; dragon.vy = -200; comboT = Math.max(comboT, 2); }
  }
  for (const isl of world.islands) if (isl.delivered) isl.light = Math.min(1, isl.light + dt * 0.8);
  for (const b of world.birds) { b.x -= 110 * dt; b.ph += dt; } world.birds = world.birds.filter(b => b.x > dragon.x - 600);
  for (const p of world.parts) { p.life += dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'conf') { p.rot += p.vr * dt; p.vx *= 0.98; } }
  world.parts = world.parts.filter(p => p.life < p.max);
  const landedView = (dragon.state === 'landed' || dragon.state === 'landing') && currentIsl ? currentIsl.x - W * 0.5 : dragon.x - W * 0.32;
  cam.x = dragon.state === 'fly' && Math.abs(cam.x - landedView) < 2 ? landedView : lerp(cam.x, landedView, dt * (dragon.state === 'fly' ? 5 : 2.5));
  cam.y = lerp(cam.y, (dragon.y - 360) * 0.18, dt * 3);
}
function popStorm(s) {
  s.gone = 0.01; Audio.sfx.pop(); addStars(dragon.auto ? 1 : 3); shake = 0.4;
  burst(s.x, s.y, ['#ff6fb5', '#ffd93d', '#5fe3b0', '#4fb8ff', '#b46cff', '#fff'], 36, 320, 200);
  for (let k = 0; k < 4; k++) world.stars.push({ x: s.x + 120 + k * 70, y: s.y - 40 + Math.sin(k) * 50, got: false, ph: k, big: false });
  world.rainbows.push({ x: s.x, y: s.y, r: 120 + Math.random() * 80, t: 0 }); // a rainbow stays where the cloud was
  toast(tr('Buch! Tęcza! 🌈', 'Poof! A rainbow! 🌈'));
}
function fireBreath(byPlayer = true) {
  if (dragon.state !== 'fly' || dragon.fireCd > 0) return;
  dragon.fire = 0.55; dragon.fireCd = 1; if (byPlayer) dragon.idle = 0; Audio.sfx.fire();
}
function startLanding(isl) {
  isl.visited = true; currentIsl = isl; dragon.state = 'landing'; dragon.landT = 0; dragon.from = { x: dragon.x, y: dragon.y }; dragon.to = { x: isl.x - 60, y: isl.top + 24 };
  Audio.sfx.ring(); hint(null);
}

// ---------- quiz ----------
function openQuiz(isl) {
  if (!$('#quiz').classList.contains('hidden')) return;
  const age = +S.age, wl = S.words;
  currentQ = makeQuestion(age, wl, lastQType); lastQType = currentQ.type; quizTries = 0; quizLocked = false;
  const q = currentQ, c = isl.creature;
  $('#qName').textContent = tr(`List dla: ${c.name}`, `Letter for: ${c.name}`);
  $('#qText').innerHTML = q.text[LANG];
  const P = $('#qPrompt'); P.innerHTML = '';
  if (q.prompt) {
    if (q.prompt.kind === 'emojis') P.innerHTML = q.prompt.items.map((e, i) => `<span class="pe" data-i="${i}">${e}</span>`).join('');
    else if (q.prompt.kind === 'letter') P.innerHTML = `<div class="letter">${q.prompt.letter}</div>`;
    else if (q.prompt.kind === 'word') P.innerHTML = `<div class="word">${q.prompt.word}</div>`;
    else if (q.prompt.kind === 'math') {
      const grp = (n, gone) => `<div class="grp${gone ? ' gone' : ''}">${Array(n).fill(`<span class="pe">${q.prompt.e}</span>`).join('')}</div>`;
      P.innerHTML = `<div class="math">${grp(q.prompt.a)}<span>${q.prompt.op}</span>${grp(q.prompt.b, q.prompt.op === '−')}<span>=</span><span>?</span></div>`;
    }
  }
  P.classList.toggle('many', !!(q.prompt && q.prompt.kind === 'emojis' && q.prompt.items.length > 6));
  const O = $('#qOptions'); O.innerHTML = ''; O.dataset.n = q.options.length;
  q.options.forEach((o, i) => {
    const b = document.createElement('button');
    if (o.svg) b.innerHTML = o.svg;
    else if (o.emojis) b.innerHTML = `<div class="grp">${o.emojis.map(e => `<span>${e}</span>`).join('')}</div>`;
    else if (o.emoji) b.innerHTML = `<span class="sticker">${o.emoji}</span>` + (o.label ? `<span class="lbl">${o.label}</span>` : '');
    else { b.textContent = o.label; b.classList.add('num'); }
    b.addEventListener('click', () => answer(i, b));
    O.appendChild(b);
  });
  $('#quiz').classList.remove('hidden');
  drawWho(isl.creature, 2);
  Audio.speak(q.speak[LANG], LANG);
}
let whoAnim = null;
function drawWho(c, mood) {
  const k = $('#whoCv'), x = k.getContext('2d');
  cancelAnimationFrame(whoAnim);
  const loop = () => { x.clearRect(0, 0, 120, 120); drawCreature(x, c, 60, 108, 1.1, performance.now() / 1000, mood); whoAnim = requestAnimationFrame(loop); };
  loop();
}
function countAlong(n) { // number badges appear one by one on the prompt emojis
  const els = [...document.querySelectorAll('#qPrompt .pe')].slice(0, n);
  els.forEach((el, i) => setTimeout(() => { el.classList.add('counted'); el.dataset.n = i + 1; }, 350 * i + 300));
}
function answer(i, btn) {
  if (!currentQ || quizLocked) return;
  const q = currentQ, o = q.options[i];
  if (i === q.answer) {
    quizLocked = true; btn.classList.add('right'); [...$('#qOptions').children].forEach(b => b.disabled = true);
    Audio.sfx.good(); drawWho(currentIsl.creature, 1);
    const bonus = quizTries === 0 ? 10 : quizTries === 1 ? 5 : 2;
    const said = o.say ? (q.type === 'read' || q.type === 'letter' ? o.say[S.words] : o.say[LANG]) : '';
    if (said) { Audio.speak(said, (q.type === 'read' || q.type === 'letter') ? S.words : LANG); Audio.speak(pickPraise(LANG), LANG, true); } else Audio.speak(pickPraise(LANG), LANG);
    setTimeout(() => { $('#quiz').classList.add('hidden'); cancelAnimationFrame(whoAnim); deliver(bonus); }, 1100);
  } else {
    quizTries++; btn.classList.add('wrong'); btn.disabled = true; Audio.sfx.bad(); drawWho(currentIsl.creature, 2);
    setTimeout(() => btn.classList.remove('wrong'), 500);
    const said = o.say ? (q.type === 'read' || q.type === 'letter' ? o.say[S.words] : o.say[LANG]) : '';
    if (quizTries >= 2 || q.options.length - quizTries <= 1) {
      // no guessing games: show the answer kindly and move on
      quizLocked = true; const right = $('#qOptions').children[q.answer]; right.classList.add('right'); [...$('#qOptions').children].forEach(b => b.disabled = true);
      const t = teachText(q); Audio.speak(t[LANG], LANG);
      if (q.type === 'count' || q.type === 'add') countAlong(q.type === 'count' ? q.prompt.items.length : q.prompt.a + q.prompt.b);
      drawWho(currentIsl.creature, 1);
      setTimeout(() => { $('#quiz').classList.add('hidden'); cancelAnimationFrame(whoAnim); deliver(2); }, 3200);
    } else {
      // first miss: name what was tapped, then re-teach
      const young = +S.age <= 6, t = young ? teachText(q) : { pl: 'Spróbuj jeszcze raz. Popatrz uważnie!', en: 'Try again. Look carefully!' };
      if (said) { Audio.speak(tr(`To ${said}.`, `That's ${said}.`), (q.type === 'read' || q.type === 'letter') ? S.words : LANG); Audio.speak(t[LANG], LANG, true); } else Audio.speak(t[LANG], LANG);
      if (young && (q.type === 'count' || q.type === 'add')) countAlong(q.type === 'count' ? q.prompt.items.length : q.prompt.a + q.prompt.b);
    }
  }
}
const PRAISE = { pl: ['Brawo!', 'Super!', 'Świetnie!', 'Tak jest!', 'Wspaniale!'], en: ['Well done!', 'Super!', 'Great!', 'That\'s it!', 'Wonderful!'] };
const pickPraise = (l) => PRAISE[l][Math.floor(Math.random() * PRAISE[l].length)];
function deliver(bonus) {
  const isl = currentIsl, q = currentQ; isl.delivered = true; mail++; dayMail++; save.mail = mail; currentQ = null;
  save.missed = save.missed.filter(i => i !== isl.i); save.nextIsland = Math.max(save.nextIsland, isl.i + 1); dayGifts.push(q.item);
  // the answer changes the island and stays there
  if (q.type === 'color') isl.roofCol = COLORS.find(c => c.en === q.options[q.answer].say.en).hex;
  else if (q.type === 'shape') isl.gift = { kind: 'flag', shape: SHAPES.find(s => s.en === q.options[q.answer].say.en) };
  else if (q.type === 'pattern') isl.gift = { kind: 'bunting', items: q.prompt.items.slice(0, -1).concat(q.item) };
  else if (q.type === 'count' || q.type === 'add' || q.type === 'sub' || q.type === 'more') isl.gift = { kind: 'pile', e: q.item, n: Math.min(6, parseInt(q.options[q.answer].label) || q.options[q.answer].emojis?.length || 3) };
  else isl.gift = { kind: 'sign', e: q.item };
  addStars(bonus); updateHud(); confetti(dragon.x + 60, dragon.y - 40, 50); Audio.sfx.deliver();
  if (!save.friends.some(f => f.i === isl.i)) { save.friends.push({ i: isl.i, name: isl.creature.name, t: lastQType }); if (save.friends.length > 200) save.friends.shift(); }
  persist();
  const unlocked = SKINS.find(s => s.unlock === mail);
  toast(unlocked ? tr(`Nowy smok: ${unlocked.pl}! 🐉`, `New dragon: ${unlocked.en}! 🐉`) : tr(`List dostarczony! +${bonus} ⭐`, `Letter delivered! +${bonus} ⭐`), 2200);
  if (unlocked) buildSkins();
  if (dayMail >= DAY_GOAL) { setTimeout(dayEnd, 1600); return; }
  setTimeout(() => { dragon.state = 'takeoff'; dragon.landT = 0; dragon.from = { x: dragon.x, y: dragon.y }; }, 2600);
}
function promise() { // what is waiting next: computed from real progress
  const nextI = save.nextIsland, cur = Math.floor(nextI / 4), toBiome = (cur + 1) * 4 - nextI, b = BIOMES[(cur + 1) % BIOMES.length];
  const skin = SKINS.find(s => s.unlock > mail), hat = HATS.find(h => !save.hats.includes(h.id));
  const parts = [tr(`${b.pl} za ${toBiome} ${toBiome === 1 ? 'wyspę' : toBiome < 5 ? 'wyspy' : 'wysp'} 🏝️`, `${b.en} in ${toBiome} island${toBiome === 1 ? '' : 's'} 🏝️`)];
  if (skin) parts.push(tr(`smok ${skin.pl} za ${skin.unlock - mail} ${skin.unlock - mail === 1 ? 'list' : skin.unlock - mail < 5 ? 'listy' : 'listów'} 🐉`, `the ${skin.en} dragon in ${skin.unlock - mail} letter${skin.unlock - mail === 1 ? '' : 's'} 🐉`));
  if (hat && stars < hat.cost) parts.push(tr(`${hat.pl.toLowerCase()} za ${hat.cost - stars} ⭐`, `the ${hat.en.toLowerCase()} in ${hat.cost - stars} ⭐`));
  if (save.missed.length) parts.push(tr(`${save.missed.length} ${save.missed.length === 1 ? 'przyjaciel czeka' : 'przyjaciół czeka'} na list 💌`, `${save.missed.length} friend${save.missed.length === 1 ? '' : 's'} waiting for a letter 💌`));
  return parts.join(' · ');
}
function dayEnd() {
  save.days = (save.days || 0) + 1; persist(); paused = true;
  $('#dayN').textContent = save.days; $('#dayStars').textContent = stars; $('#dayGifts').textContent = dayGifts.join(' '); $('#dayPromise').textContent = tr('Następnym razem: ', 'Next time: ') + promise();
  const k = $('#dayCv'), x = k.getContext('2d'); x.clearRect(0, 0, 220, 150); drawDragon(x, 100, 86, 0, 0, skinOf(S.skin), 0.78, 0, { sleepy: true, hat: S.hat });
  $('#pause').classList.add('hidden'); $('#dayend').classList.remove('hidden'); Audio.sfx.unlock(); confetti(dragon.x + 60, dragon.y - 40, 80);
  Audio.speak(tr(`Wszystkie listy dostarczone! Dzień ${save.days} skończony. Brawo, smoczku!`, `All letters delivered! Day ${save.days} is done. Well done, little dragon!`), LANG);
}
$('#dayNext').addEventListener('click', () => { $('#dayend').classList.add('hidden'); paused = false; dayMail = 0; dayGifts = []; updateHud(); Audio.resume(); dragon.state = 'takeoff'; dragon.landT = 0; dragon.from = { x: dragon.x, y: dragon.y }; });

// ---------- render ----------
const glows = []; let wox = 0, woy = 0;
const addGlow = (x, y, r, col, a = 1) => { if (glows.length < 90 && x > -r && x < W + r && y > -r && y < VH + r) glows.push({ x, y, r, col, a }); };
const addGlowW = (x, y, r, col, a = 1) => addGlow(x + wox, y + woy, r, col, a);
let vignette = null;
function render() {
  const pal = palette(dayT);
  ctx.setTransform(scale * DPR, 0, 0, scale * DPR, 0, 0);
  glows.length = 0;
  const sx = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0;
  const sky = ctx.createLinearGradient(0, 0, 0, VH); sky.addColorStop(0, rgb(pal.top)); sky.addColorStop(0.55, rgb(pal.mid)); sky.addColorStop(1, rgb(pal.bottom));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, VH);
  if (pal.night > 0) {
    ctx.fillStyle = '#fff'; const r = mulberry(5); const ox = (cam.x * 0.03) % W;
    for (let i = 0; i < 90; i++) { const x = ((r() * W * 2 - ox) % (W * 2) + W * 2) % (W * 2) - W * 0.5, y = r() * VH * 0.7, tw = 0.5 + 0.5 * Math.sin(time * 2 + i); ctx.globalAlpha = tw * pal.night; ctx.beginPath(); ctx.arc(x, y, 1 + r() * 1.5, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.translate(0, OY); // world band
  const sunA = (dayT + 0.07) * TAU; const sunX = W * 0.5 - Math.cos(sunA) * W * 0.55 - cam.x * 0.02, sunY = H * 0.75 - Math.sin(sunA) * H * 0.7;
  const isNight = dayT > 0.6 && dayT < 0.9;
  if (!isNight) {
    const above = clamp(1 - (-sunY) / 200, 0, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.14 * above; ctx.translate(sunX, sunY); ctx.rotate(time * 0.04); ctx.drawImage(RAYS, -1200, -1200, 2400, 2400); ctx.restore();
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 74); sg.addColorStop(0, rgb(pal.sun, 1)); sg.addColorStop(0.6, rgb(pal.sun, 0.95)); sg.addColorStop(1, rgb(pal.sun, 0));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, sunY, 74, 0, TAU); ctx.fill();
    addGlow(sunX, sunY + OY, 110, rgb(pal.sun), 0.6);
  } else {
    const mx = W * 0.5 + Math.cos(sunA) * W * 0.55 - cam.x * 0.02, my = H * 0.75 + Math.sin(sunA) * H * 0.7;
    ctx.fillStyle = '#fff8d6'; ctx.beginPath(); ctx.arc(mx, my, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(pal.top); ctx.beginPath(); ctx.arc(mx + 18, my - 10, 38, 0, TAU); ctx.fill();
    addGlow(mx, my + OY, 110, '#fff8d6', 0.6);
  }
  for (const [p, yb, amp, col] of [[0.08, 560, 110, mix(pal.mount, pal.mid, 0.45)], [0.14, 610, 140, pal.mount]]) {
    ctx.fillStyle = rgb(col); ctx.beginPath(); ctx.moveTo(0, VH);
    for (let x = 0; x <= W; x += 12) { const wx = (x + cam.x * p) * 0.004; const y = yb - amp * (0.55 + 0.3 * Math.sin(wx * 1.3) + 0.25 * Math.sin(wx * 3.1 + 1.7) + 0.12 * Math.sin(wx * 7.3)); ctx.lineTo(x, y); }
    ctx.lineTo(W, VH); ctx.fill();
  }
  const haze = ctx.createLinearGradient(0, 440, 0, H + OY); haze.addColorStop(0, rgb(pal.haze, 0)); haze.addColorStop(1, rgb(pal.haze, 0.65)); ctx.fillStyle = haze; ctx.fillRect(0, 440, W, H + OY - 440);
  // cloud sea: soft rolling hills of cloud at the bottom, two layers
  for (const [p, yb, amp, a] of [[0.35, 640, 40, 0.5], [0.7, 690, 50, 0.7]]) {
    ctx.fillStyle = rgb(mix(pal.haze, [255, 255, 255], 0.5), a * (1 - pal.night * 0.4)); ctx.beginPath(); ctx.moveTo(0, H + OY + 10);
    for (let x = 0; x <= W; x += 10) { const wx = (x + cam.x * p) * 0.006; ctx.lineTo(x, yb - amp * (0.5 + 0.35 * Math.sin(wx * 1.7) + 0.25 * Math.sin(wx * 4.3 + 2) + 0.1 * Math.sin(wx * 9.1))); }
    ctx.lineTo(W, H + OY + 10); ctx.fill();
  }
  const cloudLayer = (sprites, p, count, ymin, ymax, s, alpha, tile) => {
    ctx.globalAlpha = alpha * (1 - pal.night * 0.5);
    const start = Math.floor((cam.x * p) / tile) - 1;
    for (let k = start; k < start + Math.ceil(W / tile) + 3; k++) {
      const r = mulberry(k * 977 + Math.floor(p * 1000));
      for (let j = 0; j < count; j++) { const sp = sprites[Math.floor(r() * sprites.length)]; const x = k * tile + r() * tile - cam.x * p + Math.sin(time * 0.1 + j) * 10, y = ymin + r() * (ymax - ymin) - cam.y * p; const sc = s * (0.7 + r() * 0.6); ctx.drawImage(sp, x, y, sp.width * sc, sp.height * sc); }
    }
    ctx.globalAlpha = 1;
  };
  cloudLayer(CLOUDS.far, 0.2, 2, 60 - OY * 0.5, 420, 0.9, 0.85, 900);
  const bp = 0.45; const bstart = Math.floor((cam.x * bp) / 1100) - 1;
  for (let k = bstart; k < bstart + Math.ceil(W / 1100) + 2; k++) {
    const r = mulberry(k * 311 + 5); if (r() < 0.35) continue;
    const sp = backSprite(k, pal); const x = k * 1100 + r() * 700 - cam.x * bp, y = 140 + r() * 260 - cam.y * bp + Math.sin(time * 0.4 + k) * 6;
    ctx.globalAlpha = 0.85; ctx.drawImage(sp, x, y); ctx.globalAlpha = 1;
  }
  cloudLayer(CLOUDS.mid, 0.6, 1, 100, 500, 0.8, 0.9, 1100);

  // ---- world layer (p = 1) ----
  ctx.save(); ctx.translate(-cam.x + sx, -cam.y + sy); wox = -cam.x + sx; woy = -cam.y + sy + OY;
  const skin = skinOf(S.skin);
  for (const rb of world.rainbows) { // rainbows left behind by popped clouds
    rb.t = Math.min(1, rb.t + 0.01); const cols = ['#ff5a6e', '#ff9f2e', '#ffd93d', '#5fe3b0', '#4fb8ff', '#b46cff'];
    ctx.save(); ctx.globalAlpha = 0.55 * rb.t; ctx.lineWidth = 9;
    cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(rb.x, rb.y + 60, (rb.r - i * 9) * rb.t, Math.PI, TAU); ctx.stroke(); });
    ctx.restore();
  }
  for (const isl of world.islands) {
    const sp = islandSprite(isl); const bob = Math.sin(time * 0.7 + isl.bob) * 6;
    const ix = isl.x - sp.cx, iy = isl.top - sp.top + bob;
    const sg2 = ctx.createRadialGradient(isl.x, iy + sp.bottom + 60, 0, isl.x, iy + sp.bottom + 60, isl.w * 0.55); sg2.addColorStop(0, 'rgba(30,20,80,.14)'); sg2.addColorStop(1, 'rgba(30,20,80,0)'); ctx.fillStyle = sg2; ctx.beginPath(); ctx.ellipse(isl.x, iy + sp.bottom + 60, isl.w * 0.55, 22, 0, 0, TAU); ctx.fill();
    ctx.drawImage(sp.c, ix, iy);
    if (pal.night > 0.02) { ctx.globalAlpha = pal.night * 0.9; ctx.drawImage(sp.n, ix, iy); ctx.globalAlpha = 1; }
    if (isl.waterfall) { const wx = isl.x + isl.w * 0.3; ctx.fillStyle = 'rgba(190,230,255,.75)'; for (let k = 0; k < 3; k++) { const ph = (time * 1.6 + k * 0.33) % 1; ctx.globalAlpha = 0.6 * (1 - ph); ctx.beginPath(); ctx.ellipse(wx + k * 6, isl.top + bob + 30 + ph * 230, 5, 20 + ph * 30, 0, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
    // warm light pools at night (window and lantern light the grass)
    const lit = isl.delivered || pal.night > 0.2;
    if (pal.night > 0.05 && lit) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * pal.night; ctx.drawImage(tinted('#ffb060'), isl.x + 10, isl.top + bob - 60, 140, 110); ctx.drawImage(tinted('#ffd080'), isl.x - 170, isl.top + bob - 100, 110, 110); ctx.restore(); }
    const hb = isl.biome.house[isl.i % 3];
    house(ctx, isl.x + 60, isl.top + bob + 8, hb, 0.9, isl, pal.night > 0.3);
    if (isl.delivered || pal.night > 0.3) addGlowW(isl.x + 60 + 19, isl.top + bob - 24, 60, isl.delivered ? '#ffd27a' : '#9fc7ff', isl.delivered ? 0.9 : 0.5);
    ctx.fillStyle = '#6b4a30'; ctx.fillRect(isl.x - 120, isl.top + bob - 50, 4, 56);
    ctx.fillStyle = lit ? '#ffe08a' : '#d9d2c8'; ctx.beginPath(); ctx.arc(isl.x - 118, isl.top + bob - 54, 7, 0, TAU); ctx.fill();
    if (lit) addGlowW(isl.x - 118, isl.top + bob - 54, 55, '#ffe08a', 1);
    // gifts: what the answer left on the island
    const gf = isl.gift;
    if (gf) {
      if (gf.kind === 'sign') { ctx.fillStyle = '#8a5a3a'; ctx.fillRect(isl.x - 60, isl.top + bob - 40, 4, 48); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(isl.x - 78, isl.top + bob - 66, 40, 34, 8); ctx.fill(); emoji(ctx, gf.e, isl.x - 58, isl.top + bob - 49, 22); }
      else if (gf.kind === 'pile') { for (let k = 0; k < gf.n; k++) emoji(ctx, gf.e, isl.x - 70 + (k % 3) * 20, isl.top + bob - 4 - Math.floor(k / 3) * 16, 18); }
      else if (gf.kind === 'flag') { ctx.fillStyle = '#8a5a3a'; ctx.fillRect(isl.x - 60, isl.top + bob - 80, 4, 88); ctx.save(); ctx.translate(isl.x - 56, isl.top + bob - 80); ctx.scale(0.3, 0.3); ctx.fillStyle = isl.roofCol || '#ff6fb5'; ctx.fill(new Path2D(gf.shape.path)); ctx.restore(); }
      else if (gf.kind === 'bunting') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(isl.x - 118, isl.top + bob - 54); ctx.quadraticCurveTo(isl.x - 30, isl.top + bob - 20, isl.x + 60, isl.top + bob - 70); ctx.stroke(); gf.items.forEach((e, k) => { const t = (k + 0.5) / gf.items.length; const px = lerp(isl.x - 118, isl.x + 60, t), py = (1 - t) * (1 - t) * (isl.top + bob - 54) + 2 * (1 - t) * t * (isl.top + bob - 20) + t * t * (isl.top + bob - 70); emoji(ctx, e, px, py + 10, 14); }); }
    }
    const mood = isl.delivered ? 1 : (dragon.state !== 'fly' && currentIsl === isl ? 2 : 0);
    drawCreature(ctx, isl.creature, isl.x - 10, isl.top + bob + 12, 0.95, time, mood);
    if (!isl.visited || (currentIsl === isl && dragon.state === 'landing')) {
      const rx = isl.x, ry = isl.top + bob - 170, pulse = 1 + Math.sin(time * 4) * 0.06;
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(time * 0.8);
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, 62 * pulse, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 5; ctx.setLineDash([22, 14]); ctx.beginPath(); ctx.arc(0, 0, 62 * pulse, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      drawEnvelope(ctx, rx, ry, 40);
      addGlowW(rx, ry, 80, '#ffe9a0', 0.45);
      for (let k = 0; k < 3; k++) { const a = time * 2 + k * 2.1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(rx + Math.cos(a) * 80, ry + Math.sin(a) * 80, 3, 0, TAU); ctx.fill(); }
    } else if (isl.delivered) {
      for (let k = 0; k < 2; k++) { const ph = (time * 0.6 + k * 0.5) % 1; ctx.globalAlpha = 1 - ph; drawHeart(ctx, isl.x - 10 + Math.sin(ph * 6 + k) * 14, isl.top + bob - 70 - ph * 60, 9, '#ffcc3d'); } ctx.globalAlpha = 1;
    }
  }
  for (const s of world.stars) {
    if (s.got) continue; const y = s.y + Math.sin(time * 3 + s.ph) * 6, r = s.big ? 20 : 14;
    drawStar(ctx, s.x, y, r, '#ffd93d', Math.sin(time * 2 + s.ph) * 0.3); addGlowW(s.x, y, r * 2.2, '#ffd93d', 0.7);
  }
  for (const s of world.storms) {
    const a = s.gone > 0 ? 1 - s.gone : 1; if (a <= 0) continue; ctx.globalAlpha = a;
    ctx.save(); ctx.translate(s.x, s.y + Math.sin(s.ph * 2) * 5); ctx.scale(1 + s.gone * 0.6, 1 + s.gone * 0.6);
    ctx.drawImage(STORM_SPRITE, -100, -70);
    const laugh = s.mood > 0;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-14, -4, 9, 10, 0, 0, TAU); ctx.ellipse(14, -4, 9, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1d4e'; ctx.beginPath(); ctx.arc(-12, -2, 5, 0, TAU); ctx.arc(16, -2, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a1d4e'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-26, -20); ctx.lineTo(-6, -12); ctx.moveTo(26, -20); ctx.lineTo(6, -12); ctx.stroke();
    ctx.beginPath(); if (laugh) ctx.arc(0, 14, 10, 0, Math.PI); else ctx.arc(0, 24, 10, Math.PI, TAU); ctx.stroke();
    if (Math.sin(s.ph * 7) > 0.9) { ctx.strokeStyle = '#ffe85c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, 40); ctx.lineTo(4, 56); ctx.lineTo(-4, 58); ctx.lineTo(6, 78); ctx.stroke(); addGlowW(s.x, s.y + 60, 40, '#ffe85c', 0.8); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(40,30,80,.5)'; ctx.lineWidth = 2;
  for (const b of world.birds) for (let k = 0; k < b.n; k++) { const bx = b.x + k * 22 * (k % 2 ? 1 : -1) * 0.5 + k * 10, by = b.y + Math.abs(k - b.n / 2) * 12, f = Math.sin(b.ph * 8 + k) * 5; ctx.beginPath(); ctx.moveTo(bx - 9, by); ctx.quadraticCurveTo(bx - 4, by - 6 + f, bx, by); ctx.quadraticCurveTo(bx + 4, by - 6 + f, bx + 9, by); ctx.stroke(); }
  for (const p of world.parts) {
    const k = 1 - p.life / p.max;
    if (p.kind === 'conf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, k * 2); ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); ctx.restore(); }
    else { ctx.globalAlpha = k; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.kind === 'fire' ? (0.5 + p.life / p.max) : k), 0, TAU); ctx.fill(); if (p.kind === 'fire' || p.kind === 'glow') addGlowW(p.x, p.y, p.r * 2.5, p.col, k * 0.6); }
    ctx.globalAlpha = 1;
  }
  const under = world.islands.find(o => Math.abs(o.x - dragon.x) < o.w * 0.5 && o.top > dragon.y);
  if (under) { const d = clamp((under.top - dragon.y) / 400, 0, 1); ctx.fillStyle = `rgba(30,20,80,${0.25 * (1 - d)})`; ctx.beginPath(); ctx.ellipse(dragon.x, under.top + 6 + Math.sin(time * 0.7 + under.bob) * 6, 60 * (1 - d * 0.5), 12 * (1 - d * 0.5), 0, 0, TAU); ctx.fill(); }
  drawDragon(ctx, dragon.x, dragon.y, dragon.ang, dragon.flap, skin, 0.9, time, { dizzy: dragon.dizzy > 0, hat: S.hat, sleepy: dragon.auto && dragon.state === 'fly' });
  if (dragon.dizzy > 0) for (let k = 0; k < 3; k++) { const a = time * 6 + k * 2.1; drawStar(ctx, dragon.x + 30 + Math.cos(a) * 30, dragon.y - 60 + Math.sin(a) * 10, 8); }
  if (dragon.auto && dragon.state === 'fly') { ctx.font = '800 26px "Baloo 2",sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'center'; for (let k = 0; k < 2; k++) { const ph = (time * 0.5 + k * 0.5) % 1; ctx.globalAlpha = 1 - ph; ctx.fillText('z', dragon.x + 70 + ph * 30, dragon.y - 60 - ph * 50); } ctx.globalAlpha = 1; }
  if (pal.night > 0.3) addGlowW(dragon.x + 45, dragon.y - 30, 40, '#fff6c2', 0.5 * pal.night);
  ctx.restore();
  cloudLayer(CLOUDS.front, 1.5, OY > 100 ? 3 : 1, 590, H + OY - 60, 0.9, 0.5, 1600);
  ctx.restore(); // world band
    // bloom
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, glow.width, glow.height);
  gctx.setTransform(1 / 6, 0, 0, 1 / 6, 0, 0);
  for (const g of glows) { gctx.globalAlpha = g.a * 0.7; gctx.drawImage(tinted(g.col), g.x - g.r, g.y - g.r, g.r * 2, g.r * 2); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9; ctx.imageSmoothingEnabled = true; ctx.drawImage(glow, 0, 0, W, VH); ctx.restore();
  if (!vignette) { vignette = ctx.createRadialGradient(W / 2, VH / 2, VH * 0.5, W / 2, VH / 2, VH * 1.1); vignette.addColorStop(0, 'rgba(20,10,60,0)'); vignette.addColorStop(1, 'rgba(20,10,60,.45)'); }
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, VH);
  if (pal.night > 0) { ctx.fillStyle = `rgba(10,8,50,${0.2 * pal.night})`; ctx.fillRect(0, 0, W, VH); }
}

// ---------- main loop ----------
let last = 0, acc = 0, badFrames = 0; const STEP = 1 / 120;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
  try {
    if (running && !paused) { acc += dt; let n = 0; while (acc >= STEP && n++ < 12) { update(STEP); acc -= STEP; } }
    else if (!running) { time += dt; dayT = (dayT + dt / DAY_LEN) % 1; idleFly(dt); }
    render();
  } catch (e) { if (badFrames++ < 3) console.error(e); }
}
function idleFly(dt) {
  dragon.x += 160 * dt; dragon.y = 330 + Math.sin(time * 1.2) * 60; dragon.ang = Math.cos(time * 1.2) * -0.2; dragon.flap += dt * 7; cam.x = dragon.x - W * 0.32;
  generateUpTo(Math.floor((dragon.x - world.firstIslandAt) / ISLAND_GAP) + 3);
  for (const p of world.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; } world.parts = world.parts.filter(p => p.life < p.max);
  dragon.trail += dt; if (dragon.trail > 0.05) { dragon.trail = 0; spawn(1, () => ({ x: dragon.x - 90, y: dragon.y + 4, vx: -40, vy: (Math.random() - 0.5) * 40, life: 0, max: 0.6, r: 3, col: '#fff8e0', g: 0, kind: 'dot' })); }
}

// ---------- input ----------
let holdPointer = null;
function hold(on) { if (on && !input.hold && running && !paused && dragon.state === 'fly') Audio.sfx.flap(); input.hold = on; if (on) dragon.idle = 0; }
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const ov = overlayOpen();
  if (ov && !['KeyP', 'Escape', 'KeyM'].includes(e.code)) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); hold(true); }
  if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') fireBreath();
  if (e.code === 'ArrowRight' || e.code === 'KeyD') speedKey = 1;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') speedKey = -1;
  if (e.code === 'KeyP' || e.code === 'Escape') { if (running && (!ov || !$('#pause').classList.contains('hidden'))) togglePause(); }
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') hold(false);
  if ((e.code === 'ArrowRight' || e.code === 'KeyD') && speedKey === 1) speedKey = 0;
  if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && speedKey === -1) speedKey = 0;
});
cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (holdPointer === null) { holdPointer = e.pointerId; hold(true); } });
const release = (e) => { if (e.pointerId === holdPointer || e.type === 'blur') { holdPointer = null; hold(false); } };
window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', release);
$('#fireBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fireBreath(); });
$('#fireBtn').addEventListener('click', (e) => e.preventDefault());

// ---------- menu, settings, album ----------
function togglePause() { paused = !paused; $('#pause').classList.toggle('hidden', !paused); hold(false); if (!paused) Audio.resume(); }
function toggleMute() { Audio.setMuted(!Audio.muted); $('#muteBtn').textContent = Audio.muted ? '🔇' : '🔊'; }
function buildSkins() {
  const el = $('.seg.skins'); el.innerHTML = '';
  for (const s of SKINS) {
    const b = document.createElement('button'); const locked = mail < s.unlock;
    b.style.background = `radial-gradient(circle at 35% 30%, ${s.belly}, ${s.body} 55%, ${s.wing})`;
    b.title = locked ? tr(`${s.pl} – dostarcz ${s.unlock} listów`, `${s.en} – deliver ${s.unlock} letters`) : tr(s.pl, s.en);
    b.classList.toggle('lock', locked); b.classList.toggle('on', S.skin === s.id); if (locked) b.textContent = '🔒';
    b.addEventListener('click', () => { if (locked) { toast(tr(`Dostarcz ${s.unlock} listów 📬`, `Deliver ${s.unlock} letters 📬`)); return; } S.skin = s.id; persist(); buildSkins(); Audio.sfx.click(); });
    el.appendChild(b);
  }
  const hs = $('.seg.hats'); hs.innerHTML = '';
  for (const h of HATS) {
    const b = document.createElement('button'); const owned = save.hats.includes(h.id);
    b.innerHTML = `${h.icon}${owned ? '' : `<small>⭐${h.cost}</small>`}`;
    b.title = tr(h.pl, h.en); b.classList.toggle('on', S.hat === h.id); b.classList.toggle('lock', !owned && stars < h.cost);
    b.addEventListener('click', () => {
      if (!owned) { if (stars < h.cost) { toast(tr(`Zbierz ${h.cost} gwiazdek ⭐`, `Collect ${h.cost} stars ⭐`)); return; } stars -= h.cost; save.stars = stars; save.hats.push(h.id); Audio.sfx.unlock(); toast(tr(`Masz ${h.pl.toLowerCase()}! 🎉`, `You got the ${h.en.toLowerCase()}! 🎉`)); }
      S.hat = h.id; persist(); buildSkins(); updateHud(); Audio.sfx.click();
    });
    hs.appendChild(b);
  }
  $('#menuStars').textContent = stars; $('#startPromise').textContent = (save.mail ? tr('Czeka na ciebie: ', 'Waiting for you: ') : tr('Na początek: ', 'To begin: ')) + promise();
}
function buildSettings() {
  document.querySelectorAll('#settings .seg[data-set]').forEach(seg => {
    const key = seg.dataset.set; if (key === 'skin' || key === 'hat') return;
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.v === S[key]);
      b.addEventListener('click', () => { S[key] = b.dataset.v; persist(); seg.querySelectorAll('button').forEach(o => o.classList.toggle('on', o === b)); Audio.sfx.click(); updateVoiceNote(); });
    });
  });
  buildSkins(); updateVoiceNote();
  $('#settingsToggle').addEventListener('click', () => { $('#settings').classList.toggle('open'); Audio.sfx.click(); });
}
function updateVoiceNote() {
  const n = $('#voiceNote');
  if (S.voice !== '1') { n.textContent = tr('Zagadki będą tylko na ekranie.', 'Riddles will be shown on screen only.'); return; }
  const ok = Audio.hasVoice(LANG);
  n.textContent = ok ? tr('Zagadki są czytane na głos – można grać bez umiejętności czytania.', 'Riddles are read aloud, so the game works before your child can read.')
    : tr('Jeśli przeglądarka ma polski głos, zagadki będą czytane na głos (na telefonie zwykle tak).', 'If the browser has an English voice, riddles are read aloud (phones usually do).');
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', updateVoiceNote);
function openAlbum() {
  if (!$('#album').classList.contains('hidden')) return;
  paused = true; hold(false);
  const grid = $('#albumGrid'); grid.innerHTML = '';
  const friends = save.friends.slice(-40);
  $('#albumNote').textContent = friends.length ? tr(`Masz już ${save.friends.length} przyjaciół. Najlepsze combo: ${bestCombo}. Dni poczty: ${save.days || 0}.`, `You have ${save.friends.length} friends. Best combo: ${bestCombo}. Postman days: ${save.days || 0}.`) : tr('Dostarcz list, żeby poznać pierwszego przyjaciela!', 'Deliver a letter to meet your first friend!');
  const TYPES = { count: ['liczenie', 'counting'], color: ['kolory', 'colours'], shape: ['kształty', 'shapes'], letter: ['litery', 'letters'], read: ['czytanie', 'reading'], add: ['dodawanie', 'adding'], sub: ['odejmowanie', 'subtracting'], odd: ['co nie pasuje', 'odd one out'], pattern: ['wzory', 'patterns'], more: ['więcej', 'more or less'] };
  for (const f of friends) {
    const c = makeCreature(f.i); const d = document.createElement('div'); d.className = 'f';
    const k = document.createElement('canvas'); k.width = 90; k.height = 90; drawCreature(k.getContext('2d'), c, 45, 84, 0.95, f.i, 1);
    d.appendChild(k); d.insertAdjacentHTML('beforeend', `<span>${c.name}</span><small>${biomeOf(f.i)[LANG]}</small><small>${(TYPES[f.t] || ['', ''])[LANG === 'pl' ? 0 : 1]}</small>`);
    grid.appendChild(d);
  }
  for (let i = friends.length; i < Math.max(8, friends.length + 2); i++) { const d = document.createElement('div'); d.className = 'f empty'; d.innerHTML = '<span style="font-size:40px">❔</span><small>…</small>'; grid.appendChild(d); }
  $('#album').classList.remove('hidden');
}
$('#albumBtn').addEventListener('click', () => { if (!overlayOpen()) openAlbum(); });
$('#albumClose').addEventListener('click', () => { $('#album').classList.add('hidden'); paused = false; Audio.resume(); });
$('#pauseBtn').addEventListener('click', () => { if (!overlayOpen() || !$('#pause').classList.contains('hidden')) togglePause(); });
$('#resumeBtn').addEventListener('click', togglePause);
$('#muteBtn').addEventListener('click', toggleMute);
$('#menuBtn').addEventListener('click', () => { paused = false; $('#pause').classList.add('hidden'); running = false; $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); $('#start').classList.remove('hidden'); hint(null); persist(); buildSkins(); });
$('#qSpeak').addEventListener('click', () => { if (currentQ) Audio.speak(currentQ.speak[LANG], LANG); });
$('#playBtn').addEventListener('click', () => {
  Audio.init(); Audio.resume(); Audio.setVoice(S.voice === '1'); Audio.startMusic(); Audio.sfx.ring();
  $('#start').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#touch').classList.remove('hidden');
  resetRun(); running = true; paused = false; updateHud();
  hint(tr(isTouch ? 'Trzymaj palec, żeby lecieć w górę. Leć przez kółko z listem! 💫' : 'Trzymaj Spację, żeby lecieć w górę. Leć przez kółko z listem! 💫', isTouch ? 'Hold the screen to fly up. Fly through the ring with the letter! 💫' : 'Hold Space to fly up. Fly through the ring with the letter! 💫'));
  setTimeout(() => hint(null), 7000);
  Audio.speak(tr('Smoczku, leć! Przyjaciele czekają na listy.', 'Little dragon, fly! Your friends are waiting for their letters.'), LANG);
});
(function logo() { const k = $('#logoCv'), x = k.getContext('2d'); const loop = () => { requestAnimationFrame(loop); if ($('#start').classList.contains('hidden')) return; x.clearRect(0, 0, 220, 150); const t = performance.now() / 1000; drawDragon(x, 95, 80 + Math.sin(t * 2) * 5, Math.cos(t * 2) * -0.08, t * 7, skinOf(S.skin), 0.78, t, { hat: S.hat }); }; loop(); })();

// ---------- start ----------
resize(); buildSettings(); updateHud(); resetRun(); dragon.state = 'menu'; running = false;
requestAnimationFrame((n) => { last = n; frame(n); });
