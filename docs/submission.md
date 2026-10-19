# Submission text (draft)

Draft for the Devpost form. The final text comes after the feature freeze
(Oct 18) and after each teammate adds their product feedback. Items marked
**TODO** need a person. Do not state a feature here until it runs on the
simulator or device (`CLAUDE.md`, "Done means checked").

Track: Fire TV. Mini challenge: AWS Builder.
Repository: `juanlo7/FireDrift-AmazonDeveloper` (public, MIT).

## Elevator pitch

FireDrift helps people who do not know what to watch. Browse covers with the
remote, or talk to an animated butler. It learns your taste from what you like
and skip, then opens the streaming app that has the title.

## What it does

- **Cover feed.** One title at a time, full screen, with a slow animated
  backdrop, synopsis, rating and genres. Up and Down move between titles.
  Right is Like. Left is Skip. OK is Watch now. (FR-1)
- **Taste learning.** Like, skip, watch now and time on a cover change the
  taste weights. The ranking is our own algorithm in Lambda. The feed never
  calls an LLM. (FR-2)
- **Watch now.** The app shows which of your services stream the title and
  opens that app. TMDB and JustWatch supply the availability. (FR-3)
- **My services and country.** The feed shows only your services by default.
  Country comes from the device region and can be changed. (FR-4)
- **The butler.** An animated character that suggests titles, says why, and
  changes your taste when you ask ("I am tired of horror"). Every change has
  Undo. (FR-5)
  - It listens with push to talk (Amazon Transcribe streaming) and speaks with
    Amazon Polly. Quick-reply chips always work, with or without a microphone.
  - The model proposes `{title, year, type}`. TMDB must confirm each title
    before it shows. All metadata, links and availability come from TMDB, not
    from the model text.
  - If the agent, the voice or a spending cap fails, the butler falls back to
    chips backed by the ranking algorithm. The feed is not affected.
- **D-pad first.** Every screen works with the remote and shows focus.
- **Private.** No account. A random device ID, a country, your services and
  your signals. Voice audio is never stored.

**TODO (team):** list only what is verified on the simulator or device on
Oct 19. Remove any item above that is not. Known open items on Oct 16: the
microphone capture in the app (#60), the character clips and the video
playback on a real Vega device (spike V5), the cover feed without a trailer
player (D8 plan B).

## How we built it

- **App.** React Native for Vega, TypeScript strict, in `app/`. It runs on the
  Vega Virtual Device. A mock mode reads shared fixtures, so the app works
  without a backend.
- **Backend.** AWS serverless: HTTP API Gateway, Lambda (TypeScript, ARM,
  Node.js 22) and DynamoDB on demand. TMDB data is cached. The whole stack is
  one AWS CDK app in `backend/infra/`.
- **Butler agent.** A Strands agent in Python on Amazon Bedrock AgentCore
  Runtime, over a WebSocket. Model: Claude Haiku 4.5, with Amazon Nova 2 Lite as
  a config fallback. The tools are our Lambdas, exposed through AgentCore
  Gateway.
- **Voice.** Transcribe streaming for speech in. Polly neural voice for speech
  out. Polly speech marks give the time of each gesture cue, so the character
  gestures on the right word.
- **Contracts first.** `packages/domain` holds zod schemas and fixtures. The
  three of us built against them without waiting for each other.
- **CI.** Typecheck, lint, tests and a TV UI audit run on every pull request.
- **AI tools.** We wrote code, tests and docs with Claude and Claude Code. We
  reviewed and tested all of it. The Blender `bpy` scripts for the butler are
  AI-assisted. At run time only the butler uses AI models.

## AWS services and why (AWS Builder)

| Service | What it does in FireDrift | Why this one |
|---|---|---|
| Amazon Bedrock (Claude Haiku 4.5, Nova 2 Lite) | The butler's language model. Haiku 4.5 is the default; Nova 2 Lite is the fallback | We compared both on the demo prompts (#51): Haiku's picks fit the request, with the same time to first word. The model ID is a config value, so we can switch without a deploy |
| Amazon Bedrock AgentCore Runtime | Hosts the Strands agent and the butler WebSocket | Managed runtime for streaming sessions; no server to run |
| Amazon Bedrock AgentCore Gateway | Exposes our Lambdas to the agent as tools (`get_weights`, `update_weights`, `ranked_picks`) | One tool interface with IAM auth |
| Strands Agents | The agent loop and tool calls | Open source agent SDK that runs on AgentCore |
| AWS Lambda | REST routes, TMDB catalog, taste ranking, agent tools | Pay per call; ARM |
| Amazon API Gateway (HTTP API) | REST API for the feed, profile and signals | Cheap, with a rate limit per route |
| Amazon DynamoDB | Device profile, taste weights, signals, TMDB cache, butler caps and kill switch | On demand; TTL removes old items |
| Amazon Cognito | Anonymous device sign-in for the butler socket | The app has no login and no secret |
| Amazon Transcribe (streaming) | Push-to-talk speech to text | Streaming, so the text comes back about 0.3 s after release |
| Amazon Polly (neural) | The butler's voice and speech marks | Speech marks sync the animation |
| Amazon S3 | Private bucket for the MP3 of each butler answer, read through short-lived presigned URLs | The TV app plays audio from a URL. Only the butler's answers go there, never the user's voice |
| AWS Secrets Manager | The TMDB token | The secret lives in the backend only |
| AWS CDK | The whole stack as code | Repeatable deploy for judges |

The stack has no NAT Gateway, no VPC Lambda, no provisioned capacity and no
always-on resource. The butler has per-session and daily caps and a kill switch
in DynamoDB. Cost plan: `docs/requirements.md`, section 7.

Measured cost: about **$0.013 per butler turn** for the model on Haiku 4.5
(Nova 2 Lite: $0.004), so about $0.02 per voice turn with Transcribe and
Polly, as planned. Total AWS spend from Oct 1 to Oct 19: **$0.35** before
credits (Secrets Manager, Polly, DynamoDB, S3).

**TODO (P2):** update the total spend from the AWS console on Oct 22.

## Challenges

- **No WebView on the Vega Virtual Device (Ubuntu, Intel Mac).** The trailer
  player could not run. We changed the feed to covers with an animated backdrop
  (D8 plan B) and kept the device-memory limit as a design rule.
- **No audio input and no video decoding on the Vega Virtual Device.** We could
  not test the microphone or the clips there. We built the agent end against a
  fake client and kept chips as a full alternative.
- **Claude Haiku 4.5 blocked on Bedrock** for our account (use case form). We
  ran on Nova 2 Lite through one config value until the form unblocked Haiku,
  then picked the model with a test on the demo prompts (#51).
- **The model must not invent titles.** We made "propose freely, TMDB
  confirms": nothing shows unless TMDB resolves it.
- **Cost on $150 of credits.** We set caps per turn, per session and per day,
  a kill switch, and a design where the feed never calls a model.
- **Time.** Three people, no Vega device at first. We split the work by
  contract and moved blocks between us (`docs/plan.md`).

## What we learned

- A contract-first split (shared schemas and fixtures) lets three people work
  without blocking each other.
- Streaming Transcribe from Python needs a SigV4-signed WebSocket URL. boto3
  has no streaming client for it.
- A fallback path (chips) is cheaper than making the voice path perfect.
- The Vega tools are young. Several problems had no documented answer. We kept
  them in the friction log below.

**TODO (team):** each person adds one or two lessons of their own.

## What is next

- Run push to talk and the character clips on a Vega device.
- Add the trailer player when the Vega WebView works on our simulator.
- Conversation mode: the butler listens again after it speaks.
- Household profiles and group mode.
- Spanish UI and voice.
- Prepare a Vega Appstore release.

## Product feedback and friction log

The form asks, for each tool, API or SDK: what we used it for, what worked, what
needs work, how onboarding went, and whether we would build with it again. The
full friction log is `docs/feedback.md` (one line per problem, with the
workaround). Summary of the Oct 4 to Oct 10 entries:

**Vega SDK, Vega Virtual Device and CLI**

- The Vega Virtual Device has no WebView on Ubuntu and Intel Mac. The WebView
  guide does not say so.
- On the Vega Virtual Device, the audio input and video decoding do not work.
  The errors give no cause ("error in audio record stream read", `MediaError`
  code 3 and 4).
- `vega virtual-device start` reports a timeout and exits 0 when the emulator
  crashed while loading Vulkan (NVIDIA, Ubuntu). It also stops by itself on
  Apple Silicon. The docs do not mention either.
- `vega device list`, `installed-apps` and `running-apps` hang. `vega run-app`
  accepts `-d VirtualDevice` but not `-d emulator-5554`.
- `react-native build-vega` writes `[[needs.module]]` entries into
  `manifest.toml` and never removes them.
- There is no documented command for a simulator screenshot. `screenshooter`
  breaks the dev shell.
- `inputd-cli button_press` key names are not documented.
- The docs page `docs/vega/latest/install-vega-sdk.html` is an empty redirect.

**Vega React Native libraries**

- The Jest preset's `BackHandler` and `Dimensions` mocks crash any app with
  React Navigation.
- `Linking.canOpenURL` throws when no app handles the URL, unlike the React
  Native contract.
- An `Image` inside an open `Modal` does not paint when its URL is not cached.
- `useTVEventHandler` sends OK as `enter`, not `select`, from the VVD keyboard
  and `inputd-cli`.
- The async-storage package tagged for RN 0.83 fails the Vega build.
- The `api-privileges-check` lint rule asks for the wrong privilege on the audio
  library.

**AWS**

- Bedrock `ConverseStream` for Claude Haiku 4.5 failed with a "use case details
  not submitted" error, after a `converse` call had worked two days before.
  No notice came in between.
- boto3 with `aws login` credentials needs `botocore[crt]`, which plain `boto3`
  does not install. The AWS CLI works with the same profile.
- The AWS Price List API has no price for Claude models on Bedrock, so the
  cost per turn needs the pricing web page.

Each entry is also a GitHub issue with steps, expected and actual results, and
a suggestion: label
[`friction-log`](https://github.com/juanlo7/FireDrift-AmazonDeveloper/issues?q=label%3Afriction-log).

**TODO (each teammate):** add your own product feedback here for the tools you
used, in the five questions of the form. One short block per person.

| Person | Tools | Worked well | Needs work | Onboarding | Build again? |
|---|---|---|---|---|---|
| P1 | TODO | TODO | TODO | TODO | TODO |
| P2 | Amazon Bedrock (Converse, Claude Haiku 4.5, Nova 2 Lite), Bedrock AgentCore Runtime and Gateway, Strands Agents, Lambda, API Gateway, DynamoDB, Cognito, AWS CDK | One Converse API for both models, so switching is one config value. Strands runs our tools with little code, and its `Model` interface let us test the agent loop with a scripted model, without Bedrock. AgentCore Runtime hosts the butler WebSocket with no server to run, and Gateway exposes our Lambdas as tools. CDK deployed the whole stack from one app, one construct per owner | The Bedrock use case form appeared with no notice after Haiku 4.5 already worked. The Price List API has no Claude prices. boto3 cannot read `aws login` credentials without `botocore[crt]` | Fast: a 20-line Strands script answered on Bedrock on day 3 (spike V4, Oct 3), and the CDK stack was deployed the next day (#71). | Yes: serverless and pay per call fit a $150 budget, and the agent stack (Strands, AgentCore) let one person build the butler backend |
| P3 | TODO | TODO | TODO | TODO | TODO |

**TODO (P3, Apple Silicon Mac):** add the entries from the WebView, microphone
and clip tests on the Mac, and add any new line to `docs/feedback.md`.

## Links

- Demo video (under 3 minutes, YouTube or Vimeo): **TODO** add the link after
  the recording.
- Repository: `https://github.com/juanlo7/FireDrift-AmazonDeveloper` (public
  and `LICENSE` visible in "About": **TODO** check on Oct 22).
- Primary track: Fire TV. Mini challenge: AWS Builder.
- Optional feature requests for Amazon:
  - **WebView, audio input and video decoding on the Vega Virtual Device on
    Linux and Intel Mac** (Critical): without them, a team with no Vega device
    or Apple Silicon Mac cannot test players, voice or WebView apps.
  - **`vega device screenshot` and a detached `vega virtual-device start`**
    (Important): screenshots for docs and reviews, and a simulator that
    survives the shell that started it, for scripts and CI.
  - **Notice before Bedrock model access changes** (Important): ask for the
    use case form before the first call works, and say so in the console.
  - **Claude prices in the AWS Price List API** (Nice-to-have): cost tooling
    needs one source for every Bedrock model.

## Pending list before submission (Oct 22)

- [ ] Demo video link.
- [ ] Teammates' product feedback.
- [ ] Features list checked against the simulator or device.
- [x] Cost per voice turn (#51).
- [ ] Total spend on Oct 22.
- [ ] Repository public, `LICENSE` in "About".
- [ ] README setup tested from a clean clone.
