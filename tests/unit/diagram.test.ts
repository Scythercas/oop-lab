// 図の描画と、Markdown の中の指定（テスト計画書 UT-DIA-01・02、UT-MD-02）
import { describe, expect, it } from 'vitest';
import { renderDiagram, renderDiagramBlock, textWidth } from '../../src/build/diagram';
import { renderMarkdown } from '../../src/build/markdown';
import { parseDirectives, visibleTextLength } from '../../src/content/directives';
import type { DecisionDiagram, StructureDiagram } from '../../src/content/schema';

const structure: StructureDiagram = {
  id: 'proper',
  type: 'structure',
  caption: '適切な設計の構造',
  nodes: [
    { id: 'lever', label: 'シフトレバー', col: 1, row: 1 },
    { id: 'button', label: 'P ボタン', col: 1, row: 2 },
    { id: 'gearbox', label: '変速機', lines: ['shiftTo ← 規則', { text: '位置（非公開）', style: 'good' }], col: 2, row: 1.5, style: 'rule' },
  ],
  edges: [
    { from: 'lever', to: 'gearbox', label: '要求' },
    { from: 'button', to: 'gearbox', label: '要求' },
  ],
};

describe('renderDiagram（UT-DIA-01: 構造図）', () => {
  const svg = renderDiagram(structure);

  it('箱・行・矢印・語句を描く', () => {
    expect(svg.match(/<rect class="dg-box"/g)).toHaveLength(3);
    expect(svg.match(/<path class="dg-edge"/g)).toHaveLength(2);
    expect(svg.match(/<polygon class="dg-head"/g)).toHaveLength(2);
    expect(svg).toContain('>シフトレバー</text>');
    expect(svg).toContain('class="dg-line dg-line--good"');
    expect(svg).toContain('<g class="dg-node dg-node--rule">');
    expect(svg.match(/>要求<\/text>/g)).toHaveLength(2);
  });

  it('列が違う箱は横向きの折れ線で、右の箱の左の辺に向かって結ぶ', () => {
    const path = /<path class="dg-edge" d="M([\d.]+) ([\d.]+) H([\d.]+) V([\d.]+) H([\d.]+)"/.exec(svg)!;
    const [startX, , middleX, , endX] = path.slice(1).map(Number);
    expect(startX).toBeLessThan(middleX);
    expect(middleX).toBeLessThan(endX);
  });

  it('id を使わず、読み上げ用の名前と説明を付ける', () => {
    expect(svg).not.toMatch(/\sid="/);
    expect(svg).toContain('role="img" aria-label="適切な設計の構造"');
    expect(svg).toContain('<desc>');
    expect(svg).toContain('シフトレバー から 変速機 へ「要求」');
  });

  it('教材の文字をエスケープする', () => {
    const attack = renderDiagram({ ...structure, caption: '"><script>', nodes: [{ id: 'a', label: '<img onerror=x>', col: 1, row: 1 }], edges: [] });
    expect(attack).not.toContain('<script>');
    expect(attack).not.toContain('<img');
    expect(attack).toContain('&lt;img onerror=x&gt;');
  });

  it('全角は1文字、半角は0.6文字として幅を見積もる', () => {
    expect(textWidth('変速機', 10)).toBe(30);
    expect(textWidth('ab', 10)).toBe(12);
  });

  it('キャプション付きの図にする', () => {
    expect(renderDiagramBlock(structure)).toMatch(/^<figure class="diagram"><svg[\s\S]*<figcaption class="diagram__caption">適切な設計の構造<\/figcaption><\/figure>$/);
  });
});

describe('renderDiagram（UT-DIA-02: 判断の流れ図）', () => {
  const decision: DecisionDiagram = {
    id: 'usage',
    type: 'decision',
    caption: '使うかどうか',
    questions: [
      { text: '規則がある？', no: 'しなくてよい' },
      { text: '変える箇所が2つ以上？', no: 'どちらでもよい' },
    ],
    yes: 'カプセル化する',
  };
  const svg = renderDiagram(decision);

  it('問い・結論の箱と、「はい」「いいえ」の矢印を描く', () => {
    expect(svg.match(/<rect class="dg-box"/g)).toHaveLength(5);
    expect(svg.match(/>はい<\/text>/g)).toHaveLength(2);
    expect(svg.match(/>いいえ<\/text>/g)).toHaveLength(2);
    expect(svg).toContain('<g class="dg-node dg-node--rule">');
    expect(svg.match(/<g class="dg-node dg-node--muted">/g)).toHaveLength(2);
  });
});

describe('Markdown の中の指定（UT-MD-02）', () => {
  const diagrams = new Map([
    ['a', '<figure>A</figure>'],
    ['b', '<figure>B</figure>'],
  ]);

  it('「くわしく」を折りたたみに、「図」をその図に置き換え、2つの図は並べる', () => {
    const html = renderMarkdown(['要点です。', '', '::: 図 a b', '', '::: くわしく', '詳しい説明です。', '::: 図 a', ':::'].join('\n'), diagrams);
    expect(html).toContain('<p>要点です。</p>');
    expect(html).toContain('<div class="diagrams diagrams--2"><figure>A</figure><figure>B</figure></div>');
    expect(html).toMatch(/<details class="more"><summary>くわしく<\/summary><div class="more__body"><p>詳しい説明です。<\/p>\n?<div class="diagrams diagrams--1"><figure>A<\/figure><\/div><\/div><\/details>/);
  });

  it('書き方の誤りを見つける', () => {
    expect(parseDirectives('::: くわしく\n::: くわしく\n:::').problems).toEqual(['2 行目: 「くわしく」の中に「くわしく」は入れられません']);
    expect(parseDirectives(':::\n').problems).toEqual(['1 行目: 対応する「::: くわしく」がありません']);
    expect(parseDirectives('::: くわしく\nあ').problems).toEqual(['「::: くわしく」が「:::」で閉じられていません']);
    expect(parseDirectives('::: ず a').problems).toHaveLength(1);
  });

  it('最初に見える文字を、くわしくの外だけ、空白と記号を除いて数える', () => {
    expect(visibleTextLength('## 見出し\n\n- **あい** う\n\n::: くわしく\nかきくけこ\n:::\n\n::: 図 a')).toBe(6);
  });
});
