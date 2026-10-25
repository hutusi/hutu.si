// Runs at the end of <body>: card flipping, the WeChat popups, and loading the scene once the
// page has painted. Kept tiny because it is inlined into the critical HTML.
(() => {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const card = $('card');
  const turn = $('turn');
  let liftTimer;

  // Only the visible face is reachable by keyboard and assistive technology.
  const sync = () => {
    const en = root.classList.contains('en');
    $('front').inert = en;
    $('back').inert = !en;
    root.lang = en ? 'en' : 'zh-Hans';
    turn.textContent = en ? '翻回中文 · Flip to Chinese' : 'Flip to English · 翻到英文';
  };
  const flip = () => {
    root.classList.toggle('en');
    sync();
    card.classList.add('lift');
    clearTimeout(liftTimer);
    liftTimer = setTimeout(() => card.classList.remove('lift'), 420);
  };
  sync();
  turn.addEventListener('click', flip);
  card.addEventListener('click', (e) => {
    if (!e.target.closest('a, button, img, .pop')) flip();
  });

  const popups = [...document.querySelectorAll('.wx')];
  const show = (wx, open) => {
    wx.classList.toggle('open', open);
    // Closing it under the pointer also holds off the hover preview until the pointer leaves.
    wx.classList.toggle('shut', !open && wx.matches(':hover'));
    wx.querySelector('button').setAttribute('aria-expanded', open);
  };
  for (const wx of popups) {
    wx.querySelector('button').addEventListener('click', () => show(wx, !wx.classList.contains('open')));
    wx.addEventListener('focusout', (e) => wx.contains(e.relatedTarget) || show(wx, false));
    wx.addEventListener('pointerleave', () => wx.classList.remove('shut'));
  }
  document.addEventListener('pointerdown', (e) => {
    for (const wx of popups) if (!wx.contains(e.target)) show(wx, false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') for (const wx of popups) show(wx, false);
  });

  // A logo still on its way fades in over its placeholder (if it fails, the placeholder stays;
  // one that failed already is `complete` too, but has no width).
  for (const img of document.querySelectorAll('.seal img')) {
    if (img.complete && img.naturalWidth) continue;
    img.parentNode.classList.add('wait');
    img.addEventListener('load', () => img.parentNode.classList.remove('wait'));
  }

  // The branch and magpie are an enhancement: load them only once the card is on screen and its
  // fonts have arrived, so they never compete with it. (Not on the load event: preloads don't
  // hold it back, so it can fire before the fonts are in, and the analytics beacon Cloudflare
  // adds to the page can hold it back long after.)
  const scene = () => {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'asset:scene.js';
    document.head.append(s);
  };
  // Wait for the card's first paint (a fast load can finish before it); by then the card has
  // requested its fonts, so `ready` waits for them. Without paint timing, wait two frames.
  const painted = (go) =>
    PerformanceObserver.supportedEntryTypes?.includes('paint')
      ? new PerformanceObserver((list, observer) => {
          if (list.getEntriesByName('first-contentful-paint').length) observer.disconnect(), go();
        }).observe({ type: 'paint', buffered: true })
      : requestAnimationFrame(() => requestAnimationFrame(go));
  painted(() => document.fonts.ready.then(scene));

  // Return visits: a service worker (sw.js) keeps a copy of the card, so it shows at once, even
  // offline. It is registered only once the card has painted, the page has loaded and the
  // browser is idle, so a first visit is exactly as fast as without it. (A fast load can finish
  // before the first paint, hence both.) With its kill switch on, it is unregistered instead.
  const sw = navigator.serviceWorker;
  if (sw) {
    const loaded = (fn) => (document.readyState === 'complete' ? fn() : addEventListener('load', fn, { once: true }));
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 1000));
    const run = () => (__SERVICE_WORKER__ ? sw.register('/sw.js') : sw.getRegistrations().then((all) => Promise.all(all.map((r) => r.unregister())))).catch(() => {});
    painted(() => loaded(() => idle(run)));
  }
})();
