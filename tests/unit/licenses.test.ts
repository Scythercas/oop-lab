import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listProductionLicenses, normalizeLicense } from '../../src/build/licenses';

function writePackage(dir: string, content: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content));
}

describe('normalizeLicense', () => {
  it('文字列はそのまま返す', () => {
    expect(normalizeLicense('MIT')).toBe('MIT');
  });

  it('古い書式のオブジェクトと配列にも対応する', () => {
    expect(normalizeLicense({ type: 'ISC' })).toBe('ISC');
    expect(normalizeLicense([{ type: 'MIT' }, 'Apache-2.0'])).toBe('(MIT OR Apache-2.0)');
  });

  it('書かれていなければ「不明」にする', () => {
    expect(normalizeLicense(undefined)).toBe('不明');
    expect(normalizeLicense('')).toBe('不明');
  });
});

describe('listProductionLicenses', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'licenses-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('dependencies とその依存先をすべてたどり、devDependencies は含めない', () => {
    writePackage(root, {
      dependencies: { a: '1', '@scope/b': '1' },
      devDependencies: { 'dev-only': '1' },
    });
    writePackage(join(root, 'node_modules', 'a'), { version: '1.0.0', license: 'MIT', dependencies: { c: '2' } });
    writePackage(join(root, 'node_modules', '@scope', 'b'), {
      version: '1.1.0',
      license: { type: 'ISC' },
      dependencies: { c: '1' },
    });
    writePackage(join(root, 'node_modules', 'c'), { version: '1.0.0', license: 'Apache-2.0' });
    // a だけが別の版の c を使う（入れ子の node_modules）
    writePackage(join(root, 'node_modules', 'a', 'node_modules', 'c'), { version: '2.0.0', license: 'BSD-3-Clause' });
    writePackage(join(root, 'node_modules', 'dev-only'), { version: '9.9.9', license: 'MIT' });

    expect(listProductionLicenses(root)).toEqual([
      { name: '@scope/b', version: '1.1.0', license: 'ISC' },
      { name: 'a', version: '1.0.0', license: 'MIT' },
      { name: 'c', version: '1.0.0', license: 'Apache-2.0' },
      { name: 'c', version: '2.0.0', license: 'BSD-3-Clause' },
    ]);
  });

  it('入っていない任意の依存は飛ばす', () => {
    writePackage(root, { dependencies: { a: '1' } });
    writePackage(join(root, 'node_modules', 'a'), {
      version: '1.0.0',
      license: 'MIT',
      optionalDependencies: { 'platform-binary': '1' },
    });

    expect(listProductionLicenses(root)).toEqual([{ name: 'a', version: '1.0.0', license: 'MIT' }]);
  });

  it('必須の依存が見つからなければ失敗する', () => {
    writePackage(root, { dependencies: { missing: '1' } });

    expect(() => listProductionLicenses(root)).toThrow('依存ライブラリが見つかりません: missing');
  });
});
