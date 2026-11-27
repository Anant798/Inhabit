# Exports the room for Unreal and for the 2D floor plan, from the same geometry, so they can't drift apart:
#   export/room_shell.fbx             -> unreal/Scripts/build_level.py
#   ../tablet/assets/plan.json        -> the PC display's "2D Floor Plan" (tablet/assets/plan.js)
# Run after any change to the room:  blender -b room/room_shell.blend --python export_room.py
# (or paste into Blender's Text Editor with the file open).
#
# plan.json: millimetres, origin at the room's inside south-west corner, x east, y north. Every footprint is
# the convex hull of the object's evaluated mesh (modifiers applied) seen from above: measured, not drawn.
import bpy, json, os, datetime
from mathutils import Vector

HERE = os.path.dirname(bpy.data.filepath)
FBX = os.path.abspath(os.path.join(HERE, "..", "export", "room_shell.fbx"))
PLAN = os.path.abspath(os.path.join(HERE, "..", "..", "tablet", "assets", "plan.json"))
O = bpy.data.objects

# What each object is on plan. Props (the bath mat too), the mirror, lights and the ceiling are left out:
# they aren't drawn on a floor plan.
GROUPS = [  # (id, label, kind, objects); kind: builtin | fixture | shower | glass | rug | above | wallitem
    ("ledge", "Ledge (WC carrier)", "builtin", ["SM_Room_Ledge"]),
    ("vanity", "Vanity", "builtin", ["SM_Vanity_Cabinet", "SM_Vanity_Counter", "SM_Vanity_Drawer_0", "SM_Vanity_Drawer_1",
                                      "SM_Vanity_Pull_0", "SM_Vanity_Pull_1"]),
    ("warmer", "Towel warmer", "wallitem", ["SM_TowelWarmer"]),
    ("towelbar", "Towel bar", "wallitem", ["SM_TowelBar", "SM_Towel_Bath", "SM_TowelBar_Post_0.18", "SM_TowelBar_Post_0.76"]),
    ("shower", "Shower", "shower", ["SM_Shower_Tray"]),
    ("drain", "Linear drain", "rug", ["SM_Shower_Drain"]),
    ("glass_fixed", "Fixed glass", "glass", ["SM_Shower_Glass"]),
    ("glass_return", "Return glass", "glass", ["SM_Shower_Glass_Return"]),
]
OPTIONS = {"commode": "ABC", "washbasin": "ABC", "tap": "ABCD", "showerhead": "ABC"}
# Moved with an item in the 3D room when it is moved on the plan, but not part of its footprint: what stands
# on it or hangs from it, and the shower glass's frame. Names that start with these prefixes.
CARRY = {
    "ledge": ["SM_TowelRoll_", "SM_Bottle_Ledge", "SM_Candle", "SM_Vase", "SM_Plant_", "SM_RollHolder_", "SM_ToiletRoll"],
    "vanity": ["SM_Bottle_Vanity", "SM_Soap_Vanity", "SM_Tray_Counter"],
    "towelbar": ["SM_TowelBar_Rose_"],
    "glass_fixed": ["SM_Shower_Channel_Wall", "SM_Shower_Channel_Floor", "SM_Shower_Frame_Edge", "SM_Shower_Frame_Top", "SM_Shower_Post"],
    "glass_return": ["SM_Shower_Frame_Return"],
}
DOOR_OBJECTS = {"Shower door": ["SM_Shower_Glass_Door", "SM_Shower_Frame_Door", "SM_Shower_Frame_Pull"]}  # the room door: plan only


def carried(gid):
    return sorted(o.name for o in O if o.type == 'MESH' and any(o.name.startswith(p) for p in CARRY.get(gid, [])))


def footprint(names):
    dg = bpy.context.evaluated_depsgraph_get()
    pts, zs = [], []
    for n in names:
        e = O[n].evaluated_get(dg); m = e.to_mesh()
        for v in m.vertices:
            p = e.matrix_world @ v.co; pts.append((p.x, p.y)); zs.append(p.z)
        e.to_mesh_clear()
    return hull(pts), [round(min(zs) * 1000), round(max(zs) * 1000)]


def hull(pts):  # Andrew's monotone chain, counter-clockwise, in mm
    pts = sorted(set((round(x * 1000), round(y * 1000)) for x, y in pts))
    if len(pts) < 3:
        return [list(p) for p in pts]
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return [list(p) for p in lo[:-1] + up[:-1]]


def box(name):
    ws = [O[name].matrix_world @ Vector(c) for c in O[name].bound_box]
    return [min(p[i] for p in ws) for i in range(3)], [max(p[i] for p in ws) for i in range(3)]


def mm(v):
    return round(v * 1000)


def door(leaf, handle, label):
    """Hinge on the jamb away from the handle; the leaf swings out to the side the handle is on (you pull it)."""
    (lx0, ly0, _), (lx1, ly1, _) = box(leaf)
    (hx0, hy0, _), (hx1, hy1, _) = box(handle)
    along_x = (lx1 - lx0) > (ly1 - ly0)
    perp = ((hy0 + hy1) - (ly0 + ly1)) if along_x else ((hx0 + hx1) - (lx0 + lx1))
    inward_sign = 1 if perp > 0 else -1
    if along_x:
        hinge_x = lx0 if (hx0 + hx1) / 2 > (lx0 + lx1) / 2 else lx1
        y = (ly0 + ly1) / 2; w = lx1 - lx0
        far = lx1 if hinge_x == lx0 else lx0
        hinge, closed, opened = [hinge_x, y], [far, y], [hinge_x, y + inward_sign * w]
    else:
        hinge_y = ly0 if (hy0 + hy1) / 2 > (ly0 + ly1) / 2 else ly1
        x = (lx0 + lx1) / 2; w = ly1 - ly0
        far = ly1 if hinge_y == ly0 else ly0
        hinge, closed, opened = [x, hinge_y], [x, far], [x + inward_sign * w, hinge_y]
    return {"label": label, "hinge": [mm(v) for v in hinge], "closed": [mm(v) for v in closed],
            "open": [mm(v) for v in opened], "width": mm(w), "objects": DOOR_OBJECTS.get(label, [])}


# Unhide everything: Blender doesn't update a hidden object's matrix (see README). Restored at the end.
objs = list(O)
state = {o.name: (o.hide_viewport, o.hide_render, o.hide_get()) for o in objs}
for o in objs:
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
bpy.context.view_layer.update()
try:
    os.makedirs(os.path.dirname(FBX), exist_ok=True)
    bpy.ops.export_scene.fbx(filepath=FBX, object_types={'MESH'}, apply_scale_options='FBX_SCALE_UNITS',
                             use_mesh_modifiers=True, mesh_smooth_type='FACE')

    (fx0, fy0, _), (fx1, fy1, _) = box("SM_Room_Floor")
    (_, _, _), (_, _, ceil) = box("SM_FalseCeiling")
    (_, wy0, _), (_, wy1, _) = box("SM_Room_Wall_South")
    jl, jr = box("SM_Door_Jamb_L"), box("SM_Door_Jamb_R")
    items = []
    for gid, label, kind, names in GROUPS:
        poly, z = footprint(names)
        items.append({"id": gid, "label": label, "kind": kind, "poly": poly, "z": z, "objects": names + carried(gid)})
    for cat, opts in OPTIONS.items():
        for v in opts:
            names = [f"SM_{cat.capitalize()}_{v}"]
            if cat == "showerhead":
                names.append(f"SM_ShowerArm_{v}")
            poly, z = footprint(names)
            # Wholly above the 1.2 m cut plane (shower heads): drawn dashed, not floor space.
            kind = "above" if z[0] > 1200 else "fixture"
            items.append({"id": f"{cat}-{v}", "category": cat, "option": v, "kind": kind, "poly": poly, "z": z, "objects": names})
    plan = {
        "source": "blender/room/room_shell.blend via blender/export_room.py",
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "room": {"w": mm(fx1 - fx0), "d": mm(fy1 - fy0), "wall": mm(wy1 - wy0), "ceiling": mm(ceil - 0.15)},
        "openings": [{"wall": "south", "from": mm(jl[1][0]), "to": mm(jr[0][0]), "label": "Door"}],
        "doors": [door("SM_Door_Leaf", "SM_Door_Lever", "Door"),  # lever on the room side: opens into the room
                  door("SM_Shower_Glass_Door", "SM_Shower_Frame_Pull", "Shower door")],  # pull outside: opens out
        "items": items,
    }
    with open(PLAN, "w", encoding="utf8", newline="\n") as f:
        json.dump(plan, f, separators=(",", ":"))
    print(f"EXPORT_OK fbx={FBX} plan={PLAN} items={len(items)}")
finally:
    for o in objs:
        hv, hr, hs = state[o.name]; o.hide_viewport = hv; o.hide_render = hr; o.hide_set(hs)
