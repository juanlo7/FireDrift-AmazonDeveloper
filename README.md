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
| `backend` | Lambdas in TypeScript: TMDB catalog, REST routes (`backend/README.md`) |
| `backend/infra` | AWS stack in CDK: API, table, secret, Lambdas (`backend/README.md`, "AWS stack") |
| `tools/fake-streaming-app` | Test Vega app that Watch now can open on the VVD (`tools/fake-streaming-app/README.md`) |
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
vega virtual-device start
cd app
yarn build:debug
yarn vvd                       # installs and launches build/x86_64-debug/app_x86_64.vpkg
```

If the virtual device never answers ("Deadline reached (60s) but virtual
device unresponsive") or shows a black window, the emulator crashed while
loading Vulkan (seen with NVIDIA drivers on Ubuntu). Turn Vulkan off for the
emulator and start it again:

```sh
mkdir -p ~/.android
printf 'Vulkan = off\nGLDirectMem = on\n' > ~/.android/advancedFeatures.ini
vega virtual-device stop && vega virtual-device start
```

Keys in the virtual device window: arrows (D-pad), Enter (OK), Esc (Back), F1 (Home).

To drive and check the VVD from a terminal (`screenshooter` on the device
breaks the dev shell, see `docs/feedback.md`):

```sh
# press a key: KEY_UP / KEY_DOWN / KEY_LEFT / KEY_RIGHT / KEY_ENTER / KEY_BACK
~/vega/sdk/vega-sdk/main/*/bin/tools/vda -s emulator-5554 shell 'inputd-cli button_press KEY_DOWN'
# screenshot to <dir> through the emulator console (token in ~/.emulator_console_auth_token)
{ echo "auth $(cat ~/.emulator_console_auth_token)"; echo "screenrecord screenshot $PWD"; sleep 2; } | nc localhost 5554
```

The app starts in mock mode: it reads the fixtures in `packages/domain/fixtures/`
and needs no backend. See `app/README.md` to switch to the real API.

## License

MIT, see `LICENSE`.
