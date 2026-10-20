// 教材の Markdown を HTML にする。Markdown の中の HTML は、そのまま通さず文字としてエスケープする（基本設計書 §8）。
// 「くわしく」と「図」の指定（詳細設計書 §3.3）は、折りたたみと図に置き換える。
import { Marked } from 'marked';
import { type MarkdownSegment, parseDirectives } from '../content/directives.ts';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const marked = new Marked({
  gfm: true,
  renderer: {
    html(token) {
      return escapeHtml(token.text);
    },
  },
});

/** 図の名前 → 図の HTML（build/diagram.ts の renderDiagramBlock で作ったもの） */
export type DiagramBlocks = ReadonlyMap<string, string>;

function renderSegments(segments: MarkdownSegment[], diagrams: DiagramBlocks): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'markdown') return marked.parse(segment.text, { async: false });
      if (segment.kind === 'details') {
        return `<details class="more"><summary>くわしく</summary><div class="more__body">${renderSegments(segment.segments, diagrams)}</div></details>`;
      }
      const blocks = segment.ids.map((id) => {
        const block = diagrams.get(id);
        // 名前の誤りは教材の検証（V12）で止めるので、ここに来るのは検証の前に変換したときだけ
        if (block === undefined) throw new Error(`図「${id}」がありません`);
        return block;
      });
      return `<div class="diagrams diagrams--${blocks.length}">${blocks.join('')}</div>`;
    })
    .join('');
}

/** 段落などを含む Markdown を HTML にする。図の指定を使うときは、その概念の図を渡す */
export function renderMarkdown(source: string, diagrams: DiagramBlocks = new Map()): string {
  return renderSegments(parseDirectives(source).segments, diagrams);
}

/** 1行の Markdown（強調やコードなど）を、段落で包まずに HTML にする */
export function renderInlineMarkdown(source: string): string {
  return marked.parseInline(source, { async: false });
}
