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
| `app` | Vega app in React Native for Vega (`app/README.md`) |
| `packages/domain` | Shared contract schemas, types and fixtures (`packages/domain/README.md`) |
| `agent` | Butler agent in Python (`agent/README.md`) |

## Run the app on the Vega Virtual Device

Requirements: Ubuntu 20.04+ or macOS, KVM on Linux, and the
[Vega Developer Tools](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html)
(SDK 0.24):

```sh
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env
vega --version
```

Then, from the repository root:

```sh
yarn install
vega virtual-device start      # add --no-gl-accel if the GPU fails
cd app
yarn build:debug
yarn vvd                       # installs and launches build/x86_64-debug/app_x86_64.vpkg
```

The app starts in mock mode: it reads the fixtures in `packages/domain/fixtures/`
and needs no backend. See `app/README.md` to switch to the real API.

## License

MIT, see `LICENSE`.
