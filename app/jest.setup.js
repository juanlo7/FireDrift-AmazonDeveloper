// Fixes for the @amazon-devices/react-native-kepler jest preset (SDK 0.24):
// its BackHandler mock has no `default` export (react-native's index reads
// `.default`), and its BackHandler and Dimensions mocks return no subscription
// from addEventListener, so React Navigation and useWindowDimensions crash.
// react-native's index resolves `BackHandler.kepler.js` (haste platform), so
// both BackHandler files are mocked.

jest.mock('@amazon-devices/react-native-kepler/Libraries/Utilities/BackHandler', () =>
  require('./test/mocks/backHandler'),
);
jest.mock('@amazon-devices/react-native-kepler/Libraries/Utilities/BackHandler.kepler', () =>
  require('./test/mocks/backHandler'),
);
jest.mock('@amazon-devices/react-native-kepler/Libraries/Utilities/Dimensions', () =>
  require('./test/mocks/dimensions'),
);

// AsyncStorage is a native module on Vega; tests use the package's in-memory mock.
jest.mock('@amazon-devices/react-native-async-storage__async-storage', () =>
  require('@amazon-devices/react-native-async-storage__async-storage/jest/async-storage-mock'),
);
