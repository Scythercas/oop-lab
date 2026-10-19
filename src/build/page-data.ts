// 画面ごとに埋め込むデータの組み立て（詳細設計書 §5.2）。
// 3言語分をすべて含めるので、表示言語を切り替えても通信しない。クイズの正解は含めず、別のファイルにする（NFR-15 ③）。
import type { CodeByLanguage, Concept, Content, SourceFile } from '../content/loader.ts';
import { DESIGN_LABELS, type DesignKind, type Language, type QuestionCategory } from '../content/schema.ts';
import { type StateDiff, diffStates } from './diff.ts';
import type { CodeHighlighter } from './highlight.ts';
import { renderInlineMarkdown, renderMarkdown } from './markdown.ts';
import { type SizeMetrics, measureSize } from './size.ts';

export interface LanguageInfo {
  id: string;
  label: string;
}

export interface HighlightedFile {
  path: string;
  /** 色付け済みの HTML（1行ずつ） */
  lines: string[];
}

export interface StateView {
  files: HighlightedFile[];
  size: SizeMetrics;
}

/** 2つの設計の組み合わせ。設計の並び順（未適用・適切・過剰適用）で前のほうを左に書く */
export type DesignPairKey = `${DesignKind}|${DesignKind}`;

export interface DesignInfo {
  kind: DesignKind;
  label: string;
  commentaryHtml: string;
}

export interface ComparePageData {
  conceptId: string;
  languages: LanguageInfo[];
  designs: DesignInfo[];
  byLanguage: Record<
    string,
    {
      unsupported?: string;
      states: Partial<Record<DesignKind, StateView>>;
      pairs: Partial<Record<DesignPairKey, StateDiff>>;
    }
  >;
}

export interface ChangeView {
  id: string;
  title: string;
  descriptionHtml: string;
  expectation: 'proper-fewer' | 'proper-not-fewer';
  commentaryHtml: { reason: string; missRisk: string; lesson: string };
  /** 言語ごと・設計ごとの、変更後の状態と、変更前（題材の初期状態）からの差分 */
  byLanguage: Record<string, Partial<Record<DesignKind, { after: StateView; diff: StateDiff }>>>;
}

export interface ChangePageData {
  conceptId: string;
  languages: LanguageInfo[];
  designs: Omit<DesignInfo, 'commentaryHtml'>[];
  /** 変更前（題材の初期状態）の状態 */
  before: Record<string, Partial<Record<DesignKind, StateView>>>;
  unsupported: Record<string, string | undefined>;
  changes: ChangeView[];
}

export interface QuizQuestionView {
  id: string;
  category: QuestionCategory;
  stemHtml: string;
  choices: { id: string; html: string }[];
  code?: Record<string, HighlightedFile>;
}

export interface QuizPageData {
  conceptId: string;
  languages: LanguageInfo[];
  questions: QuizQuestionView[];
  /** 正解データの URL（最初に解答したときに取得する。詳細設計書 §6.6） */
  answersUrl: string;
}

export interface AnswerView {
  correct: string;
  explanationHtml: string;
  wrongReasonsHtml: Record<string, string>;
}

/** 設問 ID ごとの正解（/data/answers/{概念ID}.json の中身） */
export type AnswersData = Record<string, AnswerView>;

export interface ExerciseView {
  id: string;
  statementHtml: string;
  additionalSpecHtml: string;
  checks: { id: string; text: string }[];
  /** 言語ごとの開始コード（エディタ用に1つの文字列にまとめたもの。詳細設計書 §5.6） */
  startCode: Record<string, string>;
  answers: Record<string, HighlightedFile[]>;
}

export interface ExercisePageData {
  conceptId: string;
  languages: (LanguageInfo & { editor: string; lineComment: string })[];
  exercises: ExerciseView[];
}

export interface ExplanationPageData {
  conceptId: string;
  title: string;
  theme: string;
  specHtml: string;
  explanationHtml: string;
  notes: Record<string, { unsupported?: string; bodyHtml: string }>;
  related: { id: string; title: string }[];
}

export function answersUrl(conceptId: string): string {
  return `/data/answers/${conceptId}.json`;
}

function languageInfos(languages: Language[]): LanguageInfo[] {
  return languages.map((language) => ({ id: language.id, label: language.label }));
}

function view(files: SourceFile[], language: Language, highlighter: CodeHighlighter): StateView {
  return {
    files: files.map((file) => ({ path: file.path, lines: highlighter.lines(language.id, file.content) })),
    size: measureSize(files, language),
  };
}

function designCode(concept: Concept, kind: DesignKind): CodeByLanguage {
  return concept.designs.find((design) => design.kind === kind)?.code ?? {};
}

export function buildComparePageData(concept: Concept, content: Content, highlighter: CodeHighlighter): ComparePageData {
  const kinds = concept.variations;
  const byLanguage: ComparePageData['byLanguage'] = {};
  for (const language of content.languages) {
    const states: Partial<Record<DesignKind, StateView>> = {};
    for (const kind of kinds) states[kind] = view(designCode(concept, kind)[language.id] ?? [], language, highlighter);
    const pairs: Partial<Record<DesignPairKey, StateDiff>> = {};
    kinds.forEach((left, index) => {
      for (const right of kinds.slice(index + 1)) {
        pairs[`${left}|${right}`] = diffStates(designCode(concept, left)[language.id] ?? [], designCode(concept, right)[language.id] ?? []);
      }
    });
    byLanguage[language.id] = { unsupported: concept.notes[language.id]?.unsupported, states, pairs };
  }
  return {
    conceptId: concept.id,
    languages: languageInfos(content.languages),
    designs: concept.designs.map((design) => ({
      kind: design.kind,
      label: DESIGN_LABELS[design.kind],
      commentaryHtml: renderMarkdown(design.commentary),
    })),
    byLanguage,
  };
}

export function buildChangePageData(concept: Concept, content: Content, highlighter: CodeHighlighter): ChangePageData {
  const before: ChangePageData['before'] = {};
  const unsupported: ChangePageData['unsupported'] = {};
  for (const language of content.languages) {
    before[language.id] = {};
    for (const kind of concept.variations) {
      before[language.id][kind] = view(designCode(concept, kind)[language.id] ?? [], language, highlighter);
    }
    unsupported[language.id] = concept.notes[language.id]?.unsupported;
  }
  const changes: ChangeView[] = concept.changes.map((change) => {
    const byLanguage: ChangeView['byLanguage'] = {};
    for (const language of content.languages) {
      byLanguage[language.id] = {};
      for (const kind of concept.variations) {
        const after = change.code[kind]?.[language.id] ?? [];
        byLanguage[language.id][kind] = {
          after: view(after, language, highlighter),
          diff: diffStates(designCode(concept, kind)[language.id] ?? [], after),
        };
      }
    }
    return {
      id: change.id,
      title: change.title,
      descriptionHtml: renderMarkdown(change.description),
      expectation: change.expectation,
      commentaryHtml: {
        reason: renderMarkdown(change.commentary.reason),
        missRisk: renderMarkdown(change.commentary.missRisk),
        lesson: renderMarkdown(change.commentary.lesson),
      },
      byLanguage,
    };
  });
  return {
    conceptId: concept.id,
    languages: languageInfos(content.languages),
    designs: concept.variations.map((kind) => ({ kind, label: DESIGN_LABELS[kind] })),
    before,
    unsupported,
    changes,
  };
}

export function buildQuizPageData(concept: Concept, content: Content, highlighter: CodeHighlighter): QuizPageData {
  return {
    conceptId: concept.id,
    languages: languageInfos(content.languages),
    questions: concept.questions.map((question) => {
      const item: QuizQuestionView = {
        id: question.id,
        category: question.category,
        stemHtml: renderMarkdown(question.stem),
        choices: question.choices.map((choice) => ({ id: choice.id, html: renderInlineMarkdown(choice.text) })),
      };
      if (question.code !== undefined) {
        item.code = {};
        for (const language of content.languages) {
          const snippet = question.code[language.id];
          if (snippet !== undefined) {
            item.code[language.id] = { path: snippet.fileName, lines: highlighter.lines(language.id, snippet.content) };
          }
        }
      }
      return item;
    }),
    answersUrl: answersUrl(concept.id),
  };
}

export function buildAnswersData(concept: Concept): AnswersData {
  const data: AnswersData = {};
  for (const answer of concept.answers) {
    data[answer.questionId] = {
      correct: answer.correct,
      explanationHtml: renderMarkdown(answer.explanation),
      wrongReasonsHtml: Object.fromEntries(Object.entries(answer.wrongReasons).map(([id, text]) => [id, renderMarkdown(text)])),
    };
  }
  return data;
}

/** 開始コードを、ファイルの区切り行を入れた1つの文字列にする。実行の入口のファイルを先頭に置く（詳細設計書 §5.6） */
export function buildStartCode(files: SourceFile[], language: Language): string {
  const ordered = [...files].sort((a, b) => {
    if (a.path === language.entryFile) return -1;
    if (b.path === language.entryFile) return 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return ordered.map((file) => `${language.lineComment} ===== ${file.path} =====\n${file.content}`).join('');
}

export function buildExercisePageData(concept: Concept, content: Content, highlighter: CodeHighlighter): ExercisePageData {
  const unapplied = designCode(concept, 'unapplied');
  return {
    conceptId: concept.id,
    languages: content.languages.map((language) => ({
      id: language.id,
      label: language.label,
      editor: language.editor,
      lineComment: language.lineComment,
    })),
    exercises: concept.exercises.map((exercise) => ({
      id: exercise.id,
      statementHtml: renderMarkdown(exercise.statement),
      additionalSpecHtml: renderMarkdown(exercise.additionalSpec),
      checks: exercise.checks.map((check) => ({ id: check.id, text: check.text })),
      startCode: Object.fromEntries(
        content.languages.map((language) => [language.id, buildStartCode(unapplied[language.id] ?? [], language)]),
      ),
      answers: Object.fromEntries(
        content.languages.map((language) => [language.id, view(exercise.answer[language.id] ?? [], language, highlighter).files]),
      ),
    })),
  };
}

export function buildExplanationPageData(concept: Concept, content: Content): ExplanationPageData {
  return {
    conceptId: concept.id,
    title: concept.title,
    theme: concept.theme,
    specHtml: renderMarkdown(concept.spec),
    explanationHtml: renderMarkdown(concept.explanation),
    notes: Object.fromEntries(
      Object.entries(concept.notes).map(([languageId, note]) => [
        languageId,
        { unsupported: note.unsupported, bodyHtml: renderMarkdown(note.body) },
      ]),
    ),
    related: concept.related.flatMap((id) => {
      const related = content.concepts.find((item) => item.id === id);
      return related === undefined ? [] : [{ id: related.id, title: related.title }];
    }),
  };
}
