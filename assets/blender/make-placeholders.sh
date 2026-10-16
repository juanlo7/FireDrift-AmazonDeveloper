#!/usr/bin/env bash
# Generates the placeholder butler clips with ffmpeg (no Blender needed).
# Output: assets/butler/*.mp4, under the final names from docs/contracts.md
# section 4. Re-run it any time: it overwrites the files.
#
# Usage: assets/blender/make-placeholders.sh
# Needs: ffmpeg with libx264 and the geq filter. Set FFMPEG to override.
set -euo pipefail

FFMPEG="${FFMPEG:-$(command -v ffmpeg || echo /opt/homebrew/bin/ffmpeg)}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/butler"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

W=600
H=800
FPS=30

# Theme colours (app/src/theme): background, glow, amber, warm white.
BG=(13 12 11)
GLOW=(255 217 160)
AMBER=(255 181 71)
SKIN=(240 201 160)
HAIR=(200 200 205)
COAT=(78 71 64)
SHIRT=(246 239 228)
DARK=(26 16 6)
MOUTH=(70 24 22)

# Pose variables, set per clip. They are geq expressions in T (seconds).
BX=0 BY=0 HX=0 HY=0 MO=0 EY=0 HALO=0.4 DOTS=0 RING=0

# Colour of channel $1 (0 r, 1 g, 2 b) from the array named $2.
c() { eval "echo \"\${$2[$1]}\""; }
# bg + (col - bg) * k, as an expression, for channel $1.
mix() { echo "(${BG[$1]}+($(c "$1" "$2")-${BG[$1]})*($3))"; }

# The geq expression of one colour channel: layers from front to back.
chan() {
  local k=$1
  local hcx="(300+($HX))" hcy="(340+($HY))" bcx="(300+($BX))" bby="($BY)"
  local head="lt(hypot(X-$hcx,Y-$hcy),110)"
  local hair="gt($hcy-72,Y)"
  local mouth="lt(pow((X-$hcx)/28,2)+pow((Y-$hcy-55)/(5+22*($MO)),2),1)"
  local eyes="lt(min(hypot(X-$hcx-42,Y-$hcy+15-($EY)),hypot(X-$hcx+42,Y-$hcy+15-($EY))),11)"
  local tie="lt(min(min(pow((X-$bcx-34)/34,2)+pow((Y-505-$bby)/22,2),pow((X-$bcx+34)/34,2)+pow((Y-505-$bby)/22,2)),pow((X-$bcx)/13,2)+pow((Y-505-$bby)/15,2)),1)"
  local shirt="lt(pow((X-$bcx)/58,2)+pow((Y-640-$bby)/170,2),1)"
  local body="lt(pow((X-$bcx)/230,2)+pow((Y-840-$bby)/390,2),1)"
  local halo="(($HALO)*clip(1-hypot(X-300,Y-340)/270,0,1))"
  local ringr="(175+85*mod(T/2,1))" ringa="(1-mod(T/2,1))"
  local ring="lt(abs(hypot(X-300,Y-340)-$ringr),4)*$RING"
  local e i
  e="$(mix "$k" GLOW "$halo")"
  e="if($ring,$(mix "$k" AMBER "$ringa"),$e)"
  e="if($body,if($tie,$(c "$k" AMBER),if($shirt,$(c "$k" SHIRT),$(c "$k" COAT))),$e)"
  # Thinking dots: three amber dots whose brightness chases around.
  for i in 0 1 2; do
    e="if(lt(hypot(X-$((440 + i * 50)),Y-190),15)*$DOTS,$(mix "$k" AMBER "0.15+0.85*(0.5+0.5*sin(2*PI*(T/3-$i/3)))"),$e)"
  done
  e="if($head,if($mouth,$(c "$k" MOUTH),if($eyes,$(c "$k" DARK),if($hair,$(c "$k" HAIR),$(c "$k" SKIN)))),$e)"
  echo "$e"
}

# render NAME FRAMES
#   Loops: DURATION*FPS frames (4 s = 120). Frame N would equal frame 0, so the file
#   loops with no repeated frame.
#   Gestures: one extra frame (1.5 s = 45 + 1), so the last frame is the rest pose (= frame 0).
render() {
  local name=$1 frames=$2
  local script="$TMP/$name.filter"
  echo "format=gbrp,geq=r='$(chan 0)':g='$(chan 1)':b='$(chan 2)',format=yuv420p" > "$script"
  "$FFMPEG" -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=black:s=${W}x${H}:r=$FPS" \
    -/filter:v "$script" -frames:v "$frames" \
    -c:v libx264 -profile:v main -pix_fmt yuv420p -preset slow -crf 23 \
    -r "$FPS" -an -movflags +faststart "$OUT/$name.mp4"
  echo "wrote $name.mp4 ($frames frames)"
}

reset() { BX=0 BY=0 HX=0 HY=0 MO=0 EY=0 HALO=0.4 DOTS=0 RING=0; }

# ---- Loops (whole cycles per clip, so they repeat exactly) ----
# idle, 4 s: slow breathing, calm light.
reset; BY="5*sin(2*PI*T/4)"; HY="5*sin(2*PI*T/4)"; HALO="0.4+0.1*sin(2*PI*T/4)"
render idle 120

# listening, 2 s: head tilts to one side, bright light, ripple rings.
reset; HX="18*sin(2*PI*T/2)"; HY="-6"; HALO="0.9+0.1*sin(2*PI*T)"; RING=1
render listening 60

# thinking, 3 s: head sways, eyes look up, three dots chase each other.
reset; HX="26*sin(2*PI*T/3)"; HY="-10"; EY="-14"; HALO="0.3+0.2*sin(2*PI*T/3)"; DOTS=1
render thinking 90

# speaking, 2 s: mouth opens and closes three times, light pulses fast.
reset; MO="0.5+0.5*sin(2*PI*3*T/2)"; HY="4*sin(2*PI*3*T/2)"; HALO="0.75+0.25*sin(2*PI*3*T/2)"
render speaking 60

# ---- Gestures (one-shot, 1.5 s, rest pose at both ends) ----
# E is 0 at both ends and 1 in the middle.
E="pow(sin(PI*T/1.5),2)"

# nod: head dips twice.
reset; HY="30*sin(2*PI*2*T/1.5)*$E"
render gesture-nod 46

# shrug: shoulders rise, head tilts and sinks, eyes roll up.
reset; BY="-34*$E"; HY="-10*$E"; HX="28*sin(2*PI*T/1.5)*$E"; EY="-10*$E"; HALO="0.4-0.2*$E"
render gesture-shrug 46

# shiver: fast sideways trembling, light drops.
reset; BX="9*sin(2*PI*14*T/1.5)*$E"; HX="12*sin(2*PI*14*T/1.5)*$E"; HALO="0.4-0.3*$E"
render gesture-shiver 46

# excited: a big hop, mouth open, light flashes.
reset; HY="-45*abs(sin(2*PI*T/1.5))*$E"; BY="-20*abs(sin(2*PI*T/1.5))*$E"; MO="0.9*$E"; HALO="0.4+0.6*$E"
render gesture-excited 46

# bow: head and body dip, then come back.
reset; HY="110*$E"; BY="40*$E"; EY="12*$E"
render gesture-bow 46
