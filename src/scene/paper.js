// Paper texture. The page's base tone and wash are CSS (they paint with the card); this adds
// the design's specks and stray fibres to the background, and the fibre strokes to the card's
// paper layers, whose fine noise is already in the critical CSS.

import { createRng } from './rng.js';

// Specks and short fibres over the whole viewport, at the design's density per stage area.
export function paintPaper(c, comp, view, seed) {
  const rand = createRng(seed);
  const area = ((view.x1 - view.x0) * (view.y1 - view.y0)) / (comp.w * comp.h);
  const x = (u) => view.x0 + u * (view.x1 - view.x0);
  const y = (u) => view.y0 + u * (view.y1 - view.y0);
  for (let i = Math.round(comp.specks * area); i > 0; i--) {
    c.fillStyle = rand() < 0.55 ? 'rgba(110,86,52,0.06)' : 'rgba(255,255,255,0.22)';
    const s = rand() < 0.9 ? 1 : 1.6;
    c.fillRect(x(rand()), y(rand()), s, s);
  }
  c.lineWidth = 0.5;
  c.strokeStyle = 'rgba(120,96,60,0.07)';
  for (let i = Math.round(comp.fibres * area); i > 0; i--) {
    const x0 = x(rand());
    const y0 = y(rand());
    const a = rand() * 6.28;
    const l = 6 + rand() * 18;
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(x0 + Math.cos(a) * l * 0.5 + 3, y0 + Math.sin(a) * l * 0.5 - 2, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l);
    c.stroke();
  }
}

// The card's fibre layers: [face, stroke colour, count, blend, opacity], as in the design.
const FIBRES = [
  ['.front', '#5c4a36', 170, 'multiply', 0.42],
  ['.front', '#ffffff', 120, 'normal', 0.4],
  ['.back', '#4a120a', 170, 'multiply', 0.4],
  ['.back', '#ffe2d6', 110, 'normal', 0.16],
];

// Short curved fibres over one 620×360 paper tile, as in the design's textures.
function fibreTile(count, rand) {
  let paths = '';
  for (let i = 0; i < count; i++) {
    const x = rand() * 620;
    const y = rand() * 360;
    const a = rand() * 6.283;
    const len = 2.4 + 24 * Math.pow(rand(), 2.2);
    const bend = (rand() - 0.5) * 0.6 * len;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const cx = (x + ex) / 2 - Math.sin(a) * bend;
    const cy = (y + ey) / 2 + Math.cos(a) * bend;
    const f = (v) => v.toFixed(1);
    paths += `<path d='M${f(x)} ${f(y)}Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}' stroke-width='${(0.3 + rand() * 0.5).toFixed(2)}' stroke-opacity='${(0.2 + rand() * 0.45).toFixed(2)}'/>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='620' height='360'><g fill='none' stroke='#000' stroke-linecap='round'>${paths}</g></svg>`;
}

// Each fibre layer is a flat colour cut out by a mask of strokes. (As a background image it
// would count as a new "largest contentful paint" seconds after the card has rendered.)
export function addCardFibres() {
  const rand = createRng(2024);
  for (const [face, colour, count, blend, opacity] of FIBRES) {
    const paper = document.querySelector(`${face} .paper`);
    if (!paper) continue;
    const layer = document.createElement('i');
    const mask = `url("data:image/svg+xml,${encodeURIComponent(fibreTile(count, rand))}") 0 0 / 620px 360px`;
    Object.assign(layer.style, { background: colour, mixBlendMode: blend, opacity, webkitMask: mask, mask });
    paper.append(layer);
  }
}
