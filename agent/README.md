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

The zod schemas in `packages/domain` are the source of truth. When a contract
changes, update `domain/models.py` in the same PR; `tests/test_fixtures.py`
fails if the mirror and the fixtures drift apart.
