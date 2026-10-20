// Markdown の中の指定（「くわしく」と「図」。詳細設計書 §3.3、要件定義書 FR-023）。
// 教材の検証（V12・V13）と、ビルド時の HTML への変換（build/markdown.ts）の両方が使う。

export type MarkdownSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'details'; segments: MarkdownSegment[] }
  | { kind: 'diagram'; ids: string[] };

export interface DirectiveParse {
  segments: MarkdownSegment[];
  /** 指定の書き方の誤り（V12） */
  problems: string[];
}

const DETAILS_START = /^::: くわしく\s*$/;
const DETAILS_END = /^:::\s*$/;
const DIAGRAM = /^::: 図((?:\s+[^\s]+)+)\s*$/;

export function parseDirectives(source: string): DirectiveParse {
  const problems: string[] = [];
  const top: MarkdownSegment[] = [];
  let details: MarkdownSegment[] | undefined;
  let buffer: string[] = [];

  const container = () => details ?? top;
  const flush = () => {
    const text = buffer.join('\n');
    if (text.trim() !== '') container().push({ kind: 'markdown', text });
    buffer = [];
  };

  source.split('\n').forEach((line, index) => {
    const lineNumber = index + 1;
    if (DETAILS_START.test(line)) {
      if (details !== undefined) {
        problems.push(`${lineNumber} 行目: 「くわしく」の中に「くわしく」は入れられません`);
        return;
      }
      flush();
      details = [];
      return;
    }
    if (DETAILS_END.test(line)) {
      if (details === undefined) {
        problems.push(`${lineNumber} 行目: 対応する「::: くわしく」がありません`);
        return;
      }
      flush();
      top.push({ kind: 'details', segments: details });
      details = undefined;
      return;
    }
    const diagram = DIAGRAM.exec(line);
    if (diagram !== null) {
      flush();
      container().push({ kind: 'diagram', ids: diagram[1].trim().split(/\s+/) });
      return;
    }
    if (line.startsWith(':::')) {
      problems.push(`${lineNumber} 行目: 指定の書き方が違います（「::: くわしく」「:::」「::: 図 名前」のどれか）`);
      return;
    }
    buffer.push(line);
  });

  flush();
  if (details !== undefined) {
    problems.push('「::: くわしく」が「:::」で閉じられていません');
    top.push({ kind: 'details', segments: details });
  }
  return { segments: top, problems };
}

/** 指定の中で使っている図の名前 */
export function referencedDiagrams(segments: MarkdownSegment[]): string[] {
  return segments.flatMap((segment) => {
    if (segment.kind === 'diagram') return segment.ids;
    if (segment.kind === 'details') return referencedDiagrams(segment.segments);
    return [];
  });
}

/** 最初に見える文字（「くわしく」の外）の数。空白と Markdown の記号は数えない（V13） */
export function visibleTextLength(source: string): number {
  const visible = parseDirectives(source)
    .segments.filter((segment): segment is { kind: 'markdown'; text: string } => segment.kind === 'markdown')
    .map((segment) => segment.text)
    .join('\n');
  return visible
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\|?[\s:|-]*-{3,}[\s:|-]*$/gm, '')
    .replace(/[*`|>_]/g, '')
    .replace(/\s/g, '').length;
}
