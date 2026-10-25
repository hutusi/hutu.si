// Plum flowers and moss dots. Flowers open over their bloom time p (0..1, overshooting slightly)
// and are drawn in local coordinates: rotated to face away from the twig, squashed by `sy` to
// suggest perspective. Port of the design's g4Draw / g4Blossom.

// Ease-out with a little overshoot, for petals unfolding.
export const ease = (p) => {
  const q = p - 1;
  return 1 + 2.5 * q * q * q + 1.5 * q * q;
};

export function drawFlora(c, f, p) {
  if (f.kind === 'moss') {
    const e = Math.min(1, p * 1.2);
    c.fillStyle = 'rgba(22,16,12,0.92)';
    for (const d of f.dots) {
      c.beginPath();
      c.ellipse(f.x + d.x, f.y + d.y, d.rx * e + 0.01, d.ry * e + 0.01, d.rot, 0, 6.283);
      c.fill();
    }
  } else drawBlossom(c, f, p);
}

// kind: 'bud', 'blossom' (open, face-on), 'half' or 'side' (seen from the side).
function drawBlossom(c, f, p) {
  const e = p >= 1 ? 1 : ease(p), r = f.r * e;
  if (r < 0.3) return;
  const [R0, G0, B0] = f.col, mix = (k2) => `rgb(${R0 + (248 - R0) * k2 | 0},${G0 + (238 - G0) * k2 | 0},${B0 + (228 - B0) * k2 | 0})`;
  const line = `rgba(${R0 * 0.78 | 0},${G0 * 0.55 | 0},${B0 * 0.55 | 0},0.3)`, vein = `rgba(${R0 * 0.7 | 0},${G0 * 0.5 | 0},${B0 * 0.5 | 0},0.22)`;
  const hsh = (i) => {
    const s = Math.sin(i * 12.9898 + f.pa * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const sa = p >= 1 ? 1 : Math.max(0, Math.min(1, (p - 0.5) / 0.4)), PI2 = Math.PI / 2;
  c.save();
  c.translate(f.x, f.y);
  c.rotate(f.rot);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const grad = (x, y, R) => {
    const g = c.createRadialGradient(x, y, R * 0.05, x, y, R);
    g.addColorStop(0, mix(0.05));
    g.addColorStop(0.45, mix(0.45));
    g.addColorStop(1, mix(0.86));
    return g;
  };
  const petal = (x0, y0, ang, len, wid, fill) => {
    const ca = Math.cos(ang), sn = Math.sin(ang), Q = (u, v) => [x0 + ca * u * len - sn * v * wid, y0 + sn * u * len + ca * v * wid];
    c.beginPath();
    c.moveTo(...Q(0, -0.1));
    c.bezierCurveTo(...Q(0.22, -0.34), ...Q(0.46, -0.56), ...Q(0.7, -0.53));
    c.bezierCurveTo(...Q(0.92, -0.48), ...Q(1.03, -0.22), ...Q(1, 0));
    c.bezierCurveTo(...Q(1.03, 0.22), ...Q(0.92, 0.48), ...Q(0.7, 0.53));
    c.bezierCurveTo(...Q(0.46, 0.56), ...Q(0.22, 0.34), ...Q(0, 0.1));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = line;
    c.lineWidth = 0.45;
    c.stroke();
    if (len > 4) {
      c.strokeStyle = vein;
      c.lineWidth = 0.35;
      c.beginPath();
      for (const v of [-0.2, 0, 0.2]) {
        c.moveTo(...Q(0.12, v * 0.3));
        c.quadraticCurveTo(...Q(0.45, v * 0.9), ...Q(0.78, v * 1.2));
      }
      c.stroke();
    }
  };
  const sepal = (x0, y0, ang, len, wid) => {
    const ca = Math.cos(ang), sn = Math.sin(ang), Q = (u, v) => [x0 + ca * u * len - sn * v * wid, y0 + sn * u * len + ca * v * wid];
    c.beginPath();
    c.moveTo(...Q(0, -0.5));
    c.bezierCurveTo(...Q(0.5, -0.7), ...Q(1.05, -0.3), ...Q(1, 0));
    c.bezierCurveTo(...Q(1.05, 0.3), ...Q(0.5, 0.7), ...Q(0, 0.5));
    c.closePath();
    const g = c.createLinearGradient(...Q(0, 0), ...Q(1, 0));
    g.addColorStop(0, '#3a2a1e');
    g.addColorStop(0.6, '#5b3024');
    g.addColorStop(1, '#7a3c2c');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(30,18,12,0.7)';
    c.lineWidth = 0.4;
    c.stroke();
  };
  const stamens = (x0, y0, n, a0, a1, l0, l1) => {
    if (sa <= 0) return;
    c.save();
    c.globalAlpha *= sa;
    const tips = [];
    c.strokeStyle = 'rgba(120,66,50,0.7)';
    c.lineWidth = 0.4;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * ((i + hsh(i) * 0.8) / n), L = l0 + (l1 - l0) * hsh(i + 40), bend = (hsh(i + 80) - 0.5) * 0.3, tx = x0 + Math.cos(a) * L, ty = y0 + Math.sin(a) * L;
      c.moveTo(x0 + Math.cos(a) * L * 0.15, y0 + Math.sin(a) * L * 0.15);
      c.quadraticCurveTo(x0 + Math.cos(a + bend) * L * 0.6, y0 + Math.sin(a + bend) * L * 0.6, tx, ty);
      tips.push([tx, ty, a]);
    }
    c.stroke();
    for (const [tx, ty, a] of tips) {
      c.beginPath();
      c.ellipse(tx, ty, 0.95, 0.62, a, 0, 6.283);
      c.fillStyle = '#d4a443';
      c.fill();
      c.strokeStyle = 'rgba(110,70,28,0.75)';
      c.lineWidth = 0.3;
      c.stroke();
    }
    c.restore();
  };
  const stub = () => {
    c.strokeStyle = '#3e271d';
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(0, r * 0.16);
    c.lineTo(0, -r * 0.12);
    c.stroke();
  };
  const k = f.kind;
  if (k === 'bud') {
    c.strokeStyle = '#3a2219';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(0, r * 0.14);
    c.lineTo(0, -r * 0.08);
    c.stroke();
    const W = r * 0.5, top = -r * 1.28, base = -r * 0.16;
    c.beginPath();
    c.moveTo(0, top);
    c.bezierCurveTo(W * 0.5, top + r * 0.22, W * 1.05, base - r * 0.42, W * 0.92, base - r * 0.16);
    c.bezierCurveTo(W * 0.8, base + r * 0.04, -W * 0.8, base + r * 0.04, -W * 0.92, base - r * 0.16);
    c.bezierCurveTo(-W * 1.05, base - r * 0.42, -W * 0.5, top + r * 0.22, 0, top);
    c.closePath();
    const gb = c.createLinearGradient(0, base, 0, top);
    gb.addColorStop(0, mix(0.02));
    gb.addColorStop(0.55, mix(0.22));
    gb.addColorStop(1, mix(0.42));
    c.fillStyle = gb;
    c.fill();
    c.strokeStyle = line;
    c.lineWidth = 0.45;
    c.stroke();
    c.strokeStyle = vein;
    c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(0, top + r * 0.08);
    c.quadraticCurveTo(W * 0.3, (top + base) / 2, W * 0.1, base - r * 0.1);
    c.stroke();
    sepal(0, -r * 0.06, -PI2 - 0.62, r * 0.5, r * 0.4);
    sepal(0, -r * 0.06, -PI2 + 0.62, r * 0.5, r * 0.4);
    sepal(0, -r * 0.06, -PI2, r * 0.36, r * 0.42);
  } else if (k === 'blossom') {
    c.scale(1, f.sy);
    for (let i = 0; i < 5; i++) sepal(0, 0, f.pa + i * 1.2566 + f.pj[i] + 0.628, r * 0.98, r * 0.34);
    const g = grad(0, 0, r);
    for (let i = 0; i < 5; i++) {
      const a = f.pa + i * 1.2566 + f.pj[i];
      petal(Math.cos(a) * r * 0.06, Math.sin(a) * r * 0.06, a, r * (0.94 + f.pj[i]), r * 0.92, g);
    }
    c.fillStyle = '#c7bf86';
    c.beginPath();
    c.arc(0, 0, r * 0.15, 0, 6.283);
    c.fill();
    c.strokeStyle = 'rgba(120,96,50,0.6)';
    c.lineWidth = 0.35;
    c.stroke();
    stamens(0, 0, 24, 0, 6.283, r * 0.36, r * 0.66);
    if (sa > 0) {
      c.fillStyle = `rgba(170,176,120,${sa})`;
      c.beginPath();
      c.arc(0, 0, r * 0.06, 0, 6.283);
      c.fill();
    }
  } else {
    const half = k === 'half', bo = half ? 0.62 : 0.34, fo = half ? 1.25 : 0.82, pl = half ? 0.78 : 0.72;
    stub();
    [-1.15, 1.15, 0].forEach((a) => sepal(0, -r * 0.16, PI2 + a, r * (a ? 0.42 : 0.3), r * 0.38));
    const g = grad(0, -r * 0.25, r), g2 = grad(0, -r * 0.1, r * 0.95);
    petal(0, -r * 0.28, -PI2 - bo, r * pl, r * 0.82, g);
    petal(0, -r * 0.28, -PI2 + bo, r * pl, r * 0.82, g);
    stamens(0, -r * 0.3, half ? 16 : 10, -PI2 - (half ? 0.75 : 0.4), -PI2 + (half ? 0.75 : 0.4), r * (half ? 0.45 : 0.4), r * (half ? 0.75 : 0.62));
    petal(0, -r * 0.18, -PI2 - fo, r * (pl - 0.06), r * 0.8, g2);
    petal(0, -r * 0.18, -PI2 + fo, r * (pl - 0.06), r * 0.8, g2);
    c.save();
    c.translate(0, -r * 0.12);
    c.scale(1, half ? 0.6 : 0.7);
    petal(0, 0, -PI2, r * 0.82, r * 0.9, g2);
    c.restore();
  }
  c.restore();
}
