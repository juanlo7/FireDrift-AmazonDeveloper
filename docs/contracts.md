# FireDrift — Contracts

The interfaces between the blocks of work (`docs/plan.md`). Names follow
`docs/domain.md`. The source of truth is the zod schemas in
`packages/domain/src` (TypeScript types come from them); the agent mirrors them
with pydantic in `agent/domain/models.py`. Fixtures for every message live in
`packages/domain/fixtures/`, and tests on both sides validate them. A change
here needs a PR approved by the other two members.

Conventions: JSON, `camelCase`, timestamps in ISO 8601 UTC, `type` is
`movie | series`, `country` is ISO 3166-1 alpha-2.

## 1. Shared types

```ts
type TitleType = "movie" | "series";
type Offer = "subscription" | "free" | "ads" | "rent" | "buy";

interface ProviderOffer {
  providerId: number;
  name: string;
  logoUrl: string;
  offer: Offer;
}

interface TitleCard {
  tmdbId: number;
  type: TitleType;
  name: string;
  year: number | null;
  overview: string;
  rating: number | null;        // TMDB vote average, 0–10
  genres: string[];
  runtimeMinutes: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  trailerKey: string | null;    // YouTube key
  providers: ProviderOffer[];   // for the profile's country
  onMyServices: boolean;
}

type SignalKind = "like" | "skip" | "watch_now" | "dwell";
type DwellSurface = "cover" | "trailer";  // new surfaces add a value

interface Signal {
  signalId: string;             // UUID, idempotency key
  tmdbId: number;
  type: TitleType;
  kind: SignalKind;
  surface?: DwellSurface;       // only for dwell
  ratio?: number;               // only for dwell: time on the surface / its cap, 0–1
  source: "feed" | "butler";
  at: string;
}

interface WeightsSummary {
  likes: { feature: string; label: string; weight: number }[];    // top N
  dislikes: { feature: string; label: string; weight: number }[]; // top N
  lastChange: WeightChange | null;
}

interface WeightChange {
  changeId: string;
  changes: { feature: string; delta: number }[];
  reason: string;
  at: string;
  undone: boolean;
}

interface Chip { id: string; label: string; }
```

## 2. REST API (backend → app)

Base URL from app config. No user auth (anonymous profile); throttled per route.
Errors: `{ "error": { "code": string, "message": string } }` with a 4xx/5xx status.

| Method and path | Body / query | Response |
|---|---|---|
| `GET /health` | — | `{ ok: true }` |
| `GET /providers?country=ES` | — | `{ providers: { providerId, name, logoUrl }[] }` |
| `PUT /profiles/{profileId}` | `{ country, services: number[], showEverything: boolean }` | `204` (creates or updates) |
| `GET /profiles/{profileId}/pool?size=20` | — | `{ poolId, algorithmVersion, titles: TitleCard[] }` |
| `POST /profiles/{profileId}/signals` | `{ signals: Signal[] }` (max 50) | `{ accepted: number, duplicates: number }` |
| `GET /titles/{type}/{tmdbId}?country=ES&profileId=…` | — | `TitleCard` |
| `GET /profiles/{profileId}/weights` | — | `WeightsSummary` |
| `POST /profiles/{profileId}/weights/undo` | — | `WeightsSummary` |
| `POST /profiles/{profileId}/weights/reset` | — | `WeightsSummary` |

## 3. Butler socket (agent ↔ app)

One WebSocket per butler session to the agent on AgentCore Runtime. Text frames
are JSON `{ "t": <event>, ...fields }`. Audio goes in binary frames.

**App → agent**

| Event | Fields | Notes |
|---|---|---|
| `session.start` | `profileId, country, services, hasMic`, optional `current: TitleCard` | First frame. `current` is the title on screen when the session starts (a taste pick after a fallback), so chips act on it |
| `audio.start` | `format: "pcm16", sampleRate: 16000` | Talk button pressed |
| *(binary)* | PCM 16-bit mono chunks | While the button is held |
| `audio.end` | — | Button released |
| `chip.select` | `chipId` | Chip chosen with the D-pad. A `say:<text>` chip counts as the user saying `<text>`, only if the agent offered it in its last `chips` |
| `suggestion.feedback` | `tmdbId, type, kind: "like" \| "skip" \| "watch_now"` | Context for the agent; the app also queues the Signal |
| `session.end` | — | Leaving the butler screen |

**Agent → app**

| Event | Fields | Notes |
|---|---|---|
| `transcript` | `text, final: boolean` | What the user said |
| `thinking` | — | Character goes to `thinking` |
| `answer.delta` | `text` | Streamed answer text |
| `speech` | `audioUrl` or binary frames, `format: "mp3"`, `marks: { timeMs, type, value }[]`, `gestures: { name: Gesture, timeMs }[]` | One per sentence; app plays it in order and shows `speaking`. Each gesture plays once at its `timeMs` (section 6) |
| `suggestion` | `title: TitleCard, reason` | Only TMDB-resolved titles |
| `chips` | `chips: Chip[]` | Next quick replies. Up to three come from the model as `{ id: "say:<text>", label: "<text>" }`, then the chips for the title on screen; with no model reply, the fixed chips (section 6) |
| `weights.changed` | `change: WeightChange` | Shown with the Undo action |
| `answer.done` | — | Back to `idle` after the audio ends |
| `fallback` | `reason: "cap" \| "disabled" \| "error", message, chips: Chip[]` | App switches to chips + algorithm |

The app owns the character state: `listening` on `audio.start`, `thinking` on
`thinking`, `speaking` while `speech` audio plays, `idle` after `answer.done`,
`fallback` on `fallback` or a closed socket.

## 4. Character clips (Blender → app)

| File | State | Spec |
|---|---|---|
| `app/assets/butler/idle.mp4` | `idle`, `fallback` | Seamless loop, 2–6 s |
| `app/assets/butler/listening.mp4` | `listening` | Seamless loop, 2–4 s |
| `app/assets/butler/thinking.mp4` | `thinking` | Seamless loop, 2–4 s |
| `app/assets/butler/speaking.mp4` | `speaking` | Seamless loop, 2–4 s, mouth moving |

**Gestures** (one-shot, played once over the current state, then back to its loop):

| File | Gesture | Use |
|---|---|---|
| `app/assets/butler/gesture-nod.mp4` | `nod` | Agrees, confirms a pick |
| `app/assets/butler/gesture-shrug.mp4` | `shrug` | Not sure, nothing found |
| `app/assets/butler/gesture-shiver.mp4` | `shiver` | Scary or dark title |
| `app/assets/butler/gesture-excited.mp4` | `excited` | Strong match, big recommendation |
| `app/assets/butler/gesture-bow.mp4` | `bow` | Greeting, goodbye |

Gestures are 1–2 s, start and end on the same pose as the loops, and play in the
same clip player (one clip player only, NFR-2).

All clips: H.264 MP4, 1280×720 or smaller, 30 fps, no audio, same framing and
background (or alpha if Vega supports it, see `requirements.md` V5), each under
2 MB.

## 5. Agent tools (backend → agent)

Lambdas exposed as MCP tools through AgentCore Gateway. `profileId` comes from
the session, never from the model: the tool schemas the model sees leave it out,
and the agent adds it to every call. A tool never throws; on bad input or a
failure it returns `{ "error": { "code", "message" } }`.

| Tool | Input | Output |
|---|---|---|
| `get_weights` | `profileId` | `WeightsSummary` |
| `update_weights` | `profileId, changes: { feature, delta }[], reason` | `{ change: WeightChange, clamped: string[] }` |
| `resolve_titles` | `profileId, proposals: { title, year, type }[]` (max 5) | `{ resolved: TitleCard[], dropped: { proposal, reason: "no_match" \| "not_on_my_services" }[] }` |
| `similar` | `profileId, type, tmdbId, count`, optional `exclude: { type, tmdbId }[]` | `{ titles: TitleCard[] }` |
| `ranked_picks` | `profileId, count`, optional `exclude: { type, tmdbId }[]` | `{ titles: TitleCard[] }` |

Limits enforced by the tools, not by the prompt (values in the taste config):

- `update_weights`: repeated features are summed; at most **3** features per
  call (the rest are not applied); each delta is capped at **±0.5**; the
  adjustment layer stays within **[-1, 1]**. Every feature cut by a limit is
  listed in `clamped`. A call left with nothing to change returns the error
  `invalid_change`.
- `ranked_picks`: `count` up to 10.
- `resolve_titles`: at most 5 proposals per call.
- `similar` and `ranked_picks`: `exclude` (at most 50) holds the titles the
  butler already showed in this visit; the tool never returns them.
- `ranked_picks` on a new profile (the cold start): a main genre with a
  negative weight is left out, so "I'm tired of action" works from the first
  turn.

## 6. Gesture cues (agent → character)

The model picks gestures inside its own answer, in the same generation. No
extra tool call and no extra model call.

```ts
type Gesture = "nod" | "shrug" | "shiver" | "excited" | "bow";
```

- **Marker:** `{{gesture}}` placed right before the word it goes with, for
  example `Then try this one. {{shiver}} It is creepy, but not gory.`
- **Reply marker:** `{{reply: <text>}}` at the end of the answer, up to three,
  each under 28 characters. The brain takes them out of the text before
  `answer.delta`, so they are never shown or spoken, and sends them as the
  first `chips`. With no valid reply, the chips are the fixed set of
  `agent/brain/chips.py`.
- **Parser (agent server):** strips every `{{...}}` from the text before
  `answer.delta` and Polly, so markers are never shown or spoken. A marker with
  a name outside `Gesture` is dropped. Max one gesture per sentence and two per
  answer; extra markers are dropped.
- **Timing:** each kept marker takes the `timeMs` of the Polly word mark that
  follows it and is sent in that sentence's `speech.gestures`.
- **Without the model** (`fallback`, chips only): no gestures, or a fixed one
  (`shrug` when a cap is reached).

## 7. Agent pipeline (voice ↔ brain ↔ character)

Inside the agent server, three owners meet at these types
(`packages/domain/src/pipeline.ts`, mirrored in `agent/domain/models.py`).

```
app ──audio──► voice (P1): Transcribe ──transcript──► server (P2) ──BrainInput──► brain (P2)
                                                                                    │
app ◄──events── server (P2) ◄── speech ── voice (P1): Polly ◄── CuedSentence ── parser (P3)
                    ▲                                                               │
                    └────────── suggestion, chips, weights.changed, fallback ◄──────┘
```

```ts
type BrainInput =
  | { kind: "text"; text: string }      // final transcript
  | { kind: "chip"; chipId: string };

// What the brain streams for one turn: the agent → app events of section 3
// without transcript and speech. answer.delta still holds the {{gesture}} markers.
type BrainEvent =
  | { t: "answer.delta"; text: string }
  | SuggestionEvent | ChipsEvent | WeightsChangedEvent | AnswerDoneEvent | FallbackEvent;

// One sentence after the gesture parser: clean text to show and speak, and
// at most one cue. charOffset is the index in `text` the gesture goes with.
interface CuedSentence {
  text: string;
  cues: { gesture: Gesture; charOffset: number }[];
}
```

- The server sends `thinking` when it passes a `BrainInput` to the brain.
- The parser (P3) splits the raw answer into sentences, sends each clean
  sentence as `answer.delta` to the app, and passes it as a `CuedSentence` to
  the voice side.
- The voice side (P1) synthesizes each `CuedSentence`, maps every cue to the
  first Polly word mark at or after `charOffset`, and sends one `speech` event
  with `marks` and `gestures`.
- Any failure in a step degrades as in FR-5: the server sends `fallback`.
