# FireDrift-AmazonDeveloper

Movie and series discovery for Fire TV (Vega OS): a trailer feed browsed with
the remote and an animated AI butler you talk to by voice. Docs: `docs/`.

## Development setup

Requirements: Node.js 22.12 or later, Python 3.12 and [uv](https://docs.astral.sh/uv/).

```sh
corepack enable        # once: provides the Yarn version pinned in package.json
yarn install
yarn typecheck
yarn test

cd agent
uv sync
uv run pytest
```

| Folder | Contents |
|---|---|
| `packages/domain` | Shared contract schemas, types and fixtures (`packages/domain/README.md`) |
| `agent` | Butler agent in Python (`agent/README.md`) |

## License

MIT, see `LICENSE`.
