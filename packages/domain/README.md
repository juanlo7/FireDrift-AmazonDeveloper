# @firedrift/domain

Shared contracts for the FireDrift app, backend and agent: zod schemas, the
TypeScript types inferred from them, and a JSON fixture for every message.
The rules and meaning of each message are in `docs/contracts.md`; names follow
`docs/domain.md`.

## Use

```ts
import { PoolResponse, type TitleCard } from "@firedrift/domain";

const pool = PoolResponse.parse(await response.json()); // validates at runtime
const first: TitleCard | undefined = pool.titles[0];
```

| File | Contents | contracts.md |
|---|---|---|
| `src/common.ts` | `TitleCard`, `Signal`, `WeightsSummary`, `Chip`, `Gesture`, `ApiError` | 1, 6 |
| `src/rest.ts` | REST bodies and responses | 2 |
| `src/socket.ts` | Butler socket events, both directions | 3 |
| `src/tools.ts` | Agent tool inputs and outputs | 5 |
| `src/pipeline.ts` | `BrainInput`, `BrainEvent`, `CuedSentence` | 7 |

## Fixtures

`fixtures/{rest,socket,tools,pipeline}/` holds one JSON file per message. Use
them for mocks: the app reads them in `API_MODE=mock`, the fake butler socket
replays them, and the agent tool stubs return them.

`src/fixtures.test.ts` fails if a fixture is not registered, does not match its
schema, or a schema has no fixture. `agent/tests/test_fixtures.py` checks the
same files against the pydantic mirror.

## Changing a contract

1. Change `docs/contracts.md`, the schema here and `agent/domain/models.py`.
2. Update or add the fixtures.
3. Run `yarn test` and `cd agent && uv run pytest`.
4. Open a PR; the other two members approve it.
