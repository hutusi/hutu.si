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

  // The branch and magpie are an enhancement: load them only after the card is on screen.
  const scene = () =>
    requestAnimationFrame(() => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'asset:scene.js';
      document.head.append(s);
    });
  if (document.readyState === 'complete') scene();
  else addEventListener('load', scene);
})();
