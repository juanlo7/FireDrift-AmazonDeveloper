# FireDrift

Movie and series discovery for Fire TV (Vega OS), for people who do not know
what to watch. Two ways in, both with the remote:

- **Cover feed.** One title at a time, full screen. Like, skip, or press OK to
  see which of your services streams it and open that app. Every action teaches
  the taste.
- **The butler.** An animated character you talk to (or answer with chips). It
  suggests titles that TMDB confirms, explains why, and can change your taste
  when you ask ("I am tired of horror"), with Undo.

It complements streaming services; it does not replace them. Built for the
Amazon Developer Hackathon 2026, Fire TV track. Docs: `docs/`.

**Demo video (2:29):** <https://youtu.be/6VNLfnK9X84>

## Try it on our live stack (judges)

Our AWS stack stays up until Nov 20, 2026. No account or key is needed.

1. Start the Vega Virtual Device (see "Run the app on the Vega Virtual Device").
2. Install the prebuilt package attached to our Devpost submission
   (`firedrift-vpkg.zip`), or build your own (step 3):

   ```sh
   vega run-app app_aarch64.vpkg com.firedrift.app.main -d VirtualDevice   # Apple Silicon Mac
   vega run-app app_x86_64.vpkg com.firedrift.app.main -d VirtualDevice    # Linux, Intel Mac
   ```

3. From source: `app/src/config.ts` already holds the live URLs. Set
   `apiMode: 'real'` and `butlerMode: 'real'`, then build and run as below.

What to try: on the first run pick your services or Skip. Browse the feed (Up/Down), Like (Right), Skip (Left), Watch now
(OK). Press Back for the menu and open the butler: "Surprise me" puts a
TMDB card on screen; ask for more or less of something (a reply such as
"Something lighter") and he changes your taste, with Undo. The VVD has no microphone,
so use the chips there.

## How it works

```
Vega app (React Native for Vega, TypeScript)           app/
  ├─ Feed ── REST ──► API Gateway ─► Lambda (TS) ─► DynamoDB, TMDB   backend/
  └─ Butler ─ WebSocket ─► Bedrock AgentCore Runtime                 agent/
                            ├─ Strands agent (Claude Haiku 4.5, fallback Nova 2 Lite)
                            ├─ tools ─► AgentCore Gateway ─► Lambdas (weights, titles)
                            ├─ Amazon Transcribe (voice in) and Amazon Polly (voice out)
                            └─ caps and kill switch (DynamoDB config)
```

- **The feed never calls an LLM.** Ranking is our own algorithm
  (`backend/src/taste/`). Only the butler uses Bedrock, Transcribe and Polly,
  with caps and a kill switch.
- **TMDB confirms every title.** The model proposes `{title, year, type}`; nothing
  reaches the screen unless TMDB resolves it, and all metadata comes from TMDB.
- **Always something on screen.** If the agent, voice or a cap fails, the butler
  falls back to chips backed by the algorithm. The feed is never affected.
- **One source of truth for contracts:** `packages/domain` (schemas and
  fixtures). The app runs on those fixtures without any backend.

## AWS services

Amazon Bedrock (Claude Haiku 4.5, Nova 2 Lite), Bedrock AgentCore (Runtime and
Gateway), AWS Lambda, Amazon API Gateway (HTTP API), Amazon DynamoDB, Amazon
Cognito (anonymous device sign-in), Amazon Transcribe, Amazon Polly, Amazon S3
(Polly audio of the butler's answers), AWS Secrets Manager, AWS CDK. The stack
uses no NAT Gateway, VPC Lambdas, provisioned capacity or always-on resources (`docs/requirements.md`,
section 7).

## Development setup

Requirements:

| Tool | Version | Where the pin comes from |
|---|---|---|
| Node.js | 22 | CI (`.github/workflows/ci.yml`) and the Lambda runtime (`NODEJS_22_X`); `app` accepts 20 or later (`engines`) |
| Yarn | 4.12.0 | `packageManager` in `package.json`, through Corepack |
| Python | 3.12 | `agent/.python-version`, `agent/pyproject.toml`, AgentCore runtime `PYTHON_3_12` |
| uv | current | [docs.astral.sh/uv](https://docs.astral.sh/uv/) |
| Vega SDK | 0.24 | see "Run the app on the Vega Virtual Device" |

```sh
corepack enable        # once: provides the Yarn version pinned in package.json
yarn install
yarn typecheck
yarn test
yarn workspace @firedrift/app lint

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
| `videos/firedrift-demo` | The demo video as a HyperFrames project: script, footage, voice, render (`SCRIPT.md`) |
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

**Apple Silicon Macs.** `yarn build:debug` builds all architectures. The `yarn vvd`
script installs the `x86_64` package, so on an Apple Silicon Mac install the
`aarch64` one, and name the device `VirtualDevice`:

```sh
vega run-app build/aarch64-debug/app_aarch64.vpkg com.firedrift.app.main -d VirtualDevice
```

`yarn` itself may not be on your PATH after `corepack enable`; use
`corepack yarn <command>` if so. If the virtual device stops by itself, start it
again with `vega virtual-device start`.

Keys in the virtual device window: arrows (D-pad), Enter (OK), Esc (Back), F1 (Home),
F4 (Play/Pause).

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

## Run the butler and the backend

| What | How |
|---|---|
| App only, no AWS | Mock mode is the default (`app/src/config.ts`): the feed reads fixtures and the butler replays recorded agent events (`butlerMode: 'fake'`) |
| Backend on your machine | `backend/README.md`, "Local API": a free TMDB token, then `yarn workspace @firedrift/backend dev` and `apiMode: 'real'` |
| Agent on your machine | `agent/README.md`, "Server": AWS credentials and the tool Lambda names, then `uv run python -m server.app` and `uv run python -m server.fake_client ws://localhost:8080/ws` |
| The full stack on AWS | `backend/README.md`, "AWS stack (CDK)", "Deploy". It creates the API, the table, the secret, the butler runtime, the tool gateway, device sign-in and the speech bucket. Put the TMDB token in the secret after the first deploy |
| App against the deployed stack | `app/README.md`, "Butler socket": edit `app/src/config.ts`: `apiMode: 'real'`, `apiBaseUrl`, `butlerMode: 'real'`, `butlerSocketUrl`, `cognitoClientId`, `awsRegion` |

Tests and checks run in CI on every PR (`docs/workflow.md`, "CI"):
`corepack yarn typecheck`, `corepack yarn workspace @firedrift/app lint`, `corepack yarn test`, `cd agent && uv run pytest`. A fourth job runs the TV UI audit and only warns.

## Voice

- **Push to talk.** The app sends 16-bit PCM at 16 kHz to the agent, in frames
  of 32 KB or less, between `audio.start` and `audio.end`. The agent sends it
  to Amazon Transcribe streaming and keeps only the final text. The stack turns
  this on (`FIREDRIFT_TRANSCRIBE=on`). If Transcribe fails, the butler answers
  with chips. The app holds the key, records the microphone and streams it
  (#106); the Vega Virtual Device has no audio input, so the capture is not
  yet checked on a Vega device (#60). The agent end works today with
  `server.fake_client`.
- **Spoken answers.** Amazon Polly (neural voice, `Brian` by default) makes an
  MP3 and speech marks for each sentence. The marks time the gestures of the
  character. The MP3 goes to a private S3 bucket and the app plays it through a
  short-lived presigned URL. If Polly fails, the sentence shows as text.
- **The Vega Virtual Device has no audio input** (`docs/feedback.md`). Test
  push to talk on a Vega device. Chips work everywhere.

## Privacy

- No account, no name, no email. The app makes a random device ID on the first
  run and keeps it on the device.
- The backend stores that ID with your country, your services, and the signals
  you send (like, skip, watch now, time on a cover).
- **Voice audio is streamed for transcription and never stored.** The butler's
  own spoken answers are made by Amazon Polly. They are the only audio stored
  (a private S3 bucket), and they contain nothing about you.
- The TMDB key and the AWS credentials live in the backend only. The app has no
  secret.

## Credits and AI tools

- **Data:** This product uses the TMDB API but is not endorsed or certified by
  TMDB. Streaming availability data provided by JustWatch, through TMDB.
- **AI services:** Claude Haiku 4.5 and Amazon Nova 2 Lite on Amazon Bedrock;
  Strands Agents; Amazon Transcribe; Amazon Polly.
- **Built with AI help:** the code, the tests and the docs were written with
  Claude and Claude Code, reviewed and tested by the team. The butler's Blender
  `bpy` scripts are AI-assisted too. At run time, only the butler uses AI
  models: Claude Haiku 4.5 and Amazon Nova 2 Lite on Amazon Bedrock. The full, current list is on the app's About screen
  (`app/src/about/credits.ts`).
- **Assets:** the butler character is modeled, rigged and animated by the team in
  Blender. The TMDB logo follows the TMDB brand rules. The only video the app
  plays is the butler's own clips; it never downloads or re-hosts trailers.
  The demo video uses our own voice, royalty-free or generated sound effects,
  and no music.
- **Fonts:** Big Shoulders Display and Figtree (SIL OFL 1.1).
- **Code from Amazon samples:** focus helpers adapted from
  `AmazonAppDev/vega-tv-interfaces-sample` (MIT-0). See `docs/amazon-samples.md`.

## Product feedback and friction log

Problems we hit with Amazon and AWS tools, one line each, with the workaround:
`docs/feedback.md`. The submission text draft is `docs/submission.md`. Spike results: `docs/spikes.md`. Decisions and scope:
`docs/requirements.md`.

## License

MIT, see `LICENSE`.
