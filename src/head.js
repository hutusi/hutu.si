// Runs in <head>, before the first paint: picks the card side, skips the intro on a repeat visit
// in the same session, and fits the design stage to the viewport. The layout is published on
// window.hutuStage (plus a "stage" event) for the deferred scene script.
(() => {
  const root = document.documentElement;
  const lang = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  if (!/^zh/i.test(lang)) {
    root.classList.add('en');
    root.lang = 'en';
  }
  try {
    if (sessionStorage.getItem('hutusi:seen')) root.classList.add('seen');
    sessionStorage.setItem('hutusi:seen', '1');
  } catch {}

  // Per composition: stage size, the region we try to show whole ([x0, y0, x1, y1]) and the
  // region that must stay visible when the viewport is too small to show it all readably.
  const tallQuery = matchMedia('(max-aspect-ratio: 9/10)');
  const COMPOSITIONS = {
    wide: { w: 1280, h: 800, frame: [0, 0, 1280, 800], core: [290, 156, 990, 568] },
    tall: { w: 390, h: 844, frame: [0, 0, 390, 810], core: [0, 222, 390, 810] },
  };
  const MAX_SCALE = 1.5;
  const MIN_READABLE = 0.8;

  const fit = () => {
    const tall = tallQuery.matches;
    const { w, h, frame: f, core: c } = COMPOSITIONS[tall ? 'tall' : 'wide'];
    const vw = innerWidth;
    const vh = innerHeight;
    let s = Math.min(MAX_SCALE, vw / (f[2] - f[0]), vh / (f[3] - f[1]));
    if (s < MIN_READABLE) s = Math.min(MIN_READABLE, vw / (c[2] - c[0]), vh / (c[3] - c[1]));
    s = Math.round(s * 1000) / 1000;
    // Centre the frame horizontally; vertically show its top first. Then pull the core into view.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ox = clamp((vw - (f[0] + f[2]) * s) / 2, -c[0] * s, vw - c[2] * s);
    const fitsV = (f[3] - f[1]) * s <= vh;
    const oy = clamp(fitsV ? (vh - (f[1] + f[3]) * s) / 2 : -f[1] * s, -c[1] * s, vh - c[3] * s);
    root.style.setProperty('--s', s);
    root.style.setProperty('--ox', `${Math.round(ox)}px`);
    root.style.setProperty('--oy', `${Math.round(oy)}px`);
    window.hutuStage = { tall, w, h, s, ox: Math.round(ox), oy: Math.round(oy), vw, vh };
    dispatchEvent(new Event('stage'));
  };
  fit();
  addEventListener('resize', fit);
})();
