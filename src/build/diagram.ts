// 図を SVG にする（詳細設計書 §5.7、要件定義書 FR-038・CR-16）。ビルド時に描き、ページに埋め込む。
// 色は CSS（components.css の .dg-*）で決め、ここではクラス名だけを付ける。
import type { DecisionDiagram, Diagram, DiagramLine, DiagramStyle, StructureDiagram } from '../content/schema.ts';
import { escapeHtml } from './markdown.ts';

const LABEL_SIZE = 15;
const LINE_SIZE = 13;
const PAD_X = 14;
const PAD_Y = 10;
const LABEL_HEIGHT = 22;
const LINE_HEIGHT = 19;
const MIN_BOX_WIDTH = 96;
const MIN_COL_GAP = 64;
const ROW_GAP = 34;
const MARGIN = 6;
const ARROW = 9;

/** 全角の文字は 1 文字、半角の文字は 0.6 文字として幅を見積もる（ビルド時はフォントの寸法が分からないため） */
const WIDE = /[ᄀ-ᅟ←-⇿①-⓿■-➿⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

export function textWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) units += WIDE.test(char) ? 1 : 0.6;
  return units * size;
}

interface Line {
  text: string;
  style: DiagramStyle;
}

interface Box {
  id: string;
  label: string;
  lines: Line[];
  col: number;
  row: number;
  style: DiagramStyle;
  width: number;
  height: number;
  x: number;
  y: number;
}

function toLine(line: DiagramLine): Line {
  return typeof line === 'string' ? { text: line, style: 'normal' } : { text: line.text, style: line.style ?? 'normal' };
}

function number(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** 判断の流れ図は、構造図（問いを縦に、「いいえ」の結論を右に）に置き換えて描く */
function decisionToStructure(diagram: DecisionDiagram): StructureDiagram {
  const nodes: StructureDiagram['nodes'] = [];
  const edges: NonNullable<StructureDiagram['edges']> = [];
  diagram.questions.forEach((question, index) => {
    const row = index + 1;
    nodes.push({ id: `q${row}`, label: question.text, col: 1, row });
    nodes.push({ id: `no${row}`, label: question.no, col: 2, row, style: 'muted' });
    edges.push({ from: `q${row}`, to: `no${row}`, label: 'いいえ' });
    edges.push({ from: `q${row}`, to: row === diagram.questions.length ? 'yes' : `q${row + 1}`, label: 'はい' });
  });
  nodes.push({ id: 'yes', label: diagram.yes, col: 1, row: diagram.questions.length + 1, style: 'rule' });
  return { id: diagram.id, type: 'structure', caption: diagram.caption, nodes, edges };
}

function layout(diagram: StructureDiagram): { boxes: Map<string, Box>; width: number; height: number } {
  const boxes = new Map<string, Box>();
  for (const node of diagram.nodes) {
    const lines = (node.lines ?? []).map(toLine);
    const contentWidth = Math.max(textWidth(node.label, LABEL_SIZE), ...lines.map((line) => textWidth(line.text, LINE_SIZE)));
    boxes.set(node.id, {
      id: node.id,
      label: node.label,
      lines,
      col: node.col,
      row: node.row,
      style: node.style ?? 'normal',
      width: Math.max(MIN_BOX_WIDTH, Math.ceil(contentWidth + PAD_X * 2)),
      height: PAD_Y * 2 + LABEL_HEIGHT + lines.length * LINE_HEIGHT,
      x: 0,
      y: 0,
    });
  }
  const all = [...boxes.values()];
  const columns = Math.max(...all.map((box) => box.col));
  const columnWidths = Array.from({ length: columns }, (_, index) =>
    Math.max(0, ...all.filter((box) => box.col === index + 1).map((box) => box.width)),
  );
  // 列の間は、横に渡る矢印の語句が収まる幅にする
  const labelWidth = Math.max(0, ...(diagram.edges ?? []).map((edge) => (edge.label === undefined ? 0 : textWidth(edge.label, LINE_SIZE))));
  const gap = Math.max(MIN_COL_GAP, Math.ceil(labelWidth + ARROW + 10 + 24));
  const tallest = Math.max(...all.map((box) => box.height));
  const rowUnit = tallest + ROW_GAP;
  const columnLeft = (col: number) => MARGIN + columnWidths.slice(0, col - 1).reduce((sum, width) => sum + width + gap, 0);
  for (const box of all) {
    box.x = columnLeft(box.col) + (columnWidths[box.col - 1] - box.width) / 2;
    box.y = MARGIN + (box.row - 1) * rowUnit + (tallest - box.height) / 2;
  }
  const width = columnLeft(columns) + columnWidths[columns - 1] + MARGIN;
  const height = MARGIN + (Math.max(...all.map((box) => box.row)) - 1) * rowUnit + tallest + MARGIN;
  return { boxes, width, height };
}

function renderBox(box: Box): string {
  const center = box.x + box.width / 2;
  const parts = [
    `<rect class="dg-box" x="${number(box.x)}" y="${number(box.y)}" width="${number(box.width)}" height="${number(box.height)}" rx="6"/>`,
    `<text class="dg-label" x="${number(center)}" y="${number(box.y + PAD_Y + LABEL_SIZE)}" text-anchor="middle">${escapeHtml(box.label)}</text>`,
  ];
  box.lines.forEach((line, index) => {
    const y = box.y + PAD_Y + LABEL_HEIGHT + LINE_HEIGHT * index + LINE_SIZE;
    parts.push(
      `<text class="dg-line dg-line--${line.style}" x="${number(center)}" y="${number(y)}" text-anchor="middle">${escapeHtml(line.text)}</text>`,
    );
  });
  return `<g class="dg-node dg-node--${box.style}">${parts.join('')}</g>`;
}

function arrowHead(x: number, y: number, direction: 'left' | 'right' | 'up' | 'down'): string {
  const half = ARROW / 2;
  const points = {
    right: [x, y, x - ARROW, y - half, x - ARROW, y + half],
    left: [x, y, x + ARROW, y - half, x + ARROW, y + half],
    down: [x, y, x - half, y - ARROW, x + half, y - ARROW],
    up: [x, y, x - half, y + ARROW, x + half, y + ARROW],
  }[direction];
  return `<polygon class="dg-head" points="${points.map(number).join(' ')}"/>`;
}

/** 列が違えば横向き（辺の中点から折れ線）、同じ列なら縦向きに結ぶ */
function renderEdge(from: Box, to: Box, label: string | undefined, style: DiagramStyle): string {
  const parts: string[] = [];
  let labelX: number;
  let labelY: number;
  let anchor: 'middle' | 'start';
  if (from.col !== to.col) {
    const rightward = to.col > from.col;
    const startX = rightward ? from.x + from.width : from.x;
    const endX = rightward ? to.x : to.x + to.width;
    const startY = from.y + from.height / 2;
    const endY = to.y + to.height / 2;
    // 折れる位置は矢印の先の近くに置き、語句を長い区間（出発側）の中央に書く
    const middleX = endX + (rightward ? -1 : 1) * (ARROW + 10);
    parts.push(`<path class="dg-edge" d="M${number(startX)} ${number(startY)} H${number(middleX)} V${number(endY)} H${number(endX)}"/>`);
    parts.push(arrowHead(endX, endY, rightward ? 'right' : 'left'));
    labelX = (startX + middleX) / 2;
    labelY = startY - 6;
    anchor = 'middle';
  } else {
    const downward = to.row > from.row;
    const startX = from.x + from.width / 2;
    const endX = to.x + to.width / 2;
    const startY = downward ? from.y + from.height : from.y;
    const endY = downward ? to.y : to.y + to.height;
    const middleY = (startY + endY) / 2;
    parts.push(`<path class="dg-edge" d="M${number(startX)} ${number(startY)} V${number(middleY)} H${number(endX)} V${number(endY)}"/>`);
    parts.push(arrowHead(endX, endY, downward ? 'down' : 'up'));
    labelX = startX + 6;
    labelY = (startY + middleY) / 2 + LINE_SIZE / 2;
    anchor = 'start';
  }
  if (label !== undefined) {
    parts.push(
      `<text class="dg-edge-label" x="${number(labelX)}" y="${number(labelY)}" text-anchor="${anchor}">${escapeHtml(label)}</text>`,
    );
  }
  return `<g class="dg-arrow dg-arrow--${style}">${parts.join('')}</g>`;
}

/** 読み上げ用の説明（箱と矢印を文章で並べる） */
function describe(diagram: StructureDiagram, boxes: Map<string, Box>): string {
  const name = (id: string) => {
    const box = boxes.get(id)!;
    return box.lines.length === 0 ? box.label : `${box.label}（${box.lines.map((line) => line.text).join('、')}）`;
  };
  const sentences = [...boxes.keys()].map((id) => name(id));
  for (const edge of diagram.edges ?? []) {
    sentences.push(`${boxes.get(edge.from)!.label} から ${boxes.get(edge.to)!.label} へ${edge.label === undefined ? '' : `「${edge.label}」`}`);
  }
  return sentences.join('。');
}

export function renderDiagram(diagram: Diagram): string {
  const structure = diagram.type === 'decision' ? decisionToStructure(diagram) : diagram;
  const { boxes, width, height } = layout(structure);
  const arrows = (structure.edges ?? []).map((edge) =>
    renderEdge(boxes.get(edge.from)!, boxes.get(edge.to)!, edge.label, edge.style ?? 'normal'),
  );
  return [
    `<svg class="dg dg--${diagram.type}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(width)} ${number(height)}" width="${number(width)}" height="${number(height)}" role="img" aria-label="${escapeHtml(diagram.caption)}">`,
    `<desc>${escapeHtml(describe(structure, boxes))}</desc>`,
    ...arrows,
    ...[...boxes.values()].map(renderBox),
    '</svg>',
  ].join('');
}

/** 図と、その説明（キャプション）。Markdown の「図」の指定と、設計比較の画面で使う */
export function renderDiagramBlock(diagram: Diagram): string {
  return `<figure class="diagram">${renderDiagram(diagram)}<figcaption class="diagram__caption">${escapeHtml(diagram.caption)}</figcaption></figure>`;
}
