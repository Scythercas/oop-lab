// 教材の検証（詳細設計書 §3.5 の V01〜V13）。V01・V05・V06 の一部は読み込みの時点で記録する。
import { extname } from 'node:path';
import { type Diagnostic, DiagnosticList } from './diagnostics.ts';
import { parseDirectives, referencedDiagrams, visibleTextLength } from './directives.ts';
import { type CodeByLanguage, type Concept, type Content, type SourceFile, loadContent } from './loader.ts';
import {
  CHOICE_IDS,
  COMMENTARY_HEADINGS,
  DESIGN_LABELS,
  EXPLANATION_HEADINGS,
  type Language,
  MIN_QUESTIONS_PER_CATEGORY,
  QUESTION_CATEGORIES,
  REQUIRED_DIAGRAMS,
  VISIBLE_TEXT_LIMITS,
} from './schema.ts';
import { countLines } from './text-format.ts';
import { findVbaProblems } from './vba-lint.ts';

/** VBA の書き方の規則（V10）を当てはめる言語 */
const VBA_LANGUAGE_ID = 'vba';
const MIN_CHANGES = 2;
const MIN_QUESTIONS = 10;
const MIN_EXERCISES = 1;
const MAX_LINES_PER_FILE = 60;
const MAX_LINES_PER_STATE = 200;

export interface ConceptSummary {
  id: string;
  title: string;
  designs: number;
  changes: number;
  questions: number;
  exercises: number;
  /** 言語ごとのコードの状態の数（設計・変更後・模範解答） */
  codeStates: Record<string, number>;
}

export interface ContentCheckResult {
  content: Content;
  diagnostics: Diagnostic[];
  summary: ConceptSummary[];
}

/** 1つの状態（設計・変更後・模範解答）の、1言語分のソース */
interface CodeState {
  file: string;
  language: Language;
  files: SourceFile[];
}

export function checkContent(root: string): ContentCheckResult {
  const diagnostics = new DiagnosticList();
  const content = loadContent(root, diagnostics);
  validateContent(content, diagnostics);
  return { content, diagnostics: diagnostics.items, summary: summarize(content) };
}

function validateContent(content: Content, diagnostics: DiagnosticList): void {
  checkLanguages(content.languages, diagnostics);
  checkGlobalIds(content, diagnostics);
  for (const concept of content.concepts) {
    const base = `concepts/${concept.folder}`;
    const states = collectStates(concept, content.languages, base);
    checkConceptIds(concept, base, diagnostics);
    checkReferences(concept, content, base, diagnostics);
    checkCounts(concept, base, diagnostics);
    checkCompleteness(concept, content.languages, states, base, diagnostics);
    checkExplanation(concept, base, diagnostics);
    checkSize(states, diagnostics);
    checkForbiddenPatterns(concept, content.languages, states, base, diagnostics);
    checkVba(concept, states, base, diagnostics);
    checkCommentary(concept, base, diagnostics);
    checkDiagrams(concept, base, diagnostics);
    checkVisibleText(concept, base, diagnostics);
  }
}

function collectStates(concept: Concept, languages: Language[], base: string): CodeState[] {
  const states: CodeState[] = [];
  const add = (dir: string, code: CodeByLanguage | undefined) => {
    for (const language of languages) {
      states.push({ file: `${dir}/${language.id}`, language, files: code?.[language.id] ?? [] });
    }
  };
  for (const design of concept.designs) add(`${base}/variations/${design.kind}`, design.code);
  for (const change of concept.changes) {
    for (const kind of concept.variations) add(`${base}/changes/${change.name}/${kind}`, change.code[kind]);
  }
  for (const exercise of concept.exercises) add(`${base}/exercises/${exercise.name}/answer`, exercise.answer);
  return states;
}

/** V02: 言語 ID と並び順が重ならない */
function checkLanguages(languages: Language[], diagnostics: DiagnosticList): void {
  reportDuplicates(languages.map((language) => language.id), (id) =>
    diagnostics.error('V02', 'languages.yaml', `言語 ID「${id}」が重なっています`),
  );
  reportDuplicates(languages.map((language) => String(language.order)), (order) =>
    diagnostics.error('V02', 'languages.yaml', `order「${order}」が重なっています`),
  );
}

/** V02: 概念・設問・課題の ID と、概念の並び順が、教材全体で重ならない */
function checkGlobalIds(content: Content, diagnostics: DiagnosticList): void {
  const concepts = content.concepts;
  reportDuplicates(concepts.map((concept) => concept.id), (id) =>
    diagnostics.error('V02', 'concepts', `概念 ID「${id}」が重なっています`),
  );
  reportDuplicates(concepts.map((concept) => String(concept.order)), (order) =>
    diagnostics.error('V02', 'concepts', `概念の order「${order}」が重なっています`),
  );
  const ids = concepts.flatMap((concept) => [
    ...concept.changes.map((change) => change.id),
    ...concept.questions.map((question) => question.id),
    ...concept.exercises.flatMap((exercise) => [exercise.id, ...exercise.checks.map((check) => check.id)]),
  ]);
  reportDuplicates(ids, (id) => diagnostics.error('V02', 'concepts', `ID「${id}」が重なっています`));
}

/** V02: ID の形式と、フォルダ名との一致 */
function checkConceptIds(concept: Concept, base: string, diagnostics: DiagnosticList): void {
  if (concept.id !== concept.folder) {
    diagnostics.error('V02', `${base}/concept.yaml`, `id「${concept.id}」がフォルダ名「${concept.folder}」と違います`);
  }
  const prefix = escapeRegExp(concept.id);
  for (const change of concept.changes) {
    const file = `${base}/changes/${change.name}/change.yaml`;
    if (!new RegExp(`^${prefix}\\.[a-z][a-z0-9-]*$`).test(change.id)) {
      diagnostics.error('V02', file, `id「${change.id}」は「${concept.id}.名前」の形にしてください`);
    } else if (change.id !== `${concept.id}.${change.name}`) {
      diagnostics.error('V02', file, `id の「.」より後ろがフォルダ名「${change.name}」と違います`);
    }
  }
  reportDuplicates(concept.changes.map((change) => String(change.order)), (order) =>
    diagnostics.error('V02', `${base}/changes`, `変更要求の order「${order}」が重なっています`),
  );
  for (const question of concept.questions) {
    if (!new RegExp(`^${prefix}\\.q[0-9]{2}$`).test(question.id)) {
      diagnostics.error('V02', `${base}/quiz/questions.yaml`, `id「${question.id}」は「${concept.id}.q01」の形にしてください`);
    }
  }
  for (const exercise of concept.exercises) {
    const file = `${base}/exercises/${exercise.name}/exercise.yaml`;
    if (!new RegExp(`^${prefix}\\.ex[0-9]{2}$`).test(exercise.id)) {
      diagnostics.error('V02', file, `id「${exercise.id}」は「${concept.id}.ex01」の形にしてください`);
    } else if (exercise.id !== `${concept.id}.${exercise.name}`) {
      diagnostics.error('V02', file, `id の「.」より後ろがフォルダ名「${exercise.name}」と違います`);
    }
    const checkPrefix = escapeRegExp(exercise.id);
    for (const check of exercise.checks) {
      if (!new RegExp(`^${checkPrefix}\\.c[0-9]+$`).test(check.id)) {
        diagnostics.error('V02', file, `自己チェック項目の id「${check.id}」は「${exercise.id}.c1」の形にしてください`);
      }
    }
  }
}

/** V03: 参照先が存在し、正解と誤答の理由がそろっている */
function checkReferences(concept: Concept, content: Content, base: string, diagnostics: DiagnosticList): void {
  const conceptIds = new Set(content.concepts.map((item) => item.id));
  for (const related of concept.related) {
    if (related === concept.id) {
      diagnostics.error('V03', `${base}/concept.yaml`, '関連概念に自分自身を入れないでください');
    } else if (!conceptIds.has(related)) {
      diagnostics.error('V03', `${base}/concept.yaml`, `関連概念「${related}」がありません`);
    }
  }

  const file = `${base}/quiz/answers.yaml`;
  const questionIds = new Set(concept.questions.map((question) => question.id));
  const answerCounts = new Map<string, number>();
  for (const answer of concept.answers) {
    answerCounts.set(answer.questionId, (answerCounts.get(answer.questionId) ?? 0) + 1);
    if (!questionIds.has(answer.questionId)) {
      diagnostics.error('V03', file, `設問「${answer.questionId}」がありません`);
      continue;
    }
    const others = CHOICE_IDS.filter((id) => id !== answer.correct);
    const reasons = Object.keys(answer.wrongReasons).sort();
    if (reasons.join(',') !== [...others].sort().join(',')) {
      diagnostics.error(
        'V03',
        file,
        `設問「${answer.questionId}」の wrongReasons は、正解以外の選択肢（${others.join('・')}）にちょうど1つずつ書いてください`,
      );
    }
  }
  for (const question of concept.questions) {
    const count = answerCounts.get(question.id) ?? 0;
    if (count !== 1) diagnostics.error('V03', file, `設問「${question.id}」の正解が ${count} 件あります（ちょうど1件にしてください）`);
  }
}

/** V04: 件数 */
function checkCounts(concept: Concept, base: string, diagnostics: DiagnosticList): void {
  if (concept.changes.length < MIN_CHANGES) {
    diagnostics.error('V04', `${base}/changes`, `変更要求が ${concept.changes.length} 件です（${MIN_CHANGES} 件以上にしてください）`);
  }
  if (concept.changes.length > 0 && !concept.changes.some((change) => change.expectation === 'proper-fewer')) {
    diagnostics.error('V04', `${base}/changes`, '「適切な設計のほうが修正行数が少ない」（proper-fewer）変更要求が1件もありません');
  }
  const file = `${base}/quiz/questions.yaml`;
  if (concept.questions.length < MIN_QUESTIONS) {
    diagnostics.error('V04', file, `設問が ${concept.questions.length} 問です（${MIN_QUESTIONS} 問以上にしてください）`);
  }
  for (const category of QUESTION_CATEGORIES) {
    const count = concept.questions.filter((question) => question.category === category).length;
    const min = MIN_QUESTIONS_PER_CATEGORY[category];
    if (count < min) diagnostics.error('V04', file, `種類「${category}」の設問が ${count} 問です（${min} 問以上にしてください）`);
  }
  if (concept.exercises.length < MIN_EXERCISES) {
    diagnostics.error('V04', `${base}/exercises`, `実装課題がありません（${MIN_EXERCISES} 問以上にしてください）`);
  }
}

/** V05: 実行の入口と、設問のコードが全言語分そろっている */
function checkCompleteness(
  concept: Concept,
  languages: Language[],
  states: CodeState[],
  base: string,
  diagnostics: DiagnosticList,
): void {
  for (const state of states) {
    if (state.files.length > 0 && !state.files.some((file) => file.path === state.language.entryFile)) {
      diagnostics.error('V05', state.file, `実行の入口「${state.language.entryFile}」がありません`);
    }
  }
  for (const question of concept.questions) {
    if (question.code === undefined) continue;
    const file = `${base}/quiz/questions.yaml#${question.id}`;
    for (const language of languages) {
      const snippet = question.code[language.id];
      if (snippet === undefined) {
        diagnostics.error('V05', file, `${language.label} のコードがありません`);
      } else if (!language.extensions.includes(extname(snippet.fileName))) {
        diagnostics.error('V05', file, `${language.label} のファイル名「${snippet.fileName}」の拡張子が使えません`);
      }
    }
    for (const id of Object.keys(question.code)) {
      if (!languages.some((language) => language.id === id)) diagnostics.error('V05', file, `知らない言語「${id}」のコードがあります`);
    }
  }
}

/** V07: 解説の見出しが8つ、決まった順に並んでいる */
function checkExplanation(concept: Concept, base: string, diagnostics: DiagnosticList): void {
  if (concept.explanation === '') return;
  const headings = concept.explanation
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
  if (headings.join('|') !== EXPLANATION_HEADINGS.join('|')) {
    diagnostics.error(
      'V07',
      `${base}/explanation.md`,
      `見出し（##）は「${EXPLANATION_HEADINGS.join('」「')}」をこの順に並べてください（今は「${headings.join('」「')}」）`,
    );
  }
}

/** V08: 規模の目安（警告） */
function checkSize(states: CodeState[], diagnostics: DiagnosticList): void {
  for (const state of states) {
    let total = 0;
    for (const file of state.files) {
      const lines = countLines(file.content);
      total += lines;
      if (lines > MAX_LINES_PER_FILE) {
        diagnostics.warning('V08', `${state.file}/${file.path}`, `${lines} 行あります（目安は ${MAX_LINES_PER_FILE} 行以内）`);
      }
    }
    if (total > MAX_LINES_PER_STATE) {
      diagnostics.warning('V08', state.file, `合計 ${total} 行あります（目安は ${MAX_LINES_PER_STATE} 行以内）`);
    }
  }
}

/** V09: 言語ごとの禁止パターン（ソースファイルと設問のコード） */
function checkForbiddenPatterns(
  concept: Concept,
  languages: Language[],
  states: CodeState[],
  base: string,
  diagnostics: DiagnosticList,
): void {
  for (const state of states) {
    for (const file of state.files) {
      for (const message of findForbidden(state.language, file.content)) diagnostics.error('V09', `${state.file}/${file.path}`, message);
    }
  }
  for (const question of concept.questions) {
    for (const language of languages) {
      const snippet = question.code?.[language.id];
      if (snippet === undefined) continue;
      for (const message of findForbidden(language, snippet.content)) {
        diagnostics.error('V09', `${base}/quiz/questions.yaml#${question.id}`, `${language.label}: ${message}`);
      }
    }
  }
}

export function findForbidden(language: Language, source: string): string[] {
  const messages: string[] = [];
  const patterns = (language.forbiddenPatterns ?? []).map((pattern) => new RegExp(pattern));
  source.split('\n').forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.test(line)) messages.push(`${index + 1} 行目が禁止パターン「${pattern.source}」に当たります: ${line.trim()}`);
    }
  });
  return messages;
}

/** V10: VBA の書き方（ソースファイルと設問のコード） */
function checkVba(concept: Concept, states: CodeState[], base: string, diagnostics: DiagnosticList): void {
  for (const state of states) {
    if (state.language.id !== VBA_LANGUAGE_ID) continue;
    for (const file of state.files) {
      for (const message of findVbaProblems(file.content)) diagnostics.error('V10', `${state.file}/${file.path}`, message);
    }
  }
  for (const question of concept.questions) {
    const snippet = question.code?.[VBA_LANGUAGE_ID];
    if (snippet === undefined) continue;
    for (const message of findVbaProblems(snippet.content)) {
      diagnostics.error('V10', `${base}/quiz/questions.yaml#${question.id}`, message);
    }
  }
}

/** V11: 設計の解説に「良い点」か「問題点」の見出しがある */
function checkCommentary(concept: Concept, base: string, diagnostics: DiagnosticList): void {
  for (const design of concept.designs) {
    if (design.commentary === '') continue;
    const headings = design.commentary
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).trim());
    if (!COMMENTARY_HEADINGS.some((heading) => headings.includes(heading))) {
      diagnostics.error(
        'V11',
        `${base}/variations/${design.kind}/commentary.md`,
        `「${DESIGN_LABELS[design.kind]}」の解説に、見出し「## 良い点」か「## 問題点」を入れてください`,
      );
    }
  }
}

/** 教材の Markdown の項目（指定の検証と、文字数の目安に使う） */
interface MarkdownField {
  file: string;
  text: string;
}

function markdownFields(concept: Concept, base: string): MarkdownField[] {
  const fields: MarkdownField[] = [
    { file: `${base}/concept.yaml#spec`, text: concept.spec },
    { file: `${base}/explanation.md`, text: concept.explanation },
  ];
  for (const design of concept.designs) fields.push({ file: `${base}/variations/${design.kind}/commentary.md`, text: design.commentary });
  for (const change of concept.changes) {
    const file = `${base}/changes/${change.name}/change.yaml`;
    fields.push({ file, text: change.description });
    for (const text of Object.values(change.commentary)) fields.push({ file, text });
  }
  for (const [languageId, note] of Object.entries(concept.notes)) fields.push({ file: `${base}/notes/${languageId}.md`, text: note.body });
  for (const question of concept.questions) fields.push({ file: `${base}/quiz/questions.yaml#${question.id}`, text: question.stem });
  for (const answer of concept.answers) {
    const file = `${base}/quiz/answers.yaml#${answer.questionId}`;
    fields.push({ file, text: answer.explanation });
    for (const text of Object.values(answer.wrongReasons)) fields.push({ file, text });
  }
  for (const exercise of concept.exercises) {
    const file = `${base}/exercises/${exercise.name}/exercise.yaml`;
    fields.push({ file, text: exercise.statement }, { file, text: exercise.additionalSpec });
  }
  return fields;
}

/** V12: 図の定義と、Markdown の中の指定（くわしく・図） */
function checkDiagrams(concept: Concept, base: string, diagnostics: DiagnosticList): void {
  const file = `${base}/diagrams.yaml`;
  const byId = new Map(concept.diagrams.map((diagram) => [diagram.id, diagram]));
  reportDuplicates(
    concept.diagrams.map((diagram) => diagram.id),
    (id) => diagnostics.error('V12', file, `図の名前「${id}」が重なっています`),
  );
  const required = [...REQUIRED_DIAGRAMS, ...concept.variations.map((kind) => ({ id: kind, type: 'structure' as const }))];
  for (const { id, type } of required) {
    const diagram = byId.get(id);
    if (diagram === undefined) diagnostics.error('V12', file, `必ず置く図「${id}」がありません`);
    else if (diagram.type !== type) diagnostics.error('V12', file, `図「${id}」は ${type} にしてください`);
  }
  for (const diagram of concept.diagrams) {
    if (diagram.type !== 'structure') continue;
    const nodeIds = diagram.nodes.map((node) => node.id);
    reportDuplicates(nodeIds, (id) => diagnostics.error('V12', file, `図「${diagram.id}」の箱「${id}」が重なっています`));
    for (const edge of diagram.edges ?? []) {
      for (const end of [edge.from, edge.to]) {
        if (!nodeIds.includes(end)) diagnostics.error('V12', file, `図「${diagram.id}」の矢印が、ない箱「${end}」を指しています`);
      }
    }
  }
  for (const field of markdownFields(concept, base)) {
    const { segments, problems } = parseDirectives(field.text);
    for (const problem of problems) diagnostics.error('V12', field.file, problem);
    for (const id of referencedDiagrams(segments)) {
      if (!byId.has(id)) diagnostics.error('V12', field.file, `図「${id}」が diagrams.yaml にありません`);
    }
  }
}

/** V13: 最初に見える文字数の目安（警告。要件定義書 CR-17） */
function checkVisibleText(concept: Concept, base: string, diagnostics: DiagnosticList): void {
  const warn = (file: string, length: number, limit: number) => {
    if (length > limit) diagnostics.warning('V13', file, `最初に見える文字が ${length} 字あります（目安は ${limit} 字以内。詳しい説明は「::: くわしく」に入れてください）`);
  };
  warn(`${base}/concept.yaml#spec`, visibleTextLength(concept.spec), VISIBLE_TEXT_LIMITS.spec);
  warn(`${base}/explanation.md`, visibleTextLength(concept.explanation), VISIBLE_TEXT_LIMITS.explanation);
  for (const design of concept.designs) {
    warn(`${base}/variations/${design.kind}/commentary.md`, visibleTextLength(design.commentary), VISIBLE_TEXT_LIMITS.commentary);
  }
  for (const change of concept.changes) {
    const length = Object.values(change.commentary).reduce((sum, text) => sum + visibleTextLength(text), 0);
    warn(`${base}/changes/${change.name}/change.yaml#commentary`, length, VISIBLE_TEXT_LIMITS.changeCommentary);
  }
  for (const [languageId, note] of Object.entries(concept.notes)) {
    warn(`${base}/notes/${languageId}.md`, visibleTextLength(note.body), VISIBLE_TEXT_LIMITS.note);
  }
  for (const answer of concept.answers) {
    const texts = [answer.explanation, ...Object.values(answer.wrongReasons)];
    const length = texts.reduce((sum, text) => sum + visibleTextLength(text), 0);
    warn(`${base}/quiz/answers.yaml#${answer.questionId}`, length, VISIBLE_TEXT_LIMITS.quizAnswer);
  }
}

function summarize(content: Content): ConceptSummary[] {
  return content.concepts.map((concept) => {
    const perLanguage = concept.designs.length + concept.changes.length * concept.variations.length + concept.exercises.length;
    return {
      id: concept.id,
      title: concept.title,
      designs: concept.designs.length,
      changes: concept.changes.length,
      questions: concept.questions.length,
      exercises: concept.exercises.length,
      codeStates: Object.fromEntries(content.languages.map((language) => [language.id, perLanguage])),
    };
  });
}

/** 概念ごとの件数の一覧（受け入れテスト AC-01 で使う） */
export function formatSummary(summary: ConceptSummary[], languages: Language[]): string {
  const header = ['概念', '設計', '変更要求', '設問', '課題', ...languages.map((language) => `状態(${language.label})`)];
  const rows = summary.map((item) => [
    `${item.title}（${item.id}）`,
    String(item.designs),
    String(item.changes),
    String(item.questions),
    String(item.exercises),
    ...languages.map((language) => String(item.codeStates[language.id] ?? 0)),
  ]);
  const total = summary.reduce((sum, item) => sum + Object.values(item.codeStates).reduce((a, b) => a + b, 0), 0);
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    `概念 ${summary.length} 件、コードの状態 合計 ${total} 個`,
  ].join('\n');
}

function reportDuplicates(values: string[], report: (value: string) => void): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const value of values) {
    if (seen.has(value) && !reported.has(value)) {
      report(value);
      reported.add(value);
    }
    seen.add(value);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
