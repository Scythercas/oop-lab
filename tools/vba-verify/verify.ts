// VBA 確認ツール（詳細設計書 §7、ADR-0005）。ユーザの PC（Windows・Excel）で動かす。
// 使い方: npm run vba:verify [-- --concept <概念ID>] [--timeout <秒>] [--content <教材のフォルダ>] [--record <確認記録>]
// 対象の列挙・期待結果との照合・確認記録の更新はここで行い、Excel の操作は PowerShell（Invoke-VbaVerify.ps1）に任せる。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { formatDiagnostic } from '../../src/content/diagnostics.ts';
import { checkContent } from '../../src/content/validate.ts';
import { type ExcelResult, type VbaRecord, judge, listVbaTargets, mergeRecord } from './vba-targets.ts';

interface ExcelResults {
  excelVersion: string;
  accessVbomWasEnabled: boolean;
  targets: ExcelResult[];
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const contentRoot = option('--content') ?? 'content';
const recordPath = option('--record') ?? 'verification/vba.json';
const concept = option('--concept');
const timeout = option('--timeout') ?? '30';

if (process.platform !== 'win32') {
  console.error('VBA 確認ツールは Windows（Excel のある PC）でだけ動きます');
  process.exit(2);
}

const { content, diagnostics } = checkContent(contentRoot);
const contentErrors = diagnostics.filter((diagnostic) => diagnostic.level === 'error');
if (contentErrors.length > 0) {
  for (const diagnostic of contentErrors) console.error(formatDiagnostic(diagnostic));
  console.error('教材の検証でエラーがあるため、VBA を確認しません');
  process.exit(1);
}

const contentPath = relative(process.cwd(), resolve(contentRoot)).split('\\').join('/');
const allTargets = listVbaTargets(content, contentPath);
const targets = concept === undefined ? allTargets : allTargets.filter((target) => target.target.startsWith(`${contentPath}/concepts/${concept}/`));
if (targets.length === 0) {
  console.log('確認する VBA のコードがありません');
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'vba-verify-'));
try {
  const manifest = {
    targets: targets.map((target, id) => {
      const dir = join(work, String(id));
      mkdirSync(dir);
      for (const file of target.files) writeFileSync(join(dir, file.path), file.content);
      return { id, kind: target.kind, target: target.target, dir, files: target.files.map((file) => file.path) };
    }),
  };
  const manifestPath = join(work, 'manifest.json');
  const resultsPath = join(work, 'results.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));

  console.log(`Excel で ${targets.length} 件の VBA を確かめます（Excel を操作するあいだ、Excel のブックを開かないでください）`);
  const script = join(import.meta.dirname, 'Invoke-VbaVerify.ps1');
  const child = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Manifest', manifestPath, '-Results', resultsPath, '-TimeoutSec', timeout],
    { stdio: 'inherit' },
  );
  if (child.status !== 0 || !existsSync(resultsPath)) {
    console.error('Excel の操作に失敗しました');
    process.exit(1);
  }

  const results = JSON.parse(readFileSync(resultsPath, 'utf8').replace(/^\uFEFF/, '')) as ExcelResults;
  if (results.accessVbomWasEnabled) {
    console.warn('注意: 確認の前から「VBA プロジェクト オブジェクト モデルへのアクセスを信頼する」が有効でした。確認後は無効に戻しています');
  }
  const entries = targets.map((target, id) => judge(target, results.targets.find((item) => item.id === id)));
  for (const entry of entries) {
    console.log(`${entry.result === 'passed' ? 'OK ' : 'NG '} ${entry.target}`);
    if (entry.detail !== undefined) console.log(entry.detail.replace(/^/gm, '    '));
  }

  const previous = existsSync(recordPath) ? (JSON.parse(readFileSync(recordPath, 'utf8')) as VbaRecord) : undefined;
  const record = mergeRecord(previous, entries, allTargets, results.excelVersion, new Date().toISOString());
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  const failed = entries.filter((entry) => entry.result === 'failed').length;
  console.log(`VBA の確認: ${entries.length} 件のうち、失敗 ${failed} 件（確認記録: ${recordPath}）`);
  process.exitCode = failed > 0 ? 1 : 0;
} finally {
  rmSync(work, { recursive: true, force: true });
}
