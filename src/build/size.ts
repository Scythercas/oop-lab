// 設計の規模（詳細設計書 §4.5、要件定義書 FR-035）
import { extname } from 'node:path';
import type { SourceFile } from '../content/loader.ts';
import type { Language } from '../content/schema.ts';

export interface SizeMetrics {
  files: number;
  classes: number;
  /** 空行を除いた行の数 */
  lines: number;
}

export function measureSize(files: SourceFile[], language: Language): SizeMetrics {
  let classes = 0;
  let lines = 0;
  const pattern = 'pattern' in language.classCount ? new RegExp(language.classCount.pattern) : undefined;
  for (const file of files) {
    const fileLines = file.content.split('\n').filter((line) => line.trim() !== '');
    lines += fileLines.length;
    if (pattern !== undefined) {
      classes += fileLines.filter((line) => pattern.test(line)).length;
    } else if ('fileExtension' in language.classCount && extname(file.path) === language.classCount.fileExtension) {
      classes += 1;
    }
  }
  return { files: files.length, classes, lines };
}
