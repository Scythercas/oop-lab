// VBA 確認ツールと Excel のつながり（テスト計画書 IT-06）。
// Excel が要るので、ユーザの PC で、環境変数 CHECK_LANG=vba を付けて動かす（CI では動かさない）。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ExcelResult, type VbaRecord, type VbaTarget, judge } from '../../tools/vba-verify/vba-targets';
import { writeFixtureContent } from '../fixtures/content-fixture';

const enabled = (process.env.CHECK_LANG ?? '').split(',').includes('vba');
let work: string;

beforeAll(() => {
  work = mkdtempSync(join(process.cwd(), '.vba-verify-test-'));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

function accessVbom(): string {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', "try { (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Excel\\Security' -Name AccessVBOM -ErrorAction Stop).AccessVBOM } catch { 'none' }"],
    { encoding: 'utf8' },
  );
  return result.stdout.trim();
}

function excelCount(): number {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '@(Get-Process EXCEL -ErrorAction SilentlyContinue).Count'], { encoding: 'utf8' });
  return Number(result.stdout.trim());
}

describe.runIf(enabled)('IT-06: VBA 確認ツール（Excel）', () => {
  it('テスト用の教材の VBA をすべて確かめ、確認記録が CI の照合を通る', () => {
    const content = join(work, 'content');
    writeFixtureContent(content);
    const record = join(work, 'vba.json');
    const contentArg = relative(process.cwd(), content);
    const verify = spawnSync(process.execPath, ['tools/vba-verify/verify.ts', '--content', contentArg, '--record', record], { encoding: 'utf8' });
    expect(verify.status, verify.stdout + verify.stderr).toBe(0);
    const saved = JSON.parse(readFileSync(record, 'utf8')) as VbaRecord;
    expect(saved.entries).toHaveLength(12);
    expect(saved.entries.every((entry) => entry.result === 'passed')).toBe(true);
    expect(saved.excelVersion).toMatch(/^16\./);

    const check = spawnSync(process.execPath, ['tools/ci/check-vba-record.ts', '--content', contentArg, '--record', record], { encoding: 'utf8' });
    expect(check.status, check.stdout + check.stderr).toBe(0);
    expect(accessVbom()).toBe('0');
    expect(excelCount()).toBe(0);
  }, 300_000);

  it('出力の違い・実行時エラー・コンパイルエラー・終わらない処理を、それぞれ失敗にする', () => {
    const program = (body: string) => `Option Explicit\n\nPublic Sub Main()\n${body}\nEnd Sub\n`;
    const cases: { name: string; kind: 'run' | 'compile'; files: Record<string, string>; expected: string }[] = [
      { name: 'ok', kind: 'run', files: { 'Program.bas': program('    Debug.Print "前照灯 点灯"') }, expected: '前照灯 点灯\n' },
      { name: 'mismatch', kind: 'run', files: { 'Program.bas': program('    Debug.Print "前照灯 消灯"') }, expected: '前照灯 点灯\n' },
      { name: 'not-string', kind: 'run', files: { 'Program.bas': program('    Debug.Print 3') }, expected: '3\n' },
      { name: 'runtime', kind: 'run', files: { 'Program.bas': program('    Dim x As Long\n    x = 1 / 0') }, expected: '' },
      { name: 'compile', kind: 'run', files: { 'Program.bas': program('    undefinedVariable = 1') }, expected: '' },
      { name: 'endless', kind: 'run', files: { 'Program.bas': program('    Do While True\n    Loop') }, expected: '' },
      { name: 'snippet', kind: 'compile', files: { 'Lamp.cls': 'Option Explicit\n\nPublic LampName As String\n' }, expected: '' },
    ];
    const targets: VbaTarget[] = [];
    const manifest = {
      targets: cases.map((testCase, id) => {
        const dir = join(work, 'cases', testCase.name);
        mkdirSync(dir, { recursive: true });
        for (const [name, source] of Object.entries(testCase.files)) writeFileSync(join(dir, name), source);
        targets.push({
          target: testCase.name,
          kind: testCase.kind,
          files: Object.entries(testCase.files).map(([path, content]) => ({ path, content })),
          expected: testCase.kind === 'run' ? 'expected' : undefined,
          expectedOutput: testCase.expected,
          hash: 'sha256:test',
        });
        return { id, kind: testCase.kind, target: testCase.name, dir, files: Object.keys(testCase.files) };
      }),
    };
    const manifestPath = join(work, 'manifest.json');
    const resultsPath = join(work, 'results.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const run = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/vba-verify/Invoke-VbaVerify.ps1', '-Manifest', manifestPath, '-Results', resultsPath, '-TimeoutSec', '10'],
      { encoding: 'utf8' },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const results = JSON.parse(readFileSync(resultsPath, 'utf8').replace(/^\uFEFF/, '')) as { targets: ExcelResult[] };
    const verdicts = Object.fromEntries(cases.map((testCase, id) => [testCase.name, judge(targets[id], results.targets.find((r) => r.id === id))]));

    expect(verdicts.ok.result).toBe('passed');
    expect(verdicts.mismatch.detail).toContain('出力が期待結果と違います');
    expect(verdicts['not-string'].detail).toContain('Debug.Print に文字列以外（Integer）');
    expect(verdicts.runtime.detail).toContain('ERROR: 11');
    expect(verdicts.compile.detail).toContain('コンパイルできませんでした');
    expect(verdicts.endless.detail).toContain('強制終了');
    expect(verdicts.snippet.result).toBe('passed');
    expect(accessVbom()).toBe('0');
    expect(excelCount()).toBe(0);
  }, 300_000);
});
