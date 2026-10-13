# FireDrift app

The Vega app (React Native for Vega 0.83, SDK 0.24, TypeScript strict). Setup
and the simulator steps are in the root `README.md`.

## Scripts

Run them from `app/`.

| Script | Does |
|---|---|
| `yarn build:debug` | Builds `build/<arch>-debug/app_<arch>.vpkg` |
| `yarn vvd` | Installs and launches the x86_64 debug build on the Vega Virtual Device |
| `yarn typecheck` | `tsc --noEmit` |
| `yarn lint` | ESLint with the Vega plugin |
| `yarn test` | Jest |

## Layout

| Folder | Contents |
|---|---|
| `src/config.ts` | The one place to switch mock and real API |
| `src/api/` | `ApiClient` for every REST route in `docs/contracts.md`, with a mock and an HTTP implementation |
| `src/navigation/` | Native stack: Feed (home), Butler, Settings, About. Add a screen to `RootStackParamList` first |
| `src/screens/` | One file per screen. Placeholders use `PlaceholderScreen` until their block is built |
| `src/focus/` | `TVFocusProvider` / `useTVFocus`, `FocusGuideView`, `useFocusState`, `useRemoteKeys` (adapted from `vega-tv-interfaces-sample`) |
| `src/components/` | `FocusableButton` (focus ring and scale) and `Screen` (TV safe area) |
| `src/theme/` | Colors, spacing, safe area, type scale and focus tokens |
| `src/feed/` | Cover feed (FR-1, plan B): pool and refill model, remote key map, image prefetch, `useFeed`, `CoverView`, Back menu |
| `src/settings/` | Country, services and "show everything" (FR-4): device store, `PUT /profiles`, logo grid, country picker |
| `src/about/` | Attributions and credits shown on About (TMDB, JustWatch, butler AI and assets, licenses) |
| `assets/images/` | Bundled images (TMDB logo from themoviedb.org/about/logos-attribution) |
| `src/signals/` | Batched signal queue (FR-2) and the cover dwell tracker |
| `src/profile/` | Anonymous device profile ID |
| `src/storage.ts` | AsyncStorage wrapper (`KeyValueStore`) |

## Mock or real API

`src/config.ts`:

```ts
export const config: AppConfig = {
  apiMode: 'mock',   // 'real' calls apiBaseUrl
  apiBaseUrl: '',    // HTTP API URL from the CDK stack output
  apiTimeoutMs: 8000,
  butlerMode: 'fake', // 'real' connects to butlerSocketUrl
  butlerSocketUrl: '', // ButlerWebSocketUrl from the CDK stack output
  cognitoClientId: '', // UserPoolClientId from the CDK stack output
  awsRegion: 'us-east-1',
};
```

In `mock` mode every call returns the fixtures in `packages/domain/fixtures/rest/`.
Import the client with `import { api } from '../api'`; screens never call
`fetch` directly.

## Butler socket

`src/butler/` is the app end of the butler socket (`docs/contracts.md`,
section 3). The butler screen opens one session per visit:

```ts
import { openButlerSession } from '../butler';

const session = openButlerSession(
  { profileId, country, services, hasMic },
  { onEvent: event => { /* every agent → app event */ }, onAudio: chunk => { /* binary speech audio */ } },
);
session.send({ t: 'chip.select', chipId: 'surprise_me' });
session.sendAudio(pcm); // between audio.start and audio.end, split into 32 KB frames
session.end();          // on leaving the screen
```

- `butlerMode: 'fake'` replays the agent → app fixtures in
  `packages/domain/fixtures/socket/`, so the screen works without the agent.
  Each `chip.select` or `audio.end` plays one turn.
- `butlerMode: 'real'` connects to `butlerSocketUrl` (`ButlerWebSocketUrl`
  output). The device signs up in Cognito with its profile ID and a random
  password on first use (`cognitoClientId` is the `UserPoolClientId` output),
  then sends the access token as WebSocket subprotocols.
- If sign-in fails, the socket errors or it closes before `end()`, the screen
  gets one `fallback` event with the fallback chips, served by the taste
  algorithm.

## Signals and device profile

- **Device profile** (`src/profile/`): `deviceProfile.getProfileId()` makes a
  UUID on first run and keeps it on the device (AsyncStorage). It is the
  `profileId` of every API call and, for the butler, the Cognito username (#61).
  `deviceProfile.ensureProfile(api, { country, services, showEverything })`
  saves the settings (#37); it never throws, and the backend uses defaults
  (ES, all services) until it succeeds.
- **Signal queue** (`src/signals/`): screens call `signalQueue.enqueue({ tmdbId,
  type, kind, source, ... })`. Signals are kept on the device and sent in
  batches (FR-2): when 5 are waiting, 30 s after the last send, or when the app
  goes to the background; up to 50 per request. If the backend is down they
  stay and are retried with backoff (up to 5 min), also after a restart. A batch
  the backend rejects (4xx) is dropped. At most 500 are kept.
- **Cover dwell** (`trackCoverDwell`): the feed calls `enter(title)` when a cover
  shows and `leave()` when it goes; the tracker queues a `dwell` signal with
  `surface: "cover"` and `ratio = min(1, ms / 15000)`. Stays under 300 ms (the
  D-pad passing by) are ignored.

  ```ts
  const dwell = trackCoverDwell(signalQueue);
  useEffect(() => {
    if (title) dwell.enter(title);
    return () => dwell.leave();
  }, [title]);
  ```

## Feed

One full-screen cover at a time (D8 plan B: backdrop with a slow drift, title,
meta, genres, synopsis). No list, no carousel: only the cover on screen holds
images.

| Key | Action |
|---|---|
| Down / Up | Next / previous title (the last 20 stay for Up) |
| Right | Like (once per title): a heart pops over the poster, the case light flashes, and a heart mark stays on the case |
| Left | Skip and go to the next title |
| OK | Watch now sheet |
| Back | Menu: Butler, Settings, About, Exit. Back again closes it |

- The next 3 covers' images are prefetched (`Image.prefetch`), never video.
- A new pool is asked for when 5 titles or fewer are left. If it fails or
  brings nothing new, the feed waits 60 s before asking again and keeps the
  titles it has.
- Cover dwell is measured only while the feed is on screen with no menu or
  sheet open.

## Services and country

- **First run** opens on Setup: a logo grid of the country's top 12 services
  (OK toggles), the country (from the device locale, `US` if unknown) and "show
  everything". **Skip for now** keeps the device country and all services. The
  feed opens either way.
- **Settings** (Back → Settings on the feed) edits the same values. Save goes
  back; Back leaves without saving.
- Saved on the device (`firedrift.settings`) and sent with `PUT /profiles/{id}`
  before the feed asks for a pool. When they change, the feed starts again with
  a new pool. At start the app sends the profile again in case it never
  reached the backend.

## Focus and the remote

- Every screen needs one element with `hasTVPreferredFocus`.
- Group rows of focusable items in a `FocusGuideView` (`autoFocus` remembers
  the last focused child).
- Back is handled by the navigator: it pops the stack. On Feed it opens the
  menu instead; Exit in the menu (or Home) leaves the app.

## Tests

`jest.setup.js` replaces two broken mocks of the Vega jest preset
(`BackHandler` and `Dimensions`); without it React Navigation crashes in tests.
The `BackHandler` mock keeps its listeners: `BackHandler.__pressBack()` presses
the remote's Back key in a test.
