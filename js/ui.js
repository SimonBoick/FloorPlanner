/*
 * ui.js — baut die Seitenleiste. Reine Darstellung plus Ereignisse,
 * die an die Aktionen aus app.js weitergereicht werden.
 *
 * Alle Eingabefelder übernehmen ihren Wert bei "change" (also beim Verlassen
 * oder mit Enter), damit das Neuzeichnen den Fokus nicht wegreißt.
 */

import { findType, uid, rectPoints } from './model.js';
import { polyAreaM2, polyEdges } from './geom.js';

/* ---------- kleine DOM-Helfer ---------- */

export function h(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  (kids || []).forEach(c => c && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}

function num(label, value, onChange, opts) {
  const o = opts || {};
  const inp = h('input', {
    type: 'number', class: 'num', value: round(value), step: o.step || 1,
    min: o.min, max: o.max, onchange: e => onChange(parseFloat(e.target.value))
  });
  return h('label', { class: 'field' }, [h('span', { text: label }), inp]);
}
function round(v) { return Math.round((+v || 0) * 10) / 10; }
function btn(label, onClick, cls, title) {
  return h('button', { type: 'button', class: 'btn ' + (cls || ''), onclick: onClick, title: title || null, text: label });
}
function section(title, kids, extra) {
  return h('section', { class: 'panel' }, [
    h('div', { class: 'block' }, [h('div', { class: 'block-head' }, [h('h2', { text: title }), extra || null])].concat(kids))
  ]);
}

/* ---------- Kopfzeile: Projekte ---------- */

export function renderProjectBar(root, ctx) {
  root.innerHTML = '';
  const { state, actions } = ctx;
  const sel = h('select', {
    class: 'select', onchange: e => actions.switchProject(e.target.value),
    title: 'Raum wechseln'
  }, state.projects.map(p => h('option', { value: p.id, selected: p.id === state.activeId, text: p.name })));

  root.appendChild(sel);
  root.appendChild(btn('Neuer Raum', actions.newProject));
  root.appendChild(btn('Duplizieren', actions.duplicateProject));
  root.appendChild(btn('Beispiel laden', actions.loadPreset, '', 'Simons Zimmer als Vorlage laden'));
  root.appendChild(btn('Import', actions.importProject));
  root.appendChild(btn('Export', actions.exportProject, '', 'Diesen Raum als .json sichern'));
  root.appendChild(btn('SVG', actions.exportSvg));
  root.appendChild(btn('PNG', actions.exportPng));
  if (state.projects.length > 1) root.appendChild(btn('Raum löschen', actions.deleteProject, 'danger'));
}

/* ---------- Variantenreiter ---------- */

export function renderTabs(root, ctx) {
  root.innerHTML = '';
  const { project, actions } = ctx;
  project.layouts.forEach(l => {
    const b = h('button', {
      class: 'tab', type: 'button', role: 'tab',
      'aria-selected': project.activeLayoutId === l.id ? 'true' : 'false',
      onclick: () => actions.selectLayout(l.id)
    }, [
      h('span', { class: 'tab-name', text: l.name }),
      h('span', { class: 'tab-sub', text: l.sub || (l.items.length + ' Möbel') })
    ]);
    root.appendChild(b);
  });
  root.appendChild(h('button', {
    class: 'tab tab-add', type: 'button', title: 'Variante hinzufügen',
    onclick: actions.addLayout
  }, [h('span', { class: 'tab-name', text: '+' }), h('span', { class: 'tab-sub', text: 'Variante' })]));
}

/* ---------- Bereich: Plan ---------- */

export function renderPlanPane(root, ctx) {
  root.innerHTML = '';
  const { project, layout, check, state, actions } = ctx;

  const head = h('div', { class: 'rowline' }, [
    h('input', { class: 'txt big', value: layout.name, onchange: e => actions.patchLayout({ name: e.target.value }) }),
    btn('×', () => actions.deleteLayout(layout.id), 'icon danger', 'Variante löschen')
  ]);
  const sub = h('input', {
    class: 'txt', value: layout.sub || '', placeholder: 'Kurzbeschreibung (erscheint im Reiter)',
    onchange: e => actions.patchLayout({ sub: e.target.value })
  });
  const notes = h('textarea', {
    class: 'txt area', rows: 5, placeholder: 'Eine Notiz pro Zeile. Zeilen mit ! davor werden als Warnung markiert.',
    onchange: e => actions.patchLayout({ notes: parseNotes(e.target.value) })
  });
  notes.value = layout.notes.map(n => (n.caution ? '!' : '') + n.t).join('\n');

  const stats = h('div', { class: 'stats' }, [
    h('div', { class: 'stat' }, [h('div', { class: 'k', text: 'Raumfläche' }), h('div', { class: 'v', text: fmt(polyAreaM2(project.room.points)) + ' m²' })]),
    h('div', { class: 'stat' }, [h('div', { class: 'k', text: 'Frei' }), h('div', { class: 'v', text: fmt(check.free) + ' m²' })]),
    h('div', { class: 'stat' }, [h('div', { class: 'k', text: 'Möbel' }), h('div', { class: 'v', text: String(layout.items.length) })]),
    h('div', { class: 'stat' }, [
      h('div', { class: 'k', text: 'Prüfung' }),
      h('div', {
        class: 'v ' + (check.count ? 'bad' : 'good'),
        text: check.count ? check.count + (check.count === 1 ? ' Konflikt' : ' Konflikte') : 'passt'
      })
    ])
  ]);

  root.appendChild(section('Variante', [head, sub, notes], null));
  root.appendChild(h('section', { class: 'panel' }, [stats]));

  // Möbelliste
  const list = h('div', { class: 'list' });
  layout.items.forEach(it => {
    const t = findType(project, it.typeId);
    if (!t) return;
    const on = state.sel && state.sel.kind === 'item' && state.sel.id === it.id;
    const turned = ((((it.a || 0) % 360) + 360) % 360) !== 0 ? ' · ' + Math.round(it.a) + '°' : '';
    const row = h('button', {
      class: 'row', type: 'button', 'aria-pressed': on ? 'true' : 'false',
      onclick: () => actions.select(on ? null : { kind: 'item', id: it.id })
    }, [
      h('span', { class: 'sw', style: 'background:' + t.fill }),
      h('span', { class: 'nm' }, [document.createTextNode(t.label), h('small', { text: t.w + ' × ' + t.h + ' cm' + turned })]),
      h('span', { class: 'st' + (check.bad[it.id] ? ' bad' : ''), text: check.msgs[it.id] || '' })
    ]);
    list.appendChild(row);
  });

  const add = h('select', {
    class: 'select grow', onchange: e => { if (e.target.value) { actions.addItem(e.target.value); e.target.value = ''; } }
  }, [h('option', { value: '', text: '+ Möbel einsetzen …' })].concat(
    project.catalog.map(t => h('option', { value: t.id, text: t.label + ' (' + t.w + '×' + t.h + ')' }))
  ));

  const hasSel = !!(state.sel && state.sel.kind === 'item');
  const tools = h('div', { class: 'tools' }, [
    add,
    btn('Drehen 90°', () => actions.rotateSelected(90), hasSel ? '' : 'off'),
    btn('An Wand', actions.snapSelectedToWall, hasSel ? '' : 'off'),
    btn('Duplizieren', actions.duplicateSelected, hasSel ? '' : 'off'),
    btn('Entfernen', actions.deleteSelected, 'danger ' + (hasSel ? '' : 'off')),
    btn('Variante zurücksetzen', actions.clearLayout, '')
  ]);

  root.appendChild(h('section', { class: 'panel' }, [
    h('div', { class: 'block tight' }, [h('h2', { text: 'Möbel im Plan' })]), list, tools
  ]));
}

function parseNotes(v) {
  return String(v).split('\n').map(s => s.trim()).filter(Boolean).map(s =>
    s.startsWith('!') ? { t: s.slice(1).trim(), caution: true } : { t: s, caution: false });
}
function fmt(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }

/* ---------- Bereich: Raum ---------- */

export function renderRoomPane(root, ctx) {
  root.innerHTML = '';
  const { project, state, actions } = ctx;
  const room = project.room;

  // Grundform
  const bw = h('input', { type: 'number', class: 'num', value: 400, id: 'rect-w' });
  const bh = h('input', { type: 'number', class: 'num', value: 350, id: 'rect-h' });
  const shape = h('div', { class: 'stack' }, [
    h('p', { class: 'muted', text: 'Rechteck als Ausgangspunkt. Ersetzt den bisherigen Umriss — Möbel bleiben erhalten.' }),
    h('div', { class: 'inline' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Breite' }), bw]),
      h('label', { class: 'field' }, [h('span', { text: 'Tiefe' }), bh]),
      btn('Übernehmen', () => actions.setRoomPoints(rectPoints(+bw.value || 400, +bh.value || 350)))
    ]),
    num('Wandstärke (cm)', room.wall, v => actions.patchRoom({ wall: Math.max(0, v || 0) }))
  ]);
  root.appendChild(section('Grundform', [shape]));

  // Ecken
  const corners = h('div', { class: 'list' });
  const edges = polyEdges(room.points);
  room.points.forEach((p, i) => {
    const on = state.sel && state.sel.kind === 'corner' && state.sel.index === i;
    corners.appendChild(h('div', { class: 'gridrow' + (on ? ' on' : '') }, [
      h('span', { class: 'idx', text: String(i + 1) }),
      h('input', { type: 'number', class: 'num', value: round(p[0]), onchange: e => actions.moveCorner(i, parseFloat(e.target.value), p[1]) }),
      h('input', { type: 'number', class: 'num', value: round(p[1]), onchange: e => actions.moveCorner(i, p[0], parseFloat(e.target.value)) }),
      h('span', { class: 'muted small', text: Math.round(edges[i].len) + ' cm →' }),
      btn('+', () => actions.insertCorner(i), 'icon', 'Ecke nach dieser einfügen'),
      btn('×', () => actions.deleteCorner(i), 'icon danger ' + (room.points.length <= 3 ? 'off' : ''), 'Ecke löschen')
    ]));
  });
  root.appendChild(h('section', { class: 'panel' }, [
    h('div', { class: 'block tight' }, [h('h2', { text: 'Ecken' }),
      h('p', { class: 'muted', text: 'x / y in cm. Im Plan lassen sich die Punkte auch direkt ziehen; + fügt eine Ecke auf der folgenden Wand ein.' })]),
    corners
  ]));

  // Wandelemente
  const feats = h('div', { class: 'list' });
  (room.features || []).forEach(f => {
    const on = state.sel && state.sel.kind === 'feature' && state.sel.id === f.id;
    const head = h('button', {
      class: 'row', type: 'button', 'aria-pressed': on ? 'true' : 'false',
      onclick: () => actions.select(on ? null : { kind: 'feature', id: f.id })
    }, [
      h('span', { class: 'sw ' + f.kind }),
      h('span', { class: 'nm' }, [document.createTextNode(f.label), h('small', { text: kindLabel(f.kind) + ' · ' + Math.round(f.w) + ' cm' })]),
      h('span', { class: 'st', text: on ? 'offen' : '' })
    ]);
    feats.appendChild(head);
    if (!on) return;
    const fields = [
      h('input', { class: 'txt', value: f.label, onchange: e => actions.patchFeature(f.id, { label: e.target.value }) }),
      h('div', { class: 'inline' }, [
        num('x', f.x, v => actions.patchFeature(f.id, { x: v })),
        num('y', f.y, v => actions.patchFeature(f.id, { y: v })),
        num('Winkel', f.a, v => actions.patchFeature(f.id, { a: v }))
      ]),
      h('div', { class: 'inline' }, [
        num(f.kind === 'door' ? 'Breite / Radius' : 'Breite', f.w, v => actions.patchFeature(f.id, { w: Math.max(5, v) })),
        (f.kind === 'radiator' || f.kind === 'fixed') ? num('Tiefe', f.h, v => actions.patchFeature(f.id, { h: Math.max(2, v) })) : null
      ])
    ];
    if (f.kind === 'door') fields.push(h('div', { class: 'inline' }, [
      btn(f.hinge === 'end' ? 'Angel rechts' : 'Angel links', () => actions.patchFeature(f.id, { hinge: f.hinge === 'end' ? 'start' : 'end' })),
      btn('Schwenk spiegeln', () => actions.patchFeature(f.id, { swing: -f.swing }))
    ]));
    fields.push(h('div', { class: 'inline' }, [
      btn('An Wand ausrichten', () => actions.snapFeature(f.id)),
      btn('Entfernen', () => actions.deleteFeature(f.id), 'danger')
    ]));
    feats.appendChild(h('div', { class: 'sub-edit' }, fields));
  });

  const addTools = h('div', { class: 'tools' }, [
    btn('+ Fenster', () => actions.addFeature('window')),
    btn('+ Tür', () => actions.addFeature('door')),
    btn('+ Heizkörper', () => actions.addFeature('radiator')),
    btn('+ Einbau', () => actions.addFeature('fixed'), '', 'Feste Blockade: Schornstein, Dachschräge, Nische')
  ]);
  root.appendChild(h('section', { class: 'panel' }, [
    h('div', { class: 'block tight' }, [h('h2', { text: 'Fenster, Türen, Einbauten' })]), feats, addTools
  ]));
}

function kindLabel(k) {
  return { window: 'Fenster', door: 'Tür', radiator: 'Heizkörper', fixed: 'Einbau' }[k] || k;
}

/* ---------- Bereich: Katalog ---------- */

export function renderCatalogPane(root, ctx) {
  root.innerHTML = '';
  const { project, actions } = ctx;
  const list = h('div', { class: 'list' });
  project.catalog.forEach(t => {
    list.appendChild(h('div', { class: 'gridrow cat' }, [
      h('input', { type: 'color', class: 'color', value: t.fill, onchange: e => actions.patchType(t.id, { fill: e.target.value }) }),
      h('input', { class: 'txt', value: t.label, onchange: e => actions.patchType(t.id, { label: e.target.value }) }),
      h('input', { type: 'number', class: 'num', value: t.w, title: 'Breite in cm', onchange: e => actions.patchType(t.id, { w: Math.max(5, parseFloat(e.target.value) || 5) }) }),
      h('input', { type: 'number', class: 'num', value: t.h, title: 'Tiefe in cm', onchange: e => actions.patchType(t.id, { h: Math.max(5, parseFloat(e.target.value) || 5) }) }),
      h('label', { class: 'chk', title: 'Hat eine Rückseite (Lehne, Kopfteil)' }, [
        h('input', { type: 'checkbox', checked: t.back, onchange: e => actions.patchType(t.id, { back: e.target.checked }) }),
        h('span', { text: 'Rücken' })
      ]),
      btn('×', () => actions.deleteType(t.id), 'icon danger', 'Möbeltyp löschen')
    ]));
  });
  root.appendChild(h('section', { class: 'panel' }, [
    h('div', { class: 'block tight' }, [
      h('h2', { text: 'Möbelkatalog' }),
      h('p', { class: 'muted', text: 'Gilt für alle Varianten dieses Raums. Maße in cm: Breite × Tiefe.' })
    ]),
    list,
    h('div', { class: 'tools' }, [btn('+ Möbeltyp', actions.addType)])
  ]));
}
