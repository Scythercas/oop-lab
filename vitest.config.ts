import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      // 結合テストのうち2つは astro build を実行する。同時に動かすと作業用のファイルを取り合うため、ファイルを順に実行する
      { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node', fileParallelism: false } },
    ],
  },
});
