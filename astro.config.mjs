import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { formatDiagnostic } from './src/content/diagnostics.ts';
import { checkContent } from './src/content/validate.ts';

/** ビルドの最初に教材を検証し、エラーがあればビルドを止める（詳細設計書 §3.5） */
function contentCheck() {
  return {
    name: 'oop-lab:content-check',
    hooks: {
      'astro:build:start': ({ logger }) => {
        const { diagnostics } = checkContent('content');
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
