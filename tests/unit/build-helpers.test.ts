// 規模・Markdown・色付けの単体テスト（テスト計画書 UT-SIZE-01・02、UT-MD-01）
import { describe, expect, it } from 'vitest';
import { createCodeHighlighter, readableColor } from '../../src/build/highlight';
import { renderInlineMarkdown, renderMarkdown } from '../../src/build/markdown';
import { measureSize } from '../../src/build/size';
import type { Language } from '../../src/content/schema';

const java = {
  id: 'java',
  label: 'Java',
  order: 1,
  highlight: 'java',
  editor: 'java',
  lineComment: '//',
  entryFile: 'Main.java',
  extensions: ['.java'],
  classCount: { pattern: '^\\s*(public\\s+|abstract\\s+|final\\s+)*(class|interface|enum)\\s+\\w+' },
  check: 'ci',
  commands: { build: 'b', run: 'r', syntaxCheck: 's' },
} satisfies Language;

const vba = {
  id: 'vba',
  label: 'VBA',
  order: 3,
  highlight: 'vb',
  editor: 'vb',
  lineComment: "'",
  entryFile: 'Program.bas',
  extensions: ['.bas', '.cls'],
  classCount: { fileExtension: '.cls' },
  check: 'vba-tool',
} satisfies Language;

describe('measureSize', () => {
  it('UT-SIZE-01: クラス数を、正規表現とファイルの拡張子の両方で数える', () => {
    expect(
      measureSize(
        [
          { path: 'Main.java', content: 'public class Main {\n}\n' },
          { path: 'Shape.java', content: 'interface Shape {\n}\n\nabstract class Base {\n}\n' },
        ],
        java,
      ).classes,
    ).toBe(3);
    expect(
      measureSize(
        [
          { path: 'Program.bas', content: 'Option Explicit\n' },
          { path: 'Lamp.cls', content: 'Option Explicit\n' },
          { path: 'ILamp.cls', content: 'Option Explicit\n' },
        ],
        vba,
      ),
    ).toEqual({ files: 3, classes: 2, lines: 3 });
  });

  it('UT-SIZE-02: 行数は空行を除いて数える', () => {
    expect(measureSize([{ path: 'A.java', content: 'class A {\n\n    int x;\n   \n}\n' }], java).lines).toBe(3);
  });
});

describe('renderMarkdown', () => {
  it('UT-MD-01: Markdown の中の HTML は文字としてエスケープする', () => {
    const html = renderMarkdown('段落 <b>太字</b>\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n');
    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;太字&lt;/b&gt;');
  });

  it('Markdown の書式は HTML になる', () => {
    expect(renderMarkdown('## 定義\n\n**大事** な `code`\n')).toBe('<h2>定義</h2>\n<p><strong>大事</strong> な <code>code</code></p>\n');
    expect(renderInlineMarkdown('選択肢 `a`')).toBe('選択肢 <code>a</code>');
  });
});

describe('readableColor', () => {
  it('白地でも 4.5:1 に届かない色（github-light の橙）を暗くし、十分な色は変えない', () => {
    expect(readableColor('#E36209')).not.toBe('#E36209');
    expect(readableColor('#E36209')).toMatch(/^#[0-9a-f]{6}$/);
    expect(readableColor('#24292e')).toBe('#24292e');
  });
});

describe('createCodeHighlighter', () => {
  it('1行ずつの HTML にし、記号をエスケープする', async () => {
    const highlighter = await createCodeHighlighter([java, vba]);
    const lines = highlighter.lines('java', 'class A {\n    List<String> names;\n}\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('&lt;');
    expect(lines.join('')).not.toContain('<String>');
  });

  it('VBA の Implements と ByVal にも色を付ける（M0 の T4）', async () => {
    const highlighter = await createCodeHighlighter([java, vba]);
    const [implementsLine, signature] = highlighter.lines('vba', 'Implements IDescribable\nPublic Sub Init(ByVal name As String)\n');
    expect(implementsLine).toContain(`<span style="color:${readableColor('#D73A49')}">Implements</span>`);
    expect(signature).toContain(`<span style="color:${readableColor('#D73A49')}">ByVal</span>`);
  });
});
