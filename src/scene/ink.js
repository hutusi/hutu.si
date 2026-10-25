// Brush rendering for branch strokes, one path segment at a time so a stroke can be drawn as it
// grows. Thick strokes are shaded across their width as if lit from the upper left; dry-brush
// streaks and bark marks trail a few segments behind the tip.

// Segment i of a stroke (from point i-1 to i).
export function drawSegment(c, st, i) {
  const P = st.pts;
  const a = P[i - 1];
  const b = P[i];
  const [L0, L1, R0, R1] = [st.L[i - 1], st.L[i], st.R[i - 1], st.R[i]];
  // Overlap slightly backwards so consecutive quads leave no seams.
  const ex = (b.x - a.x) / 6;
  const ey = (b.y - a.y) / 6;
  c.beginPath();
  c.moveTo(L0[0] - ex, L0[1] - ey);
  c.lineTo(L1[0], L1[1]);
  c.lineTo(R1[0], R1[1]);
  c.lineTo(R0[0] - ex, R0[1] - ey);
  c.closePath();
  // Ink density drifts slowly along the stroke.
  const k = 0.5 + 0.5 * Math.sin(i * st.df + st.dp);
  const rgb = (r, g, bl, m) => `rgb(${(r + k * m) | 0},${(g + k * m * 0.8) | 0},${(bl + k * m * 0.7) | 0})`;
  const tip = () => {
    if (i !== P.length - 1) return;
    c.beginPath();
    c.arc(b.x, b.y, b.w * 0.55, 0, 6.283);
    c.fill();
  };
  if (b.w < 2.4) {
    c.fillStyle = rgb(36, 28, 23, 10);
    c.fill();
    tip();
    return;
  }
  const light = b.nx * -0.6 + b.ny * -0.8;
  const tone = (s) => {
    const q = Math.pow(Math.max(0, Math.min(1, s)), 1.3);
    return rgb(21 + 51 * q, 16 + 44 * q, 12 + 38 * q, 12 * q);
  };
  const g = c.createLinearGradient(L1[0], L1[1], R1[0], R1[1]);
  g.addColorStop(0, tone(0.5 - 0.5 * light));
  g.addColorStop(0.5, rgb(36, 29, 24, 8));
  g.addColorStop(1, tone(0.5 + 0.5 * light));
  c.fillStyle = g;
  c.fill();
  tip();
}

// Pseudo-random but stable per (i, seed): the same stroke always gets the same marks.
const hash = (x) => x - Math.floor(x);

export function drawStreak(c, st, i) {
  if (i < 2) return;
  const P = st.pts;
  const a = P[i - 1];
  const b = P[i];
  const w = b.w;
  if (w < 4.5) return;
  const lit = b.nx * -0.6 + b.ny * -0.8 > 0 ? 1 : -1;
  c.lineCap = 'butt';
  for (const ln of st.lanes) {
    const v = Math.sin(i * ln.f + ln.p) + 0.55 * Math.sin(i * ln.f * 2.3 + ln.p * 1.7);
    if (v < ln.th) continue;
    if (hash(Math.sin(i * 12.99 + ln.p * 78.2) * 43758.5) < 0.35) continue;
    const oa = ln.o + 0.04 * Math.sin((i - 1) * 0.9 + ln.p);
    const ob = ln.o + 0.04 * Math.sin(i * 0.9 + ln.p);
    c.strokeStyle = `rgba(232,224,210,${Math.min(0.42, 0.12 + (v - ln.th) * 0.9).toFixed(3)})`;
    c.lineWidth = ln.lw * Math.min(1, w / 9);
    c.beginPath();
    c.moveTo(a.x + a.nx * lit * oa * a.w, a.y + a.ny * lit * oa * a.w);
    c.lineTo(b.x + b.nx * lit * ob * w, b.y + b.ny * lit * ob * w);
    c.stroke();
  }
  if (w <= 7) return;
  // Occasional bark crease or knot on the shaded side of thick strokes.
  const h = hash(Math.sin(i * 91.7 + st.dp * 13.1) * 43758.5453);
  const s = -lit;
  const { nx, ny } = b;
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  if (h < 0.06) {
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(10,7,5,0.42)';
    c.lineWidth = 0.75;
    c.beginPath();
    c.moveTo(b.x + nx * s * w * 0.46, b.y + ny * s * w * 0.46);
    c.quadraticCurveTo(b.x + ux * 0.8 + nx * s * w * 0.22, b.y + uy * 0.8 + ny * s * w * 0.22, b.x + ux * 0.3 + nx * s * w * 0.02, b.y + uy * 0.3 + ny * s * w * 0.02);
    c.stroke();
  } else if (h > 0.94) {
    c.fillStyle = 'rgba(12,8,6,0.35)';
    c.beginPath();
    c.ellipse(b.x + nx * s * w * 0.3, b.y + ny * s * w * 0.3, w * 0.09 + 0.6, w * 0.05 + 0.4, Math.atan2(ny, nx), 0, 6.283);
    c.fill();
  }
}
