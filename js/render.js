/*
 * render.js — zeichnet den Grundriss als SVG.
 * Reine Darstellung: alles kommt aus dem Projekt, Ereignisse behandelt app.js.
 */

import {
  polyBBox, polyEdges, pointInPoly, itemAABB, itemCorners, featLocal,
  featInwardSign, doorGeometry, trig, DEG
} from './geom.js';
import { findType } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const MONO = 'IBM Plex Mono, ui-monospace, monospace';
const SANS = 'IBM Plex Sans, ui-sans-serif, sans-serif';

export function el(name, attrs) {
  const e = document.createElementNS(NS, name);
  if (attrs) for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
  return e;
}
function text(attrs, content) { const t = el('text', attrs); t.textContent = content; return t; }
function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }

/**
 * @param {object} o {svg, project, layout, check, mode, sel}
 * mode: 'plan' | 'room' ; sel: {kind:'item'|'feature'|'corner', id|index} | null
 */
export function renderPlan(o) {
  const { svg, project, layout, check, mode, sel } = o;
  const room = project.room.points, wall = project.room.wall;
  const g = {
    static: svg.querySelector('#g-static'),
    feat: svg.querySelector('#g-feat'),
    dims: svg.querySelector('#g-dims'),
    furn: svg.querySelector('#g-furn'),
    over: svg.querySelector('#g-over'),
    handles: svg.querySelector('#g-handles')
  };
  Object.values(g).forEach(clear);

  const bb = polyBBox(room), pad = wall + 68;
  svg.setAttribute('viewBox', [bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2].join(' '));

  drawShell(g.static, room, wall, mode);
  (project.room.features || []).forEach(f => drawFeature(g.feat, g.over, f, room, wall, mode, sel));
  drawDims(g.dims, room, wall);
  drawFurniture(g.furn, project, layout, check, sel, mode);
  if (mode === 'room') drawHandles(g.handles, room, sel);
}

/* ---------- Raumhülle ---------- */

function pathOf(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ') + ' Z'; }

function drawShell(g, room, wall, mode) {
  const d = pathOf(room);
  g.appendChild(el('path', {
    d, fill: 'none', stroke: 'var(--wall)', 'stroke-width': wall * 2,
    'stroke-linejoin': 'miter', 'stroke-miterlimit': 8
  }));
  g.appendChild(el('path', { d, fill: 'var(--floor)', stroke: 'var(--wall)', 'stroke-width': 1.4 }));

  if (mode === 'room') {
    const bb = polyBBox(room), grid = el('g', { 'clip-path': 'url(#roomclip)', opacity: .45 });
    for (let x = Math.ceil(bb.x / 50) * 50; x <= bb.x + bb.w; x += 50)
      grid.appendChild(el('line', { x1: x, y1: bb.y, x2: x, y2: bb.y + bb.h, stroke: 'var(--dim)', 'stroke-width': .6 }));
    for (let y = Math.ceil(bb.y / 50) * 50; y <= bb.y + bb.h; y += 50)
      grid.appendChild(el('line', { x1: bb.x, y1: y, x2: bb.x + bb.w, y2: y, stroke: 'var(--dim)', 'stroke-width': .6 }));
    const clip = el('clipPath', { id: 'roomclip' });
    clip.appendChild(el('path', { d }));
    g.appendChild(clip); g.appendChild(grid);
  }

  // Nordpfeil links oben
  const bb = polyBBox(room);
  const np = el('g', { transform: 'translate(' + (bb.x - wall - 26) + ',' + (bb.y - wall - 18) + ')' });
  np.appendChild(el('path', { d: 'M0 -14 L6 8 L0 3 L-6 8 Z', fill: 'var(--dim)' }));
  np.appendChild(text({ x: 0, y: 24, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--dim)', 'font-family': MONO }, 'N'));
  g.appendChild(np);
}

/* ---------- Wandelemente ---------- */

function quadPath(f, y0, y1, w) {
  const ww = w == null ? f.w : w;
  const p = [featLocal(f, 0, y0), featLocal(f, ww, y0), featLocal(f, ww, y1), featLocal(f, 0, y1)];
  return pathOf(p);
}

function drawFeature(gBase, gOver, f, room, wall, mode, sel) {
  const selected = sel && sel.kind === 'feature' && sel.id === f.id;
  const g = el('g', { 'data-kind': 'feature', 'data-id': f.id, class: 'feat' + (mode === 'room' ? '' : ' no-hit') });
  const sign = featInwardSign(room, f);   // +1: lokal +y zeigt in den Raum
  const out = -sign;

  if (f.kind === 'window') {
    g.appendChild(el('path', { d: quadPath(f, 0, out * wall), fill: 'var(--surface)', stroke: 'var(--wall)', 'stroke-width': 1.4 }));
    const a = featLocal(f, 0, out * wall / 2), b = featLocal(f, f.w, out * wall / 2);
    g.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--wall)', 'stroke-width': 2.6 }));
  } else if (f.kind === 'radiator') {
    const h = Math.abs(f.h) * sign;
    g.appendChild(el('path', { d: quadPath(f, 0, h), fill: 'var(--floor)', 'fill-opacity': .85, stroke: 'var(--dim)', 'stroke-width': 1.6 }));
    const n = Math.max(2, Math.round(f.w / 10));
    for (let i = 1; i < n; i++) {
      const a = featLocal(f, i * f.w / n, h * 0.12), b = featLocal(f, i * f.w / n, h * 0.88);
      g.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--dim)', 'stroke-width': .9 }));
    }
  } else if (f.kind === 'fixed') {
    g.appendChild(el('path', { d: quadPath(f, 0, f.h), fill: 'var(--dim)', 'fill-opacity': .22, stroke: 'var(--dim)', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }));
    const c = featLocal(f, f.w / 2, f.h / 2);
    if (f.w > 50 && Math.abs(f.h) > 22)
      g.appendChild(text({ x: c[0], y: c[1], 'text-anchor': 'middle', dy: 4, 'font-size': 11, fill: 'var(--ink-2)', 'font-family': MONO, 'pointer-events': 'none' }, f.label));
  } else if (f.kind === 'door') {
    // Wandöffnung freistellen
    gBase.appendChild(el('path', { d: quadPath(f, -1 * sign, out * (wall + 1)), fill: 'var(--paper)' }));
    const d = doorGeometry(f);
    const p0 = [d.hx + d.r * Math.cos(d.base * DEG), d.hy + d.r * Math.sin(d.base * DEG)];
    const p1 = [d.hx + d.r * Math.cos((d.base + d.sw * 90) * DEG), d.hy + d.r * Math.sin((d.base + d.sw * 90) * DEG)];
    const arc = 'M ' + p0[0] + ' ' + p0[1] + ' A ' + d.r + ' ' + d.r + ' 0 0 ' + (d.sw > 0 ? 1 : 0) + ' ' + p1[0] + ' ' + p1[1];
    g.appendChild(el('path', { d: arc, fill: 'none', stroke: 'var(--dim)', 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
    g.appendChild(el('line', { x1: d.hx, y1: d.hy, x2: p1[0], y2: p1[1], stroke: 'var(--dim)', 'stroke-width': 3 }));
    const lab = featLocal(f, f.w / 2, out * (wall + 20));
    g.appendChild(text({ x: lab[0], y: lab[1], 'text-anchor': 'middle', dy: 4, 'font-size': 12, fill: 'var(--dim)', 'font-family': MONO, 'pointer-events': 'none' }, f.label + ' ' + Math.round(f.w)));
  }

  if (selected) {
    const h = f.kind === 'window' ? out * wall : (f.kind === 'radiator' ? Math.abs(f.h) * sign : (f.kind === 'door' ? out * wall : f.h));
    g.appendChild(el('path', { d: quadPath(f, 0, h || out * wall), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3 }));
  }
  (f.kind === 'door' ? gOver : gBase).appendChild(g);
}

/* ---------- Bemaßung ---------- */

function drawDims(g, room, wall) {
  polyEdges(room).forEach(e => {
    if (e.len < 35) return;
    const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
    let nx = -(e.b[1] - e.a[1]) / e.len, ny = (e.b[0] - e.a[0]) / e.len;
    if (pointInPoly(room, mx + nx * 6, my + ny * 6)) { nx = -nx; ny = -ny; }
    const off = wall + 20;
    const tx = mx + nx * off, ty = my + ny * off;
    const s = wall + 6;
    g.appendChild(el('line', {
      x1: e.a[0] + nx * s, y1: e.a[1] + ny * s, x2: e.b[0] + nx * s, y2: e.b[1] + ny * s,
      stroke: 'var(--dim)', 'stroke-width': 1, 'stroke-opacity': .7
    }));
    let ang = e.ang;
    if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
    g.appendChild(text({
      x: tx, y: ty, 'text-anchor': 'middle', dy: 4, 'font-size': 13, fill: 'var(--dim)',
      'font-family': MONO, transform: 'rotate(' + ang.toFixed(1) + ' ' + tx + ' ' + ty + ')'
    }, Math.round(e.len)));
  });
}

/* ---------- Möbel ---------- */

function drawFurniture(g, project, layout, check, sel, mode) {
  const others = layout.items.map(it => {
    const t = findType(project, it.typeId);
    return t ? itemAABB(it, t.w, t.h) : null;
  });
  layout.items.forEach((it, idx) => {
    const t = findType(project, it.typeId);
    if (!t) return;
    const bad = check.bad[it.id], selected = sel && sel.kind === 'item' && sel.id === it.id;
    const gi = el('g', { 'data-kind': 'item', 'data-id': it.id, class: 'item' + (mode === 'plan' ? '' : ' no-hit') });
    const rot = el('g', { transform: 'rotate(' + it.a + ' ' + it.cx + ' ' + it.cy + ')' });
    const rx = it.cx - t.w / 2, ry = it.cy - t.h / 2;
    rot.appendChild(el('rect', {
      x: rx, y: ry, width: t.w, height: t.h, rx: 2,
      fill: t.fill, 'fill-opacity': bad ? .34 : .92,
      stroke: bad ? 'var(--warn)' : (selected ? 'var(--accent)' : 'rgba(0,0,0,.35)'),
      'stroke-width': bad || selected ? 3 : 1.2
    }));
    if (t.back) {
      const d = Math.min(11, Math.min(t.w, t.h) / 3);
      const side = backSide(project, it, t);
      const br = { x: rx, y: ry, w: t.w, h: t.h };
      if (side === 'left') br.w = d;
      else if (side === 'right') { br.x = rx + t.w - d; br.w = d; }
      else if (side === 'top') br.h = d;
      else { br.y = ry + t.h - d; br.h = d; }
      rot.appendChild(el('rect', { x: br.x, y: br.y, width: br.w, height: br.h, fill: 'rgba(255,255,255,.24)' }));
    }
    gi.appendChild(rot);
    label(gi, it, t, bad, others, idx, project);
    g.appendChild(gi);
  });
}

/** Wo liegt die Rückenlehne? An der Seite, die aus dem Raum zeigt. */
function backSide(project, it, t) {
  const room = project.room.points;
  const probes = [['left', -t.w / 2 - 7, 0], ['right', t.w / 2 + 7, 0], ['top', 0, -t.h / 2 - 7], ['bottom', 0, t.h / 2 + 7]];
  for (const p of probes) {
    const tr = trig(it.a || 0);
    const x = it.cx + p[1] * tr[0] - p[2] * tr[1], y = it.cy + p[1] * tr[1] + p[2] * tr[0];
    if (!pointInPoly(room, x, y)) return p[0];
  }
  const bb = polyBBox(room);
  const dx = it.cx - (bb.x + bb.w / 2), dy = it.cy - (bb.y + bb.h / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
}

/** Beschriftung: bevorzugt im Möbel, sonst daneben an der freiesten Stelle. */
function label(g, it, t, bad, others, idx, project) {
  const n = t.label.length, axis = ((((it.a || 0) % 90) + 90) % 90) === 0;
  let fw, fh, rotDeg;
  if (axis) { const bb = itemAABB(it, t.w, t.h); fw = Math.round(bb.w); fh = Math.round(bb.h); rotDeg = 0; }
  else { fw = t.w; fh = t.h; rotDeg = it.a > 90 ? it.a - 180 : (it.a < -90 ? it.a + 180 : it.a); }
  const fit = (along, across) => Math.min(13, across * 0.30, (along - 10) / (n * 0.60));
  const fsH = fit(fw, fh), fsV = fit(fh, fw);
  const mode = fsH >= 9 ? 'h' : (fsV >= 9 ? 'v' : 'out');
  const cx = it.cx, cy = it.cy;

  if (mode !== 'out') {
    const fs = mode === 'h' ? fsH : fsV, across = mode === 'h' ? fh : fw;
    const two = across >= 46 && fs >= 9.5;
    const deg = rotDeg + (mode === 'v' ? -90 : 0);
    const tr = deg ? 'rotate(' + deg + ' ' + cx + ' ' + cy + ')' : null;
    g.appendChild(text({
      x: cx, y: cy, 'text-anchor': 'middle', dy: two ? -2 : 4, 'font-size': fs, fill: '#fff',
      'font-family': SANS, 'font-weight': 600, 'pointer-events': 'none', transform: tr
    }, t.label));
    if (two) g.appendChild(text({
      x: cx, y: cy, 'text-anchor': 'middle', dy: fs + 3, 'font-size': fs * 0.8, fill: 'rgba(255,255,255,.82)',
      'font-family': MONO, 'pointer-events': 'none', transform: tr
    }, t.w + ' × ' + t.h));
    return;
  }

  const bb = itemAABB(it, t.w, t.h), lw = n * 7.2, lh = 26;
  const opts = [
    { x: cx, y: bb.y - 16, anchor: 'middle', box: [cx - lw / 2, bb.y - 27, lw, lh] },
    { x: cx, y: bb.y + bb.h + 22, anchor: 'middle', box: [cx - lw / 2, bb.y + bb.h + 11, lw, lh] },
    { x: bb.x - 7, y: cy, anchor: 'end', box: [bb.x - 7 - lw, cy - 12, lw, lh] },
    { x: bb.x + bb.w + 7, y: cy, anchor: 'start', box: [bb.x + bb.w + 7, cy - 12, lw, lh] }
  ];
  let pick = opts[0];
  for (const o of opts) {
    let clash = false;
    for (let j = 0; j < others.length && !clash; j++) {
      if (j === idx || !others[j]) continue;
      const q = others[j];
      if (o.box[0] < q.x + q.w && o.box[0] + o.box[2] > q.x && o.box[1] < q.y + q.h && o.box[1] + o.box[3] > q.y) clash = true;
    }
    if (!clash) { pick = o; break; }
  }
  g.appendChild(text({
    x: pick.x, y: pick.y, 'text-anchor': pick.anchor, dy: -1, 'font-size': 12.5,
    fill: bad ? 'var(--warn)' : 'var(--ink)', 'font-family': SANS, 'font-weight': 600, 'pointer-events': 'none'
  }, t.label));
  g.appendChild(text({
    x: pick.x, y: pick.y, 'text-anchor': pick.anchor, dy: 12, 'font-size': 11,
    fill: 'var(--ink-3)', 'font-family': MONO, 'pointer-events': 'none'
  }, t.w + ' × ' + t.h));
}

/* ---------- Griffe für den Raum-Modus ---------- */

function drawHandles(g, room, sel) {
  room.forEach((p, i) => {
    const on = sel && sel.kind === 'corner' && sel.index === i;
    const c = el('circle', {
      cx: p[0], cy: p[1], r: on ? 8 : 6,
      fill: on ? 'var(--accent)' : 'var(--surface)',
      stroke: 'var(--accent)', 'stroke-width': 2,
      'data-kind': 'corner', 'data-index': i, class: 'handle'
    });
    g.appendChild(c);
  });
}
