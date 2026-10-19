// 差分の型と、画面で差分を見せるための計算（詳細設計書 §4.6・§5.3）。
// 差分そのものはビルド時に src/build/diff.ts で計算し、ブラウザではこのモジュールだけを使う（jsdiff を配らないため）。

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

const REVERSED_STATUS: Record<FileStatus, FileStatus> = {
  added: 'deleted',
  deleted: 'added',
  modified: 'modified',
  unchanged: 'unchanged',
};

/**
 * 左右を入れ替えた差分（設計比較で、並び順の後ろの設計を左に選んだとき）。
 * 変わったかたまりの中は、削除の行を先に並べ直す（差分の表示を、計算した向きと同じ形にそろえるため）。
 */
export function reverseStateDiff(diff: StateDiff): StateDiff {
  const files = diff.files.map((file): FileDiff => {
    const rows: DiffRow[] = [];
    let removed: DiffRow[] = [];
    let added: DiffRow[] = [];
    const flush = () => {
      rows.push(...removed, ...added);
      removed = [];
      added = [];
    };
    for (const row of file.rows) {
      if (row.type === 'added') removed.push({ type: 'removed', oldLine: row.newLine });
      else if (row.type === 'removed') added.push({ type: 'added', newLine: row.oldLine });
      else {
        flush();
        rows.push({ type: 'context', oldLine: row.newLine, newLine: row.oldLine });
      }
    }
    flush();
    return {
      path: file.path,
      status: REVERSED_STATUS[file.status],
      rows,
      hunks: file.hunks,
      addedLines: file.removedLines,
      removedLines: file.addedLines,
    };
  });
  const { metrics } = diff;
  return { files, metrics: { ...metrics, addedLines: metrics.removedLines, removedLines: metrics.addedLines } };
}

/** 同じ状態どうしの差分（設計比較で、左右に同じ設計を選んだとき）。すべての行が変わらない行になる */
export function identicalStateDiff(files: { path: string; lineCount: number }[]): StateDiff {
  return {
    files: files.map((file) => ({
      path: file.path,
      status: 'unchanged',
      rows: Array.from({ length: file.lineCount }, (_, line) => ({ type: 'context', oldLine: line, newLine: line })),
      hunks: 0,
      addedLines: 0,
      removedLines: 0,
    })),
    metrics: { changedFiles: 0, hunks: 0, addedLines: 0, removedLines: 0, changedLines: 0 },
  };
}
