/*
 * geom.js — Geometrie, Kollisionen und Prüfung.
 * Alle Maße in Zentimetern. Das Koordinatensystem ist das von SVG:
 * x nach rechts, y nach unten, Winkel in Grad im Uhrzeigersinn.
 */

export const DEG = Math.PI / 180;

/* ---------- Polygon ---------- */

export function pointInPoly(pts, px, py) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function polyBBox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Fläche in m² (Gauß'sche Trapezformel). */
export function polyAreaM2(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return Math.abs(a / 2) / 10000;
}

/** Kanten als {i, a, b, len, ang} — ang ist der Winkel in Grad. */
export function polyEdges(pts) {
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return { i, a, b, len: Math.hypot(dx, dy), ang: Math.atan2(dy, dx) / DEG };
  });
}

/** Lotrechter Abstand samt Fußpunkt eines Punktes auf einer Strecke. */
export function projectOnEdge(edge, x, y) {
  const dx = edge.b[0] - edge.a[0], dy = edge.b[1] - edge.a[1];
  const l2 = dx * dx + dy * dy || 1;
  let t = ((x - edge.a[0]) * dx + (y - edge.a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = edge.a[0] + t * dx, py = edge.a[1] + t * dy;
  return { x: px, y: py, t, dist: Math.hypot(x - px, y - py) };
}

/* ---------- lokale Koordinaten ---------- */

export function trig(a) { const r = a * DEG; return [Math.cos(r), Math.sin(r)]; }

/** Punkt im lokalen System eines Möbelstücks (Ursprung = Mittelpunkt). */
export function itemLocal(it, dx, dy) {
  const t = trig(it.a || 0);
  return [it.cx + dx * t[0] - dy * t[1], it.cy + dx * t[1] + dy * t[0]];
}

/** Punkt im lokalen System eines Wandelements (Ursprung = Ankerpunkt x/y). */
export function featLocal(f, dx, dy) {
  const t = trig(f.a || 0);
  return [f.x + dx * t[0] - dy * t[1], f.y + dx * t[1] + dy * t[0]];
}

export function itemCorners(it, w, h, inset) {
  const k = inset || 0, a = w / 2 - k, b = h / 2 - k;
  return [itemLocal(it, -a, -b), itemLocal(it, a, -b), itemLocal(it, a, b), itemLocal(it, -a, b)];
}

export function itemAABB(it, w, h) {
  const c = itemCorners(it, w, h);
  const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Rasterpunkte über der Möbelfläche, für Wand- und Türprüfung. */
export function itemSamples(it, w, h, step) {
  const s = step || 6, pts = [];
  for (let dx = -w / 2 + 1.5; dx < w / 2; dx += s)
    for (let dy = -h / 2 + 1.5; dy < h / 2; dy += s) pts.push(itemLocal(it, dx, dy));
  return pts.concat(itemCorners(it, w, h, 1.2));
}

export function itemCovers(it, w, h, x, y) {
  const t = trig(it.a || 0), dx = x - it.cx, dy = y - it.cy;
  const lx = dx * t[0] + dy * t[1], ly = -dx * t[1] + dy * t[0];
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

/** Separating Axis Theorem für zwei konvexe Vierecke. */
export function satOverlap(A, B) {
  for (let s = 0; s < 2; s++) {
    const P = s ? B : A, Q = s ? A : B;
    for (let i = 0; i < 4; i++) {
      const nx = -(P[(i + 1) % 4][1] - P[i][1]), ny = P[(i + 1) % 4][0] - P[i][0];
      const pa = P.map(p => p[0] * nx + p[1] * ny), pb = Q.map(p => p[0] * nx + p[1] * ny);
      if (Math.max(...pa) <= Math.min(...pb) + 0.5) return false;
      if (Math.max(...pb) <= Math.min(...pa) + 0.5) return false;
    }
  }
  return true;
}

/* ---------- Wandelemente ---------- */

/**
 * Wandelemente liegen mit ihrem Anker auf der Innenkante der Wand und werden
 * entlang ihres Winkels gezeichnet. Ob "lokal unten" in den Raum oder aus ihm
 * heraus zeigt, hängt von der Wand ab — das ermitteln wir mit einem Probepunkt.
 * Rückgabe: +1, wenn lokal +y in den Raum zeigt.
 */
export function featInwardSign(room, f) {
  const p = featLocal(f, (f.w || 0) / 2, 3);
  return pointInPoly(room, p[0], p[1]) ? 1 : -1;
}

/** Vier Weltkoordinaten für das lokale Rechteck x∈[0,w], y∈[y0,y1]. */
export function featQuad(f, y0, y1, w) {
  const ww = w == null ? (f.w || 0) : w;
  return [featLocal(f, 0, y0), featLocal(f, ww, y0), featLocal(f, ww, y1), featLocal(f, 0, y1)];
}

export function doorGeometry(f) {
  const atEnd = f.hinge === 'end';
  const h = atEnd ? featLocal(f, f.w, 0) : [f.x, f.y];
  const base = (f.a || 0) + (atEnd ? 180 : 0);
  const sw = (f.swing || 1) >= 0 ? 1 : -1;
  return { hx: h[0], hy: h[1], r: f.w, a0: sw > 0 ? base : base - 90, a1: sw > 0 ? base + 90 : base, base, sw };
}

export function inDoorSwing(f, x, y) {
  const g = doorGeometry(f);
  const dx = x - g.hx, dy = y - g.hy;
  if (Math.hypot(dx, dy) > g.r - 0.5) return false;
  const ang = Math.atan2(dy, dx) / DEG;
  const d = ((ang - g.a0) % 360 + 360) % 360;
  return d <= 90;
}

/* ---------- Prüfung ---------- */

const FRONT_CLEARANCE = 40;  // cm, die vor einem Heizkörper frei bleiben sollten

/**
 * Prüft eine Variante gegen den Raum.
 * Liefert Fehler je Möbel-Id, die freie Bodenfläche und die Zahl echter Konflikte.
 */
export function validate(project, layout) {
  const room = project.room.points;
  const types = new Map(project.catalog.map(t => [t.id, t]));
  const items = layout.items.filter(it => types.has(it.typeId));
  const geo = items.map(it => {
    const t = types.get(it.typeId);
    return { it, t, corners: itemCorners(it, t.w, t.h) };
  });

  const blocks = (project.room.features || []).filter(f => f.kind === 'fixed')
    .map(f => ({ f, corners: featQuad(f, 0, f.h) }));
  const doors = (project.room.features || []).filter(f => f.kind === 'door');
  const rads = (project.room.features || []).filter(f => f.kind === 'radiator');

  const msgs = {}, bad = {};

  geo.forEach((g, i) => {
    let m = null;
    const pts = itemSamples(g.it, g.t.w, g.t.h, 6);
    if (pts.some(p => !pointInPoly(room, p[0], p[1]))) m = 'steht in der Wand';
    if (!m && doors.some(d => pts.some(p => inDoorSwing(d, p[0], p[1])))) m = 'Tür blockiert';
    if (!m) {
      for (let j = 0; j < geo.length; j++) {
        if (j !== i && satOverlap(g.corners, geo[j].corners)) { m = 'überlappt'; break; }
      }
    }
    if (!m) {
      for (const b of blocks) {
        if (satOverlap(g.corners, b.corners)) { m = 'auf ' + (b.f.label || 'Einbau'); break; }
      }
    }
    if (m) { bad[g.it.id] = true; msgs[g.it.id] = m; return; }

    // weiche Warnung: steht nennenswert vor einem Heizkörper
    for (const r of rads) {
      const sign = featInwardSign(room, r);
      const zone = featQuad(r, 0, sign * (Math.abs(r.h) + FRONT_CLEARANCE));
      const pts = itemSamples(g.it, g.t.w, g.t.h, 4);
      const inside = pts.filter(p => pointInPoly(zone, p[0], p[1])).length;
      if (inside * 16 > 600) { msgs[g.it.id] = 'vor Heizung'; break; }
    }
  });

  // freie Bodenfläche: Rasterabtastung
  const bb = polyBBox(room), step = 5;
  let free = 0;
  for (let x = bb.x + step / 2; x < bb.x + bb.w; x += step) {
    for (let y = bb.y + step / 2; y < bb.y + bb.h; y += step) {
      if (!pointInPoly(room, x, y)) continue;
      let blocked = geo.some(g => itemCovers(g.it, g.t.w, g.t.h, x, y));
      if (!blocked) blocked = blocks.some(b => pointInQuad(b.corners, x, y));
      if (!blocked) free++;
    }
  }

  return { msgs, bad, free: free * step * step / 10000, count: Object.keys(bad).length };
}

export function pointInQuad(q, x, y) { return pointInPoly(q, x, y); }
