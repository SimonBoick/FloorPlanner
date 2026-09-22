/*
 * app.js — Zustand, Aktionen und Ereignisse.
 *
 * Der gesamte Zustand steckt in `state`. Jede Änderung läuft über commit():
 * Das legt einen Schritt für das Rückgängigmachen ab, speichert und zeichnet neu.
 */

import {
  emptyProject, normalizeProject, copyProject, clone, uid, activeLayout,
  findType, duplicateLayout, rectPoints
} from './model.js';
import { SIMONS_ZIMMER } from './presets.js';
import { loadAll, saveAll, storageAvailable, exportProject as saveProjectFile, readProjectFile } from './store.js';
import { renderPlan } from './render.js';
import { renderProjectBar, renderTabs, renderPlanPane, renderRoomPane, renderCatalogPane } from './ui.js';
import { exportSvg, exportPng } from './exporters.js';
import {
  validate, itemAABB, itemSamples, pointInPoly, polyEdges, projectOnEdge, polyBBox
} from './geom.js';

/* ---------- Zustand ---------- */

const loaded = loadAll();
const state = {
  projects: loaded.projects,
  activeId: loaded.activeId || loaded.projects[0].id,
  mode: 'plan',
  sel: null,
  history: [],
  future: []
};

const $ = s => document.querySelector(s);
const svg = $('#plan');
const panes = { plan: $('#pane-plan'), room: $('#pane-room'), catalog: $('#pane-catalog') };

function project() { return state.projects.find(p => p.id === state.activeId) || state.projects[0]; }
function layout() { return activeLayout(project()); }

/* ---------- Änderungen ---------- */

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = saveAll(state);
    note(ok ? 'Gespeichert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : 'Konnte nicht im Browser gespeichert werden — exportier deinen Plan als Datei.');
  }, 250);
}
function note(msg) { const n = $('#saved'); n.textContent = msg; }

function commit(fn) {
  state.history.push({ id: state.activeId, snap: JSON.stringify(project()) });
  if (state.history.length > 80) state.history.shift();
  state.future.length = 0;
  fn();
  const i = state.projects.findIndex(p => p.id === state.activeId);
  state.projects[i] = normalizeProject(state.projects[i]);
  if (state.activeId !== state.projects[i].id) state.activeId = state.projects[i].id;
  persist();
  render();
}

function undo() {
  const step = state.history.pop();
  if (!step) return;
  const i = state.projects.findIndex(p => p.id === step.id);
  if (i < 0) return;
  state.future.push({ id: step.id, snap: JSON.stringify(state.projects[i]) });
  state.projects[i] = normalizeProject(JSON.parse(step.snap));
  state.activeId = step.id; state.sel = null;
  persist(); render();
}
function redo() {
  const step = state.future.pop();
  if (!step) return;
  const i = state.projects.findIndex(p => p.id === step.id);
  if (i < 0) return;
  state.history.push({ id: step.id, snap: JSON.stringify(state.projects[i]) });
  state.projects[i] = normalizeProject(JSON.parse(step.snap));
  state.activeId = step.id; state.sel = null;
  persist(); render();
}

/* ---------- Aktionen ---------- */

const actions = {
  /* Projekte */
  switchProject(id) { state.activeId = id; state.sel = null; persist(); render(); },
  newProject() {
    const name = prompt('Wie soll der Raum heißen?', 'Neuer Raum');
    if (name === null) return;
    const p = emptyProject(name || 'Neuer Raum');
    state.projects.push(p); state.activeId = p.id; state.sel = null; state.mode = 'room';
    persist(); render();
  },
  duplicateProject() {
    const p = copyProject(project());
    state.projects.push(p); state.activeId = p.id; state.sel = null;
    persist(); render();
  },
  loadPreset() {
    const p = normalizeProject(clone(SIMONS_ZIMMER));
    p.id = uid('p');
    state.projects.push(p); state.activeId = p.id; state.sel = null;
    persist(); render();
  },
  deleteProject() {
    if (state.projects.length < 2) return;
    if (!confirm('Raum „' + project().name + '“ mit allen Varianten löschen?')) return;
    state.projects = state.projects.filter(p => p.id !== state.activeId);
    state.activeId = state.projects[0].id; state.sel = null;
    persist(); render();
  },
  exportProject() { saveProjectFile(project()); },
  importProject() { $('#file').click(); },
  exportSvg() { exportSvg(svg, project().name + '-' + layout().name); },
  exportPng() { exportPng(svg, project().name + '-' + layout().name); },

  /* Varianten */
  selectLayout(id) { project().activeLayoutId = id; state.sel = null; persist(); render(); },
  addLayout() {
    commit(() => {
      const p = project();
      const l = p.layouts.length ? duplicateLayout(p, p.activeLayoutId, 'Variante ' + (p.layouts.length + 1))
        : { id: uid('l'), name: 'Variante 1', sub: '', notes: [], items: [] };
      l.sub = 'Kopie von ' + (activeLayout(p).name || '');
      p.layouts.push(l); p.activeLayoutId = l.id;
    });
  },
  patchLayout(patch) { commit(() => Object.assign(layout(), patch)); },
  deleteLayout(id) {
    const p = project();
    if (p.layouts.length < 2) { alert('Die letzte Variante lässt sich nicht löschen.'); return; }
    if (!confirm('Variante löschen?')) return;
    commit(() => {
      p.layouts = p.layouts.filter(l => l.id !== id);
      if (p.activeLayoutId === id) p.activeLayoutId = p.layouts[0].id;
      state.sel = null;
    });
  },
  clearLayout() {
    if (!confirm('Alle Möbel aus dieser Variante entfernen?')) return;
    commit(() => { layout().items = []; state.sel = null; });
  },

  /* Möbel im Plan */
  select(sel) { state.sel = sel; render(); },
  addItem(typeId) {
    commit(() => {
      const bb = polyBBox(project().room.points);
      const it = { id: uid('i'), typeId, cx: Math.round(bb.x + bb.w / 2), cy: Math.round(bb.y + bb.h / 2), a: 0 };
      layout().items.push(it);
      state.sel = { kind: 'item', id: it.id };
      state.mode = 'plan';
    });
  },
  rotateSelected(deg) {
    const it = selectedItem(); if (!it) return;
    commit(() => { it.a = Math.round((it.a || 0) + deg); snapItem(it); });
  },
  duplicateSelected() {
    const it = selectedItem(); if (!it) return;
    commit(() => {
      const c = Object.assign({}, it, { id: uid('i'), cx: it.cx + 20, cy: it.cy + 20 });
      layout().items.push(c);
      state.sel = { kind: 'item', id: c.id };
    });
  },
  deleteSelected() {
    const sel = state.sel; if (!sel) return;
    if (sel.kind === 'item') commit(() => { layout().items = layout().items.filter(i => i.id !== sel.id); state.sel = null; });
    else if (sel.kind === 'feature') actions.deleteFeature(sel.id);
  },
  snapSelectedToWall() {
    const it = selectedItem(); if (!it) return;
    commit(() => toWall(it));
  },

  /* Raum */
  patchRoom(patch) { commit(() => Object.assign(project().room, patch)); },
  setRoomPoints(pts) { commit(() => { project().room.points = pts; state.sel = null; }); },
  moveCorner(i, x, y) {
    commit(() => { const p = project().room.points; p[i] = [Math.round(x), Math.round(y)]; });
  },
  insertCorner(i) {
    commit(() => {
      const p = project().room.points, j = (i + 1) % p.length;
      p.splice(i + 1, 0, [Math.round((p[i][0] + p[j][0]) / 2), Math.round((p[i][1] + p[j][1]) / 2)]);
      state.sel = { kind: 'corner', index: i + 1 };
    });
  },
  deleteCorner(i) {
    if (project().room.points.length <= 3) return;
    commit(() => { project().room.points.splice(i, 1); state.sel = null; });
  },
  addFeature(kind) {
    commit(() => {
      const room = project().room;
      const edges = polyEdges(room.points).slice().sort((a, b) => b.len - a.len);
      const e = edges[0];
      const w = kind === 'door' ? 90 : kind === 'window' ? Math.min(120, Math.round(e.len * 0.5)) : 90;
      const t = Math.max(0, Math.min(1, 0.5 - (w / 2) / e.len));
      const f = {
        id: uid('f'), kind,
        label: { window: 'Fenster', door: 'Tür', radiator: 'Heizkörper', fixed: 'Einbau' }[kind],
        x: Math.round(e.a[0] + (e.b[0] - e.a[0]) * t),
        y: Math.round(e.a[1] + (e.b[1] - e.a[1]) * t),
        a: Math.round(e.ang * 10) / 10,
        w, h: kind === 'radiator' ? 20 : kind === 'fixed' ? 40 : 0,
        hinge: 'start', swing: 1
      };
      room.features.push(f);
      state.sel = { kind: 'feature', id: f.id };
      state.mode = 'room';
    });
  },
  patchFeature(id, patch) {
    commit(() => {
      const f = project().room.features.find(x => x.id === id);
      if (f) Object.assign(f, patch);
    });
  },
  deleteFeature(id) {
    commit(() => {
      const r = project().room;
      r.features = r.features.filter(f => f.id !== id);
      state.sel = null;
    });
  },
  snapFeature(id) {
    commit(() => {
      const f = project().room.features.find(x => x.id === id);
      if (f) snapFeatureToWall(f, 1e9);
    });
  },

  /* Katalog */
  addType() {
    commit(() => {
      const t = { id: uid('t'), label: 'Neues Möbel', w: 80, h: 60, fill: randomColor(), back: false };
      project().catalog.push(t);
    });
  },
  patchType(id, patch) {
    commit(() => {
      const t = findType(project(), id);
      if (t) Object.assign(t, patch);
    });
  },
  deleteType(id) {
    const p = project();
    const used = p.layouts.reduce((n, l) => n + l.items.filter(i => i.typeId === id).length, 0);
    if (used && !confirm('Dieser Möbeltyp steht ' + used + '× in deinen Varianten. Mitsamt diesen Einträgen löschen?')) return;
    commit(() => {
      p.catalog = p.catalog.filter(t => t.id !== id);
      p.layouts.forEach(l => { l.items = l.items.filter(i => i.typeId !== id); });
      state.sel = null;
    });
  }
};

function randomColor() {
  const pool = ['#3F5C8C', '#26766A', '#8A5340', '#67702F', '#98682C', '#6A5686', '#4A6C8F', '#7A5C33'];
  return pool[Math.floor(Math.random() * pool.length)];
}

function selectedItem() {
  if (!state.sel || state.sel.kind !== 'item') return null;
  return layout().items.find(i => i.id === state.sel.id) || null;
}
function selectedFeature() {
  if (!state.sel || state.sel.kind !== 'feature') return null;
  return project().room.features.find(f => f.id === state.sel.id) || null;
}

/* ---------- Einrasten ---------- */

function snapItem(it) {
  const t = findType(project(), it.typeId);
  if (!t) return;
  if ((((it.a || 0) % 90) + 90) % 90 !== 0) { it.cx = Math.round(it.cx); it.cy = Math.round(it.cy); return; }
  const b = itemAABB(it, t.w, t.h), tol = 9, xs = [], ys = [];
  project().room.points.forEach(p => { xs.push(p[0], p[0] - b.w); ys.push(p[1], p[1] - b.h); });
  layout().items.forEach(o => {
    if (o === it) return;
    const ot = findType(project(), o.typeId); if (!ot) return;
    const q = itemAABB(o, ot.w, ot.h);
    xs.push(q.x, q.x + q.w, q.x - b.w, q.x + q.w - b.w);
    ys.push(q.y, q.y + q.h, q.y - b.h, q.y + q.h - b.h);
  });
  xs.forEach(v => { if (Math.abs(b.x - v) < tol) { it.cx += v - b.x; b.x = v; } });
  ys.forEach(v => { if (Math.abs(b.y - v) < tol) { it.cy += v - b.y; b.y = v; } });
  it.cx = Math.round(it.cx); it.cy = Math.round(it.cy);
}

function inRoom(it, t) {
  const room = project().room.points;
  return itemSamples(it, t.w, t.h, 8).every(p => pointInPoly(room, p[0], p[1]));
}

function toWall(it) {
  const t = findType(project(), it.typeId); if (!t) return;
  const b = itemAABB(it, t.w, t.h);
  const cand = [];
  project().room.points.forEach(p => {
    cand.push([p[0], b.y], [p[0] - b.w, b.y], [b.x, p[1]], [b.x, p[1] - b.h]);
  });
  let best = null, bd = 1e9;
  cand.forEach(c => {
    const test = { cx: it.cx + (c[0] - b.x), cy: it.cy + (c[1] - b.y), a: it.a };
    const d = Math.abs(c[0] - b.x) + Math.abs(c[1] - b.y);
    if (d < bd && d > 0.01 && inRoom(test, t)) { bd = d; best = test; }
  });
  if (best) { it.cx = Math.round(best.cx); it.cy = Math.round(best.cy); }
}

function snapFeatureToWall(f, tol) {
  const edges = polyEdges(project().room.points);
  let best = null, bd = tol == null ? 30 : tol;
  edges.forEach(e => {
    const pr = projectOnEdge(e, f.x, f.y);
    if (pr.dist < bd) { bd = pr.dist; best = { x: pr.x, y: pr.y, a: e.ang }; }
  });
  if (best) {
    f.x = Math.round(best.x); f.y = Math.round(best.y);
    f.a = Math.round(best.a * 10) / 10;
  }
}

/* ---------- Zeichnen ---------- */

const HINTS = {
  plan: 'Ziehen zum Verschieben · R oder Doppelklick dreht · Pfeiltasten für den Feinschliff · Entf entfernt',
  room: 'Ecken und Wandelemente lassen sich ziehen · Fenster und Türen rasten an der nächsten Wand ein',
  catalog: 'Maße und Farben gelten für alle Varianten dieses Raums'
};

function render() {
  const p = project(), l = layout();
  const check = validate(p, l);

  document.title = p.name + ' · Grundrissplaner';
  $('#title').value = p.name;
  $('#eyebrow').textContent = 'Grundriss · Innenmaße · ' + l.name;
  $('#hint').textContent = HINTS[state.mode];

  renderProjectBar($('#projectbar'), ctx(check));
  renderTabs($('#tabs'), ctx(check));

  document.querySelectorAll('.modebtn').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.mode === state.mode ? 'true' : 'false');
  });
  for (const k in panes) panes[k].hidden = k !== state.mode;

  if (state.mode === 'plan') renderPlanPane(panes.plan, ctx(check));
  else if (state.mode === 'room') renderRoomPane(panes.room, ctx(check));
  else renderCatalogPane(panes.catalog, ctx(check));

  // Notizen unter dem Plan
  const nl = $('#notes'); nl.innerHTML = '';
  l.notes.forEach(n => {
    const li = document.createElement('li');
    if (n.caution) li.className = 'caution';
    li.textContent = n.t;
    nl.appendChild(li);
  });
  $('#notes-wrap').hidden = l.notes.length === 0;

  renderPlan({ svg, project: p, layout: l, check, mode: state.mode === 'catalog' ? 'plan' : state.mode, sel: state.sel });
}

function ctx(check) {
  return { project: project(), layout: layout(), check, state, actions };
}

/* ---------- Zeigen und Ziehen ---------- */

let drag = null;

function toRoomCoords(e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

svg.addEventListener('pointerdown', e => {
  const g = e.target.closest ? e.target.closest('[data-kind]') : null;
  const p = toRoomCoords(e);
  if (!g) { state.sel = null; render(); return; }
  const kind = g.dataset.kind;

  if (kind === 'item' && state.mode === 'plan') {
    const it = layout().items.find(i => i.id === g.dataset.id);
    if (!it) return;
    state.sel = { kind: 'item', id: it.id };
    drag = { kind, ref: it, dx: p.x - it.cx, dy: p.y - it.cy, moved: false, snap: JSON.stringify(project()) };
  } else if (kind === 'feature' && state.mode === 'room') {
    const f = project().room.features.find(x => x.id === g.dataset.id);
    if (!f) return;
    state.sel = { kind: 'feature', id: f.id };
    drag = { kind, ref: f, dx: p.x - f.x, dy: p.y - f.y, moved: false, snap: JSON.stringify(project()) };
  } else if (kind === 'corner' && state.mode === 'room') {
    const i = +g.dataset.index;
    state.sel = { kind: 'corner', index: i };
    drag = { kind, index: i, dx: p.x - project().room.points[i][0], dy: p.y - project().room.points[i][1], moved: false, snap: JSON.stringify(project()) };
  }
  if (drag) svg.setPointerCapture(e.pointerId);
  render();
});

svg.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toRoomCoords(e);
  if (drag.kind === 'item') {
    drag.ref.cx = Math.round(p.x - drag.dx); drag.ref.cy = Math.round(p.y - drag.dy);
  } else if (drag.kind === 'feature') {
    drag.ref.x = Math.round(p.x - drag.dx); drag.ref.y = Math.round(p.y - drag.dy);
  } else if (drag.kind === 'corner') {
    project().room.points[drag.index] = [Math.round(p.x - drag.dx), Math.round(p.y - drag.dy)];
  }
  drag.moved = true;
  renderLight();
});

svg.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.moved) {
    if (drag.kind === 'item') snapItem(drag.ref);
    if (drag.kind === 'feature') snapFeatureToWall(drag.ref);
    state.history.push({ id: state.activeId, snap: drag.snap });
    if (state.history.length > 80) state.history.shift();
    state.future.length = 0;
    persist();
  }
  drag = null;
  render();
});

svg.addEventListener('dblclick', e => {
  const g = e.target.closest ? e.target.closest('[data-kind="item"]') : null;
  if (g && state.mode === 'plan') {
    const it = layout().items.find(i => i.id === g.dataset.id);
    if (it) commit(() => { it.a = Math.round((it.a || 0) + 90); snapItem(it); });
  }
});

/** Während des Ziehens nur den Plan neu zeichnen, nicht die ganze Seitenleiste. */
function renderLight() {
  const p = project(), l = layout();
  renderPlan({ svg, project: p, layout: l, check: validate(p, l), mode: state.mode === 'catalog' ? 'plan' : state.mode, sel: state.sel });
}

/* ---------- Tastatur ---------- */

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if (!state.sel) return;
  const step = e.shiftKey ? 10 : 1;
  const it = selectedItem(), f = selectedFeature();
  const corner = state.sel.kind === 'corner' ? project().room.points[state.sel.index] : null;
  const move = (dx, dy) => {
    if (it) { it.cx += dx; it.cy += dy; }
    else if (f) { f.x += dx; f.y += dy; }
    else if (corner) { corner[0] += dx; corner[1] += dy; }
  };
  let used = true;
  if (e.key === 'ArrowLeft') move(-step, 0);
  else if (e.key === 'ArrowRight') move(step, 0);
  else if (e.key === 'ArrowUp') move(0, -step);
  else if (e.key === 'ArrowDown') move(0, step);
  else if (e.key === 'r' || e.key === 'R') {
    if (it) it.a = Math.round((it.a || 0) + 90);
    else if (f) f.a = Math.round((f.a || 0) + 90);
    else used = false;
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault(); actions.deleteSelected(); return;
  } else used = false;

  if (used) {
    e.preventDefault();
    persist();
    renderLight();
    if (state.mode !== 'plan') render();
  }
});

/* ---------- Kopfzeile, Modi, Import ---------- */

$('#title').addEventListener('change', e => commit(() => { project().name = e.target.value || 'Raum'; }));

document.querySelectorAll('.modebtn').forEach(b => {
  b.addEventListener('click', () => { state.mode = b.dataset.mode; state.sel = null; render(); });
});

$('#file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  readProjectFile(f).then(ps => {
    ps.forEach(p => { p.id = uid('p'); state.projects.push(p); });
    state.activeId = state.projects[state.projects.length - 1].id;
    state.sel = null; persist(); render();
  }).catch(err => alert(err.message));
  e.target.value = '';
});

const themeBtn = $('#theme');
themeBtn.addEventListener('click', () => {
  const now = document.documentElement.getAttribute('data-theme');
  const next = now === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('floorplanner.theme', next); } catch (err) { /* egal */ }
});
try {
  const saved = localStorage.getItem('floorplanner.theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
} catch (err) { /* egal */ }

if (!storageAvailable()) {
  note('Dieser Browser speichert nichts dauerhaft (privates Fenster?) — exportier deinen Plan als Datei.');
} else {
  note('Wird automatisch in diesem Browser gespeichert.');
}

render();
