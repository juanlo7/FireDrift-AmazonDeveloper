# FireDrift — Domain

The words and rules every part of FireDrift (app, Lambdas, agent) shares.
Requirements: `docs/requirements.md`. Shared TypeScript types live in
`packages/` and follow this file.

## 1. Areas

| Area | Owns | Lives in |
|---|---|---|
| **Catalog** | Titles, trailers, providers from TMDB; the TMDB cache | Lambdas + DynamoDB |
| **Profile** | Device profile, country, services | App (source) + DynamoDB (copy) |
| **Taste** | Signals, weights, the algorithm, pools | Lambdas + DynamoDB |
| **Feed** | Cover hold, single trailer player, signal queue | App |
| **Butler** | Sessions, turns, proposals, weight changes, character state | Agent + Lambdas + App |

## 2. Entities and values

### Device profile
The only "user". Created on first run, no personal data.

| Field | Notes |
|---|---|
| `profileId` | UUID generated on the device, stored locally |
| `country` | ISO 3166-1 alpha-2, from the device region, editable |
| `services` | List of `providerId` the user has (empty = all) |
| `showEverything` | If true, the feed ignores the services filter |
| `createdAt` | |

### Title
A movie or a series, always identified by TMDB.

| Field | Notes |
|---|---|
| `tmdbId` + `type` | Identity. `type` is `movie` or `series` (TMDB IDs are per type) |
| `name`, `year` | Year of release or of the first air date |
| `overview`, `rating`, `posterPath`, `backdropPath` | From TMDB |
| `genres`, `keywords`, `people`, `runtimeMinutes` | Used to build features |
| `trailerKey` | YouTube key of the official trailer, or none |

### Provider and availability
- **Provider:** a streaming service (`providerId`, name, logo), from TMDB watch
  providers (data by JustWatch).
- **Availability:** for one title and one country, the providers and the offer
  type: `subscription`, `free`, `ads`, `rent`, `buy`.
- **"On my services"** = at least one of the user's providers offers it as
  `subscription`, `free` or `ads`. Rent and buy are shown but do not count.

### Feature
A property of a title that taste can weigh. Key format `kind:value`:
`genre:<id>`, `keyword:<id>`, `person:<id>`, `decade:<1990>`,
`type:movie|series`, `runtime:short|medium|long`.

### Signal
Something the user did that teaches the taste. Append-only.

| Kind | Source | Meaning |
|---|---|---|
| `like` | feed, butler | Positive |
| `skip` | feed, butler | Negative |
| `watch_now` | feed, butler | Strong positive (the user chose to watch it) |
| `dwell` | feed, butler | Implicit: time spent on a `surface` (`cover` today, `trailer` if a player comes back), as `ratio` of that surface's cap (0–1). High = weak positive, very low = weak negative. Caps and strengths per surface live in the taste config |

Fields: `signalId` (UUID, makes batches idempotent), `profileId`, `tmdbId`,
`type`, `kind`, `surface?`, `ratio?`, `source`, `at`. Sent in **batches** (5 items / 30 s /
app to background). What the user says to the butler is not a signal: it
becomes a weight change (below).

### Weights
A score per feature for one profile, in a fixed range.

- **Learned layer:** computed from signals by the taste algorithm.
- **Adjustment layer:** written only by the butler through `update_weights`.
  It **decays** toward zero over time.
- **Effective weights** = clamp(learned + adjustment). The feed and the butler
  both read the effective weights.
- **Weights summary:** a compact top-N view (strongest likes and dislikes) given
  to the agent. Never the raw signal history.

### Weight change
One call to `update_weights`: `changeId`, list of `{feature, delta}`, `reason`
(spoken back to the user), `at`, `undone`. The last 20 are kept. **Undo**
reverts the last change; **reset** clears the adjustment layer.

### Pool
An ordered batch of titles for the feed, built for one profile by one
**algorithm version** at one time. Built by **quotas** (favourites, genre picks,
discovery), filtered by availability and **seen titles**, with a recency
cooldown. A new pool is requested when the current one is nearly used, never
per signal.

### Seen title
A title already shown to the profile. Not shown again in the feed for a while.

### Butler session and turn
- **Session:** one open conversation, on one WebSocket to the agent. Has a turn
  cap.
- **Turn:** one user input (voice transcript or chip) and one butler answer.
- **Answer:** short text, its audio (Polly) with speech marks, at most one
  suggestion, and the next chips.
- **Chip:** a quick reply chosen with the D-pad. Works without a microphone.

### Proposal, resolution, suggestion
- **Proposal:** what the model offers: `{title, year, type}`. Not trusted.
- **Resolution:** `resolve_titles` matches a proposal on TMDB by title + year +
  type. Result: a matched `Title`, or **dropped** (no confident match, or not on
  my services).
- **Suggestion:** a resolved title shown to the user with a short reason. Only
  suggestions reach the screen.

### Butler state
Drives the Blender clip that the character plays.

| State | When | Clip |
|---|---|---|
| `idle` | Waiting | Loop |
| `listening` | Talk button held | Loop |
| `thinking` | Transcript sent, waiting for the agent | Loop |
| `speaking` | Polly audio playing | Loop synced with speech marks |
| `fallback` | Agent off or over cap; chips only | `idle` clip + short message |

Moves: `idle → listening → thinking → speaking → idle`. A chip goes
`idle → thinking`. Any error goes to `fallback`, and the next working turn
returns to `idle`.

### Gesture
A one-shot clip (`nod`, `shrug`, `shiver`, `excited`, `bow`) that the agent
picks with a cue marker in its answer. It plays once over the current state and
does not change the state.

### Config
Values in DynamoDB that change behavior without a redeploy: active algorithm
version, quotas, signal strengths, cooldowns, butler caps, kill switch, model
ID, adjustment decay.

## 3. Rules (invariants)

1. A title reaches the screen only if it has a TMDB ID. Every fact shown or
   spoken about it comes from TMDB.
2. There is **one** trailer player at any time.
3. The feed never calls an LLM.
4. Signals are sent only in batches and are idempotent by `signalId`.
5. Only `update_weights` changes the adjustment layer. Every change is
   validated, clamped, limited per turn, explained and undoable.
6. The butler never erases the learned layer.
7. Over a cap or on error, the butler degrades to chips and the algorithm. The
   feed is never affected.
8. No personal data: no account, no name, no stored voice audio.

## 4. Glossary

| Term | Meaning |
|---|---|
| Cover hold | Minimum time the cover is shown before the trailer starts |
| Cold start | A profile with no signals yet; gets popular, varied titles |
| Discovery | Pool quota of titles outside the known taste |
| Recency cooldown | Soft penalty for features and titles seen recently |
| Push to talk | Hold a remote button to speak to the butler |
| Resolve-then-show | No proposal is shown before TMDB confirms it |
| Kill switch | Config value that turns the agent off without a redeploy |
