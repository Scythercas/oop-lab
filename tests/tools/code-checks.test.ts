// 実行確認の処理そのもののテスト（テスト計画書 UT-CHK-01・02）と、テスト用の教材での実行確認。
// コンパイラが要るので、CI の check-java・check-cpp ジョブで、環境変数 CHECK_LANG を付けて動かす。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Content } from '../../src/content/loader';
import type { Language } from '../../src/content/schema';
import { checkContent } from '../../src/content/validate';
import {
  checkRunTarget,
  checkSyntaxTarget,
  collectRunTargets,
  collectSyntaxTargets,
  expandCommand,
  repositoryRoot,
} from '../../tools/ci/code-checks';
import { writeFixtureContent } from '../fixtures/content-fixture';

const enabled = (process.env.CHECK_LANG ?? '').split(',');
const root = repositoryRoot();
let fixtureRoot: string;
let content: Content;
let languageOf: (id: string) => Language;

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'code-checks-'));
  writeFixtureContent(fixtureRoot);
  content = checkContent(fixtureRoot).content;
  languageOf = (id) => content.languages.find((language) => language.id === id)!;
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('expandCommand', () => {
  it('{out}・{sources}・{files} を置き換える', () => {
    expect(expandCommand('g++ -o {out}/main {sources} extra.cpp', { out: '/t/out', sources: ['/t/a.cpp'], files: ['/t/a.cpp', '/t/a.h'] })).toEqual([
      'g++',
      '-o',
      '/t/out/main',
      '/t/a.cpp',
      'extra.cpp',
    ]);
  });
});

describe.runIf(enabled.includes('java'))('Java', () => {
  const java = () => languageOf('java');
  const main = (body: string) => ({ path: 'Main.java', content: `public class Main {\n    public static void main(String[] args) {\n${body}\n    }\n}\n` });

  it('テスト用の教材のコードと設問のコードが、すべて確認を通る', () => {
    const results = [
      ...collectRunTargets(content, 'java').map((target) => checkRunTarget(target, java(), root)),
      ...collectSyntaxTargets(content, 'java').map((target) => checkSyntaxTarget(target, java(), root)),
    ];
    expect(results.filter((result) => !result.ok)).toEqual([]);
    expect(results).toHaveLength(12);
  }, 180_000);

  it('UT-CHK-01: 出力の違い・コンパイルエラー・時間切れを、それぞれ失敗にする', () => {
    const mismatch = checkRunTarget({ label: 'mismatch', files: [main('        System.out.println("前照灯 消灯");')], expectedOutput: '前照灯 点灯\n' }, java(), root);
    expect(mismatch).toMatchObject({ ok: false });
    expect(mismatch.detail).toContain('出力が期待結果と違います（1 行目）');

    const compileError = checkRunTarget({ label: 'compile', files: [main('        int x = "文字列";')], expectedOutput: '' }, java(), root);
    expect(compileError.ok).toBe(false);
    expect(compileError.detail).toContain('ビルドに失敗しました');

    const endless = checkRunTarget({ label: 'endless', files: [main('        while (true) { }')], expectedOutput: '' }, java(), root);
    expect(endless.ok).toBe(false);
    expect(endless.detail).toContain('実行が時間内に終わりませんでした');
  }, 60_000);
});

describe.runIf(enabled.includes('cpp'))('C++', () => {
  const cpp = () => languageOf('cpp');

  it('テスト用の教材のコードと設問のコードが、すべて確認を通る', () => {
    const results = [
      ...collectRunTargets(content, 'cpp').map((target) => checkRunTarget(target, cpp(), root)),
      ...collectSyntaxTargets(content, 'cpp').map((target) => checkSyntaxTarget(target, cpp(), root)),
    ];
    expect(results.filter((result) => !result.ok)).toEqual([]);
    expect(results).toHaveLength(12);
  }, 180_000);

  it('UT-CHK-01: 出力の違いとコンパイルエラーを失敗にする', () => {
    const mismatch = checkRunTarget(
      { label: 'mismatch', files: [{ path: 'main.cpp', content: '#include <cstdio>\n\nint main()\n{\n    std::puts("尾灯 消灯");\n    return 0;\n}\n' }], expectedOutput: '尾灯 点灯\n' },
      cpp(),
      root,
    );
    expect(mismatch.detail).toContain('出力が期待結果と違います（1 行目）');
    const compileError = checkRunTarget({ label: 'compile', files: [{ path: 'main.cpp', content: 'int main()\n{\n    return x;\n}\n' }], expectedOutput: '' }, cpp(), root);
    expect(compileError.detail).toContain('ビルドに失敗しました');
  }, 60_000);

  it('UT-CHK-02: 実行中と、静的な初期化の中の動的メモリ確保を検出する', () => {
    // 禁止パターンの検査（V09）をすり抜ける書き方でも、実行時に検出できることを確かめる
    const inMain = checkRunTarget(
      { label: 'in-main', files: [{ path: 'main.cpp', content: '#include <memory>\n\nint main()\n{\n    auto p = std::make_shared<int>(3);\n    return *p - 3;\n}\n' }], expectedOutput: '' },
      cpp(),
      root,
    );
    expect(inMain.ok).toBe(false);
    expect(inMain.detail).toContain('動的メモリ確保を検出しました');

    const inStaticInit = checkRunTarget(
      { label: 'static-init', files: [{ path: 'main.cpp', content: '#include <vector>\n\nstatic std::vector<int> values(10, 1);\n\nint main()\n{\n    return static_cast<int>(values.size()) - 10;\n}\n' }], expectedOutput: '' },
      cpp(),
      root,
    );
    expect(inStaticInit.ok).toBe(false);
    expect(inStaticInit.detail).toContain('動的メモリ確保を検出しました');
  }, 60_000);
});
