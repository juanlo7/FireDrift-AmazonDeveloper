"""FireDrift butler: model, rig, animate and render with Blender (bpy).

Run headless, from the repo root:

    assets/blender/render.sh
    blender -b --factory-startup -P assets/blender/butler.py -- --still idle --out build/butler

The script builds the whole scene from code: a low-poly butler (rigid parts
bone-parented to one armature), the "lit case" backdrop, the lights and the
camera. Each clip of docs/contracts.md section 4 is a pose function of time.
Loops are periodic, so the first frame equals the frame after the last one.
Gestures start and end on the neutral pose of the loops.

Frames go to PNG; render.sh encodes them to H.264 MP4 with ffmpeg.
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

FPS = 30
WIDTH, HEIGHT = 540, 720  # 3:4, the CharacterSlot ratio (300 x 400 dp)

# App theme (app/src/theme): the lobby wall, warm white, stone, one amber.
PALETTE = {
    "wall": "#0d0c0b",
    "wall_lit": "#3b2a17",
    "coat": "#16130f",
    "lapel": "#2f2a24",
    "shirt": "#f6efe4",
    "glove": "#efe6d8",
    "skin": "#d9a57f",
    "nose": "#d99b7e",
    "hair": "#9a9187",
    "eye": "#141110",
    "mouth": "#3a1712",
    "amber": "#ffb547",
    "glow": "#ffd9a0",
}


def srgb(hex_code):
    """Hex sRGB to linear RGBA, the space Blender colours use."""
    h = hex_code.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


# ---------------------------------------------------------------- scene setup


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.eevee.taa_render_samples = 32
    # Standard keeps the theme hex values as they are (AgX would desaturate).
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = srgb(PALETTE["wall"])
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world
    return scene


def material(name, hex_code, rough=0.6, emit=0.0, sheen=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(hex_code)
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = srgb(hex_code)
        bsdf.inputs["Emission Strength"].default_value = emit
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    return mat


def finish(obj, mat, name, smooth=False):
    obj.name = name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    return obj


def ellipsoid(name, mat, loc, size, subdiv=2, smooth=False):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = size
    return finish(obj, mat, name, smooth)


def limb(name, mat, p0, p1, r0, r1, verts=8):
    """A tapered cylinder from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r0, radius2=r1, depth=axis.length, location=(p0 + p1) / 2
    )
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis.normalized())
    return finish(obj, mat, name)


def plate(name, mat, outline, y, depth):
    """A flat prism from a 2D outline in the x-z plane, front face at y."""
    mesh = bpy.data.meshes.new(name)
    n = len(outline)
    verts = [(x, y, z) for x, z in outline] + [(x, y + depth, z) for x, z in outline]
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, mat, name)
    # Faces from pydata can point inward; make the normals consistent.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


# ---------------------------------------------------------------- the butler

# Joint pivots. Every bone points along +Y with no roll, so its local axes are
# the world axes: +X rotation leans toward the camera, +Y tilts to screen right,
# +Z turns. The camera looks along +Y; the butler's left is +X.
JOINTS = {
    "root": ((0, 0, 0.0), None),
    "spine": ((0, 0, 0.95), "root"),
    "neck": ((0, 0, 1.62), "spine"),
    "head": ((0, 0, 1.80), "neck"),
    "brow.L": ((0.105, -0.27, 2.14), "head"),
    "brow.R": ((-0.105, -0.27, 2.14), "head"),
    "upperarm.L": ((0.47, 0.0, 1.50), "spine"),
    "upperarm.R": ((-0.47, 0.0, 1.50), "spine"),
    "forearm.L": ((0.53, 0.0, 1.10), "upperarm.L"),
    "forearm.R": ((-0.53, 0.0, 1.10), "upperarm.R"),
    "hand.L": ((0.55, -0.02, 0.74), "forearm.L"),
    "hand.R": ((-0.55, -0.02, 0.74), "forearm.R"),
}


def build_rig():
    data = bpy.data.armatures.new("ButlerRig")
    rig = bpy.data.objects.new("ButlerRig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, parent) in JOINTS.items():
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = (head[0], head[1] + 0.1, head[2])
        bone.roll = 0
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="POSE")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    rig.hide_render = True
    return rig


def attach(obj, rig, bone):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = world


def build_butler(rig):
    m = {k: material(k, v) for k, v in PALETTE.items()}
    m["coat"] = material("coat", PALETTE["coat"], rough=0.75, sheen=0.4)
    m["lapel"] = material("lapel", PALETTE["lapel"], rough=0.3)
    m["eye"] = material("eye", PALETTE["eye"], rough=0.15)
    m["amber"] = material("amber", PALETTE["amber"], rough=0.35, emit=0.35)
    m["spark"] = material("spark", "#ffffff", emit=4.0)
    parts = {}

    def add(obj, bone):
        attach(obj, rig, bone)
        parts[obj.name] = obj
        return obj

    # Body: a tailcoat that widens to the shoulders, flattened front to back.
    body = limb("coat", m["coat"], (0, 0, 0.30), (0, 0, 1.50), 0.44, 0.50, verts=10)
    body.scale = (1, 0.62, 1)
    bpy.context.view_layer.update()
    add(body, "spine")
    add(ellipsoid("shoulders", m["coat"], (0, 0, 1.49), (0.56, 0.32, 0.15)), "spine")
    front = -0.335
    add(plate("shirt", m["shirt"], [(-0.17, 1.60), (0.17, 1.60), (0.05, 1.02), (-0.05, 1.02)], front, 0.05), "spine")
    add(plate("lapel.L", m["lapel"], [(0.17, 1.60), (0.27, 1.56), (0.08, 0.98), (0.05, 1.02)], front - 0.01, 0.05), "spine")
    add(plate("lapel.R", m["lapel"], [(-0.17, 1.60), (-0.05, 1.02), (-0.08, 0.98), (-0.27, 1.56)], front - 0.01, 0.05), "spine")
    for i, z in enumerate((1.40, 1.25, 1.10)):
        add(ellipsoid(f"stud.{i}", m["eye"], (0, front - 0.015, z), (0.016, 0.01, 0.016), subdiv=1), "spine")
    add(limb("collar", m["shirt"], (0, 0, 1.56), (0, 0, 1.70), 0.14, 0.12, verts=10), "spine")

    # Bow tie: the one amber on the figure, like the one amber of the app.
    add(limb("bow.L", m["amber"], (0.13, front - 0.04, 1.64), (0.015, front - 0.04, 1.64), 0.075, 0.012, verts=4), "spine")
    add(limb("bow.R", m["amber"], (-0.13, front - 0.04, 1.64), (-0.015, front - 0.04, 1.64), 0.075, 0.012, verts=4), "spine")
    for o in parts.values():
        if o.name.startswith("bow."):
            o.visible_shadow = False
    add(ellipsoid("bow.knot", m["amber"], (0, front - 0.05, 1.64), (0.03, 0.025, 0.035), subdiv=1), "spine")

    # Neck and head.
    add(limb("neck", m["skin"], (0, 0, 1.62), (0, 0, 1.86), 0.10, 0.10), "neck")
    add(ellipsoid("head", m["skin"], (0, 0, 2.03), (0.30, 0.28, 0.335)), "head")
    add(ellipsoid("ear.L", m["skin"], (0.29, 0.02, 2.02), (0.045, 0.035, 0.075), subdiv=1), "head")
    add(ellipsoid("ear.R", m["skin"], (-0.29, 0.02, 2.02), (0.045, 0.035, 0.075), subdiv=1), "head")
    add(ellipsoid("nose", m["nose"], (0, -0.29, 1.99), (0.055, 0.06, 0.06), subdiv=1), "head")
    add(ellipsoid("hair", m["hair"], (0, 0.03, 2.2), (0.325, 0.305, 0.205)), "head")
    add(ellipsoid("hair.quiff", m["hair"], (0.07, -0.13, 2.32), (0.2, 0.15, 0.09)), "head")
    add(ellipsoid("hair.side.L", m["hair"], (0.25, 0.06, 2.08), (0.07, 0.17, 0.12), subdiv=1), "head")
    add(ellipsoid("hair.side.R", m["hair"], (-0.25, 0.06, 2.08), (0.07, 0.17, 0.12), subdiv=1), "head")

    for side, s in (("L", 1), ("R", -1)):
        eye = add(ellipsoid(f"eye.{side}", m["eye"], (s * 0.1, -0.262, 2.06), (0.036, 0.022, 0.05), subdiv=2, smooth=True), "head")
        spark = ellipsoid(f"spark.{side}", m["spark"], (s * 0.1 + 0.012, -0.284, 2.078), (0.009, 0.006, 0.009), subdiv=1)
        bpy.context.view_layer.update()
        spark.parent = eye
        spark.matrix_parent_inverse = eye.matrix_world.inverted()
        add(ellipsoid(f"brow.{side}", m["hair"], (s * 0.105, -0.27, 2.14), (0.06, 0.016, 0.016), subdiv=1), f"brow.{side}")
        stache = limb(f"stache.{side}", m["hair"], (s * 0.012, -0.30, 1.935), (s * 0.13, -0.27, 1.905), 0.034, 0.008, verts=6)
        add(stache, "head")

    parts["bow.knot"].visible_shadow = False
    add(ellipsoid("mouth", m["mouth"], (0, -0.272, 1.87), (0.06, 0.03, 0.035), subdiv=2, smooth=True), "head")

    # Arms and white gloves.
    for side, s in (("L", 1), ("R", -1)):
        add(limb(f"upperarm.{side}", m["coat"], (s * 0.47, 0, 1.52), (s * 0.53, 0, 1.08), 0.105, 0.085), f"upperarm.{side}")
        add(limb(f"forearm.{side}", m["coat"], (s * 0.53, 0, 1.12), (s * 0.55, -0.02, 0.78), 0.085, 0.07), f"forearm.{side}")
        add(limb(f"cuff.{side}", m["shirt"], (s * 0.55, -0.02, 0.80), (s * 0.552, -0.022, 0.75), 0.075, 0.072), f"hand.{side}")
        add(ellipsoid(f"glove.{side}", m["glove"], (s * 0.555, -0.025, 0.67), (0.075, 0.055, 0.095)), f"hand.{side}")
        add(ellipsoid(f"thumb.{side}", m["glove"], (s * 0.52, -0.075, 0.70), (0.028, 0.028, 0.05), subdiv=1), f"hand.{side}")
    for side in ("L", "R"):
        EYE_REST[side] = parts[f"eye.{side}"].location.copy()
    return parts


EYE_REST = {}


def build_stage():
    """The lit case: a dark wall with a warm pool of light behind the head."""
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 2.0, 1.6), rotation=(math.pi / 2, 0, 0))
    wall = bpy.context.object
    wall.name = "wall"
    mat = bpy.data.materials.new("wall")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    ramp = nodes.new("ShaderNodeValToRGB")
    grad = nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    mapping = nodes.new("ShaderNodeMapping")
    coords = nodes.new("ShaderNodeTexCoord")
    # Plane local coords: x right, y up (after the rotation). Centre the pool
    # a little above the head and make it oval, wider than tall.
    mapping.inputs["Location"].default_value = (0, -0.5, 0)
    mapping.inputs["Scale"].default_value = (0.45, 0.5, 1)
    ramp.color_ramp.elements[0].color = srgb(PALETTE["wall"])
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = srgb(PALETTE["wall_lit"])
    ramp.color_ramp.interpolation = "EASE"
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    wall.data.materials.append(mat)
    wall.visible_shadow = False


def light(name, kind, loc, target, color, energy, size=1.0):
    data = bpy.data.lights.new(name, kind)
    data.color = srgb(color)[:3]
    data.energy = energy
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    direction = Vector(target) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(obj)
    return obj


def build_lights_and_camera(scene):
    light("key", "AREA", (-2.2, -3.2, 3.2), (0, 0, 1.8), "#fff1e0", 210, size=2.5)
    light("fill", "AREA", (2.6, -2.8, 1.5), (0, 0, 1.5), PALETTE["glow"], 60, size=2.0)
    light("rim.L", "AREA", (2.2, 1.6, 2.6), (0, 0, 1.7), PALETTE["amber"], 300, size=1.0)
    light("rim.R", "AREA", (-2.2, 1.6, 2.6), (0, 0, 1.7), PALETTE["amber"], 300, size=1.0)
    light("footlight", "AREA", (0, -2.4, 0.2), (0, 0, 1.6), PALETTE["amber"], 35, size=3.0)
    cam_data = bpy.data.cameras.new("camera")
    cam_data.lens = 95
    cam_data.sensor_fit = "AUTO"
    cam = bpy.data.objects.new("camera", cam_data)
    cam.location = (0, -5.4, 1.62)
    cam.rotation_euler = (Vector((0, 0, 1.68)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    scene.camera = cam


# ---------------------------------------------------------------- animation


def rad(deg):
    return math.radians(deg)


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def envelope(t, rise=0.25, fall=0.25):
    """0 at both ends, 1 in the middle: gestures leave and return to neutral."""
    return smoothstep(0, rise, t) * (1 - smoothstep(1 - fall, 1, t))


def wave(t, cycles, phase=0.0):
    """A sine with a whole number of cycles per clip, so loops are seamless."""
    return math.sin(2 * math.pi * (cycles * t + phase))


def blink(t, at, width=0.05):
    d = abs(t - at)
    return max(0.0, 1 - d / width) if d < width else 0.0


def neutral():
    return {
        "rot": {},  # bone -> (x, y, z) degrees
        "loc": {},  # bone -> (x, y, z) offset
        "blink": 0.0,  # 0 open, 1 shut
        "eyes": 1.0,  # eye size
        "mouth": 0.0,  # 0 shut smile, 1 wide open
        "mouth_w": 1.0,  # mouth width
        "look": (0.0, 0.0),  # eye offset: x to screen right, z up
    }


def arm(p, side, abduct=0.0, forward=0.0, twist=0.0, elbow=0.0, elbow_in=0.0, lift=0.0):
    """Arm pose in plain terms. side +1 is the butler's left (+X)."""
    s = 1 if side == "L" else -1
    p["rot"][f"upperarm.{side}"] = (-forward, -s * abduct, s * twist)
    p["rot"][f"forearm.{side}"] = (-elbow, s * elbow_in, 0)
    if lift:
        p["loc"][f"upperarm.{side}"] = (0, 0, lift)


def breathe(p, t, cycles=1, depth=1.0):
    b = wave(t, cycles)
    p["loc"]["spine"] = (0, 0, 0.006 * depth * b)
    p["rot"]["spine"] = (0.8 * depth * b, 0, 0)
    arm(p, "L", abduct=2 + 0.6 * b, elbow=6)
    arm(p, "R", abduct=2 + 0.6 * b, elbow=6)


def idle(t):
    p = neutral()
    breathe(p, t)
    p["rot"]["head"] = (1.5 * wave(t, 1, 0.25) - 1.5 * wave(0, 1, 0.25), 2.0 * wave(t, 1), 0)
    p["blink"] = blink(t, 0.62)
    return p


def listening(t):
    p = neutral()
    breathe(p, t, cycles=1, depth=0.7)
    # Lean in with the head tilted, brows up, a small "mm-hm" twice a loop.
    p["rot"]["spine"] = (3.0 + 0.6 * wave(t, 1), 0, 0)
    p["rot"]["head"] = (2.0 + 2.0 * wave(t, 2), 8.0, -4.0)
    p["loc"]["brow.L"] = (0, 0, 0.014)
    p["loc"]["brow.R"] = (0, 0, 0.014)
    p["eyes"] = 1.08
    p["blink"] = blink(t, 0.4)
    return p


def thinking(t):
    p = neutral()
    breathe(p, t, cycles=1, depth=0.6)
    # Eyes and head drift up and aside; one brow up; mouth pursed.
    p["rot"]["head"] = (-5.0, -6.0 + 1.5 * wave(t, 1), 9.0 + 3.0 * wave(t, 1, 0.25))
    p["loc"]["brow.L"] = (0, 0, 0.02 + 0.004 * wave(t, 2))
    p["rot"]["brow.L"] = (0, -10, 0)
    p["loc"]["brow.R"] = (0, 0, -0.004)
    p["mouth_w"] = 0.65
    p["look"] = (0.022 + 0.004 * wave(t, 1), 0.018)
    # The right glove rests under the chin and taps it once a loop.
    arm(p, "R", abduct=-56, forward=38, elbow=152 + 3 * wave(t, 1), elbow_in=-95)
    p["mouth"] = 0.08
    p["blink"] = blink(t, 0.8)
    return p


def speaking(t):
    p = neutral()
    breathe(p, t, cycles=1, depth=0.8)
    # Syllable-like mouth: whole-number harmonics, never fully regular.
    m = 0.5 + 0.32 * wave(t, 7) + 0.18 * wave(t, 3, 0.2) + 0.12 * wave(t, 11, 0.6)
    p["mouth"] = min(max(m, 0.0), 1.0)
    p["mouth_w"] = 1.0 + 0.1 * wave(t, 3, 0.4)
    p["rot"]["head"] = (2.0 * wave(t, 3), 2.5 * wave(t, 1, 0.1), 1.5 * wave(t, 2))
    brow = 0.006 * max(0.0, wave(t, 3, 0.1))
    p["loc"]["brow.L"] = (0, 0, brow)
    p["loc"]["brow.R"] = (0, 0, brow)
    # The left hand makes a small open-palm beat while it talks.
    arm(p, "L", abduct=6, forward=10 + 4 * wave(t, 3), elbow=45 + 6 * wave(t, 3), elbow_in=8)
    p["blink"] = blink(t, 0.55)
    return p


def nod(t):
    p = idle(0)
    p["rot"]["head"] = (14.0 * (1 - math.cos(4 * math.pi * t)) / 2 * envelope(t, 0.1, 0.1), 0, 0)
    p["rot"]["spine"] = (2.0 * envelope(t), 0, 0)
    p["loc"]["brow.L"] = p["loc"]["brow.R"] = (0, 0, 0.008 * envelope(t))
    p["mouth"] = 0.0
    return p


def shrug(t):
    p = idle(0)
    e = envelope(t, 0.3, 0.3)
    arm(p, "L", abduct=2 + 26 * e, forward=12 * e, elbow=6 + 70 * e, elbow_in=-25 * e, lift=0.06 * e)
    arm(p, "R", abduct=2 + 26 * e, forward=12 * e, elbow=6 + 70 * e, elbow_in=-25 * e, lift=0.06 * e)
    p["loc"]["spine"] = (0, 0, 0.0)
    p["rot"]["head"] = (-3 * e, 10 * e, 0)
    p["loc"]["brow.L"] = p["loc"]["brow.R"] = (0, 0, 0.022 * e)
    p["mouth_w"] = 1.0 + 0.3 * e
    return p


def shiver(t):
    p = idle(0)
    e = envelope(t, 0.15, 0.25)
    shake = wave(t, 14) * e
    arm(p, "L", abduct=2 - 8 * e, forward=28 * e, elbow=6 + 70 * e, elbow_in=40 * e, lift=0.05 * e)
    arm(p, "R", abduct=2 - 8 * e, forward=28 * e, elbow=6 + 70 * e, elbow_in=40 * e, lift=0.05 * e)
    p["rot"]["spine"] = (-2 * e, 2.0 * shake, 0)
    p["rot"]["head"] = (4 * e, -2.5 * shake, 1.5 * shake)
    p["loc"]["brow.L"] = p["loc"]["brow.R"] = (0, 0, 0.026 * e)
    p["rot"]["brow.L"] = (0, 12 * e, 0)
    p["rot"]["brow.R"] = (0, -12 * e, 0)
    p["eyes"] = 1.0 + 0.3 * e
    p["mouth"] = 0.35 * e
    p["mouth_w"] = 1.0 - 0.35 * e
    return p


def excited(t):
    p = idle(0)
    e = envelope(t, 0.15, 0.2)
    hop = abs(wave(t, 1)) * e  # two hops
    p["loc"]["root"] = (0, 0, 0.07 * hop)
    arm(p, "L", abduct=2 + 12 * e, forward=20 * e, elbow=6 + 100 * e, elbow_in=10 * e)
    arm(p, "R", abduct=2 + 12 * e, forward=20 * e, elbow=6 + 100 * e, elbow_in=10 * e)
    p["rot"]["head"] = (-6 * e, 0, 4 * wave(t, 1) * e)
    p["loc"]["brow.L"] = p["loc"]["brow.R"] = (0, 0, 0.024 * e)
    p["eyes"] = 1.0 + 0.2 * e
    p["mouth"] = 0.85 * e
    p["mouth_w"] = 1.0 + 0.3 * e
    return p


def bow(t):
    p = idle(0)
    e = envelope(t, 0.3, 0.3)
    p["rot"]["spine"] = (24 * e, 0, 0)
    p["rot"]["head"] = (10 * e, 0, 0)
    arm(p, "R", abduct=2 - 6 * e, forward=40 * e, elbow=6 + 75 * e, elbow_in=-55 * e)
    arm(p, "L", abduct=2 + 4 * e, forward=-12 * e, elbow=6 + 20 * e)
    p["blink"] = smoothstep(0.3, 0.45, t) * (1 - smoothstep(0.6, 0.75, t))
    return p


# name -> (pose function, seconds, loop)
CLIPS = {
    "idle": (idle, 4.0, True),
    "listening": (listening, 3.0, True),
    "thinking": (thinking, 3.0, True),
    "speaking": (speaking, 3.0, True),
    "gesture-nod": (nod, 1.2, False),
    "gesture-shrug": (shrug, 1.6, False),
    "gesture-shiver": (shiver, 1.4, False),
    "gesture-excited": (excited, 1.4, False),
    "gesture-bow": (bow, 2.0, False),
}


def _flat(p):
    out = {}
    for group in ("rot", "loc"):
        for bone, vec in p[group].items():
            for i, v in enumerate(vec):
                if abs(v) > 1e-9:
                    out[(group, bone, i)] = v
    for k in ("blink", "eyes", "mouth", "mouth_w"):
        out[k] = p[k]
    out["look"] = tuple(p["look"])
    return out


def _same(a, b, tol=1e-6):
    a, b = _flat(a), _flat(b)
    for k in set(a) | set(b):
        va, vb = a.get(k, 0.0), b.get(k, 0.0)
        if isinstance(va, tuple):
            if any(abs(x - y) > tol for x, y in zip(va, vb)):
                return False
        elif abs(va - vb) > tol:
            return False
    return True


def check_seams():
    """Loops end where they start; gestures start and end on idle's first pose."""
    rest = idle(0)
    bad = []
    for name, (fn, _, loop) in CLIPS.items():
        if loop and not _same(fn(0), fn(1)):
            bad.append(f"{name}: last frame does not lead into the first")
        if not loop and not (_same(fn(0), rest) and _same(fn(1), rest)):
            bad.append(f"{name}: does not start and end on the idle pose")
    if bad:
        raise SystemExit("Seam check failed:\n  " + "\n  ".join(bad))


def apply_pose(rig, parts, p):
    for pb in rig.pose.bones:
        rx, ry, rz = p["rot"].get(pb.name, (0, 0, 0))
        pb.rotation_euler = (rad(rx), rad(ry), rad(rz))
        pb.location = p["loc"].get(pb.name, (0, 0, 0))
    for side in ("L", "R"):
        eye = parts[f"eye.{side}"]
        k = p["eyes"]
        eye.scale = (0.036 * k, 0.022, 0.05 * k * max(0.08, 1 - p["blink"]))
        lx, lz = p["look"]
        eye.location = EYE_REST[side] + Vector((lx, 0, lz))
    mouth = parts["mouth"]
    mouth.scale = (0.06 * p["mouth_w"], 0.03, 0.012 + 0.045 * p["mouth"])


def key_pose(rig, parts, frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert("rotation_euler", frame=frame)
        pb.keyframe_insert("location", frame=frame)
    for name in ("eye.L", "eye.R", "mouth"):
        parts[name].keyframe_insert("scale", frame=frame)
    for name in ("eye.L", "eye.R"):
        parts[name].keyframe_insert("location", frame=frame)


def frame_count(name):
    _, seconds, loop = CLIPS[name]
    n = round(seconds * FPS)
    # A loop skips its last frame: it equals the first one.
    return n if loop else n + 1


def bake(scene, rig, parts, name):
    fn, seconds, loop = CLIPS[name]
    n = round(seconds * FPS)
    for obj in [rig, *parts.values()]:
        obj.animation_data_clear()
    for i in range(frame_count(name)):
        apply_pose(rig, parts, fn(i / n))
        key_pose(rig, parts, i + 1)
    for obj in [rig, *parts.values()]:
        if obj.animation_data and obj.animation_data.action:
            for fc in _fcurves(obj.animation_data):
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
    scene.frame_start = 1
    scene.frame_end = frame_count(name)


def _fcurves(anim):
    """F-curves of an action, for slotted (4.4+) and legacy actions."""
    action = anim.action
    if hasattr(action, "layers") and action.layers:
        for layer in action.layers:
            for strip in layer.strips:
                bag = strip.channelbag(anim.action_slot)
                if bag:
                    yield from bag.fcurves
    else:
        yield from action.fcurves


def render_clip(scene, rig, parts, name, out_dir, still=False):
    bake(scene, rig, parts, name)
    frames = os.path.join(out_dir, name)
    os.makedirs(frames, exist_ok=True)
    if still:
        mid = max(1, frame_count(name) // 2)
        scene.frame_set(mid)
        scene.render.filepath = os.path.join(out_dir, f"{name}-still.png")
        bpy.ops.render.render(write_still=True)
        return
    scene.render.filepath = os.path.join(frames, "f_")
    bpy.ops.render.render(animation=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/butler")
    ap.add_argument("--clips", nargs="*", default=list(CLIPS))
    ap.add_argument("--still", action="store_true", help="one mid frame per clip")
    ap.add_argument("--save", help="also save the scene as a .blend file")
    args = ap.parse_args(argv)
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    check_seams()
    scene = reset_scene()
    build_stage()
    rig = build_rig()
    parts = build_butler(rig)
    build_lights_and_camera(scene)
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))
    for name in args.clips:
        render_clip(scene, rig, parts, name, out_dir, still=args.still)


main()
