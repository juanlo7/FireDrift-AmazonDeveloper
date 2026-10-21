---
workflow: general-video
flow: automation
storyboard: yes
message: "FireDrift turns 'I don't know what to watch' into 'press play', with a remote and an AI butler on AWS."
destination: youtube
aspect: 1920x1080
language: en
audience: Amazon Developer Hackathon 2026 judges (Fire TV track, AWS Builder mini challenge)
length: 120s
angle: pain-first product demo
---

## Intent

The demo video for the hackathon submission (issue #52). Judges watch it. It must show the
real app running on the Vega Virtual Device and highlight the features. Editing in the style
of Alex Hormozi: word-by-word captions with a yellow keyword, a cut or punch-in every 2-3 s,
big numbers, sound effects. Marketing structure from Iman Gadzhi: hook, pain, unique
mechanism, demo, proof, call to action. Hook (user choice): "You spend 20 minutes choosing
what to watch. Then you watch nothing."

## Assets

- VVD screen recordings — captured from the shell by Claude (feed, menu, butler, chips, Watch now).
- User voice-over — recorded by the user from SCRIPT.md, one track per line.
- App fonts — `app/assets/fonts/` (Big Shoulders Display, Figtree, SIL OFL).

## Customizations

- Animated AWS architecture diagram (request flow), the AWS Builder proof beat.
- Count-up numbers for the key figures.
- Text wordmark "FIREDRIFT" in the app marquee style (no logo file).

## Notes

- No copyrighted music (hackathon rules). Royalty-free or generated SFX only.
- The VVD has no microphone: show the butler with chips and its Polly voice. Push to talk is
  shown as the listening state, not as a live voice turn.
- No trailers: the feed shows covers (plan B, D8).
- Never name Hormozi or Gadzhi in the video.
- Palette from the app: background #0d0c0b, text #f6efe4, amber #ffb547.
