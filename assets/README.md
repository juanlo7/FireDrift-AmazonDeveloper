# Assets

| Path | What |
|---|---|
| `butler/` | The nine butler clips the app plays (four loops, five gestures). |
| `blender/` | The design brief and the tools that make the clips. |
| `fonts/` | Bundled fonts (SIL Open Font License), if present. |

## Placeholder clips

The files in `butler/` are **placeholders**. They have the final names and the
final spec (`docs/contracts.md` section 4), so the app can build against them
now. They show a simple butler made of shapes: a head, a bow tie and a glowing
halo that moves for each state or gesture. They are not the final art. The
final clips are made in issues #58 and #59 and will replace them under the
same names.

## Regenerate the placeholders

```sh
assets/blender/make-placeholders.sh
```

It needs `ffmpeg` with `libx264` and the `geq` filter. No Blender is needed.
Set `FFMPEG=/path/to/ffmpeg` if `ffmpeg` is not on your `PATH`. It takes a few
minutes. The script overwrites the nine files in `butler/`.

## Still to do

- The final butler model and rig, as `bpy` scripts in `assets/blender/`
  (issue #57).
- The final animation and renders (issues #58 and #59).
- Record the AI tools used for the character in the main README credits.

See `blender/BRIEF.md` for the look, the framing and the clip spec.
