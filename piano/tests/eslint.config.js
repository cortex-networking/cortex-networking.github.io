// ESLint flat config for Middle C (piano/js): plain browser ES modules, no build step.
// Self-contained (no imports), so it runs with any ESLint 9 install. From the repository root:
//   npx -y -p eslint@9 eslint -c piano/tests/eslint.config.js piano/js piano/tests
// The browser globals are listed explicitly (only the ones the app uses) instead of the whole
// `globals.browser` set, so a deleted helper named like a window property (open, close, name,
// status, print...) is still reported by no-undef.

const BROWSER = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'performance', 'console',
  'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'matchMedia', 'fetch', 'URL',
  'Event', 'CustomEvent', 'EventTarget', 'ResizeObserver', 'OfflineAudioContext',
  // used behind typeof checks / available in every target browser
  'AudioContext', 'webkitAudioContext', 'cancelAnimationFrame', 'setInterval', 'clearInterval',
];
const NODE = ['process', 'globalThis', 'structuredClone', 'queueMicrotask'];
const readonly = (names) => Object.fromEntries(names.map((n) => [n, 'readonly']));

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: readonly(BROWSER),
    },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    rules: {
      // real bugs
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'getter-return': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-const-assign': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-class-assign': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-invalid-this': 'off',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-compare-neg-zero': 'error',
      'no-sparse-arrays': 'error',
      'no-fallthrough': 'error',
      'no-setter-return': 'error',
      'no-loss-of-precision': 'error',
      'no-unused-private-class-members': 'warn',
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
      'array-callback-return': ['error', { checkForEach: false }],
      'no-shadow-restricted-names': 'error',
      'no-obj-calls': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-empty-pattern': 'error',
      'no-async-promise-executor': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unmodified-loop-condition': 'warn',
      // probably fine, but worth a look
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-constant-binary-expression': 'warn',
      'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'off',
    },
  },
  {
    // the unit tests run in Node
    files: ['**/tests/**/*.mjs', '**/tests/**/*.js'],
    languageOptions: { globals: { ...readonly(BROWSER), ...readonly(NODE), document: 'writable', window: 'writable', localStorage: 'writable' } },
  },
];
