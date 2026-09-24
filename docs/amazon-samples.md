# Amazon Sample Repositories — Review

Review of the official [AmazonAppDev](https://github.com/AmazonAppDev) samples and
tools, done for issue #1. Use it to choose the platform, the framework, and the
code we start from.

| Item | Value |
|---|---|
| Review date | 2026-09-24 |
| Local clones | `repos/<group>/<repo>/` (git-ignored, not part of this repository) |
| Method | Source and README review. **Setup steps come from the READMEs and are not verified** on our machines. |

## Comparison

"VVD" = Vega Virtual Device (the Vega simulator). Reuse value is for FireDrift.

| Repository | Platform | Framework | Last commit | Demonstrates | Simulator | License | Reuse |
|---|---|---|---|---|---|---|---|
| [vega-video-sample](https://github.com/AmazonAppDev/vega-video-sample) | Vega OS | RN for Vega, RN 0.83 | 2026-08 | Video player, DRM, IAP, Content Launcher, personalization | VVD (IAP needs device) | MIT-0 | **High** |
| [vega-sports-app](https://github.com/AmazonAppDev/vega-sports-app) | Vega OS | RN for Vega, RN 0.83 | 2026-08 | Full app architecture, theme, headless player, EPG sync | VVD | MIT-0 | High |
| [vega-tv-interfaces-sample](https://github.com/AmazonAppDev/vega-tv-interfaces-sample) | Vega OS | RN for Vega, RN 0.83 | 2026-08 | TV layout patterns, focus hooks, grids, modals | VVD | MIT-0 | **High** |
| [vega-epg-sample](https://github.com/AmazonAppDev/vega-epg-sample) | Vega OS | RN for Vega, RN 0.72 | 2026-08 | TV guide (`EPG`) component | VVD | MIT-0 | Low |
| [vega-audio-sample](https://github.com/AmazonAppDev/vega-audio-sample) | Vega OS | RN for Vega, RN 0.83 | 2026-08 | Audio player, media controls, background audio | VVD | MIT-0 | Medium |
| [vega-scrolling-sample](https://github.com/AmazonAppDev/vega-scrolling-sample) | Vega OS | RN for Vega, RN 0.83 | 2026-07 | High-performance grid, FlashList vs Carousel | VVD | MIT-0 | High |
| [vega-seekbar-sample](https://github.com/AmazonAppDev/vega-seekbar-sample) | Vega OS | RN for Vega, RN 0.72 | 2026-07 | `SeekBar` patterns (markers, thumbnails, live) | VVD | MIT-0 | Medium |
| [react-native-multi-tv-app-sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample) | Both (+ Android TV, tvOS, web) | Expo 54 + RN for Vega 0.72, Yarn monorepo | 2026-09 | Shared UI: drawer, grid, player, remote control | VVD, Android TV emulator | MIT-0 | High |
| [react-native-multi-tv-helloworld](https://github.com/AmazonAppDev/react-native-multi-tv-helloworld) | Both (+ Android TV, tvOS, web) | Expo 55 + RN for Vega 0.83, Yarn monorepo | 2026-09 | Shared-codebase starter | VVD, Android TV emulator | MIT-0 | **High** |
| [hello-world-fire-tv](https://github.com/AmazonAppDev/hello-world-fire-tv) | Fire OS | Kotlin, Compose for TV | 2024-10 | Drawer, card grid | Android TV emulator | MIT-0 | Low |
| [hello-world-fire-tv-react-native](https://github.com/AmazonAppDev/hello-world-fire-tv-react-native) | Fire OS | Expo 51, react-native-tvos 0.74 | 2025-01 | Drawer navigation | Android TV emulator | MIT-0 | Low |
| [login-with-amazon-sample](https://github.com/AmazonAppDev/login-with-amazon-sample) | Fire OS | Kotlin, Android Views | 2024-06 | Login with Amazon (OAuth2) | Emulator (needs API key) | MIT-0 | Low |
| [splash-screen-fire-tv-demo](https://github.com/AmazonAppDev/splash-screen-fire-tv-demo) | Fire OS | Kotlin, Leanback | 2024-03 | Splash screen for Fire OS | Android TV emulator | MIT-0 | Low |
| [devices-agent-skills](https://github.com/AmazonAppDev/devices-agent-skills) | Both (RN only) | Agent Skills | 2026-09 | TV UI best practices, multi-TV migration | — | MIT | Medium |
| [amazon-devices-buildertools](https://github.com/AmazonAppDev/amazon-devices-buildertools) | Vega OS first | Kiro Power + MCP server | 2026-09 | Docs search, Perfetto and crash analysis | — | Apache-2.0 (MCP package: Amazon PML) | Medium |

## Recommendation for FireDrift

FireDrift: an endless vertical feed of movie trailers with a recommendation
algorithm, natural-language AI search, and favorites. It runs on the TV and on
the web, with a mobile PWA. The team knows React and TypeScript. We have no
Fire TV hardware.

**Platform: Vega OS first, in a React Native monorepo that also builds for the
web (PWA). Fire OS (Expo TV / Android) is an optional extra target.**

Why:

1. **Team skills.** React Native for Vega and Expo are React and TypeScript.
   Fire OS native samples are Kotlin.
2. **No hardware.** The rules accept a demo on the "Fire TV / Vega simulator".
   The VVD runs on Ubuntu 20.04/22.04/24.04 x86_64 with KVM (our machine:
   Ubuntu 24.04, KVM on). For Fire OS, Amazon says "you use an actual Fire TV
   device … instead of a virtual emulator" and "emulators don't work reliably";
   an Android TV emulator is a weak fit for the demo rule.
3. **Web and PWA reuse.** A Yarn monorepo with a shared package serves Vega and
   Expo (web, Android TV, Fire OS) from one codebase.
4. **Freshest samples.** The Vega samples are on RN 0.83 and updated Jul–Sep 2026.
   The Fire OS samples are from 2024 to early 2025 and have old dependencies.
5. **Judging fit.** Vega APIs such as Content Launcher and Content Personalization
   fit a discovery app and count for "use of Fire TV APIs". The Builder Tools MCP
   focuses on Vega. The Open Source rules name "Vega support in a popular React
   Native library" as a creative contribution.

Start from:

| Sample | Take |
|---|---|
| `react-native-multi-tv-helloworld` | Monorepo scaffold: root `package.json`, `.yarnrc.yml`, `packages/shared`, `packages/vega/metro.config.js`, root `index.js`, platform file extensions. Vega and Expo are both on RN 0.83. |
| `vega-tv-interfaces-sample` | Focus hooks, theme, navigators, Grid, Modal, carousels. |
| `vega-video-sample` | Player (W3C Media + Shaka), Content Launcher, Content Personalization. |

Extra reference: `vega-scrolling-sample` for FlashList tuning and a focus ring
without re-renders. This is the pattern for the vertical feed.

Alternatives we did not pick:

- **Fire OS native (Kotlin/Compose):** does not fit team skills; stale samples; needs a device for a reliable demo.
- **Vega only (no monorepo):** no code reuse for the web and PWA.

Open questions that can change this recommendation:

- **Trailer source.** YouTube (for example through TMDB) needs a WebView player and
  brings terms-of-service and copyright risk for the demo video. Self-hosted clips
  with a clear license play with W3C Media.
- **VVD on our machines.** Supported on Ubuntu, but not tested yet (see Next steps).
- **MVP scope.** Not defined yet.

## Vega OS samples

### vega-video-sample

- **Platform / framework:** Vega OS only. React Native for Vega, RN 0.83.0, React
  19.2, `@amazon-devices/react-native-kepler ~4.0.0`. Key packages:
  `react-native-w3cmedia`, `kepler-media-content-launcher`, `kepler-media-account-login`,
  `kepler-content-personalization`, `kepler-epg-provider`,
  `keplerscript-appstore-iap-lib`, `kepler-ui-components ~3.2`, `vega-carousel`,
  react-navigation forks ~8.0. Redux Toolkit, FlashList 2.1.
- **Demonstrates:** HLS/DASH/MP4 playback with DRM and pre-buffering, a custom
  player UI, In-App Purchasing, Content Launcher and Account Login, Live TV /
  EPG sync, Content Personalization, headless tasks, i18n (en/es/fr), search,
  settings.
- **Setup and run:** Vega Developer Tools, Git, Python 3, JRE 21+, Node 22.
  `npm install` (builds Shaka Player 4.8.5), `npm run build:app`,
  `vega virtual-device start`,
  `vega run-app build/x86_64-release/keplervideoapp_x86_64.vpkg`. Runs on the
  VVD, but IAP and Content Personalization need a real device.
- **Reuse for FireDrift:** `src/w3cmedia/shakaplayer/ShakaPlayer.ts`,
  `src/w3cmedia/mediacontrols/`, `src/utils/VideoHandler.ts`,
  `src/components/FocusableElement.tsx`, `src/components/Seekbar.tsx`,
  `src/components/MovieCarousel.tsx`, `src/components/MovieGrid.tsx`,
  `src/personalization/`, `src/styles/`, `manifest.toml` (well commented).
- **License:** MIT-0. `LICENSE-THIRD-PARTY` covers Shaka Player (Apache-2.0).
  Images are from Pexels. Videos are on an Amazon CloudFront host with no stated
  license; do not reuse them.
- **Problems:** README asks for Node 18–20, but `package.json` needs Node ≥ 22.
  `postinstall` clones Shaka from GitHub (needs network, Java, Python). README
  lists old library versions. Known issues in the README: Feature Rotator ignores
  the D-pad, player controls behave inconsistently, black screen with audio after
  navigating back, unstable IAP APIs.

### vega-sports-app

- **Platform / framework:** Vega OS only. RN 0.83.0, React 19.2. Key packages:
  `react-native-w3cmedia`, `kepler-player-client` / `kepler-player-server`
  (headless player), `kepler-epg-provider`, `kepler-media-controls`,
  `keplerscript-kepleri18n-lib`, `kepler-performance-api`, `vega-carousel`,
  `kepler-ui-components ~3.2`. zustand, React Query, React Compiler.
- **Demonstrates:** a sports streaming app with hero and card carousels, details,
  login and user profiles, drawer navigation, video resume, Linear TV EPG sync,
  a headless video player on a separate JS thread, accessibility, i18n.
- **Setup and run:** same prerequisites as the video sample. `.nvmrc` pins Node
  22.22.2 and `.npmrc` sets `engine-strict`. `cp .env.example .env`,
  `npm install`, `npm run build:app`, `vega virtual-device start`,
  `vega run-app build/x86_64-release/keplersportapp_x86_64.vpkg`. Runs on the VVD.
- **Reuse for FireDrift:** the clearest app architecture. `src/theme/`,
  `src/services/focusGuide/`, `src/components/carousels/`,
  `src/components/containers/`, `src/components/core/`, `src/navigators/`,
  `src/services/videoPlayer/`, `src/services/videoResume/`,
  `src/hooks/useFullyDrawnReportingOnAppStateChange.ts`,
  `kpi-test-scenarios/`.
- **License:** MIT-0. No third-party notice file, although Shaka (Apache-2.0) is
  bundled at build time.
- **Problems:** README says Node 18–20 (Node 22 required). README says
  `postinstall` runs `patch-package`; it does not. Known issue: headless player
  crashes in debug builds, "resolved in the upcoming SDK 0.22" (current SDK is
  0.24). The README warns that the VVD crashes after long use.

### vega-tv-interfaces-sample

- **Platform / framework:** Vega OS only. RN 0.83.0, React 19.2.
  `kepler-ui-components`, `vega-carousel`, reanimated ~4.0, react-navigation
  forks ~8.0, FlashList 2.1, zustand, React Query. No media player.
- **Demonstrates:** recommended TV layouts: home page with hero and horizontal
  carousels, drawer, vertical stacks, browse, grid, flexible cards, modal and
  bottom modal, filters, focus management in complex layouts. Docs in
  `docs/components.md` and `docs/hooks.md`.
- **Setup and run:** Vega Developer Tools, Python 3, JRE 21+, Node 22
  (`engine-strict`). `npm install`, `npm run build:app`, run on the VVD. No
  network step at install.
- **Reuse for FireDrift:** the best UI kit. `src/hooks/useFocusManager.ts`,
  `src/hooks/useItemFocusManager.tsx`, `src/hooks/useTvFocus.tsx`,
  `src/hooks/useImagePrefetchQueue.ts`, `src/services/focusGuide/`,
  `src/components/Grid/`, `src/components/FlexibleCard/`,
  `src/components/Modal/`, `src/components/BottomModal/`,
  `src/components/navigation/CustomDrawer.tsx`, `src/theme/`, `src/navigators/`.
- **License:** MIT-0. Sample images are CloudFront URLs with no stated license.
- **Problems:** README says Node 18–20 (Node 22 required). Scripts use the old
  `kepler` CLI name. `get-current-commit.sh` runs before builds, so the folder
  must be a git repository.

### vega-epg-sample

- **Platform / framework:** Vega OS only. Older stack: RN 0.72.0, React 18.2,
  `react-native-kepler ^2.0.0`, `kepler-ui-components ^2.0.0`, TypeScript 4.8.
- **Demonstrates:** the `EPG` (TV guide) component: props, imperative methods
  (`updateData`, `resetData`, `updateFavorite`, `updateGridStartTime`), events,
  channel and program data model. The README documents all of it.
- **Setup and run:** `npm install`, `npm run build:app`,
  `kepler virtual-device start`,
  `kepler run-kepler build/x86_64-release/epgsampleapp_x86_64.vpkg`. Runs on the VVD.
- **Reuse for FireDrift:** low. `src/App.tsx` and `src/EPG/timelineStyles.ts` only
  as a pattern if we add a schedule view. Port to KUIC 3.x.
- **License:** MIT-0, `THIRD-PARTY-NOTICES`, `SECURITY.md`.
- **Problems:** old RN/KUIC versions that do not match the other samples.
  README uses the old `kepler` CLI and links to 0.21 docs. The `test` script
  only runs `echo jest`. Empty "Release notes" section.

### vega-audio-sample

- **Platform / framework:** Vega OS only. RN 0.83.0, React 19.2.
  `react-native-w3cmedia`, `kepler-media-controls`, `kepler-ui-components ~3.2`,
  react-navigation forks, reanimated 4. Shaka 4.8.5 from `shaka-setup/`.
- **Demonstrates:** audio with the W3C Media API (AudioPlayer for MP3/MP4, Shaka
  for DASH/HLS), remote control through Vega Media Controls, background audio,
  album carousel and grid, previews on focus.
- **Setup and run:** Vega Developer Tools, Git, Python 3, Java 21+, Node 22.
  `npm install`, `npm run build:app`, `vega virtual-device start`,
  `vega run-app build/x86_64-release/kepleraudioreferenceapp_x86_64.vpkg`. Runs on the VVD.
- **Reuse for FireDrift:** `src/utils/AudioHandler.ts`,
  `src/utils/AppOverrideMediaControlHandler.ts`, `src/utils/Scaling.ts`,
  `src/components/PlaybackControls.tsx`. The "preview on focus" idea fits a
  trailer feed.
- **License:** MIT-0. `LICENSE-THIRD-PARTY` lists Shaka Player and the RN template.
- **Problems:** README says Node 18–20 (Node 22 required). `postinstall` needs
  network, Git, Java and Python. Scripts use the old `kepler` CLI. No lockfile.

### vega-scrolling-sample

- **Platform / framework:** Vega OS only. RN 0.83.0, React 19.2. FlashList 2
  (`@amazon-devices/shopify__flash-list`), `vega-carousel`, `kepler-ui-components
  ~3.1`, Redux Toolkit, React Compiler (beta).
- **Demonstrates:** a fast home grid of nested lists with three card types.
  Switch between FlashList and the native Carousel. FlashList tuning
  (`overrideItemLayout`, `getItemType`, `drawDistance`). Focus ring on an
  animated layer with no state updates. Initial focus with `FocusManager.focus()`.
  Pagination with a mock API. Performance test script.
- **Setup and run:** `npm install`, `npm run build:app`, then README uses
  `kepler virtual-device start` and `kepler run-kepler …vpkg`. Node ≥ 22. Runs on the VVD.
- **Reuse for FireDrift:** the pattern for a smooth vertical feed.
  `src/components/Card.tsx`, `src/components/Flashlist/`,
  `src/config/layout/`, `src/thunks/paginationThunks.ts`,
  `src/services/dataService.ts`, `test/performance/generalTest.py`.
  `Carousel` is Vega only; FlashList also works on Expo.
- **License:** MIT-0, `THIRD-PARTY-NOTICES`.
- **Problems:** README uses the old `kepler` CLI and links to 0.21 docs. README
  says Carousel TypeScript errors "can be ignored". Empty "Release notes" section.

### vega-seekbar-sample

- **Platform / framework:** Vega OS only. Older stack: RN 0.72.0, React 18.2,
  `kepler-ui-components ^2.0.0` (source of `SeekBar`).
- **Demonstrates:** ten `SeekBar` examples: basic, markers, ad breaks, limits,
  long press, fast forward and rewind, thumbnails, custom disabling, live TV,
  complex usage.
- **Setup and run:** Vega Developer Tools, Node 18–20 per README. `npm install`,
  `npm run build:app`, `vega virtual-device start`,
  `vega run-app build/x86_64-release/vegaseekbarapp_x86_64.vpkg`.
- **Reuse for FireDrift:** `src/screens/Thumbnail.tsx` and
  `src/screens/ComplexUsage.tsx` if trailers get a seek bar. Vega only; web and
  Fire OS need their own seek bar.
- **License:** MIT-0 (`LICENSE.txt`). Images made by Amazon.
- **Problems:** old RN/KUIC versions. Loose ranges (`^2.0.0`, `kepler-cli-platform`
  `^0`). No lockfile.

## Cross-platform samples

### react-native-multi-tv-app-sample

- **Platform / framework:** Android TV, Apple TV, Fire OS, web, and Vega OS.
  Yarn 4 workspaces. `apps/expo-multi-tv`: Expo ~54, `react-native-tvos ~0.81`,
  React Navigation 7, `react-tv-space-navigation` (beta), `react-native-video`.
  `apps/vega`: RN 0.72 with `@amazon-devices/*` packages.
- **Demonstrates:** drawer menu, grid with a hero banner that follows focus,
  details and player screens, player overlay with auto-hide and ±10 s seek,
  remote-control abstraction. Catalog from a public JSON feed.
- **How one codebase targets both:** `packages/shared-ui` holds screens,
  components, navigation, theme and remote control. Fire OS builds from
  `apps/expo-multi-tv` as an Android APK (`yarn dev:android`, EAS profiles with
  `EXPO_TV=1`). Vega builds from `apps/vega` into a `.vpkg` (`yarn build:vega`).
  `apps/vega/metro.config.js` adds `vega.*` extensions and swaps
  `@react-navigation/*`, reanimated, screens and safe-area for their
  `@amazon-devices/*` ports. Platform files: `RemoteControlManager.android.ts`,
  `RemoteControlManager.kepler.ts`, `VideoHandler.kepler.ts`, `*.vega.tsx`.
- **Setup and run:** Node 18+, Yarn 4.5, `yarn install`. Android Studio for
  Android TV, Xcode for tvOS, Vega SDK for Vega. No VVD run command in the README.
- **Reuse for FireDrift:**
  `packages/shared-ui/src/components/FocusablePressable.tsx`,
  `packages/shared-ui/src/components/player/`,
  `packages/shared-ui/src/app/remote-control/`,
  `packages/shared-ui/src/utils/VideoHandler.kepler.ts`,
  `packages/shared-ui/src/theme/safeZones.ts`, `apps/vega/metro.config.js`
  (aliasing template), `apps/vega/manifest.toml`.
- **License:** MIT-0. No third-party notice file.
- **Problems:** the Vega app is on RN 0.72 with `*` version ranges, so installs
  are not reproducible. Expo 54 is paired with SDK 52-era packages. `mitt` is used
  but not declared in `shared-ui`. Both `.yarnrc` and `.yarnrc.yml` exist.

### react-native-multi-tv-helloworld

- **Platform / framework:** Vega OS, Android TV and Fire OS, Apple TV, web.
  Yarn 4 workspaces. `packages/vega`: RN 0.83, `react-native-kepler ~4.0.0`,
  `kepler-cli-platform 0.22.13-rn-83`. `packages/expotv`: Expo 55 with
  expo-router, `react-native-tvos 0.83.6-0`. `vega-sdk-requirements.json` asks
  for Vega SDK 0.24.9914.
- **Demonstrates:** a minimal shared home screen with tiles, a panel that changes
  on focus, a fetch demo, a Lottie animation.
- **How one codebase targets both:** `packages/shared` is used by both apps.
  `packages/vega/metro.config.js` uses `react-native-monorepo-tools` and aliases
  `lottie-react-native` to the Vega port. A root `index.js` points Metro to
  `packages/vega`. Platform files: `HeaderLogo.kepler.tsx`,
  `HeaderLogo.android.tsx`, `HeaderLogo.web.tsx`. Fire OS: `yarn expotv:prebuild`,
  `yarn expotv:android`. Vega: `yarn vega:build`, then `yarn vega:vvd:intel` or
  `yarn vega:firetv <DSN>`.
- **Setup and run:** Node 18+, Yarn 4.5+, Vega SDK, Android TV system image.
  README: do not run Vega and Expo TV builds at the same time; Fast Refresh only
  in debug builds.
- **Reuse for FireDrift:** the monorepo scaffold (root `package.json`,
  `.yarnrc.yml`, `index.js`, `packages/vega/metro.config.js`),
  `packages/shared/src/utils/scaling.ts`,
  `packages/shared/src/services/httpClient.ts`, the platform-extension pattern.
- **License:** MIT-0. `LICENSE-THIRD-PARTY` lists the RN template and Gradle.
- **Problems:** six source files carry "PROPRIETARY/CONFIDENTIAL" headers that
  conflict with MIT-0. The VVD scripts only name Mac builds; on Linux use the
  x86_64 (`vvd:intel`) path. The `firetv` script points to a release build, but
  `vega:build` makes a debug build. `@multitv/shared` is `"*"` instead of
  `workspace:*`. The README calls `packages/vega` a symlink; it is a directory.

## Fire OS samples

### hello-world-fire-tv

- **Platform / framework:** Fire OS. Kotlin, Jetpack Compose with Compose for TV
  (`tv-material 1.0.0`, `tv-foundation 1.0.0-alpha11`). compileSdk / targetSdk 34,
  minSdk 21, AGP 8.2, Kotlin 1.9.
- **Demonstrates:** drawer navigation, card grid, focused-card styling, light and
  dark theme. No Amazon SDKs.
- **Setup and run:** open in Android Studio and run on an Android TV emulator or
  a Fire TV over ADB.
- **Reuse for FireDrift:** only the TV manifest setup (`LEANBACK_LAUNCHER`,
  `touchscreen` not required, banner) as a reference for the Expo TV config.
- **License:** MIT-0.
- **Problems:** `tv-foundation` alpha is old. Kotlin 1.9 is pinned to an old
  Compose compiler. README demo GIF links to a personal fork.

### hello-world-fire-tv-react-native

- **Platform / framework:** Fire OS. Expo ~51, `react-native-tvos ~0.74.2`,
  `@react-native-tvos/config-tv`, React Navigation drawer 6.
- **Demonstrates:** drawer navigation with four placeholder screens and focus
  trapping (`TVFocusGuideView trapFocusDown`, `hasTVPreferredFocus`). README lists
  grid, video player and focus methods as "coming next"; they are not in the code.
- **Setup and run:** start an Android TV emulator or connect a Fire TV, then
  `npm i`, `npm run android`. Node 18+ for Expo 51.
- **Reuse for FireDrift:** `navigation/DrawerContent.tsx` pattern only. The
  cross-platform samples cover the same ground on newer versions.
- **License:** MIT-0.
- **Problems:** Expo 51 and react-native-tvos 0.74 are old. No grid or player.

### login-with-amazon-sample

- **Platform / framework:** Fire OS. Kotlin with Android Views. compileSdk /
  targetSdk 34, minSdk 21, AGP 8.1, Kotlin 1.9.0-RC, Java 18 target.
- **Demonstrates:** Login with Amazon (OAuth2): `AuthorizationManager.authorize`
  with profile and postal code scopes, `getToken`, `User.fetch`, `signOut`. All in
  `app/src/main/java/com/amazon/lwa/AmazonLogin.kt`.
- **Setup and run:** needs an Amazon Developer account, a security profile, and an
  API key in `app/src/main/assets/api_key.txt`. Download the LWA SDK jar into
  `app/libs` and add the button images to `res/drawable`.
- **Reuse for FireDrift:** low. The flow is Android-only. For Vega, use
  `kepler-media-account-login` (see vega-video-sample) or our own OAuth.
- **License:** MIT-0.
- **Problems:** does not build after a clean clone (jar, images and key missing).
  Not TV-ready: `touchscreen` is required, no `LEANBACK_LAUNCHER`, no banner.
  Java 18 target while CI uses JDK 11. A stray internal `Config` build file at
  the root.

### splash-screen-fire-tv-demo

- **Platform / framework:** Fire OS. Kotlin with Leanback, Glide. compileSdk /
  targetSdk 32, AGP 7.4, Kotlin 1.7.
- **Demonstrates:** a splash screen made with a themed window background, because
  Fire OS is based on Android 11 and has no Android 12 SplashScreen API. The rest
  is the standard Leanback template.
- **Setup and run:** Android Studio, then run on an Android TV emulator or a Fire
  TV over ADB.
- **Reuse for FireDrift:** only the advice: no Android 12 SplashScreen API on Fire
  OS; SVG loads faster.
- **License:** MIT-0.
- **Problems:** `SplashScreenTvApplication.onCreate()` calls `Thread.sleep(6000)`
  to show the splash; remove it if you copy the code. targetSdk 32 and AGP 7.4
  are old. Sample videos come from external URLs that can break.

## Tools

### devices-agent-skills

- **What it is:** Agent Skills for Claude Code and Kiro.
  `skills/rn-tv-ui-best-practices`: focus, layout, typography, input and Vega
  rules, plus `references/scripts/audit.js`, a zero-dependency checker
  (`node audit.js src --only focus,input`, exit code 1 on findings, good for CI).
  `skills/vega-multi-tv-migration`: turn a Vega app into a multi-TV monorepo.
- **Platforms:** React Native only (react-native-tvos and Vega). No Kotlin.
- **Install:** `gh skill install AmazonAppDev/devices-agent-skills --all` or
  `npx skills add AmazonAppDev/devices-agent-skills`.
- **Use for FireDrift:** run `audit.js` in CI on the shared UI code; use the skill
  for focus and D-pad reviews.
- **License:** MIT.
- **Open Source fit:** good. Active, MIT, and `CONTRIBUTING.md` explains how to
  propose a new skill (open an issue first). Ideas: new `audit.js` checks, a skill
  for vertical feeds on TV.

### amazon-devices-buildertools

- **What it is:** a Kiro Power (`amazon-devices-buildertools-power/POWER.md`,
  `mcp.json`) around the MCP server
  `@amazon-devices/amazon-devices-buildertools-mcp`. Tools: documentation search
  and read, Perfetto trace analysis, hot functions, crash (ACR) symbolication,
  workflow status.
- **Platforms:** Vega OS first. Also has Fire OS documents and workflows.
- **Install for Claude Code:**
  `claude mcp add <name> -- npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest`.
  The README documents only Kiro. We already use it (see `CLAUDE.md`).
- **Use for FireDrift:** documentation lookup, performance (TTFF / TTFD) and
  crash analysis on Vega.
- **License:** repository is Apache-2.0. The MCP npm package is under the Amazon
  Program Materials License, not an open-source license.
- **Open Source fit:** weak. The repository holds only configuration and docs.

## Friction log (to file later)

Problems found during the review. File each one with the **Friction log** issue
template when we confirm it during setup.

| # | Tool / SDK | Repository | Problem | Severity |
|---|---|---|---|---|
| 1 | Vega samples docs | video, sports, tv-interfaces, audio | README asks for Node 18–20, but `package.json` needs Node ≥ 22 (`engine-strict` in some). | Medium |
| 2 | Vega CLI | scrolling, epg, scripts in video, sports, tv-interfaces, audio | Mix of the old `kepler` CLI and the new `vega` CLI in READMEs and scripts. | Low |
| 3 | Vega docs | scrolling, epg, multi-tv-app-sample | Links point to SDK 0.21 docs; current SDK is 0.24. | Low |
| 4 | Vega samples | sports | Known issue says it is fixed in "upcoming SDK 0.22"; README mentions a `patch-package` step that does not exist. | Low |
| 5 | Vega samples | epg, seekbar, multi-tv-app-sample (Vega app) | Still on RN 0.72 / KUIC 2.x with loose or `*` versions, unlike the RN 0.83 samples. | Medium |
| 6 | Cross-platform sample | multi-tv-helloworld | Six files have "PROPRIETARY/CONFIDENTIAL" headers in an MIT-0 repository; the license status is unclear. | Medium |
| 7 | Cross-platform sample | multi-tv-helloworld | VVD scripts only cover Mac builds; `firetv` script expects a release build that `vega:build` does not make. | Low |
| 8 | Cross-platform sample | multi-tv-app-sample | Expo 54 with SDK 52 packages; `mitt` not declared. | Medium |
| 9 | Login with Amazon SDK | login-with-amazon-sample | Does not build after a clean clone; not TV-ready manifest; Java 18 vs CI JDK 11. | High |
| 10 | Vega VVD (Ubuntu) | — | SDK 0.21 release notes: VVD stop and status commands do not work on Ubuntu. Check if still true on 0.24. | Low |
| 11 | Builder Tools MCP | amazon-devices-buildertools | README documents only Kiro, not Claude Code or other MCP clients. | Low |
| 12 | Sample media | video, tv-interfaces | Images and videos on CloudFront with no stated license. | Low |

## Next steps

1. Team agrees on the platform. Then add `platform` to `.adbt-config.json`
   (format in `CLAUDE.md`).
2. Spike: install Vega SDK 0.24 on Ubuntu 24.04, run `vega-tv-interfaces-sample`
   and the helloworld monorepo on the VVD. Log friction as issues.
3. Decide the trailer source and check its license and terms.
4. Define the MVP.
5. Open Source target: `devices-agent-skills` (see above).
