// テスト用教材でビルドした結果の検査（テスト計画書 IT-02・IT-03）
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { writeFixtureContent } from '../fixtures/content-fixture';

let work: string;
let outDir: string;
let pages: { path: string; html: string }[];

function listHtml(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listHtml(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'build-csp-'));
  writeFixtureContent(join(work, 'content'));
  outDir = join(work, 'dist');
  const result = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', outDir], {
    encoding: 'utf8',
    env: { ...process.env, OOP_LAB_CONTENT_ROOT: join(work, 'content') },
  });
  if (result.status !== 0) throw new Error(`ビルドに失敗しました\n${result.stdout}${result.stderr}`);
  pages = listHtml(outDir).map((path) => ({ path, html: readFileSync(path, 'utf8') }));
}, 180_000);

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

it('どのページも、インラインのスクリプトすべてのハッシュ値を CSP の script-src に含む', () => {
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    const csp = /<meta http-equiv="content-security-policy" content="([^"]*)"/.exec(page.html)?.[1];
    expect(csp, page.path).toBeDefined();
    const scriptSrc = csp!.split(';').find((directive) => directive.trim().startsWith('script-src')) ?? '';
    const inlineScripts = [...page.html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    // 表示言語を決める先頭スクリプトが、どのページにもある
    expect(inlineScripts.some((script) => script.includes('data-lang')), page.path).toBe(true);
    for (const script of inlineScripts) {
      const hash = `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
      expect(scriptSrc, `${page.path} のスクリプト: ${script.slice(0, 60)}`).toContain(hash);
    }
  }
});

it('配信ヘッダの CSP は frame-ancestors だけを指定する', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const policies = [...headers.matchAll(/Content-Security-Policy:\s*(.*)/g)].map((match) => match[1].trim());
  expect(policies).toEqual(["frame-ancestors 'none'"]);
});

it('IT-02: クイズの画面に正解データを含めず、正解データは別のファイルとして出力する', () => {
  const quiz = pages.find((page) => page.path.endsWith(join('concepts', 'sample', 'quiz', 'index.html')));
  expect(quiz).toBeDefined();
  expect(quiz!.html).toContain('設問 1');
  expect(quiz!.html).not.toContain('正解の理由');
  expect(quiz!.html).not.toContain('誤りの理由');
  const answers = JSON.parse(readFileSync(join(outDir, 'data', 'answers', 'sample.json'), 'utf8')) as Record<string, { correct: string }>;
  expect(answers['sample.q01'].correct).toBe('a');
  expect(Object.keys(answers)).toHaveLength(10);
});
