// ファイル単位・行単位の差分と修正量（詳細設計書 §4）。
// 画面の差分表示と修正量の数値は、この計算結果だけから作る（要件定義書 NFR-12）。
import { diffLines } from 'diff';
import { type SourceFile, compareOrdinal } from '../content/loader.ts';
import type { ChangeCounts, DiffMetrics, DiffRow, FileDiff, FileStatus, StateDiff } from '../domain/diff-view.ts';

// 型と表示用の計算は、ブラウザと共用するため src/domain/diff-view.ts に置く
export type { ChangeCounts, DiffMetrics, DiffRow, FileDiff, FileStatus, SideBySideRow, StateDiff } from '../domain/diff-view.ts';
export { pickInitialFile, toSideBySide } from '../domain/diff-view.ts';

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
