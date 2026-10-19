import { defineConfig } from 'vitest/config';

// コンパイラが要るテスト（実行確認の処理そのもののテスト）。
// CI の check-java・check-cpp ジョブで、環境変数 CHECK_LANG（java・cpp）を付けて動かす。
export default defineConfig({
  test: {
    include: ['tests/tools/**/*.test.ts'],
    environment: 'node',
  },
});
