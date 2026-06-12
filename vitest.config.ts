// Standalone vitest config. vite.config.ts uses the function form of
// vite's defineConfig, whose return type has no `test` field — adding
// one there would be a type error under strict tsc. A separate file
// keeps the app's vite config untouched.
//
// Test convention: src/**/__tests__/*.test.ts (co-located __tests__
// folders next to the modules under test).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/*.test.ts'],
  },
});
