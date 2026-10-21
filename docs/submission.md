# Submission text

The text of the Devpost form, field by field, in the order of the form. Edit it
here first, then copy it to Devpost. Devpost keeps the submission editable until
the deadline (Fri, Oct 23, 2026, 12:00 pm PT). Only state a feature here when it
runs on the simulator or device (`CLAUDE.md`, "Done means checked").

- Devpost project: `FireDrift` (team: juanlo7, JJavierBS, wall3n).
- Track: Fire TV. Mini challenges: AWS Builder and Open Source.
- Repository: <https://github.com/juanlo7/FireDrift-AmazonDeveloper> (public, MIT).
- Demo video: <https://youtu.be/6VNLfnK9X84>.

## 1. Project overview

**Project name:** FireDrift

**Elevator pitch** (200 characters at most):

> Can't pick what to watch? FireDrift is a Fire TV feed that learns your taste
> from the remote, plus an animated AI butler you talk to. Then one button opens
> the app that streams it.

## 2. Project details

### About the project (Markdown)

```markdown
## Inspiration

You sit down to watch something, scroll catalog rows across five streaming apps, and twenty minutes later you still have not picked. It is not a content problem. It is a choosing problem.

We wanted the opposite on the TV: one title at a time that gets closer to your taste with every press of the remote, and, when you would rather ask, a butler who knows your taste and answers out loud. FireDrift helps you pick, then hands you over to the app that streams the title. It complements streaming services; it does not compete with them.

## What it does

FireDrift is a React Native for Vega app for Fire TV with two ways in, both driven by the remote.

**The cover feed**
- One title at a time, full screen, with a slow animated backdrop, synopsis, rating and genres.
- **Right** is Like, **Left** is Skip, **Up/Down** browse, **OK** is Watch now.
- Every press, and the time you spend on a cover, changes your taste weights. The ranking is our own algorithm in AWS Lambda: **the feed never calls an LLM**, so it is fast and costs almost nothing.
- **Watch now** shows which of your services stream the title (TMDB + JustWatch data) and opens that app.
- You pick your services and country once. The feed shows only what you can watch.

**The butler**
- An animated character, modeled, rigged and animated by us in Blender, with idle, listening, thinking and speaking states.
- Press "Surprise me" or a chip, or hold to talk. He proposes one title, says why in his own voice (Amazon Polly), and offers the next replies as chips.
- Ask for "something lighter" and he **changes your taste weights live** through a tool call, with **Undo** and **Reset** on screen.
- **Propose freely, TMDB confirms.** The model proposes `{title, year, type}`; nothing reaches the screen unless TMDB resolves it. Every poster, synopsis, link and service comes from TMDB, never from the model text.
- Polly speech marks time each gesture, so the character gestures on the right word.
- If the agent, the voice or a spending cap fails, the butler falls back to chips backed by the ranking algorithm, and tries the agent again on the next visit. The feed is never affected.

**Built for the TV**
- D-pad first: every screen works with the remote and shows focus.
- One cover in memory at a time; the butler adds at most one clip player.
- No account and no personal data: a random device ID, your country, your services and your signals. Voice audio is never stored.

## How we built it

- **App:** React Native for Vega (RN 0.83), TypeScript strict. A mock mode reads shared fixtures, so the app runs without a backend.
- **Backend:** HTTP API Gateway, Lambda (TypeScript, ARM, Node.js 22) and DynamoDB on demand, with the TMDB data cached. One AWS CDK app deploys the whole stack, one construct per teammate.
- **Butler agent:** a Strands agent in Python on Amazon Bedrock AgentCore Runtime, over a WebSocket. Model: Claude Haiku 4.5 on Bedrock, with Amazon Nova 2 Lite as a config fallback. AgentCore Gateway turns our Lambdas into tools (`get_weights`, `update_weights`, `ranked_picks`, `resolve_titles`, `similar`).
- **Voice:** push to talk streams 16 kHz PCM to the agent, which sends it to Amazon Transcribe streaming. Answers come back as Amazon Polly neural speech with speech marks. Anonymous device sign-in with Amazon Cognito; the app holds no secret.
- **Cost by design:** no NAT Gateway, no VPC Lambda, no always-on resource. The butler has per-session and daily caps and a kill switch in DynamoDB.
- **Contracts first:** `packages/domain` holds zod schemas and fixtures for the REST API, the butler socket and the agent tools. The three of us built against them without waiting for each other.
- **Quality:** typecheck, lint, Jest, pytest and a TV UI audit (focus and input) run on every pull request.
- **AI tools:** we wrote code, tests and docs with Claude Code and reviewed and tested all of it. At run time only the butler uses AI models.

## Challenges we ran into

- **No WebView on the Vega Virtual Device on Ubuntu and Intel Mac.** Our first design was a trailer feed in a YouTube player. We moved to covers with an animated backdrop, which also fits the device memory better.
- **No audio input on the Vega Virtual Device.** We could not record the microphone there, so we tested the agent end with a scripted client and made chips a full alternative to voice.
- **The clip player and the character.** The player rejected `file://` URLs with a bare `MediaError`; a plain `/pkg/assets/...` path plays and loops.
- **Claude Haiku 4.5 blocked on Bedrock** after it had worked (use case form). We ran on Nova 2 Lite through one config value, then picked the model with a small eval on the demo prompts.
- **A model must not invent titles.** "Propose freely, TMDB confirms" fixed it: the model can be creative, the screen stays true.
- **$150 of credits.** Caps per turn, per session and per day, a kill switch, and a feed that never calls a model.
- We logged every tool problem as a friction-log issue with steps and a suggestion (18 issues).

## Accomplishments that we're proud of

- **The butler never shows an invented title.** Every card comes from TMDB.
- **The AI changes your taste and you stay in control:** validated, clamped tool calls with Undo.
- **The feed works without any AI**, so the main screen has no model cost and no model latency.
- **Cheap to run:** about $0.013 per butler turn on Claude Haiku 4.5 and $1.87 of total AWS spend from Oct 1 to Oct 21, before credits.
- **A character, not a chat box:** our own Blender butler whose gestures land on the spoken word.
- **Three people, no blocking**, thanks to shared schemas and fixtures.

## What we learned

- A contract-first split lets three people work in parallel and plug in the real service later.
- A fallback path (chips) is cheaper and more robust than a perfect voice path.
- A scripted model behind the Strands `Model` interface tests the whole agent loop and our real tools without Bedrock, and the same prompts on Bedrock give a cheap model comparison.
- Streaming Transcribe from Python needs a SigV4-signed WebSocket; boto3 has no streaming client for it.
- The Vega tools are young: keep a friction log from day one.

## What's next for FireDrift

- Test push to talk and the character on a Vega device, then measure memory.
- Add the trailer player when the Vega WebView runs on our simulators.
- Conversation mode: the butler listens again after it speaks.
- Household profiles and a group mode.
- Spanish UI and voice, then a Vega Appstore release.
```

### Built with (25 tags at most)

react-native, vega-os, fire-tv, typescript, python, strands-agents,
amazon-bedrock, bedrock-agentcore, claude-haiku-4.5, amazon-nova,
aws-lambda, amazon-api-gateway, amazon-dynamodb, amazon-cognito,
amazon-transcribe, amazon-polly, amazon-s3, aws-secrets-manager, aws-cdk,
tmdb, blender, zod, jest, pytest, hyperframes

### "Try it out" links

- <https://github.com/juanlo7/FireDrift-AmazonDeveloper>

### Image gallery (3:2)

Feed cover, Watch now panel, butler answer with chips, taste change with Undo,
AWS architecture frame. Taken from `videos/firedrift-demo/assets/stills/` and
the video.

### Video demo link

<https://youtu.be/6VNLfnK9X84>

## 3. Additional info (for judges)

**Upload a file:** `firedrift-vpkg.zip` with the release app packages for
`aarch64`, `x86_64` and `armv7` (device, not tested), built against the live
stack, plus `INSTALL.txt`.

| Field | Value |
|---|---|
| Submitter type | Team |
| Organization name | N/A |
| Country of residence | Spain |
| Canada province | N/A |
| Primary track | Fire TV |
| Code repository | <https://github.com/juanlo7/FireDrift-AmazonDeveloper> |
| New or existing | New |
| AWS Builder mini challenge | Yes |
| Open Source mini challenge | Yes |
| Open Source contribution URL | <https://github.com/juanlo7/FireDrift-AmazonDeveloper> |
| Open Source project repository URL | <https://github.com/juanlo7/FireDrift-AmazonDeveloper> |
| GitHub username | juanlo7 |

### AWS Builder: which AWS services did you incorporate and how?

```text
FireDrift is a multi-service pipeline: a Strands agent on Bedrock AgentCore that calls our own Lambdas as tools, with Transcribe for speech in and Polly for speech out. Everything is one AWS CDK app (backend/infra) in us-east-1.

- Amazon Bedrock (Claude Haiku 4.5; Amazon Nova 2 Lite as fallback): the butler's model, through the Converse API. The model ID is a config value in DynamoDB, so we switch models without a deploy. We chose Haiku 4.5 with a small eval on the demo prompts: its picks fit the request better, with the same time to first word.
- Amazon Bedrock AgentCore Runtime: hosts the Strands agent and the butler WebSocket (one session per butler visit). No server to run.
- Amazon Bedrock AgentCore Gateway: exposes our Lambdas to the agent as MCP tools with IAM auth: get_weights, update_weights (validated, clamped, undoable), ranked_picks, resolve_titles, similar.
- Strands Agents (Python): the agent loop, streaming and tool calls. Its Model interface also lets us test the loop with a scripted model, without Bedrock.
- Amazon Transcribe streaming: push-to-talk speech to text. The agent streams the PCM frames over a SigV4-signed WebSocket and keeps only the final text. Audio is never stored.
- Amazon Polly (neural voice): the butler's voice. Speech marks time each gesture of the animated character to the spoken word.
- Amazon S3: private bucket for the MP3 of each butler answer, read by the TV through short-lived presigned URLs, removed by a lifecycle rule.
- Amazon Cognito: anonymous device sign-in for the butler socket. The app has no login and no secret.
- AWS Lambda (TypeScript, ARM, Node.js 22): REST routes, TMDB catalog with cache, our taste-ranking algorithm, the agent tools.
- Amazon API Gateway (HTTP API): REST API for the feed, profile and signals, with throttling per route.
- Amazon DynamoDB (on demand, TTL): device profile, taste weights, signals, TMDB cache, butler caps and kill switch.
- AWS Secrets Manager: the TMDB token. It lives only in the backend.
- AWS CDK and CloudWatch Logs: the whole stack as code; logs kept 7 days.

Cost design: no NAT Gateway, no VPC Lambda, no provisioned capacity, no always-on resource. The feed never calls an LLM. The butler has per-session and daily turn caps and a kill switch. Measured: about $0.013 per butler turn on Claude Haiku 4.5 ($0.004 on Nova 2 Lite), about $0.02 per voice turn with Transcribe and Polly. Total AWS spend from Oct 1 to Oct 21: $1.87 before credits (Claude Haiku 4.5 $1.22, Secrets Manager $0.21, Polly $0.18, AgentCore $0.10, the rest under $0.10).

Docs: README "How it works" and "AWS services", backend/README.md, agent/README.md, docs/contracts.md (REST, socket, tools), docs/requirements.md section 7 (cost).
```

### Open Source: what you did, how it works, and why it matters

```text
What: FireDrift is a new MIT-licensed, end-to-end open-source app for Fire TV built during the hackathon: a React Native for Vega client, a serverless AWS backend and a Strands agent on Bedrock AgentCore, with CI, tests and setup docs.

How it works: the app talks to an HTTP API (Lambda + DynamoDB) for the feed and to a WebSocket on AgentCore Runtime for the butler. The agent calls our Lambdas as tools through AgentCore Gateway, and Transcribe and Polly carry the voice. packages/domain holds the shared zod schemas and fixtures, so the app runs fully in mock mode with no AWS account.

Why it matters: there are few complete, public examples of React Native for Vega apps, and fewer that connect one to an AWS agent stack. Others can reuse:
- the agent pattern "the model proposes, an API confirms" (no invented titles on screen), with validated and undoable tool calls;
- Polly speech marks that drive a character's gestures on the TV;
- a scripted Strands Model that tests the whole agent loop without Bedrock;
- D-pad focus helpers and a TV UI audit (focus and input) that runs in CI;
- a VVD toolbox: key presses and screenshots from the terminal, the Vulkan workaround for NVIDIA, and the clip-path fix for react-native-w3cmedia;
- 18 friction-log issues with steps and suggestions for the Vega and AWS tools.
```

### Feature requests (optional)

```text
1. WebView, audio input and video decoding on the Vega Virtual Device on Linux and Intel Mac. Priority: Critical. Without them, a team with no Vega device or Apple Silicon Mac cannot test players, voice or WebView apps. We had to drop our trailer player and could not test push to talk.
2. A screenshot command and a detached start for the Vega Virtual Device (vega device screenshot, vega virtual-device start --detach). Priority: Important. Screenshots for docs and reviews, and a simulator that survives the shell that started it, for scripts and CI.
3. Clear errors from react-native-w3cmedia and keplerscript-audio-lib (which path, codec or device capability failed). Priority: Important. A bare MediaError code 3 or 4, or a stream that reports success and reads 0 bytes, cost us days.
4. Notice before Bedrock model access changes: ask for the Anthropic use case form before the first call works, and show it in the console. Priority: Important. Our agent broke mid-sprint with no warning.
5. Claude prices in the AWS Price List API. Priority: Nice-to-have. Cost tooling needs one source for every Bedrock model.
```

### Friction log (optional, up to 10% bonus)

The form field takes one URL: the link to this section.

```text
All 18 entries are GitHub issues with steps, expected and actual results and a suggestion: https://github.com/juanlo7/FireDrift-AmazonDeveloper/issues?q=label%3Afriction-log . One line per entry, with the workaround: docs/feedback.md.

Format: task | steps | expected vs actual | severity | workaround | suggestion

1. Run a WebView (YouTube player) on the Vega Virtual Device, Ubuntu 24.04 (#115) | install an app with @amazon-devices/webview 3.5 or 4.0 | expected it installs; actual "Module dependency not found: /com.amazon.kepler.webview_4@IWebview_4" | High | dropped the trailer player for covers (plan B) | say in the WebView guide that the VVD on Linux and Intel Mac has no WebView, or ship it.
2. Record the microphone on the VVD (#123) | AudioRecordStreamBuilder.buildAsync, requestPrivilege, readAsync | expected audio or a clear "no input device"; actual buildAsync resolves and ALLOW, then initCheckAsync -3 and "error in audio record stream read" | High | chips as a full alternative; test on a device | report the missing input device in the API and the docs.
3. Play a local MP4 with react-native-w3cmedia on the VVD (#124) | VideoPlayer in URL mode with file:///pkg/assets/clip.mp4 | expected it plays; actual MediaError code 4 with no detail (https gives code 3) | High | the plain path /pkg/assets/clip.mp4 plays | accept file:// URLs or document the path format, and put the cause in MediaError.
4. Start the VVD on Ubuntu with an NVIDIA GPU (#83) | vega virtual-device start | expected a running device; actual "Deadline reached (60s)" and exit code 0; the emulator crashed loading Vulkan | High | ~/.android/advancedFeatures.ini with Vulkan = off and GLDirectMem = on | detect the crash, exit non-zero, document the workaround.
5. Call Claude Haiku 4.5 on Bedrock with ConverseStream (#77) | same model that worked with converse two days before | expected a stream; actual "Model use case details have not been submitted" with no notice | High | Nova 2 Lite through one config value until the form was done | ask for the form before the first call works and show it in the console.
6. Keep the VVD running from a script, Apple Silicon (#109) | start it from a shell, close the shell | expected it keeps running; actual it stops with no message | Medium | nohup vega virtual-device start & | a detached mode, or say it in the docs.
7. List devices and apps with the Vega CLI (#121) | vega device list / installed-apps / running-apps; run-app -d emulator-5554 | expected output; actual they hang, and "Couldn't find device" | Medium | -d VirtualDevice | make the device names consistent and add a timeout.
8. Take a screenshot of the VVD (#113) | vega device run-cmd 'screenshooter /tmp/x.png' | expected a PNG; actual "Permission denied", then every run-cmd fails until restart | Medium | emulator console "screenrecord screenshot <dir>" | add vega device screenshot.
9. Uninstall a native package (#116) | remove the package, react-native build-vega | expected the manifest updated; actual stale [[needs.module]] entries stay and the app will not install | Medium | delete the entries by hand | write generated entries to a build file, or clean them.
10. Check if a streaming app can open a URL (#117) | Linking.canOpenURL on the VVD | expected false; actual it throws "Can not open URL" | Medium | try/catch | follow the React Native contract.
11. Show service logos in a Modal (#120) | Image with an uncached URL inside an open Modal | expected it paints; actual the slot stays empty and onError never fires | Medium | Image.prefetch when the cover shows | fix the paint or fire onError.
12. Use AsyncStorage tagged for RN 0.83 (#82) | install the rn83-alpha tag, build-vega | expected a build; actual "not part of its kepler-compatibility.json" | Medium | use the latest tag | publish matching compatibility data.
13. Test an app with React Navigation in Jest | the Vega jest preset | expected tests run; actual the BackHandler and Dimensions mocks crash | Medium | our own mocks in app/jest.setup.js | fix the preset mocks.
14. Press keys from a script (#118, #119) | inputd-cli button_press dpad_right; KEY_ENTER | expected documented names and OK as "select"; actual names undocumented, OK arrives as "enter" | Low | KEY_RIGHT etc.; map select and enter to OK | document the key names and events.
15. Lint an app that records audio (#122) | import keplerscript-audio-lib | expected the microphone privilege; actual the rule asks for audio.privilege.settings.control | Low | rule off for that file | align the rule with the AudioRecordStreamBuilder docs.
16. Install the Vega SDK from the docs (#114) | open docs/vega/latest/install-vega-sdk.html | expected the guide; actual an empty redirect | Low | the versioned /0.24/ URL | fix the redirect.
17. Run boto3 with aws login credentials (#78) | aws login, then Python with boto3 | expected it works like the CLI; actual MissingDependencyException (needs botocore[crt]) | Low | export the credentials to env vars | say it in the aws login docs or install crt.
18. Price a Bedrock turn from the Price List API (#128) | get-products for AmazonBedrock | expected Claude Haiku 4.5 prices; actual no Anthropic model newer than Claude 3 Haiku | Low | prices from the web page | add all Bedrock models to the API.
```

### Project testing instructions (optional)

```text
Video: https://youtu.be/6VNLfnK9X84
Repository: https://github.com/juanlo7/FireDrift-AmazonDeveloper (README, "Try it on our live stack (judges)").

Fastest way: install the prebuilt package from the attached firedrift-vpkg.zip on the Vega Virtual Device (Vega SDK 0.24):
- Apple Silicon Mac: vega run-app app_aarch64.vpkg com.firedrift.app.main -d VirtualDevice
- Linux or Intel Mac: vega run-app app_x86_64.vpkg com.firedrift.app.main -d VirtualDevice
These builds talk to our live AWS stack, which stays up until Nov 20, 2026. No account or key is needed.

Keys on the VVD: arrows = D-pad, Enter = OK, Esc = Back.
0. First run: pick your services, or Skip (FireDrift then uses all of them).
1. Feed: Up/Down browse, Right = Like, Left = Skip, OK = Watch now (your services for the title). Back opens the menu (Butler, Settings, About).
2. Butler: open it from the menu. Press "Surprise me": he answers out loud and puts a TMDB card on screen. Then try the replies he offers; ask for more or less of something (a reply such as "Something lighter") and he changes your taste, with Undo and Reset.
3. Settings: services and country.

Notes: the VVD has no microphone, so use the chips (push to talk needs a Vega device). The VVD has no streaming apps, so Watch now shows the services but cannot open them. From source, the app starts in mock mode (fixtures, no backend); set apiMode and butlerMode to 'real' in app/src/config.ts to use the live stack.
```

### Product feedback (the five questions)

Each teammate checks the tools they used (P1: app, feed, voice, CI; P2: AWS,
agent; P3: character, clips, video).

**1. Which developer tools, APIs, and SDKs did you use and for what?**

```text
- Vega SDK 0.24, Vega CLI and the Vega Virtual Device (Ubuntu and Apple Silicon Mac): build, run and test the app.
- React Native for Vega (RN 0.83) and its libraries: @amazon-devices/react-navigation for screens, react-native-w3cmedia for the butler's clips, keplerscript-audio-lib and security-manager-lib for push to talk, Linking for Watch now, the Kepler ESLint plugin and Jest preset.
- Amazon Bedrock with Claude Haiku 4.5 and Amazon Nova 2 Lite: the butler's model.
- Amazon Bedrock AgentCore Runtime and Gateway, and Strands Agents: the butler agent, its WebSocket and its tools.
- Amazon Transcribe streaming and Amazon Polly: voice in and voice out with speech marks.
- AWS Lambda, Amazon API Gateway, Amazon DynamoDB, Amazon Cognito, Amazon S3, AWS Secrets Manager, AWS CDK: the serverless backend.
- TMDB API: catalog, posters and streaming availability (JustWatch data).
- Also: Blender (the butler character), GitHub Actions (CI), Claude Code (coding help), HyperFrames (the demo video).
```

**2. What worked well?**

```text
- React Native for Vega: our React and TypeScript skills carried over; the focus model and TV event hooks made D-pad navigation simple, and the Amazon sample apps gave us focus helpers to start from.
- Vega Virtual Device on Apple Silicon: the app and the butler's clips run there, so the whole demo was built without hardware.
- Bedrock Converse: one API for Claude Haiku 4.5 and Nova 2 Lite, so switching models is one config value.
- Strands Agents: little code for the agent loop and tools; the Model interface let us test the loop with a scripted model.
- AgentCore Runtime: a streaming WebSocket agent with no server to run. AgentCore Gateway: our Lambdas became tools with IAM auth.
- Polly: natural neural voice, and speech marks that make lip and gesture sync easy.
- Transcribe streaming: final text about 0.3 s after the key is released.
- Lambda, HTTP API, DynamoDB on demand and CDK: the whole stack cost under two dollars for the hackathon and deploys from one command.
```

**3. What needs work?**

```text
- Vega Virtual Device: no WebView, audio input or reliable video decoding on Linux and Intel Mac, and the docs do not say so; crashes silently with NVIDIA (Vulkan); stops when its shell exits; no screenshot command.
- Vega CLI: device commands hang; device names differ between commands; build-vega leaves stale manifest entries.
- React Native for Vega libraries: errors with no cause (MediaError 3 and 4, audio stream read errors); Linking.canOpenURL throws; Image in a Modal does not paint; Jest preset mocks crash React Navigation; the privilege lint rule asks for the wrong privilege; key names and events of inputd-cli are undocumented.
- Bedrock: the Anthropic use case form appeared with no notice after Haiku 4.5 already worked; the Price List API has no Claude prices.
- boto3 needs botocore[crt] for aws login credentials, unlike the AWS CLI.
Full details and suggestions: 18 friction-log issues in our repository.
```

**4. How was your onboarding experience (zero to hello world)?**

```text
- Vega: the SDK installs with one script and the template app ran on the VVD in the first days. On Ubuntu with NVIDIA it took half a day to find the Vulkan workaround, and the "latest" install guide was an empty page.
- React Native for Vega: fast for anyone who knows React Native; the hard part was learning what the VVD cannot do.
- AWS: fast. A 20-line Strands script answered on Bedrock on day 3, and the CDK stack was deployed the next day. AgentCore needed a careful read of the docs for the WebSocket and Gateway auth, then worked.
- Polly and Transcribe: Polly in minutes; Transcribe streaming from Python needed a SigV4-signed WebSocket because boto3 has no streaming client.
```

**5. Would you build with these devices and services again?**

```text
Yes. React Native for Vega let a three-person team build a real TV app with the remote, voice and an animated character in a few weeks, and the AWS agent stack (Bedrock, AgentCore, Strands, Transcribe, Polly) let one person build the whole butler backend, serverless and pay per call, within $150 of credits. We would ask for a Vega device or a fuller simulator on Linux first.
```

### AI tools used

```text
Claude Code (Claude models) to write and review code, tests and docs; everything was reviewed and tested by the team. Claude Haiku 4.5 and Amazon Nova 2 Lite on Amazon Bedrock at run time, only in the butler. HyperFrames with an AI agent to build the demo video. AI-assisted Blender bpy scripts for the butler's rig and render.
```

**Learning level and "AI value":** answered by the submitter on the form.

**Eligibility checkboxes:** ticked by the submitter.

## Pending before submitting

- [x] Feature freeze and features checked on the simulator (Oct 19).
- [x] Cost per butler turn (#51).
- [x] Total AWS spend (Cost Explorer): $1.87, Oct 1 to Oct 21.
- [x] Demo video on YouTube, link here and in the README.
- [x] Prebuilt `.vpkg` against the live stack.
- [ ] P1 and P3 check their product feedback.
- [x] Repository public, `LICENSE` in "About".
