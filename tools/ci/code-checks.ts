// Java・C++ の教材コードの実行確認（詳細設計書 §8）。
// languages.yaml のコマンドでビルド・実行し、標準出力を期待結果と照合する。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Content, SourceFile } from '../../src/content/loader.ts';
import type { Language } from '../../src/content/schema.ts';

const BUILD_TIMEOUT_MS = 120_000;
const RUN_TIMEOUT_MS = 10_000;

/** 実行して確かめる対象（設計・変更後・模範解答の、1言語分） */
export interface RunTarget {
  label: string;
  files: SourceFile[];
  expectedOutput: string;
}

/** 文法だけを確かめる対象（コード読解の設問のコード） */
export interface SyntaxTarget {
  label: string;
  file: SourceFile;
}

export interface CheckResult {
  label: string;
  ok: boolean;
  /** 失敗の理由（成功のときは空） */
  detail: string;
}

export function collectRunTargets(content: Content, languageId: string): RunTarget[] {
  const targets: RunTarget[] = [];
  for (const concept of content.concepts) {
    const base = `concepts/${concept.folder}`;
    for (const design of concept.designs) {
      targets.push({
        label: `${base}/variations/${design.kind}/${languageId}`,
        files: design.code[languageId] ?? [],
        expectedOutput: concept.expectedOutput,
      });
    }
    for (const change of concept.changes) {
      for (const kind of concept.variations) {
        targets.push({
          label: `${base}/changes/${change.name}/${kind}/${languageId}`,
          files: change.code[kind]?.[languageId] ?? [],
          expectedOutput: change.expectedOutput,
        });
      }
    }
    for (const exercise of concept.exercises) {
      targets.push({
        label: `${base}/exercises/${exercise.name}/answer/${languageId}`,
        files: exercise.answer[languageId] ?? [],
        expectedOutput: exercise.expectedOutput,
      });
    }
  }
  return targets;
}

export function collectSyntaxTargets(content: Content, languageId: string): SyntaxTarget[] {
  return content.concepts.flatMap((concept) =>
    concept.questions.flatMap((question) => {
      const snippet = question.code?.[languageId];
      return snippet === undefined
        ? []
        : [{ label: `concepts/${concept.folder}/quiz/questions.yaml#${question.id}`, file: { path: snippet.fileName, content: snippet.content } }];
    }),
  );
}

interface CommandContext {
  out: string;
  sources: string[];
  files: string[];
}

/** コマンドの雛形の {out}・{sources}・{files} を置き換え、実行するプログラムと引数に分ける（詳細設計書 §3.2） */
export function expandCommand(template: string, context: CommandContext): string[] {
  return template
    .trim()
    .split(/\s+/)
    .flatMap((token) => {
      if (token === '{sources}') return context.sources;
      if (token === '{files}') return context.files;
      return [token.replaceAll('{out}', context.out)];
    });
}

function run(argv: string[], cwd: string, timeout: number) {
  const [command, ...args] = argv;
  return spawnSync(command, args, { cwd, encoding: 'utf8', timeout });
}

function prepare(files: SourceFile[], language: Language): { dir: string; context: CommandContext } {
  const dir = mkdtempSync(join(tmpdir(), `code-check-${language.id}-`));
  const out = join(dir, 'out');
  mkdirSync(out);
  const paths = files.map((file) => {
    const path = join(dir, file.path);
    writeFileSync(path, file.content);
    return path;
  });
  const compileExtensions = language.compileExtensions ?? language.extensions;
  const sources = paths.filter((path) => compileExtensions.includes(extname(path)));
  return { dir, context: { out, sources, files: paths } };
}

function failure(label: string, step: string, result: ReturnType<typeof run>): CheckResult {
  if (result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT') {
    return { label, ok: false, detail: `${step}が時間内に終わりませんでした` };
  }
  if (result.error) return { label, ok: false, detail: `${step}を実行できませんでした: ${result.error.message}` };
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { label, ok: false, detail: `${step}に失敗しました（終了コード ${result.status ?? result.signal}）\n${output}` };
}

/** 1つの対象をビルド・実行し、標準出力を期待結果と比べる（改行は LF にそろえる） */
export function checkRunTarget(target: RunTarget, language: Language, repoRoot: string): CheckResult {
  if (language.commands === undefined) throw new Error(`${language.label} には実行確認のコマンドがありません`);
  const { dir, context } = prepare(target.files, language);
  try {
    const build = run(expandCommand(language.commands.build, context), repoRoot, BUILD_TIMEOUT_MS);
    if (build.error || build.status !== 0) return failure(target.label, 'ビルド', build);
    const execution = run(expandCommand(language.commands.run, context), repoRoot, RUN_TIMEOUT_MS);
    if (execution.error || execution.status !== 0) return failure(target.label, '実行', execution);
    const actual = (execution.stdout ?? '').replace(/\r\n/g, '\n');
    if (actual !== target.expectedOutput) {
      return { label: target.label, ok: false, detail: describeMismatch(target.expectedOutput, actual) };
    }
    return { label: target.label, ok: true, detail: '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 設問のコードがコンパイルできるか（実行はしない。要件定義書 CR-09・DQ2） */
export function checkSyntaxTarget(target: SyntaxTarget, language: Language, repoRoot: string): CheckResult {
  if (language.commands === undefined) throw new Error(`${language.label} には文法確認のコマンドがありません`);
  const { dir, context } = prepare([target.file], language);
  try {
    const result = run(expandCommand(language.commands.syntaxCheck, context), repoRoot, BUILD_TIMEOUT_MS);
    if (result.error || result.status !== 0) return failure(target.label, '文法の確認', result);
    return { label: target.label, ok: true, detail: '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function describeMismatch(expected: string, actual: string): string {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const index = expectedLines.findIndex((line, i) => line !== actualLines[i]);
  const at = index < 0 ? Math.min(expectedLines.length, actualLines.length) : index;
  return [
    `出力が期待結果と違います（${at + 1} 行目）`,
    `  期待: ${JSON.stringify(expectedLines[at] ?? '（行なし）')}`,
    `  実際: ${JSON.stringify(actualLines[at] ?? '（行なし）')}`,
  ].join('\n');
}

/** コマンドはリポジトリのルートで実行する（C++ のビルドが tools/ci/alloc_guard.cpp を参照するため） */
export function repositoryRoot(): string {
  return resolve(process.cwd());
}
