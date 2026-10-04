# Product feedback and friction log

One line per problem with an Amazon or AWS tool, SDK or doc. Each one can
become a "Friction log" issue. Used for the submission feedback.

| Date | Tool | Problem | Workaround |
|---|---|---|---|
| 2026-10-04 | Vega SDK 0.24, `@amazon-devices/react-native-kepler` jest preset | The `BackHandler` mock has no `default` export, but react-native's `index.js` reads `.default`. The `BackHandler` and `Dimensions` mocks return no subscription from `addEventListener`. Any app with React Navigation crashes in Jest. | `app/jest.setup.js` mocks both, including `BackHandler.kepler.js` (haste platform) |
| 2026-10-04 | Vega Virtual Device, `screenshooter` via `vega device run-cmd` | `screenshooter /tmp/x.png` fails with "creating a buffer file … Permission denied", and after that every `run-cmd` fails with "No running instances of com.amazon.dev.shell.service". No documented CLI command to take a simulator screenshot. | Check the screen by eye |
| 2026-10-04 | Vega docs | `docs/vega/latest/install-vega-sdk.html` is a redirect page with no content, and the 0.24 install guide links out for KVM and Watchman instead of giving the Ubuntu commands. | Use the versioned URL (`/0.24/`) |
