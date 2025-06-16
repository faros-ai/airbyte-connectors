module.exports = {
  root: true,
  extends: 'faros',
  ignorePatterns: ['.eslintrc.js', '/lib/'],
  rules: {
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    'max-len': ['error', {code: 100, ignoreUrls: true}],
  },
};
