module.exports = {
  preset: '@react-native/jest-preset',
  roots: ['<rootDir>/__tests__'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
};
