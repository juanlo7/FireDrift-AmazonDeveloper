# FireDrift — Contracts

The interfaces between the blocks of work (`docs/plan.md`). Names follow
`docs/domain.md`. The TypeScript source of truth is `packages/domain`; fixtures
for every message live in `packages/domain/fixtures/`. A change here needs a PR
approved by the other two members.

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

type SignalKind = "like" | "skip" | "watch_now" | "trailer_progress";

interface Signal {
  signalId: string;             // UUID, idempotency key
  tmdbId: number;
  type: TitleType;
  kind: SignalKind;
  ratio?: number;               // only for trailer_progress, 0–1
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
| `session.start` | `profileId, country, services, hasMic` | First frame |
| `audio.start` | `format: "pcm16", sampleRate: 16000` | Talk button pressed |
| *(binary)* | PCM 16-bit mono chunks | While the button is held |
| `audio.end` | — | Button released |
| `chip.select` | `chipId` | Chip chosen with the D-pad |
| `suggestion.feedback` | `tmdbId, type, kind: "like" \| "skip" \| "watch_now"` | Context for the agent; the app also queues the Signal |
| `session.end` | — | Leaving the butler screen |

**Agent → app**

| Event | Fields | Notes |
|---|---|---|
| `transcript` | `text, final: boolean` | What the user said |
| `thinking` | — | Character goes to `thinking` |
| `answer.delta` | `text` | Streamed answer text |
| `speech` | `audioUrl` or binary frames, `format: "mp3"`, `marks: { timeMs, type, value }[]` | One per sentence; app plays it in order and shows `speaking` |
| `suggestion` | `title: TitleCard, reason` | Only TMDB-resolved titles |
| `chips` | `chips: Chip[]` | Next quick replies |
| `weights.changed` | `change: WeightChange` | Shown with the Undo action |
| `answer.done` | — | Back to `idle` after the audio ends |
| `fallback` | `reason: "cap" \| "disabled" \| "error", message, chips: Chip[]` | App switches to chips + algorithm |

The app owns the character state: `listening` on `audio.start`, `thinking` on
`thinking`, `speaking` while `speech` audio plays, `idle` after `answer.done`,
`fallback` on `fallback` or a closed socket.

## 4. Character clips (Blender → app)

| File | State | Spec |
|---|---|---|
| `assets/butler/idle.mp4` | `idle`, `fallback` | Seamless loop, 2–6 s |
| `assets/butler/listening.mp4` | `listening` | Seamless loop, 2–4 s |
| `assets/butler/thinking.mp4` | `thinking` | Seamless loop, 2–4 s |
| `assets/butler/speaking.mp4` | `speaking` | Seamless loop, 2–4 s, mouth moving |

All clips: H.264 MP4, 1280×720 or smaller, 30 fps, no audio, same framing and
background (or alpha if Vega supports it, see `requirements.md` V5), each under
2 MB.

## 5. Agent tools (backend → agent)

Lambdas exposed as MCP tools through AgentCore Gateway. `profileId` comes from
the session, never from the model.

| Tool | Input | Output |
|---|---|---|
| `get_weights` | `profileId` | `WeightsSummary` |
| `update_weights` | `profileId, changes: { feature, delta }[], reason` | `{ change: WeightChange, clamped: string[] }` |
| `resolve_titles` | `profileId, proposals: { title, year, type }[]` (max 5) | `{ resolved: TitleCard[], dropped: { proposal, reason: "no_match" \| "not_on_my_services" }[] }` |
| `similar` | `profileId, type, tmdbId, count` | `{ titles: TitleCard[] }` |
| `ranked_picks` | `profileId, count` | `{ titles: TitleCard[] }` |

Limits enforced by the tools, not by the prompt: max changes and max delta per
`update_weights` call, clamp range, max proposals per call.
