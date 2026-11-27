# Renders every fixture in every finish for the client variant sheet (docs/variant-sheet.html).
# blender -b room/room_shell.blend --python render_variants.py  ->  ../docs/variants/<item>-<model>-<finish>.png
# Finish colours are the Unreal ones (unreal/Scripts/build_level.py MATS), like the thumbnails' studio set-up.
import bpy, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(bpy.data.filepath), "..", "..", "docs", "variants")
os.makedirs(OUT, exist_ok=True)
METAL = {"Black": ((0.018,) * 3, 0.42, 0.6), "Chrome": ((0.92,) * 3, 0.06, 1), "Brass": ((0.80, 0.60, 0.33), 0.32, 1),
         "Bronze": ((0.36, 0.23, 0.14), 0.38, 1)}
CERAMIC = {"White": ((0.92, 0.92, 0.90), 0.15, 0), "Biscuit": ((0.81, 0.72, 0.55), 0.15, 0),
           "Dune": ((0.58, 0.48, 0.33), 0.15, 0), "Black": ((0.02,) * 3, 0.12, 0)}
ITEMS = {"tap": ("ABCD", METAL), "washbasin": ("ABC", CERAMIC), "commode": ("ABC", CERAMIC), "showerhead": ("ABC", METAL)}
VIEW = {"showerhead": (0.35, -1, -0.55)}  # front and a little below: shows the spray face

prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        break
    except TypeError:
        pass

O = bpy.data.objects
main = bpy.context.scene
sc = bpy.data.scenes.new("Variants")
sc.render.engine = "CYCLES"; sc.cycles.device = "GPU"; sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 480
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.view_settings.view_transform = main.view_settings.view_transform
w = bpy.data.worlds.new("VarWorld"); w.use_nodes = True
# Studio horizon. Metals need something to reflect, an even world turns chrome flat grey.
N = w.node_tree.nodes; L = w.node_tree.links
tc = N.new("ShaderNodeTexCoord"); xyz = N.new("ShaderNodeSeparateXYZ"); ramp = N.new("ShaderNodeValToRGB")
# Bright above and below with a dark band at the horizon: down-facing spray plates reflect light too.
E = ramp.color_ramp.elements
E[0].position = 0.30; E[0].color = (0.75, 0.73, 0.70, 1)
E[1].position = 0.62; E[1].color = (0.95, 0.93, 0.90, 1)
E.new(0.47).color = (0.04, 0.04, 0.045, 1)
mr = N.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -1  # normal Z -1..1 -> 0..1
L.new(tc.outputs["Generated"], xyz.inputs[0]); L.new(xyz.outputs["Z"], mr.inputs["Value"]); L.new(mr.outputs[0], ramp.inputs[0])
L.new(ramp.outputs[0], N["Background"].inputs[0]); N["Background"].inputs[1].default_value = 0.8
sc.world = w
cam = bpy.data.objects.new("VarCam", bpy.data.cameras.new("VarCam")); cam.data.lens = 50
key = bpy.data.objects.new("VarKey", bpy.data.lights.new("VarKey", "AREA")); key.data.energy = 90; key.data.size = 0.6
for ob in (cam, key):
    sc.collection.objects.link(ob)
sc.camera = cam


def material(name, col, rough, metal):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


done = 0
for item, (models, finishes) in ITEMS.items():
    for v in models:
        o = O[f"SM_{item.capitalize()}_{v}"]
        sc.collection.objects.link(o)
        was = (o.hide_render, o.hide_viewport, o.material_slots[0].material)
        o.hide_render = o.hide_viewport = False
        dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
        ws = [e.matrix_world @ p.co for p in m.vertices]; e.to_mesh_clear()
        mn = Vector([min(p[i] for p in ws) for i in range(3)]); mx = Vector([max(p[i] for p in ws) for i in range(3)])
        c = (mn + mx) / 2; r = (mx - mn).length / 2
        cam.location = c + Vector(VIEW.get(item, (0.35, -1, 0.45))).normalized() * (r / 0.36 * 1.15)
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        key.location = c + Vector((-0.4, -1, 0.3)).normalized() * (r * 4 + 0.3)
        key.rotation_euler = (c - key.location).to_track_quat("-Z", "Y").to_euler()
        for f, spec in finishes.items():
            o.material_slots[0].material = material(f"Var_{f}", *spec)  # slot 0, as Unreal swaps it
            sc.render.filepath = os.path.join(OUT, f"{item}-{v}-{f}.png")
            bpy.ops.render.render(write_still=True, scene=sc.name)
            done += 1
        o.material_slots[0].material = was[2]; o.hide_render, o.hide_viewport = was[:2]
        sc.collection.objects.unlink(o)
print(f"VARIANTS_OK {done}")  # the .blend is not saved: nothing here changes the room
