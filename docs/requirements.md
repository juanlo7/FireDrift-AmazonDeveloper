# FireDrift — Requirements

Status: **v1.0, decisions closed** (2026-10-01). Domain model and glossary:
`docs/domain.md`. Interfaces: `docs/contracts.md`. Who owns what: `docs/plan.md`.
Hackathon rules: `docs/hackathon.md`.

Deadline: **Fri, Oct 23, 2026, 12:00 pm PT**. We submit by **Thu, Oct 22**.
Feature freeze: **Sun, Oct 18**.

## 1. Product

**One line:** FireDrift helps people who "don't know what to watch" discover
movies and series on Fire TV (Vega OS), in **two modes**: a full-screen trailer
feed they browse with the remote, or an **animated AI butler they talk to by
voice**. One button opens the streaming service that has the title.

It is the TV version of Driftune: discover, learn the taste, then link out.
**It complements streaming services; it does not replace them.** We never host
or download video.

**Target user:** a household on the sofa with a remote, 10 feet from the TV,
with several subscriptions, who spends more time choosing than watching.

**Why it fits the judges:** AI-enhanced viewing with multi-modal UX (voice +
D-pad + animated character), a multi-service AWS pipeline (Bedrock + AgentCore
+ Strands + Transcribe + Polly), a public repo with a reusable package, and a
real TV constraint (low RAM) solved on purpose.

## 2. Final decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Platform | **Vega OS**, React Native for Vega, TypeScript strict. Demo on the Vega Virtual Device or a real device. |
| D2 | Catalog | **Movies and series**, from TMDB. |
| D3 | User | **One anonymous profile per device.** No login, no personal data. |
| D4 | Language | **English only** (UI, butler voice, docs, submission). |
| D5 | Country | Taken from the device region, **editable** in settings. |
| D6 | Services filter | **Only my services** by default, with a "show everything" option. |
| D7 | Taste signals | Like, Skip, Watch now, dwell time (on the cover with plan B), and what the user tells the butler. |
| D8 | Trailer player | **Plan B adopted (spike V1, Oct 4):** cover + synopsis with an animated backdrop, no trailer player. The Vega WebView does not run on the VVD on Ubuntu or Intel Mac (`docs/spikes.md`). The demo is recorded on an Apple Silicon Mac. Original plan: one reused WebView with the official YouTube IFrame API. |
| D9 | Feed ranking | Our own algorithm in Lambda (Driftune-style). **No LLM in the feed.** |
| D10 | Butler | In the MVP. Full voice conversation with sound and an animated character. |
| D11 | Butler voice | **Amazon Transcribe streaming** (speech → text) → agent → **Amazon Polly** neural voice (text → speech, with speech marks to sync the animation). |
| D12 | Listening | **Push to talk** (hold a remote button). No always-on microphone. |
| D13 | No microphone | Butler works with **quick-reply chips** (D-pad) and still **speaks** and animates. |
| D14 | Butler animation | Made in **Blender** with help from AI tools, shipped as **short pre-rendered video clips**: one loop per butler state plus one-shot **gestures** the agent picks with cue markers in its answer (`contracts.md`, sections 4 and 6). |
| D15 | Agent runtime | **Strands agent on Amazon Bedrock AgentCore Runtime**, WebSocket streaming. Tools are our Lambdas exposed through **AgentCore Gateway**. |
| D16 | Model | **Claude Haiku 4.5 on Bedrock**, if it is available in our region and our credits cover it. Otherwise **Amazon Nova 2 Lite**. The model ID is a config value. |
| D17 | Languages (code) | App, Lambdas, CDK and shared types in **TypeScript**. Agent in **Python** (Strands Python SDK). |
| D18 | Backend | AWS serverless: HTTP API Gateway, Lambda (ARM), DynamoDB on-demand, CDK. |
| D19 | Open source | **Public repo, MIT license.** Reusable package: the recycled player pool. |

## 3. Scope

### MVP (must show in the demo, less than 3 min)

| ID | Requirement |
|---|---|
| FR-1 | Cover feed browsed with the remote (D8 plan B; trailer player is stretch) |
| FR-2 | Taste learning from signals (like, skip, watch now, watch time) |
| FR-3 | "Watch now": open the streaming service |
| FR-4 | My services and country |
| FR-5 | Voice butler: animated AI agent that proposes titles, answers, and adjusts the taste |

### Stretch (only after the MVP passes on the simulator or device)

- Butler "conversation mode" (listens again after speaking, no button).
- Household profiles and group mode.
- Spanish UI and voice.

### Out of scope

- Playing full movies or series in the app.
- Login, accounts, payments.
- Phone, web or PWA clients.
- Publishing in the Vega Appstore before the hackathon deadline.

## 4. Functional requirements

Acceptance criteria use Given / When / Then. Each one must pass on the Vega
simulator or a device, with the remote only.

### FR-1 Cover feed (D8 plan B)

The device has little RAM. The feed is a **paced sequence**, not a smooth
TikTok-style scroll. Since spike V1 (D8 plan B) there is **no trailer player**:
each title is a full-screen **cover** (backdrop with a slow animated drift,
title, year, type, runtime, rating, genres and synopsis).

- Only the cover on screen holds images. The app prefetches metadata and images
  for the next 3 titles, never video.
- A new pool is requested when the current one is nearly used (5 titles or
  fewer left), never per signal.
- Remote: Up/Down = previous/next, Right = Like, Left = Skip, OK = Watch now,
  Back = menu.

Acceptance:
- Given the feed is open, when I press Down, then the next cover is visible in
  under 500 ms (NFR-3).
- Given I browsed 20 titles, then memory does not grow between titles (device
  profiler).
- Given a title has no backdrop, or the pool refill fails (offline), then the
  cover still shows its poster or synopsis and the feed keeps working.
- Given the feed is open, then every remote key above does its action and Back
  opens a menu with Butler, Settings and About.

Original plan (stretch, Apple Silicon VVD or device only): one reused WebView
with the official YouTube IFrame API that plays the trailer after a minimum
cover hold of 3 s. See `docs/spikes.md`.

### FR-2 Taste learning

**Remote keys in the feed:** Right = Like, Left = Skip, Up/Down = previous/next
title, OK = Watch now (FR-3), Back = menu.

- Every signal (see `domain.md`, Signal) is queued on the device and sent **in
  batch**: when the queue has 5 items, 30 s after the last flush, or when the
  app goes to background. Never one request per signal.
- The backend returns the next **pool**, ranked for the profile by the taste
  algorithm (4.1).
- If the backend is down, the feed keeps working from the last pool and the
  queue is kept and retried.

Acceptance:
- Given I liked 5 action titles and skipped 5 romances, when the next pool
  loads, then most titles are closer to the liked genres and keywords.
- Given I like a title, then no request is sent until a batch rule is met.
- Given I stay on a cover for its whole cap (default 15 s), then that title
  counts as a weak positive signal; given I leave it in under 2 s, as a weak
  negative. Each `dwell` signal says its surface (`cover`), so a trailer
  surface can be added later with its own cap and strength.
- Given the backend is down, then the feed works from the last pool and the
  queue is retried later.

#### 4.1 Taste algorithm (adapted from Driftune `get-feed`)

- The profile keeps **weights per feature**: genre, keyword, person (cast and
  director), decade, type (movie or series), runtime band.
- Signal strength (defaults, one config object): Watch now > Like > long
  dwell > short dwell > Skip (negative). Dwell caps and strengths are set per
  surface.
- A pool is built by **quotas**, not by one sort: favourites (similar to liked
  titles), genre picks, and **discovery** titles outside the known taste.
- Candidates come from TMDB `discover`, `recommendations` and `similar`,
  filtered by country and services (FR-4) and by titles already seen.
- **Recency cooldown:** soft penalty for features and titles seen in the last
  pools. **One title per seed** so a pool spans many seeds.
- **Cold start:** popular, varied titles for the country and services.
- The algorithm is **versioned**. The active version is a config value in
  DynamoDB, so a bad version is undone without a redeploy.
- Pure functions with unit tests. TMDB and DynamoDB sit behind small interfaces.
- The feed and the butler read the **same effective weights** (learned layer +
  butler adjustment layer, see `domain.md`).

### FR-3 Watch now

- OK on a title shows the services that offer it in the user's country (TMDB
  watch providers, data by JustWatch), with the user's services first.
- Choosing a service opens that app on the title when Vega allows a deep link;
  otherwise it opens the app home, or shows a clear message with the service
  name.
- If no service offers the title, the app says so and offers the next title.

Acceptance:
- Given a title on one of my services, when I press OK and choose the service,
  then that app opens (on the title if supported).
- Given a title with no provider in my country, then I see a clear message and
  the feed is not blocked.

### FR-4 My services and country

- First run: a 10-foot screen to pick the **services** (logo grid, D-pad, OK
  toggles). The **country** comes from the device and is editable here and in
  settings. Stored on the device.
- The feed shows only titles available on the selected services (see
  `domain.md`, Availability), with a "show everything" option.

Acceptance:
- Given I select two services, then every feed title is on at least one of them.
- Given I skip the setup, then the app uses the device country and all services
  and does not block.

### FR-5 Voice butler

A second section next to the feed. An animated character proposes movies and
series one at a time and talks with the user: "something like Dark",
"shorter", "less scary", "what is it about", "where can I watch it",
"I'm tired of horror".

**Interaction**
- **Push to talk:** the user holds a remote button to speak. The character
  shows the *listening* state. On release, the audio is transcribed and the
  agent answers by voice.
- **Chips:** every answer comes with quick replies chosen by the D-pad ("More
  like this", "Shorter", "Different genre", "Tell me more", "Watch now"). Chips
  always work, with or without a microphone (D13).
- The answer is **spoken** (Polly) and shown as short text. The character plays
  the clip of its current state: *idle*, *listening*, *thinking*, *speaking*.
  The *speaking* clip follows the Polly speech marks.
- **Gestures:** the agent picks short gestures (`nod`, `shrug`, `shiver`,
  `excited`, `bow`) with cue markers in its own answer, in the same model call.
  Each gesture plays at the word it marks. Markers are never spoken or shown.
- The current suggestion is a card (poster, title, year, short reason) with its
  trailer in the **same single trailer player** (FR-1), and a Watch now action.

**Proposals and grounding**
- The agent **proposes titles by itself** as `{title, year, type}`, guided by
  the effective weights, the user's services and country, and what the user
  says.
- Every proposal goes through `resolve_titles`: TMDB search by title + year +
  type, then details, trailer and providers. **Resolve-then-show:** a proposal
  TMDB cannot match with confidence is dropped and never shown. A title with no
  provider on the user's services is replaced (max 3 retries per turn).
- Metadata, images, trailers, links and availability come **only from TMDB**.
  The spoken text never states platform, year, cast or availability unless it
  comes from TMDB data in the tool result.
- Optional tools: `similar`, and ranked picks from the taste algorithm (for new
  releases the model does not know).

**Weights changes**
- The agent changes the taste only through `update_weights`: fixed schema,
  values clamped, limited number and size of changes per turn.
- Changes go to the **adjustment layer**, which decays over time and never
  erases the learned layer.
- Each change keeps a reason (last 20). The user can **undo the last change** or
  **reset** the adjustments from the butler screen. The agent tells the user
  what it changed.
- The agent sees a compact summary of the weights, never the raw signal history.

**Limits and degradation**
- Turn cap per session, daily cap per profile, global daily cap, and a kill
  switch, all config values in DynamoDB.
- Only the last N turns and compact tool results go to the model. Short answers,
  low output limit.
- **Silent degradation:** if the agent, Transcribe or Polly fails, or a cap is
  reached, the butler falls back to chips backed by the taste algorithm, with a
  short on-screen message. No blank screen, no raw error. If only Polly fails,
  the answer is shown as text.

Acceptance:
- Given I hold the talk button and say "something like Dark but shorter", then
  the character listens, thinks, and speaks a proposal that TMDB resolved.
- Given the device has no microphone, then I can use the butler with chips only
  and it still speaks.
- Given the butler suggested a title, when I choose "More like this", then the
  next suggestion is a different, related title on my services.
- Given any title shown by the butler, then it has a TMDB ID and its metadata,
  trailer and providers come from TMDB (tested).
- Given the model proposes a title TMDB cannot match, then I never see it.
- Given I choose "Tell me more", then the facts spoken match TMDB data.
- Given I say "I'm tired of horror", then the horror weight goes down through
  `update_weights`, the butler says what changed, and the next feed pool has
  fewer horror titles. "Undo" restores the previous weights.
- Given the model asks for a change above the limit, then it is clamped.
- Given the agent is unavailable or over a cap, then the butler works with chips
  and the algorithm, and the feed is unaffected.
- Given a butler suggestion plays its trailer, then there is still one trailer
  player instance.
- Given the agent proposes a scary title, then the character can play a
  gesture (for example `shiver`) at the marked word, and the marker is not
  spoken or shown.
- Given the model writes an unknown gesture marker, then it is dropped and the
  answer plays normally.

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | **TV UX:** everything reachable with the D-pad and Back. Visible focus on every element. Text readable at 10 feet. Safe area respected. |
| NFR-2 | **Memory:** one trailer player and one butler clip player at most. No unbounded lists or image caches. Measured before every release. |
| NFR-3 | **Responsiveness:** cover visible < 500 ms after a key press (prefetched data). Focus feedback < 100 ms. Butler: *listening* state < 200 ms after the button; first spoken audio < 3 s after release. |
| NFR-4 | **Cost:** see section 7. |
| NFR-5 | **Security:** TMDB key and AWS credentials never in the app or in git; they live in one Secrets Manager secret. The app talks only to our API and the agent endpoint. Least-privilege IAM. Rate limit per route. |
| NFR-6 | **Privacy:** only an anonymous device ID, country, services and taste signals. Voice audio is streamed for transcription and **not stored**. Documented in the README. |
| NFR-7 | **Resilience:** offline or backend error never leaves a blank screen. |
| NFR-8 | **Language:** UI, voice, code, docs and submission in English. |

## 6. Architecture

```
Vega app (React Native, TS)
  ├─ Feed: cover hold + single WebView trailer player (YouTube IFrame)
  ├─ Butler: clip player (Blender clips), audio out, push-to-talk mic, chips
  ├─ Local store: device ID, country, services, signal queue
  │
  ├─ HTTPS ──► API Gateway (HTTP API) ──► Lambdas (TS) ──┬─► DynamoDB
  │                                                     └─► TMDB (cached)
  │
  └─ WebSocket ──► AgentCore Runtime: Strands agent (Python)
                     ├─► Bedrock model (D16)
                     ├─► Transcribe streaming (speech → text)
                     ├─► Polly neural + speech marks (text → speech)
                     └─► AgentCore Gateway ──► the same Lambdas as tools
                          (get_weights, update_weights, resolve_titles,
                           similar, ranked_picks)
```

**Repo layout**

```
app/        Vega React Native app
backend/    Lambdas (TS) + CDK stack
agent/      Strands butler agent (Python) for AgentCore
packages/   domain (shared types + fixtures), player-pool (open source)
assets/     butler clips rendered from Blender (sources in assets/blender/)
docs/       requirements, domain, hackathon rules, workflow
```

## 7. AWS cost ($150 credits)

Usage above the credits is **our own cost**. Credits must last until judging
ends (**Nov 20**).

| Phase | Dates | Cap | Of which AI (Bedrock, AgentCore, Transcribe, Polly) |
|---|---|---|---|
| Build | until Oct 22 | $40 | $25 |
| Judging | Oct 23 – Nov 20 | $45 | $35 |
| Reserve | never planned | $65 | — |

Estimated cost per **voice turn**: about $0.02 (model ~$0.012 with Haiku 4.5,
Transcribe ~$0.004, Polly ~$0.005, AgentCore runtime negligible). That is about
1,200 turns in build and 1,700 in judging. Recompute after measuring real turns.

**Guardrails**
- AWS Budgets alerts at $30, $75, $110 actual and $130 forecast, to the team.
- Tags `project=firedrift` and `env=dev|prod` on every resource.
- No NAT Gateway, VPC Lambdas, provisioned capacity, load balancers, OpenSearch
  or always-on instances.
- Lambda on ARM, small memory, short timeouts. DynamoDB on-demand with TTL on
  signals (30 days) and cache items.
- TMDB responses cached in DynamoDB with TTL.
- Logs kept 7 days, no debug logs in `prod`.
- Butler caps and kill switch (FR-5). Short Polly answers.
- One region for everything. Deploy with CDK only. After Nov 20: `cdk destroy`
  and delete the secret.

## 8. Legal and attributions

- TMDB notice ("This product uses the TMDB API but is not endorsed or certified
  by TMDB") and logo in an About screen.
- JustWatch credit for watch-provider data.
- Streaming service names and logos only as TMDB and the brands allow.
- Trailers through the official YouTube player only.
- Butler clips, sounds and voice: our own Blender work and Polly output. Music
  in the demo video: royalty-free with license, or none.

## 9. To verify (can change a decision)

| # | Question | If the answer is no |
|---|---|---|
| V1 | Does a WebView with the YouTube IFrame API work on Vega? | D8 plan B: cover + synopsis |
| V2 | Can a Vega app capture microphone audio for push to talk, and which remote button can we use? | D13: chips + voice output only |
| V3 | Can a Vega app open another app or a deep link? What does each service accept? | Open app home, or show the service name |
| V4 | Is Claude Haiku 4.5 available in our region and covered by our credits? | D16: Nova 2 Lite |
| V5 | Can Vega play local video clips for the butler next to the trailer WebView within memory? | Sprite sheets of the Blender renders |
| V6 | TMDB terms for the hackathon and a later store release. | Adjust attributions or data use |

Results (details in `docs/spikes.md`):
- **V1 (Oct 4): no** on our VVD (Ubuntu): no WebView module. D8 plan B is
  adopted. The `trailer_progress` signal is replaced by `dwell` with a
  `surface` (FR-2). FR-1 text and the butler suggestion still describe the
  trailer player; their owners update them in a follow-up PR.
- **V3 (Oct 4): partly yes.** An app opens another app with
  `pkg://<component-id>`; `canOpenURL` throws when no app handles the URL.
  Service links (Netflix, Prime Video) need a Vega device to check; until then
  FR-3 uses the fallback (service name and logo).
- **V6 (Oct 4): accepted risk.** The free TMDB API is for non-commercial use,
  which fits a hackathon entry with no fees or ads. Section 1.C of the TMDB API
  Terms of Use also forbids using TMDB content "in connection with" an AI-based
  application, which can cover the butler. The team accepts this risk for the
  hackathon; a store release would need a written agreement with TMDB.
- **V2 (Oct 10): not testable on the VVD.** The microphone privilege is
  granted and the record stream builds, but the VVD has no audio input
  (`STATUS_NO_INIT`, read fails). Push to talk by holding OK (`select`) is
  possible: the remote sends key down and up. Needs a Vega device. D13 stays
  the base design.
- **V5 (Oct 10): not testable on the VVD.** `VideoPlayer` starts but the VVD
  decodes no video (`MediaError` code 4 for a local MP4, 3 for `https`). Memory
  not measured. Needs a Vega device. The sprite-sheet plan B stays as fallback.

**Risks**
- **Butler is large for the time left.** Cut order if late: conversation polish
  → gestures (keep the four state loops) → free voice input (keep chips +
  spoken answers) → animation states reduced to
  *idle* and *speaking*. The feed and FR-1 to FR-4 are never cut.
- **Wrong or non-existent titles from the model.** Resolve-then-show; track the
  drop rate in tests.
- **Bad weight changes.** Schema, clamp, adjustment layer, undo.
- **Real devices have less memory than the simulator.** Measure on a device if
  we get one.
- **Vega toolchain friction.** Log each problem as a friction-log issue.
