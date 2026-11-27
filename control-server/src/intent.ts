// Turns one transcribed sentence into a command, a clarifying question, or a confirmation
// question. Deterministic phrase rules (no LLM), as agreed in the team's decision doc.
// Pure function: the caller keeps `pending` between turns and applies the returned action.
import * as fs from "fs";
import * as path from "path";
import type { Category } from "./server";

// Display/spoken names live in catalogue.json, shared with the tablet page.
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "catalogue.json"), "utf8")) as Record<
  string,
  Array<{ value: string; name: string }>
>;
export function optionName(category: Category, value: string): string {
  return CATALOGUE[category]?.find((o) => o.value === value)?.name ?? value;
}

// Kohler finishes (codes in catalogue.json). The first option is what the scene starts with.
const METAL = ["Black", "Chrome", "Brass", "Bronze"];
const CERAMIC = ["White", "Biscuit", "Dune", "Black"];

export const OPTIONS: Record<Category, string[]> = {
  tap: ["A", "B", "C", "D"], // deck taps A, C; wall taps B, D (server.ts pairing)
  commode: ["A", "B", "C"],
  washbasin: ["A", "B", "C"],
  showerhead: ["A", "B", "C"],
  walltile: ["Beige", "Grey", "Calacatta", "Emerald", "BlackGold"], // first = what the scene starts with
  lighting: ["Warm", "Daylight", "Evening", "Night"],
  tapfinish: METAL,
  showerheadfinish: METAL,
  commodefinish: CERAMIC,
  washbasinfinish: CERAMIC,
  screenfinish: METAL, // the shower screen's frame, chosen apart from the shower fittings
};

// Each piece's finish is its own category, reached by naming the piece plus a finish word or
// colour ("brass tap", "change the basin colour"); "change the tap" still swaps the model.
const FINISH_OF: Partial<Record<Category, Category>> = {
  tap: "tapfinish",
  showerhead: "showerheadfinish",
  commode: "commodefinish",
  washbasin: "washbasinfinish",
};
const FINISH_WORDS = ["finish", "finishes", "colour", "color", "colours", "colors", "metal", "shade"];

const CATEGORY_WORDS: Record<Category, string[]> = {
  tap: ["tap", "taps", "faucet", "faucets", "mixer", "tab"],
  commode: ["commode", "toilet", "wc", "closet", "loo"],
  washbasin: ["washbasin", "basin", "sink", "vanity"],
  showerhead: ["shower", "showerhead", "showers", "rainhead"],
  walltile: ["tile", "tiles", "wall", "walls", "tiling"],
  lighting: ["light", "lights", "lighting", "lamp", "lamps"],
  tapfinish: [],
  showerheadfinish: [],
  commodefinish: [],
  washbasinfinish: [],
  screenfinish: ["frame", "screen", "partition", "enclosure", "glass"],
};
// "tab" is how Whisper often hears "tap"; listed as exact on purpose.

// A word may name values of several items ("silver", "white", "black"); the item named decides.
const VALUE_WORDS: Record<string, string[]> = {
  Grey: ["grey", "gray", "silver"],
  Beige: ["beige", "cream", "sand", "brown"],
  Warm: ["warm", "warmer", "cosy", "cozy", "yellow", "soft", "softer"],
  Daylight: ["daylight", "bright", "brighter", "cool", "cooler", "white", "day"],
  Evening: ["evening", "moody", "mood", "relax", "relaxing", "ambient", "spa", "dim", "dimmer"],
  Night: ["night", "nightlight", "night light", "dark", "darker", "darkest"],
  Black: ["black", "matte black", "matt black"],
  Chrome: ["chrome", "polished", "silver"],
  Brass: ["brass", "gold", "golden"],
  Bronze: ["bronze", "copper"],
  White: ["white"],
  Biscuit: ["biscuit", "ivory", "off white"],
  Dune: ["dune", "taupe"],
  // Tiles: listed after the finishes, so a bare "black"/"white"/"gold" still means a finish or the lights;
  // with "tiles"/"walls" named, these win.
  Calacatta: ["calacatta", "white marble", "white", "marble white"],
  Emerald: ["emerald", "green", "green marble"],
  BlackGold: ["black and gold", "black gold", "gold mosaic", "mosaic", "black", "gold"],
};

// Words for a model, so people can say what's written on the button ("the round basin").
const OPTION_WORDS: Partial<Record<Category, Record<string, string[]>>> = {
  // The longest matching phrase wins, so "vive wall tap" is D, not B ("wallmount") or C ("vive").
  // Whisper hears Kohler's Vive as vibe/viv/veeve.
  tap: {
    A: ["deck", "deck tap", "tall tap", "purist deck", "purist tall"],
    B: ["wallmount", "wallmount tap", "purist wallmount"],
    C: ["vive", "vibe", "viv", "veeve", "vive tall", "vibe tall", "vive deck", "vibe deck"],
    D: ["vive wallmount", "vibe wallmount", "viv wallmount", "veeve wallmount"],
  },
  washbasin: { A: ["oval"], B: ["round", "circular", "vox round", "round vessel"], C: ["rectangular", "rectangle", "square", "vox"] },
  commode: {
    A: ["compact"],
    B: ["one piece", "onepiece", "1 piece", "floor", "floor standing", "floor mounted", "skirted", "with tank", "tank"],
    C: ["rimless", "brazn", "brazen"],
  },
  showerhead: {
    A: ["single spray", "single function", "single"],
    B: ["combo", "hand shower", "handheld", "2 in 1", "two in one"],
    C: ["rain", "rainhead", "rain head", "rain shower", "overhead", "big shower", "ceiling"],
  },
};

// Saying the system's name always means "this is for you" ("Inhabit, brass tap").
// Whisper also writes it as "in habit" / "inhibit".
const WAKE = ["inhabit", "in habit", "inhibit", "enhabit"];

export const NAMES: Record<Category, string> = {
  tap: "tap",
  commode: "commode",
  washbasin: "washbasin",
  showerhead: "shower head",
  walltile: "wall tiles",
  lighting: "lighting",
  tapfinish: "tap finish",
  showerheadfinish: "shower finish",
  commodefinish: "commode colour",
  washbasinfinish: "washbasin colour",
  screenfinish: "shower screen frame",
};

const YES = ["yes", "yeah", "yep", "yup", "sure", "correct", "right", "ok", "okay", "go ahead", "do it"];
const NO = ["no", "nope", "cancel", "wrong", "never mind", "nevermind", "don't", "dont"];
const UNDO = ["undo", "go back", "revert", "change it back", "put it back", "previous one"];

export type Action = { type: "set"; category: Category; value: string } | { type: "undo" };

export type Pending =
  | { kind: "confirm"; action: Action }
  | { kind: "which"; value: string | null; candidates: Category[] }
  | null;

export interface Turn {
  reply: string;
  action?: Action;
  pending: Pending;
}

type State = Partial<Record<Category, string>>;

const ALL = Object.keys(OPTIONS) as Category[];
// What "option b" can mean: the items with models, not the finishes.
const ITEMS = ALL.filter((c) => OPTIONS[c] !== METAL && OPTIONS[c] !== CERAMIC);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\bwall ?mount(ed)?\b|\bwall tap\b/g, (m) => (m === "wall tap" ? "wallmount tap" : "wallmount")) // not "wall tiles"
    .split(/\s+/)
    .filter(Boolean);
}

function hasPhrase(norm: string, phrases: string[]): boolean {
  return phrases.some((p) => new RegExp(`(^| )${p}( |$)`).test(norm));
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Misheard words ("comod", "former" for "warmer"): close to a 5+ letter word -> ask, never act.
function near(w: string, v: string): boolean {
  // Two edits only for long words or same-length swaps ("former"/"warmer"), so "show" != "shower".
  const max = v.length >= 7 || (v.length >= 6 && w.length === v.length) ? 2 : 1;
  return w.length >= 4 && v.length >= 5 && editDistance(w, v) <= max;
}

function findFuzzyValue(ws: string[]): string | null {
  for (const [value, list] of Object.entries(VALUE_WORDS)) {
    if (ws.some((w) => list.some((v) => near(w, v)))) return value;
  }
  return null;
}

function findCategories(ws: string[]): { exact: Category[]; fuzzy: Category[] } {
  const exact = ALL.filter((c) => ws.some((w) => CATEGORY_WORDS[c].includes(w)));
  const fuzzy = exact.length
    ? []
    : ALL.filter((c) => ws.some((w) => CATEGORY_WORDS[c].some((v) => near(w, v))));
  return { exact, fuzzy };
}

// Returns "A"/"B"/a colour or mood, "toggle" for "other/different/next", or null.
function findValue(norm: string): string | null {
  for (const [value, list] of Object.entries(VALUE_WORDS)) {
    if (hasPhrase(norm, list)) return value;
  }
  if (/(^| )(option|model|version|number|design) (a|1|one)( |$)/.test(norm) || hasPhrase(norm, ["first", "original"]))
    return "A";
  if (/(^| )(option|model|version|number|design) (b|2|two)( |$)/.test(norm) || hasPhrase(norm, ["second"])) return "B";
  if (/(^| )(option|model|version|number|design) (c|3|three)( |$)/.test(norm) || hasPhrase(norm, ["third"])) return "C";
  if (/(^| )(option|model|version|number|design) (d|4|four)( |$)/.test(norm) || hasPhrase(norm, ["fourth"])) return "D";
  const tail = / (a|b|c|d)$/.exec(norm); // "tap b", "show me commode a", "basin c"
  if (tail) return tail[1].toUpperCase();
  if (hasPhrase(norm, ["other", "another", "different", "next", "change", "switch", "swap"])) return "toggle";
  return null;
}

// The value the sentence gives for one item: its own words first ("white" is Daylight for lights).
function valueIn(norm: string, category: Category): string | null {
  const own = OPTION_WORDS[category];
  let best: string | null = null;
  let len = 0;
  for (const v of OPTIONS[category])
    for (const w of own?.[v] ?? []) if (w.length > len && hasPhrase(norm, [w])) [best, len] = [v, w.length];
  return best ?? OPTIONS[category].find((v) => VALUE_WORDS[v] && hasPhrase(norm, VALUE_WORDS[v])) ?? null;
}

// "brass tap" / "tap finish" -> the tap's finish; plain "tap" stays the tap.
function toFinish(norm: string, category: Category): Category {
  const f = FINISH_OF[category];
  return f && (hasPhrase(norm, FINISH_WORDS) || valueIn(norm, f)) ? f : category;
}

function list(cats: Category[]): string {
  const names = cats.map((c) => `the ${NAMES[c]}`);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export function describe(category: Category, value: string): string {
  const name = optionName(category, value);
  if (category === "walltile") return `The wall tiles are now ${name.toLowerCase()}.`;
  if (category === "screenfinish") return `The shower screen frame is now ${name.toLowerCase()}.`;
  if (ITEMS.includes(category) && category !== "lighting") return `The ${NAMES[category]} is now the ${name}.`;
  return `The ${NAMES[category]} is now ${name.toLowerCase()}.`;
}

// Resolve a value word against one category. Returns the concrete option or an error reply.
function resolve(category: Category, value: string | null, state: State): { value: string } | { reply: string } {
  const opts = OPTIONS[category];
  const [first, second] = opts;
  if (value === null || value === "toggle") {
    // Next option, wrapping: two-option items flip, finishes step through the range.
    return { value: opts[(opts.indexOf(state[category] ?? first) + 1) % opts.length] };
  }
  if (value === "A") return { value: first };
  if (value === "B") return { value: second };
  const letter = "CD".indexOf(value) + 2; // option C or D
  if (letter >= 2 && value.length === 1)
    return opts[letter] ? { value: opts[letter] } : { reply: `The ${NAMES[category]} only has ${["", "", "two", "three"][opts.length]} options.` };
  if (OPTIONS[category].includes(value)) return { value };
  return { reply: `The ${NAMES[category]} doesn't come in ${value.toLowerCase()}.` };
}

// Items a colour or mood belongs to ("grey" -> wall tiles, "black" -> four finishes); A/B: none.
function ownersOf(value: string | null): Category[] {
  if (!value || value === "A" || value === "B" || value === "C" || value === "toggle") return [];
  return ALL.filter((c) => OPTIONS[c].includes(value));
}

function categoryForValue(value: string | null): Category | null {
  const owners = ownersOf(value);
  return owners.length === 1 ? owners[0] : null;
}

function apply(category: Category, value: string | null, state: State): Turn {
  const r = resolve(category, value, state);
  if ("reply" in r) {
    const owner = categoryForValue(value);
    if (owner) {
      const action: Action = { type: "set", category: owner, value: value! };
      return { reply: `${r.reply} Did you mean the ${NAMES[owner]}?`, pending: { kind: "confirm", action } };
    }
    return { reply: r.reply, pending: null };
  }
  if ((state[category] ?? OPTIONS[category][0]) === r.value) { // nothing chosen yet = the default shown
    return { reply: describe(category, r.value).replace(" now ", " already "), pending: null };
  }
  return { reply: `Done. ${describe(category, r.value)}`, action: { type: "set", category, value: r.value }, pending: null };
}

export const HELP =
  "You can say things like: change the tap, brass tap, show commode B, black basin, grey tiles, warmer lights, or undo.";

export function handle(text: string, pending: Pending, state: State): Turn {
  const all = words(text);
  const ws = all.filter((w, i) => !WAKE.includes(w) && !(w === "in" && all[i + 1] === "habit") && !(w === "habit" && all[i - 1] === "in"));
  const norm = ws.join(" ");
  if (!norm && all.length) {
    return { reply: "Yes? What would you like to change?", pending: { kind: "which", value: null, candidates: ITEMS } };
  }
  if (!norm) return { reply: "Sorry, I didn't hear anything. Please try again.", pending };

  const found = findCategories(ws);
  let exact = [...new Set(found.exact.map((c) => toFinish(norm, c)))];
  // "shower screen": "shower" only says which screen.
  if (exact.includes("screenfinish")) exact = exact.filter((c) => c !== "showerhead" && c !== "showerheadfinish");
  const fuzzy = found.fuzzy;
  const value = exact.length === 1 ? (valueIn(norm, exact[0]) ?? findValue(norm)) : findValue(norm);

  if (pending && hasPhrase(norm, NO) && exact.length === 0) {
    return { reply: "Okay, cancelled. What would you like to change?", pending: null };
  }
  // A bare "yes" confirms; "ok, change the commode" is a new request, not a yes.
  if (pending?.kind === "confirm" && hasPhrase(norm, YES) && exact.length === 0) {
    const a = pending.action;
    return a.type === "set"
      ? { reply: `Done. ${describe(a.category, a.value)}`, action: a, pending: null }
      : { reply: "", action: a, pending: null };
  }

  if (!pending && exact.length === 0 && !value && (hasPhrase(norm, YES) || hasPhrase(norm, NO))) {
    return { reply: "There's nothing to confirm right now. What would you like to change?", pending: null };
  }
  if (hasPhrase(norm, UNDO)) return { reply: "", action: { type: "undo" }, pending: null };
  if (hasPhrase(norm, ["help", "what can i say", "what can you do"])) return { reply: HELP, pending };

  // Answer to "which one?": the item named now plus the value remembered from before.
  if (pending?.kind === "which") {
    // "the tap" also answers "the tap finish or the shower finish?"
    const named = exact
      .map((c) => (pending.candidates.includes(c) ? c : (FINISH_OF[c] ?? c)))
      .filter((c) => pending.candidates.includes(c));
    if (named.length === 1) return apply(named[0], value && value !== "toggle" ? value : pending.value, state);
    if (fuzzy.length === 1 && pending.candidates.includes(fuzzy[0]))
      return apply(fuzzy[0], value && value !== "toggle" ? value : pending.value, state);
  }

  let cats = exact;
  if (cats.length === 0) cats = ownersOf(value); // "make it grey" -> wall tiles; "black" -> ask which

  if (cats.length > 1) {
    // "grey wall and tiles" both mean wall tiles; a colour/mood picks its owner among several.
    const owner = categoryForValue(value);
    if (owner && cats.includes(owner)) cats = [owner];
  }

  // No clear value but a word close to one ("former lights"): confirm rather than toggle.
  if (value === null || value === "toggle") {
    const guess = findFuzzyValue(ws);
    const owner = categoryForValue(guess);
    if (guess && owner && (cats.length === 0 || (cats.length === 1 && cats[0] === owner))) {
      const action: Action = { type: "set", category: owner, value: guess };
      return { reply: `Did you mean ${guess.toLowerCase()} ${NAMES[owner]}?`, pending: { kind: "confirm", action } };
    }
  }

  if (cats.length === 1) return apply(cats[0], value, state);

  if (cats.length > 1) {
    return {
      reply: `Did you mean ${list(cats)}?`,
      pending: { kind: "which", value: value === "toggle" ? null : value, candidates: cats },
    };
  }

  if (fuzzy.length === 1) {
    const r = resolve(fuzzy[0], value, state);
    if ("value" in r) {
      const action: Action = { type: "set", category: fuzzy[0], value: r.value };
      return { reply: `Did you mean the ${NAMES[fuzzy[0]]}?`, pending: { kind: "confirm", action } };
    }
  }
  if (fuzzy.length > 1) {
    return { reply: `Did you mean ${list(fuzzy)}?`, pending: { kind: "which", value, candidates: fuzzy } };
  }

  if (value) {
    return {
      reply: `Which one should I change: ${list(ITEMS)}?`,
      pending: { kind: "which", value: value === "toggle" ? null : value, candidates: ITEMS },
    };
  }

  return { reply: `Sorry, I didn't catch that. ${HELP}`, pending: null };
}

// ---- Always-on mic: is this sentence for the system, or people talking to each other? ----
// Deterministic like the rest: act only on a request, never on chat. When unsure, ignore;
// "Inhabit, ..." always gets through.
const REQUEST_START = [
  "show", "change", "switch", "swap", "make", "try", "put", "use", "give", "set", "turn", "go",
  "let's", "lets", "let me", "let us", "can you", "could you", "would you", "can i", "can we", "could i", "could we",
  "please", "i want", "i'd like", "i would like", "i'll take", "we want", "we'd like", "we would like",
  "next", "another",
];
const CHAT = [
  "i think", "you think", "do you like", "don't you", "dont you", "do you prefer", "i like", "i love", "i prefer",
  "i don't like", "i dont like", "i hate", "looks", "look nice", "look good", "was", "were", "yesterday",
  "at home", "my house", "our house", "my", "he", "she", "they", "them", "his", "her", "him",
];
const MAX_REQUEST_WORDS = 14;

function mentionsSomething(norm: string, ws: string[]): boolean {
  if (ALL.some((c) => ws.some((w) => CATEGORY_WORDS[c].includes(w)))) return true;
  if (Object.values(VALUE_WORDS).some((list) => hasPhrase(norm, list))) return true;
  return Object.values(OPTION_WORDS).some((byValue) => Object.values(byValue!).some((list) => hasPhrase(norm, list)));
}

export function addressed(text: string, pending: Pending): boolean {
  const ws = words(text);
  const norm = ws.join(" ");
  if (!norm) return false;
  if (hasPhrase(norm, WAKE) || /(^| )in habit( |$)/.test(norm)) return true;
  const mentions = mentionsSomething(norm, ws);
  // The system just asked this tablet something: a short answer is for it.
  if (pending && ws.length <= 6 && (mentions || hasPhrase(norm, YES) || hasPhrase(norm, NO))) return true;
  if (ws.length <= 4 && hasPhrase(norm, UNDO)) return true;
  if (!mentions || ws.length > MAX_REQUEST_WORDS || hasPhrase(norm, CHAT)) return false;
  if (hasPhrase(ws.slice(0, 4).join(" "), REQUEST_START)) return true; // "okay, show me the brass tap"
  return ws.length <= 4; // bare "brass tap", "grey tiles please"
}
