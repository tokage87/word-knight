// Flat ESLint config. Two tiers:
//   1. src/**/*.ts  — typescript-eslint recommended + a small set of
//      type-aware rules (projectService scoped to src/ keeps it fast).
//   2. scripts/ + vite.config.ts — plain recommended, no type info
//      (scripts are standalone Node generators outside tsconfig).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      // Generated outputs (see .prettierignore for the same list).
      'Vocab_list*.html',
      'src/data/',
    ],
  },

  // ── Application source (type-aware) ──
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The single most-wanted rule per the roadmap: fire-and-forget
      // async calls must be explicit (`void doAsync()`).
      '@typescript-eslint/no-floating-promises': 'error',

      // Non-null assertions are used deliberately throughout (Phaser
      // lifecycle guarantees, DOM queries on elements we just created).
      '@typescript-eslint/no-non-null-assertion': 'off',

      // `catch {}` is a deliberate pattern (MetaStore localStorage
      // guards, speech.ts feature detection). Empty non-catch blocks
      // still error.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Match tsc's noUnusedLocals/noUnusedParameters behavior, which
      // exempts `_`-prefixed names.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ── Node generator scripts + Vite config (no type info) ──
  {
    files: ['scripts/**/*.{mjs,cjs}', 'vite.config.ts'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        // Node globals used by the generators.
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
  },
  {
    files: ['vite.config.ts'],
    extends: [...tseslint.configs.recommended],
  },

  // Must be last: turns off stylistic rules that would fight Prettier.
  prettier,
);
