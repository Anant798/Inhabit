import test from "node:test";
import assert from "node:assert/strict";
import { handle, addressed, Pending } from "./intent";

const none: Pending = null;

test("clear commands act immediately and confirm out loud", () => {
  const cases: Array<[string, string, string]> = [
    ["change the tap", "tap", "B"],
    ["show me commode b", "commode", "B"],
    ["switch the washbasin to option two", "washbasin", "B"],
    ["make the tiles grey", "walltile", "Grey"],
    ["make it brighter", "lighting", "Daylight"],
    ["grey", "walltile", "Grey"],
    ["show the other shower", "showerhead", "B"],
    ["Change the tab.", "tap", "B"], // Whisper mishearing of "tap"
  ];
  for (const [text, category, value] of cases) {
    const t = handle(text, none, {});
    assert.deepEqual(t.action, { type: "set", category, value }, text);
    assert.match(t.reply, /^Done\./, text);
    assert.equal(t.pending, null, text);
  }
});

test("'change' toggles from the current option", () => {
  assert.deepEqual(handle("warmer lights please", none, { lighting: "Daylight" }).action, {
    type: "set",
    category: "lighting",
    value: "Warm",
  });
  assert.deepEqual(handle("change the tap", none, { tap: "B" }).action, { type: "set", category: "tap", value: "C" });
  assert.deepEqual(handle("other lighting", none, { lighting: "Warm" }).action, {
    type: "set",
    category: "lighting",
    value: "Daylight",
  });
});

test("asking for what is already shown says so and does nothing", () => {
  assert.equal(handle("I want beige walls", none, {}).reply, "The wall tiles are already beige marble."); // the default
  const t = handle("show tap b", none, { tap: "B" });
  assert.equal(t.action, undefined);
  assert.equal(t.reply, "The tap is already the Purist Wall-Mount Tap.");
});

test("value without an item asks which item, then the answer completes it", () => {
  const q = handle("show me option b", none, {});
  assert.equal(q.action, undefined);
  assert.match(q.reply, /^Which one should I change/);
  assert.equal(q.pending?.kind, "which");

  const a = handle("the commode", q.pending, {});
  assert.deepEqual(a.action, { type: "set", category: "commode", value: "B" });
  assert.equal(a.pending, null);
});

test("two items named asks which one", () => {
  const q = handle("change the tap or the shower", none, {});
  assert.equal(q.reply, "Did you mean the tap or the shower head?");
  const a = handle("the shower", q.pending, {});
  assert.deepEqual(a.action, { type: "set", category: "showerhead", value: "B" });
});

test("a misheard item asks for confirmation; yes applies, no cancels", () => {
  const q = handle("change the comode", none, {});
  assert.equal(q.action, undefined);
  assert.equal(q.reply, "Did you mean the commode?");
  assert.equal(q.pending?.kind, "confirm");

  const yes = handle("yes", q.pending, {});
  assert.deepEqual(yes.action, { type: "set", category: "commode", value: "B" });

  const no = handle("no", q.pending, {});
  assert.equal(no.action, undefined);
  assert.match(no.reply, /cancelled/);
  assert.equal(no.pending, null);
});

test("a misheard colour or mood asks instead of guessing", () => {
  // Real Whisper output for "Warmer lights please"; must not toggle to Daylight.
  const q = handle("Former lights, please.", none, { lighting: "Warm" });
  assert.equal(q.action, undefined);
  assert.equal(q.reply, "Did you mean warm lighting?");
  assert.deepEqual(handle("yes", q.pending, {}).action, { type: "set", category: "lighting", value: "Warm" });

  assert.equal(handle("make it baige", none, {}).reply, "Did you mean beige wall tiles?");
  // Plain "change the lights" still toggles.
  assert.deepEqual(handle("change the lights", none, { lighting: "Warm" }).action, {
    type: "set",
    category: "lighting",
    value: "Daylight",
  });
});

test("a colour on the wrong item offers the right one", () => {
  const q = handle("make the tap grey", none, {});
  assert.equal(q.action, undefined);
  assert.equal(q.reply, "The tap doesn't come in grey. Did you mean the wall tiles?");
  assert.deepEqual(handle("yes", q.pending, {}).action, { type: "set", category: "walltile", value: "Grey" });
});

test("'ok, change the commode' while a question is open is a new request, not a yes", () => {
  const q = handle("change the comode", none, {});
  const t = handle("ok change the washbasin", q.pending, {});
  assert.deepEqual(t.action, { type: "set", category: "washbasin", value: "B" });
});

test("undo, help, silence and nonsense", () => {
  assert.deepEqual(handle("undo that", none, {}).action, { type: "undo" });
  assert.deepEqual(handle("go back", none, {}).action, { type: "undo" });
  assert.match(handle("what can I say", none, {}).reply, /You can say/);
  assert.match(handle("", none, {}).reply, /didn't hear/);
  assert.match(handle("Yes.", none, {}).reply, /nothing to confirm/);
  const t = handle("what's the weather like", none, {});
  assert.equal(t.action, undefined);
  assert.match(t.reply, /didn't catch that/);
});

test("finishes: naming a piece with a finish or colour changes its finish, not its model", () => {
  const cases: Array<[string, string, string]> = [
    ["make the tap brass", "tapfinish", "Brass"],
    ["chrome shower please", "showerheadfinish", "Chrome"],
    ["gold tap", "tapfinish", "Brass"],
    ["black basin", "washbasinfinish", "Black"],
    ["biscuit commode", "commodefinish", "Biscuit"],
    ["change the tap finish", "tapfinish", "Chrome"], // steps from the default matte black
  ];
  for (const [text, category, value] of cases) {
    assert.deepEqual(handle(text, none, {}).action, { type: "set", category, value }, text);
  }
  assert.equal(handle("brass tap", none, {}).reply, "Done. The tap finish is now brushed brass.");
  // Plain "change the tap" still swaps the model; "white lights" is still daylight.
  assert.deepEqual(handle("change the tap", none, {}).action, { type: "set", category: "tap", value: "B" });
  assert.deepEqual(handle("white lights", none, {}).action, { type: "set", category: "lighting", value: "Daylight" });
  // Finishes step through the whole range and wrap.
  assert.deepEqual(handle("change the tap colour", none, { tapfinish: "Bronze" }).action, {
    type: "set",
    category: "tapfinish",
    value: "Black",
  });
});

test("a finish shared by several pieces asks which, and naming the piece answers it", () => {
  const q = handle("make it black", none, {});
  assert.equal(q.action, undefined);
  assert.match(q.reply, /^Did you mean the tap finish, .* or the shower screen frame\?$/);
  const a = handle("the commode", q.pending, {});
  assert.deepEqual(a.action, { type: "set", category: "commodefinish", value: "Black" });
});

test("a finish the piece doesn't come in says so", () => {
  const t = handle("make the basin bronze", none, {});
  assert.equal(t.action, undefined);
  assert.match(t.reply, /doesn't come in bronze/);
});

test("the names on the buttons work by voice", () => {
  const cases: Array<[string, string, string]> = [
    ["show the round basin", "washbasin", "B"],
    ["oval basin please", "washbasin", "A"],
    ["the wall mounted tap", "tap", "B"],
    ["give me the deck tap", "tap", "A"],
    ["combo shower", "showerhead", "B"],
    ["the one piece commode", "commode", "B"],
    ["the floor standing toilet", "commode", "B"],
    ["the vive tap", "tap", "C"],
    ["vibe tall tap", "tap", "C"],
    ["the vive wall mounted tap", "tap", "D"],
    ["vibe wall tap", "tap", "D"],
    ["show me tap d", "tap", "D"],
    ["the fourth tap", "tap", "D"],
    ["the purist wall tap", "tap", "B"],
  ];
  for (const [text, category, value] of cases) {
    const from = value === "A" ? { tap: "B", washbasin: "B", showerhead: "B", commode: "B" } : {}; // show a change
    assert.deepEqual(handle(text, none, from).action, { type: "set", category, value }, text);
  }
  // "wall mounted" is the tap, not the wall tiles.
  assert.equal(handle("wall mounted tap", none, {}).action?.type, "set");
  assert.equal(handle("the oval basin", none, {}).reply, "The washbasin is already the Veil Oval Vessel.");
});

test("the wake word alone asks what to change, and the answer completes it", () => {
  const q = handle("Inhabit", none, {});
  assert.equal(q.reply, "Yes? What would you like to change?");
  assert.deepEqual(handle("the shower", q.pending, {}).action, { type: "set", category: "showerhead", value: "B" });
  assert.deepEqual(handle("inhabit, brass tap", none, {}).action, { type: "set", category: "tapfinish", value: "Brass" });
});

test("always-on mic: requests are for the system, conversation is not", () => {
  const forSystem = [
    "brass tap",
    "grey tiles please",
    "daylight",
    "show me the round basin",
    "can you change the commode",
    "could we try the chrome shower",
    "I'd like the black basin",
    "let's see the warm lights",
    "switch the tap",
    "Inhabit, I think the bronze one",
    "in habit change the tiles",
    "undo",
    "go back",
  ];
  const conversation = [
    "I think the black tap looks better",
    "do you like the chrome one",
    "my sister has this exact basin at home",
    "the lighting was nicer yesterday",
    "she wanted a grey bathroom but he said no",
    "what time do we need to leave",
    "that's a really nice shower",
    "the tiles in our house are much darker than these ones honestly I don't know",
    "Done. The tap is now the Purist Wall-Mount Tap.", // our own reply heard back through the speaker
    "Thank you.",
  ];
  for (const s of forSystem) assert.equal(addressed(s, null), true, s);
  for (const s of conversation) assert.equal(addressed(s, null), false, s);
  // A short answer right after the system asked something is for it.
  assert.equal(addressed("the commode", { kind: "which", value: "B", candidates: ["tap", "commode"] }), true);
  assert.equal(addressed("yes", { kind: "confirm", action: { type: "undo" } }), true);
  assert.equal(addressed("yes", null), false);
});

test("the shower screen frame has its own finish, apart from the shower fittings", () => {
  assert.deepEqual(handle("brass frame", none, {}).action, { type: "set", category: "screenfinish", value: "Brass" });
  assert.deepEqual(handle("make the shower screen chrome", none, {}).action, { type: "set", category: "screenfinish", value: "Chrome" });
  assert.deepEqual(handle("chrome shower", none, {}).action, { type: "set", category: "showerheadfinish", value: "Chrome" });
  assert.equal(handle("bronze partition", none, {}).reply, "Done. The shower screen frame is now brushed bronze.");
  // A/B is never offered for a finish.
  assert.doesNotMatch(handle("show me option b", none, {}).reply, /frame/);
});

test("third model: option C by letter, by name, and changing steps through all three", () => {
  assert.deepEqual(handle("show me basin c", none, {}).action, { type: "set", category: "washbasin", value: "C" });
  assert.deepEqual(handle("the third commode", none, {}).action, { type: "set", category: "commode", value: "C" });
  assert.deepEqual(handle("rain shower", none, {}).action, { type: "set", category: "showerhead", value: "C" });
  assert.deepEqual(handle("show the rainhead", none, {}).action, { type: "set", category: "showerhead", value: "C" });
  assert.deepEqual(handle("the rectangular basin", none, {}).action, { type: "set", category: "washbasin", value: "C" });
  assert.deepEqual(handle("change the commode", none, { commode: "B" }).action, { type: "set", category: "commode", value: "C" });
  assert.deepEqual(handle("change the commode", none, { commode: "C" }).action, { type: "set", category: "commode", value: "A" });
  assert.match(handle("commode d", none, {}).reply, /only has three options/);
  assert.deepEqual(handle("change the tap", none, { tap: "D" }).action, { type: "set", category: "tap", value: "A" });
  assert.equal(handle("vox basin", none, {}).reply, "Done. The washbasin is now the Vox Rectangle Vessel.");
});

test("four lighting moods", () => {
  for (const [text, value] of [["evening lights", "Evening"], ["make it moody", "Evening"], ["night light", "Night"],
                               ["dim the lights", "Evening"], ["daylight", "Daylight"], ["warm lights", "Warm"]] as const) {
    const t = handle(text, none, { lighting: "Daylight" });
    assert.deepEqual(t.action ?? { type: "set", category: "lighting", value: "Daylight" }, { type: "set", category: "lighting", value }, text);
  }
  // "change the lights" steps through them
  assert.deepEqual(handle("change the lights", none, { lighting: "Evening" }).action, { type: "set", category: "lighting", value: "Night" });
});

test("five wall tiles, including black and gold mosaic", () => {
  for (const [text, value] of [["black tiles", "BlackGold"], ["gold mosaic walls", "BlackGold"], ["make the tiles white", "Calacatta"],
                               ["calacatta", "Calacatta"], ["green tiles", "Emerald"], ["emerald walls", "Emerald"], ["grey tiles", "Grey"]] as const) {
    assert.deepEqual(handle(text, none, {}).action, { type: "set", category: "walltile", value }, text);
  }
  assert.equal(handle("black and gold tiles", none, {}).reply, "Done. The wall tiles are now black & gold mosaic.");
  // bare colours still mean what they meant
  assert.deepEqual(handle("white lights", none, {}).action, { type: "set", category: "lighting", value: "Daylight" });
  assert.deepEqual(handle("gold tap", none, {}).action, { type: "set", category: "tapfinish", value: "Brass" });
  assert.match(handle("make it black", none, {}).reply, /^Did you mean/);
});
