// E2E テスト用のサイトを、テスト用教材からビルドする（テスト計画書 §6）。
// 使い方: npm run build:e2e（dist/ に出力する。その後 npm run test:e2e）
// 画面の動きを、教材の中身に左右されずに確かめるため、テスト用教材に2つ目の概念を足して使う。
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { FIXTURE_CONCEPT_ID, writeFixtureContent } from '../fixtures/content-fixture.ts';

export const E2E_CONTENT_ROOT = '.e2e-content';
/** 2つ目の概念。過剰適用と言語ごとの補足を持たない */
export const SECOND_CONCEPT_ID = 'second';

function editYaml(path: string, change: (value: Record<string, unknown>) => void): void {
  const value = parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  change(value);
  writeFileSync(path, stringify(value));
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

rmSync(E2E_CONTENT_ROOT, { recursive: true, force: true });
writeFixtureContent(E2E_CONTENT_ROOT);

const first = join(E2E_CONTENT_ROOT, 'concepts', FIXTURE_CONCEPT_ID);
const second = join(E2E_CONTENT_ROOT, 'concepts', SECOND_CONCEPT_ID);
cpSync(first, second, { recursive: true });
rmSync(join(second, 'notes'), { recursive: true, force: true });
for (const dir of [join(second, 'variations', 'overapplied'), ...['state-label', 'rename-rear'].map((name) => join(second, 'changes', name, 'overapplied'))]) {
  rmSync(dir, { recursive: true, force: true });
}
// 設問・課題・変更要求の ID を、2つ目の概念の ID に付け替える
for (const path of listFiles(second).filter((file) => file.endsWith('.yaml'))) {
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll(`${FIXTURE_CONCEPT_ID}.`, `${SECOND_CONCEPT_ID}.`));
}
editYaml(join(second, 'concept.yaml'), (concept) => {
  Object.assign(concept, {
    id: SECOND_CONCEPT_ID,
    order: 2,
    title: '2つ目の概念',
    theme: '方向指示器',
    summary: 'テスト用の2つ目の概念',
    related: [FIXTURE_CONCEPT_ID],
    variations: ['unapplied', 'proper'],
  });
});
editYaml(join(first, 'concept.yaml'), (concept) => {
  concept.related = [SECOND_CONCEPT_ID];
});

const result = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, OOP_LAB_CONTENT_ROOT: resolve(E2E_CONTENT_ROOT) },
});
process.exit(result.status ?? 1);
