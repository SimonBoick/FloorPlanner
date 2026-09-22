/*
 * store.js — Persistenz im Browser plus Import/Export als JSON.
 *
 * Gespeichert wird ausschließlich lokal im Browser des Besuchers
 * (localStorage). Die Seite braucht dadurch keinerlei Server. Wer seine
 * Pläne mitnehmen oder teilen will, exportiert sie als .json.
 *
 * Alle Zugriffe sind gekapselt: Wer später ein Backend dahinterhängen will,
 * tauscht nur loadAll/saveAll gegen fetch-Aufrufe aus.
 */

import { normalizeProject, clone } from './model.js';
import { SIMONS_ZIMMER } from './presets.js';

const KEY = 'floorplanner.v1';

function safeGet() {
  try { return localStorage.getItem(KEY); } catch (e) { return null; }
}
function safeSet(v) {
  try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; }
}

export function loadAll() {
  const raw = safeGet();
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.projects) && data.projects.length) {
        return { projects: data.projects.map(normalizeProject), activeId: data.activeId };
      }
    } catch (e) { /* kaputter Eintrag: fällt unten auf das Beispiel zurück */ }
  }
  const demo = normalizeProject(clone(SIMONS_ZIMMER));
  return { projects: [demo], activeId: demo.id };
}

export function saveAll(state) {
  return safeSet(JSON.stringify({
    v: 1,
    savedAt: Date.now(),
    activeId: state.activeId,
    projects: state.projects
  }));
}

export function storageAvailable() {
  try {
    localStorage.setItem(KEY + '.probe', '1');
    localStorage.removeItem(KEY + '.probe');
    return true;
  } catch (e) { return false; }
}

/* ---------- Dateien ---------- */

export function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s) {
  return (s || 'plan').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
}

export function exportProject(p) {
  download(slug(p.name) + '.json', JSON.stringify(p, null, 2));
}

export function exportAll(state) {
  download('floorplanner-alle-raeume.json', JSON.stringify({ v: 1, projects: state.projects }, null, 2));
}

/** Liest eine .json-Datei und liefert immer ein Array von Projekten. */
export function readProjectFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    r.onload = () => {
      try {
        const data = JSON.parse(String(r.result));
        const list = Array.isArray(data) ? data : (Array.isArray(data.projects) ? data.projects : [data]);
        const projects = list.map(normalizeProject);
        if (!projects.length) throw new Error('leer');
        resolve(projects);
      } catch (e) {
        reject(new Error('Das ist keine gültige Plan-Datei.'));
      }
    };
    r.readAsText(file);
  });
}
