# Fake streaming app

A Vega test app for Watch now (FR-3). The VVD has no streaming apps, so this
app stands in for one: FireDrift opens it with `pkg://` and it shows the URI it
was opened with. Not part of the product.

```sh
cd tools/fake-streaming-app
npm install
npm run build:debug
npm run vvd          # installs it on the running VVD
```

Then point a provider to it in `app/src/config.ts` (do not commit this):

```ts
serviceAppOverrides: { 8: 'com.firedrift.fakestreaming.main' }, // 8 = Netflix
```

Build and run FireDrift, open Watch now on a Netflix title and choose Netflix:
the orange "FAKE STREAMING APP" screen opens with
`pkg://com.firedrift.fakestreaming.main`.

What it showed on the VVD (SDK 0.24): from an app, `Linking.openURL` opens
another app only with `pkg://<component-id>`, on its home screen. Custom
schemes and `https://` links registered by the target app fail from
`openURL`, even though `vlcm launch-app <uri>` in the device shell routes them.
