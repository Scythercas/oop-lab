// Shiki による、行ごとのコードの色付け（詳細設計書 §2.2）。ビルド時だけ動く
import { type BundledLanguage, type Highlighter, createHighlighter } from 'shiki';
import type { Language } from '../content/schema.ts';
import { splitLines } from './diff.ts';
import { escapeHtml } from './markdown.ts';

const THEME = 'github-light';
/** github-light のキーワードの色 */
const KEYWORD_COLOR = '#D73A49';
/** Visual Basic の文法定義では色が付かない、VBA のキーワード（M0 の T4 の結果） */
const VB_EXTRA_KEYWORDS = /\b(Implements|ByVal|ByRef|Optional|ParamArray)\b/g;
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
/**
 * コードを置く背景色（白と、差分の行の背景。src/styles/components.css の --color-added-bg・--color-removed-bg）。
 * テーマの色には、白地でも 4.5:1 に届かないものがあるため、どの背景でも届くまで暗くする（要件定義書 NFR-08）
 */
const CODE_BACKGROUNDS = ['#ffffff', '#f3fcf5', '#fff7f7'];
const MIN_CONTRAST = 4.6;

export interface CodeHighlighter {
  /** ファイルの中身を、1行ずつの HTML にする */
  lines(languageId: string, content: string): string[];
}

let shared: Promise<Highlighter> | undefined;
let sharedLangs = '';

// languages.yaml の highlight は Shiki の言語名（詳細設計書 §3.2）
function getHighlighter(langs: BundledLanguage[]): Promise<Highlighter> {
  const key = [...langs].sort().join(',');
  if (shared === undefined || key !== sharedLangs) {
    sharedLangs = key;
    shared = createHighlighter({ themes: [THEME], langs });
  }
  return shared;
}

export async function createCodeHighlighter(languages: Language[]): Promise<CodeHighlighter> {
  const highlighter = await getHighlighter([...new Set(languages.map((language) => language.highlight as BundledLanguage))]);
  const cache = new Map<string, string[]>();
  return {
    lines(languageId, content) {
      const language = languages.find((item) => item.id === languageId);
      if (language === undefined) throw new Error(`知らない言語です: ${languageId}`);
      const key = `${languageId}\u0000${content}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;

      const result = highlighter.codeToTokens(content, { lang: language.highlight as BundledLanguage, theme: THEME });
      const defaultColor = (result.fg ?? '').toLowerCase();
      const html = result.tokens.map((line) =>
        line
          .map((token) => {
            const color = token.color !== undefined && token.color.toLowerCase() !== defaultColor ? token.color : undefined;
            if (color === undefined && language.highlight === 'vb') return colorVbKeywords(token.content);
            return span(token.content, color, token.fontStyle ?? 0);
          })
          .join(''),
      );
      const lines = html.slice(0, splitLines(content).length);
      cache.set(key, lines);
      return lines;
    },
  };
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** 文字色を、すべての背景色に対して MIN_CONTRAST 以上になるまで暗くする（#RRGGBB 以外はそのまま） */
export function readableColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const backgrounds = CODE_BACKGROUNDS.map(channels);
  let rgb = channels(color);
  while (backgrounds.some((background) => contrast(rgb, background) < MIN_CONTRAST)) {
    rgb = rgb.map((value) => Math.floor(value * 0.94));
  }
  return `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function span(text: string, color: string | undefined, fontStyle: number): string {
  const styles: string[] = [];
  if (color !== undefined) styles.push(`color:${readableColor(color)}`);
  if (fontStyle & FONT_STYLE_ITALIC) styles.push('font-style:italic');
  if (fontStyle & FONT_STYLE_BOLD) styles.push('font-weight:bold');
  return styles.length === 0 ? escapeHtml(text) : `<span style="${styles.join(';')}">${escapeHtml(text)}</span>`;
}

function colorVbKeywords(text: string): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(VB_EXTRA_KEYWORDS)) {
    html += escapeHtml(text.slice(last, match.index)) + span(match[0], KEYWORD_COLOR, 0);
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}
