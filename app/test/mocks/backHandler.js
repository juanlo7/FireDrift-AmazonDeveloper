// Keeps the listeners so tests can press the remote's Back key with `__pressBack()`.
// Like React Native, the newest listener runs first and `true` stops the rest.
const listeners = [];

module.exports = {
  __esModule: true,
  default: {
    addEventListener: jest.fn((event, handler) => {
      const entry = { event, handler };
      listeners.push(entry);
      return {
        remove: jest.fn(() => {
          const index = listeners.indexOf(entry);
          if (index >= 0) listeners.splice(index, 1);
        }),
      };
    }),
    removeEventListener: jest.fn(),
    exitApp: jest.fn(),
    __pressBack: () => {
      for (const { event, handler } of [...listeners].reverse()) {
        if (event === 'hardwareBackPress' && handler()) return true;
      }
      return false;
    },
  },
};
