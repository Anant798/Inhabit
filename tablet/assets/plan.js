// 2D floor plan, drawn from /assets/plan.json (measured footprints exported from the room model by
// blender/export_room.py, the same export Unreal's level is built from) and the room's current configuration.
// Nothing here is a hand-placed coordinate: every outline, dimension, clearance and area is computed.
//   InhabitPlan.render(svg, side, plan, config, catalogue[, assets[, layout]])  assets: URL prefix for images;
//     layout: 2D-only position offsets (see prepare). InhabitPlan.interact(svg, { send }) adds drag to move.
// Units: 1 SVG unit = 1 mm. Plan origin: inside south-west corner of the room, x east, y north (drawn up).
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const OCCUPIES = new Set(["builtin", "fixture", "wallitem", "shower", "glass"]); // not rugs, not things overhead
  const CHAIN_KINDS = new Set(["builtin", "wallitem", "shower"]); // what the wall dimension chains measure
  const TOUCH = 40; // mm: counts as against a wall (the one-piece WC stands 25 mm off the ledge, as installed)
  const DIRS = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] };
  const OPP = { E: "W", W: "E", N: "S", S: "N" };

  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const Y = (y) => -y; // plan y (north up) -> SVG y (down)
  const pts = (poly) => poly.map(([x, y]) => `${x},${Y(y)}`).join(" ");
  const ftin = (mm) => {
    let inch = Math.round(mm / 25.4), f = Math.floor(inch / 12);
    return `${f}'-${inch - f * 12}"`;
  };
  const box = (poly) => {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const overlaps = (a, b, tol = 2) => a.x0 < b.x1 - tol && b.x0 < a.x1 - tol && a.y0 < b.y1 - tol && b.y0 < a.y1 - tol;
  function inside(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // Distance from (x, y) along an axis direction to the first obstacle edge or the room's inside face.
  function cast(x, y, dir, obstacles, room) {
    const [dx, dy] = DIRS[dir];
    let t = dx > 0 ? room.w - x : dx < 0 ? x : dy > 0 ? room.d - y : y, hit = "wall";
    for (const o of obstacles) {
      const p = o.poly;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [x1, y1] = p[j], [x2, y2] = p[i];
        if (dx) {
          if ((y1 > y) === (y2 > y)) continue;
          const xi = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1), d = (xi - x) * dx;
          if (d > -0.5 && d < t) { t = Math.max(0, d); hit = o; }
        } else {
          if ((x1 > x) === (x2 > x)) continue;
          const yi = y1 + ((x - x1) * (y2 - y1)) / (x2 - x1), d = (yi - y) * dy;
          if (d > -0.5 && d < t) { t = Math.max(0, d); hit = o; }
        }
      }
    }
    return { t, hit };
  }

  // Clear distance from an item's face in a direction, swept across its whole width (not one ray):
  // the nearest thing anywhere in front of it.
  function sweep(item, dir, obstacles, room) {
    const b = item.box, others = obstacles.filter((o) => o !== item && !overlaps(o.box, b));
    const along = dir === "E" || dir === "W";
    const [lo, hi] = along ? [b.y0, b.y1] : [b.x0, b.x1];
    const hits = [];
    for (let s = lo + 3; s <= hi - 3; s += 10) {
      const x = along ? (dir === "E" ? b.x1 : b.x0) : s, y = along ? s : dir === "N" ? b.y1 : b.y0;
      hits.push({ ...cast(x, y, dir, others, room), x, y });
    }
    if (!hits.length) return { t: Infinity };
    // The dimension goes in the middle of the stretch where the gap is smallest, not at its edge.
    const min = Math.min(...hits.map((h) => h.t)), near = hits.filter((h) => h.t <= min + 2);
    return { ...near[near.length >> 1], t: min };
  }

  // The side an item backs onto (a wall or the thing it's mounted on), or null in a corner / free-standing.
  function backOf(item, obstacles, room) {
    const gaps = Object.keys(DIRS).map((d) => [d, sweep(item, d, obstacles, room).t]).sort((a, b) => a[1] - b[1]);
    return gaps[0][1] <= TOUCH && gaps[1][1] > TOUCH ? gaps[0][0] : null;
  }

  function dim(g, a, b, off, text, cls = "dim", atStart = false) {
    // a, b: plan points; off: [dx, dy] offset of the dimension line from them (plan mm).
    const [ax, ay] = [a[0] + off[0], a[1] + off[1]], [bx, by] = [b[0] + off[0], b[1] + off[1]];
    const grp = el("g", { class: cls }, g);
    if (off[0] || off[1]) {
      const n = Math.hypot(...off), ux = off[0] / n, uy = off[1] / n;
      el("line", { x1: a[0] + ux * 40, y1: Y(a[1] + uy * 40), x2: ax + ux * 60, y2: Y(ay + uy * 60), class: "ext" }, grp);
      el("line", { x1: b[0] + ux * 40, y1: Y(b[1] + uy * 40), x2: bx + ux * 60, y2: Y(by + uy * 60), class: "ext" }, grp);
    }
    el("line", { x1: ax, y1: Y(ay), x2: bx, y2: Y(by) }, grp);
    for (const [x, y] of [[ax, ay], [bx, by]]) el("line", { x1: x - 28, y1: Y(y - 28), x2: x + 28, y2: Y(y + 28), class: "tick" }, grp);
    // Text sits on the line's upper (or, vertical, left) side, reading along it; a short dimension's text
    // starts past its end so it doesn't sit on the ticks.
    const vertical = Math.abs(bx - ax) < Math.abs(by - ay), len = Math.hypot(bx - ax, by - ay);
    const short = len < 300;
    const outward = off[0] || off[1]; // a chain: a short one's text moves further out, clear of its neighbours
    let [px, py] = short && !outward ? (vertical ? [ax, Math.max(ay, by) + 50] : [Math.max(ax, bx) + 50, ay]) : [(ax + bx) / 2, (ay + by) / 2];
    if (short && outward) {
      const n = Math.hypot(...off);
      [px, py] = [px + (off[0] / n) * 110, py + (off[1] / n) * 110];
    }
    let anchor = short && !outward ? "start" : "middle";
    if (atStart && !short) { // text from the measured item's end, so it doesn't sit on whatever is mid-way
      const forward = vertical ? Math.sign(by - ay) : Math.sign(bx - ax);
      [px, py] = vertical ? [ax, ay + forward * 60] : [ax + forward * 60, ay];
      anchor = (vertical ? forward > 0 : forward > 0) ? "start" : "end";
    }
    if (vertical) el("text", { x: px - 26, y: Y(py), "text-anchor": anchor, transform: `rotate(-90 ${px - 26} ${Y(py)})` }, grp, text);
    else el("text", { x: px, y: Y(py) - 26, "text-anchor": anchor }, grp, text);
    return grp;
  }

  function chain(g, breaks, wall, room, offset, labelFn) {
    // breaks: positions along the wall (mm); wall: "S" | "N" | "W" | "E"; offset: outward distance from the wall face.
    const pt = (s) => (wall === "S" ? [s, 0] : wall === "N" ? [s, room.d] : wall === "W" ? [0, s] : [room.w, s]);
    const out = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[wall];
    const off = [out[0] * (room.wall + offset), out[1] * (room.wall + offset)];
    for (let i = 1; i < breaks.length; i++) {
      const len = breaks[i] - breaks[i - 1];
      if (len > 0) dim(g, pt(breaks[i - 1]), pt(breaks[i]), off, labelFn ? labelFn(Math.round(len)) : String(Math.round(len)));
    }
  }

  // Free floor: a 10 mm raster of the room minus everything that takes up floor or body space.
  function raster(room, occ) {
    const N = 10, W = Math.ceil(room.w / N), H = Math.ceil(room.d / N), grid = new Uint8Array(W * H);
    for (const o of occ) {
      const b = o.box;
      for (let j = Math.max(0, Math.floor(b.y0 / N)); j < Math.min(H, Math.ceil(b.y1 / N)); j++)
        for (let i = Math.max(0, Math.floor(b.x0 / N)); i < Math.min(W, Math.ceil(b.x1 / N)); i++)
          if (!grid[j * W + i] && inside(o.poly, (i + 0.5) * N, (j + 0.5) * N)) grid[j * W + i] = o.kind === "shower" ? 2 : 1;
    }
    // Most open spot (for the label): breadth-first distance from anything taken.
    const dist = new Int32Array(W * H).fill(-1), q = [];
    for (let k = 0; k < W * H; k++) if (grid[k]) { dist[k] = 0; q.push(k); }
    for (let i = 0; i < W; i++) for (const j of [0, H - 1]) if (dist[j * W + i] < 0) { dist[j * W + i] = 1; q.push(j * W + i); }
    for (let j = 0; j < H; j++) for (const i of [0, W - 1]) if (dist[j * W + i] < 0) { dist[j * W + i] = 1; q.push(j * W + i); }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % W, j = (k / W) | 0;
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]])
        if (a >= 0 && b >= 0 && a < W && b < H && dist[b * W + a] < 0) { dist[b * W + a] = dist[k] + 1; q.push(b * W + a); }
    }
    let free = 0, shower = 0, taken = 0, best = 0;
    for (let k = 0; k < W * H; k++) {
      if (grid[k] === 0) free++; else if (grid[k] === 2) shower++; else taken++;
      if (dist[k] > dist[best]) best = k;
    }
    const a = (n) => (n * N * N) / 1e6;
    return { free: a(free), shower: a(shower), taken: a(taken), total: (room.w * room.d) / 1e6,
             spot: [((best % W) + 0.5) * N, (((best / W) | 0) + 0.5) * N], width: dist[best] * 2 * N };
  }


  // ---- Moving and turning things on the plan (and, through the control server, in the 3D room) ----
  // layout: { key: { dx, dy, r } }: an offset in mm and r quarter-turns clockwise. key = the item's category
  // (a moved commode stays put when its model is swapped in 3D), else its id. Doors are "door-0" (the room
  // door) and "door-1" (the shower door): they slide along their wall, and r picks the swing (doorAt). The
  // shower's walls: "shower-side" (the side glass, dx) and "shower-front" (the front glass, dy); the tray,
  // drain and glass resize to match (showerFit). plan.json and the export never change.
  const SHOWER_KEYS = { glass_fixed: "shower-side", glass_return: "shower-front" };
  const keyOf = (i) => i.category || SHOWER_KEYS[i.id] || i.id;
  // free: anywhere in the room, and turns. slide: along its wall only (the shower glass: across the shower).
  // null: fixed (the shower tray and drain follow the glass; overhead items stay).
  const moveMode = (i) => (i.category === "tap" || i.kind === "wallitem" || SHOWER_KEYS[i.id] ? "slide"
    : i.kind === "fixture" || i.kind === "builtin" || (i.kind === "rug" && i.id !== "drain") ? "free" : null);
  function wallOf(b, room) { // the room face an item's box is nearest to
    const g = { W: b.x0, E: room.w - b.x1, S: b.y0, N: room.d - b.y1 };
    return Object.keys(g).sort((a, c) => g[a] - g[c])[0];
  }
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  function ownOf(layout, key) {
    const v = layout[key] || {};
    return { dx: num(v.dx), dy: num(v.dy), r: ((Math.round(num(v.r)) % 4) + 4) % 4 };
  }
  const offOf = ownOf; // (kept for the tests' wording: dx, dy)
  const shiftBox = (b, o) => ({ x0: b.x0 + o.dx, x1: b.x1 + o.dx, y0: b.y0 + o.dy, y1: b.y1 + o.dy });
  // A wall item keeps its distance from its wall: only the along-the-wall part of an offset applies.
  const along = (wall, o) => (wall === "E" || wall === "W" ? { dx: 0, dy: o.dy } : { dx: o.dx, dy: 0 });
  const CW = { N: "E", E: "S", S: "W", W: "N" };
  const turnDir = (d, r) => { for (let k = 0; k < r; k++) d = CW[d]; return d; };
  const centre = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const turn = (r, c) => ([x, y]) => { // r quarter-turns clockwise about c (plan y is up)
    let u = x - c[0], v = y - c[1];
    for (let k = 0; k < r; k++) [u, v] = [v, -u];
    return [c[0] + u, c[1] + v];
  };
  function fitIn(b, room) { // the shift that brings a box back inside the room
    const dx = b.x0 < 0 ? -b.x0 : b.x1 > room.w ? room.w - b.x1 : 0;
    const dy = b.y0 < 0 ? -b.y0 : b.y1 > room.d ? room.d - b.y1 : 0;
    return { dx, dy };
  }

  // The room's four inside faces: a point t along the face (t = x on S/N, y on W/E), the inward normal.
  const FACES = {
    S: (room) => ({ at: (t) => [t, 0], a: [1, 0], nIn: [0, 1], len: room.w }),
    N: (room) => ({ at: (t) => [t, room.d], a: [1, 0], nIn: [0, -1], len: room.w }),
    W: (room) => ({ at: (t) => [0, t], a: [0, 1], nIn: [1, 0], len: room.d }),
    E: (room) => ({ at: (t) => [room.w, t], a: [0, 1], nIn: [-1, 0], len: room.d }),
  };
  const WALL_LETTER = { south: "S", north: "N", west: "W", east: "E" };

  // The room door can go in any wall: where it's dragged to (its opening's centre + the offset), it lands on
  // the nearest wall, its opening kept within that wall, hinged on the jamb nearer the wall's start and
  // swinging into the room as built. r bit 1 hinges it on the other jamb, bit 2 swings it out.
  function wallDoor(d, key, o, plan) {
    const room = plan.room, op = plan.openings[0], ow = op.to - op.from;
    const f0 = FACES[WALL_LETTER[op.wall] || "S"](room);
    const base = f0.at((op.from + op.to) / 2);
    const inset = Math.min(d.hinge[0] * f0.a[0] + d.hinge[1] * f0.a[1], d.closed[0] * f0.a[0] + d.closed[1] * f0.a[1]) - op.from;
    const depth = -((d.hinge[0] - base[0]) * f0.nIn[0] + (d.hinge[1] - base[1]) * f0.nIn[1]); // leaf sits in the wall
    const px = Math.max(0, Math.min(room.w, base[0] + o.dx)), py = Math.max(0, Math.min(room.d, base[1] + o.dy));
    const gaps = { S: py, N: room.d - py, W: px, E: room.w - px };
    const wall = Object.keys(gaps).sort((a, b) => gaps[a] - gaps[b])[0], f = FACES[wall](room);
    const t = Math.max(ow / 2, Math.min(f.len - ow / 2, wall === "S" || wall === "N" ? px : py));
    const from = t - ow / 2, w = d.width;
    let hinge = f.at(from + inset);
    hinge = [hinge[0] - f.nIn[0] * depth, hinge[1] - f.nIn[1] * depth];
    let closed = [hinge[0] + f.a[0] * w, hinge[1] + f.a[1] * w];
    if (o.r & 1) [hinge, closed] = [closed, hinge];
    const sw = o.r & 2 ? -1 : 1;
    const open = [hinge[0] + f.nIn[0] * w * sw, hinge[1] + f.nIn[1] * w * sw];
    const c = f.at(t), shift = { dx: c[0] - base[0], dy: c[1] - base[1] };
    return { key, label: d.label, hinge, closed, open, width: w, s: shift, r: o.r, inWall: true, horiz: wall === "S" || wall === "N",
             opening: { ...op, wall, from, to: from + ow }, mode: "wall", wall, moved: !!(shift.dx || shift.dy || o.r) };
  }

  // The shower cubicle's walls: the side glass slides across (dx), the front glass in and out (dy). The far
  // corner stays where it is (the shower sits in a corner of the room); the tray, drain and glass stretch to
  // the new size. At least 1000 mm wide (door + return glass) and 700 mm deep.
  function showerFit(base, layout, room) {
    const sb = base.find((i) => i.kind === "shower"), ret = base.find((i) => i.id === "glass_return");
    if (!sb) return null;
    const b = sb.box, cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const sideDx = cl(ownOf(layout, "shower-side").dx, -b.x0, b.x1 - 1000 - b.x0);
    const frontDy = cl(ownOf(layout, "shower-front").dy, -b.y0, b.y1 - 700 - b.y0);
    const kx = (b.x1 - b.x0 - sideDx) / (b.x1 - b.x0), ky = (b.y1 - b.y0 - frontDy) / (b.y1 - b.y0);
    const rx0 = ret ? ret.box.x0 : b.x0, kr = (b.x1 - rx0 - sideDx) / (b.x1 - rx0);
    return { sideDx, frontDy, box: { x0: b.x0 + sideDx, x1: b.x1, y0: b.y0 + frontDy, y1: b.y1 },
      tray: ([x, y]) => [b.x1 - (b.x1 - x) * kx, b.y1 - (b.y1 - y) * ky],
      drain: ([x, y]) => [b.x1 - (b.x1 - x) * kx, y],
      side: ([x, y]) => [x + sideDx, b.y1 - (b.y1 - y) * ky], // the side glass: across, and as deep as the shower
      front: ([x, y]) => [b.x1 - (b.x1 - x) * kr, y + frontDy] }; // the front glass: in/out, its far end fixed
  }

  // An affine move (plan mm) read off a point function: p' = [a b; c d] p + [tx, ty]. Unreal applies the same.
  function affine(f, fix = { dx: 0, dy: 0 }) {
    const o = f([0, 0]), ex = f([1000, 0]), ey = f([0, 1000]);
    return { a: (ex[0] - o[0]) / 1000, c: (ex[1] - o[1]) / 1000, b: (ey[0] - o[0]) / 1000, d: (ey[1] - o[1]) / 1000,
             tx: o[0] + fix.dx, ty: o[1] + fix.dy };
  }
  const IDENT = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

  // A door in its 2D state: r bit 1 hinges it on the other jamb, bit 2 swings it to the other side. The room
  // door goes in any wall (wallDoor); the shower door slides along the shower front, kept within it, and goes
  // with the shower's walls (pre).
  function doorAt(d, k, layout, plan, showerBox, pre = { dx: 0, dy: 0 }) {
    const key = `door-${k}`, o = ownOf(layout, key), w = d.width;
    const inWallDoor = d.hinge[1] < 0 || d.hinge[0] < 0 || d.hinge[1] > plan.room.d || d.hinge[0] > plan.room.w;
    if (inWallDoor && plan.openings[0]) return wallDoor(d, key, o, plan);
    const ax = (d.closed[0] - d.hinge[0]) / w, ay = (d.closed[1] - d.hinge[1]) / w;
    let nx = (d.open[0] - d.hinge[0]) / w, ny = (d.open[1] - d.hinge[1]) / w;
    let h = [d.hinge[0] + pre.dx, d.hinge[1] + pre.dy], c = [d.closed[0] + pre.dx, d.closed[1] + pre.dy];
    if (o.r & 1) [h, c] = [c, h];
    if (o.r & 2) [nx, ny] = [-nx, -ny];
    // Range along the door's line: the room's wall for a door in a wall, else the shower's front.
    const inWall = d.hinge[1] < 0 || d.hinge[0] < 0 || d.hinge[1] > plan.room.d || d.hinge[0] > plan.room.w;
    const horiz = Math.abs(ax) > Math.abs(ay);
    const [lo, hi] = inWall ? [0, horiz ? plan.room.w : plan.room.d]
      : showerBox ? (horiz ? [showerBox.x0 + 15, showerBox.x1 - 10] : [showerBox.y0 + 15, showerBox.y1 - 10]) : [-1e9, 1e9];
    // Kept in range by its opening in the wall (a few mm wider than the leaf), else by the leaf itself.
    const op = inWall && horiz && plan.openings[0];
    const p0 = op ? op.from : horiz ? Math.min(h[0], c[0]) : Math.min(h[1], c[1]), p1 = op ? op.to : p0 + w;
    let t = o.dx * ax + o.dy * ay; // only the along-the-line part counts
    t = Math.max(lo - p0, Math.min(hi - p1, t));
    const s = { dx: ax * t, dy: ay * t };
    const sh = (p) => [p[0] + s.dx, p[1] + s.dy];
    const hinge = sh(h), closed = sh(c), open = [hinge[0] + nx * w, hinge[1] + ny * w];
    return { key, label: d.label, hinge, closed, open, width: w, s, r: o.r, inWall, horiz, objects: d.objects || [],
             xf: { ...IDENT, tx: pre.dx + s.dx, ty: pre.dy + s.dy }, // in 3D the glass door moves; its swing is plan only
             mode: "slide", wall: horiz ? "S" : "W", moved: !!(t || o.r || pre.dx || pre.dy) };
  }

  // The items on plan for this configuration, each moved (turned, shifted, kept in the room) BEFORE its box is
  // taken, so every dimension, clearance, tag and area below follows the move. Linked items: the basin stands
  // on the vanity and goes with it; a deck tap goes with the basin (and so the vanity); a wall tap (above
  // 900 mm) only slides along its wall with where the basin went. Each item's back turns with it, so "clear
  // in front" knows which way is front.
  function prepare(plan, config, layout = {}) {
    const room = plan.room;
    const base = plan.items
      .filter((i) => !i.category || (config[i.category] || "A") === i.option)
      .map((i) => ({ ...i, box: box(i.poly), key: keyOf(i), mode: moveMode(i) }));
    const baseOcc = base.filter((i) => OCCUPIES.has(i.kind));
    const find = (k) => base.find((i) => i.key === k);
    const SH = showerFit(base, layout, room);
    const showerRole = (i) => SH && ({ shower: SH.tray, drain: SH.drain, glass_fixed: SH.side, glass_return: SH.front }[i.id]);
    // An item's own move: turn about its centre, then whatever it stands on, then its own shift (world mm).
    const moveOf = (i) => {
      if (!i) return { f: (p) => p, r: 0 };
      const o = ownOf(layout, i.key);
      if (i.mode === "slide") { const s = along(wallOf(i.box, room), o); return { f: ([x, y]) => [x + s.dx, y + s.dy], r: 0, slide: true }; }
      if (i.mode !== "free") return { f: (p) => p, r: 0 };
      const t = turn(o.r, centre(i.box));
      return { f: (p) => { const q = t(p); return [q[0] + o.dx, q[1] + o.dy]; }, r: o.r, rot: t, o };
    };
    const vanity = moveOf(find("vanity")), basinItem = find("washbasin");
    const basinFull = (() => { // the basin's full move (its own, on top of the vanity's)
      const b = moveOf(basinItem);
      if (!b.rot) return vanity;
      return { f: (p) => { const q = vanity.f(b.rot(p)); return [q[0] + b.o.dx, q[1] + b.o.dy]; }, r: b.r + vanity.r };
    })();
    const fullOf = (i) => {
      const sf = showerRole(i);
      if (sf) return { f: sf, r: 0, shower: true };
      if (!i.mode) return null;
      const m = moveOf(i);
      if (i.category === "washbasin") return basinFull;
      if (i.category === "tap") {
        if (i.z[0] > 900) { // wall tap: only the along-the-wall part of where the basin went
          const c = centre(basinItem ? basinItem.box : i.box), to = basinFull.f(c);
          const d = along(wallOf(i.box, room), { dx: to[0] - c[0], dy: to[1] - c[1] });
          return { f: (p) => { const q = m.f(p); return [q[0] + d.dx, q[1] + d.dy]; }, r: 0 };
        }
        return { f: (p) => basinFull.f(m.f(p)), r: basinFull.r }; // deck tap: rides on the basin
      }
      return m;
    };
    const items = base.map((i) => {
      const back = i.kind === "shower" ? null : backOf(i, baseOcc, room);
      const m = fullOf(i);
      let poly = m ? i.poly.map((p) => m.f(p)) : i.poly, b = box(poly);
      const fix = m && !m.shower ? fitIn(b, room) : { dx: 0, dy: 0 };
      if (fix.dx || fix.dy) { poly = poly.map(([x, y]) => [x + fix.dx, y + fix.dy]); b = shiftBox(b, fix); }
      const r = m ? m.r % 4 : 0;
      const moved = !!m && (r !== 0 || Math.abs(b.x0 - i.box.x0) > 0.5 || Math.abs(b.y0 - i.box.y0) > 0.5);
      return { ...i, back: back && turnDir(back, r), turned: r, wall: wallOf(i.box, room), baseBox: i.box, fix,
               off: { dx: b.x0 - i.box.x0, dy: b.y0 - i.box.y0 }, moved, xf: m ? affine(m.f, fix) : IDENT,
               poly: moved ? poly.map(([x, y]) => [Math.round(x), Math.round(y)]) : i.poly, box: moved ? b : i.box };
    });
    // Doors, the opening in the wall, and the shower front's glass around its door.
    const shower = items.find((i) => i.kind === "shower");
    const doors = plan.doors.map((d, k) => doorAt(d, k, layout, plan, shower && shower.box,
      SH ? { dx: SH.sideDx, dy: SH.frontDy } : undefined));
    const openings = plan.openings.map((op, k) => {
      const d = doors.find((x) => x.opening);
      return k === 0 && d ? d.opening : { ...op, wall: WALL_LETTER[op.wall] || "S" };
    });
    // A door moved into a wall where something stands against it (the ledge, the vanity...): drawn red.
    for (const d of doors.filter((x) => x.opening && x.moved)) {
      const o = d.opening, along = o.wall === "S" || o.wall === "N";
      d.clash = items.some((i) => OCCUPIES.has(i.kind) && i.kind !== "glass" &&
        { S: i.box.y0 <= TOUCH, N: i.box.y1 >= room.d - TOUCH, W: i.box.x0 <= TOUCH, E: i.box.x1 >= room.w - TOUCH }[o.wall] &&
        (along ? i.box.x0 < o.to && i.box.x1 > o.from : i.box.y0 < o.to && i.box.y1 > o.from));
    }
    const sd = doors.find((d) => !d.inWall), gr = items.findIndex((i) => i.id === "glass_return");
    let gone = null; // objects shrunk away in 3D (the return glass when the door slid over all of it)
    if (sd && gr >= 0 && shower && Math.abs(sd.s.dx) > 0.5) {
      const g = items[gr], [y0, y1] = [g.box.y0, g.box.y1], gap = 40, ob = g.baseBox;
      const dx0 = Math.min(sd.hinge[0], sd.closed[0]), dx1 = Math.max(sd.hinge[0], sd.closed[0]);
      const seg = (a, b, id) => ({ ...g, id, poly: [[a, y0], [b, y0], [b, y1], [a, y1]], box: { x0: a, x1: b, y0, y1 } });
      const parts = [];
      // The glass left of the door is drawn on the plan only (the 3D room has one return panel: right of it).
      if (dx0 - gap - (shower.box.x0 + 10) > 60) parts.push({ ...seg(shower.box.x0 + 10, dx0 - gap, "glass_front_a"), key: "glass_front_a", mode: null, objects: [] });
      if (g.box.x1 - (dx1 + gap) > 60) {
        const r = seg(dx1 + gap, g.box.x1, "glass_return"), k = (r.box.x1 - r.box.x0) / (ob.x1 - ob.x0);
        parts.push({ ...r, xf: { a: k, b: 0, c: 0, d: 1, tx: r.box.x0 - ob.x0 * k, ty: g.xf.ty } });
      } else gone = { objects: g.objects, xf: { a: 0.001, b: 0, c: 0, d: 1, tx: ob.x1 * 0.999, ty: g.xf.ty } };
      items.splice(gr, 1, ...parts);
    }
    // A moved item drawn red while it overlaps something it didn't overlap in the 3D room.
    const occ = items.filter((i) => OCCUPIES.has(i.kind));
    for (const i of items) {
      if (!i.moved || !OCCUPIES.has(i.kind)) continue;
      i.clash = occ.some((o) => o !== i && o.baseBox && overlaps(i.box, o.box) && !overlaps(i.baseBox, o.baseBox) &&
                                !(i.category === "tap" && o.category === "washbasin"));
    }
    return { room, items, occ, doors, openings, shower: SH, gone };
  }

  // Every object's move for the 3D room: the chosen models and, so a swap is instant, every other model of
  // each fitting as if it were chosen. [{ objects: [mesh names], a, b, c, d, tx, ty }] in plan mm; the
  // control server turns them into Unreal positions. Unmoved objects come back to where they were built.
  function moves3d(plan, config, layout = {}) {
    const out = [], seen = new Set();
    const push = (objects, xf) => {
      const o = (objects || []).filter((n) => !seen.has(n));
      o.forEach((n) => seen.add(n));
      if (o.length) out.push({ objects: o, ...xf });
    };
    const p = prepare(plan, config, layout);
    for (const i of p.items) push(i.objects, i.xf);
    for (const d of p.doors) push(d.objects, d.inWall ? IDENT : d.xf); // the room door: plan only (a hole in a wall)
    if (p.gone) push(p.gone.objects, p.gone.xf);
    for (const i of plan.items) {
      if (!i.category || seen.has((i.objects || [])[0])) continue;
      const q = prepare(plan, { ...config, [i.category]: i.option }, layout);
      const it = q.items.find((x) => x.category === i.category);
      if (it) push(it.objects, it.xf);
    }
    return out;
  }

  // Clear distance in front of an item (from the side opposite its back), or null.
  function frontClear(item, occ, room) {
    if (!item.back) return null;
    const f = sweep(item, OPP[item.back], occ, room);
    return f.t < Infinity ? f : null;
  }

  // Where an item lands when dropped or turned: its own { dx, dy, r }, kept in the room, its back snapped
  // flush to a wall or a built-in within 50 mm. Returns what to store in layout. Doors: kept on their line.
  function place(plan, config, layout, key, o) {
    const r = ((Math.round(num(o.r)) % 4) + 4) % 4;
    const p = prepare(plan, config, { ...layout, [key]: { ...o, r } });
    const door = p.doors.find((d) => d.key === key);
    if (door) return { dx: Math.round(door.s.dx), dy: Math.round(door.s.dy), r };
    if (key === "shower-side" && p.shower) return { dx: Math.round(p.shower.sideDx), dy: 0, r: 0 };
    if (key === "shower-front" && p.shower) return { dx: 0, dy: Math.round(p.shower.frontDy), r: 0 };
    const i = p.items.find((x) => x.key === key && x.mode);
    if (!i) return null;
    const asked = i.mode === "slide" ? along(i.wall, o) : o;
    let res = { dx: asked.dx + i.fix.dx, dy: asked.dy + i.fix.dy }; // what prepare had to pull back into the room
    if (i.mode === "free") { // snap the back (or, with no back, the nearest side) flush within 50 mm
      const dirs = i.back ? [i.back] : Object.keys(DIRS);
      let best = null;
      for (const d of dirs) {
        const t = sweep(i, d, p.occ, p.room).t;
        if (t > 0.5 && t < 50 && (!best || t < best[1])) best = [d, t];
      }
      if (best) res = { dx: res.dx + DIRS[best[0]][0] * best[1], dy: res.dy + DIRS[best[0]][1] * best[1] };
    }
    return { dx: Math.round(res.dx), dy: Math.round(res.dy), r: i.mode === "free" ? r : 0 };
  }

  // A layout with one key set (all zero removes the key, so "nothing moved" is {}).
  function withOff(layout, key, o) {
    const next = { ...layout };
    if (o && (o.dx || o.dy || o.r)) next[key] = o.r ? { dx: o.dx, dy: o.dy, r: o.r } : { dx: o.dx, dy: o.dy };
    else delete next[key];
    return next;
  }

  // Drag to move on a rendered plan (mouse on the TV, finger on the phone), plus select, nudge, undo, redo,
  // reset. opts.send(layout): the page applies it and sends it to the control server. During a drag only
  // the dragged shape gets a transform: render() would clear the svg and drop the pointer capture.
  function interact(svg, opts) {
    const hist = [], redo = [];
    let drag = null;
    const cur = () => svg._plan || { layout: {}, items: [] }; // before the first render: nothing to move
    const toPlan = (e) => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return [p.x, -p.y];
    };
    const commit = (layout) => {
      hist.push(cur().layout);
      if (hist.length > 100) hist.shift();
      redo.length = 0;
      opts.send(layout);
    };
    const turnable = (key) => { const it = key && cur().items.find((i) => i.key === key); return !!it && (it.mode === "free" || /^door-/.test(key)); };
    // The drag handle: a big round button beside the selected item. Hold it with a finger (or the mouse) and
    // move: on a touch screen the shapes themselves only select, so a finger on the plan still scrolls and zooms.
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "plan-handle";
    handle.textContent = "✥";
    handle.setAttribute("aria-label", "Hold and drag to move the selected item");
    handle.title = "Hold and drag to move the selected item";
    handle.hidden = true;
    svg.parentNode.appendChild(handle);
    const placeHandle = () => { // just below-right of the selected item, inside the plan's box
      const host = svg.parentNode, el = svg._sel && svg.querySelector(`[data-key="${svg._sel}"]`);
      handle.hidden = !el;
      if (!el) return;
      const r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
      const x = Math.min(r.right + 6, h.right - 60) - h.left + host.scrollLeft;
      const y = Math.min(r.bottom + 6, h.bottom - 60) - h.top + host.scrollTop;
      handle.style.left = `${Math.max(4, x)}px`;
      handle.style.top = `${Math.max(4, y)}px`;
      handle.style.transform = "";
    };
    svg._afterRender = placeHandle;

    const select = (key) => {
      svg._sel = key || null;
      for (const e of svg.querySelectorAll("[data-key]")) e.classList.toggle("selected", e.dataset.key === key);
      if (svg._rot) svg._rot.hidden = !turnable(svg._sel);
      placeHandle();
    };
    const put = (key, o) => { // placed (clamped, snapped), committed if it changed
      const { plan, config, layout } = cur(), own = ownOf(layout, key);
      const next = place(plan, config, layout, key, o);
      if (next && (next.dx !== own.dx || next.dy !== own.dy || next.r !== own.r)) commit(withOff(layout, key, next));
    };
    const move = (key, d) => { const own = ownOf(cur().layout, key); put(key, { dx: own.dx + d.dx, dy: own.dy + d.dy, r: own.r }); };
    // Turn 90 degrees clockwise (a door: its next swing - other jamb, other side), then placed as a drop.
    const rotate = (key = svg._sel) => { if (turnable(key)) { const own = ownOf(cur().layout, key); put(key, { ...own, r: (own.r + 1) % 4 }); } };

    // One drag, from an item's shape (mouse) or from the handle (any pointer). During it only transforms
    // change; render() would clear the svg and drop the pointer capture.
    const startDrag = (e, key, el) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone: the drag still follows its events */ }
      drag = { key, id: e.pointerId, sx: e.clientX, sy: e.clientY, start: toPlan(e), d: null, el,
               item: cur().items.find((i) => i.key === key) };
    };
    const dragMove = (e) => {
      if (!drag || e.pointerId !== drag.id || !drag.item) return;
      if (!drag.d && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return; // a tap is not a move
      const [x, y] = toPlan(e);
      let d = { dx: x - drag.start[0], dy: y - drag.start[1] };
      if (drag.item.mode === "slide") d = along(drag.item.wall, d);
      drag.d = d;
      const keys = [drag.key, ...({ vanity: ["washbasin", "tap"], washbasin: ["tap"] }[drag.key] || [])]; // what stands on it
      for (const k of keys) for (const g of svg.querySelectorAll(`[data-key="${k}"]`)) g.setAttribute("transform", `translate(${d.dx} ${-d.dy})`);
      if (drag.el === handle) handle.style.transform = `translate(${e.clientX - drag.sx}px, ${e.clientY - drag.sy}px)`;
    };
    const dragEnd = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dr = drag;
      drag = null;
      if (dr.d) move(dr.key, dr.d); else placeHandle();
    };
    svg.addEventListener("pointerdown", (e) => {
      const t = e.target.closest && e.target.closest("[data-key]");
      if (!t) { if (e.pointerType === "mouse") select(null); return; } // a finger on the floor pans/zooms
      select(t.dataset.key);
      if (e.pointerType === "mouse" || e.pointerType === "pen") startDrag(e, t.dataset.key, t); // a finger: select only
    });
    svg.addEventListener("pointermove", dragMove);
    svg.addEventListener("pointerup", dragEnd);
    svg.addEventListener("pointercancel", dragEnd);
    handle.addEventListener("pointerdown", (e) => { if (svg._sel) startDrag(e, svg._sel, handle); });
    handle.addEventListener("pointermove", dragMove);
    handle.addEventListener("pointerup", dragEnd);
    handle.addEventListener("pointercancel", dragEnd);
    svg.addEventListener("dblclick", (e) => { const t = e.target.closest && e.target.closest("[data-key]"); if (t) rotate(t.dataset.key); });

    // Rotate button, shown while something that turns is selected (or press R on the PC).
    const rot = document.createElement("button");
    rot.type = "button";
    rot.className = "plan-rotate";
    rot.textContent = "⟳ Rotate 90°";
    rot.title = "Turn the selected item 90° clockwise (a door: change its swing). Also R, or double-click it.";
    rot.hidden = true;
    rot.onclick = () => rotate();
    svg.parentNode.appendChild(rot);
    svg._rot = rot;

    // "Layout changed · Reset", over the plan whenever anything has been moved (render sets its words).
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "plan-chip";
    chip.textContent = "Layout changed · Reset";
    chip.title = "Moves show on the plan and in the 3D room (the room door: on the plan only). Click to put everything back.";
    chip.hidden = true;
    svg.parentNode.appendChild(chip);
    svg._chip = chip;
    const reset = () => { if (Object.keys(cur().layout).length) commit({}); };
    chip.onclick = reset;

    return {
      reset,
      deselect: () => select(null),
      rotate: () => rotate(),
      selected: () => svg._sel,
      nudge: (dx, dy) => { // mm, from the arrow keys
        const it = svg._sel && cur().items.find((i) => i.key === svg._sel);
        if (it) move(it.key, it.mode === "slide" ? along(it.wall, { dx, dy }) : { dx, dy });
      },
      undo: () => { if (hist.length) { redo.push(cur().layout); opts.send(hist.pop()); } },
      redo: () => { if (redo.length) { hist.push(cur().layout); opts.send(redo.pop()); } },
    };
  }

  function render(svg, side, plan, config, catalogue, assets = "/assets/", layout = {}) {
    const room = plan.room, M = room.wall + 900;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `${-M} ${-(room.d + M)} ${room.w + 2 * M} ${room.d + 2 * M}`);
    const defs = el("defs", {}, svg);
    const pat = el("pattern", { id: "hatch", width: 45, height: 45, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 45, height: 45, fill: "#e6e1d9" }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 45, stroke: "#9c958a", "stroke-width": 4 }, pat);
    // Clean drawing (white floor, like a CAD sheet); the finishes are named in the side panel instead.
    const tile = config.walltile || "Beige";
    const soft = el("filter", { id: "soft", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
    el("feDropShadow", { dx: 0, dy: 14, stdDeviation: 16, "flood-color": "#2B2927", "flood-opacity": 0.16 }, soft);

    const name = (cat, v) => (catalogue[cat] || []).find((o) => o.value === v) || {};
    const prep = prepare(plan, config, layout);
    const items = prep.items.map((i) => Object.assign(i, { label: i.label || name(i.category, i.option).name }));
    const occ = prep.occ;
    const stats = raster(room, occ);
    // What the drag controller needs between renders.
    svg._plan = { plan, config, layout, items: items.concat(prep.doors), room };
    if (svg._chip) {
      svg._chip.hidden = !Object.keys(layout).length;
      svg._chip.textContent = layout["door-0"] ? "Layout changed · room door: plan only · Reset" : "Layout changed · Reset";
    }
    if (svg._rot) svg._rot.hidden = !(svg._sel && (/^door-/.test(svg._sel) || items.some((i) => i.key === svg._sel && i.mode === "free")));
    const attrs = (i, cls) => {
      const a = { points: pts(i.poly), class: cls + (i.mode ? " movable" : "") + (i.clash ? " clash" : "") + (svg._sel === i.key && i.mode ? " selected" : "") };
      if (i.mode) a["data-key"] = i.key;
      return a;
    };

    // Floor: clear walking space first, everything else drawn over it.
    el("rect", { x: 0, y: -room.d, width: room.w, height: room.d, class: "floor" }, svg);
    for (const i of items.filter((i) => i.kind === "shower")) el("polygon", { points: pts(i.poly), class: "shower" }, svg);
    for (const d of prep.doors) { // swing arc and leaf; an invisible sector to grab it by
      const r = d.width, [hx, hy] = d.hinge;
      const sweepFlag = ((d.closed[0] - hx) * (d.open[1] - hy) - (d.closed[1] - hy) * (d.open[0] - hx)) > 0 ? 0 : 1;
      const arc = `M${d.closed[0]},${Y(d.closed[1])} A${r},${r} 0 0 ${sweepFlag} ${d.open[0]},${Y(d.open[1])}`;
      const sel = svg._sel === d.key ? " selected" : "";
      el("path", { d: `M${hx},${Y(hy)} L${d.closed[0]},${Y(d.closed[1])} A${r},${r} 0 0 ${sweepFlag} ${d.open[0]},${Y(d.open[1])} Z`, class: "doorhit movable" + sel, "data-key": d.key }, svg);
      el("path", { d: arc, class: "swing" + sel, "data-key": d.key }, svg);
      el("line", { x1: hx, y1: Y(hy), x2: d.open[0], y2: Y(d.open[1]), class: "leaf" + sel + (d.clash ? " clash" : ""), "data-key": d.key }, svg);
    }
    for (const i of items.filter((i) => i.kind === "rug")) el("polygon", attrs(i, "rug"), svg);
    const order = ["builtin", "wallitem", "fixture"];
    for (const k of order) for (const i of items.filter((i) => i.kind === k)) el("polygon", attrs(i, `occ ${k}`), svg);
    for (const i of items.filter((i) => i.kind === "glass")) {
      el("polygon", { points: pts(i.poly), class: "glass" + (i.clash ? " clash" : "") + (svg._sel === i.key && i.mode ? " selected" : "") }, svg);
      if (!i.mode) continue;
      const b = i.box, thin = b.x1 - b.x0 < b.y1 - b.y0, g = 90; // a wider band to grab the thin glass by
      const hb = thin ? { x0: b.x0 - g, x1: b.x1 + g, y0: b.y0, y1: b.y1 } : { x0: b.x0, x1: b.x1, y0: b.y0 - g, y1: b.y1 + g };
      el("polygon", { points: pts([[hb.x0, hb.y0], [hb.x1, hb.y0], [hb.x1, hb.y1], [hb.x0, hb.y1]]), class: "doorhit movable" + (svg._sel === i.key ? " selected" : ""), "data-key": i.key }, svg);
    }
    for (const i of items.filter((i) => i.kind === "above")) el("polygon", { points: pts(i.poly), class: "above" }, svg);

    // Walls: solid poché, cut at the door opening.
    const W = room.wall;
    el("path", { d: `M${-W},${W} H${room.w + W} V${-(room.d + W)} H${-W} Z M0,0 V${-room.d} H${room.w} V0 Z`, class: "wall", "fill-rule": "evenodd" }, svg);
    for (const o of prep.openings) { // the gap in whichever wall the door is in, and its jambs
      const n = o.to - o.from;
      if (o.wall === "S" || o.wall === "N") {
        const y0 = o.wall === "S" ? 0 : -(room.d + W); // svg y of the wall band
        el("rect", { x: o.from, y: y0 - 2, width: n, height: W + 4, class: "opening" }, svg);
        for (const x of [o.from, o.to]) el("line", { x1: x, y1: y0, x2: x, y2: y0 + W, class: "jamb" }, svg);
      } else {
        const x0 = o.wall === "W" ? -W : room.w;
        el("rect", { x: x0 - 2, y: Y(o.to), width: W + 4, height: n, class: "opening" }, svg);
        for (const y of [o.from, o.to]) el("line", { x1: x0, y1: Y(y), x2: x0 + W, y2: Y(y), class: "jamb" }, svg);
      }
    }

    const g = el("g", {}, svg);
    // Wall chains (distances along each wall) and overall dimensions, outside the walls.
    for (const wall of ["S", "N", "W", "E"]) {
      const len = wall === "S" || wall === "N" ? room.w : room.d, br = new Set([0, len]);
      for (const i of items.filter((i) => CHAIN_KINDS.has(i.kind))) {
        const b = i.box;
        const touches = { S: b.y0 <= TOUCH, N: b.y1 >= room.d - TOUCH, W: b.x0 <= TOUCH, E: b.x1 >= room.w - TOUCH }[wall];
        if (!touches) continue;
        for (const s of wall === "S" || wall === "N" ? [b.x0, b.x1] : [b.y0, b.y1]) br.add(Math.max(0, Math.min(len, s)));
      }
      for (const o of prep.openings) if (o.wall === wall) br.add(o.from), br.add(o.to);
      const breaks = [...br].sort((a, b) => a - b).filter((s, k, a) => k === 0 || s - a[k - 1] > 5);
      if (breaks.length > 2) chain(g, breaks, wall, room, 260);
      chain(g, [0, len], wall, room, breaks.length > 2 ? 560 : 260, (l) => `${l} (${ftin(l)})`);
    }

    // Fixtures: footprint size, position from the walls either side, and the clear space in front.
    const tags = [];
    let n = 0;
    const schedule = [];
    const rank = { fixture: 0, above: 1, builtin: 2, shower: 3, wallitem: 4 };
    const tagged = items.filter((i) => i.kind in rank).sort((a, b) => rank[a.kind] - rank[b.kind]);
    for (const i of tagged) {
      const b = i.box, w = b.x1 - b.x0, d = b.y1 - b.y0;
      const back = i.back; // as placed in the 3D room: a move doesn't turn it
      const across = back === "E" || back === "W"; // wall runs north-south
      const size = back ? (across ? `${d} × ${w}` : `${w} × ${d}`) : `${w} × ${d}`;
      n += 1;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const small = Math.min(w, d) < 240 || i.kind === "above";
      // Tag: on the item if it's big enough and nothing else is there, else on a leader to the least
      // crowded free spot nearby (not on another item, not on another tag).
      const holds = (o) => o.box.x0 <= b.x0 + 2 && o.box.y0 <= b.y0 + 2 && o.box.x1 >= b.x1 - 2 && o.box.y1 >= b.y1 - 2;
      const others = items.filter((o) => o !== i && o.kind !== "rug" && !holds(o)); // incl. the shower: a tap's tag mustn't land in it
      // Candidates: [x, y, preference, with size text]. Best: the item's centre; then anywhere on the item
      // where the tag and its size fit clear of what stands on it; then the tag alone there (the size is
      // in the table); last, nearby on a leader.
      // The shower's tag and label go in a fixed row by its door side, clear of every shower head model.
      const shower = i.kind === "shower";
      const cands = shower ? [[cx - 300, b.y0 + 230, 5000, false]] : small ? [] : [[cx, cy, 1500, true]];
      if (!small && !shower) {
        const ring = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
        const sizeText = [[0, -1.9], [1.4, -1.9], [-1.4, -1.9]];
        const clear = (px, py, pts) => pts.every(([u, v]) => inside(i.poly, px + u * 110, py + v * 110) &&
          !items.some((o) => o !== i && o.kind !== "rug" && inside(o.poly, px + u * 110, py + v * 110)));
        for (let px = b.x0 + 110; px <= b.x1 - 110; px += 40)
          for (let py = b.y0 + 110; py <= b.y1 - 110; py += 40) {
            if (!clear(px, py, ring)) continue;
            const pull = Math.hypot(px - cx, py - cy) / 10;
            cands.push(clear(px, py, sizeText) ? [px, py, 1200 - pull, true] : [px, py, 900 - pull, false]);
          }
      }
      if (!shower) for (const r of [330, 480, 650]) for (let a = 0; a < 12; a++) cands.push([cx + Math.cos((a * Math.PI) / 6) * r, cy + Math.sin((a * Math.PI) / 6) * r, 0, true]);
      let tx = cx, ty = cy, withSize = true, bestScore = -Infinity;
      for (const [px, py, bonus, sz] of cands) {
        const nearest = Math.min(1000, ...tags.map(([x, y]) => Math.hypot(x - px, y - py)));
        let score = nearest + bonus - (nearest < 170 ? 3000 : 0);
        if (others.some((o) => inside(o.poly, px, py))) score -= 2000;
        if (px < 90 || py < 90 || px > room.w - 90 || py > room.d - 90) score -= 2000;
        if (score > bestScore) [bestScore, tx, ty, withSize] = [score, px, py, sz];
      }
      if (!inside(i.poly, tx, ty)) { // off the item: a leader back to it
        const lx = Math.max(b.x0, Math.min(b.x1, tx)), ly = Math.max(b.y0, Math.min(b.y1, ty));
        el("line", { x1: lx, y1: Y(ly), x2: tx, y2: Y(ty), class: "leader" }, g);
      }
      tags.push([tx, ty]);
      el("circle", { cx: tx, cy: Y(ty), r: 72, class: "tag" }, g);
      el("text", { x: tx, y: Y(ty) + 27, class: "tagtext", "text-anchor": "middle" }, g, String(n));
      if (!small && withSize && i.kind === "fixture") { // fittings' sizes on the drawing; the rest in the table
        const side = tx > room.w - 300 ? ["end", tx + 62] : tx < 300 ? ["start", tx - 62] : ["middle", tx];
        el("text", { x: side[1], y: Y(ty) + 150, class: "size", "text-anchor": side[0] }, g, size);
      }
      if (i.kind === "shower") {
        el("text", { x: tx + 115, y: Y(ty) - 5, class: "zone" }, g, "SHOWER"); // beside its tag
        el("text", { x: tx + 115, y: Y(ty) + 75, class: "zonesub" }, g, `${w} × ${d}`);
      }
      const info = name(i.category, i.option);
      schedule.push({ n, label: i.label, model: info.model ? `Kohler ${info.model}` : "", size, z: i.z, kind: i.kind });

      // Distances and clearances for the free-standing and wall-mounted pieces people walk around.
      if (back && (i.kind === "fixture" || i.id === "vanity") && !(i.category === "washbasin" || i.category === "tap")) {
        const front = OPP[back];
        const f = frontClear(i, occ, room);
        if (f) {
          const [dx, dy] = DIRS[front];
          dim(g, [f.x, f.y], [f.x + dx * f.t, f.y + dy * f.t], [0, 0], String(Math.round(f.t)), "dim clear", true);
        }
        for (const sideDir of across ? ["N", "S"] : ["E", "W"]) { // along the wall, from each side to the next thing
          const s = sweep(i, sideDir, occ, room);
          if (s.t < Infinity && s.t > 5) {
            const [dx, dy] = DIRS[sideDir];
            const mid = across ? [(b.x0 + b.x1) / 2, sideDir === "N" ? b.y1 : b.y0] : [sideDir === "E" ? b.x1 : b.x0, (b.y0 + b.y1) / 2];
            dim(g, mid, [mid[0] + dx * s.t, mid[1] + dy * s.t], [0, 0], String(Math.round(s.t)), "dim clear");
          }
        }
      }
    }

    // Clear floor label at the most open spot.
    const [sx, sy] = stats.spot;
    el("text", { x: sx, y: Y(sy) - 20, class: "zone", "text-anchor": "middle" }, g, "CLEAR FLOOR");
    el("text", { x: sx, y: Y(sy) + 75, class: "zonesub", "text-anchor": "middle" }, g, `${stats.free.toFixed(2)} m²`);

    // North arrow and scale bar, bottom left outside the room.
    const nx = -M + 260, ny = room.d + M - 360;
    el("path", { d: `M${nx},${Y(ny + 170)} L${nx + 70},${Y(ny - 60)} L${nx},${Y(ny)} L${nx - 70},${Y(ny - 60)} Z`, class: "north" }, g);
    el("text", { x: nx, y: Y(ny + 200), "text-anchor": "middle", class: "label" }, g, "N");
    const sbx = -M + 140, sby = -M + 140;
    for (let k = 0; k < 4; k++) el("rect", { x: sbx + k * 250, y: Y(sby), width: 250, height: 40, class: k % 2 ? "sbw" : "sbb" }, g);
    el("text", { x: sbx, y: Y(sby) - 30, class: "label" }, g, "0");
    el("text", { x: sbx + 1000, y: Y(sby) - 30, class: "label", "text-anchor": "end" }, g, "1 m");

    // Side panel: what's on the plan, measured.
    const pct = (v) => Math.round((v / stats.total) * 100);
    const rows = schedule.map((s) => `<tr><td class="n">${s.n}</td><td>${s.label}${s.model ? `<small>${s.model}</small>` : ""}</td><td>${s.size}</td><td>${s.z[0]}–${s.z[1]}</td></tr>`).join("");
    side.innerHTML = `
      <h1>Floor plan</h1>
      <p class="sub">Measured from the 3D room · updates with every change</p>
      <dl>
        <dt>Room (inside)</dt><dd>${room.w} × ${room.d} mm<small>${ftin(room.w)} × ${ftin(room.d)} · ceiling ${room.ceiling}</small></dd>
        <dt>Floor area</dt><dd>${stats.total.toFixed(2)} m²</dd>
        <dt>Floor</dt><dd>Honed stone<small>600 × 600 tiles</small></dd>
        <dt><i class="sw" style="background-image:url(${assets}tile-${tile}.jpg)"></i>Wall tile</dt><dd>${(name("walltile", tile).name || tile)}</dd>
        <dt><i class="sw floor"></i>Clear walking floor</dt><dd>${stats.free.toFixed(2)} m² <small>${pct(stats.free)}% · widest open spot ${Math.round(stats.width / 10) * 10} mm</small></dd>
        <dt><i class="sw occ"></i>Fixtures &amp; built-ins</dt><dd>${stats.taken.toFixed(2)} m² <small>${pct(stats.taken)}%</small></dd>
        <dt><i class="sw shower"></i>Shower</dt><dd>${stats.shower.toFixed(2)} m² <small>${pct(stats.shower)}%</small></dd>
      </dl>
      <table><thead><tr><th></th><th>Item</th><th>W × D</th><th>Height</th></tr></thead><tbody>${rows}</tbody></table>
      <ul class="legend">
        <li><i class="sw occ"></i>Occupied floor (shaded)</li>
        <li><i class="sw floor"></i>Clear walking space (white)</li>
        <li><i class="sw dash"></i>Overhead or drain (dashed)</li>
        <li><i class="sw clear"></i>Clearance, mm (dashed)</li>
        <li><i class="sw arc"></i>Door swing</li>
      </ul>
      <p class="foot">All dimensions in mm. Heights from the floor. Source: ${plan.source}, ${plan.generated.replace("T", " ")}.</p>`;
    if (svg._afterRender) svg._afterRender();
    return stats;
  }

  window.InhabitPlan = { render, interact, moves3d, _test: { raster, cast, box, inside, prepare, frontClear, place, withOff, doorAt, moves3d } };
})();
