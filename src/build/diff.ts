// ファイル単位・行単位の差分と修正量（詳細設計書 §4）。
// 画面の差分表示と修正量の数値は、この計算結果だけから作る（要件定義書 NFR-12）。
import { diffLines } from 'diff';
import { type SourceFile, compareOrdinal } from '../content/loader.ts';

export type FileStatus = 'added' | 'deleted' | 'modified' | 'unchanged';

/** 差分の1行。行番号は 0 から数える */
export type DiffRow =
  | { type: 'context'; oldLine: number; newLine: number }
  | { type: 'removed'; oldLine: number }
  | { type: 'added'; newLine: number };

export interface ChangeCounts {
  /** 変更箇所数: 変わった行が連続しているかたまりの数 */
  hunks: number;
  addedLines: number;
  removedLines: number;
}

export interface FileDiff extends ChangeCounts {
  path: string;
  status: FileStatus;
  rows: DiffRow[];
}

export interface DiffMetrics extends ChangeCounts {
  /** 追加・削除・変更されたファイルの数 */
  changedFiles: number;
  /** 修正行数 = 追加行数 + 削除行数。比較と期待の照合（B01）に使う */
  changedLines: number;
}

export interface StateDiff {
  files: FileDiff[];
  metrics: DiffMetrics;
}

/** 左右に並べて表示するときの1行（§4.6）。行の番号がない側は空の行 */
export interface SideBySideRow {
  left?: { line: number; changed: boolean };
  right?: { line: number; changed: boolean };
}

export function splitLines(content: string): string[] {
  if (content === '') return [];
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function diffFile(path: string, before: string | undefined, after: string | undefined): FileDiff {
  const rows: DiffRow[] = [];
  if (before === undefined) {
    splitLines(after ?? '').forEach((_, newLine) => rows.push({ type: 'added', newLine }));
  } else if (after === undefined) {
    splitLines(before).forEach((_, oldLine) => rows.push({ type: 'removed', oldLine }));
  } else {
    let oldLine = 0;
    let newLine = 0;
    for (const part of diffLines(before, after)) {
      const count = part.count ?? splitLines(part.value).length;
      for (let i = 0; i < count; i += 1) {
        if (part.added) rows.push({ type: 'added', newLine: newLine++ });
        else if (part.removed) rows.push({ type: 'removed', oldLine: oldLine++ });
        else rows.push({ type: 'context', oldLine: oldLine++, newLine: newLine++ });
      }
    }
  }

  const counts = countChanges(rows);
  let status: FileStatus = 'modified';
  if (before === undefined) status = 'added';
  else if (after === undefined) status = 'deleted';
  else if (counts.addedLines + counts.removedLines === 0) status = 'unchanged';
  return { path, status, rows, ...counts };
}

function countChanges(rows: DiffRow[]): ChangeCounts {
  let hunks = 0;
  let addedLines = 0;
  let removedLines = 0;
  let inHunk = false;
  for (const row of rows) {
    if (row.type === 'context') {
      inHunk = false;
      continue;
    }
    if (!inHunk) hunks += 1;
    inHunk = true;
    if (row.type === 'added') addedLines += 1;
    else removedLines += 1;
  }
  return { hunks, addedLines, removedLines };
}

/** 2つの状態のファイルを、同じ相対パスどうしで対応づけて差分をとる（§4.2） */
export function diffStates(before: SourceFile[], after: SourceFile[]): StateDiff {
  const beforeByPath = new Map(before.map((file) => [file.path, file.content]));
  const afterByPath = new Map(after.map((file) => [file.path, file.content]));
  const paths = [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort(compareOrdinal);
  const files = paths.map((path) => diffFile(path, beforeByPath.get(path), afterByPath.get(path)));
  const metrics = files.reduce<DiffMetrics>(
    (sum, file) => ({
      changedFiles: sum.changedFiles + (file.status === 'unchanged' ? 0 : 1),
      hunks: sum.hunks + file.hunks,
      addedLines: sum.addedLines + file.addedLines,
      removedLines: sum.removedLines + file.removedLines,
      changedLines: sum.changedLines + file.addedLines + file.removedLines,
    }),
    { changedFiles: 0, hunks: 0, addedLines: 0, removedLines: 0, changedLines: 0 },
  );
  return { files, metrics };
}

/** 変わらない行を左右の同じ高さに置き、変わったかたまりは削除を左・追加を右に上から並べる（§4.6） */
export function toSideBySide(rows: DiffRow[]): SideBySideRow[] {
  const result: SideBySideRow[] = [];
  let removed: number[] = [];
  let added: number[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i += 1) {
      const row: SideBySideRow = {};
      if (i < removed.length) row.left = { line: removed[i], changed: true };
      if (i < added.length) row.right = { line: added[i], changed: true };
      result.push(row);
    }
    removed = [];
    added = [];
  };
  for (const row of rows) {
    if (row.type === 'removed') removed.push(row.oldLine);
    else if (row.type === 'added') added.push(row.newLine);
    else {
      flush();
      result.push({ left: { line: row.oldLine, changed: false }, right: { line: row.newLine, changed: false } });
    }
  }
  flush();
  return result;
}

/** 最初に表示するファイル: 変更行数が最も多いもの。同じなら相対パスの文字コード順で先のもの（§5.3） */
export function pickInitialFile(diff: StateDiff): string | undefined {
  let best: FileDiff | undefined;
  for (const file of diff.files) {
    const lines = file.addedLines + file.removedLines;
    if (best === undefined || lines > best.addedLines + best.removedLines) best = file;
  }
  return best?.path;
}
