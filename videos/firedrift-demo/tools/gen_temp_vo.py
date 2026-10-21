"""Temp VO: one macOS `say` track per SCRIPT.md line into audio/vo-temp/vo-NN.wav (48 kHz mono)."""
import re, json, pathlib, subprocess
s = pathlib.Path("SCRIPT.md").read_text()
out = {}
for m in re.finditer(r"## Line (\d+) .*?\n(.*?)(?=\n## Line|\Z)", s, re.S):
    out[int(m.group(1))] = [re.sub(r"\*\*(.*?)\*\*", r"\1", l[4:]) for l in m.group(2).split("\n") if l.startswith("    ")]
json.dump(out, open("audio/script-lines.json", "w"), indent=1)
fix = [("FireDrift", "Fire Drift"), ("TMDB", "T M D B"), ("LLM", "L L M"), ("AgentCore", "Agent Core"), ("Vega OS", "Vega O S"), ("D-pad", "D pad"), ("…", ","), ("(beat)", "[[slnc 450]]")]
d = pathlib.Path("audio/vo-temp"); d.mkdir(parents=True, exist_ok=True)
jobs = []
for n, sp in out.items():
    jobs += [("09a", sp[0][3:]), ("09b", sp[1][3:])] if n == 9 else [(f"{n:02d}", " ".join(sp))]
total = 0
for name, text in jobs:
    for a, b in fix: text = text.replace(a, b)
    aiff = d / f"vo-{name}.aiff"
    subprocess.run(["say", "-v", "Reed (English (US))", "-r", "190", "-o", str(aiff), text], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(aiff), "-ar", "48000", "-ac", "1", str(d / f"vo-{name}.wav")], check=True)
    aiff.unlink()
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(d / f"vo-{name}.wav")], capture_output=True, text=True).stdout)
    total += dur; print(name, round(dur, 2))
print("total", round(total, 1))
