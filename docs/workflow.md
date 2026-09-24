# Development Workflow

## Environments and branches

| Branch | Environment | Contents | Who writes to it |
|---|---|---|---|
| `main` | Production | Stable, demo-ready build. The submission points here. | Merge from `development` only. |
| `development` | Development | Integrated new features. Can be unstable. | Merge from work branches only. |
| `feat/*`, `fix/*`, … | Local | One issue per branch. | You. |

```
main ◄──── release PR ──── development ◄──── PR ──── feat/12-voice-search
                                         ◄──── PR ──── fix/15-focus-lost
```

Rules:

1. Do not commit directly to `main` or `development`.
2. Start every work branch from the latest `development`.
3. Merge a work branch into `development` with a pull request (PR).
4. Merge `development` into `main` with a release PR when the build is demo-ready.
5. A hotfix for `main` starts from `main` as `hotfix/*`. Merge it into `main`,
   then merge `main` back into `development`.

## Branch names

Format: `<type>/<issue-number>-<short-slug>`

| Type | Use |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `refactor/` | Restructure without behavior change |
| `chore/` | Build, tooling, dependencies |
| `hotfix/` | Urgent fix to `main` |

Example: `feat/12-voice-search`

## Day-to-day procedure

1. Pick an issue from the **Ready** column. Assign it to yourself.
2. Update `development`:
   ```sh
   git switch development
   git pull
   ```
3. Create the work branch:
   ```sh
   git switch -c feat/12-voice-search
   ```
4. Commit with Conventional Commits (`feat(scope): description`).
5. Push and open a PR to `development`:
   ```sh
   git push -u origin feat/12-voice-search
   gh pr create --base development --fill
   ```
6. Write `Closes #12` in the PR body. GitHub then closes the issue on merge.
7. Get one review. Squash-merge. Delete the branch.

## Release to production

1. Make sure `development` builds and runs on the Fire TV device or simulator.
2. Open a release PR:
   ```sh
   gh pr create --base main --head development --title "release: vX.Y.Z"
   ```
3. Use a merge commit (not squash). This keeps `main` and `development` in line.
4. Tag the release on `main`: `git tag vX.Y.Z && git push --tags`.

## Kanban board (GitHub Projects)

Board columns (the `Status` field):

| Column | Meaning | Exit condition |
|---|---|---|
| Backlog | Idea or request. Not refined. | Has acceptance criteria and an estimate. |
| Ready | Refined. Anyone can start it. | Somebody is assigned and a branch exists. |
| In Progress | Active work on a branch. | PR to `development` is open. |
| In Review | PR waits for review or checks. | PR is merged. |
| Done | Merged into `development`. | — |

Board setup (one time, about 10 minutes):

1. Create a project: GitHub → **Projects** → **New project** → **Board**.
2. Rename the `Status` options to the five columns above.
3. Link the repository to the project.
4. Turn on the built-in workflows: **Item added → Backlog**,
   **Pull request merged → Done**, **Item closed → Done**.
5. Optional: put the project path (for example `juanlo7/1`) in the `projects:`
   line of each issue template. New issues then go on the board automatically.

## Issue templates

| Template | Label | Use |
|---|---|---|
| Feature | `type: feature` | New user-visible behavior |
| Bug | `type: bug` | Something does not work as expected |
| Task | `type: task` | Tech work, setup, docs, research |
| Friction log | `friction-log` | Problems with Amazon or AWS tools. Feeds the submission bonus. |

Create the labels one time:

```sh
gh label create "type: feature" --color 1D76DB
gh label create "type: bug"     --color D73A4A
gh label create "type: task"    --color C5DEF5
gh label create "friction-log"  --color FBCA04
gh label create "priority: high"   --color B60205
gh label create "priority: medium" --color FBCA04
gh label create "priority: low"    --color 0E8A16
```

## Branch protection (recommended)

Settings → Branches → add a rule for `main` and for `development`:

- Require a pull request before merge.
- Block force pushes and deletion.
