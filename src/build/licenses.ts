import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** 依存ライブラリ1つ分のライセンス情報 */
export interface PackageLicense {
  name: string;
  version: string;
  license: string;
}

interface PackageJson {
  version?: string;
  license?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const UNKNOWN = '不明';

function readPackageJson(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
}

/** package.json の license 項目を表示用の文字列にそろえる（古い書式のオブジェクトや配列にも対応する） */
export function normalizeLicense(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const parts = value.map(normalizeLicense).filter((part) => part !== UNKNOWN);
    return parts.length > 0 ? `(${parts.join(' OR ')})` : UNKNOWN;
  }
  if (typeof value === 'object' && value !== null && 'type' in value) {
    return normalizeLicense(value.type);
  }
  return UNKNOWN;
}

/** fromDir から上のフォルダへ向かって node_modules を探す（Node.js の解決の順番に合わせる） */
function resolvePackageDir(name: string, fromDir: string, rootDir: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (dir === rootDir || parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * 本番で使う依存ライブラリ（package.json の dependencies と、その依存先すべて）のライセンス一覧を作る。
 * 名前と版の組で重複を除き、名前の文字コード順に並べる（詳細設計書 §10）。
 */
export function listProductionLicenses(rootDir: string = process.cwd()): PackageLicense[] {
  const root = resolve(rootDir);
  const found = new Map<string, PackageLicense>();
  const visited = new Set<string>();
  const queue: { name: string; fromDir: string; optional: boolean }[] = [];

  const enqueue = (pkg: PackageJson, fromDir: string) => {
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      queue.push({ name, fromDir, optional: false });
    }
    for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
      queue.push({ name, fromDir, optional: true });
    }
  };

  enqueue({ dependencies: readPackageJson(root).dependencies }, root);
  while (queue.length > 0) {
    const { name, fromDir, optional } = queue.shift()!;
    const dir = resolvePackageDir(name, fromDir, root);
    if (dir === undefined) {
      // 任意の依存（環境ごとのバイナリなど）は、入っていないことがある
      if (optional) continue;
      throw new Error(`依存ライブラリが見つかりません: ${name}（${fromDir} から）`);
    }
    if (visited.has(dir)) continue;
    visited.add(dir);

    const pkg = readPackageJson(dir);
    const version = pkg.version ?? UNKNOWN;
    found.set(`${name}@${version}`, { name, version, license: normalizeLicense(pkg.license) });
    enqueue(pkg, dir);
  }

  return [...found.values()].sort((a, b) => compareOrdinal(a.name, b.name) || compareOrdinal(a.version, b.version));
}

function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
