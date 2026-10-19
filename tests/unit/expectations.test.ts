// 変更要求の期待と修正行数の照合（テスト計画書 UT-EXP-01〜03）
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkExpectations, evaluateExpectations } from '../../src/build/expectations';
import { checkContent } from '../../src/content/validate';
import { writeFixtureContent } from '../fixtures/content-fixture';

let root: string;
const changeDir = (name: string) => join(root, 'concepts', 'sample', 'changes', name);

function load() {
  const result = checkContent(root);
  expect(result.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
  return result.content;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'expectations-'));
  writeFixtureContent(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('evaluateExpectations', () => {
  it('UT-EXP-01: proper-fewer は、適切の修正行数が未適用より少なければ成功', () => {
    const results = evaluateExpectations(load()).filter((r) => r.changeId === 'sample.state-label');
    expect(results.map((r) => `${r.languageId} 適切${r.proper} 未適用${r.unapplied} ${r.satisfied}`)).toEqual([
      'java 適切2 未適用4 true',
      'cpp 適切2 未適用4 true',
      'vba 適切2 未適用4 true',
    ]);
  });

  it('UT-EXP-02: proper-not-fewer は、適切の修正行数が未適用以上なら成功し、少なければ失敗', () => {
    const results = evaluateExpectations(load()).filter((r) => r.changeId === 'sample.rename-rear');
    expect(results.every((r) => r.proper === r.unapplied && r.satisfied)).toBe(true);

    const file = join(changeDir('state-label'), 'change.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('proper-fewer', 'proper-not-fewer'));
    // proper-fewer が1件もなくなるため V04 のエラーになるが、ここでは照合の結果だけを見る
    const content = checkContent(root).content;
    expect(evaluateExpectations(content).filter((r) => r.changeId === 'sample.state-label' && !r.satisfied)).toHaveLength(3);
  });

  it('UT-EXP-03: 1つの言語でも条件を満たさなければ失敗し、その言語と数値を示す', () => {
    // C++ の未適用だけ、変更前と同じにする（修正行数 0）
    const base = join(root, 'concepts', 'sample', 'variations', 'unapplied', 'cpp', 'main.cpp');
    writeFileSync(join(changeDir('state-label'), 'unapplied', 'cpp', 'main.cpp'), readFileSync(base, 'utf8'));
    expect(checkExpectations(load())).toEqual([
      {
        rule: 'B01',
        level: 'error',
        file: 'concepts/sample/changes/state-label/change.yaml',
        message: 'C++: 修正行数が 適切 2 行・未適用 0 行で、期待「適切のほうが少ない（proper-fewer）」と合いません',
      },
    ]);
  });
});
