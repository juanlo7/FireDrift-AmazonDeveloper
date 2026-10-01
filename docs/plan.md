# FireDrift — Plan

Three people, three equal shares of work. Each share is a set of blocks with
one owner; a share does not have to match one layer of the code. People work
**without waiting for each other**: blocks meet only through the contracts in
`docs/contracts.md`, and everyone builds against mocks of those contracts until
the real parts are ready. Tasks live as GitHub issues, not in docs: one issue
per block, labelled `share: P1|P2|P3` and `size: S|M|L`.

Fixed dates: **spike checkpoint Sun, Oct 4**, **feature freeze Sun, Oct 18**,
**submission Thu, Oct 22** (official deadline Fri, Oct 23, 12:00 pm PT).

## Shares

Size of each block: S = 1 point, M = 2, L = 3. Each share is **18 points**.
"Equal" means equal effort, equal risk (each share owns its own spikes), and an
even load over the calendar. If a block turns out bigger or smaller, rebalance
by moving a block, not by leaving work unowned.

The team works in React and TypeScript. The Python agent and the Blender
scripts are written with AI help (Claude); the owner reviews, tests and decides.

### Person 1 — Feed, voice and grounding

| Block | Size | Where |
|---|---|---|
| Feed: cover hold, single trailer player, D-pad keys, prefetch (FR-1) | L | `app/` |
| Recycled player pool as an open-source package with tests and README | M | `packages/player-pool/` |
| Services and country screen, settings (FR-4) | M | `app/` |
| Watch now sheet and app launch (FR-3) | M | `app/` |
| About screen with attributions | S | `app/` |
| TMDB client with cache, providers per country | M | `backend/` |
| Grounding tools as Lambdas: `resolve_titles`, `similar` (nothing is shown unless TMDB resolves it) | S | `backend/` |
| Voice pipeline: Transcribe streaming in, Polly out with speech marks | L | `agent/voice/` |

### Person 2 — Taste, AWS and the agent core

| Block | Size | Where |
|---|---|---|
| CDK stack, HTTP API, DynamoDB, one secret, budgets and tags | M | `backend/` |
| Profiles and signals ingestion | S | `backend/` |
| Signal queue with batch flush (FR-2, device side) | S | `app/` |
| Taste algorithm, weights (learned + adjustment layer), pools (4.1) | L | `backend/` |
| Weight tools as Lambdas: `get_weights`, `update_weights`, `ranked_picks` | S | `backend/` |
| AgentCore Runtime and Gateway deploy, config values, kill switch | M | `backend/` |
| Strands agent core: tool loop, resolve-then-show, weight changes | M | `agent/brain/` |
| Butler WebSocket, agent server end | S | `agent/` |
| Model choice: Haiku 4.5 vs Nova 2 Lite on a short set of demo prompts (quality, latency, cost) | S | `agent/tests/` |
| Demo video: script, shot list, capture and edit (< 3 min) | M | — |

### Person 3 — Butler persona, gestures and character

Everything the user sees and hears of the butler: who it is, how it reacts and
the 3D character that does it. The agent chooses the character's gestures
itself, as cues inside its own answer (`docs/contracts.md`, section 6).

| Block | Size | Where |
|---|---|---|
| Persona prompt: voice and tone, short answers, chips, when and how much to gesture | S | `agent/brain/` |
| Caps, short context, silent fallback | S | `agent/brain/` |
| Gesture cues: closed gesture set, cue markers in the answer, parser that strips them and times each gesture with the Polly speech marks, gesture queue in the app | L | `agent/character/`, `app/` |
| Speaking sync: drive the `speaking` clip from Polly speech marks | S | `app/` |
| Character plan, model and rig in Blender (AI-assisted), clip spec check on Vega | M | `assets/blender/` |
| Animate the four seamless loops and the one-shot gestures | L | `assets/blender/` |
| Render, compress and test the clips on the simulator or device (memory, loops) | S | `assets/butler/` |
| Butler screen: clip player and states, card, chips, push-to-talk mic capture, audio playback, undo/reset | L | `app/` |
| Butler WebSocket, app client end | S | `app/` |

Placeholder clips with the final names exist from day one, so the butler screen
never waits for the final renders. Only assets we have the right to use; the
README lists the AI tools and assets used for the character.

### Why these shares are equal

| | P1 | P2 | P3 |
|---|---|---|---|
| Points | 18 | 18 | 18 |
| Own spikes (risk) | V1, V3 | V4, AgentCore | V2, V5, Blender |
| Heaviest period | Oct 4–15 (feed), Oct 19–22 (video) | Oct 1–11 (stack, algorithm, agent) | Oct 4–18 (character, butler screen) |
| Stacks | App, backend (TS) | Backend (TS), agent (Python) | App (TS), agent I/O (Python), Blender |

## Milestones

| Dates | Goal |
|---|---|
| Oct 1–3 | Foundations: `packages/domain`, app scaffold, CDK stack, CI. All five spikes. |
| Oct 4 | **Spike checkpoint.** A failed spike switches to its plan B (`requirements.md`, section 9) by a PR. |
| Oct 4–11 | Blocks against mocks and fixtures. |
| Oct 12–15 | Integration: mock to real, one config value at a time. |
| Oct 16–18 | Polish, memory and responsiveness measurements. **Feature freeze Oct 18.** |
| Oct 19–22 | Demo video (P1 leads, all capture), README, product feedback, friction log, submission. |

## How we stay independent

1. **Contracts first.** `docs/contracts.md` and the shared types in
   `packages/domain` are the first PR. After that, a contract changes only by a
   PR that the other two approve.
2. **Mocks for everything.** The app runs on fixture JSON and a fake butler
   socket. The agent runs its tools against stubs that return the fixtures. The
   backend tests with the fixtures as expected outputs. Fixtures live in
   `packages/domain/fixtures/`.
3. **Folders follow blocks.** Where two people share a folder (`app/`,
   `agent/`, `backend/`), each works in their own subfolders and screens.
4. **One owner for the voice flow.** P3 owns the socket, audio in and audio
   out; P2 owns the agent brain. They meet at one interface defined in
   `packages/domain`: the voice side passes the user text (transcript or chip)
   to the brain, and the brain streams back answer text, suggestions, chips,
   weight changes or a fallback (the agent → app events of `contracts.md`,
   section 3, without audio).
5. **Integration** happens as soon as a real endpoint or socket is deployed:
   the app switches from mock to real with one config value.

## Shared work

Every owner writes the README section and the product feedback for the tools of
their blocks, and opens friction-log issues for the problems they hit. The
submission form is filled together after the freeze; P3 owns the final text.
