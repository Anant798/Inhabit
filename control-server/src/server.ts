// Control Server: the hub voice, the tablet page and Unreal (via Pixel Streaming) all talk to.
// Protocol: docs/command-protocol.md. A client sends {"type":"set","category":"tap","value":"B"}
// and every client receives it; {"type":"undo"} reverts the last change for everyone.
// POST /voice takes audio (or {"text":...}) and answers with a spoken reply.
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import { WebSocketServer, WebSocket } from "ws";
import { handle, addressed, describe, optionName, NAMES, OPTIONS, Pending, Action } from "./intent";
import { transcribe, speak, sttAvailable, ttsAvailable } from "./voice";

export const CATEGORIES = [
  "tap", "commode", "washbasin", "showerhead", "walltile", "lighting",
  "tapfinish", "showerheadfinish", "commodefinish", "washbasinfinish", "screenfinish",
] as const;
export type Category = (typeof CATEGORIES)[number];

interface SetCommand {
  type: "set";
  category: Category;
  value: string;
}

const CATALOGUE: Record<string, unknown> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "src", "catalogue.json"), "utf8"),
);
const TABLET_PAGE = path.join(__dirname, "..", "..", "tablet", "index.html");
const TV_PAGE = path.join(__dirname, "..", "..", "tablet", "tv.html"); // the showroom screen: intro, then the room
const ASSETS = path.join(__dirname, "..", "..", "tablet", "assets");
const ASSET_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".png": "image/png", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", // plan.json: the floor plan geometry (blender/export_room.py)
  ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg",
};

// Flat folder, known extensions only, so "/assets/../src/x" can't escape. Supports Range,
// which iPad Safari needs before it will play an mp4.
function serveAsset(req: http.IncomingMessage, res: http.ServerResponse) {
  let name: string;
  try {
    name = decodeURIComponent((req.url || "").slice("/assets/".length).split("?")[0]);
  } catch {
    return res.writeHead(400).end();
  }
  const type = ASSET_TYPES[path.extname(name).toLowerCase()];
  if (!type || /[\\/]/.test(name) || name.startsWith(".")) return res.writeHead(404).end();
  const file = path.join(ASSETS, name);
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return res.writeHead(404).end();
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])); // "bytes=-500" = last 500
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
    }
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  fs.createReadStream(file).pipe(res);
}
const MAX_BODY = 10 * 1024 * 1024; // 10 MB: a minute of compressed audio is far less
const PENDING_TTL_MS = 60_000; // an unanswered "which one?" is forgotten after a minute

// A 2D plan layout from a client: at most 40 short keys, each a finite offset within ±10 m and an optional
// r of 0..3 quarter turns. Else null.
export function parseLayout(v: unknown): Record<string, { dx: number; dy: number; r?: number }> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const out: Record<string, { dx: number; dy: number; r?: number }> = {};
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > 40) return null;
  for (const [k, o] of entries) {
    if (!/^[a-z0-9_-]{1,32}$/i.test(k) || typeof o !== "object" || o === null) return null;
    const { dx, dy, r } = o as { dx?: unknown; dy?: unknown; r?: unknown };
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    if (Math.abs(dx) > 10000 || Math.abs(dy) > 10000) return null;
    if (r !== undefined && !(r === 0 || r === 1 || r === 2 || r === 3)) return null; // quarter turns (doors: swing)
    out[k] = r ? { dx: Math.round(dx), dy: Math.round(dy), r } : { dx: Math.round(dx), dy: Math.round(dy) };
  }
  return out;
}

// Moves on the 2D plan, for the 3D room: the plan's own code (tablet/assets/plan.js) works out where every
// object goes, from plan.json (the room as exported), the chosen models and the layout, so the plan and the
// room can't disagree. Each move becomes an Unreal placement: cm, Y flipped (as build_level.py's ue()), a
// turn about the vertical (yaw) and a stretch (the shower glass and tray). Every mesh actor is built at the
// origin with its shape in place, so this placement is its whole transform.
type PlanMove = { objects: string[]; a: number; b: number; c: number; d: number; tx: number; ty: number };
export type UnrealMove = { objects: string[]; x: number; y: number; yaw: number; sx: number; sy: number };
let planCode: { moves3d(plan: unknown, config: object, layout: object): PlanMove[] } | null = null;
export function movesFor(config: Partial<Record<Category, string>>, layout: object): UnrealMove[] {
  try {
    if (!planCode) {
      const sandbox: { window: { InhabitPlan?: typeof planCode } } = { window: {} };
      vm.runInNewContext(fs.readFileSync(path.join(ASSETS, "plan.js"), "utf8"), sandbox);
      planCode = sandbox.window.InhabitPlan ?? null;
    }
    const plan = JSON.parse(fs.readFileSync(path.join(ASSETS, "plan.json"), "utf8")); // re-read: a new export shows at once
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return (planCode?.moves3d(plan, config, layout) ?? []).map((m) => ({
      objects: m.objects.map((n) => n.split(".").join("_")), // Unreal names assets with _ for . (SM_TowelBar_Post_0.18)
      x: r2(m.tx / 10), y: r2(-m.ty / 10), // plan mm (y north) -> Unreal cm (y flipped)
      yaw: r2((Math.atan2(-m.c, m.a) * 180) / Math.PI), // a quarter turn clockwise on the plan = yaw +90
      sx: Math.round(Math.hypot(m.a, m.c) * 1000) / 1000, sy: Math.round(Math.hypot(m.b, m.d) * 1000) / 1000,
    }));
  } catch (e) {
    console.warn("[moves] can't work out the 3D moves:", (e as Error).message); // the plan still works
    return [];
  }
}

function isSetCommand(msg: unknown): msg is SetCommand {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === "set" &&
    typeof m.category === "string" &&
    (CATEGORIES as readonly string[]).includes(m.category) &&
    typeof m.value === "string" &&
    OPTIONS[m.category as Category].includes(m.value)
  );
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too_large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createServer() {
  const state: Partial<Record<Category, string>> = {};
  const MAX_HISTORY = 100; // a long demo can't grow this forever
  // One entry per user action; an action can change two items (the tap/basin pairing below).
  const history: Array<Array<{ category: Category; previous: string | undefined }>> = [];
  // shortcut: dialogue state keyed by a client-sent session id; fine for one showroom, add auth for multi-tenant.
  const dialogues = new Map<string, { pending: Pending; at: number }>();
  let wss: WebSocketServer;
  // Look-around: the camera stays put and turns (yaw -180 left .. 180 right) and tilts
  // (pitch -30 down .. 30 up), in degrees from its placed view. Not a choice, so not undone.
  const camera = { yaw: 0, pitch: 0 };
  // What the PC display shows: the live 3D room or the 2D floor plan. Not a design choice, so not undone.
  let view: "3d" | "plan" = "3d";
  // Positions moved on the 2D floor plan: { key: { dx, dy } } in mm. 2D only (Unreal ignores it), not a
  // design choice, so not undone here (the plan screens keep their own undo); cleared by end-session.
  let layout: Record<string, { dx: number; dy: number; r?: number }> = {};

  function broadcast(payload: unknown) {
    const out = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(out);
    }
  }

  // Kohler pairing: the Vox rectangle basin (C) covers the counter where a deck tap (A Purist, C Vive)
  // stands, so it needs a wall tap (B Purist, D Vive). Picking one brings the other to a model that fits,
  // in the same series. Every other basin fits every tap (deck spouts clear the oval and round rims).
  const WALL_OF: Record<string, string> = { A: "B", C: "D" };
  function pairing(cmd: { category: Category; value: string }): { change: SetCommand; note: string } | null {
    const tap = state.tap ?? OPTIONS.tap[0];
    const basin = state.washbasin ?? OPTIONS.washbasin[0];
    if (cmd.category === "washbasin" && cmd.value === "C" && WALL_OF[tap]) {
      const wall = WALL_OF[tap];
      return {
        change: { type: "set", category: "tap", value: wall },
        note: `The Vox basin needs a wall-mounted tap, so the tap is now the ${optionName("tap", wall)} too.`,
      };
    }
    if (cmd.category === "tap" && WALL_OF[cmd.value] && basin === "C")
      return {
        change: { type: "set", category: "washbasin", value: "A" },
        note: "The deck tap doesn't fit the Vox basin, so the washbasin is now the Veil Oval Vessel too.",
      };
    return null;
  }

  // Where every moved object now stands in the 3D room (Unreal applies it; the pages ignore it).
  const MOVING: Category[] = ["tap", "commode", "washbasin", "showerhead"];
  const sendMoves = () => broadcast({ type: "moves", moves: movesFor(state, layout) });

  // Returns a note to add to the reply when the pairing rule changed a second item.
  function applySet(cmd: { category: Category; value: string }): string | null {
    const pair = pairing(cmd);
    const changes = pair ? [cmd, pair.change] : [cmd];
    history.push(changes.map((c) => ({ category: c.category, previous: state[c.category] })));
    if (history.length > MAX_HISTORY) history.shift();
    for (const c of changes) {
      state[c.category] = c.value;
      broadcast({ type: "set", category: c.category, value: c.value });
    }
    if (Object.keys(layout).length && changes.some((c) => MOVING.includes(c.category))) sendMoves(); // a new model, same spot
    return pair?.note ?? null;
  }

  // End of a visitor's session (from the PC display): back to the default room and view, nothing
  // remembered, and every screen told, so phones can switch their microphones off.
  function endSession() {
    for (const c of CATEGORIES) delete state[c];
    history.length = 0;
    dialogues.clear();
    Object.assign(camera, { yaw: 0, pitch: 0 });
    view = "3d";
    layout = {};
    for (const c of CATEGORIES) broadcast({ type: "set", category: c, value: OPTIONS[c][0] });
    broadcast({ type: "camera", ...camera });
    broadcast({ type: "view", mode: view });
    broadcast({ type: "layout", layout });
    sendMoves();
    broadcast({ type: "session-ended" });
  }

  // Returns the reply to speak, or null when there was nothing to undo.
  function applyUndo(): string | null {
    const changes = history.pop();
    if (!changes) return null;
    for (const c of changes) {
      if (c.previous === undefined) delete state[c.category];
      else state[c.category] = c.previous;
      // Back to "nothing chosen" = the scene's default, which is the first option.
      broadcast({ type: "set", category: c.category, value: c.previous ?? OPTIONS[c.category][0] });
    }
    if (Object.keys(layout).length && changes.some((c) => MOVING.includes(c.category))) sendMoves();
    const entry = changes[0];
    const verb = entry.category === "walltile" ? "are" : "is";
    return entry.previous === undefined
      ? `Undone. The ${NAMES[entry.category]} ${verb} back to the default.`
      : `Undone. ${describe(entry.category, entry.previous)}`;
  }

  async function onVoice(req: http.IncomingMessage, res: http.ServerResponse) {
    let body: Buffer;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 413, { error: "too_large" });
    }

    let text: string;
    let session = String(req.headers["x-session"] || "showroom");
    // Always-on mic: every stretch of speech arrives here; only requests to the system act.
    const ambient = req.headers["x-listen"] === "ambient";
    if ((req.headers["content-type"] || "").includes("application/json")) {
      let parsed: { text?: unknown; session?: unknown };
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "bad_json" });
      }
      if (typeof parsed.text !== "string") return sendJson(res, 400, { error: "text_required" });
      text = parsed.text.slice(0, 500);
      if (typeof parsed.session === "string") session = parsed.session;
    } else {
      if (!body.length) return sendJson(res, 400, { error: "empty_audio" });
      if (!sttAvailable()) return sendJson(res, 503, { error: "whisper_not_installed", fix: "run tools/setup.ps1" });
      try {
        text = await transcribe(body);
      } catch (e) {
        return sendJson(res, 422, { error: "transcription_failed", detail: (e as Error).message });
      }
    }

    const d = dialogues.get(session);
    const pending = d && Date.now() - d.at < PENDING_TTL_MS ? d.pending : null;
    // People talking to each other: say nothing, change nothing, show nothing.
    if (ambient && !addressed(text, pending)) return sendJson(res, 200, { transcript: text, ignored: true });
    const turn = handle(text, pending, state);
    dialogues.set(session, { pending: turn.pending, at: Date.now() });

    let reply = turn.reply;
    let command: Action | undefined = turn.action;
    if (turn.action?.type === "set") {
      const note = applySet(turn.action);
      if (note) reply = `${reply} ${note}`;
    }
    if (turn.action?.type === "undo") {
      reply = applyUndo() ?? "There's nothing to undo.";
    }
    broadcast({ type: "voice", transcript: text, reply });

    let audio: string | undefined;
    if (ttsAvailable()) {
      try {
        audio = (await speak(reply)).toString("base64");
      } catch (e) {
        console.warn("[voice] piper failed:", (e as Error).message); // the text reply still goes out
      }
    }
    sendJson(res, 200, { transcript: text, reply, command, audio });
  }

  const httpServer = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/state") return sendJson(res, 200, state);
    if (req.method === "GET" && req.url === "/catalogue") return sendJson(res, 200, CATALOGUE);
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(TABLET_PAGE).pipe(res);
    }
    if (req.method === "GET" && (req.url === "/tv" || req.url === "/tv.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(TV_PAGE).pipe(res);
    }
    if (req.method === "GET" && req.url?.startsWith("/assets/")) return serveAsset(req, res);
    if (req.method === "POST" && req.url === "/voice") {
      onVoice(req, res).catch((e) => {
        console.error("[voice]", e);
        if (!res.headersSent) sendJson(res, 500, { error: "internal" });
      });
      return;
    }
    res.writeHead(404).end();
  });

  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "state", state, camera, view, layout, ...(Object.keys(layout).length ? { moves: movesFor(state, layout) } : {}) }));

    ws.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", reason: "bad_json" }));
        return;
      }
      const m = msg as { type?: unknown; yaw?: unknown; pitch?: unknown; mode?: unknown };
      if (m && m.type === "end-session") return endSession();
      if (m && (m as { type?: unknown }).type === "layout") {
        const next = parseLayout((m as { layout?: unknown }).layout);
        if (!next) return ws.send(JSON.stringify({ type: "error", reason: "bad_command", received: msg }));
        layout = next;
        broadcast({ type: "layout", layout });
        sendMoves();
        return;
      }
      if (m && m.type === "view" && (m.mode === "3d" || m.mode === "plan")) {
        view = m.mode;
        broadcast({ type: "view", mode: view });
        return;
      }
      const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
      // Either axis may come alone (one slider moved); anything else is a bad command.
      if (m && m.type === "camera" && (num(m.yaw) || num(m.pitch)) && [m.yaw, m.pitch].every((v) => v === undefined || num(v))) {
        const clamp = (v: number, lim: number) => Math.round(Math.max(-lim, Math.min(lim, v)) * 10) / 10;
        if (num(m.yaw)) camera.yaw = clamp(m.yaw as number, 180);
        if (num(m.pitch)) camera.pitch = clamp(m.pitch as number, 30);
        broadcast({ type: "camera", ...camera });
        return;
      }
      if (isSetCommand(msg)) {
        const note = applySet(msg);
        if (note) broadcast({ type: "voice", transcript: "", reply: note }); // tablet taps see why
        return;
      }
      if (typeof msg === "object" && msg !== null && (msg as { type?: string }).type === "undo") {
        if (applyUndo() === null) ws.send(JSON.stringify({ type: "error", reason: "nothing_to_undo" }));
        return;
      }
      ws.send(JSON.stringify({ type: "error", reason: "bad_command", received: msg }));
    });
  });

  return httpServer;
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 8787;
  createServer().listen(PORT, () => {
    console.log(`Control server on http://localhost:${PORT} (ws + /voice)`);
    console.log(`  speech-to-text: ${sttAvailable() ? "ready" : "missing, run tools/setup.ps1"}`);
    console.log(`  text-to-speech: ${ttsAvailable() ? "ready" : "missing, run tools/setup.ps1"}`);
  });
}
