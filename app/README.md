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

## Mock or real API

`src/config.ts`:

```ts
export const config: AppConfig = {
  apiMode: 'mock',   // 'real' calls apiBaseUrl
  apiBaseUrl: '',    // HTTP API URL from the CDK stack output
  apiTimeoutMs: 8000,
};
```

In `mock` mode every call returns the fixtures in `packages/domain/fixtures/rest/`.
Import the client with `import { api } from '../api'`; screens never call
`fetch` directly.

## Focus and the remote

- Every screen needs one element with `hasTVPreferredFocus`.
- Group rows of focusable items in a `FocusGuideView` (`autoFocus` remembers
  the last focused child).
- Back is handled by the navigator: it pops the stack, and on Feed it leaves
  the app.

## Tests

`jest.setup.js` replaces two broken mocks of the Vega jest preset
(`BackHandler` and `Dimensions`); without it React Navigation crashes in tests.
