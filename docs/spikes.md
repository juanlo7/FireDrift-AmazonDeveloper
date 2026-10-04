# FireDrift — Spike results

What each spike in `docs/requirements.md` (section 9) found, so nobody has to
find it again. Newest first.

## V1 and V3 — 2026-10-04 (issue #34)

Setup: Vega SDK 0.24.12112, Vega CLI 1.4.2, Vega Virtual Device (VVD) on
Ubuntu 24.04 x86_64, app from `chore/33-vega-app-scaffold`.

### V1: YouTube IFrame API in a WebView — not testable on our VVD → plan B

- `@amazon-devices/webview` (both `4.0.x` and `3.5.x`) needs a system module
  that the **VVD on Ubuntu and Intel Mac does not have**. Install fails with:
  `Module dependency not found … /com.amazon.kepler.webview_4@IWebview_4`
  (or `webview_3@IWebview_3`). Amazon confirms it in the
  [community forum](https://community.amazondeveloper.com/t/failed-to-run-an-app-with-webview-on-the-virtual-device-using-ubuntu/24551):
  WebView works only on the VVD on **Apple Silicon Macs** or on a **Vega
  device** (Fire TV Stick 4K Select, Fire TV Stick HD 2026, Fire TV Stick 4K 2026).
- Older Fire TV sticks run Fire OS (Android) and **cannot run Vega apps**; there
  is no compatibility layer.
- The Vega WebView only accepts `source={{ uri }}` (no inline `html`). A local
  page goes in `app/assets/` and loads as `file:///pkg/assets/<file>.html`.
  It also needs the `[wants]` services of the `vegaWebview` template
  (`com.amazon.webview.renderer_service`, media and audio services).
- **Decision:** the feed uses D8 plan B, cover + synopsis with an animated
  backdrop, so it runs on every VVD. The demo video is recorded by the team
  member with an Apple Silicon Mac.
- If we ever try the trailer player again (stretch, Mac or device only): one
  local page that loads `https://www.youtube.com/iframe_api`, creates one
  `YT.Player`, swaps trailers with `player.loadVideoById(key)` through
  `injectJavaScript`, and reports `onReady` / `onStateChange` / `onError` with
  `window.ReactNativeWebView.postMessage`.

### V3: opening another app — works by component ID; services need a device

Tested with `Linking.canOpenURL` and `Linking.openURL` from the app on the VVD:

| URL | Result on the VVD |
|---|---|
| `pkg://com.amazon.keplerlauncherapp.main` | **Opens** the Fire TV home screen |
| `pkg://com.amazon.arol.photos` | Fails (not an interactive app) |
| `https://www.netflix.com/title/80100172` | Fails: no browser or Netflix on the VVD |
| `netflix://title/80100172` | Fails: Netflix not installed |
| `amzns://apps?asin=B00KO6UWAS`, `amzns://apps?id=com.netflix.ninja` | Fails |
| `amzns://apps/android?p=…` (Fire OS format) | Fails |
| `fos://com.netflix#Intent;action=OPEN_NETFLIX_ACTION;end;` | Fails |

- A Vega app **can open another app** with `pkg://<component-id>`. Formats
  from the [Linking docs](https://developer.amazon.com/docs/react-native-vega/0.83/linking.html):
  `https://…`, `amzns://apps?<type>=<value>`, custom schemes,
  `fos://<package-id>#Intent;…;end;` and `pkg://<component-id>`.
- `canOpenURL` **throws** (`Can not open URL: …`) instead of returning `false`
  when no app handles the URL, and `openURL` rejects with
  `Failed opening URL: …`. Always `try/catch` both.
- The VVD has no streaming apps, so the real component IDs of the Netflix,
  Prime Video, etc. Vega apps, and whether they open a title, are still
  unknown. They need a Vega device (`vega device installed-apps` lists them).
- **For FR-3 (Watch now):** try the service link; if it throws, show the
  service name and logo with "Open it in <service>". This is the V3 plan B in
  `requirements.md`.

### Tools that help on the VVD

| Need | Command |
|---|---|
| Press remote keys | `vega device run-cmd -c 'inputd-cli button_press KEY_RIGHT'` (`KEY_LEFT`, `KEY_UP`, `KEY_DOWN`, `KEY_ENTER`, `KEY_BACK`) |
| Read app logs | `vega device run-cmd -c 'loggingctl log -v com.firedrift.app'` (JS `console.*` did not show up here) |
| Apps on the device | `vega device installed-apps`, `vega device running-apps` |
| Screenshot | None that works: `screenshooter` fails and breaks `run-cmd` until the VVD restarts |
