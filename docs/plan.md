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

Size of each block: S = 1 point, M = 2, L = 3. Each share started at **18
points**. "Equal" means equal effort, equal risk (each share owns its own
spikes), and an even load over the calendar. If a block turns out bigger or
smaller, rebalance by moving a block, not by leaving work unowned.

**Rebalance (Oct 12).** None of us has a Vega device, and P3's Apple Silicon
Mac is the only simulator that can run the WebView, and maybe the microphone
and the clip player. So P3 keeps everything that needs that Mac, and P1 takes
the P3 blocks that do not: the app end of the butler socket, caps and
fallback, the gesture parser and speech sync, and CI. P1's early blocks are
done, so P1 has the room.

**Rebalance (Oct 13).** The butler screen had not started five days before the
freeze, and without it there is no FR-5 in the demo. It is split: P1 builds
the screen (#99), which runs on any simulator against the deployed butler; P3
keeps the character in the screen's slot and push to talk (#60), which need the
Apple Silicon Mac, and the clips. If the clips are late, the slot's placeholder
(or the sprite-sheet plan B) still gives a complete demo.

The team works in React and TypeScript. The Python agent and the Blender
scripts are written with AI help (Claude); the owner reviews, tests and decides.

### Person 1 — Feed, catalog, voice and butler plumbing

The feed from the first key press to the streaming app, the catalog behind it,
the grounding tools that keep the butler honest, the butler's ears and voice,
the pipes between the agent and the app, and the butler screen.

| Block | Size | Where |
|---|---|---|
| Vega app scaffold: monorepo, navigation, theme, focus hooks, API client with one mock/real switch | M | `app/` |
| Spikes: V1 (YouTube IFrame in a WebView) and V3 (deep links, Content Launcher) | S | — |
| Feed: cover hold, single trailer player, D-pad keys, prefetch, memory check (FR-1) | L | `app/` |
| Services and country screen, settings, About screen with attributions (FR-4) | M | `app/` |
| Watch now sheet and app launch (FR-3) | M | `app/` |
| TMDB client with cache, providers per country, `GET /providers`, `GET /titles` | M | `backend/` |
| Grounding tools as Lambdas: `resolve_titles`, `similar` (nothing is shown unless TMDB resolves it) | S | `backend/` |
| Voice pipeline: Transcribe streaming in, Polly out with speech marks | L | `agent/voice/` |
| Caps, short context, silent fallback | S | `agent/brain/` |
| Gesture parser and speech sync: cue markers in the answer, parser that strips them, gesture timing and the `speaking` clip driven by Polly speech marks | M | `agent/character/`, `app/` |
| Butler WebSocket, app client end | S | `app/` |
| Butler screen (#99): states, answer text, Polly audio, suggestion card with Watch now, chips, undo/reset, character slot with a placeholder | L | `app/` |
| CI: typecheck, lint, tests, `audit.js` from devices-agent-skills | S | `.github/` |

### Person 2 — Taste, AWS and the agent core

The critical path at the start: shared types and the AWS stack come first.

| Block | Size | Where |
|---|---|---|
| Shared types, fixtures and the brain ↔ voice interface (first PR, day 1) | S | `packages/domain/` |
| CDK stack, HTTP API, DynamoDB, one secret, budgets and tags | M | `backend/` |
| Profiles, signals ingestion, `GET /pool`, weights with undo and reset | M | `backend/` |
| Signal queue with batch flush (FR-2, device side) | S | `app/` |
| Taste algorithm, weights (learned + adjustment layer), pools (4.1) | L | `backend/` |
| Weight tools as Lambdas: `get_weights`, `update_weights`, `ranked_picks` | S | `backend/` |
| AgentCore Runtime and Gateway deploy, config values, kill switch, spike V4 (model) | M | `backend/` |
| Strands agent core: tool loop, resolve-then-show, weight changes | M | `agent/brain/` |
| Butler WebSocket, agent server end | S | `agent/` |
| Model choice: Haiku 4.5 vs Nova 2 Lite on a short set of demo prompts (quality, latency, cost) | S | `agent/tests/` |

### Person 3 — Butler persona, gestures and character

Everything the user sees of the butler: who it is, how it reacts and the 3D
character that does it. The agent chooses the character's gestures itself, as
cues inside its own answer (`docs/contracts.md`, section 6). Also the README
for the judges. P3 owns the Apple Silicon simulator: every check that needs
the WebView, the microphone or the clip player runs there.

| Block | Size | Where |
|---|---|---|
| Spikes: V2 (microphone and push-to-talk button) and V5 (clip player next to the WebView, memory), repeated on the Apple Silicon simulator | S | — |
| Voice in on the Apple Silicon simulator: push to talk with Transcribe end to end | S | — |
| Persona prompt: voice and tone, short answers, chips, when and how much to gesture | S | `agent/brain/` |
| Gesture set: the closed list of gestures, what each one means and when the persona uses it | S | `agent/character/` |
| Character design, model and rig in Blender (`bpy` scripts, AI-assisted) | M | `assets/blender/` |
| Animate the four seamless loops and the one-shot gestures | L | `assets/blender/` |
| Render, compress and test the clips on the simulator (memory, loops) | S | `app/assets/butler/` |
| Character in the butler screen's slot (#60): clip player with the state loops and the gestures (`createSpeechSync`), push-to-talk mic capture | M | `app/` |
| README setup and run instructions; owner of the submission text | S | `README.md` |
| Demo video: script, shot list, capture and edit (< 3 min) | M | — |

The screen's character slot shows a placeholder until the clips land, so the
butler screen never waits for the final renders. Only assets we have the right to use; the
README lists the AI tools and assets used for the character.

### How the shares compare

| | P1 | P2 | P3 |
|---|---|---|---|
| Points | 24 | 16 | 15 |
| Own spikes (risk) | V1, V3 | V4, AgentCore | V2, V5, Blender, Apple Silicon simulator |
| AI share | Voice (Transcribe, Polly), grounding tools, caps and fallback, gesture sync | Agent core, weight tools, AgentCore, model choice | Persona, gesture set |
| Heaviest period | Oct 4–18 (feed, voice, butler plumbing and screen) | Oct 1–11 (stack, algorithm, agent) | Oct 4–18 (character, clips, simulator checks), Oct 19–22 (video) |
| Stacks | App, backend (TS), agent voice and brain (Python), CI | Backend (TS), agent (Python) | App (TS), agent persona (Python), Blender |

## Milestones

| Dates | Goal |
|---|---|
| Oct 1–3 | Foundations: `packages/domain`, app scaffold, CDK stack, CI. All five spikes. |
| Oct 4 | **Spike checkpoint.** A failed spike switches to its plan B (`requirements.md`, section 9) by a PR. |
| Oct 4–11 | Blocks against mocks and fixtures. |
| Oct 12–15 | Integration: mock to real, one config value at a time. |
| Oct 16–18 | Polish, memory and responsiveness measurements. **Feature freeze Oct 18.** |
| Oct 19–22 | Demo video (P3 leads, all capture), README, product feedback, friction log, submission. |

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
4. **Voice, brain and character meet at one interface.** P1 owns audio in
   and out (Transcribe, Polly), the gesture parser, the app end of the
   socket and the butler screen; P2 owns the agent brain and the server end of
   the socket; P3 owns the persona, the gesture set and the character in the
   screen. The interface is defined in `packages/domain`: the voice side
   passes the user text (transcript or chip) to the brain, and the brain
   streams back answer text with gesture cues, suggestions, chips, weight
   changes or a fallback (the agent → app events of `contracts.md`, section 3,
   without audio).
5. **Integration** happens as soon as a real endpoint or socket is deployed:
   the app switches from mock to real with one config value.

## Shared work

Every owner writes the README section and the product feedback for the tools of
their blocks, and opens friction-log issues for the problems they hit. The
submission form is filled together after the freeze; P3 owns the final text.
