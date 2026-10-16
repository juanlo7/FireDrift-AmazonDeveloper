#!/bin/sh
# Build the butler in Blender, render every clip and encode it to MP4.
#
#   assets/blender/render.sh                 # all nine clips
#   assets/blender/render.sh idle speaking   # only these clips
#
# Needs Blender 5.2 LTS (`blender` on the PATH, or BLENDER=...) and ffmpeg
# with libx264 (or FFMPEG=...). Frames go to build/butler/ (not in git).
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BLENDER=${BLENDER:-blender}
FFMPEG=${FFMPEG:-ffmpeg}
FRAMES="$ROOT/build/butler"
OUT="$ROOT/assets/butler"
CLIPS=${*:-idle listening thinking speaking gesture-nod gesture-shrug gesture-shiver gesture-excited gesture-bow}

rm -rf "$FRAMES"
# shellcheck disable=SC2086
"$BLENDER" -b --factory-startup -P "$ROOT/assets/blender/butler.py" -- --out "$FRAMES" --clips $CLIPS

mkdir -p "$OUT"
for clip in $CLIPS; do
  "$FFMPEG" -loglevel error -y -framerate 30 -i "$FRAMES/$clip/f_%04d.png" \
    -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 20 -preset slow \
    -an -movflags +faststart "$OUT/$clip.mp4"
  echo "$OUT/$clip.mp4"
done
