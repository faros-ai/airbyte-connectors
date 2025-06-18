// Load the faros config and override all its rules
const farosConfig = require('eslint-config-faros');

// Get all TypeScript ESLint rules from the recommended configs
const tseslintRecommended = require('@typescript-eslint/eslint-plugin').configs['recommended-type-checked'].rules;
const tseslintStylistic = require('@typescript-eslint/eslint-plugin').configs['stylistic-type-checked'].rules;

// Merge all rules
const allRules = {
  ...tseslintRecommended,
  ...tseslintStylistic,
  ...farosConfig.rules,
};

// Convert all to 'warn'
const rules = {};
for (const [ruleName, ruleConfig] of Object.entries(allRules)) {
  if (Array.isArray(ruleConfig)) {
    rules[ruleName] = ['warn', ...ruleConfig.slice(1)];
  } else if (ruleConfig !== 'off' && ruleConfig !== 0) {
    rules[ruleName] = 'warn';
  }
}

// Apply custom overrides
rules['@typescript-eslint/no-unused-vars'] = [
  'warn',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
  },
];
rules['max-len'] = ['warn', {code: 100, ignoreUrls: true}];

module.exports = {
  root: true,
  extends: 'faros',
  ignorePatterns: ['.eslintrc.js', '/lib/'],
  rules,
};
