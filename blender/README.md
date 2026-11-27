# Blender scene

`room/room_shell.blend` is the whole bathroom: the 10 x 8 x 12 ft room (3.048 x 2.438 x 3.658 m)
and the Kohler fixtures, every option of each. After any change, export it with

```powershell
& E:\Softwares\Blender\blender.exe -b room\room_shell.blend --python export_room.py
```

which writes both outputs from the same geometry: `export/room_shell.fbx` (git-ignored) for Unreal,
and `../tablet/assets/plan.json`, the measured footprints (convex hull from above, mm) behind the
PC display's **2D Floor Plan**. Then run `../unreal/Scripts/build_level.py` (see `../unreal/README.md`).
The script unhides every object while it exports: Blender doesn't update a hidden object's position,
so an exporter would write it at a stale spot. Door swings are read from the model too: hinged on
the jamb away from the handle, opening to the handle's side.

## Fixtures (collection `Fixtures`)

Option A is visible, option B hidden; Unreal's Variant Sets switch them.

| Object | Kohler model | Placed |
| --- | --- | --- |
| `SM_Tap_A` | Purist K-14404-4A tall single-handle faucet | Counter, behind the basin |
| `SM_Tap_B` | Purist K-T14414-4 wall-mount faucet trim | East wall, 1.15 m |
| `SM_Tap_C` | Vive K-23967IN-4ND tall single-handle faucet (Kohler India) | Counter, behind the basin, like tap A |
| `SM_Tap_D` | Vive K-23975IN-4ND wall-mount faucet (Kohler India) | East wall, 1.12 m (lever clears the mirror) |
| `SM_Commode_A` | Veil K-6299 wall-hung compact elongated | West wall, rim 430 mm |
| `SM_Commode_B` | Veil K-1381 one-piece elongated, skirted trapway | Floor, back 25 mm off the ledge face |
| `SM_Washbasin_A` | Veil K-20704 21 in oval vessel | Counter, east wall |
| `SM_Washbasin_B` | Vox K-14800 16-1/2 in round vessel, above counter | Counter at x 2.745, clear of the deck taps |
| `SM_Showerhead_A` | Purist K-939-G single-function showerhead | On the arm |
| `SM_Showerhead_B` | Purist K-23219-G 2-in-1 shower combo | On the arm |
| `SM_ShowerArm_A` | Purist K-933 shower arm and flange, for showerhead A | North wall, flange at 2.03 m |
| `SM_ShowerArm_B` | Same arm, for showerhead B (client: B hung too high) | North wall, flange at 1.88 m, heads ~1.75 m |
| `SM_Washbasin_C` | Vox K-2660-1 23 in rectangular vessel | Counter, under the wall tap |
| `SM_Commode_C` | Brazn K-21748 wall-hung round-front, rimless | West wall, Kohler's own mounting height |
| `SM_Showerhead_C`, `SM_ShowerArm_C` | Contemporary 10" rainhead K-13689-G on K-10124 wall rainhead arm | North wall, flange at 2.25 m, head ~1.95 m |
| `SM_Vanity_Counter` | Stone top, 1000 x 550 mm, top 720 mm (not Kohler) | East wall |

**Deck taps (A, C) can't go with Basin C:** the Vox rectangle covers the counter where they stand.
The control server enforces the pairing (choosing one switches the other, see
`docs/command-protocol.md`). Every other pairing fits: both deck spouts reach over the oval and round bowls
(outlets 881 mm Purist, 897 mm Vive; round rim 854 mm, oval rim peaks 883 mm at its ends).

**Basin A sits on its bowl, not its drain spigot:** the 39 mm spigot under the Veil Oval Vessel
goes down through the counter (as installed), so it was lowered 39 mm; only the bowl shows.
Check this for any new vessel basin: the counter line is where the bowl starts, not the mesh bottom.

## Room finish (look: warm stone spa, see `renders/`)

| Object | What | Material |
| --- | --- | --- |
| `SM_Room_Wall_*` | 200 mm walls. North wall has a lit shower niche (1050 x 300 mm at 1.05 m) | `M_WallTile_Beige`, 600 x 1200 tiles |
| `SM_Room_Wall_West`, `SM_Room_Ledge` | Fluted accent wall; 1.0 m ledge (hides the WC carrier) with a lit niche above | `M_WallFluted_Beige` |
| `SM_Room_Floor`, `SM_Shower_Tray` | Floor; 40 mm raised shower tray | `M_FloorStone`, 600 x 600 honed |
| `SM_FalseCeiling`, `SM_Ceiling_Slot` | Ceiling at 2.80 m with a 120 mm lit cove slot to 2.95 m | `M_Plaster` |
| `SM_Vanity_Cabinet`, `SM_Vanity_Counter` | Floating walnut cabinet, stone top | `M_Walnut`, `M_CounterStone` |
| `SM_Mirror`, `SM_Shower_Glass` | Backlit mirror, fixed glass panel | `M_Mirror`, `M_Glass` |
| Collection `Lighting` | Cove, niche, mirror and under-vanity LED (area lights + `M_LED_Warm` strips), 3 downlights | warm |

Commodes sit at x = 0.20 m, on the ledge face (client OK). Ceiling 2.80 m (client OK).
Metal fixtures are `M_Metal_MatteBlack` (Kohler Matte Black, `-BL`): the one finish that reads
on both the beige and the grey tiles. Vanity top is a dark taupe stone so the white basin pops.

## Variants (`inhabit_variants.py` text block)

Run it in Blender's Text Editor, then `apply("Warm"|"Daylight", "Beige"|"Grey")`. Unreal's
Variant Sets must reproduce the same states:

| State | What changes |
| --- | --- |
| `lighting` Warm | ~2700 K, cove-led and dim, downlights low, daylight panel off. Moody |
| `lighting` Daylight | ~5000 K, coves up, downlights 45 W, ceiling fill panel on. Bright, soft |
| `walltile` Beige / Grey | `M_WallTile_*` and `M_WallFluted_*` on all walls and the ledge |

## Props (collection `Props`)

Towel bar with draped bath towel, hook with hand towel, rolled towels, vase with olive branches,
amber pump bottles (ledge, vanity, shower niche), soap, candle, toilet-roll holder, shower mixer
plate, linear drain, bath mat. Simple placeholders sized to real objects; not Kohler.

## Camera

`Camera` is the TV view: centred on the room, behind the south wall (that wall is hidden from the
camera only), 21 mm, eye height 1.45 m. Cycles, 384 samples, OptiX denoise, AgX Medium High
Contrast, exposure -1.9. Renders in `renders/`.

Textures (`textures/`, 2048 px, seamless, 1 UV unit = 1.2 m) are generated in-house, no licences.
`_D` colour (sRGB), `_N` normal (OpenGL: tick **Flip Green Channel** when importing to Unreal),
`_R` roughness. The FBX doesn't carry the shader setup; build the Unreal materials from these maps.

## Where the models come from

Kohler CAD library (`https://techcomm.kohler.com/techcomm/cad/<model>.obj`), downloaded to
`E:\Projects\Inhabit\3d files\Kohler\<item>\<A|B>_K-<model>\` with the .3ds, .skp and 2D
.dwg/.dxf drawings. They stay outside git (Kohler's files, 126 MB).
The OBJs are in inches with mixed axes. To re-import one: File > Import > Wavefront OBJ with
Forward Y, Up Z, scale 0.0254, then rotate X 90° for K-6300 and K-20704, and X 90° then Z -90°
for K-14404-4A. All the others need no rotation. Then set the pivot as below.

## Conventions

- 1 unit = 1 m, Z up. Each fixture's back is at local +Y and its front faces -Y.
- Pivot at the real mounting point: back-face centre for wall items, base centre for deck items.
- Materials: `M_Chrome` (metal 1.0, roughness 0.08), `M_Ceramic_White` (roughness 0.15).

## Still to do

- [x] Restyle after the client's two references: veined marble walls and polished marble floor (in-house textures), walnut slat feature wall over the lit niche (`SM_SlatWall`), corner glass enclosure with hinged door and return panel, grey lacquer vanity with white top, round backlit mirror, black ladder towel warmer, grey shag rug, six recessed downlights
- [x] Resting props checked against what they sit on (all within 1 mm); towel rolls settled so they touch each other and the ledge; toilet roll is a tube with a cardboard core hanging on the holder arm
- [x] Phone card pictures: `tablet/assets/thumb-<item>-<A|B>.png`, Cycles studio renders of each fixture (default finish, transparent background); re-render if a model changes
- [x] Realism pass: wall tiles regenerated (fine limestone grain, per-tile tone, 2.5 mm grout a shade darker, satin face, matte joints); south wall texture mapping fixed after the door cut; 300 mm bar pulls on the vanity (follow the tap finish); recessed downlights with trim ring and baffle
- [x] Textiles: hanging bath and hand towels are Blender cloth simulations (over the bar; from the hook), baked to mesh; rolled towels are true spirals; ribbed charcoal bath mat. Sage green towels with a cream band. Fabric relief from in-house `T_Terry_*` and `T_MatRib_*` textures (1 UV = 10 cm)
- [x] Shower screen: the glass panel has a slim matte black frame (`SM_Shower_Channel_*`, `SM_Shower_Frame_*`) and a ceiling support rod (`SM_Shower_Post`); they follow the shower finish in Unreal. Glass is faintly green-tinted
- [x] Door on the south wall: 800 x 2100 mm walnut flush door, walnut frame and architrave, matte black lever (`SM_Door_*`), hidden from the Blender still camera like the wall
- [ ] Vanity drawer split and handles; shower mixer valve and drain
