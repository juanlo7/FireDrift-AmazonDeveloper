# Assets

| Path | What |
|---|---|
| `blender/` | The design brief and the tools that make the clips. |
| `fonts/` | Bundled fonts (SIL Open Font License), if present. |

## Butler clips

The nine clips in `app/assets/butler/` are the final renders of the butler: four
seamless loops and five one-shot gestures. They live in the app, not here, because
the Vega build packages only `app/assets/` (the app plays
`file:///pkg/assets/butler/<name>.mp4`). A Blender script builds the model, the rig
and the animation from code, so anyone can change and render them again.

| Item | Value |
|---|---|
| Source | `blender/butler.py` (model, rig, animation, light, camera) |
| Brief | `blender/BRIEF.md` |
| Format | H.264 Main, yuv420p, 540 x 720, 30 fps, no audio, faststart |
| Size | 75 KB to 185 KB each (the limit is 2 MB) |

## Render the clips again

```sh
assets/blender/render.sh                 # all nine clips, about 4 minutes
assets/blender/render.sh idle speaking   # only these clips
```

It needs Blender 5.2 LTS and `ffmpeg` with `libx264`. Set `BLENDER=...` or
`FFMPEG=...` if they are not on your `PATH`. The PNG frames go to `build/butler/`
(not in git). The script overwrites the clips in `app/assets/butler/`.

To check a pose before a full render, render one middle frame per clip:

```sh
blender -b --factory-startup -P assets/blender/butler.py -- --still --out build/stills
```

Add `--save build/butler.blend` to open the scene in the Blender UI.

## Credits

The butler is our own work. The `bpy` script was written with AI help (Claude
and Claude Code); the team reviewed the result frame by frame. No third-party
models, textures or fonts are in the clips.

## Still to do

- Test the clips on a Vega device: loops, state switches, gestures, and memory
  with the clip player open (issue #59, spike V5). The Vega Virtual Device
  decodes no video.
