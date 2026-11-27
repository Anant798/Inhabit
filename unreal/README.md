# Unreal Engine project (UE 5.7)

`Inhabit.uproject` with two C++ modules: `Inhabit` (game module) and `CommandBusClient`
(listens to the control server). Plugins on: Variant Manager, Variant Manager Content,
Pixel Streaming 2. Builds from the command line without opening the editor:

```powershell
& "C:\Program Files\Epic Games\UE_5.7\Engine\Build\BatchFiles\Build.bat" InhabitEditor Win64 Development -Project="$PWD\Inhabit.uproject" -WaitMutex
```

Message format: `../docs/command-protocol.md`.

## The level is built by a script

`Scripts/build_level.py` makes `/Game/Maps/Bathroom` (the startup map) from the Blender export.
Nothing in `Content/` is edited by hand: change the .blend or the script, then rebuild.

```powershell
& "C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe" "$PWD\Inhabit.uproject" -ExecutePythonScript="$PWD\Scripts\build_level.py"
```

Close the editor first. The editor opens, builds the level (about 2 minutes) and quits. Before
building, export `../blender/export/room_shell.fbx` from `../blender/room/room_shell.blend` (see
`../blender/README.md`). It needs the full editor: the headless `-run=pythonscript` commandlet
crashes in UE 5.7.4's FBX importer.

What it builds:

| Part | What |
| --- | --- |
| Textures, materials | `/Game/Inhabit/Textures` from `../blender/textures`; one master `M_Inhabit` (plus `M_Inhabit_Glass`), an `MI_` instance per Blender material with the same values |
| Meshes | `/Game/Inhabit/Meshes`, one actor per Blender object, all at the origin (vertices are in world space) |
| Lights | Blender's 12 lights as rect and spot lights, watts x 683 = lumens. Fixed exposure in the `PostProcess` volume (`EXPOSURE` in the script) |
| `Camera_TV` | Between the door and the middle of the room (1.05, 0.70 m, height 1.50 m), 100° lens, looking diagonally at the shower; the commode and the door are a short turn away. Fixed in place; turns and tilts (±30°) with the phone's sliders or by dragging on `/tv` (`camera` message, eased in `CommandBusClient::TickComponent`). Auto-activates for player 0 |
| `LVS_Bathroom` | Variant Sets `tap`, `commode`, `washbasin`, `showerhead` (`A`/`B` swap visibility; showerhead B has its own lower arm), `tapfinish`, `showerheadfinish`, `commodefinish`, `washbasinfinish` (swap the material on both models; the shower one also covers arms, mixer and drain), `walltile` (`Beige`/`Grey` swap wall materials), `lighting` (`Warm`/`Daylight` set every light's intensity and colour, and the LED strip material) |
| `MirrorReflection` | Planar reflection on the mirror: a true mirror image (Lumen's reflection smeared and doubled it). Needs `r.AllowGlobalClipPlane` |
| `CommandBus` | `ACommandBusActor`: the listener. Finds the Variant Sets actor by itself, retries every 2 s until the control server is up |

Renderer (`Config/DefaultEngine.ini`): DX12 SM6, Lumen with hardware ray tracing, ray-traced
shadows (the long cove strips need area shadows), no baked lighting.

## Test

Start the control server (`cd ../control-server; npm start`), then launch the game:

```powershell
& "C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe" "$PWD\Inhabit.uproject" -game -windowed -ResX=1600 -ResY=900
```

Open http://localhost:8787; tapping an option or saying "change the tap" flips the Variant Set.

## Pixel Streaming

`../tools/start-demo.ps1` runs it all (see the top-level README). The pieces:

- **Signalling server + player page:** the engine's `PixelStreaming2/Resources/WebServers`, copied
  to `../tools/bin/ps-web` and built by `../tools/setup.ps1`. Runs on the system Node 24; the
  engine's own `start.bat` is skipped because it downloads a private Node and asks an online
  service for the public IP. Player page on port 8080, Unreal connects on 8888.
- **Unreal:** `-game -RenderOffscreen -PixelStreamingConnectionURL=ws://localhost:8888`
  (`-PixelStreamingURL` still works but is the legacy name). Uncooked for now; package the game
  before the showroom.

On the showroom network, other devices open `http://<PC's IP>:8080`. That works on one LAN
without a TURN server; across the internet it needs TURN (not set up).

`Binaries/`, `Intermediate/`, `Saved/` are git-ignored. `*.uasset` and `*.umap` go through Git LFS.
