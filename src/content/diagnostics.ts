// 教材の検証で見つかった問題（詳細設計書 §3.5）

/** 検証規則の番号。V01〜V13 は教材の検証、B01 はビルド時の検証 */
export type RuleId = 'V01' | 'V02' | 'V03' | 'V04' | 'V05' | 'V06' | 'V07' | 'V08' | 'V09' | 'V10' | 'V11' | 'V12' | 'V13' | 'B01';

export interface Diagnostic {
  rule: RuleId;
  /** error はビルドを止め、warning は止めない */
  level: 'error' | 'warning';
  /** 教材のフォルダからの相対パス（/ 区切り） */
  file: string;
  message: string;
}

export class DiagnosticList {
  readonly items: Diagnostic[] = [];

  error(rule: RuleId, file: string, message: string): void {
    this.items.push({ rule, level: 'error', file, message });
  }

  warning(rule: RuleId, file: string, message: string): void {
    this.items.push({ rule, level: 'warning', file, message });
  }

  get errorCount(): number {
    return this.items.filter((item) => item.level === 'error').length;
  }
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const level = diagnostic.level === 'error' ? 'エラー' : '警告';
  return `[${diagnostic.rule} ${level}] ${diagnostic.file}: ${diagnostic.message}`;
}
