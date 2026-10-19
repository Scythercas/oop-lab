// 差分と修正量（テスト計画書 UT-DIFF-01〜07）
import { describe, expect, it } from 'vitest';
import { type DiffRow, diffFile, diffStates, pickInitialFile, toSideBySide } from '../../src/build/diff';

const lines = (...items: string[]) => `${items.join('\n')}\n`;

describe('diffFile', () => {
  it('UT-DIFF-01: 同じ内容なら「変更なし」で修正量は0', () => {
    const diff = diffFile('A.java', lines('a', 'b'), lines('a', 'b'));
    expect(diff).toMatchObject({ status: 'unchanged', hunks: 0, addedLines: 0, removedLines: 0 });
  });

  it('UT-DIFF-02: 1行の書き換えは、変更箇所1・追加1・削除1', () => {
    const diff = diffFile('A.java', lines('a', 'b', 'c'), lines('a', 'B', 'c'));
    expect(diff).toMatchObject({ status: 'modified', hunks: 1, addedLines: 1, removedLines: 1 });
    expect(diff.rows).toEqual<DiffRow[]>([
      { type: 'context', oldLine: 0, newLine: 0 },
      { type: 'removed', oldLine: 1 },
      { type: 'added', newLine: 1 },
      { type: 'context', oldLine: 2, newLine: 2 },
    ]);
  });

  it('UT-DIFF-03: 隣り合う削除と追加は1箇所、離れた2つの変更は2箇所', () => {
    expect(diffFile('A', lines('a', 'b', 'c', 'd'), lines('a', 'x', 'y', 'd')).hunks).toBe(1);
    expect(diffFile('A', lines('a', 'b', 'c', 'd', 'e'), lines('A', 'b', 'c', 'd', 'E')).hunks).toBe(2);
  });

  it('UT-DIFF-04: 追加・削除されたファイルは1箇所で、全行を数える', () => {
    expect(diffFile('New.java', undefined, lines('a', 'b', 'c'))).toMatchObject({ status: 'added', hunks: 1, addedLines: 3, removedLines: 0 });
    expect(diffFile('Old.java', lines('a', 'b'), undefined)).toMatchObject({ status: 'deleted', hunks: 1, addedLines: 0, removedLines: 2 });
  });

  it('UT-DIFF-05: 空行の追加・削除も数える', () => {
    expect(diffFile('A', lines('a', 'b'), lines('a', '', 'b'))).toMatchObject({ hunks: 1, addedLines: 1, removedLines: 0 });
  });
});

describe('diffStates', () => {
  it('ファイルを相対パスで対応づけ、変更ファイル数に追加・削除したファイルも数える', () => {
    const diff = diffStates(
      [
        { path: 'Main.java', content: lines('a', 'b') },
        { path: 'Old.java', content: lines('x') },
        { path: 'Same.java', content: lines('s') },
      ],
      [
        { path: 'Main.java', content: lines('a', 'B') },
        { path: 'New.java', content: lines('y', 'z') },
        { path: 'Same.java', content: lines('s') },
      ],
    );
    expect(diff.files.map((file) => `${file.path}:${file.status}`)).toEqual([
      'Main.java:modified',
      'New.java:added',
      'Old.java:deleted',
      'Same.java:unchanged',
    ]);
    expect(diff.metrics).toEqual({ changedFiles: 3, hunks: 3, addedLines: 3, removedLines: 2, changedLines: 5 });
  });

  it('UT-DIFF-07: 差分の行から数えた数と、修正量の数値が一致する', () => {
    const diff = diffStates(
      [{ path: 'A', content: lines('1', '2', '3', '4', '5', '6') }],
      [
        { path: 'A', content: lines('1', 'x', '3', '4', 'y', 'z', '6') },
        { path: 'B', content: lines('b') },
      ],
    );
    const rows = diff.files.flatMap((file) => file.rows);
    expect(diff.metrics.addedLines).toBe(rows.filter((row) => row.type === 'added').length);
    expect(diff.metrics.removedLines).toBe(rows.filter((row) => row.type === 'removed').length);
    expect(diff.metrics.changedLines).toBe(diff.metrics.addedLines + diff.metrics.removedLines);
  });
});

describe('toSideBySide', () => {
  it('UT-DIFF-06: 変わらない行は同じ高さにそろえ、行数の少ない側に空の行を入れる', () => {
    const diff = diffFile('A', lines('a', 'b', 'c'), lines('a', 'x', 'y', 'c'));
    expect(toSideBySide(diff.rows)).toEqual([
      { left: { line: 0, changed: false }, right: { line: 0, changed: false } },
      { left: { line: 1, changed: true }, right: { line: 1, changed: true } },
      { right: { line: 2, changed: true } },
      { left: { line: 2, changed: false }, right: { line: 3, changed: false } },
    ]);
  });
});

describe('pickInitialFile', () => {
  it('変更行数が最も多いファイル。同じなら文字コード順で先のもの', () => {
    const diff = diffStates(
      [
        { path: 'b.h', content: lines('1') },
        { path: 'a.h', content: lines('1') },
        { path: 'c.h', content: lines('1', '2') },
      ],
      [
        { path: 'b.h', content: lines('2') },
        { path: 'a.h', content: lines('2') },
        { path: 'c.h', content: lines('1', '2') },
      ],
    );
    expect(pickInitialFile(diff)).toBe('a.h');
  });
});
