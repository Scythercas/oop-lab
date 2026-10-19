// 教材の検証を実行する（詳細設計書 §3.5）。
// 使い方: node tools/ci/validate-content.ts [教材のフォルダ（既定は content）]
import { formatDiagnostic } from '../../src/content/diagnostics.ts';
import { checkContent, formatSummary } from '../../src/content/validate.ts';

const root = process.argv[2] ?? 'content';
const result = checkContent(root);

for (const diagnostic of result.diagnostics) {
  const line = formatDiagnostic(diagnostic);
  if (diagnostic.level === 'error') console.error(line);
  else console.warn(line);
}

console.log(formatSummary(result.summary, result.content.languages));

const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === 'error').length;
const warnings = result.diagnostics.length - errors;
if (errors > 0) {
  console.error(`教材の検証: エラー ${errors} 件、警告 ${warnings} 件`);
  process.exit(1);
}
console.log(`教材の検証: エラーなし（警告 ${warnings} 件）`);
