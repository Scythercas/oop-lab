import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { checkExpectations } from './src/build/expectations.ts';
import { formatDiagnostic } from './src/content/diagnostics.ts';
import { CONTENT_ROOT } from './src/content/root.ts';
import { checkContent } from './src/content/validate.ts';

/** ビルドの最初に教材を検証し（V01〜V11 と B01）、エラーがあればビルドを止める（詳細設計書 §3.5・§4.4） */
function contentCheck() {
  return {
    name: 'oop-lab:content-check',
    hooks: {
      'astro:build:start': ({ logger }) => {
        const result = checkContent(CONTENT_ROOT);
        const contentErrors = result.diagnostics.filter((diagnostic) => diagnostic.level === 'error').length;
        // 教材の形に問題があると差分を正しく計算できないため、B01 は V01〜V11 が通ったときだけ行う
        const diagnostics = contentErrors === 0 ? [...result.diagnostics, ...checkExpectations(result.content)] : result.diagnostics;
        for (const diagnostic of diagnostics) {
          if (diagnostic.level === 'error') logger.error(formatDiagnostic(diagnostic));
          else logger.warn(formatDiagnostic(diagnostic));
        }
        const errors = diagnostics.filter((diagnostic) => diagnostic.level === 'error').length;
        if (errors > 0) throw new Error(`教材の検証でエラーが ${errors} 件あります`);
        logger.info('教材の検証: エラーなし');
      },
    },
  };
}

// CSP は、ページごとの meta 要素で出す（詳細設計書 §9.3）。
// ヘッダ（public/_headers）には、meta 要素では指定できない frame-ancestors だけを書く。
// 表示言語を決める先頭スクリプトのハッシュ値は、WP2-5 で scriptDirective.hashes に加える。
export default defineConfig({
  integrations: [react(), contentCheck()],
  trailingSlash: 'always',
  vite: {
    build: {
      // 小さなフォントのファイルを data: URI に埋め込ませない（font-src 'self' の CSP で止められるため）
      assetsInlineLimit: 0,
    },
  },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
      // コードの色付けなどが style 属性を使うため（詳細設計書 §9.3）
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
});
