# Command protocol (server <-> Unreal, server <-> website)

Agreed format: **JSON over WebSocket**, one message per frame, UTF-8.
Reference server: `control-server/`. Reference Unreal client: `unreal/Source/CommandBusClient/`.

## Endpoint

- WebSocket: `ws://<server-host>:8787`
- HTTP on the same port: `GET /state`, `GET /catalogue`, `POST /voice`

Every client (Unreal, website, tablet) connects to the same WebSocket. The server is the
only source of truth for what is selected.

## Messages a client sends

| Message | Meaning |
| --- | --- |
| `{"type":"set","category":"tap","value":"B"}` | Select option `B` for the tap |
| `{"type":"undo"}` | Revert the last change |
| `{"type":"end-session"}` | End the visitor's session (PC display): every choice and the view back to default, undo history and open questions forgotten |
| `{"type":"layout","layout":{"commode":{"dx":300,"dy":0}}}` | Positions moved on the 2D floor plan, mm offsets keyed by category (or plan item id; doors `door-0`, `door-1`), with an optional `r` of 0..3 quarter turns clockwise (a door: its swing). 2D only, Unreal ignores it; at most 40 keys, each within ±10 m. `end-session` clears it |
| `{"type":"view","mode":"plan"}` | What the PC display shows: `"3d"` (the live room) or `"plan"` (the 2D floor plan). Not a choice, so not undone; `end-session` sets `"3d"` |
| `{"type":"camera","yaw":-45,"pitch":10}` | Look around: turn (yaw -180 left .. 180 right) and tilt (pitch -30 down .. 30 up), degrees from the default view; either may be sent alone. Not a choice, so not undone |

`category` and `value` (case-sensitive; the first value is what the scene starts with). The
server rejects any other pair with an `error`:

| category | values |
| --- | --- |
| `tap` | `A`, `B` |
| `commode`, `washbasin`, `showerhead` | `A`, `B`, `C` |
| `walltile` | `Beige`, `Grey` |
| `lighting` | `Warm`, `Daylight`, `Evening` (downlights off: cove, niches, mirror glow, slat wash), `Night` (under-vanity glow and dimmed niches) |
| `tapfinish`, `showerheadfinish`, `screenfinish` | `Black`, `Chrome`, `Brass`, `Bronze` (Kohler -BL, -CP, -2MB, -BV; `screenfinish` is the shower screen's frame) |
| `commodefinish`, `washbasinfinish` | `White`, `Biscuit`, `Dune`, `Black` (Kohler -0, -96, -NY, -7) |

**Pairing rule:** the deck taps (`tap` `A` Purist, `C` Vive) can't serve the Vox rectangle basin
(`washbasin` `C`, which covers the counter where they stand). Setting the basin to `C` while the tap
is `A` or `C` also sets the wall tap of the same series (`B` or `D`); setting a deck tap while the
basin is `C` also sets `washbasin` `A`. Clients receive both `set`
messages and a `voice` caption saying why; one `undo` reverts both.

## Messages the server sends

| Message | When | What a client does |
| --- | --- | --- |
| `{"type":"state","state":{"tap":"B",...},"camera":{"yaw":0,"pitch":0},"view":"3d"}` | Once, right after connecting | Apply every entry, the camera and the display mode |
| `{"type":"layout","layout":{...}}` | Whenever someone moves something on a 2D plan (and in `state`) | Both plans redraw with the moves; Unreal ignores it |
| `{"type":"moves","moves":[{"objects":["SM_Commode_A"],"x":30,"y":5,"yaw":90,"sx":1,"sy":1}]}` | After every layout change (and model swap while something is moved; in `state` when something is) | Unreal places each named object: cm, Unreal axes, yaw in degrees, stretch; every object of every model, identity when unmoved. Worked out by the control server from `tablet/assets/plan.js` + `plan.json` |
| `{"type":"view","mode":"plan"}` | Whenever someone switches between the 3D room and the 2D floor plan | `/tv` shows that view; phones update their button (Unreal ignores it) |
| `{"type":"camera","yaw":-45,"pitch":10}` | Whenever someone moves a look slider or drags on `/tv` | Turn and tilt the view (Unreal eases into it) |
| `{"type":"set","category":"tap","value":"B"}` | Every change (and every undo), to every client | Apply it |
| `{"type":"session-ended"}` | After `end-session` (preceded by a `set` for every category and a `camera`) | Phones switch the microphone off and show "Session ended" |
| `{"type":"error","reason":"bad_command"}` | Only to the sender, on a bad message | Log it |
| `{"type":"voice","transcript":"...","reply":"..."}` | After each spoken command, to every client | Show the caption (optional) |

## Unreal side (Ujjwal)

The level has one Level Variant Sets actor. Variant Set names equal the `category` strings;
Variant names equal the `value` strings. Applying a message is one call:

```cpp
VariantSetsActor->SwitchOnVariantByName(Category, Value);
```

`CommandBusClient` already does this, reconnects every 2 s if the server drops, and syncs
`GET /state` on start. It compiles against UE 5.7.

## Voice (Anant)

The website records audio and `POST`s it to `/voice` (any format ffmpeg reads; webm from
`MediaRecorder` is fine). The server runs Whisper, matches the phrase, asks a clarifying
question when needed, and answers:

```json
{
  "transcript": "change the tap",
  "reply": "Done. The tap is now the Purist Wall-Mount Tap.",
  "command": {"type": "set", "category": "tap", "value": "B"},
  "audio": "<base64 WAV of the spoken reply>"
}
```

`command` is absent when the server asked a question instead (for example
"Which one: the tap, commode, washbasin or showerhead?"). The next `/voice` call answers it.
**Always-on mic:** send each stretch of speech with the header `X-Listen: ambient`. The server
then acts only if the sentence was addressed to it; otherwise it answers
`{"transcript": "...", "ignored": true}` and broadcasts nothing. The tablet page sends 16 kHz mono
WAV.

Text can be sent instead of audio for testing: `POST /voice` with
`{"text":"change the tap"}` and `Content-Type: application/json`.
