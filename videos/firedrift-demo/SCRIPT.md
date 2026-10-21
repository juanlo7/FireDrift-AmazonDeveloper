# SCRIPT — firedrift-demo

**Voice:** the user's own voice (Mac microphone). Temp track until then: `npx hyperframes tts` (Kokoro).
**Voice settings:** WAV, 48 kHz, mono. One file per line: `audio/vo/vo-NN.wav`. 0.5 s of silence before and after each take.
**Voice direction:** Confident and fast, like you talk to one friend on the sofa. Short sentences, hard stops.
Smile on the payoff lines. Never read the punctuation as a pause unless the line says "(beat)".

**Total:** 14 lines, about 210 words, about 1:45 of voice. The rest is the butler's own Polly voice and hits.

**How to record:**

1. Record each line three times in a row. Say the number of the take before each one ("one", "two", "three").
2. Keep 30 cm from the microphone, in a room with soft things (a bedroom is better than a kitchen).
3. Save each line as `vo-NN.wav`. I cut the best take and fit the edit to your real timing.
4. Words in **bold** get the stress. A "(beat)" is a half-second stop.

---

## Line 1 — Hook (Frame 1)

**Time:** 0.0 – 4.5s
**Delivery:** Calm and a bit tired. Like you say a fact everybody knows.
**Technique:** pain hook in the viewer's own words. The first 3 s decide if a judge keeps watching.

    You spend **twenty minutes** choosing what to watch.

## Line 2 — The twist (Frame 2)

**Time:** 4.5 – 7.5s
**Delivery:** Drop the voice on the last word. Dry.
**Technique:** pattern break. The edit cuts to black on "nothing".

    Then you watch… (beat) **nothing.**

## Line 3 — Agitate (Frame 3)

**Time:** 7.5 – 15.0s
**Delivery:** Three fast hits, then slow down on the reframe.
**Technique:** agitate, then reframe the problem so that only our product fits it.

    Five apps. Ten thousand titles. **Zero** decisions.
    Not a content problem. (beat) A **choosing** problem.

## Line 4 — Mechanism (Frame 4)

**Time:** 15.0 – 23.0s
**Delivery:** Energy up. This is the reveal.
**Technique:** name the unique mechanism: two modes, one goal.

    This is **FireDrift**. Two ways to pick tonight's movie on Fire TV:
    a **feed** you drive with the remote… and an **AI butler** you talk to.

## Line 5 — The feed (Frame 5)

**Time:** 23.0 – 33.0s
**Delivery:** Rhythmic. Each short sentence matches one remote press.
**Technique:** show, do not tell. Every claim has a key press on screen.

    One title, full screen. **Right**: like. **Left**: skip.
    Every press teaches it your **taste**. No login.

## Line 6 — Watch now (Frame 6)

**Time:** 33.0 – 40.5s
**Delivery:** Satisfied, like the problem is solved.
**Technique:** the outcome, "press play", in one button.

    Find it? Press **OK**. Watch now opens the **app** that has it, on your service.

## Line 7 — Built for TV (Frame 7)

**Time:** 40.5 – 49.0s
**Delivery:** Proud but quick. Stress the numbers.
**Technique:** proof stack with numbers. Open loop at the end pulls into the butler.

    Built **for** the TV: **one** cover in memory, the D-pad on **every** screen, running on **Vega OS**.
    (beat) But the feed is the easy part.

## Line 8 — Butler intro (Frame 8)

**Time:** 49.0 – 54.0s
**Delivery:** Playful. Lean in, like you share a secret.
**Technique:** pay off the open loop.

    Still can't decide? Meet your **butler**.

## Line 9 — Surprise me (Frame 9)

**Time:** 54.0 – 66.0s (the butler speaks from 56.5 to 62.0s; stay quiet there)
**Delivery:** Two parts. Say part A, stop, the butler talks, then say part B.
**Technique:** let the product talk. A real answer beats any claim.

    A: Press "**Surprise me**."
    B: He picks **one** title, tells you **why**, and the chips change with every answer.

## Line 10 — Taste change (Frame 10)

**Time:** 66.0 – 76.0s
**Delivery:** Say the chip name lightly, then the payoff with energy.
**Technique:** the "wow" moment for the judges: the AI changes the taste, and you stay in control.
**Note:** matches the real take: the "Something lighter" chip fires `update_weights`.

    Ask for "something lighter"… and he **changes your taste**. Live.
    With an **Undo** button. You stay in control.

## Line 11 — The character (Frame 11)

**Time:** 76.0 – 85.0s
**Delivery:** Steady. Let each state land with the clip on screen.
**Technique:** multi-modal: voice, D-pad and visuals in one flow (a creative criterion of the judges).

    He **listens**. He **thinks**. He **speaks**.
    And every gesture lands on the **exact word**.

## Line 12 — AWS (Frame 12)

**Time:** 85.0 – 100.0s
**Delivery:** Clear and a bit slower. Each service name gets its own beat. This is for the AWS Builder judges.
**Technique:** authority. The diagram builds node by node with your words.

    Under the hood: a **Strands** agent on **Bedrock AgentCore**, running Claude Haiku.
    **Transcribe** hears you. **Polly** speaks, and its speech marks drive the animation.
    **AgentCore Gateway** turns our **Lambdas** into tools.

## Line 13 — Trust (Frame 13)

**Time:** 100.0 – 108.0s
**Delivery:** Serious, then light on the last sentence.
**Technique:** handle the objection ("AI makes things up") before the judge thinks it.

    The model never **invents** a title: **TMDB** confirms every pick.
    And the feed never calls an LLM. **Fast**, and **cheap**.

## Line 14 — Close (Frame 14)

**Time:** 108.0 – 120.0s
**Delivery:** Slow and sure. Smile. Leave 2 s of silence at the end.
**Technique:** a short slogan to remember, then the call to action.

    Stop **scrolling**. Start **watching**.
    **FireDrift**. Built for the **Amazon Developer Hackathon**. Open source, on Fire TV.
