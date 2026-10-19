// VBA 確認記録の照合（詳細設計書 §7.6）。
// 使い方: node tools/ci/check-vba-record.ts [--content <教材のフォルダ>] [--record <確認記録>]
import { existsSync, readFileSync } from 'node:fs';
import { checkContent } from '../../src/content/validate.ts';
import { type VbaRecord, findRecordProblems, listVbaTargets } from '../vba-verify/vba-targets.ts';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const contentRoot = option('--content') ?? 'content';
const recordPath = option('--record') ?? 'verification/vba.json';

const { content, diagnostics } = checkContent(contentRoot);
if (diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
  console.error('教材の検証でエラーがあるため、照合しません（npm run content:check で確かめてください）');
  process.exit(1);
}

const targets = listVbaTargets(content, contentRoot.replace(/\\/g, '/').replace(/\/$/, ''));
const record = existsSync(recordPath) ? (JSON.parse(readFileSync(recordPath, 'utf8')) as VbaRecord) : undefined;
const problems = findRecordProblems(targets, record);

for (const problem of problems) console.error(`NG  ${problem}`);
if (problems.length > 0) {
  console.error(`VBA 確認記録の照合: ${targets.length} 件のうち ${problems.length} 件に問題があります（npm run vba:verify で確かめてください）`);
  process.exit(1);
}
console.log(`VBA 確認記録の照合: ${targets.length} 件すべて確認済み`);
