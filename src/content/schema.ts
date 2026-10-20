// 教材ファイルの形と、形の検証ルール（詳細設計書 §3）
import { z } from 'zod';

z.config(z.locales.ja());

export const DESIGN_KINDS = ['unapplied', 'proper', 'overapplied'] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

export const DESIGN_LABELS: Record<DesignKind, string> = {
  unapplied: '未適用',
  proper: '適切',
  overapplied: '過剰適用',
};

export const QUESTION_CATEGORIES = ['definition', 'merit', 'usage', 'mistake', 'code'] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

/** 1つの概念あたりの、設問の種類ごとの最低数（教材コンテンツ仕様書 §1.4） */
export const MIN_QUESTIONS_PER_CATEGORY: Record<QuestionCategory, number> = {
  definition: 2,
  merit: 2,
  usage: 2,
  mistake: 2,
  code: 2,
};

export const CHOICE_IDS = ['a', 'b', 'c', 'd'] as const;

/** 解説の見出し（要件定義書 FR-020）。この順に過不足なく並べる */
export const EXPLANATION_HEADINGS = [
  '定義',
  '目的',
  'メリット',
  'デメリット',
  '使い時',
  '使わない方がよい時',
  'よくある誤り',
  '関連概念',
] as const;

/** 設計の解説に必要な見出し（どちらか一方以上） */
export const COMMENTARY_HEADINGS = ['良い点', '問題点'] as const;

const text = z.string().trim().min(1);
const extension = z.string().regex(/^\.[a-z0-9]+$/, '「.」で始まる小文字の拡張子にしてください');

export const languageSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9]*$/, '英小文字と数字にしてください'),
    label: text,
    order: z.number().int().positive(),
    highlight: text,
    editor: text,
    lineComment: text,
    entryFile: text,
    extensions: z.array(extension).min(1),
    compileExtensions: z.array(extension).min(1).optional(),
    classCount: z.union([z.strictObject({ pattern: text }), z.strictObject({ fileExtension: extension })]),
    check: z.enum(['ci', 'vba-tool']),
    commands: z.strictObject({ build: text, run: text, syntaxCheck: text }).optional(),
    forbiddenPatterns: z.array(text).optional(),
  })
  .refine((language) => language.check !== 'ci' || language.commands !== undefined, {
    message: 'check が ci の言語には commands が必要です',
    path: ['commands'],
  });
export const languagesSchema = z.array(languageSchema).min(1);
export type Language = z.infer<typeof languageSchema>;

export const conceptSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z-]*$/, '英小文字とハイフンにしてください'),
  order: z.number().int().positive(),
  title: text,
  theme: text,
  summary: text.max(40),
  spec: text,
  related: z.array(z.string()),
  variations: z
    .array(z.enum(DESIGN_KINDS))
    .refine((kinds) => kinds.includes('unapplied') && kinds.includes('proper'), '「unapplied」と「proper」を必ず含めてください')
    .refine((kinds) => new Set(kinds).size === kinds.length, '同じ設計を重ねて書かないでください'),
});
export type ConceptMeta = z.infer<typeof conceptSchema>;

export const changeSchema = z.strictObject({
  id: text,
  order: z.number().int().positive(),
  title: text,
  description: text,
  expectation: z.enum(['proper-fewer', 'proper-not-fewer']),
  commentary: z.strictObject({ reason: text, missRisk: text, lesson: text }),
});
export type ChangeMeta = z.infer<typeof changeSchema>;

const snippetSchema = z.strictObject({ fileName: text, content: text });
export type CodeSnippet = z.infer<typeof snippetSchema>;

export const questionSchema = z
  .strictObject({
    id: text,
    category: z.enum(QUESTION_CATEGORIES),
    stem: text,
    code: z.record(z.string(), snippetSchema).optional(),
    choices: z.array(z.strictObject({ id: z.enum(CHOICE_IDS), text })).length(4),
  })
  .refine((question) => question.category !== 'code' || question.code !== undefined, {
    message: 'category が code の設問には code が必要です',
    path: ['code'],
  })
  .refine((question) => new Set(question.choices.map((choice) => choice.id)).size === CHOICE_IDS.length, {
    message: '選択肢の id は a〜d を1つずつ使ってください',
    path: ['choices'],
  });
export const questionsSchema = z.array(questionSchema);
export type Question = z.infer<typeof questionSchema>;

export const answerSchema = z.strictObject({
  questionId: text,
  correct: z.enum(CHOICE_IDS),
  explanation: text,
  wrongReasons: z.record(z.string(), text),
});
export const answersSchema = z.array(answerSchema);
export type Answer = z.infer<typeof answerSchema>;

export const exerciseSchema = z.strictObject({
  id: text,
  statement: text,
  additionalSpec: text,
  checks: z.array(z.strictObject({ id: text, text })).min(3),
});
export type ExerciseMeta = z.infer<typeof exerciseSchema>;

export const notesFrontMatterSchema = z.strictObject({ unsupported: text.optional() });

/** 図の箱・行・矢印の見た目（詳細設計書 §3.3）。色だけに頼らず、意味は語句でも書く */
export const DIAGRAM_STYLES = ['normal', 'rule', 'good', 'bad', 'muted'] as const;
export type DiagramStyle = (typeof DIAGRAM_STYLES)[number];

const diagramId = z.string().regex(/^[a-z][a-z0-9-]*$/, '英小文字・数字・ハイフンにしてください');
const diagramStyle = z.enum(DIAGRAM_STYLES).optional();
const diagramLine = z.union([text, z.strictObject({ text, style: diagramStyle })]);
export type DiagramLine = z.infer<typeof diagramLine>;

const structureNode = z.strictObject({
  id: diagramId,
  label: text,
  lines: z.array(diagramLine).optional(),
  col: z.number().int().positive(),
  row: z.number().positive().multipleOf(0.5),
  style: diagramStyle,
});

const structureEdge = z.strictObject({ from: diagramId, to: diagramId, label: text.optional(), style: diagramStyle });

export const diagramSchema = z.discriminatedUnion('type', [
  z.strictObject({
    id: diagramId,
    type: z.literal('structure'),
    caption: text,
    nodes: z.array(structureNode).min(1),
    edges: z.array(structureEdge).optional(),
  }),
  z.strictObject({
    id: diagramId,
    type: z.literal('decision'),
    caption: text,
    questions: z.array(z.strictObject({ text, no: text })).min(1),
    yes: text,
  }),
]);
export const diagramsSchema = z.array(diagramSchema);
export type Diagram = z.infer<typeof diagramSchema>;
export type StructureDiagram = Extract<Diagram, { type: 'structure' }>;
export type DecisionDiagram = Extract<Diagram, { type: 'decision' }>;

/** 必ず置く図（設計ごとの構造図のほかに）。V12 */
export const REQUIRED_DIAGRAMS: { id: string; type: Diagram['type'] }[] = [
  { id: 'spec', type: 'structure' },
  { id: 'usage', type: 'decision' },
];

/** 最初に見える文字数の目安（要件定義書 CR-17）。V13 */
export const VISIBLE_TEXT_LIMITS = {
  spec: 150,
  explanation: 600,
  commentary: 80,
  changeCommentary: 120,
  note: 150,
  quizAnswer: 100,
} as const;

/** zod の検証結果を「項目: 内容」の文字列の一覧にする */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message));
}
