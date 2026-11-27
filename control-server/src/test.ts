// shortcut: no auth/reconnect tests yet; add before the showroom demo, not before this.
import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createServer } from "./server";

// Queue messages from the moment the socket is created, not from when "open" resolves --
// the server sends its initial state message immediately on connect, and a listener
// attached after awaiting "open" can miss it (this bit command-bus/test.js before).
function openClient(port: number) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (waiters.length) waiters.shift()!(msg);
    else queue.push(msg);
  });
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r)));
  return new Promise<{ ws: WebSocket; next: () => Promise<unknown> }>((resolve) =>
    ws.once("open", () => resolve({ ws, next })),
  );
}

test("a command from one client reaches another, and GET /state reflects it", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;

  const tablet = await openClient(port);
  await tablet.next();
  const unreal = await openClient(port);
  await unreal.next();

  tablet.ws.send(JSON.stringify({ type: "set", category: "tap", value: "B" }));
  assert.deepEqual(await unreal.next(), { type: "set", category: "tap", value: "B" });

  const state = (await (await fetch(`http://localhost:${port}/state`)).json()) as Record<string, string>;
  assert.equal(state.tap, "B");

  tablet.ws.close();
  unreal.ws.close();
  server.close();
});

test("undo reverts the last change and tells every client", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;

  const a = await openClient(port);
  await a.next();
  const b = await openClient(port);
  await b.next();

  a.ws.send(JSON.stringify({ type: "set", category: "lighting", value: "Warm" }));
  await b.next();
  a.ws.send(JSON.stringify({ type: "set", category: "lighting", value: "Daylight" }));
  await b.next();

  a.ws.send(JSON.stringify({ type: "undo" }));
  assert.deepEqual(await b.next(), { type: "set", category: "lighting", value: "Warm" });

  const state = (await (await fetch(`http://localhost:${port}/state`)).json()) as Record<string, string>;
  assert.equal(state.lighting, "Warm");

  a.ws.close();
  b.ws.close();
  server.close();
});

test("undo with nothing to undo replies with an error, not a crash", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;

  const a = await openClient(port);
  await a.next();

  a.ws.send(JSON.stringify({ type: "undo" }));
  const reply = await a.next();
  assert.equal((reply as { type: string }).type, "error");

  a.ws.close();
  server.close();
});

test("GET /catalogue returns product info per category", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;

  const catalogue = (await (await fetch(`http://localhost:${port}/catalogue`)).json()) as Record<string, unknown[]>;
  assert.ok(Array.isArray(catalogue.tap) && catalogue.tap.length === 4);

  server.close();
});

async function say(port: number, text: string, session = "t") {
  const res = await fetch(`http://localhost:${port}/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, session }),
  });
  assert.equal(res.status, 200);
  return (await res.json()) as { transcript: string; reply: string; command?: unknown };
}

test("POST /voice: a clarifying question, then the answer changes the room for every client", async (t) => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const unreal = await openClient(port);
  t.after(() => {
    unreal.ws.close();
    server.close();
  });
  await unreal.next();

  const q = await say(port, "show me option b");
  assert.match(q.reply, /^Which one should I change/);
  assert.equal(q.command, undefined);
  assert.deepEqual(await unreal.next(), { type: "voice", transcript: "show me option b", reply: q.reply });

  // A spoken command sends two messages: the change, then the caption.
  const a = await say(port, "the tap");
  assert.equal(a.reply, "Done. The tap is now the Purist Wall-Mount Tap.");
  assert.deepEqual(await unreal.next(), { type: "set", category: "tap", value: "B" });
  assert.equal(((await unreal.next()) as { type: string }).type, "voice");

  const u = await say(port, "undo");
  assert.equal(u.reply, "Undone. The tap is back to the default.");
  assert.deepEqual(await unreal.next(), { type: "set", category: "tap", value: "A" }); // default, never ""
});

test("POST /voice: sessions don't answer each other's questions", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  await say(port, "show me option b", "tablet-1");
  const other = await say(port, "the tap", "tablet-2");
  assert.equal(other.reply, "Done. The tap is now the Purist Wall-Mount Tap."); // plain toggle, not tablet-1's pending "B"
  server.close();
});

test("POST /voice rejects bad input", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const post = (body: string, type: string) =>
    fetch(`http://localhost:${port}/voice`, { method: "POST", headers: { "Content-Type": type }, body });
  assert.equal((await post("{not json", "application/json")).status, 400);
  assert.equal((await post(JSON.stringify({ text: 5 }), "application/json")).status, 400);
  assert.equal((await post("", "audio/webm")).status, 400);
  server.close();
});

test("assets: served with ranges, nothing outside the folder", async (t) => {
  const server = createServer().listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${(server.address() as { port: number }).port}`;

  for (const [url, type] of [["/tv", "text/html"], ["/assets/intro.js", "text/javascript"], ["/assets/intro-vertical.mp4", "video/mp4"]]) {
    const r = await fetch(base + url);
    assert.equal(r.status, 200, url);
    assert.match(r.headers.get("content-type") || "", new RegExp(type), url);
    await r.arrayBuffer();
  }
  const logo = await fetch(`${base}/assets/logo.svg`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("content-type"), "image/svg+xml");

  const part = await fetch(`${base}/assets/intro-landscape.mp4`, { headers: { Range: "bytes=0-99" } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  assert.match(part.headers.get("content-range") || "", /^bytes 0-99\/\d+$/);

  for (const bad of ["/assets/..%2Fsrc%2Fserver.ts", "/assets/..%5Cindex.html", "/assets/missing.svg", "/assets/%E0%A4%A"]) {
    assert.ok([400, 404].includes((await fetch(base + bad)).status), bad);
  }
  assert.equal((await fetch(`${base}/assets/intro-landscape.mp4`, { headers: { Range: "bytes=999999999-" } })).status, 416);
});

test("an unknown category is rejected, not broadcast", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;

  const a = await openClient(port);
  await a.next();
  const b = await openClient(port);
  await b.next();

  a.ws.send(JSON.stringify({ type: "set", category: "bathtub", value: "X" }));
  const reply = await a.next();
  assert.equal((reply as { type: string }).type, "error");

  a.ws.close();
  b.ws.close();
  server.close();
});

test("Vox basin with the Vive deck tap: the Vive wall tap follows, says why, and one undo reverts both", async (t) => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const unreal = await openClient(port);
  t.after(() => {
    unreal.ws.close();
    server.close();
  });
  await unreal.next();

  await say(port, "the vive tap");
  assert.deepEqual(await unreal.next(), { type: "set", category: "tap", value: "C" });
  await unreal.next(); // caption

  const r = await say(port, "show washbasin c");
  assert.equal(r.reply, "Done. The washbasin is now the Vox Rectangle Vessel. The Vox basin needs a wall-mounted tap, so the tap is now the Vive Wall-Mount Tap too.");
  assert.deepEqual(await unreal.next(), { type: "set", category: "washbasin", value: "C" });
  assert.deepEqual(await unreal.next(), { type: "set", category: "tap", value: "D" });
  await unreal.next(); // caption

  const back = await say(port, "tap a");
  assert.match(back.reply, /washbasin is now the Veil Oval Vessel too/);
  let state = (await (await fetch(`http://localhost:${port}/state`)).json()) as Record<string, string>;
  assert.deepEqual([state.tap, state.washbasin], ["A", "A"]);

  await say(port, "undo");
  state = (await (await fetch(`http://localhost:${port}/state`)).json()) as Record<string, string>;
  assert.deepEqual([state.tap, state.washbasin], ["D", "C"]); // both back in one step
});

test("the round basin fits the deck taps: no pairing", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  assert.equal((await say(port, "the round basin")).reply, "Done. The washbasin is now the Vox Round Vessel.");
  assert.equal((await say(port, "vive deck tap")).reply, "Done. The tap is now the Vive Tall Deck Tap.");
  server.close();
});

test("a value an item doesn't have is rejected, not broadcast", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const a = await openClient(port);
  await a.next();
  a.ws.send(JSON.stringify({ type: "set", category: "tap", value: "Z" }));
  assert.equal(((await a.next()) as { type: string }).type, "error");
  a.ws.send(JSON.stringify({ type: "set", category: "tapfinish", value: "Brass" }));
  assert.deepEqual(await a.next(), { type: "set", category: "tapfinish", value: "Brass" });
  a.ws.close();
  server.close();
});

async function hear(port: number, text: string, session = "room") {
  const res = await fetch(`http://localhost:${port}/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Listen": "ambient" },
    body: JSON.stringify({ text, session }),
  });
  return (await res.json()) as { reply?: string; ignored?: boolean; command?: unknown };
}

test("always-on mic: conversation is ignored silently, requests act", async (t) => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const unreal = await openClient(port);
  t.after(() => {
    unreal.ws.close();
    server.close();
  });
  await unreal.next();

  const chat = await hear(port, "honestly I think the black tap looks better than the chrome one");
  assert.equal(chat.ignored, true);
  assert.equal(chat.reply, undefined);
  let state = (await (await fetch(`http://localhost:${port}/state`)).json()) as Record<string, string>;
  assert.deepEqual(state, {});

  const req = await hear(port, "can you show me the brass tap");
  assert.equal(req.reply, "Done. The tap finish is now brushed brass.");
  assert.deepEqual(await unreal.next(), { type: "set", category: "tapfinish", value: "Brass" });
});

test("camera look-around: clamped, either axis alone, sent to everyone, in a new client's state", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const a = await openClient(port);
  await a.next();
  a.ws.send(JSON.stringify({ type: "camera", yaw: -400 }));
  assert.deepEqual(await a.next(), { type: "camera", yaw: -180, pitch: 0 });
  a.ws.send(JSON.stringify({ type: "camera", pitch: 75 }));
  assert.deepEqual(await a.next(), { type: "camera", yaw: -180, pitch: 30 });
  a.ws.send(JSON.stringify({ type: "camera", yaw: 45.25, pitch: -12 }));
  assert.deepEqual(await a.next(), { type: "camera", yaw: 45.3, pitch: -12 });
  a.ws.send(JSON.stringify({ type: "camera", yaw: "left" }));
  assert.equal(((await a.next()) as { type: string }).type, "error");
  a.ws.send(JSON.stringify({ type: "camera", yaw: 10, pitch: "up" }));
  assert.equal(((await a.next()) as { type: string }).type, "error");
  const b = await openClient(port);
  assert.deepEqual(await b.next(), { type: "state", state: {}, camera: { yaw: 45.3, pitch: -12 }, view: "3d", layout: {} });
  a.ws.close();
  b.ws.close();
  server.close();
});

test("end session: room and view back to default, history and questions forgotten, everyone told", async (t) => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const tv = await openClient(port);
  t.after(() => {
    tv.ws.close();
    server.close();
  });
  await tv.next();
  await say(port, "brass tap", "phone");
  await say(port, "show me option b", "phone"); // leaves a question open
  tv.ws.send(JSON.stringify({ type: "camera", yaw: 40, pitch: 10 }));
  const drain: unknown[] = [];
  for (let i = 0; i < 4; i++) drain.push(await tv.next());
  tv.ws.send(JSON.stringify({ type: "end-session" }));
  const msgs: Array<{ type: string; category?: string; value?: string }> = [];
  for (;;) {
    const m = (await tv.next()) as { type: string };
    msgs.push(m);
    if (m.type === "session-ended") break;
  }
  assert.ok(msgs.some((m) => m.type === "set" && m.category === "tapfinish" && m.value === "Black"));
  assert.ok(msgs.some((m) => m.type === "camera"));
  assert.ok(msgs.some((m) => m.type === "view" && (m as { mode?: string }).mode === "3d")); // back to the 3D room
  assert.ok(msgs.some((m) => m.type === "layout" && Object.keys((m as { layout?: object }).layout || { x: 1 }).length === 0)); // 2D moves cleared
  const state = (await (await fetch(`http://localhost:${port}/state`)).json()) as Record<string, string>;
  assert.deepEqual(state, {});
  assert.equal((await say(port, "undo", "phone")).reply, "There's nothing to undo.");
  assert.match((await say(port, "the tap", "phone")).reply, /Purist Wall-Mount Tap/); // the old question is gone: a plain toggle
});

test("the Vox basin also needs the wall tap", async () => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const r = await say(port, "basin c");
  assert.match(r.reply, /Vox basin needs a wall-mounted tap/);
  const back = await say(port, "deck tap");
  assert.match(back.reply, /doesn't fit the Vox basin, so the washbasin is now the Veil Oval Vessel too/);
  server.close();
});

test("2D floor plan / 3D view: sent to every screen, kept for new ones, bad modes rejected", async (t) => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const phone = await openClient(port);
  const tv = await openClient(port);
  t.after(() => {
    phone.ws.close();
    tv.ws.close();
    server.close();
  });
  assert.equal(((await tv.next()) as { view: string }).view, "3d");
  await phone.next();
  phone.ws.send(JSON.stringify({ type: "view", mode: "plan" }));
  assert.deepEqual(await tv.next(), { type: "view", mode: "plan" });
  assert.deepEqual(await phone.next(), { type: "view", mode: "plan" });
  phone.ws.send(JSON.stringify({ type: "view", mode: "sideways" }));
  assert.equal(((await phone.next()) as { reason: string }).reason, "bad_command");
  const late = await openClient(port);
  assert.equal(((await late.next()) as { view: string }).view, "plan");
  late.ws.close();
  // Switching views changes nothing in the design.
  assert.deepEqual(await (await fetch(`http://localhost:${port}/state`)).json(), {});
});

test("2D floor plan moves: kept, sent to every screen, given to new ones, bad layouts rejected, the 3D room told", async (t) => {
  const server = createServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const phone = await openClient(port);
  const tv = await openClient(port);
  t.after(() => {
    phone.ws.close();
    tv.ws.close();
    server.close();
  });
  await phone.next();
  await tv.next();
  phone.ws.send(JSON.stringify({ type: "layout", layout: { commode: { dx: 300.4, dy: -50 }, "door-0": { dx: 100, dy: 0, r: 3 } } }));
  assert.deepEqual(await tv.next(), { type: "layout", layout: { commode: { dx: 300, dy: -50 }, "door-0": { dx: 100, dy: 0, r: 3 } } });
  // Then where every object goes in the 3D room: the commode 300 mm east = 30 cm in Unreal, 50 mm south = +5 cm.
  const moves = (await tv.next()) as { type: string; moves: Array<{ objects: string[]; x: number; y: number; yaw: number }> };
  assert.equal(moves.type, "moves");
  const commode = moves.moves.find((m) => m.objects.includes("SM_Commode_A"))!;
  assert.deepEqual([commode.x, commode.y, commode.yaw], [30, 5, 0]);
  assert.ok(moves.moves.find((m) => m.objects.includes("SM_Commode_B"))); // the other models too, for an instant swap
  await phone.next();
  await phone.next();
  for (const bad of [[1], { "../x": { dx: 1, dy: 1 } }, { commode: { dx: "1", dy: 0 } }, { commode: { dx: 1e9, dy: 0 } }, { commode: { dx: 0, dy: 0, r: 5 } }]) {
    phone.ws.send(JSON.stringify({ type: "layout", layout: bad }));
    assert.equal(((await phone.next()) as { reason: string }).reason, "bad_command");
  }
  const late = await openClient(port);
  const st = (await late.next()) as { layout: object; moves: unknown[] };
  assert.deepEqual(st.layout, { commode: { dx: 300, dy: -50 }, "door-0": { dx: 100, dy: 0, r: 3 } });
  assert.ok(st.moves.length > 10); // Unreal starting late gets the moves too
  late.ws.close();
  assert.deepEqual(await (await fetch(`http://localhost:${port}/state`)).json(), {}); // the design choices unchanged
});
