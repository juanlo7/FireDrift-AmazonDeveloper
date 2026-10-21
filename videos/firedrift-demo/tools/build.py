"""Build the FireDrift demo video from the voice tracks.

Run from the project root:  python3 tools/build.py

It measures each voice track, aligns the SCRIPT.md words to the word timings
(`vo-NN.words.json` from media-use transcribe.mjs), and writes:
  - compositions/frames/NN-*.html  the 14 animated scenes, cued to the words
  - index.html                     scene slots, voice, butler voice, SFX, captions
  - audio/timeline.json            the computed timeline, for review

Voice source: audio/vo/ when every track is there (the user's takes), else audio/vo-temp/.
"""

import difflib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRAMES = ROOT / "compositions" / "frames"
NAMES = ["01", "02", "03", "04", "05", "06", "07", "08", "09a", "09b", "10", "11", "12", "13", "14"]
ST = "assets/stills/"
FT = "assets/footage/"


# ---------------------------------------------------------------- audio + words

def duration(path: pathlib.Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def vo_dir() -> pathlib.Path:
    real = ROOT / "audio" / "vo"
    if all((real / f"vo-{n}.wav").exists() for n in NAMES):
        return real
    return ROOT / "audio" / "vo-temp"


def script_tokens() -> dict[str, list[tuple[str, bool]]]:
    """Display words per track, with the bold (keyword) flag, from SCRIPT.md."""
    text = (ROOT / "SCRIPT.md").read_text()
    lines = {}
    for m in re.finditer(r"## Line (\d+) .*?\n(.*?)(?=\n## Line|\Z)", text, re.S):
        spoken = [l[4:] for l in m.group(2).split("\n") if l.startswith("    ")]
        n = int(m.group(1))
        if n == 9:
            lines["09a"], lines["09b"] = [spoken[0][3:]], [spoken[1][3:]]
        else:
            lines[f"{n:02d}"] = spoken
    out = {}
    for name, spoken in lines.items():
        toks = []
        for line in spoken:
            line = line.replace("(beat)", " ").replace("…", "… ")
            for part in re.split(r"(\*\*.*?\*\*)", line):
                bold = part.startswith("**")
                for w in part.strip("*").split():
                    toks.append((w, bold))
        out[name] = toks
    return out


def norm(w: str) -> str:
    w = w.lower().replace("’", "'")
    w = {"20": "twenty", "10,000": "tenthousand", "0": "zero", "5": "five"}.get(w.strip(".,?!:"), w)
    return re.sub(r"[^a-z0-9]", "", w)


def align(tokens: list[tuple[str, bool]], words: list[dict]) -> list[dict]:
    """Give every script word a start/end from the ASR words (matched, else interpolated)."""
    a = [norm(t) for t, _ in tokens]
    b = [norm(w["text"]) for w in words]
    times: list[tuple[float, float] | None] = [None] * len(tokens)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            w = words[blk.b + k]
            times[blk.a + k] = (w["start"], w["end"])
    end_all = words[-1]["end"] if words else 1.0
    for i in range(len(times)):
        if times[i] is None:
            prev = next((times[j][1] for j in range(i - 1, -1, -1) if times[j]), 0.0)
            nxt_i = next((j for j in range(i + 1, len(times)) if times[j]), None)
            nxt = times[nxt_i][0] if nxt_i is not None else end_all
            gap = max(nxt - prev, 0.2)
            span = (nxt_i - i) if nxt_i is not None else (len(times) - i)
            times[i] = (prev, prev + gap / (span + 1))
    return [{"text": t, "bold": bold, "start": s, "end": e} for (t, bold), (s, e) in zip(tokens, times)]


# ---------------------------------------------------------------- timeline

def build_timeline():
    vd = vo_dir()
    toks = script_tokens()
    vo = {}
    for n in NAMES:
        wav = vd / f"vo-{n}.wav"
        words = json.loads((vd / f"vo-{n}.words.json").read_text())
        vo[n] = {"src": str(wav.relative_to(ROOT)), "dur": duration(wav), "words": align(toks[n], words)}
    butler = ROOT / "assets" / "audio" / "butler-missing.mp3"
    if not butler.exists():
        butler = ROOT / "audio" / "butler-missing-temp.wav"
    bdur = duration(butler)

    # (scene id, file, [(track, offset in scene)], tail after the last track)
    frames, t = [], 0.0

    def add(fid, name, tracks, dur):
        nonlocal t
        frames.append({"id": fid, "name": name, "start": round(t, 3), "dur": round(dur, 3), "tracks": tracks})
        t += dur

    add("f01", "01-hook", [("01", 0.25)], 0.25 + vo["01"]["dur"] + 0.3)
    add("f02", "02-nothing", [("02", 0.1)], 0.1 + vo["02"]["dur"] + 0.6)
    add("f03", "03-agitate", [("03", 0.2)], 0.2 + vo["03"]["dur"] + 0.5)
    add("f04", "04-reveal", [("04", 0.35)], 0.35 + vo["04"]["dur"] + 0.5)
    add("f05", "05-feed", [("05", 0.2)], 0.2 + vo["05"]["dur"] + 0.4)
    add("f06", "06-watch-now", [("06", 0.2)], 0.2 + vo["06"]["dur"] + 0.5)
    add("f07", "07-built-for-tv", [("07", 0.2)], 0.2 + vo["07"]["dur"] + 0.4)
    add("f08", "08-butler-intro", [("08", 0.3)], 0.3 + vo["08"]["dur"] + 0.6)
    b_at = 0.2 + vo["09a"]["dur"] + 2.0          # press, then 2 s of thinking
    v9b = b_at + bdur + 0.4
    add("f09", "09-surprise-me", [("09a", 0.2), ("09b", v9b)], v9b + vo["09b"]["dur"] + 0.4)
    add("f10", "10-taste-change", [("10", 0.3)], 0.3 + vo["10"]["dur"] + 0.5)
    add("f11", "11-character", [("11", 0.2)], 0.2 + vo["11"]["dur"] + 0.5)
    add("f12", "12-aws", [("12", 0.3)], 0.3 + vo["12"]["dur"] + 0.7)
    add("f13", "13-trust", [("13", 0.2)], 0.2 + vo["13"]["dur"] + 0.5)
    add("f14", "14-close", [("14", 0.4)], 0.4 + vo["14"]["dur"] + 3.2)
    f9 = next(f for f in frames if f["id"] == "f09")
    butler_info = {"src": str(butler.relative_to(ROOT)), "dur": bdur, "at": f9["start"] + b_at, "local": b_at}
    return {"vo": vo, "frames": frames, "butler": butler_info, "total": round(t, 3), "vo_dir": str(vd.relative_to(ROOT))}


class Cues:
    """Scene-local times of script words: cue('05', 'right') -> seconds from the scene start."""

    def __init__(self, tl, frame):
        self.tl, self.frame = tl, frame

    def __call__(self, track, word, nth=0, end=False):
        off = dict(self.frame["tracks"])[track]
        hits = [w for w in self.tl["vo"][track]["words"] if norm(w["text"]) == norm(word)]
        if not hits:
            raise KeyError(f"{track}: no word {word!r}")
        w = hits[min(nth, len(hits) - 1)]
        return round(off + (w["end"] if end else w["start"]), 3)


# ---------------------------------------------------------------- scenes

WRAP = """<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <link rel="stylesheet" href="styles/brand.css" />
      <style>
        #root {{ position: absolute; inset: 0; }}
        #root .vid {{ position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; display: block; }}
        #root .cam {{ position: absolute; inset: 0; }}
        #root .pst {{ position: absolute; left: 786px; top: 0; width: 184px; height: 277px; object-fit: cover; border-radius: 6px; opacity: 0; display: block; }}
        #root .pst-fit {{ position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform: scale(0.40625); transform-origin: 0 0; }}
{css}
      </style>
      <div id="root" data-composition-id="{id}" data-width="1920" data-height="1080">
        <div class="fd-scene" id="{id}-scene">
{html}
        </div>
      </div>
      <script>
        const tl = gsap.timeline({{ paused: true }});
        const D = {dur};
        // Every scene enters with a small settle (one soft camera move per cut).
        tl.fromTo("#{id}-scene", {{ scale: 1.02 }}, {{ scale: 1, duration: 0.6, ease: "power2.out" }}, 0);
{js}
        window.__timelines["{id}"] = tl;
      </script>
    </template>
  </body>
</html>
"""


SRC_LEN: dict[str, float] = {}


def vid(vid_id, src, start, dur, media_start, extra=""):
    # A longer voice take can outlast the footage: slow the clip just enough to end on its last frame.
    if src not in SRC_LEN:
        SRC_LEN[src] = duration(ROOT / FT / src)
    room = SRC_LEN[src] - 0.05 - media_start
    if room < dur:
        extra += f' data-playback-rate="{room / dur:.3f}"'
    return (f'<video id="{vid_id}" class="clip vid" src="{FT}{src}" muted playsinline data-start="{start:.3f}" '
            f'data-duration="{dur:.3f}" data-media-start="{media_start:.3f}" data-track-index="0"{extra}></video>')


# "The Missing" has no poster in the recordings: the app did not load it, but TMDB has one.
# A TMDB still covers the empty slot. Card top y (px) by media time, measured on the footage.
MISSING_CARD = {
    "butler-lighter.mp4": [(0.0, 240), (3.10, 340), (6.15, 286), (10.60, 300), (11.00, None)],
    "butler-surprise.mp4": [(0.0, None), (14.05, 340), (14.45, 240)],
}


def poster(pid, src, start, dur, media_start):
    """Poster img and its timeline sets, synced to one clip. Put it in the same camera as the clip."""
    keys = MISSING_CARD.get(src, [])
    end = media_start + dur
    js = []
    for i, (t, top) in enumerate(keys):
        t_next = keys[i + 1][0] if i + 1 < len(keys) else float("inf")
        if t_next <= media_start or t >= end:
            continue
        at = start + max(t - media_start, 0.0)
        state = "opacity: 0" if top is None else f'opacity: 1, top: "{top + 24}px"'
        js.append(f'        tl.set("#{pid}", {{ {state} }}, {at:.3f});')
    if not js:
        return "", ""
    js.append(f'        tl.set("#{pid}", {{ opacity: 0 }}, {start + dur:.3f});')
    return f'<img class="pst" id="{pid}" src="{ST}poster-missing.jpg" />', "\n" + "\n".join(js)


def scene_01(c, d):
    t20 = c("01", "twenty")
    tiles = ["feed-1", "feed-2", "settings", "watch-now", "feed-2", "menu", "feed-1", "settings", "watch-now", "feed-1", "feed-2", "menu",
             "settings", "feed-2", "watch-now", "feed-1", "menu", "feed-1", "settings", "feed-2"]
    css = """
        .f01-tilt { position: absolute; inset: -160px; transform: rotate(-8deg); }
        .f01-wall { position: absolute; left: 0; right: 0; top: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px; filter: blur(9px) brightness(0.45); }
        .f01-wall img { width: 100%; height: 300px; object-fit: cover; border-radius: 14px; display: block; }
        .f01-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 35% 50%, rgba(13,12,11,0.2) 0%, rgba(13,12,11,0.92) 75%); }
        .f01-copy { position: absolute; left: 140px; top: 210px; }
        .f01-clock { font-size: 400px; color: var(--amber); text-shadow: 0 0 60px rgba(255,181,71,0.45); }
        .f01-sub { margin-top: 26px; font-size: 64px; }
        .f01-rec { position: absolute; right: 120px; top: 90px; display: flex; gap: 16px; align-items: center; }
        .f01-dot { width: 22px; height: 22px; border-radius: 50%; background: var(--red); display: block; }"""
    html = f"""
          <div class="f01-tilt"><div class="f01-wall" id="f01-wall">{''.join(f'<img src="{ST}{t}.png" />' for t in tiles)}</div></div>
          <div class="f01-shade"></div>
          <div class="fd-grain"></div>
          <div class="f01-rec"><span class="f01-dot" id="f01-dot"></span><span class="fd-label">Friday · 9:41 pm · still browsing</span></div>
          <div class="f01-copy"><div class="fd-marquee f01-clock" id="f01-clock">00:00</div><div class="fd-marquee f01-sub" id="f01-sub">minutes choosing</div></div>"""
    js = f"""
        tl.fromTo("#f01-wall", {{ y: 0 }}, {{ y: -520, duration: D, ease: "none" }}, 0);
        const clock = {{ m: 0 }};
        const el = document.getElementById("f01-clock");
        tl.fromTo(clock, {{ m: 0 }}, {{ m: 20, duration: {t20 + 0.25:.3f}, ease: "power2.in",
          onUpdate: () => {{ const s = Math.round(clock.m * 60); el.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }} }}, 0);
        tl.fromTo("#f01-clock", {{ scale: 1.12 }}, {{ scale: 1, duration: 0.35, ease: "back.out(3)" }}, {t20 + 0.25:.3f});
        tl.fromTo("#f01-sub", {{ opacity: 0, y: 30 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }}, {t20 + 0.3:.3f});
        tl.fromTo("#f01-dot", {{ opacity: 1 }}, {{ opacity: 0.2, duration: 0.5, repeat: {int(d / 0.5) - 1}, yoyo: true, ease: "none" }}, 0);"""
    return css, html, js


def scene_02(c, d):
    tn = c("02", "nothing")
    css = """
        .f02 { position: absolute; inset: 0; background: #050404; display: flex; align-items: center; justify-content: center; }
        .f02-word { font-size: 330px; color: var(--red); text-shadow: 0 0 80px rgba(255,107,94,0.35); }
        .f02-line { position: absolute; left: 0; right: 0; top: 538px; height: 4px; background: rgba(246,239,228,0.85); }
        .f02-tag { position: absolute; left: 120px; bottom: 100px; }"""
    html = """
          <div class="f02">
            <div class="f02-line" id="f02-line"></div>
            <div class="fd-marquee f02-word" id="f02-word">Nothing.</div>
            <div class="fd-label f02-tag" id="f02-tag">Watch time tonight: 0 min</div>
          </div>"""
    js = f"""
        tl.fromTo("#f02-line", {{ scaleX: 1, opacity: 1 }}, {{ scaleX: 0, opacity: 0.2, duration: 0.45, ease: "power3.in" }}, 0);
        tl.fromTo("#f02-word", {{ scale: 1.2, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.3, ease: "power3.out" }}, {tn:.3f});
        tl.fromTo("#f02-tag", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3 }}, {tn + 0.4:.3f});"""
    return css, html, js


def scene_03(c, d):
    t5, t10, t0 = c("03", "five"), c("03", "ten"), c("03", "zero")
    tc, tch = c("03", "content"), c("03", "choosing")
    css = """
        .f03-glow { width: 1400px; height: 1400px; left: -300px; top: -500px; }
        .f03-stats { position: absolute; left: 120px; right: 120px; top: 120px; display: flex; gap: 60px; }
        .f03-stat { flex: 0 0 auto; }
        .f03-s1 { width: 300px; } .f03-s2 { width: 760px; } .f03-s3 { width: 520px; }
        .f03-num { font-size: 240px; }
        .f03-cap { margin-top: 10px; font-size: 54px; color: var(--muted); }
        .f03-x { position: relative; display: inline-block; }
        .f03-bar { position: absolute; left: -20px; right: -20px; top: 45%; height: 18px; background: var(--red); border-radius: 9px; display: block; transform-origin: left center; }
        .f03-rule { position: absolute; left: 120px; right: 120px; top: 640px; height: 4px; background: rgba(255,181,71,0.35); transform-origin: left center; }
        .f03-line { position: absolute; left: 120px; right: 120px; top: 690px; font-size: 80px; font-weight: 700; line-height: 1.15; }
        .f03-strike { position: relative; display: inline-block; color: var(--muted); }
        .f03-sbar { position: absolute; left: -6px; right: -6px; top: 52%; height: 10px; background: var(--red); display: block; transform-origin: left center; }
        .f03-ch { display: inline-block; }"""
    html = """
          <div class="fd-glow f03-glow" id="f03-glow"></div>
          <div class="fd-grain"></div>
          <div class="f03-stats">
            <div class="f03-stat f03-s1" id="f03-a"><div class="fd-marquee f03-num">5</div><div class="fd-marquee f03-cap">apps</div></div>
            <div class="f03-stat f03-s2" id="f03-b"><div class="fd-marquee f03-num" id="f03-n10">0</div><div class="fd-marquee f03-cap">titles</div></div>
            <div class="f03-stat f03-s3" id="f03-c"><div class="fd-marquee f03-num fd-red"><span class="f03-x">0<span class="f03-bar" id="f03-bar"></span></span></div><div class="fd-marquee f03-cap">decisions</div></div>
          </div>
          <div class="f03-rule" id="f03-rule"></div>
          <div class="f03-line" id="f03-line">Not a <span class="f03-strike">content<span class="f03-sbar" id="f03-sbar"></span></span> problem. A <span class="fd-amber f03-ch" id="f03-ch">choosing</span> problem.</div>"""
    js = f"""
        tl.fromTo("#f03-glow", {{ scale: 0.9, opacity: 0.6 }}, {{ scale: 1.1, opacity: 1, duration: D, ease: "sine.inOut" }}, 0);
        tl.fromTo("#f03-a", {{ y: -80, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.3, ease: "back.out(2)" }}, {t5:.3f});
        tl.fromTo("#f03-b", {{ y: -80, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.3, ease: "back.out(2)" }}, {t10:.3f});
        const n = {{ v: 0 }}; const nEl = document.getElementById("f03-n10");
        tl.fromTo(n, {{ v: 0 }}, {{ v: 10000, duration: 0.7, ease: "power2.out", onUpdate: () => {{ nEl.textContent = Math.round(n.v).toLocaleString("en-US"); }} }}, {t10:.3f});
        tl.fromTo("#f03-c", {{ y: -80, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.3, ease: "back.out(2)" }}, {t0:.3f});
        tl.fromTo("#f03-bar", {{ scaleX: 0, rotation: -14 }}, {{ scaleX: 1, rotation: -14, duration: 0.25, ease: "power3.out" }}, {t0 + 0.3:.3f});
        tl.fromTo("#f03-rule", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.5, ease: "power2.out" }}, {tc - 0.6:.3f});
        tl.fromTo("#f03-line", {{ opacity: 0, y: 30 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }}, {tc - 0.5:.3f});
        tl.fromTo("#f03-sbar", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.25, ease: "power2.out" }}, {tc + 0.3:.3f});
        tl.fromTo("#f03-ch", {{ y: -40, scale: 1.15, opacity: 0 }}, {{ y: 0, scale: 1, opacity: 1, duration: 0.35, ease: "power3.out" }}, {tch:.3f});"""
    return css, html, js


def scene_04(c, d):
    tw, tf, tb = c("04", "firedrift"), c("04", "feed"), c("04", "butler")
    p_html, p_js = poster("f04-pst", "butler-surprise.mp4", tb - 0.2, d - tb + 0.2, 13.6)
    css = """
        .f04-glow { width: 1600px; height: 900px; left: 160px; top: -380px; }
        .f04-sign { position: absolute; left: 560px; top: 70px; width: 800px; height: 190px; border: 5px solid var(--glow); border-radius: 22px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 70px rgba(255,181,71,0.5), inset 0 0 40px rgba(255,181,71,0.25); }
        .f04-word { font-size: 170px; text-shadow: 0 0 30px rgba(255,217,160,0.8); }
        .f04-panel { position: absolute; top: 320px; width: 780px; height: 439px; }
        .f04-left { left: 120px; } .f04-right { right: 120px; }
        .f04-panel .vid { width: 780px; height: 439px; }
        .f04-cap { position: absolute; top: 800px; width: 780px; display: flex; gap: 18px; align-items: baseline; }
        .f04-cap .fd-marquee { font-size: 72px; }
        .f04-capl { left: 120px; } .f04-capr { right: 120px; }
        .f04-or { position: absolute; left: 930px; top: 530px; width: 60px; text-align: center; font-size: 56px; }"""
    html = f"""
          <div class="fd-glow f04-glow"></div>
          <div class="fd-grain"></div>
          <div class="f04-sign" id="f04-sign"><div class="fd-marquee f04-word">FireDrift</div></div>
          <div class="fd-frame f04-panel f04-left" id="f04-l">{vid("f04-v1", "feed-browse.mp4", tf - 0.2, d - tf + 0.2, 1.0)}</div>
          <div class="fd-frame f04-panel f04-right" id="f04-r">{vid("f04-v2", "butler-surprise.mp4", tb - 0.2, d - tb + 0.2, 13.6)}<div class="pst-fit">{p_html}</div></div>
          <div class="fd-marquee fd-amber f04-or" id="f04-or">or</div>
          <div class="f04-cap f04-capl" id="f04-cl"><span class="fd-marquee">The feed</span><span class="fd-label">with the remote</span></div>
          <div class="f04-cap f04-capr" id="f04-cr"><span class="fd-marquee">The butler</span><span class="fd-label">with your voice</span></div>"""
    js = f"""
        tl.fromTo("#f04-sign", {{ scale: 1.3, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.45, ease: "power3.out" }}, 0.05);
        tl.fromTo("#f04-sign", {{ scale: 1.04 }}, {{ scale: 1, duration: 0.3, ease: "power2.out", immediateRender: false }}, {tw:.3f});
        tl.fromTo("#f04-sign", {{ boxShadow: "0 0 0px rgba(255,181,71,0)" }}, {{ boxShadow: "0 0 90px rgba(255,181,71,0.65)", duration: 0.6, ease: "power2.out" }}, {tw + 0.3:.3f});
        tl.fromTo("#f04-l", {{ x: -900, opacity: 0 }}, {{ x: 0, opacity: 1, duration: 0.45, ease: "expo.out" }}, {tf - 0.25:.3f});
        tl.fromTo("#f04-cl", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.3 }}, {tf:.3f});
        tl.fromTo("#f04-or", {{ scale: 0 }}, {{ scale: 1, duration: 0.3, ease: "back.out(3)" }}, {tb - 0.6:.3f});
        tl.fromTo("#f04-r", {{ x: 900, opacity: 0 }}, {{ x: 0, opacity: 1, duration: 0.45, ease: "expo.out" }}, {tb - 0.25:.3f});
        tl.fromTo("#f04-cr", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.3 }}, {tb:.3f});{p_js}"""
    return css, html, js


def scene_05(c, d):
    # Footage: feed-browse.mp4 presses: RIGHT 2.53 (like), LEFT 9.47 (skip), LEFT 19.43 (skip).
    tr, tl_, tt = c("05", "right"), c("05", "left"), c("05", "taste")
    a0, a1 = 0.0, tl_ - 0.5
    b1 = tt - 0.3
    segs = [("f05-a", a0, a1 - a0, max(2.53 - (tr - 0.15), 0.0)),
            ("f05-b", a1, b1 - a1, 9.47 - 0.5),
            ("f05-c", b1, d - b1, 19.43 - 0.5)]
    press = [("r", tr - 0.15), ("l", tl_), ("l", b1 + 0.5)]
    css = """
        .f05-remote { position: absolute; right: 100px; top: 600px; width: 300px; height: 300px; border-radius: 50%; background: #1b1916; border: 4px solid #3a352e; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
        .f05-ok { position: absolute; left: 95px; top: 95px; width: 110px; height: 110px; border-radius: 50%; background: #2e2a25; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 30px; }
        .f05-key { position: absolute; width: 0; height: 0; border-style: solid; }
        .f05-r { right: 26px; top: 122px; border-width: 28px 0 28px 40px; border-color: transparent transparent transparent #6b645a; }
        .f05-l { left: 26px; top: 122px; border-width: 28px 40px 28px 0; border-color: transparent #6b645a transparent transparent; }
        .f05-rl { border-color: transparent transparent transparent var(--amber); filter: drop-shadow(0 0 16px var(--amber)); }
        .f05-ll { border-color: transparent var(--amber) transparent transparent; filter: drop-shadow(0 0 16px var(--amber)); }
        .f05-tag { position: absolute; right: 150px; top: 500px; }
        .f05-taste { position: absolute; right: 100px; top: 930px; width: 420px; padding: 22px 28px; border-radius: 20px; background: rgba(13,12,11,0.85); border: 3px solid rgba(255,181,71,0.5); }
        .f05-bar { margin-top: 12px; height: 18px; border-radius: 9px; background: var(--raised); overflow: hidden; }
        .f05-fill { width: 100%; height: 100%; background: var(--amber); display: block; transform-origin: left center; }"""
    vids = "".join(f'<div class="cam" id="{i}-cam">{vid(i, "feed-browse.mp4", s, dd, ms)}</div>' for i, s, dd, ms in segs)
    keys = "".join(f'<div class="f05-key f05-{k} f05-{k}l" id="f05-p{j}"></div>' for j, (k, _) in enumerate(press))
    html = f"""
          {vids}
          <div class="f05-remote" id="f05-remote"><div class="f05-ok">OK</div><div class="f05-key f05-r"></div><div class="f05-key f05-l"></div>{keys}</div>
          <div class="fd-pill on f05-tag" id="f05-like">&#9829; Like</div>
          <div class="fd-pill f05-tag" id="f05-skip">Skip</div>
          <div class="f05-taste" id="f05-taste"><div class="fd-label">Your taste · learning</div><div class="f05-bar"><span class="f05-fill" id="f05-fill"></span></div></div>"""
    js_keys = "\n".join(
        f'        tl.fromTo("#f05-p{j}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.05 }}, {t:.3f}).to("#f05-p{j}", {{ opacity: 0, duration: 0.3 }}, {t + 0.5:.3f});'
        for j, (_, t) in enumerate(press))
    js = f"""
        tl.fromTo("#f05-remote", {{ x: 420 }}, {{ x: 0, duration: 0.45, ease: "expo.out" }}, 0.3);
        tl.fromTo("#f05-a-cam", {{ scale: 1 }}, {{ scale: 1.05, duration: {segs[0][2]:.3f}, ease: "none", transformOrigin: "30% 45%" }}, 0);
        tl.fromTo("#f05-b-cam", {{ scale: 1.05 }}, {{ scale: 1, duration: {segs[1][2]:.3f}, ease: "none", transformOrigin: "50% 40%" }}, {segs[1][1]:.3f});
        tl.fromTo("#f05-c-cam", {{ scale: 1 }}, {{ scale: 1.05, duration: {segs[2][2]:.3f}, ease: "none", transformOrigin: "40% 45%" }}, {segs[2][1]:.3f});
{js_keys}
        tl.fromTo("#f05-like", {{ scale: 0, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.3, ease: "back.out(3)" }}, {tr:.3f}).to("#f05-like", {{ opacity: 0, duration: 0.2 }}, {tr + 1.4:.3f});
        tl.fromTo("#f05-skip", {{ scale: 0, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.3, ease: "back.out(3)" }}, {tl_:.3f}).to("#f05-skip", {{ opacity: 0, duration: 0.2 }}, {tl_ + 1.2:.3f});
        tl.fromTo("#f05-taste", {{ y: 200 }}, {{ y: 0, duration: 0.4, ease: "power3.out" }}, {tr - 0.4:.3f});
        tl.fromTo("#f05-fill", {{ scaleX: 0.15 }}, {{ scaleX: 0.4, duration: 0.4, ease: "power2.out" }}, {tr + 0.1:.3f});
        tl.fromTo("#f05-fill", {{ scaleX: 0.4 }}, {{ scaleX: 0.55, duration: 0.4, ease: "power2.out", immediateRender: false }}, {tl_ + 0.1:.3f});
        tl.fromTo("#f05-fill", {{ scaleX: 0.55 }}, {{ scaleX: 0.85, duration: 0.6, ease: "power2.out", immediateRender: false }}, {tt:.3f});"""
    return css, html, js


def scene_06(c, d):
    # watch-now.mp4: ENTER at 2.54 opens the sheet (about 0.4 s later), DOWN 5.77, UP 8.17.
    tok, tapp, tsv = c("06", "ok"), c("06", "app"), c("06", "service")
    ms = max(2.54 - tok, 0.0)
    cut = 5.6 - ms
    css = """
        .f06-ring { position: absolute; left: 1050px; top: 352px; width: 820px; height: 136px; border: 6px solid var(--glow); border-radius: 60px; box-shadow: 0 0 50px rgba(255,217,160,0.8); }
        .f06-chips { position: absolute; left: 100px; top: 70px; display: flex; gap: 20px; }"""
    html = f"""
          <div class="cam" id="f06-cam">{vid("f06-v", "watch-now.mp4", 0, cut, ms)}{vid("f06-w", "watch-now.mp4", cut, d - cut, 8.45)}<div class="f06-ring" id="f06-ring"></div></div>
          <div class="f06-chips" id="f06-chips"><div class="fd-pill on">Your services</div><div class="fd-pill">Your country</div></div>"""
    js = f"""
        tl.fromTo("#f06-cam", {{ scale: 1 }}, {{ scale: 1.08, duration: 1.2, ease: "power1.inOut", transformOrigin: "75% 38%" }}, {tapp - 0.6:.3f});
        tl.fromTo("#f06-ring", {{ opacity: 0, scale: 1.15 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "power3.out" }}, {tapp + 0.5:.3f});
        tl.fromTo("#f06-chips", {{ y: -160 }}, {{ y: 0, duration: 0.4, ease: "back.out(2)" }}, {tsv - 0.2:.3f});"""
    return css, html, js


def scene_07(c, d):
    t1, t2, t3, tb = c("07", "one"), c("07", "every"), c("07", "vega"), c("07", "but")
    tiles = ["menu", "settings", "about", "watch-now", "butler-start", "feed-1", "settings", "menu-settings", "about"]
    css = """
        .f07-tilt { position: absolute; inset: -60px; transform: rotate(-4deg); }
        .f07-tiles { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; filter: brightness(0.3) saturate(0.8); }
        .f07-tiles img { width: 100%; height: 380px; object-fit: cover; display: block; border-radius: 14px; }
        .f07-title { position: absolute; left: 120px; top: 110px; font-size: 120px; }
        .f07-cards { position: absolute; left: 120px; right: 120px; top: 400px; display: flex; gap: 40px; }
        .f07-card { flex: 1; height: 420px; padding: 48px; border-radius: 24px; background: rgba(25,23,20,0.92); border: 3px solid rgba(255,181,71,0.45); display: flex; flex-direction: column; justify-content: space-between; }
        .f07-num { font-size: 200px; color: var(--amber); }
        .f07-cap { font-size: 46px; font-weight: 700; }
        .f07-freeze { position: absolute; inset: 0; background: rgba(13,12,11,0.7); }"""
    html = f"""
          <div class="f07-tilt"><div class="f07-tiles" id="f07-tiles">{''.join(f'<img src="{ST}{t}.png" />' for t in tiles)}</div></div>
          <div class="fd-marquee f07-title" id="f07-title">Built <span class="fd-amber">for</span> the TV</div>
          <div class="f07-cards">
            <div class="f07-card" id="f07-c1"><div class="fd-marquee f07-num">1</div><div class="f07-cap">cover in memory at a time</div></div>
            <div class="f07-card" id="f07-c2"><div class="fd-marquee f07-num" id="f07-pct">0%</div><div class="f07-cap">D-pad, every screen</div></div>
            <div class="f07-card" id="f07-c3"><div class="fd-marquee f07-num">Vega</div><div class="f07-cap">OS, native React Native</div></div>
          </div>
          <div class="f07-freeze" id="f07-freeze"></div>"""
    js = f"""
        tl.fromTo("#f07-tiles", {{ y: 0 }}, {{ y: -260, duration: D, ease: "none" }}, 0);
        tl.fromTo("#f07-title", {{ x: -80, opacity: 0 }}, {{ x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }}, 0.15);
        tl.fromTo("#f07-c1", {{ y: 160, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.8)" }}, {t1 - 0.1:.3f});
        tl.fromTo("#f07-c2", {{ y: 160, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.8)" }}, {t2 - 0.1:.3f});
        const p = {{ v: 0 }}; const pEl = document.getElementById("f07-pct");
        tl.fromTo(p, {{ v: 0 }}, {{ v: 100, duration: 0.6, ease: "power2.out", onUpdate: () => {{ pEl.textContent = Math.round(p.v) + "%"; }} }}, {t2:.3f});
        tl.fromTo("#f07-c3", {{ y: 160, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.8)" }}, {t3 - 0.1:.3f});
        tl.fromTo("#f07-freeze", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.25 }}, {tb - 0.1:.3f});"""
    return css, html, js


def scene_08(c, d):
    tb = c("08", "butler")
    css = """
        .f08-cam { position: absolute; inset: 0; }
        .f08-iris { position: absolute; inset: 0; background: radial-gradient(circle at 26% 50%, rgba(13,12,11,0) 0px, rgba(13,12,11,0) 380px, rgba(13,12,11,1) 470px); }
        .f08-black { position: absolute; inset: 0; background: var(--bg); }
        .f08-copy { position: absolute; left: 1040px; top: 340px; }
        .f08-title { font-size: 210px; }
        .f08-sub { margin-bottom: 26px; }"""
    html = f"""
          <div class="f08-cam" id="f08-cam">{vid("f08-v", "butler-open.mp4", 0, d, 4.0)}</div>
          <div class="f08-iris" id="f08-iris"></div>
          <div class="f08-black" id="f08-black"></div>
          <div class="f08-copy"><div class="fd-label f08-sub" id="f08-sub">Still can't decide?</div><div class="fd-marquee f08-title" id="f08-title">Your <span class="fd-amber">butler</span></div></div>"""
    js = f"""
        tl.fromTo("#f08-cam", {{ scale: 1.15 }}, {{ scale: 1.1, duration: D, ease: "none", transformOrigin: "20% 50%" }}, 0);
        tl.fromTo("#f08-black", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.5, ease: "power2.out" }}, 0.1);
        tl.fromTo("#f08-iris", {{ scale: 0.2, transformOrigin: "26% 50%" }}, {{ scale: 1, duration: 0.7, ease: "expo.out" }}, 0.1);
        tl.fromTo("#f08-sub", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3 }}, 0.3);
        tl.fromTo("#f08-title", {{ y: 120, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.45, ease: "power4.out" }}, {tb - 0.35:.3f});"""
    return css, html, js


def scene_09(c, d, butler_local, butler_dur):
    # butler-surprise.mp4: ENTER 2.53, thinking until about 14.0, speaking 14.4 to 21, chips after.
    tsm = c("09a", "surprise")
    press_ms = max(2.53 - tsm, 0.0)
    think0 = 0.2 + 1.6
    ans0 = butler_local - 0.45
    after = butler_local + butler_dur + 0.2
    segs = [("f09-a", 0.0, think0, press_ms), ("f09-b", think0, ans0 - think0, 12.0), ("f09-c", ans0, after - ans0, 13.95),
            ("f09-d", after, d - after, 20.6)]
    css = """
        .f09-tag { position: absolute; left: 60px; top: 30px; padding: 14px 24px; border-radius: 12px; background: rgba(13,12,11,0.85); border: 2px solid rgba(255,181,71,0.5); }
        .f09-quote { position: absolute; left: 200px; right: 200px; bottom: 50px; text-align: center; font-size: 50px; font-weight: 600; font-style: italic; color: var(--glow); background: rgba(13,12,11,0.88); border-radius: 18px; padding: 16px 30px; }"""
    posters = [poster(f"{i}-pst", "butler-surprise.mp4", s, dd, ms) for i, s, dd, ms in segs]
    vids = "".join(f'<div class="cam" id="{i}-cam">{vid(i, "butler-surprise.mp4", s, dd, ms)}{p[0]}</div>'
                   for (i, s, dd, ms), p in zip(segs, posters))
    p_js = "".join(p[1] for p in posters)
    html = f"""
          {vids}
          <div class="fd-label f09-tag" id="f09-tag">Live answer · Claude Haiku 4.5 · Amazon Polly</div>
          <div class="f09-quote" id="f09-quote">“How about this one? A clever mystery series with plenty of twists.”</div>"""
    js = f"""
        tl.fromTo("#f09-a-cam", {{ scale: 1 }}, {{ scale: 1.08, duration: {think0:.3f}, ease: "power1.inOut", transformOrigin: "55% 40%" }}, 0);
        tl.fromTo("#f09-b-cam", {{ scale: 1.12 }}, {{ scale: 1.15, duration: {ans0 - think0:.3f}, ease: "none", transformOrigin: "22% 45%" }}, {think0:.3f});
        tl.fromTo("#f09-c-cam", {{ scale: 1 }}, {{ scale: 1.04, duration: {after - ans0:.3f}, ease: "none", transformOrigin: "60% 40%" }}, {ans0:.3f});
        tl.fromTo("#f09-d-cam", {{ scale: 1.04 }}, {{ scale: 1.1, duration: 1.2, ease: "power1.inOut", transformOrigin: "70% 75%" }}, {after + c("09b", "chips") - c("09b", "he") - 0.6:.3f});{p_js}
        tl.fromTo("#f09-tag", {{ opacity: 0, y: -30 }}, {{ opacity: 1, y: 0, duration: 0.3 }}, {ans0 + 0.2:.3f});
        tl.fromTo("#f09-quote", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.3 }}, {butler_local:.3f}).to("#f09-quote", {{ opacity: 0, duration: 0.25 }}, {butler_local + butler_dur:.3f});"""
    return css, html, js


def scene_10(c, d):
    # butler-lighter.mp4: ENTER 2.53, "Taste changed" banner from about 5.8 s, new card with poster from about 11 s.
    tl_, tch, tun, tct = c("10", "lighter"), c("10", "changes"), c("10", "undo"), c("10", "control")
    s1 = tch - 0.3
    s2 = tct - 0.2
    segs = [("f10-a", 0.0, s1, max(2.53 - tl_ + 0.1, 0.0)), ("f10-b", s1, s2 - s1, 5.9), ("f10-c", s2, d - s2, 11.6)]
    css = """
        .f10-ring { position: absolute; left: 1440px; top: 652px; width: 196px; height: 102px; border: 6px solid var(--glow); border-radius: 52px; box-shadow: 0 0 50px rgba(255,217,160,0.9); }
        .f10-meter { position: absolute; left: 120px; top: 90px; width: 640px; padding: 28px 34px; border-radius: 22px; background: rgba(13,12,11,0.9); border: 3px solid rgba(255,181,71,0.5); }
        .f10-row { display: flex; align-items: center; gap: 24px; margin-top: 14px; }
        .f10-name { width: 190px; font-size: 52px; }
        .f10-track { flex: 1; height: 28px; border-radius: 14px; background: var(--raised); overflow: hidden; }
        .f10-fill { width: 100%; height: 100%; display: block; transform-origin: left center; }
        .f10-down { background: var(--red); } .f10-up { background: var(--amber); }"""
    posters = [poster(f"{i}-pst", "butler-lighter.mp4", s, dd, ms) for i, s, dd, ms in segs]
    # The Undo ring sits in the same camera as the clip, so the zoom keeps it on the button.
    ring = {"f10-b": '<div class="f10-ring" id="f10-ring"></div>'}
    vids = "".join(f'<div class="cam" id="{i}-cam">{vid(i, "butler-lighter.mp4", s, dd, ms)}{p[0]}{ring.get(i, "")}</div>'
                   for (i, s, dd, ms), p in zip(segs, posters))
    p_js = "".join(p[1] for p in posters)
    html = f"""
          {vids}
          <div class="f10-meter" id="f10-meter">
            <div class="fd-label">Your taste</div>
            <div class="f10-row"><span class="fd-marquee f10-name">Heavy</span><span class="f10-track"><span class="f10-fill f10-down" id="f10-down"></span></span></div>
            <div class="f10-row"><span class="fd-marquee f10-name">Lighter</span><span class="f10-track"><span class="f10-fill f10-up" id="f10-up"></span></span></div>
          </div>"""
    js = f"""
        tl.fromTo("#f10-a-cam", {{ scale: 1.04 }}, {{ scale: 1.08, duration: {s1:.3f}, ease: "none", transformOrigin: "62% 40%" }}, 0);
        tl.fromTo("#f10-b-cam", {{ scale: 1 }}, {{ scale: 1.12, duration: 1.2, ease: "power1.inOut", transformOrigin: "72% 65%" }}, {tun - 1.0:.3f});
        tl.fromTo("#f10-ring", {{ opacity: 0, scale: 1.4 }}, {{ opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }}, {tun + 0.15:.3f}).to("#f10-ring", {{ opacity: 0, duration: 0.2 }}, {s2 - 0.1:.3f});
        tl.fromTo("#f10-meter", {{ x: -760 }}, {{ x: 0, duration: 0.45, ease: "expo.out" }}, {tch - 0.1:.3f}).to("#f10-meter", {{ x: -760, duration: 0.3, ease: "power2.in" }}, {tun - 0.7:.3f});
        tl.fromTo("#f10-down", {{ scaleX: 0.75 }}, {{ scaleX: 0.3, duration: 0.6, ease: "power2.inOut" }}, {tch + 0.3:.3f});
        tl.fromTo("#f10-up", {{ scaleX: 0.35 }}, {{ scaleX: 0.85, duration: 0.6, ease: "power2.inOut" }}, {tch + 0.3:.3f});
        tl.fromTo("#f10-c-cam", {{ scale: 1.04 }}, {{ scale: 1.1, duration: {d - s2:.3f}, ease: "none", transformOrigin: "75% 30%" }}, {s2:.3f});{p_js}"""
    return css, html, js


def scene_11(c, d):
    t1, t2, t3, tx = c("11", "listens"), c("11", "thinks"), c("11", "speaks"), c("11", "exact")
    a, b, cc = t1 - 0.15, t2 - 0.15, t3 - 0.15
    segs = [("f11-a", 0.0, b, "butler-listen.mp4", 3.6 - a), ("f11-b", b, cc - b, "butler-listen.mp4", 7.4),
            ("f11-c", cc, d - cc, "butler-surprise.mp4", 14.6)]
    css = """
        .f11-cam { position: absolute; inset: 0; }
        .f11-veil { position: absolute; top: 0; bottom: 0; left: 900px; right: 0; background: linear-gradient(90deg, rgba(13,12,11,0) 0%, rgba(13,12,11,0.96) 14%, rgba(13,12,11,0.98) 100%); }
        .f11-lab { position: absolute; left: 1060px; top: 380px; font-size: 220px; }
        .f11-wave { position: absolute; left: 980px; right: 120px; top: 760px; height: 80px; display: flex; align-items: center; gap: 6px; }
        .f11-wave span { flex: 1; background: rgba(246,239,228,0.45); border-radius: 3px; display: block; }
        .f11-mark { position: absolute; left: 1480px; top: 740px; width: 8px; height: 120px; background: var(--amber); box-shadow: 0 0 24px var(--amber); }
        .f11-wl { position: absolute; left: 1440px; top: 880px; font-size: 32px; color: var(--amber); }"""
    posters = [poster(f"{i}-pst", src, s, dd, max(ms, 0.0)) for i, s, dd, src, ms in segs]
    vids = "".join(f'<div class="f11-cam" id="{i}-cam">{vid(i, src, s, dd, max(ms, 0.0))}{p[0]}</div>'
                   for (i, s, dd, src, ms), p in zip(segs, posters))
    bars = "".join(f'<span style="height:{h}px"></span>' for h in [18, 30, 52, 40, 64, 28, 46, 70, 34, 22, 58, 44, 66, 30, 20, 48, 62, 36, 26, 54, 40, 68, 32, 24, 50, 60, 38, 28, 46, 56])
    labels = "".join(f'<div class="fd-marquee f11-lab{" fd-amber" if i == 2 else ""}" id="f11-l{i}">{w}</div>' for i, w in enumerate(["Listens", "Thinks", "Speaks"]))
    html = f"""
          {vids}
          <div class="f11-veil"></div>
          {labels}
          <div class="f11-wave" id="f11-wave">{bars}</div>
          <div class="f11-mark" id="f11-mark"></div>
          <div class="fd-label f11-wl" id="f11-wl">speech mark → gesture</div>"""
    js = "\n".join([
        *(f'        tl.set("#{i}-cam", {{ scale: 1.3, transformOrigin: "21% 48%" }}, 0);' for i, *_ in segs),
        *(p[1].lstrip("\n") for p in posters if p[1]),
        f'        tl.fromTo("#f11-l0", {{ opacity: 0, x: 60 }}, {{ opacity: 1, x: 0, duration: 0.2 }}, {t1:.3f}).set("#f11-l0", {{ opacity: 0 }}, {b:.3f});',
        f'        tl.fromTo("#f11-l1", {{ opacity: 0, x: 60 }}, {{ opacity: 1, x: 0, duration: 0.2 }}, {t2:.3f}).set("#f11-l1", {{ opacity: 0 }}, {cc:.3f});',
        f'        tl.fromTo("#f11-l2", {{ opacity: 0, x: 60 }}, {{ opacity: 1, x: 0, duration: 0.2 }}, {t3:.3f}).to("#f11-l2", {{ y: -200, duration: 0.4, ease: "power2.inOut" }}, {tx - 1.2:.3f});',
        f'        tl.fromTo("#f11-wave", {{ opacity: 0, scaleY: 0.2 }}, {{ opacity: 1, scaleY: 1, duration: 0.4, ease: "power3.out" }}, {tx - 1.0:.3f});',
        f'        tl.fromTo("#f11-mark", {{ opacity: 0, scaleY: 0 }}, {{ opacity: 1, scaleY: 1, duration: 0.25, ease: "back.out(3)" }}, {tx:.3f});',
        f'        tl.fromTo("#f11-wl", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3 }}, {tx + 0.1:.3f});',
    ])
    return css, html, js


def scene_12(c, d):
    cue = {k: c("12", w) for k, w in [("hood", "hood"), ("strands", "strands"), ("bedrock", "bedrock"), ("haiku", "haiku"),
                                      ("tr", "transcribe"), ("po", "polly"), ("gw", "gateway"), ("la", "lambdas"), ("tools", "tools")]}
    nodes = [  # id, left, top, width, title, sub, appear cue
        ("app", 120, 470, 310, "Fire TV app", "Vega OS · React Native", 0.2),
        ("rt", 640, 470, 450, "AgentCore Runtime", "Strands agent · Bedrock · Claude Haiku 4.5", cue["strands"]),
        ("tr", 700, 260, 300, "Transcribe", "hears you", cue["tr"]),
        ("po", 1060, 260, 300, "Polly", "speaks · speech marks", cue["po"]),
        ("gw", 1270, 470, 520, "AgentCore Gateway", "our Lambdas become tools", cue["gw"]),
        ("ld", 640, 690, 260, "Lambda", "taste ranking · tools", cue["la"]),
        ("db", 1150, 690, 330, "DynamoDB", "your taste", cue["tools"]),
        ("tm", 1500, 690, 300, "TMDB", "confirms every title", cue["tools"] + 0.15),
        ("api", 120, 690, 310, "API Gateway", "the feed", cue["la"] + 0.15),
    ]
    paths = [  # id, d, appear cue
        ("p1", "M430 525 H640", cue["strands"] - 0.1), ("p2", "M850 470 V365", cue["tr"] - 0.1), ("p3", "M1040 470 L1150 365", cue["po"] - 0.1),
        ("p4", "M1090 525 H1270", cue["gw"] - 0.1), ("p5", "M1440 590 L1315 690", cue["tools"]), ("p6", "M1600 590 L1650 690", cue["tools"]),
        ("p7", "M275 590 V690", cue["la"]), ("p8", "M430 745 H640", cue["la"] + 0.1), ("p9", "M900 745 H1150", cue["tools"]),
    ]
    css = """
        .f12-title { position: absolute; left: 120px; top: 80px; font-size: 96px; }
        .f12-count { position: absolute; right: 120px; top: 96px; text-align: right; }
        .f12-count .fd-marquee { font-size: 88px; color: var(--amber); }
        .f12-svg { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
        .f12-node { position: absolute; padding: 22px 28px; border-radius: 18px; background: var(--surface); border: 3px solid rgba(255,181,71,0.55); }
        .f12-node b { display: block; font-size: 36px; font-weight: 700; }
        .f12-node i { display: block; font-style: normal; font-size: 26px; color: var(--muted); margin-top: 6px; }
        .f12-hero { border-color: var(--amber); box-shadow: 0 0 60px rgba(255,181,71,0.35); }
        .f12-pulse { position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--glow); box-shadow: 0 0 24px var(--amber); }"""
    svg = "".join(f'<path id="f12-{i}" d="{p}" pathLength="1" stroke-dasharray="1" />' for i, p, _ in paths)
    nodes_html = "".join(f'<div class="f12-node{" f12-hero" if i == "rt" else ""}" id="f12-{i}" style="left:{l}px; top:{t}px; width:{w}px;"><b>{b}</b><i>{s}</i></div>'
                         for i, l, t, w, b, s, _ in nodes)
    html = f"""
          <div class="fd-grain"></div>
          <div class="fd-marquee f12-title" id="f12-title">Under the hood</div>
          <div class="f12-count" id="f12-count"><div class="fd-marquee"><span id="f12-n">0</span> AWS services</div><div class="fd-label">1 CDK deploy</div></div>
          <svg class="f12-svg" viewBox="0 0 1920 1080"><g stroke="#ffb547" stroke-width="4" fill="none" opacity="0.9">{svg}</g></svg>
          {nodes_html}
          <div class="f12-pulse" id="f12-pulse"></div>"""
    js = [f'        tl.fromTo("#f12-title", {{ opacity: 0, x: -60 }}, {{ opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }}, 0.1);']
    js += [f'        tl.fromTo("#f12-{i}", {{ opacity: 0, scale: 0.7 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }}, {t:.3f});' for i, *_, t in nodes]
    js += [f'        tl.fromTo("#f12-{i}", {{ strokeDashoffset: 1 }}, {{ strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }}, {t:.3f});' for i, _, t in paths]
    t_end = d - 2.2
    js += [
        f'        tl.fromTo("#f12-pulse", {{ x: 420, y: 514, opacity: 0 }}, {{ x: 620, y: 514, opacity: 1, duration: 0.5, ease: "none" }}, {t_end:.3f})',
        '          .to("#f12-pulse", { x: 1260, duration: 0.6, ease: "none" })',
        '          .to("#f12-pulse", { x: 1430, y: 690, duration: 0.4, ease: "none" })',
        '          .to("#f12-pulse", { opacity: 0, duration: 0.2 });',
        '        const n = { v: 0 }; const nEl = document.getElementById("f12-n");',
        f'        tl.fromTo("#f12-count", {{ opacity: 0, y: -30 }}, {{ opacity: 1, y: 0, duration: 0.3 }}, {t_end - 0.4:.3f});',
        f'        tl.fromTo(n, {{ v: 0 }}, {{ v: 10, duration: 0.8, ease: "power2.out", onUpdate: () => {{ nEl.textContent = Math.round(n.v); }} }}, {t_end - 0.4:.3f});',
    ]
    return css, "\n" + html, "\n".join(js)


def scene_13(c, d):
    tinv, ttm, tllm, tfast, tcheap = c("13", "invents"), c("13", "tmdb"), c("13", "llm"), c("13", "fast"), c("13", "cheap")
    css = """
        .f13-glow { width: 1200px; height: 1200px; right: -300px; top: -400px; }
        .f13-cards { position: absolute; left: 160px; right: 160px; top: 90px; display: flex; gap: 80px; }
        .f13-card { flex: 1; height: 600px; border-radius: 24px; padding: 40px; background: var(--surface); position: relative; overflow: hidden; }
        .f13-fake { border: 4px dashed rgba(255,107,94,0.7); }
        .f13-real { border: 4px solid var(--amber); }
        .f13-poster { height: 360px; border-radius: 14px; background: var(--raised); display: flex; align-items: center; justify-content: center; font-size: 140px; overflow: hidden; }
        .f13-poster img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .f13-name { margin-top: 30px; font-size: 64px; }
        .f13-meta { margin-top: 8px; font-size: 30px; color: var(--muted); }
        .f13-badge { position: absolute; right: 30px; top: 30px; width: 110px; height: 110px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 70px; font-weight: 700; }
        .f13-no { background: var(--red); color: #1a0705; }
        .f13-yes { background: var(--amber); color: var(--on-amber); }
        .f13-line { position: absolute; left: 160px; right: 160px; top: 770px; font-size: 92px; text-align: center; }
        .f13-tags { position: absolute; left: 0; right: 0; top: 900px; display: flex; justify-content: center; gap: 24px; }"""
    html = f"""
          <div class="fd-glow f13-glow"></div>
          <div class="f13-cards">
            <div class="f13-card f13-fake" id="f13-fake"><div class="f13-poster fd-marquee">?</div><div class="fd-marquee f13-name">Space Heist 3 (2027)</div><div class="f13-meta">Model guess · TMDB: no match · never shown</div><div class="f13-badge f13-no" id="f13-no">&#10005;</div></div>
            <div class="f13-card f13-real" id="f13-real"><div class="f13-poster"><img class="f13-pimg" src="{ST}poster-paradise.png" /></div><div class="fd-marquee f13-name">Death in Paradise (2011)</div><div class="f13-meta">TMDB match · poster, providers, link</div><div class="f13-badge f13-yes" id="f13-yes">&#10003;</div></div>
          </div>
          <div class="fd-marquee f13-line" id="f13-line">Feed: <span class="fd-amber">0</span> LLM calls</div>
          <div class="f13-tags"><div class="fd-pill on" id="f13-t1">Fast</div><div class="fd-pill on" id="f13-t2">Cheap</div></div>"""
    js = f"""
        tl.fromTo("#f13-fake", {{ y: 80, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }}, 0.15);
        tl.fromTo("#f13-no", {{ scale: 0 }}, {{ scale: 1, duration: 0.3, ease: "back.out(3)" }}, {tinv:.3f});
        tl.to("#f13-fake", {{ opacity: 0.35, scale: 0.94, duration: 0.3 }}, {tinv + 0.3:.3f});
        tl.fromTo("#f13-real", {{ y: 80, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }}, {ttm - 0.3:.3f});
        tl.fromTo("#f13-yes", {{ scale: 0 }}, {{ scale: 1, duration: 0.3, ease: "back.out(3)" }}, {ttm + 0.4:.3f});
        tl.fromTo("#f13-line", {{ opacity: 0, scale: 1.3 }}, {{ opacity: 1, scale: 1, duration: 0.3, ease: "power4.out" }}, {tllm - 0.2:.3f});
        tl.fromTo("#f13-t1", {{ scale: 0 }}, {{ scale: 1, duration: 0.25, ease: "back.out(3)" }}, {tfast:.3f});
        tl.fromTo("#f13-t2", {{ scale: 0 }}, {{ scale: 1, duration: 0.25, ease: "back.out(3)" }}, {tcheap:.3f});"""
    return css, html, js


def scene_14(c, d):
    ts, tst, tfd, thk = c("14", "stop"), c("14", "start"), c("14", "firedrift"), c("14", "hackathon")
    css = """
        .f14-glow { width: 1800px; height: 1000px; left: 60px; top: -100px; }
        .f14-slogan { position: absolute; left: 0; right: 0; top: 110px; text-align: center; font-size: 96px; color: var(--muted); }
        .f14-sign { position: absolute; left: 410px; top: 300px; width: 1100px; height: 260px; border: 6px solid var(--glow); border-radius: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 90px rgba(255,181,71,0.55), inset 0 0 50px rgba(255,181,71,0.3); }
        .f14-word { font-size: 240px; text-shadow: 0 0 36px rgba(255,217,160,0.85); }
        .f14-meta { position: absolute; left: 0; right: 0; top: 620px; text-align: center; font-size: 40px; }
        .f14-event { position: absolute; left: 0; right: 0; top: 790px; text-align: center; font-size: 40px; }
        .f14-url { position: absolute; left: 0; right: 0; top: 700px; text-align: center; font-size: 44px; font-weight: 700; color: var(--amber); }
        .f14-butler { position: absolute; right: 90px; bottom: 0; width: 360px; height: 420px; overflow: hidden; border-radius: 18px 18px 0 0; }
        .f14-butler .vid { left: -50px; top: -81px; width: 1113px; height: 626px; }
        .f14-s1, .f14-s2 { display: inline-block; }"""
    html = f"""
          <div class="fd-glow f14-glow" id="f14-glow"></div>
          <div class="fd-grain"></div>
          <div class="fd-marquee f14-slogan"><span class="f14-s1" id="f14-s1">Stop scrolling.</span> <span class="fd-amber f14-s2" id="f14-s2">Start watching.</span></div>
          <div class="f14-sign" id="f14-sign"><div class="fd-marquee f14-word">FireDrift</div></div>
          <div class="fd-label f14-meta" id="f14-meta">Open source · Fire TV · Vega OS · AWS</div>
          <div class="f14-url" id="f14-url">github.com/juanlo7/FireDrift-AmazonDeveloper</div>
          <div class="fd-label f14-event" id="f14-event">Amazon Developer Hackathon 2026 · Fire TV track</div>
          <div class="f14-butler" id="f14-butler">{vid("f14-v", "butler-open.mp4", 0, d, 5.0)}</div>"""
    js = f"""
        tl.fromTo("#f14-glow", {{ scale: 0.8, opacity: 0.4 }}, {{ scale: 1.15, opacity: 1, duration: D, ease: "sine.inOut" }}, 0);
        tl.fromTo("#f14-s1", {{ opacity: 0, y: 40 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, {ts:.3f});
        tl.fromTo("#f14-s2", {{ opacity: 0, y: 40 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, {tst:.3f});
        tl.fromTo("#f14-sign", {{ scale: 1.3, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }}, {tfd - 0.05:.3f});
        tl.fromTo("#f14-meta", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, {tfd + 0.6:.3f});
        tl.fromTo("#f14-url", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4 }}, {tfd + 0.9:.3f});
        tl.fromTo("#f14-event", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4 }}, {thk - 0.3:.3f});
        tl.fromTo("#f14-butler", {{ y: 440 }}, {{ y: 0, duration: 0.6, ease: "power3.out" }}, {tfd + 1.2:.3f});"""
    return css, html, js


# ---------------------------------------------------------------- captions + sfx + index

NO_CAPTIONS = {"02", "03", "14"}


def caption_groups(tl):
    groups = []
    for f in tl["frames"]:
        for track, off in f["tracks"]:
            if track in NO_CAPTIONS:
                continue
            words = tl["vo"][track]["words"]
            cur = []
            for w in words:
                cur.append(w)
                end_punct = re.search(r"[.,?!:…]$", w["text"])
                if len(cur) == 3 or end_punct or w["bold"] and len(cur) >= 2:
                    groups.append((f, off, cur)); cur = []
            if cur:
                groups.append((f, off, cur))
    out = []
    for i, (f, off, ws) in enumerate(groups):
        start = f["start"] + off + ws[0]["start"]
        end = f["start"] + off + ws[-1]["end"] + 0.15
        if i + 1 < len(groups):
            nf, noff, nws = groups[i + 1]
            nstart = nf["start"] + noff + nws[0]["start"]
            end = min(max(end, start + 0.35), nstart) if nstart - end < 0.5 else end
        end = min(end, f["start"] + f["dur"])
        clean = lambda t: t.replace('"', "").replace("“", "").replace("”", "")
        html = " ".join(f'<em>{clean(w["text"])}</em>' if w["bold"] else clean(w["text"]) for w in ws)
        out.append((round(start, 3), round(max(end - start, 0.2), 3), html))
    return out


def sfx_events(tl, cues_by_frame):
    ev = []
    for f in tl["frames"][1:]:
        ev.append(("whoosh", f["start"] - 0.2, 0.5))
    fr = {f["id"]: f for f in tl["frames"]}
    c = cues_by_frame
    ev += [
        ("hit", fr["f02"]["start"] + c["f02"]("02", "nothing"), 0.9),
        ("riser", fr["f04"]["start"] - 2.3, 0.35),
        ("hit", fr["f04"]["start"] + c["f04"]("04", "firedrift"), 0.8),
        ("pop", fr["f03"]["start"] + c["f03"]("03", "five"), 0.6),
        ("pop", fr["f03"]["start"] + c["f03"]("03", "ten"), 0.6),
        ("buzz", fr["f03"]["start"] + c["f03"]("03", "zero") + 0.3, 0.5),
        ("click", fr["f05"]["start"] + c["f05"]("05", "right") - 0.15, 0.9),
        ("click", fr["f05"]["start"] + c["f05"]("05", "left"), 0.9),
        ("click", fr["f06"]["start"] + c["f06"]("06", "ok"), 0.9),
        ("pop", fr["f07"]["start"] + c["f07"]("07", "one"), 0.5),
        ("pop", fr["f07"]["start"] + c["f07"]("07", "every"), 0.5),
        ("pop", fr["f07"]["start"] + c["f07"]("07", "vega"), 0.5),
        ("click", fr["f09"]["start"] + c["f09"]("09a", "surprise"), 0.9),
        ("ding", fr["f10"]["start"] + c["f10"]("10", "undo") + 0.15, 0.5),
        ("buzz", fr["f13"]["start"] + c["f13"]("13", "invents"), 0.5),
        ("ding", fr["f13"]["start"] + c["f13"]("13", "tmdb") + 0.4, 0.5),
        ("hit", fr["f14"]["start"] + c["f14"]("14", "firedrift"), 0.8),
    ]
    return [(n, round(max(t, 0), 3), v) for n, t, v in ev]


def main():
    tl = build_timeline()
    scenes = {"f01": scene_01, "f02": scene_02, "f03": scene_03, "f04": scene_04, "f05": scene_05, "f06": scene_06, "f07": scene_07,
              "f08": scene_08, "f10": scene_10, "f11": scene_11, "f12": scene_12, "f13": scene_13, "f14": scene_14}
    cues = {}
    for f in tl["frames"]:
        c = Cues(tl, f)
        cues[f["id"]] = c
        if f["id"] == "f09":
            css, html, js = scene_09(c, f["dur"], tl["butler"]["local"], tl["butler"]["dur"])
        else:
            css, html, js = scenes[f["id"]](c, f["dur"])
        (FRAMES / f"{f['name']}.html").write_text(WRAP.format(css=css.rstrip("\n").lstrip("\n"), html=html.rstrip(), js=js, id=f["id"], dur=round(f["dur"], 3)))

    total = round(tl["total"], 3)
    hosts = [f'      <div id="{f["id"]}" data-composition-id="{f["id"]}" data-composition-src="compositions/frames/{f["name"]}.html" '
             f'data-start="{f["start"]:.3f}" data-duration="{f["dur"]:.3f}" data-track-index="1" data-width="1920" data-height="1080"></div>'
             for f in tl["frames"]]
    audios = []
    for f in tl["frames"]:
        for track, off in f["tracks"]:
            v = tl["vo"][track]
            audios.append(f'      <audio id="vo-{track}" src="{v["src"]}" data-start="{f["start"] + off:.3f}" data-duration="{v["dur"]:.3f}" data-track-index="10" data-volume="1"></audio>')
    b = tl["butler"]
    audios.append(f'      <audio id="butler-voice" src="{b["src"]}" data-start="{b["at"]:.3f}" data-duration="{b["dur"]:.3f}" data-track-index="11" data-volume="1"></audio>')
    for i, (name, t, vol) in enumerate(sfx_events(tl, cues)):
        d = duration(ROOT / "audio" / "sfx" / f"{name}.wav")
        audios.append(f'      <audio id="sfx-{i:02d}-{name}" src="audio/sfx/{name}.wav" data-start="{t:.3f}" data-duration="{d:.3f}" data-track-index="{13 if name == 'riser' else 12}" data-volume="{vol}"></audio>')
    caps = caption_groups(tl)
    cap_html = [f'      <div id="cap-{i:03d}" class="clip cap" data-start="{s:.3f}" data-duration="{d:.3f}" data-track-index="5"><span class="cap-line" id="capl-{i:03d}">{h}</span></div>'
                for i, (s, d, h) in enumerate(caps)]
    cap_js = "\n".join(f'      tl.fromTo("#capl-{i:03d}", {{ scale: 0.82, y: 14 }}, {{ scale: 1, y: 0, duration: 0.12, ease: "back.out(3)" }}, {s:.3f});' for i, (s, _, _) in enumerate(caps))
    flash_at = tl["frames"][3]["start"]
    index = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <link rel="stylesheet" href="styles/brand.css" />
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0d0c0b; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Figtree", system-ui, sans-serif; }}
      .cap {{ position: absolute; left: 0; right: 0; bottom: 52px; display: flex; justify-content: center; pointer-events: none; }}
      .cap-line {{ display: block; background: rgba(13,12,11,0.78); border-radius: 18px; padding: 6px 26px 12px; font-family: "Figtree", system-ui, sans-serif; font-weight: 700; font-size: 64px; color: #f6efe4; -webkit-text-stroke: 7px #0d0c0b; paint-order: stroke fill; text-shadow: 0 6px 24px rgba(0,0,0,0.7); }}
      .cap-line em {{ font-style: normal; color: #ffb547; }}
      .flash {{ position: absolute; inset: 0; background: #fff7e8; pointer-events: none; }}
      #flash-in {{ opacity: 0; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}
{chr(10).join(cap_html)}
      <div id="flash" class="clip flash-wrap" data-start="{flash_at - 0.15:.3f}" data-duration="0.5" data-track-index="6" style="position:absolute;inset:0;pointer-events:none;"><div class="flash" id="flash-in"></div></div>
{chr(10).join(audios)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
{cap_js}
      tl.fromTo("#flash-in", {{ opacity: 0 }}, {{ opacity: 0.9, duration: 0.15, ease: "power2.in" }}, {flash_at - 0.15:.3f}).to("#flash-in", {{ opacity: 0, duration: 0.3, ease: "power2.out" }}, {flash_at:.3f});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
    (ROOT / "index.html").write_text(index)
    summary = {"vo_dir": tl["vo_dir"], "total": total, "butler": tl["butler"],
               "frames": [{k: f[k] for k in ("id", "start", "dur")} for f in tl["frames"]], "captions": len(caps)}
    (ROOT / "audio" / "timeline.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps({"total": total, "vo": tl["vo_dir"], "captions": len(caps),
                      "frames": [(f["id"], f["start"], round(f["dur"], 2)) for f in tl["frames"]]}))


if __name__ == "__main__":
    main()
