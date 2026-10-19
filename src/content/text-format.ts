// 教材ファイルの書式の検査（詳細設計書 §3.1、検証規則 V06）

const MAX_REPORTED_LINES = 5;

/**
 * UTF-8（BOM なし）・LF・末尾に改行1つ・行末の空白なし・タブなし、を満たすかを調べる。
 * 問題がなければ空の配列を返す。
 */
export function findFormatProblems(bytes: Uint8Array): string[] {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return ['先頭に BOM があります（BOM なしの UTF-8 にしてください）'];
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return ['UTF-8 として読めません'];
  }
  if (text.length === 0) {
    return ['空のファイルです'];
  }

  const problems: string[] = [];
  if (text.includes('\r')) {
    problems.push('改行が CR を含んでいます（LF にしてください）');
  }
  if (!text.endsWith('\n')) {
    problems.push('末尾に改行がありません');
  } else if (text.endsWith('\n\n')) {
    problems.push('末尾の改行が2つ以上あります');
  }

  const lines = text.replace(/\r/g, '').split('\n');
  const trailing: number[] = [];
  const tabs: number[] = [];
  lines.forEach((line, index) => {
    if (/[ \t]$/.test(line)) trailing.push(index + 1);
    if (line.includes('\t')) tabs.push(index + 1);
  });
  if (trailing.length > 0) problems.push(`行末に空白があります（${formatLines(trailing)}）`);
  if (tabs.length > 0) problems.push(`タブがあります（${formatLines(tabs)}。字下げは空白4つにしてください）`);
  return problems;
}

function formatLines(lines: number[]): string {
  const shown = lines.slice(0, MAX_REPORTED_LINES).join('・');
  return lines.length > MAX_REPORTED_LINES ? `${shown} 行目 ほか ${lines.length - MAX_REPORTED_LINES} 行` : `${shown} 行目`;
}

/** 行数（末尾の改行の後ろは数えない） */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}
