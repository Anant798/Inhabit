# Builds /Game/Maps/Bathroom from the Blender export: textures, materials, meshes, lights,
# TV camera, Variant Sets (tap, commode, washbasin, showerhead, walltile, lighting) and the
# command-bus listener. Re-run it whenever the .blend changes; it replaces /Game/Inhabit and the map.
#   UnrealEditor.exe Inhabit.uproject -ExecutePythonScript=<abs path>/Scripts/build_level.py
# (full editor, it quits when done: the -run=pythonscript commandlet crashes in UE 5.7.4's FBX
# importer, and its legacy importer drops the towels as "degenerate".)
# Inputs: ../blender/export/room_shell.fbx (export it from room_shell.blend, see blender/README.md)
#         ../blender/textures/*.jpg
import math
import os
import unreal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FBX = os.path.join(ROOT, "blender", "export", "room_shell.fbx")
TEX_DIR = os.path.join(ROOT, "blender", "textures")
G = "/Game/Inhabit"
MAP = "/Game/Maps/Bathroom"
EXPOSURE = -11.6  # manual exposure compensation (EV), same for both lighting states so Warm reads dimmer than Daylight

EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
VML = unreal.VariantManagerLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

unreal.EditorLoadingAndSavingUtils.new_blank_map(False)  # the old map may be open; unload it before deleting
for p in (G, MAP):
    if EAL.does_directory_exist(p) or EAL.does_asset_exist(p):
        EAL.delete_directory(p) if EAL.does_directory_exist(p) else EAL.delete_asset(p)


def ue(x, y, z):
    """Blender metres (Z up, right-handed) -> Unreal cm (Y flipped)."""
    return unreal.Vector(x * 100, -y * 100, z * 100)


# ---------------------------------------------------------------- textures
def import_file(path, dest, options=None, factory=None):
    t = unreal.AssetImportTask()
    t.filename, t.destination_path = path, dest
    t.automated, t.save, t.replace_existing = True, True, True
    if options:
        t.options = options
    if factory:
        t.factory = factory
    tools.import_asset_tasks([t])
    return [unreal.load_asset(p) for p in t.imported_object_paths]


TEX = {}
for f in sorted(os.listdir(TEX_DIR)):
    tex = import_file(os.path.join(TEX_DIR, f), G + "/Textures", factory=unreal.TextureFactory())[0]
    name = os.path.splitext(f)[0]
    if name.endswith("_N"):  # OpenGL normal maps from Blender
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        tex.set_editor_property("srgb", False)
        tex.set_editor_property("flip_green_channel", True)
    elif name.endswith("_R"):
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
        tex.set_editor_property("srgb", False)
    EAL.save_loaded_asset(tex)
    TEX[name] = tex


# ---------------------------------------------------------------- master materials
def new_material(name):
    return tools.create_asset(name, G + "/Materials", unreal.Material, unreal.MaterialFactoryNew())


def expr(mat, cls, x, y, **props):
    e = MEL.create_material_expression(mat, cls, x, y)
    for k, v in props.items():
        e.set_editor_property(k, v)
    return e


def scalar(mat, name, value, x, y):
    return expr(mat, unreal.MaterialExpressionScalarParameter, x, y, parameter_name=name, default_value=value)


def vector(mat, name, value, x, y):
    return expr(mat, unreal.MaterialExpressionVectorParameter, x, y, parameter_name=name, default_value=value)


def texparam(mat, name, tex, sampler, x, y):
    return expr(mat, unreal.MaterialExpressionTextureSampleParameter2D, x, y,
                parameter_name=name, texture=tex, sampler_type=sampler)


def lerp(mat, a, a_out, b, b_out, alpha, x, y):
    l = expr(mat, unreal.MaterialExpressionLinearInterpolate, x, y)
    MEL.connect_material_expressions(a, a_out, l, "A")
    MEL.connect_material_expressions(b, b_out, l, "B")
    MEL.connect_material_expressions(alpha, "", l, "Alpha")
    return l


def mul(mat, a, a_out, b, b_out, x, y):
    m = expr(mat, unreal.MaterialExpressionMultiply, x, y)
    MEL.connect_material_expressions(a, a_out, m, "A")
    MEL.connect_material_expressions(b, b_out, m, "B")
    return m


# Opaque master. Each map has a Use* switch (0/1 lerp) so untextured materials share it.
M = new_material("M_Inhabit")
S = unreal.MaterialSamplerType
tint = vector(M, "Tint", unreal.LinearColor(1, 1, 1, 1), -900, -300)
base = texparam(M, "BaseTex", TEX["T_Plaster_D"], S.SAMPLERTYPE_COLOR, -900, -150)
use_base = scalar(M, "UseBaseTex", 0, -900, 50)
base_col = lerp(M, tint, "", mul(M, base, "RGB", tint, "", -600, -150), "", use_base, -350, -250)
MEL.connect_material_property(base_col, "", unreal.MaterialProperty.MP_BASE_COLOR)

rough = texparam(M, "RoughTex", TEX["T_WallTile_R"], S.SAMPLERTYPE_MASKS, -900, 150)
rough_c = scalar(M, "Roughness", 0.5, -900, 350)
use_rough = scalar(M, "UseRoughTex", 0, -900, 450)
MEL.connect_material_property(lerp(M, rough_c, "", rough, "R", use_rough, -350, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)

# Metallic: a number, or (UseMetalTex=1) the roughness texture's green channel, for gold mosaic chips.
use_metal = scalar(M, "UseMetalTex", 0, -900, 500)
MEL.connect_material_property(lerp(M, scalar(M, "Metallic", 0, -600, 400), "", rough, "G", use_metal, -350, 400), "",
                              unreal.MaterialProperty.MP_METALLIC)

nrm = texparam(M, "NormalTex", TEX["T_WallTile_N"], S.SAMPLERTYPE_NORMAL, -900, 600)
flat = expr(M, unreal.MaterialExpressionConstant3Vector, -900, 800, constant=unreal.LinearColor(0, 0, 1, 1))
use_nrm = scalar(M, "UseNormalTex", 0, -900, 900)
MEL.connect_material_property(lerp(M, flat, "", nrm, "RGB", use_nrm, -350, 650), "", unreal.MaterialProperty.MP_NORMAL)

emis = scalar(M, "Emissive", 0, -600, 1000)
MEL.connect_material_property(mul(M, base_col, "", emis, "", -350, 1000), "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
MEL.recompile_material(M)
EAL.save_loaded_asset(M)

# Translucent master for the shower glass and the amber bottles.
MG = new_material("M_Inhabit_Glass")
MG.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
MG.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
MEL.connect_material_property(vector(MG, "Tint", unreal.LinearColor(0.95, 0.98, 0.97, 1), -400, -100), "", unreal.MaterialProperty.MP_BASE_COLOR)
# Glass shows itself at glancing angles (Fresnel), like a real screen: faint face-on, brighter edge-on.
fres = expr(MG, unreal.MaterialExpressionFresnel, -700, 150, exponent=3.0)
MEL.connect_material_property(lerp(MG, scalar(MG, "Opacity", 0.12, -700, 50), "", scalar(MG, "EdgeOpacity", 0.6, -700, 250), "",
                                   fres, -400, 100), "", unreal.MaterialProperty.MP_OPACITY)
MEL.connect_material_property(scalar(MG, "Roughness", 0.02, -400, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
MEL.connect_material_property(expr(MG, unreal.MaterialExpressionConstant, -400, 300, r=1.0), "", unreal.MaterialProperty.MP_SPECULAR)
MEL.recompile_material(MG)
EAL.save_loaded_asset(MG)


# ---------------------------------------------------------------- material instances
# Values copied from the Blender materials (linear colours).
WARM, DAY = (1.0, 0.78, 0.56), (1.0, 0.97, 0.94)
MATS = {
    # name: (parent, {scalars}, {textures}, tint)
    "M_FloorStone": (M, dict(UseBaseTex=1, UseRoughTex=1, UseNormalTex=1), dict(BaseTex="T_FloorStone_D", RoughTex="T_FloorStone_R", NormalTex="T_FloorStone_N"), None),
    "M_Plaster": (M, dict(UseBaseTex=1, Roughness=0.9), dict(BaseTex="T_Plaster_D"), None),
    "M_Walnut": (M, dict(UseBaseTex=1, UseNormalTex=1, Roughness=0.5), dict(BaseTex="T_Walnut_D", NormalTex="T_Walnut_N"), None),
    "M_CounterStone": (M, dict(UseBaseTex=1, Roughness=0.4), dict(BaseTex="T_CounterStone_D"), None),
    "M_Ceramic_White": (M, dict(Roughness=0.15), {}, (0.92, 0.92, 0.90)),
    "M_Ceramic_Dark": (M, dict(Roughness=0.55), {}, (0.06, 0.05, 0.045)),
    "M_Metal_MatteBlack": (M, dict(Roughness=0.42, Metallic=0.6), {}, (0.018, 0.018, 0.018)),
    "M_Mirror": (M, dict(Roughness=0.02, Metallic=1), {}, (0.9, 0.9, 0.9)),
    "M_Label": (M, dict(Roughness=0.6), {}, (0.85, 0.82, 0.75)),
    "M_Leaf_Olive": (M, dict(Roughness=0.55), {}, (0.10, 0.14, 0.06)),
    "M_Stem": (M, dict(Roughness=0.7), {}, (0.12, 0.09, 0.06)),
    "M_Oak": (M, dict(Roughness=0.55), {}, (0.5, 0.36, 0.22)),
    "M_Paper": (M, dict(Roughness=0.9), {}, (0.92, 0.92, 0.90)),
    "M_Plastic_Black": (M, dict(Roughness=0.35), {}, (0.02, 0.02, 0.02)),
    "M_Soap": (M, dict(Roughness=0.4), {}, (0.8, 0.74, 0.62)),
    # Textiles: terry-loop texture (T_Terry_*, 1 UV = 10 cm) tinted per item. Sage green towels and a
    # charcoal mat, so the soft things stand out from the beige stone instead of blending into it.
    "M_Towel": (M, dict(UseBaseTex=1, UseNormalTex=1, Roughness=1.0), dict(BaseTex="T_Terry_D", NormalTex="T_Terry_N"), (0.30, 0.40, 0.27)),
    "M_Towel_Band": (M, dict(UseBaseTex=1, UseNormalTex=0.6, Roughness=0.9), dict(BaseTex="T_Terry_D", NormalTex="T_Terry_N"), (0.85, 0.78, 0.64)),
    "M_Towel_White": (M, dict(Roughness=0.95), {}, (0.82, 0.80, 0.76)),
    "M_BathMat": (M, dict(UseBaseTex=1, UseNormalTex=1, Roughness=1.0), dict(BaseTex="T_Terry_D", NormalTex="T_Terry_N"), (0.30, 0.29, 0.28)),  # grey shag rug
    "M_LED_Warm": (M, dict(Emissive=40, Roughness=1), {}, WARM),
    "M_LED_Day": (M, dict(Emissive=40, Roughness=1), {}, DAY),
    "M_LED_Off": (M, dict(Roughness=0.35), {}, (0.70, 0.70, 0.70)),  # a downlight's diffuser when it's off
    # Restyle (client references): walnut slat wall, grey lacquer vanity, white top, grey shag rug.
    "M_Slat": (M, dict(UseBaseTex=1, UseNormalTex=0.6, Roughness=0.55), dict(BaseTex="T_Walnut_D", NormalTex="T_Walnut_N"), (1.7, 1.3, 0.95)),
    "M_SlatBacking": (M, dict(Roughness=0.9), {}, (0.02, 0.02, 0.02)),
    "M_Lacquer_Grey": (M, dict(Roughness=0.45), {}, (0.075, 0.075, 0.08)),
    "M_Counter_White": (M, dict(Roughness=0.22), {}, (0.86, 0.85, 0.83)),
    "M_Glass": (MG, dict(Opacity=0.22, EdgeOpacity=0.65, Roughness=0.02), {}, (0.80, 0.92, 0.88)),  # faint green, like real glass
    "M_Glass_Amber": (MG, dict(Opacity=0.7, Roughness=0.05), {}, (0.55, 0.22, 0.04)),
}
for c in ("Beige", "Grey", "Calacatta", "Emerald"):
    # UseNormalTex < 1 flattens the relief: at 1 the cove's grazing light makes the tiles look rocky.
    MATS["M_WallTile_" + c] = (M, dict(UseBaseTex=1, UseRoughTex=1, UseNormalTex=0.4), dict(BaseTex=f"T_WallTile_{c}_D", RoughTex="T_WallTile_R", NormalTex="T_WallTile_N"), None)
    if f"T_WallFluted_{c}_D" in TEX:  # fluted tiles only come in beige and grey (no longer on the walls)
        MATS["M_WallFluted_" + c] = (M, dict(UseBaseTex=1, UseRoughTex=1, UseNormalTex=1), dict(BaseTex=f"T_WallFluted_{c}_D", RoughTex="T_WallTile_R", NormalTex="T_WallFluted_N"), None)

# Finish options (control-server catalogue.json): Kohler metals for taps and shower trim, Kohler
# ceramic colours for the commode and basin. Linear colours, eyeballed from Kohler's swatches.
FINISHES = {
    "tapfinish": "Metal", "showerheadfinish": "Metal", "screenfinish": "Metal",
    "commodefinish": "Ceramic", "washbasinfinish": "Ceramic",
}
FINISH_VALUES = {"Metal": ["Black", "Chrome", "Brass", "Bronze"], "Ceramic": ["White", "Biscuit", "Dune", "Black"]}
MATS.update({
    "M_Metal_Black": (M, dict(Roughness=0.42, Metallic=0.6), {}, (0.018, 0.018, 0.018)),
    "M_Metal_Chrome": (M, dict(Roughness=0.06, Metallic=1), {}, (0.92, 0.92, 0.92)),
    "M_Metal_Brass": (M, dict(Roughness=0.32, Metallic=1), {}, (0.80, 0.60, 0.33)),
    "M_Metal_Bronze": (M, dict(Roughness=0.38, Metallic=1), {}, (0.36, 0.23, 0.14)),
    "M_Ceramic_White": (M, dict(Roughness=0.15), {}, (0.92, 0.92, 0.90)),
    "M_Ceramic_Biscuit": (M, dict(Roughness=0.15), {}, (0.81, 0.72, 0.55)),
    "M_Ceramic_Dune": (M, dict(Roughness=0.15), {}, (0.58, 0.48, 0.33)),
    "M_Ceramic_Black": (M, dict(Roughness=0.12), {}, (0.02, 0.02, 0.02)),
})

# Black tiles with a gold mosaic: metallic gold chips (G of its roughness map), glossy black chips.
MATS["M_WallTile_BlackGold"] = (M, dict(UseBaseTex=1, UseRoughTex=1, UseNormalTex=1, UseMetalTex=1),
                                dict(BaseTex="T_WallTile_BlackGold_D", RoughTex="T_WallTile_BlackGold_R", NormalTex="T_WallTile_BlackGold_N"), None)
MI = {}
for name, (parent, scalars, texs, col) in MATS.items():
    mi = tools.create_asset("MI" + name[1:], G + "/Materials", unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, parent)
    for k, v in scalars.items():
        MEL.set_material_instance_scalar_parameter_value(mi, k, v)
    for k, v in texs.items():
        MEL.set_material_instance_texture_parameter_value(mi, k, TEX[v])
    if col:
        MEL.set_material_instance_vector_parameter_value(mi, "Tint", unreal.LinearColor(*col, 1))
    EAL.save_loaded_asset(mi)
    MI[name] = mi


# ---------------------------------------------------------------- meshes
ui = unreal.FbxImportUI()
ui.import_materials = ui.import_textures = ui.import_as_skeletal = False
ui.static_mesh_import_data.combine_meshes = False
ui.static_mesh_import_data.generate_lightmap_u_vs = False
ui.static_mesh_import_data.auto_generate_collision = False
MESH = {}
for sm in import_file(FBX, G + "/Meshes", ui):
    if not isinstance(sm, unreal.StaticMesh):
        continue
    name = sm.get_name().replace("room_shell_", "")
    for i, slot in enumerate(sm.static_materials):
        sm.set_material(i, MI[str(slot.material_slot_name)])
    EAL.save_loaded_asset(sm)
    MESH[name] = sm
assert "SM_Towel_Bath" in MESH and "SM_Showerhead_B" in MESH, sorted(MESH)


# ---------------------------------------------------------------- level
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
les.new_level(MAP)


def spawn(cls, loc=unreal.Vector(0, 0, 0), rot=unreal.Rotator(0, 0, 0), label=None):
    a = eas.spawn_actor_from_class(cls, loc, rot)
    if label:
        a.set_actor_label(label)
    return a


ACT = {}
for name, sm in MESH.items():
    a = spawn(unreal.StaticMeshActor, label=name)  # vertices are baked in world space, so all sit at the origin
    c = a.static_mesh_component
    c.set_static_mesh(sm)
    c.set_mobility(unreal.ComponentMobility.MOVABLE)  # variants toggle visibility; floor-plan moves place it
    a.set_editor_property("tags", [unreal.Name(name)])  # CommandBusClient finds it by this (labels are editor-only)
    ACT[name] = a



# ---------------------------------------------------------------- lights (from room_shell.blend, Lighting collection)
# Blender watts -> lumens at 683 lm/W; only the ratios matter, exposure is fixed in the post-process volume.
LM_PER_W = 683
DOWN = unreal.Rotator(roll=0, pitch=-90, yaw=0)
RECTS = {  # name: (x, y, z, size_x, size_y, rotator)
    "L_Cove_North": (1.524, 2.378, 2.935, 3.048, 0.03, DOWN),
    "L_Cove_South": (1.524, 0.06, 2.935, 3.048, 0.03, DOWN),
    "L_Cove_West": (0.06, 1.219, 2.935, 0.03, 2.438, DOWN),
    "L_Cove_East": (2.988, 1.219, 2.935, 0.03, 2.438, DOWN),
    "L_Niche_Shower": (2.325, 2.498, 1.34, 1.0, 0.08, DOWN),
    "L_Niche_West": (-0.075, 1.6, 1.39, 0.12, 1.25, DOWN),
    "L_Vanity_Under": (2.56, 1.05, 0.29, 0.06, 0.95, DOWN),
    "L_Daylight_Fill": (1.524, 1.219, 2.795, 2.6, 2.0, DOWN),
    "L_Slat_Wash": (0.05, 1.60, 1.42, 0.03, 1.30, unreal.Rotator(roll=0, pitch=90, yaw=0)),  # grazes up the slats
}
SPOTS = {"L_Down_Vanity": (2.70, 1.05), "L_Down_Shower": (2.30, 1.95), "L_Down_Centre": (1.00, 1.00),
         "L_Down_WC": (0.55, 1.85), "L_Down_Door": (1.55, 0.40), "L_Down_Warmer": (2.70, 0.32)}

# Per state watts (Blender inhabit_variants.py). Fill 200, not Blender's 350: Lumen's bounce is brighter than Cycles here.
NICHE = {"L_Niche_Shower": 21.6, "L_Niche_West": 25.2}
EVENING, NIGHT = (1.0, 0.72, 0.48), (1.0, 0.62, 0.38)
STATES = {  # watts per group; downlights on in every mood (client). Daylight kept below white-out on the white marble;
            # Evening/Night bright enough for the dark tiles (emerald, black and gold)
    "Warm": dict(color=WARM, cove=80, niche=1.0, under=10, mirror=60, down=22, fill=0, slat=30),
    "Daylight": dict(color=DAY, cove=60, niche=0.6, under=6, mirror=40, down=24, fill=50, slat=20),
    "Evening": dict(color=EVENING, cove=40, niche=1.2, under=14, mirror=45, down=15, fill=0, slat=40),
    "Night": dict(color=NIGHT, cove=20, niche=0.6, under=16, mirror=25, down=8, fill=0, slat=10),
}


def watts(name, s):
    if name.startswith("L_Cove"):
        return s["cove"] * (0.8 if name.endswith(("West", "East")) else 1)
    if name in NICHE:
        return NICHE[name] * s["niche"]
    if name == "L_Vanity_Under":
        return s["under"]
    if name == "L_Slat_Wash":
        return s["slat"]
    if name.startswith("L_Mirror_Back"):
        return s["mirror"] / MIRROR_RING
    if name == "L_Daylight_Fill":
        return s["fill"]
    return s["down"]


def srgb(c):  # light colour is an sRGB FColor; Blender gives linear
    f = lambda v: 1.055 * v ** (1 / 2.4) - 0.055 if v > 0.0031308 else 12.92 * v
    return unreal.Color(r=round(f(c[0]) * 255), g=round(f(c[1]) * 255), b=round(f(c[2]) * 255), a=255)


LIGHTS = {}
for name, (x, y, z, sx, sy, rot) in RECTS.items():
    a = spawn(unreal.RectLight, ue(x, y, z), rot, name)
    lc = a.rect_light_component
    # Down-facing: local Y = world Y, local Z = world X. Mirror light: Y = world Y, Z = up.
    lc.set_editor_property("source_width", sy * 100)
    lc.set_editor_property("source_height", sx * 100)
    lc.set_editor_property("barn_door_angle", 88)
    LIGHTS[name] = a
# Round backlit mirror: a ring of 8 small sources just inside its rim, in the 20 mm gap to the wall
# (like the LED strip on a real one), so the halo on the wall is a circle.
MIRROR_RING = 8
for k in range(MIRROR_RING):
    t = 2 * math.pi * k / MIRROR_RING
    a = spawn(unreal.PointLight, ue(3.040, 1.05 + 0.36 * math.cos(t), 1.70 + 0.36 * math.sin(t)), unreal.Rotator(0, 0, 0), f"L_Mirror_Back_{k}")
    a.point_light_component.set_editor_property("source_radius", 2)
    a.point_light_component.set_editor_property("cast_shadows", False)  # hidden behind the mirror; 8 shadowed lights overflow VSM
    LIGHTS[f"L_Mirror_Back_{k}"] = a
for name, (x, y) in SPOTS.items():
    a = spawn(unreal.SpotLight, ue(x, y, 2.79), DOWN, name)
    lc = a.spot_light_component
    lc.set_editor_property("outer_cone_angle", 35)  # Blender spot size 70 deg, blend 0.6
    lc.set_editor_property("inner_cone_angle", 14)
    lc.set_editor_property("source_radius", 3)
    LIGHTS[name] = a
for a in LIGHTS.values():
    lc = a.light_component
    lc.set_mobility(unreal.ComponentMobility.MOVABLE)
    lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS)
    lc.set_editor_property("attenuation_radius", 800)


def apply_lighting(state):
    s = STATES[state]
    for name, a in LIGHTS.items():
        lc = a.light_component
        lc.set_intensity(watts(name, s) * LM_PER_W)
        lc.set_light_color(unreal.LinearColor(*s["color"], 1))
    led = MI["M_LED_Day" if state == "Daylight" else "M_LED_Warm"]
    lens = led if s["down"] > 0 else MI["M_LED_Off"]
    for n in ACT:
        if n.startswith("SM_LED_"):
            ACT[n].static_mesh_component.set_material(0, led)
        elif n.startswith("SM_Downlight_"):
            ACT[n].static_mesh_component.set_material(0, lens)


# ---------------------------------------------------------------- camera, exposure
# Between the door and the middle of the room, eye height, looking diagonally across to the shower:
# ledge, shower and vanity in one view; the commode and the door a short turn away. It stays here and
# only turns and tilts (tablet sliders, or dragging on the /tv page -> CommandBus).
# (Blender's Camera is the straight-on still view from behind the south wall, used for the renders.)
cam = spawn(unreal.CameraActor, ue(1.05, 0.70, 1.50), unreal.Rotator(roll=0, pitch=-12, yaw=-66), "Camera_TV")
cc = cam.camera_component
cc.set_editor_property("field_of_view", 100)  # wide, as the room is small; about 15 mm on full frame
cc.set_editor_property("constrain_aspect_ratio", False)
cam.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)

ppv = spawn(unreal.PostProcessVolume, label="PostProcess")
ppv.set_editor_property("unbound", True)
pp = ppv.settings
for k, v in dict(auto_exposure_method=unreal.AutoExposureMethod.AEM_MANUAL,
                 auto_exposure_apply_physical_camera_exposure=False,
                 auto_exposure_bias=EXPOSURE,
                 vignette_intensity=0.25, bloom_intensity=0.4,
                 lumen_final_gather_quality=2.0, lumen_reflection_quality=2.0,
                 lumen_scene_lighting_quality=2.0,
                 lumen_front_layer_translucency_reflections=True,  # shower glass reflects the room
                 # Camera-like finish: white balance part-way to the warm lamps (warm, not yellow), a
                 # touch more contrast, a little less saturation, faint film grain.
                 white_temp=5800.0,
                 color_contrast=unreal.Vector4(1.06, 1.06, 1.06, 1.0),
                 color_saturation=unreal.Vector4(0.92, 0.92, 0.92, 1.0),
                 film_grain_intensity=0.08).items():
    pp.set_editor_property("override_" + k, True)
    pp.set_editor_property(k, v)
ppv.set_editor_property("settings", pp)

# The mirror (east wall, faces west) gets a planar reflection: a true mirror image, where Lumen's
# traced reflection smeared and doubled the shower head. Fade distances keep it off the wall 2 cm behind.
mirror = spawn(unreal.PlanarReflection, ue(3.008, 1.05, 1.70), unreal.Rotator(roll=0, pitch=90, yaw=0), "MirrorReflection")
mirror.set_actor_scale3d(unreal.Vector(0.9, 0.9, 1))
prc = mirror.get_component_by_class(unreal.PlanarReflectionComponent)
prc.set_editor_property("distance_from_plane_fadeout_start", 0.5)
prc.set_editor_property("distance_from_plane_fadeout_end", 1.5)
prc.set_editor_property("normal_distortion_strength", 0)
prc.set_editor_property("screen_percentage", 100)  # default 50 renders the mirror image soft

spawn(unreal.CommandBusActor, label="CommandBus")  # finds the Variant Sets actor by itself


# ---------------------------------------------------------------- variant sets
def prop(actor, suffix):
    hits = [p for p in VML.get_capturable_properties(actor) if p.endswith(suffix)]
    assert hits, (actor.get_actor_label(), suffix)
    return hits[0]


def material_prop(actor):
    props = VML.get_capturable_properties(actor)
    hits = [p for p in props if "Material" in p and "Overlay" not in p and "Cache" not in p]
    assert hits, props
    return hits[0]


lvs = VML.create_level_variant_sets_asset("LVS_Bathroom", G)
VML.create_level_variant_sets_actor(lvs)


def variant_set(name, values, setup, actors):
    """setup(value) puts the level in that state; then every actor's props are captured into it."""
    vs = unreal.VariantSet()
    vs.set_display_text(name)
    VML.add_variant_set(lvs, vs)
    for value in values:
        var = unreal.Variant()
        var.set_display_text(value)
        VML.add_variant(vs, var)
        setup(value)
        for actor, paths in actors:
            VML.add_actor_binding(var, actor)
            for p in paths:
                VML.capture_property(var, actor, p)
    setup(values[0])  # leave the level in the default state


# Each option shows its own meshes. Showerhead B hangs from its own, lower arm (heads at ~1.75 m).
# Option C: Kohler Brazn K-21748, Vox K-2660-1, 10" rainhead K-13689-G on its K-10124 wall arm.
MODELS = {
    "tap": {"A": ["SM_Tap_A"], "B": ["SM_Tap_B"], "C": ["SM_Tap_C"], "D": ["SM_Tap_D"]},
    "commode": {"A": ["SM_Commode_A"], "B": ["SM_Commode_B"], "C": ["SM_Commode_C"]},
    "washbasin": {"A": ["SM_Washbasin_A"], "B": ["SM_Washbasin_B"], "C": ["SM_Washbasin_C"]},
    "showerhead": {"A": ["SM_Showerhead_A", "SM_ShowerArm_A"], "B": ["SM_Showerhead_B", "SM_ShowerArm_B"],
                   "C": ["SM_Showerhead_C", "SM_ShowerArm_C"]},
}
for cat, options in MODELS.items():
    acts = [(ACT[n], opt) for opt, names in options.items() for n in names]

    def setup(v, acts=acts):
        for actor, opt in acts:
            actor.static_mesh_component.set_visibility(v == opt)

    variant_set(cat, list(options), setup, [(actor, [prop(actor, "/ Visible")]) for actor, _ in acts])

# Finish of each piece: swaps the material on both models (and the shower's arm, mixer and drain).
FINISH_MESHES = {
    "tapfinish": ["SM_Tap_A", "SM_Tap_B", "SM_Tap_C", "SM_Tap_D", "SM_Vanity_Pull_0", "SM_Vanity_Pull_1"],  # pulls match the tap
    "showerheadfinish": ["SM_Showerhead_A", "SM_Showerhead_B", "SM_Showerhead_C", "SM_ShowerArm_A", "SM_ShowerArm_B",
                         "SM_ShowerArm_C", "SM_ShowerMixer_Plate", "SM_ShowerMixer_Lever", "SM_Shower_Drain"],
    # The shower screen's frame is chosen on its own (client: not tied to the shower fittings).
    "screenfinish": ["SM_Shower_Channel_Wall", "SM_Shower_Channel_Floor", "SM_Shower_Post",
                     "SM_Shower_Frame_Top", "SM_Shower_Frame_Edge", "SM_Shower_Frame_Door", "SM_Shower_Frame_Return",
                     "SM_Shower_Frame_Pull"],
    "commodefinish": ["SM_Commode_A", "SM_Commode_B", "SM_Commode_C"],
    "washbasinfinish": ["SM_Washbasin_A", "SM_Washbasin_B", "SM_Washbasin_C"],
}
for cat, names in FINISH_MESHES.items():
    kind = FINISHES[cat]
    acts = [ACT[n] for n in names]

    def setup(v, acts=acts, kind=kind):
        for actor in acts:
            actor.static_mesh_component.set_material(0, MI[f"M_{kind}_{v}"])

    variant_set(cat, FINISH_VALUES[kind], setup, [(actor, [material_prop(actor)]) for actor in acts])

WALLS = {"SM_Room_Wall_South": "M_WallTile_", "SM_Room_Wall_North": "M_WallTile_", "SM_Room_Wall_East": "M_WallTile_",
         "SM_Room_Wall_West": "M_WallTile_", "SM_Room_Ledge": "M_WallTile_"}  # all marble now; the slats are the feature


def setup_tile(v):
    for n, m in WALLS.items():
        ACT[n].static_mesh_component.set_material(0, MI[m + v])


setup_tile("Beige")
variant_set("walltile", ["Beige", "Grey", "Calacatta", "Emerald", "BlackGold"], setup_tile, [(ACT[n], [material_prop(ACT[n])]) for n in WALLS])

apply_lighting("Warm")
leds = [ACT[n] for n in ACT if n.startswith(("SM_LED_", "SM_Downlight_"))]
variant_set("lighting", list(STATES), apply_lighting,
            [(a, [prop(a, "/ Intensity"), prop(a, "/ Light Color")]) for a in LIGHTS.values()]
            + [(a, [material_prop(a)]) for a in leds])

les.save_current_level()
EAL.save_loaded_asset(lvs)
unreal.log("INHABIT_BUILD_OK meshes=%d lights=%d" % (len(MESH), len(LIGHTS)))
unreal.SystemLibrary.quit_editor()
