# FireDrift agent

The butler agent (Python, Strands) that runs on Amazon Bedrock AgentCore Runtime.
Contracts: `docs/contracts.md`, sections 3, 5, 6 and 7.

## Setup

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```sh
cd agent
uv sync
uv run pytest
```

## Layout

| Folder | What | Owner |
|---|---|---|
| `domain/` | Pydantic mirror of `packages/domain` (socket, tools, pipeline) | P2 |
| `server/` | WebSocket server end: session, routing, event order | P2 |
| `brain/` | Strands agent core: tool loop, resolve-then-show, weight changes | P2 |
| `brain/` (persona, caps) | Persona prompt, caps, short context, fallback | P3 |
| `character/` | Gesture parser and gesture timing | P3 |
| `voice/` | Transcribe streaming in, Polly with speech marks out | P1 |
| `tests/` | Tests for every folder; fixtures come from `packages/domain/fixtures` | All |

## Brain (`brain/`, #49)

One Strands agent per butler session. `Brain(client).start(Session(...))`
returns a session whose `run_turn(TextInput | ChipInput)` streams the brain
events of `docs/contracts.md` section 7.

- **Tools the model sees** (`tools.py`): `get_taste`, `change_taste`,
  `find_titles`, `similar_titles`, `ranked_picks`, `show_suggestion`. They are
  bound to the session, so `profileId` never appears in a tool signature.
- **Resolve-then-show:** `show_suggestion` only accepts a title that
  `find_titles`, `similar_titles` or `ranked_picks` returned in this turn (and
  not the one already on screen), and builds the `suggestion` event from the
  TMDB card. At most one suggestion per answer and 3 lookups per turn.
- **Weights:** `change_taste` calls `update_weights` (limits enforced by the
  tool) and emits `weights.changed`; the app's Undo button calls
  `POST /weights/undo`.
- **Chips** (`chips.py`): picked by the code from the title on screen; a chip
  becomes a sentence for the model. "Tell me more" passes the TMDB card.
- **Answer text** keeps the `{{gesture}}` markers for the parser (#56). On a cap
  or any error the turn is a single `fallback` event with chips.
- **Fact check** (`grounding.py`): `unsupported_facts(answer, tool_results)`
  lists years, runtimes, ratings and services that no tool result backs.
- **Tools behind `ToolClient`** (`tool_client.py`): `FixtureToolClient` (tests),
  `LambdaToolClient` (boto3), `CompositeToolClient` (P2 Lambdas, fixtures for
  `resolve_titles` and `similar` until #40). The Gateway client comes with #48.
- **Config** (`config.py`, environment): `FIREDRIFT_MODEL_ID` (default Claude
  Haiku 4.5; `us.amazon.nova-2-lite-v1:0` as fallback), `FIREDRIFT_MAX_TOKENS`,
  `FIREDRIFT_TEMPERATURE`, `FIREDRIFT_TURN_TIMEOUT_S`, `FIREDRIFT_MAX_MODEL_CALLS`
  and the `FIREDRIFT_*_FN` Lambda names.

**Hooks for P3:** `brain/persona.md` is the start of the system prompt (#54);
`brain/caps.py` has `check_caps(session)` and `trim_history(messages)` (#55).
`brain/prompts/grounding.md` holds the tool rules (P2).

**Try it against AWS** (Bedrock and the weight tools are real; about $0.01 per turn):

```sh
eval "$(aws configure export-credentials --profile firedrift --format env)"
uv run python -m brain.demo --profile <uuid> "Something like Dark, but shorter" chip:tell_me_more "I'm tired of action movies"
```

Tests use `tests/scripted_model.py`, a Strands model that plays a script, so
the real agent loop runs the real tools without Bedrock.

## Server (`server/`, #50)

The Bedrock AgentCore Runtime app (`bedrock-agentcore`): the butler WebSocket at
`/ws` and the health check at `/ping`, on port 8080, as the Runtime expects.
One `ButlerConnection` per socket (contracts section 3):

- The first frame must be `session.start`; `profileId`, country and services
  come from it. Anything else gets a `fallback` and the socket closes.
- `chip.select` and the final transcript of push to talk start a brain turn;
  every turn starts with `thinking`. A new input during a turn cancels it.
- `suggestion.feedback` becomes context for the next input.
- Answer text goes to the app sentence by sentence, without gesture markers;
  `suggestion`, `chips`, `weights.changed`, `answer.done` and `fallback` pass
  through. Any failure is a `fallback` with chips. Idle sessions close after
  10 minutes (`FIREDRIFT_IDLE_TIMEOUT_S`).

**Interfaces for P1 and P3** (`server/pipeline.py`, contracts section 7):
`GestureParser` (#56, placeholder `SentenceSplitter`), `VoiceOut` and `VoiceIn`
(#41, placeholders: no `speech` yet, and push to talk answers with a chips
fallback). Swap them in `server/app.py`.

**Run it locally** against AWS (Nova 2 Lite while Claude is blocked, #76):

```sh
eval "$(aws configure export-credentials --profile firedrift --format env)"
export AWS_REGION=us-east-1 FIREDRIFT_MODEL_ID=us.amazon.nova-2-lite-v1:0
export FIREDRIFT_GET_WEIGHTS_FN=… FIREDRIFT_UPDATE_WEIGHTS_FN=… FIREDRIFT_RANKED_PICKS_FN=…  # stack outputs
uv run python -m server.app                              # ws://localhost:8080/ws
uv run python -m server.fake_client ws://localhost:8080/ws
```

`server/fake_client.py` replays the app → agent fixtures and validates every
agent event against the contract; the app client (#61) can follow the same order.
From the VVD, forward the port: `vega device start-port-forwarding -p 8080 --forward false`.

The zod schemas in `packages/domain` are the source of truth. When a contract
changes, update `domain/models.py` in the same PR; `tests/test_fixtures.py`
fails if the mirror and the fixtures drift apart.
