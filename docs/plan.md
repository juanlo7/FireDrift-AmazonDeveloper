# FireDrift — Plan

Three people, three equal shares of work. Each share is a set of blocks with
one owner; a share does not have to match one layer of the code. People work
**without waiting for each other**: blocks meet only through the contracts in
`docs/contracts.md`, and everyone builds against mocks of those contracts until
the real parts are ready. Tasks live as GitHub issues, not in docs.

Fixed dates: **feature freeze Sun, Oct 18**, **submission Thu, Oct 22**
(official deadline Fri, Oct 23, 12:00 pm PT).

## Shares

Size of each block: S = 1 point, M = 2, L = 3. Each share is **16 points**.
If a block turns out bigger or smaller, rebalance by moving a block, not by
leaving work unowned.

### Person 1 — Feed and voice pipeline

| Block | Size | Where |
|---|---|---|
| Feed: cover hold, single trailer player, D-pad keys, prefetch (FR-1) | L | `app/` |
| Recycled player pool as an open-source package with tests and README | M | `packages/player-pool/` |
| Signal queue with batch flush (FR-2, device side) | S | `app/` |
| Services and country screen, settings (FR-4) | M | `app/` |
| Watch now sheet and app launch (FR-3) | M | `app/` |
| About screen with attributions | S | `app/` |
| TMDB client with cache, providers per country | M | `backend/` |
| Voice pipeline: Transcribe streaming in, Polly out with speech marks | L | `agent/voice/` |

### Person 2 — Taste, AWS and the agent brain

| Block | Size | Where |
|---|---|---|
| CDK stack, HTTP API, DynamoDB, one secret, budgets and tags | M | `backend/` |
| Profiles and signals ingestion | S | `backend/` |
| Taste algorithm, weights (learned + adjustment layer), pools (4.1) | L | `backend/` |
| Butler tools as Lambdas: `get_weights`, `update_weights`, `resolve_titles`, `similar`, `ranked_picks` | M | `backend/` |
| AgentCore Runtime and Gateway deploy, config values, kill switch | M | `backend/` |
| Strands agent: system prompt, grounding (resolve-then-show), chips, weight changes | L | `agent/brain/` |
| Caps, short context, silent fallback | S | `agent/brain/` |
| Butler test set: drop rate, no unresolved title shown, weight limits | M | `agent/tests/` |

### Person 3 — Butler character and experience

Everything the user sees and hears of the butler, from the 3D character to the
screen it lives in.

| Block | Size | Where |
|---|---|---|
| Character plan: look, personality, the four states, shot framing, clip spec check on Vega | M | `assets/blender/` |
| Character model and rig in Blender (AI-assisted) | M | `assets/blender/` |
| Animate the four seamless loops (`idle`, `listening`, `thinking`, `speaking`) | L | `assets/blender/` |
| Render, compress and test the clips on the simulator or device (memory, loops, sync) | M | `assets/butler/` |
| Butler screen: clip player and states, card, chips, push-to-talk mic capture, audio playback, undo/reset | L | `app/` |
| Butler WebSocket protocol, both ends (agent server and app client) | M | `agent/`, `app/` |
| Demo video: script, shot list, capture and edit (< 3 min) | M | — |

Placeholder clips with the final names exist from day one, so the butler screen
never waits for the final renders. Only assets we have the right to use; the
README lists the AI tools and assets used for the character.

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
4. **Integration** happens as soon as a real endpoint or socket is deployed:
   the app switches from mock to real with one config value.

## Shared work

Every owner writes the README section and the product feedback for the tools of
their blocks, and opens friction-log issues for the problems they hit. The
submission form is filled together after the freeze.
