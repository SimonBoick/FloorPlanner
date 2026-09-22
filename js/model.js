/*
 * model.js — Datenmodell eines Projekts.
 *
 * Ein Projekt beschreibt einen Raum, einen Möbelkatalog und beliebig viele
 * Varianten (Aufteilungen) desselben Raums:
 *
 *   project = {
 *     id, name, version,
 *     room: {
 *       wall: 37,                       // Wandstärke in cm, nur Darstellung
 *       points: [[x,y], ...],           // Innenkanten im Uhrzeigersinn
 *       features: [ ... ]               // Fenster, Türen, Heizkörper, Einbauten
 *     },
 *     catalog:  [ {id, label, w, h, fill, back} ],
 *     layouts:  [ {id, name, sub, notes:[{t,caution}], items:[{id,typeId,cx,cy,a}]} ],
 *     activeLayoutId
 *   }
 *
 * Wandelemente (features):
 *   {kind:'window',   x, y, a, w}                 Fenster, liegt in der Wand
 *   {kind:'door',     x, y, a, w, hinge, swing}   Tür mit Schwenkbereich
 *   {kind:'radiator', x, y, a, w, h}              Heizkörper, ragt in den Raum
 *   {kind:'fixed',    x, y, a, w, h, label}       fester Einbau, blockiert Möbel
 * x/y ist immer der Ankerpunkt auf der Wandinnenkante, a der Winkel in Grad.
 */

export const SCHEMA_VERSION = 1;

export function uid(prefix) {
  return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

export function rectPoints(w, h) { return [[0, 0], [w, 0], [w, h], [0, h]]; }

export const DEFAULT_CATALOG = [
  { id: 'bett', label: 'Bett', w: 145, h: 205, fill: '#3F5C8C', back: true },
  { id: 'schreibtisch', label: 'Schreibtisch', w: 120, h: 80, fill: '#26766A', back: false },
  { id: 'sofa', label: 'Sofa', w: 180, h: 85, fill: '#8A5340', back: true },
  { id: 'schrank', label: 'Schrank', w: 120, h: 60, fill: '#67702F', back: true },
  { id: 'sessel', label: 'Sessel', w: 80, h: 80, fill: '#98682C', back: true },
  { id: 'kommode', label: 'Kommode', w: 80, h: 40, fill: '#6A5686', back: true },
  { id: 'tisch', label: 'Tisch', w: 120, h: 80, fill: '#4A6C8F', back: false },
  { id: 'regal', label: 'Regal', w: 80, h: 32, fill: '#7A5C33', back: true }
];

/** Ein leeres Projekt: Rechteckraum mit Fenster und Tür. */
export function emptyProject(name, w, h) {
  const bw = w || 400, bh = h || 350;
  return normalizeProject({
    id: uid('p'),
    name: name || 'Neuer Raum',
    version: SCHEMA_VERSION,
    room: {
      wall: 25,
      points: rectPoints(bw, bh),
      features: [
        { id: uid('f'), kind: 'window', label: 'Fenster', x: Math.round(bw / 2 - 60), y: 0, a: 0, w: 120, h: 0 },
        { id: uid('f'), kind: 'door', label: 'Tür', x: 40, y: bh, a: 0, w: 90, h: 0, hinge: 'start', swing: -1 }
      ]
    },
    catalog: DEFAULT_CATALOG.map(t => Object.assign({}, t)),
    layouts: [{ id: uid('l'), name: 'Variante 1', sub: 'leer', notes: [], items: [] }]
  });
}

/** Füllt fehlende Felder auf und vergibt fehlende Ids — auch beim Import. */
export function normalizeProject(p) {
  const out = Object.assign({ version: SCHEMA_VERSION }, p);
  out.id = out.id || uid('p');
  out.name = out.name || 'Raum';
  out.room = out.room || {};
  out.room.wall = num(out.room.wall, 25);
  out.room.points = (out.room.points && out.room.points.length >= 3)
    ? out.room.points.map(pt => [num(pt[0], 0), num(pt[1], 0)])
    : rectPoints(400, 350);
  out.room.features = (out.room.features || []).map(f => {
    const g = Object.assign({}, f);
    g.id = g.id || uid('f');
    g.kind = ['window', 'door', 'radiator', 'fixed'].includes(g.kind) ? g.kind : 'fixed';
    g.label = g.label || defaultLabel(g.kind);
    g.x = num(g.x, 0); g.y = num(g.y, 0); g.a = num(g.a, 0);
    g.w = Math.max(5, num(g.w, 90));
    g.h = num(g.h, g.kind === 'radiator' ? 20 : g.kind === 'fixed' ? 40 : 0);
    if (g.kind === 'door') {
      g.hinge = g.hinge === 'end' ? 'end' : 'start';
      g.swing = num(g.swing, 1) >= 0 ? 1 : -1;
    }
    return g;
  });
  out.catalog = (out.catalog && out.catalog.length ? out.catalog : DEFAULT_CATALOG).map(t => ({
    id: t.id || uid('t'),
    label: t.label || 'Möbel',
    w: Math.max(5, num(t.w, 80)),
    h: Math.max(5, num(t.h, 80)),
    fill: t.fill || '#5A6472',
    back: !!t.back
  }));
  out.layouts = (out.layouts && out.layouts.length ? out.layouts : [{ name: 'Variante 1', items: [] }]).map(l => ({
    id: l.id || uid('l'),
    name: l.name || 'Variante',
    sub: l.sub || '',
    notes: (l.notes || []).map(n => (typeof n === 'string' ? { t: n, caution: false } : { t: n.t || '', caution: !!n.caution })),
    items: (l.items || []).map(it => ({
      id: it.id || uid('i'),
      typeId: it.typeId || it.type,
      cx: num(it.cx, 0), cy: num(it.cy, 0), a: num(it.a, 0)
    })).filter(it => out.catalog.some(t => t.id === it.typeId))
  }));
  if (!out.layouts.some(l => l.id === out.activeLayoutId)) out.activeLayoutId = out.layouts[0].id;
  return out;
}

function defaultLabel(kind) {
  return { window: 'Fenster', door: 'Tür', radiator: 'Heizkörper', fixed: 'Einbau' }[kind] || 'Element';
}

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

export function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function copyProject(p, name) {
  const c = clone(p);
  c.id = uid('p');
  c.name = name || (p.name + ' (Kopie)');
  return normalizeProject(c);
}

export function activeLayout(p) {
  return p.layouts.find(l => l.id === p.activeLayoutId) || p.layouts[0];
}

export function findType(p, id) { return p.catalog.find(t => t.id === id); }

/** Neue Variante als Kopie der aktuellen. */
export function duplicateLayout(p, layoutId, name) {
  const src = p.layouts.find(l => l.id === layoutId) || p.layouts[0];
  const c = clone(src);
  c.id = uid('l');
  c.name = name || (src.name + ' (Kopie)');
  c.items = c.items.map(it => Object.assign({}, it, { id: uid('i') }));
  return c;
}
