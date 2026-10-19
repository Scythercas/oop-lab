// VBA の確認対象・ハッシュ値・確認記録（テスト計画書 UT-CHK-04、UT-HASH-01）
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Content } from '../../src/content/loader';
import { checkContent } from '../../src/content/validate';
import {
  type VbaRecord,
  type VbaRecordEntry,
  findRecordProblems,
  hashFiles,
  hashSnippet,
  judge,
  listVbaTargets,
  mergeRecord,
} from '../../tools/vba-verify/vba-targets';
import { writeFixtureContent } from '../fixtures/content-fixture';

let root: string;
const load = (): Content => checkContent(root).content;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vba-record-'));
  writeFixtureContent(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function recordFor(entries: VbaRecordEntry[]): VbaRecord {
  return { tool: 'vba-verify', toolVersion: 1, excelVersion: '16.0', verifiedAt: '2026-10-20T00:00:00Z', entries };
}

describe('ハッシュ値（UT-HASH-01）', () => {
  it('ファイルの並び順に左右されず、改行が CRLF でも LF と同じ値になる', () => {
    const a = hashFiles([
      { path: 'content/b/Program.bas', content: 'x\n' },
      { path: 'content/a/Lamp.cls', content: 'y\n' },
    ]);
    const b = hashFiles([
      { path: 'content/a/Lamp.cls', content: 'y\r\n' },
      { path: 'content/b/Program.bas', content: 'x\r\n' },
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('大文字と小文字は文字コードの順に並べる（大文字が先）', () => {
    const upperFirst = hashFiles([
      { path: 'Z.bas', content: '1\n' },
      { path: 'a.bas', content: '2\n' },
    ]);
    expect(upperFirst).toBe(hashFiles([{ path: 'a.bas', content: '2\n' }, { path: 'Z.bas', content: '1\n' }]));
  });

  it('設問のコードは、ファイル名が変わればハッシュ値も変わる', () => {
    expect(hashSnippet('Lamp.cls', 'Option Explicit\n')).not.toBe(hashSnippet('Lamp.bas', 'Option Explicit\n'));
  });
});

describe('listVbaTargets', () => {
  it('設計・変更後・模範解答を実行の対象に、設問のコードをコンパイルの対象にする', () => {
    const targets = listVbaTargets(load());
    expect(targets.filter((target) => target.kind === 'run')).toHaveLength(10);
    expect(targets.filter((target) => target.kind === 'compile').map((target) => target.target)).toEqual([
      'content/concepts/sample/quiz/questions.yaml#sample.q09',
      'content/concepts/sample/quiz/questions.yaml#sample.q10',
    ]);
    expect(targets[0]).toMatchObject({
      target: 'content/concepts/sample/variations/unapplied/vba',
      expected: 'content/concepts/sample/expected-output.txt',
    });
  });

  it('期待結果だけを変えても、ハッシュ値が変わる', () => {
    const before = listVbaTargets(load())[0].hash;
    writeFileSync(join(root, 'concepts', 'sample', 'expected-output.txt'), '前照灯 点灯\n尾灯 消灯\n');
    expect(listVbaTargets(load())[0].hash).not.toBe(before);
  });
});

describe('findRecordProblems（UT-CHK-04）', () => {
  it('すべて確認済みなら問題なし', () => {
    const targets = listVbaTargets(load());
    const record = recordFor(targets.map((t) => ({ target: t.target, kind: t.kind, hash: t.hash, result: 'passed' })));
    expect(findRecordProblems(targets, record)).toEqual([]);
  });

  it('ハッシュ値の不一致・記録の欠け・失敗の記録を、それぞれ問題にする', () => {
    const targets = listVbaTargets(load());
    const entries: VbaRecordEntry[] = targets.map((t) => ({ target: t.target, kind: t.kind, hash: t.hash, result: 'passed' }));
    entries[0] = { ...entries[0], hash: 'sha256:old' };
    entries[1] = { ...entries[1], result: 'failed' };
    entries.splice(2, 1);
    expect(findRecordProblems(targets, recordFor(entries))).toEqual([
      `確認したあとに、ソースか期待結果が変わっています: ${targets[0].target}`,
      `確認に失敗しています: ${targets[1].target}`,
      `確認記録がありません: ${targets[2].target}`,
    ]);
    expect(findRecordProblems(targets, undefined)).toHaveLength(targets.length);
  });
});

describe('mergeRecord', () => {
  it('今回の結果で置き換え、教材からなくなった対象の記録は消す', () => {
    const targets = listVbaTargets(load());
    const previous = recordFor([
      { target: targets[0].target, kind: 'run', hash: 'sha256:old', result: 'failed' },
      { target: targets[1].target, kind: 'run', hash: targets[1].hash, result: 'passed' },
      { target: 'content/concepts/removed/variations/proper/vba', kind: 'run', hash: 'sha256:x', result: 'passed' },
    ]);
    const merged = mergeRecord(previous, [{ target: targets[0].target, kind: 'run', hash: targets[0].hash, result: 'passed' }], targets, '16.0.1', 'now');
    expect(merged.entries.map((entry) => `${entry.target}:${entry.result}`)).toEqual(
      [`${targets[0].target}:passed`, `${targets[1].target}:passed`].sort(),
    );
    expect(merged).toMatchObject({ excelVersion: '16.0.1', verifiedAt: 'now' });
  });
});

describe('judge', () => {
  const target = () => listVbaTargets(load())[0];

  it('出力が期待結果と一致すれば成功（改行は LF にそろえる）', () => {
    const t = target();
    expect(judge(t, { id: 0, compiled: true, ran: true, output: t.expectedOutput!.replace(/\n/g, '\r\n'), error: '', timedOut: false }).result).toBe('passed');
  });

  it('コンパイルエラー・時間切れ・出力の違いを失敗にする', () => {
    const t = target();
    expect(judge(t, { id: 0, compiled: false, ran: false, output: '', error: 'compile error', timedOut: false }).detail).toContain('コンパイルできませんでした');
    expect(judge(t, { id: 0, compiled: false, ran: false, output: '', error: '', timedOut: true }).detail).toContain('強制終了');
    expect(judge(t, { id: 0, compiled: true, ran: true, output: '前照灯 点灯\nERROR: 11 0 で除算しました。\n', error: '', timedOut: false }).detail).toContain(
      '出力が期待結果と違います（2 行目）',
    );
  });
});

it('確認記録のファイルは JSON として読める（初期状態）', () => {
  const record = JSON.parse(readFileSync('verification/vba.json', 'utf8')) as VbaRecord;
  expect(record.tool).toBe('vba-verify');
});
