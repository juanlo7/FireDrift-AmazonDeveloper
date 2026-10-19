# Butler design brief

Short brief for the butler character (issue #57). Clip spec: `docs/contracts.md`
section 4.

## Look

- A simple, stylized, low-poly butler. Flat or soft-shaded colours. No
  realistic skin or cloth. Keep the polygon count low so renders are fast.
- Black-grey tailcoat, white shirt front, an amber bow tie, grey hair.
- A friendly round face: two dark dot eyes, a small mouth that can open (the
  `speaking` loop needs a mouth that moves). No nose detail needed.
- Upper body only: head, shoulders, chest, arms for the gestures.
- Palette comes from the app theme (`app/src/theme`): amber `#ffb547`, glow
  `#ffd9a0`, warm white `#f6efe4`. The bow tie is the one amber accent.

## Personality

A polite, warm, slightly playful lobby butler. Calm by default. Small, clear
movements. He is helpful, never pushy, and a little amused when he is excited.

## Framing

- The app shows the clip in a **300 x 400 portrait slot** (3:4), see
  `SLOT_WIDTH` and `SLOT_HEIGHT` in `app/src/butler/CharacterSlot.tsx`.
- Render in the same 3:4 ratio at **540 x 720**. The contract allows 720 px
  height at most (1280 x 720 or smaller).
- Camera is fixed, at chest-to-head height, a little below eye level. Head in
  the top third, the frame cut at the waist, gloves at the bottom edge.
- Keep all important parts inside the central 80% of the frame, so a small
  crop does not cut a gesture.
- Same camera, framing and light in every clip.

## Background

Solid theme background `#0d0c0b` (the lobby wall, `colors.background`). A soft
warm glow (`#ffd9a0`) behind the head is allowed. Use the same background in
all clips. Use alpha instead only if Vega supports it (`docs/requirements.md`,
V5).

## Loops

All loops are seamless: the last frame leads into the first with no jump.

| Clip | Looks like |
|---|---|
| `idle` (2-6 s) | Slow breathing, tiny head sway, calm light. Also used as `fallback`. |
| `listening` (2-4 s) | Head tilted, leaning in, eyes on the viewer. Brighter light, soft ripples. |
| `thinking` (2-4 s) | Head turns, eyes look up and to the side, one brow up, the right glove under the chin. |
| `speaking` (2-4 s) | Mouth opens and closes, small head and hand movement, lively light. |

## Gestures

One-shot, 1-2 s. Start and end on the idle rest pose, so the app can return to
a loop with no jump.

| Clip | Looks like |
|---|---|
| `gesture-nod` | Head dips twice. Agrees, confirms a pick. |
| `gesture-shrug` | Shoulders rise, palms out, head tilts. Not sure, nothing found. |
| `gesture-shiver` | Quick trembling, shoulders in, eyes wide. Scary or dark title. |
| `gesture-excited` | A small hop, mouth open, arms up, bright flash. Strong match. |
| `gesture-bow` | Upper body bows forward, then straightens. Greeting, goodbye. |

## Clip spec (from `docs/contracts.md` section 4)

| Item | Value |
|---|---|
| Files | `assets/butler/{idle,listening,thinking,speaking}.mp4` and `assets/butler/gesture-{nod,shrug,shiver,excited,bow}.mp4` |
| Loop length | `idle` 2-6 s; `listening`, `thinking`, `speaking` 2-4 s; all seamless |
| Gesture length | 1-2 s, rest pose at both ends |
| Codec | H.264 MP4, profile main, yuv420p |
| Size | 1280 x 720 or smaller (we use 3:4 portrait) |
| Frame rate | 30 fps |
| Audio | none |
| File size | each under 2 MB |
| Flags | `-movflags +faststart` |
| Consistency | same framing and background in all clips |

## What we built

`butler.py` builds this brief from code in Blender 5.2 LTS:

- **Model:** low-poly primitives with flat shading. Tailcoat, shirt front
  with studs, wing collar, amber bow tie, white gloves, grey hair and
  moustache, dot eyes with a highlight.
- **Rig:** one armature (`ButlerRig`) with 12 bones: root, spine, neck, head,
  two brows, and upper arm, forearm and hand on each side. Every part is a
  rigid mesh parented to one bone. The eyes (blink, look) and the mouth (open,
  width) are animated by scale and position.
- **Animation:** each clip is a pose function of time. Loops use whole sine
  cycles, so the frame after the last one is the first one. Gestures use an
  envelope that is zero at both ends, so they start and end on the first pose
  of `idle`. `check_seams()` stops the render if a clip breaks this rule.
- **Light:** the "lit case" of the app: a dark wall with a warm pool behind the
  head, a warm key light, two amber rim lights and a low amber footlight.
  The `Standard` view transform keeps the theme colours exact.
