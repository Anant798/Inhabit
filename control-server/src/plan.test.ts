// The 2D floor plan (tablet/assets/plan.js + plan.json): its geometry maths, and that the exported
// plan covers every model the voice and phone can choose (else that choice would vanish from the plan).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import { OPTIONS } from "./intent";

const ASSETS = path.join(__dirname, "..", "..", "tablet", "assets");
type Poly = number[][];
interface Prepared { room: { w: number; d: number }; occ: unknown[]; openings: Array<{ wall: string; from: number; to: number }>;
  doors: Array<{ wall: string; hinge: number[]; open: number[] }>;
  items: Array<{ id?: string; kind: string; category?: string; key: string; back: string | null; box: { x0: number; x1: number; y0: number; y1: number }; moved: boolean; clash?: boolean; off: { dx: number; dy: number } }> }
interface PlanMaths {
  moves3d(plan: unknown, config: Record<string, string>, layout: object): Array<{ objects: string[]; a: number; b: number; c: number; d: number; tx: number; ty: number }>;
  prepare(plan: unknown, config: Record<string, string>, layout?: Record<string, { dx: number; dy: number; r?: number }>): Prepared;
  frontClear(item: unknown, occ: unknown[], room: unknown): { t: number } | null;
  place(plan: unknown, config: Record<string, string>, layout: Record<string, { dx: number; dy: number; r?: number }>, key: string, o: { dx: number; dy: number; r?: number }): { dx: number; dy: number; r: number } | null;
  raster(room: { w: number; d: number }, occ: Array<{ poly: Poly; kind: string; box: unknown }>): { free: number; taken: number; shower: number; total: number };
  cast(x: number, y: number, dir: string, obstacles: Array<{ poly: Poly }>, room: { w: number; d: number }): { t: number };
  box(poly: Poly): { x0: number; x1: number; y0: number; y1: number };
}
const sandbox: { window: { InhabitPlan?: { _test: PlanMaths } } } = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ASSETS, "plan.js"), "utf8"), sandbox);
const P = sandbox.window.InhabitPlan!._test;

test("plan maths: free floor area and clearances are measured, not guessed", () => {
  const room = { w: 2000, d: 1000 };
  const square = (x: number, y: number, s: number): Poly => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  const fixture = { poly: square(0, 0, 500), kind: "fixture", box: P.box(square(0, 0, 500)) };
  const shower = { poly: square(1500, 500, 500), kind: "shower", box: P.box(square(1500, 500, 500)) };
  const a = P.raster(room, [fixture, shower]);
  assert.equal(a.total, 2);
  assert.ok(Math.abs(a.taken - 0.25) < 0.001 && Math.abs(a.shower - 0.25) < 0.001 && Math.abs(a.free - 1.5) < 0.001);
  assert.equal(P.cast(500, 250, "E", [shower], room).t, 1500); // past the shower's y-range: to the wall
  assert.equal(P.cast(500, 750, "E", [shower], room).t, 1000); // into the shower
  assert.equal(P.cast(500, 250, "W", [fixture], room).t, 0); // touching counts as zero, not skipped
});

test("plan.json: a measured footprint for every model option, inside the room", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(ASSETS, "plan.json"), "utf8"));
  assert.ok(plan.room.w > 0 && plan.room.d > 0);
  for (const cat of ["tap", "commode", "washbasin", "showerhead"] as const)
    for (const v of OPTIONS[cat]) {
      const item = plan.items.find((i: { category?: string; option?: string }) => i.category === cat && i.option === v);
      assert.ok(item && item.poly.length >= 3, `${cat} ${v} missing from plan.json: run blender/export_room.py`);
      const b = P.box(item.poly);
      assert.ok(b.x0 >= -5 && b.y0 >= -5 && b.x1 <= plan.room.w + 5 && b.y1 <= plan.room.d + 5, `${cat} ${v} outside the room`);
    }
  assert.equal(plan.doors.length, 2);
});

test("2D moves: an offset moves the item's box and changes its clear-in-front figure; drops snap and stay in the room", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(ASSETS, "plan.json"), "utf8"));
  const commode = (layout = {}) => {
    const p = P.prepare(plan, {}, layout);
    const c = p.items.find((i) => i.category === "commode")!;
    return { c, clear: Math.round(P.frontClear(c, p.occ, p.room)!.t) };
  };
  const before = commode(), after = commode({ commode: { dx: 300, dy: 0 } });
  assert.equal(after.c.box.x0, before.c.box.x0 + 300);
  assert.equal(after.clear, before.clear - 300); // 865 -> 565: front to the shower glass
  // Keyed by category: a different commode model keeps the move.
  const swapped = P.prepare(plan, { commode: "B" }, { commode: { dx: 300, dy: 0 } }).items.find((i) => i.category === "commode")!;
  assert.equal(swapped.off.dx, 300);
  // Dropped 30 mm off the ledge it backs onto: snaps flush. Dragged past the walls: kept inside.
  assert.equal(JSON.stringify(P.place(plan, {}, {}, "commode", { dx: 30, dy: 0 })), JSON.stringify({ dx: 0, dy: 0, r: 0 })); // objects from the sandbox: compare values
  const far = P.place(plan, {}, {}, "commode", { dx: -900, dy: 9000 })!;
  const b = P.prepare(plan, {}, { commode: far }).items.find((i) => i.category === "commode")!.box;
  assert.ok(b.x0 >= 0 && b.y1 <= plan.room.d);
  // A wall item only slides along its wall; a tap goes with the basin.
  assert.equal(P.place(plan, {}, {}, "warmer", { dx: 100, dy: 400 })!.dy, 0);
  const tap = P.prepare(plan, {}, { washbasin: { dx: -200, dy: 100 } }).items.find((i) => i.category === "tap")!;
  assert.equal(JSON.stringify(tap.off), JSON.stringify({ dx: -200, dy: 100 }));
  // The basin stands on the vanity: moving the vanity takes the basin and the tap with it.
  const withVanity = P.prepare(plan, {}, { vanity: { dx: -300, dy: 0 } }).items;
  for (const c of ["washbasin", "tap"]) assert.equal(withVanity.find((i) => i.category === c)!.off.dx, -300, c);
});

test("2D turns and doors: a quarter turn swaps the footprint and the back; doors slide in their wall and change swing", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(ASSETS, "plan.json"), "utf8"));
  const commode = (layout = {}) => P.prepare(plan, {}, layout).items.find((i) => i.category === "commode")!;
  const before = commode(), turned = commode({ commode: { dx: 0, dy: 0, r: 1 } });
  assert.equal(before.back, "W");
  assert.equal(turned.back, "N"); // clockwise: backing onto the north wall
  assert.equal(Math.round(turned.box.x1 - turned.box.x0), Math.round(before.box.y1 - before.box.y0));
  // Turned and dropped near the north wall: flush against it.
  const at = P.place(plan, {}, {}, "commode", { dx: 300, dy: 600, r: 1 })!;
  assert.equal(Math.round(commode({ commode: at }).box.y1), plan.room.d);
  // The room door slides along its wall (the opening goes with it) and r=1 hinges it on the other jamb.
  const p = P.prepare(plan, {}, { "door-0": { dx: 600, dy: 900, r: 1 } });
  assert.equal(p.openings[0].from, plan.openings[0].from + 600);
  assert.equal(p.doors[0].hinge[0], plan.doors[0].closed[0] + 600);
  assert.equal(p.doors[0].hinge[1], plan.doors[0].hinge[1]); // the across-the-wall part is ignored
  // It can't leave its wall.
  assert.ok(P.prepare(plan, {}, { "door-0": { dx: 9000, dy: 0 } }).openings[0].to <= plan.room.w);
  // Dragged towards another wall, the room door moves into it: opening cut there, swinging into the room.
  const west = P.prepare(plan, {}, { "door-0": { dx: -1500, dy: 900 } });
  assert.equal(west.doors[0].wall, "W");
  assert.equal(west.openings[0].wall, "W");
  assert.ok(west.openings[0].from >= 0 && west.openings[0].to <= plan.room.d);
  assert.ok(west.doors[0].open[0] > west.doors[0].hinge[0]); // opens east, into the room
  // The shower door slides along the shower front; the glass is rebuilt around it.
  const q = P.prepare(plan, {}, { "door-1": { dx: 600, dy: 0 } });
  assert.ok(q.items.some((i) => i.id === "glass_front_a"));
});

test("shower walls: the side and front glass resize the shower, the door goes along; every moved object reaches the 3D room", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(ASSETS, "plan.json"), "utf8"));
  const L = { "shower-side": { dx: -300, dy: 0 }, "shower-front": { dx: 0, dy: 100 } };
  const p = P.prepare(plan, {}, L);
  const shower = p.items.find((i) => i.kind === "shower")!, base = P.box(plan.items.find((i: { id: string }) => i.id === "shower").poly);
  assert.equal(Math.round(shower.box.x0), base.x0 - 300);
  assert.equal(Math.round(shower.box.y0), base.y0 + 100);
  assert.equal(Math.round(shower.box.x1), base.x1); // the corner stays put
  assert.equal(Math.round(p.doors[1].hinge[0]), plan.doors[1].hinge[0] - 300); // the shower door goes with the glass
  // Too small a shower is refused: at least 1000 x 700.
  const tight = P.place(plan, {}, {}, "shower-side", { dx: 5000, dy: 0 })!;
  assert.equal(base.x1 - (base.x0 + tight.dx), 1000);
  // 3D: every object of every item and model has a placement; a turned commode turns, the room door stays.
  const m = P.moves3d(plan, {}, { ...L, commode: { dx: 0, dy: 0, r: 1 }, "door-0": { dx: 300, dy: 0 } });
  const all = new Set(m.flatMap((x) => x.objects));
  for (const i of plan.items) for (const o of i.objects) assert.ok(all.has(o), o);
  const c = m.find((x) => x.objects.includes("SM_Commode_A"))!;
  assert.equal(JSON.stringify([c.a, c.b, c.c, c.d]), JSON.stringify([0, 1, -1, 0])); // a quarter turn clockwise
  const tray = m.find((x) => x.objects.includes("SM_Shower_Tray"))!;
  assert.ok(tray.a > 1 && tray.d < 1); // wider, shallower
  assert.ok(!m.some((x) => x.objects.includes("SM_Door_Leaf"))); // the room door: plan only
});
