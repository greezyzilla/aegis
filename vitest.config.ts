import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'entrypoints/options/backup.ts'],
      exclude: ['lib/useSettings.ts', 'lib/types.ts'],
      reporter: ['text', 'html'],
    },
  },
});
