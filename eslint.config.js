import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const LEARNING_STORE_MESSAGE =
  '学習データは学習データストア（src/domain/learning-store.ts）を通して読み書きする（詳細設計書 §2.1）';

export default defineConfig([
  globalIgnores(['**/dist/', '**/.astro/', '**/.wrangler/', '**/node_modules/', 'playwright-report/', 'test-results/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // SA-02: localStorage を使ってよいのは学習データストアだけ。
  // 表示言語を決める先頭スクリプトは、ビルド時に文字列として生成するため、この規則の対象にならない（詳細設計書 §2.1）。
  {
    files: ['src/**/*.{js,mjs,ts,tsx,astro}'],
    ignores: ['src/domain/learning-store.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'localStorage', message: LEARNING_STORE_MESSAGE }],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: LEARNING_STORE_MESSAGE },
        { object: 'globalThis', property: 'localStorage', message: LEARNING_STORE_MESSAGE },
      ],
    },
  },
  // SA-03: src/domain は画面の技術（React・Astro）に依存しない
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'astro', 'astro/*', 'astro:*', '@astrojs/*'],
              message: 'src/domain は React・Astro に依存しない（詳細設計書 §2.1）',
            },
          ],
        },
      ],
    },
  },
]);
