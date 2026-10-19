// 教材の Markdown を HTML にする。Markdown の中の HTML は、そのまま通さず文字としてエスケープする（基本設計書 §8）
import { Marked } from 'marked';

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

/** 段落などを含む Markdown を HTML にする */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false });
}

/** 1行の Markdown（強調やコードなど）を、段落で包まずに HTML にする */
export function renderInlineMarkdown(source: string): string {
  return marked.parseInline(source, { async: false });
}
