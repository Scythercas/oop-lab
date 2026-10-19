// 教材のコードの実行確認を行う（詳細設計書 §8.1）。
// 使い方: node tools/ci/run-code-checks.ts --lang <java|cpp> [--content <教材のフォルダ>]
import { formatDiagnostic } from '../../src/content/diagnostics.ts';
import { checkContent } from '../../src/content/validate.ts';
import {
  type CheckResult,
  checkRunTarget,
  checkSyntaxTarget,
  collectRunTargets,
  collectSyntaxTargets,
  repositoryRoot,
} from './code-checks.ts';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const languageId = option('--lang');
const contentRoot = option('--content') ?? 'content';
if (languageId === undefined) {
  console.error('使い方: node tools/ci/run-code-checks.ts --lang <言語 ID> [--content <教材のフォルダ>]');
  process.exit(2);
}

const { content, diagnostics } = checkContent(contentRoot);
const contentErrors = diagnostics.filter((diagnostic) => diagnostic.level === 'error');
if (contentErrors.length > 0) {
  for (const diagnostic of contentErrors) console.error(formatDiagnostic(diagnostic));
  console.error('教材の検証でエラーがあるため、実行確認をしません（npm run content:check で確かめてください）');
  process.exit(1);
}

const language = content.languages.find((item) => item.id === languageId);
if (language === undefined || language.check !== 'ci') {
  console.error(`「${languageId}」は CI で実行確認する言語ではありません`);
  process.exit(2);
}

const root = repositoryRoot();
const results: CheckResult[] = [];
const runTargets = collectRunTargets(content, language.id);
const syntaxTargets = collectSyntaxTargets(content, language.id);
for (const target of runTargets) results.push(checkRunTarget(target, language, root));
for (const target of syntaxTargets) results.push(checkSyntaxTarget(target, language, root));

for (const result of results) {
  console.log(`${result.ok ? 'OK ' : 'NG '} ${result.label}`);
  if (!result.ok) console.log(result.detail.replace(/^/gm, '    '));
}
const failed = results.filter((result) => !result.ok).length;
console.log(
  `${language.label} の実行確認: 実行 ${runTargets.length} 件・文法の確認 ${syntaxTargets.length} 件のうち、失敗 ${failed} 件`,
);
process.exit(failed > 0 ? 1 : 0);
