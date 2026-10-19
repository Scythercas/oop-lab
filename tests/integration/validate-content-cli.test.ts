// 教材の検証のコマンド（テスト計画書 IT-07）
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { writeFixtureContent } from '../fixtures/content-fixture';

let root: string;

function run(...args: string[]) {
  return spawnSync(process.execPath, ['tools/ci/validate-content.ts', ...args], { encoding: 'utf8' });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'content-cli-'));
  writeFixtureContent(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('正しい教材では、件数の一覧を出して成功する', () => {
  const result = run(root);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('| サンプル（sample） | 3 | 2 | 10 | 1 | 10 | 10 | 10 |');
  expect(result.stdout).toContain('概念 1 件、コードの状態 合計 30 個');
});

it('問題のある教材では、問題の一覧を出して失敗する', () => {
  rmSync(join(root, 'concepts', 'sample', 'explanation.md'));
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('[V05 エラー] concepts/sample/explanation.md: ファイルがありません');
  expect(result.stderr).toContain('教材の検証: エラー 1 件');
});

it('本物の教材（content/）が検証を通る', () => {
  expect(run().status).toBe(0);
});
