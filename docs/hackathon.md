# Amazon Developer Hackathon 2026 — Key Rules

Source: "Build, Ship, Shape: Amazon Developer Hackathon" Official Rules
(amazonappdev2026.devpost.com). This file keeps only the rules that affect
FireDrift. When in doubt, the official rules win.

## Our entry

| Item | Value |
|---|---|
| Primary track | **Fire TV** |
| Platform | **Vega OS** (see `docs/requirements.md`, D1) |
| Mini challenges (targets) | AWS Builder, Open Source |
| Repository | `juanlo7/FireDrift-AmazonDeveloper` (public at submission, MIT) |

A project can win **one** track prize and **one** mini challenge prize.

## Dates (Pacific Time)

| Milestone | Date |
|---|---|
| Submission period opens | Mon, Aug 31, 2026, 10:15 am |
| AWS credits form deadline ($150) | Wed, Oct 21, 2026, 12:00 pm |
| **Submission deadline** | **Fri, Oct 23, 2026, 12:00 pm** |
| Judging period | Nov 9 – Nov 20, 2026 |
| Winners announced | about Thu, Dec 3, 2026 |

After the deadline, the submission cannot change.

## Fire TV track requirements

- Launch a **demo-ready app** that runs on **Fire OS or Vega OS**.
- Any framework is allowed: React Native, web technologies, Android (Kotlin/Java).
- Priority categories: AI-enhanced viewing, sports, fitness, family
  entertainment, multi-modal UX, computer vision.
- The demo video must show the app on a **real Fire TV device** or the
  **Fire TV / Vega simulator**.
- The project must be new, or significantly updated after Aug 31, 2026.

## Submission checklist

- [ ] Working app that fits the Fire TV track.
- [ ] Text description of features and functions (English).
- [ ] GitHub repository URL with all source code, assets, and clear
      **setup and run instructions** in the README.
- [ ] Repository access. Pick one:
  - Public with an open-source `LICENSE` file that shows in the "About" section, **or**
  - Private and shared with `testing@devpost.com` and these GitHub users:
    `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`.
- [ ] Demo video:
  - Less than **3 minutes**.
  - Shows the app working on the device or simulator.
  - Public on **YouTube or Vimeo**.
  - No third-party trademarks or copyrighted music without permission.
- [ ] Product feedback for each tool, API, or SDK used:
  1. Which tools, APIs, and SDKs did you use, and for what?
  2. What worked well?
  3. What needs work?
  4. How was onboarding (zero to hello world)?
  5. Would you build with them again? Yes/No and why.
- [ ] Primary track and mini challenges named on the form.
- [ ] AWS Builder: describe each AWS service and how we use it (in the product feedback).
- [ ] Open Source: contribution URL, project repository URL, GitHub username,
      and a description (what, how it works, why it matters).
- [ ] Optional: feature requests (description, why it matters, priority:
      Critical / Important / Nice-to-have).
- [ ] Optional but **recommended**: friction log entries. They give up to a
      **10% score bonus**. Use the "Friction log" issue template to collect them.

## Judging

**Stage 1 — pass/fail:** the project fits the theme and uses the required
APIs and SDKs.

**Stage 2 — four criteria, equal weight:**

| Criterion | What judges check |
|---|---|
| Tech implementation | Build quality. Good use of Fire TV APIs, SDKs, and device capabilities. |
| Design | Complete, coherent product. Interaction model fits the TV (D-pad, voice, 10-foot UI). |
| Potential impact | A specific case for a customer need. Could ship to the Fire TV Appstore. |
| Quality of the idea | Creative use of the tools, not an obvious one. |

Tie-break order: the criteria in the order of the table above.

### Obvious vs. creative (Fire TV)

- **Obvious:** basic streaming UI, simple video player, remote-controlled game.
- **Creative:** AI-enhanced viewing that adapts to household patterns, computer
  vision fitness with the TV camera, multi-modal UX that combines voice, D-pad,
  and visuals in one flow.

### Mini challenges

- **AWS Builder:** uses AWS services with documented integrations. Obvious: one
  Bedrock call or S3 storage. Creative: a multi-service pipeline (Bedrock +
  AgentCore + Strands) or agent orchestration. Kiro Crew alone qualifies.
- **Open Source:** a new open-source repo, or a branch, fork, or PR to a public
  repo during the hackathon. Obvious: README or typo fixes. Creative: a feature
  with tests, a bug fix that unblocks others, a new integration pattern (for
  example, Vega support in a popular React Native library).

## Other rules to remember

- All material must be in English, or come with an English translation.
- We must have the right to use every third-party SDK, API, data set, and asset.
- Open-source dependencies are allowed. Obey their licenses.
- Judges can test the app free of charge until Nov 20, 2026.
- Sponsor can ask for physical access to non-public hardware.
- AWS usage above the $150 credits is our cost. Monitor it.
