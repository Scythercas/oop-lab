// VBA の確認対象の列挙、ハッシュ値、確認記録（詳細設計書 §7.2・§7.5・§7.6）。
// 対象の列挙とハッシュ値の計算は、VBA 確認ツールと CI の照合で、この1か所の実装を共有する。
import { createHash } from 'node:crypto';
import type { Content, SourceFile } from '../../src/content/loader.ts';

export const VBA_LANGUAGE_ID = 'vba';
export const RECORD_TOOL_VERSION = 1;

export type VbaTargetKind = 'run' | 'compile';

export interface VbaTarget {
  /** 確認記録の target。リポジトリのルートからの相対パス（設問は「questions.yaml#設問ID」） */
  target: string;
  kind: VbaTargetKind;
  files: SourceFile[];
  /** 期待結果のファイル（run のときだけ） */
  expected?: string;
  expectedOutput?: string;
  hash: string;
}

export interface VbaRecordEntry {
  target: string;
  kind: VbaTargetKind;
  expected?: string;
  hash: string;
  result: 'passed' | 'failed';
  detail?: string;
}

/** Excel を操作した結果（Invoke-VbaVerify.ps1 が書き出す） */
export interface ExcelResult {
  id: number;
  compiled: boolean;
  ran: boolean;
  output: string;
  error: string;
  timedOut: boolean;
}

export interface VbaRecord {
  tool: 'vba-verify';
  toolVersion: number;
  excelVersion: string;
  verifiedAt: string;
  entries: VbaRecordEntry[];
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** ファイル一式のハッシュ値: パスの文字コード順に「パス + 改行 + 内容の SHA-256 + 改行」をつなげた文字列の SHA-256 */
export function hashFiles(entries: { path: string; content: string }[]): string {
  const joined = [...entries]
    .sort((a, b) => compareOrdinal(a.path, b.path))
    .map((entry) => `${entry.path}\n${sha256(toLf(entry.content))}\n`)
    .join('');
  return `sha256:${sha256(joined)}`;
}

/** 設問のコードのハッシュ値: ファイル名と本文を改行でつないだ文字列の SHA-256 */
export function hashSnippet(fileName: string, content: string): string {
  return `sha256:${sha256(`${fileName}\n${toLf(content)}`)}`;
}

/**
 * 教材から VBA の確認対象を列挙する。
 * contentPath は、確認記録に書く教材のフォルダのパス（リポジトリのルートからの相対パス。既定は content）。
 */
export function listVbaTargets(content: Content, contentPath = 'content'): VbaTarget[] {
  const targets: VbaTarget[] = [];
  const addRun = (dir: string, files: SourceFile[] | undefined, expected: string, expectedOutput: string) => {
    const sources = files ?? [];
    targets.push({
      target: dir,
      kind: 'run',
      files: sources,
      expected,
      expectedOutput,
      hash: hashFiles([
        ...sources.map((file) => ({ path: `${dir}/${file.path}`, content: file.content })),
        { path: expected, content: expectedOutput },
      ]),
    });
  };

  for (const concept of content.concepts) {
    const base = `${contentPath}/concepts/${concept.folder}`;
    for (const design of concept.designs) {
      addRun(`${base}/variations/${design.kind}/${VBA_LANGUAGE_ID}`, design.code[VBA_LANGUAGE_ID], `${base}/expected-output.txt`, concept.expectedOutput);
    }
    for (const change of concept.changes) {
      for (const kind of concept.variations) {
        addRun(
          `${base}/changes/${change.name}/${kind}/${VBA_LANGUAGE_ID}`,
          change.code[kind]?.[VBA_LANGUAGE_ID],
          `${base}/changes/${change.name}/expected-output.txt`,
          change.expectedOutput,
        );
      }
    }
    for (const exercise of concept.exercises) {
      addRun(
        `${base}/exercises/${exercise.name}/answer/${VBA_LANGUAGE_ID}`,
        exercise.answer[VBA_LANGUAGE_ID],
        `${base}/exercises/${exercise.name}/expected-output.txt`,
        exercise.expectedOutput,
      );
    }
    for (const question of concept.questions) {
      const snippet = question.code?.[VBA_LANGUAGE_ID];
      if (snippet === undefined) continue;
      targets.push({
        target: `${base}/quiz/questions.yaml#${question.id}`,
        kind: 'compile',
        files: [{ path: snippet.fileName, content: snippet.content }],
        hash: hashSnippet(snippet.fileName, snippet.content),
      });
    }
  }
  return targets;
}

/** CI での照合（§7.6）: すべての対象に、ハッシュ値が一致し結果が passed の記録があるか。問題の一覧を返す */
export function findRecordProblems(targets: VbaTarget[], record: VbaRecord | undefined): string[] {
  const problems: string[] = [];
  for (const target of targets) {
    const entry = record?.entries.find((item) => item.target === target.target);
    if (entry === undefined) problems.push(`確認記録がありません: ${target.target}`);
    else if (entry.hash !== target.hash) problems.push(`確認したあとに、ソースか期待結果が変わっています: ${target.target}`);
    else if (entry.result !== 'passed') problems.push(`確認に失敗しています: ${target.target}`);
  }
  return problems;
}

/** 今回確かめた結果を前回の記録に合わせる。教材からなくなった対象の記録は消す */
export function mergeRecord(
  previous: VbaRecord | undefined,
  verified: VbaRecordEntry[],
  allTargets: VbaTarget[],
  excelVersion: string,
  verifiedAt: string,
): VbaRecord {
  const current = new Set(allTargets.map((target) => target.target));
  const replaced = new Set(verified.map((entry) => entry.target));
  const kept = (previous?.entries ?? []).filter((entry) => current.has(entry.target) && !replaced.has(entry.target));
  return {
    tool: 'vba-verify',
    toolVersion: RECORD_TOOL_VERSION,
    excelVersion,
    verifiedAt,
    entries: [...kept, ...verified].sort((a, b) => compareOrdinal(a.target, b.target)),
  };
}

/** Excel の結果を、期待結果と比べて判定する */
export function judge(target: VbaTarget, result: ExcelResult | undefined): VbaRecordEntry {
  const entry: VbaRecordEntry = { target: target.target, kind: target.kind, hash: target.hash, result: 'failed' };
  if (target.expected !== undefined) entry.expected = target.expected;
  if (result === undefined) return { ...entry, detail: '結果がありません' };
  if (result.timedOut) return { ...entry, detail: '時間内に終わらなかったため、Excel を強制終了しました' };
  if (!result.compiled) return { ...entry, detail: `コンパイルできませんでした${result.error ? `（${result.error}）` : ''}` };
  if (target.kind === 'compile') return { ...entry, result: 'passed' };
  if (!result.ran) return { ...entry, detail: `実行できませんでした（${result.error}）` };
  const actual = result.output.replace(/\r\n/g, '\n');
  if (actual !== target.expectedOutput) {
    const expectedLines = (target.expectedOutput ?? '').split('\n');
    const actualLines = actual.split('\n');
    const index = Math.max(0, expectedLines.findIndex((line, i) => line !== actualLines[i]));
    return {
      ...entry,
      detail: `出力が期待結果と違います（${index + 1} 行目）\n期待: ${JSON.stringify(expectedLines[index] ?? '')}\n実際: ${JSON.stringify(actualLines[index] ?? '')}`,
    };
  }
  return { ...entry, result: 'passed' };
}
