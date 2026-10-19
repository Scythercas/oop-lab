// VBA の書き方の検査（検証規則 V10、教材コンテンツ仕様書 §1.3）。
// Debug.Print の式が文字列かどうかは静的には分からないため、VBA 確認ツールが実行時に確かめる（詳細設計書 §7.3）。

const LABEL_LINE = /^\s*[A-Za-z_][A-Za-z0-9_]*:\s*$/;

/** 文字列の中身を空にし、コメントを取り除いた行を返す（文字列やコメントの中の記号を誤って拾わないため） */
export function stripStringsAndComment(line: string): string {
  let result = '';
  let inString = false;
  for (const char of line) {
    if (char === '"') {
      inString = !inString;
      result += char;
    } else if (inString) {
      continue;
    } else if (char === "'") {
      break;
    } else {
      result += char;
    }
  }
  return result.replace(/^\s*Rem(\s.*)?$/i, '');
}

/** 括弧の外に「;」か「,」があるか（関数の引数の「,」は数えない） */
function hasTopLevelSeparator(expression: string): boolean {
  let depth = 0;
  for (const char of expression) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if ((char === ';' || char === ',') && depth === 0) return true;
  }
  return false;
}

export function findVbaProblems(source: string): string[] {
  const problems: string[] = [];
  const lines = source.split('\n');
  if (!lines.some((line) => /^Option Explicit\s*$/.test(line))) {
    problems.push('「Option Explicit」がありません');
  }
  lines.forEach((line, index) => {
    const at = `${index + 1} 行目`;
    const code = stripStringsAndComment(line);
    const print = /^\s*Debug\.Print\b(.*)$/.exec(code);
    if (print !== null && hasTopLevelSeparator(print[1])) {
      problems.push(`${at}: Debug.Print の式は1つにしてください（「;」や「,」で区切らない）`);
    }
    if (/\b(MsgBox|InputBox)\b/i.test(code)) problems.push(`${at}: MsgBox や InputBox など、画面を出す命令は使わないでください`);
    if (code.includes(':') && !LABEL_LINE.test(code)) problems.push(`${at}: 1行に複数の文を書かないでください（「:」で区切らない）`);
  });
  return problems;
}
