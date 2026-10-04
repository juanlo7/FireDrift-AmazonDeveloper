const size = { fontScale: 1, height: 1080, scale: 1, width: 1920 };

module.exports = {
  __esModule: true,
  default: {
    get: () => size,
    set: jest.fn(),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  },
};
