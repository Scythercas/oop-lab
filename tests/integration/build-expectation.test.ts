// 変更要求の期待に反する教材ではビルドが失敗する（テスト計画書 IT-05）
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { writeFixtureContent } from '../fixtures/content-fixture';

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'build-'));
  writeFixtureContent(join(work, 'content'));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

it('期待に反する変更要求があると、B01 のエラーでビルドが止まる', () => {
  // 「改名」は適切も未適用も1行ずつ直すので、proper-fewer にすると期待に反する
  const file = join(work, 'content', 'concepts', 'sample', 'changes', 'rename-rear', 'change.yaml');
  writeFileSync(file, readFileSync(file, 'utf8').replace('proper-not-fewer', 'proper-fewer'));

  const result = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', join(work, 'dist')], {
    encoding: 'utf8',
    env: { ...process.env, OOP_LAB_CONTENT_ROOT: join(work, 'content') },
  });
  const output = `${result.stdout}${result.stderr}`;
  expect(result.status).not.toBe(0);
  expect(output).toContain('[B01 エラー] concepts/sample/changes/rename-rear/change.yaml');
  expect(output).toContain('教材の検証でエラーが 3 件あります');
}, 120_000);
