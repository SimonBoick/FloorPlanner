/*
 * exporters.js — Plan als Bild sichern.
 * Die Farben der Seite stecken in CSS-Variablen; für eine eigenständige Datei
 * werden ihre aktuellen Werte in das SVG hineinkopiert.
 */

import { download, slug } from './store.js';

const VARS = ['--paper', '--surface', '--surface-2', '--ink', '--ink-2', '--ink-3',
  '--line', '--line-soft', '--floor', '--wall', '--accent', '--accent-soft', '--warn', '--dim'];

function standalone(svg) {
  const cs = getComputedStyle(document.documentElement);
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = (svg.getAttribute('viewBox') || '0 0 800 800').split(/\s+/).map(Number);
  clone.setAttribute('width', Math.round(vb[2] * 2));
  clone.setAttribute('height', Math.round(vb[3] * 2));
  const decl = VARS.map(v => v + ':' + (cs.getPropertyValue(v).trim() || '#888')).join(';');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = 'svg{' + decl + ';background:var(--paper)}' +
    'text{font-family:"IBM Plex Sans",system-ui,sans-serif}';
  clone.insertBefore(style, clone.firstChild);
  clone.querySelectorAll('#g-handles').forEach(g => g.remove());
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', vb[0]); bg.setAttribute('y', vb[1]);
  bg.setAttribute('width', vb[2]); bg.setAttribute('height', vb[3]);
  bg.setAttribute('fill', 'var(--paper)');
  clone.insertBefore(bg, clone.childNodes[1]);
  return new XMLSerializer().serializeToString(clone);
}

export function exportSvg(svg, name) {
  download(slug(name) + '.svg', standalone(svg), 'image/svg+xml');
}

export function exportPng(svg, name) {
  const src = standalone(svg);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width || 1600; c.height = img.height || 1600;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob(b => {
      if (!b) return;
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u; a.download = slug(name) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('PNG-Export hat nicht geklappt — das SVG funktioniert aber.'); };
  img.src = url;
}
