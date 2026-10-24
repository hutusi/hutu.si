// Falling petals: shed when the magpie lands or flutters, or when a visitor brushes a blossom.
// They drift and flutter (flipping to show their paler back), slide off around the card instead
// of settling on it, and fade before the bottom of the screen.

const TONES = [[244, 208, 208], [240, 198, 201], [246, 214, 210], [238, 204, 207]];

export function spawnPetal(petals, f, vx, vy, rand, max) {
  if (!f || petals.length >= max) return;
  const r = f.r * (0.5 + rand() * 0.12);
  petals.push({
    x: f.x + (rand() - 0.5) * 4,
    y: f.y,
    vx: 3 + vx,
    vy: 3 + Math.max(0, vy),
    wind: 3 + rand() * 5,
    fall: 13 + rand() * 8,
    r,
    rot: rand() * 6.28,
    vr: (rand() - 0.5) * 1.2,
    ph: rand() * 6.28,
    ph2: rand() * 6.28,
    fw: 1.2 + rand() * 0.7,
    tw: 1.5 + rand() * 1.4,
    amp: 9 + rand() * 12,
    notch: rand() < 0.5 ? r * 0.1 : 0,
    tone: rand.pick(TONES),
    age: 0,
  });
}

// Advances and draws every petal; returns the petals still in view. `card` is the card's rect,
// `view` the visible area, both in stage coordinates.
export function stepPetals(c, petals, dt, card, view) {
  const midX = (card[0] + card[2]) / 2;
  const floor = view.y1 + 15;
  const keep = [];
  for (const q of petals) {
    q.age += dt;
    const overCard = q.x > card[0] && q.x < card[2] && q.y > card[1] && q.y < card[3];
    if (overCard) {
      q.vy += (q.fall * 3.4 - q.vy) * dt * 1.6;
      q.vx += ((q.x < midX ? -1 : 1) * 30 - q.vx) * dt * 1.4;
    } else {
      q.vx += (q.wind - q.vx) * dt * 0.5;
      q.vy += (q.fall - q.vy) * dt * 0.8;
    }
    const ph = q.age * q.fw + q.ph;
    const cw = Math.cos(ph);
    const sw = Math.sin(ph);
    q.x += (q.vx + cw * q.amp * (overCard ? 0.25 : 1)) * dt;
    q.y += q.vy * (0.55 + 0.45 * Math.abs(cw)) * dt;
    q.rot += q.vr * dt;
    if (q.y > floor || q.x > view.x1 + 20 || q.x < view.x0 - 20) continue;
    // Tumbling: flip through edge-on (scaleX → 0) to the back face.
    const flip = Math.cos(q.age * q.tw + q.ph2);
    const sx = (flip < 0 ? -1 : 1) * Math.max(0.16, Math.abs(flip));
    const sy = 0.84 + 0.16 * Math.cos(q.age * q.tw * 0.6 + q.ph);
    c.save();
    c.translate(q.x, q.y);
    c.rotate(q.rot + sw * 0.55);
    c.scale(sx, sy);
    c.globalAlpha = Math.max(0, Math.min(1, q.age / 0.3) * Math.min(1, (floor - 3 - q.y) / 70));
    drawPetal(c, q, flip < 0);
    c.restore();
    keep.push(q);
  }
  return keep;
}

function drawPetal(c, q, back) {
  const r = q.r;
  const [hr, hg, hb] = q.tone;
  const tint = (a, b, d, alpha) =>
    `rgba(${Math.min(255, Math.max(0, hr + a))},${Math.min(255, Math.max(0, hg + b))},${Math.min(255, Math.max(0, hb + d))},${alpha})`;
  const p = new Path2D();
  p.moveTo(0, r * 0.98);
  p.bezierCurveTo(-r * 0.42, r * 0.8, -r * 1.02, r * 0.24, -r * 0.97, -r * 0.32);
  p.bezierCurveTo(-r * 0.92, -r * 0.86, -r * 0.44, -r * 1.05, -r * 0.07, -r * 0.94);
  p.quadraticCurveTo(0, -r * 0.94 + q.notch, r * 0.07, -r * 0.94);
  p.bezierCurveTo(r * 0.44, -r * 1.05, r * 0.92, -r * 0.86, r * 0.97, -r * 0.32);
  p.bezierCurveTo(r * 1.02, r * 0.24, r * 0.42, r * 0.8, 0, r * 0.98);
  const g = c.createRadialGradient(0, r * 0.95, 0, 0, r * 0.2, r * 1.5);
  g.addColorStop(0, tint(-42, -74, -64, 0.82));
  g.addColorStop(0.3, tint(-10, -28, -24, 0.7));
  g.addColorStop(1, tint(6, 16, 14, back ? 0.5 : 0.62));
  c.fillStyle = g;
  c.fill(p);
  c.save();
  c.clip(p);
  const sheen = c.createRadialGradient(-r * 0.3, -r * 0.38, 0, -r * 0.3, -r * 0.38, r * 0.85);
  sheen.addColorStop(0, back ? 'rgba(255,250,248,0.18)' : 'rgba(255,250,248,0.4)');
  sheen.addColorStop(1, 'rgba(255,250,248,0)');
  c.fillStyle = sheen;
  c.fillRect(-r * 1.1, -r * 1.1, r * 2.2, r * 2.2);
  c.strokeStyle = tint(-56, -96, -86, 0.2);
  c.lineWidth = Math.max(0.22, r * 0.055);
  c.lineCap = 'round';
  c.beginPath();
  for (const v of [-0.64, -0.32, 0, 0.32, 0.64]) {
    c.moveTo(0, r * 0.86);
    c.quadraticCurveTo(v * r * 0.45, r * 0.12, v * r * 0.95, -r * (0.84 - Math.abs(v) * 0.42));
  }
  c.stroke();
  c.restore();
  c.strokeStyle = tint(-46, -84, -74, 0.28);
  c.lineWidth = Math.max(0.22, r * 0.05);
  c.stroke(p);
}
