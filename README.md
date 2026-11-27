# inhabit · prototype

Voice-controlled interactive bathroom visualisation, built by Glyptika Studios LLP.
Delivery: first week of January 2027.

## How it fits together

The **control server** (`control-server/`) is the hub. The website or tablet sends it speech
or taps; it decides what was meant, asks back when unsure, and tells Unreal what to change.

```
mic (website/tablet) --audio--> control server: ffmpeg -> Whisper -> phrase rules -> Piper reply
tablet buttons ------json-----> control server
                                     | WebSocket, JSON (docs/command-protocol.md)
                                     v
                     Unreal (Variant Manager, Pixel Streaming)
```

All speech runs offline on the PC: whisper.cpp for speech-to-text, Piper for the spoken reply.

## Folders

| Folder | What | Status |
| --- | --- | --- |
| `control-server/` | TypeScript server: state, undo, catalogue, `/voice` with clarification | Working, 36 tests |
| `tablet/` | Branded control page: product names, finish swatches, always-on mic, look-around slider; served by the control server at `/` | Working |
| `tools/` | `setup.ps1` downloads whisper.cpp, Piper and their models and builds the Pixel Streaming web server (git-ignored); `start-demo.ps1` starts everything | Working |
| `unreal/` | UE 5.7 project: Bathroom level (built by `Scripts/build_level.py`), Variant Sets for all six categories, `CommandBus` listener | Working end to end: voice/tablet → server → Unreal → browser via Pixel Streaming |
| `blender/` | 10 x 8 x 12 ft room, finished (stone tiles, fluted wall, cove lighting, vanity), all 8 Kohler fixtures | Ready for Unreal |
| `docs/` | `command-protocol.md`: the JSON contract between server, website and Unreal | Agreed |

## Set up on a new PC

Windows 10/11 with an RTX-class GPU (the room uses hardware ray tracing). Install:

- **Git with Git LFS** (the Unreal assets are LFS files): `winget install Git.Git GitHub.GitLFS`, then `git lfs install`
- **Unreal Engine 5.7** from the Epic Games Launcher, and **Visual Studio 2022** with "Game development with C++"
  (to compile the project's two C++ modules)
- **Node 22+** and **ffmpeg** on PATH: `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg`

```powershell
git clone https://github.com/glyptikapc1/Inhabit-Prototype.git
cd Inhabit-Prototype
powershell -ExecutionPolicy Bypass -File tools\setup.ps1      # speech models, Pixel Streaming server
cd control-server; npm install; npm run build; cd ..
cd unreal; & "C:\Program Files\Epic Games\UE_5.7\Engine\Build\BatchFiles\Build.bat" InhabitEditor Win64 Development -Project="$PWD\Inhabit.uproject" -WaitMutex; cd ..
powershell -ExecutionPolicy Bypass -File tools\start-demo.ps1
```

The bathroom level is already built and committed, so Blender isn't needed to run the demo; it is
only for changing the room (`blender/README.md`, then the level build in `unreal/README.md`). The
original Kohler CAD downloads stay outside the repo (see `blender/README.md` for the source links).
Client sheets: `docs/inhabit-design-card.jpg`, `docs/inhabit-variant-sheet.png`, `docs/inhabit-mood-sheet.jpg`.

## Run it

Needs Node 22+ and ffmpeg on PATH (`winget install Gyan.FFmpeg`).

```powershell
powershell -ExecutionPolicy Bypass -File tools\setup.ps1
cd control-server
npm install
npm test
npm run build
npm start
```

Open http://localhost:8787 and allow the microphone. It then listens until the page is closed:
just say what you want ("the round basin", "brass tap", "grey tiles", "warmer lights", "undo"),
or type it. People talking to each other is ignored; see below.

**The whole demo** (control server, Pixel Streaming, Unreal rendering offscreen, HTTPS tunnel),
once the steps above and the level build (`unreal/README.md`) are done:

```powershell
powershell -ExecutionPolicy Bypass -File tools\start-demo.ps1
```

It prints three addresses:

| Where | Address |
| --- | --- |
| Room, on the TV | http://localhost:8787/tv: the intro (with sound), then the live room full-screen; drag with the mouse or use the arrow keys to look around (Home re-centres); full screen with the button at the top left, F or a double-click (Esc leaves). **End session** (top right, asks first) resets the room for the next visitor and switches connected phones' microphones off. **2D Floor Plan** (next to it, or P; also from the phone) swaps the room for a CAD-style plan measured from the 3D model: room and wall dimensions, every fixture's size, its distances to the walls and the clear space in front, door swings, and the clear walking floor in m². A clean CAD-style sheet: white floor, solid walls, numbered fixtures, dimensions in brass outside the room; the side panel lists every item, the finishes and the areas. It redraws on every change; **3D View** goes back, nothing is reset. The phone has the same plan (**Floor plan on this phone**, live) and can switch the big screen too. **Move things on either plan, and the 3D room follows:** fittings, the vanity (its basin and tap go with it), the ledge (with what stands on it) move freely, kept in the room and snapping flush within 50 mm of what they back onto; wall items and taps slide along their wall; the shower's side and front glass slide to make the cubicle wider or deeper (at least 1000 x 700), the tray, drain, glass and shower door following. Fittings, the vanity and the ledge also turn 90° (**Rotate**, R, or a double-click). The room door can go in any wall and change its swing, on the plan only (a moved hole in a 3D wall would need a rebuild). With a mouse, drag the item; on a touch screen, tap it, then hold the round **✥ handle** beside it and drag (a finger elsewhere still scrolls and zooms). A moved model stays put when it's swapped in 3D. On the PC: arrow keys nudge 50 mm (Shift 500), Esc deselects, Ctrl+Z / Ctrl+Y undo and redo; the phone has Undo and Reset; **Layout changed · Reset** puts everything back. End session clears the moves. Opened for you in Edge with sound allowed; `-NoTv` skips it |
| Tablet page on this PC | http://localhost:8787 |
| Tablet page on a phone or tablet, with mic | `https://<random>.trycloudflare.com`, copied to the clipboard |

Stop everything with `powershell -ExecutionPolicy Bypass -File tools\stop-demo.ps1`.

**Intro videos:** `tablet/assets/intro-vertical.mp4` plays on phones (portrait), `intro-landscape.mp4`
(the client's horizontal 16 s intro, 1920 x 1080, loudness matched to the vertical one) on the PC display and
landscape screens. They play with sound when the browser allows it: the launcher's Edge window always does;
elsewhere a "Sound on" button appears and any tap, click or key turns the sound on (browsers don't
allow a site to start sound before the first interaction, phones never do).

The phone link is a Cloudflare quick tunnel (no account): a new random link every start, and
anyone who has it can use the tablet page while the demo runs. Phones need it because browsers
allow the microphone only on `https` or `localhost`. For a fixed link (e.g. a showroom QR code),
set up a named Cloudflare tunnel on a Glyptika domain.

## What the voice understands

Deterministic phrase rules (`control-server/src/intent.ts`), no LLM:

- **Clear request:** acts and confirms. "Change the tap" → "Done. The tap is now the Purist Wall-Mount Tap."
  The names on the buttons work too: "the round basin", "the combo shower", "the deck tap".
- **Item missing:** asks which. "Show me option B" → "Which one should I change: …?"
- **Two items:** "Did you mean the tap or the shower head?"
- **Misheard word:** confirms first. "Change the comode" → "Did you mean the commode?" (yes / no)
- **Wrong option for an item:** "The tap doesn't come in grey. Did you mean the wall tiles?"
- **Finishes:** a piece plus a colour or the word finish/colour changes that piece's finish:
  "brass tap", "chrome shower", "black basin", "change the commode colour" (steps through them).
  "Make it black" asks which piece. Plain "change the tap" still swaps the model.
- **Third models and moods:** "basin c", "the rectangular basin", "rain shower", "the rimless commode";
  lighting "evening" / "moody" and "night light".
- **Pairing:** the Vox rectangle basin needs a wall tap; picking it with a deck tap brings the wall tap of
  the same series (Purist or Vive) along, and says so.
- **Undo, help**, and a plain reply for anything else.

A question waits 60 seconds for an answer, then is forgotten.

### Always-on mic: request or conversation?

The page sends every stretch of speech; the server transcribes it and acts only when it's
addressed to the system (`addressed()` in `intent.ts`, tested with real sentences):

- **Acts on:** short requests ("brass tap", "grey tiles please"), sentences that start like a
  request ("show me…", "can you…", "could we try…", "I'd like…", "switch…", "let's see…"), a short
  answer to a question the system just asked, and anything starting with **"Inhabit, …"**.
- **Ignores:** sentences with no product, colour or mood in them; opinions and chat ("I think the
  black tap looks better", "do you like the chrome one", "she wanted grey"); anything over 14 words;
  the system's own reply heard back through the speaker (the page also mutes the mic while it speaks).
- When in doubt it ignores, so a missed request can be repeated with "Inhabit, …".

Audio is transcribed on this PC and deleted straight after; nothing is stored. Through the phone
tunnel it travels encrypted via Cloudflare.
