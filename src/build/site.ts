// ビルド時に各ページで共有する教材と、表示言語の仕組み（詳細設計書 §5.1・§5.4）
import type { Concept, Content } from '../content/loader.ts';
import { CONTENT_ROOT } from '../content/root.ts';
import { checkContent } from '../content/validate.ts';
import type { ConceptOutline } from '../domain/progress.ts';
import { buildHeadScript, buildLanguageCss } from './head-script.ts';
import { type CodeHighlighter, createCodeHighlighter } from './highlight.ts';

let content: Content | undefined;
let highlighter: Promise<CodeHighlighter> | undefined;

/** 教材（ビルドの中で1回だけ読む）。検証のエラーでは、astro.config の contentCheck がビルドを止める */
export function siteContent(): Content {
  content ??= checkContent(CONTENT_ROOT).content;
  return content;
}

/** コードの色付け（ビルドの中で1回だけ用意する） */
export function siteHighlighter(): Promise<CodeHighlighter> {
  highlighter ??= createCodeHighlighter(siteContent().languages);
  return highlighter;
}

export function languageIds(): string[] {
  return siteContent().languages.map((language) => language.id);
}

/** 表示言語を決める先頭スクリプト。astro.config では、同じものから CSP のハッシュ値を作る */
export function headScript(): string {
  return buildHeadScript(languageIds());
}

export function languageCss(): string {
  return buildLanguageCss(languageIds());
}

/** 概念ごとのページの getStaticPaths（基本設計書 §3.1） */
export function conceptPaths(): { params: { id: string }; props: { concept: Concept } }[] {
  return siteContent().concepts.map((concept) => ({ params: { id: concept.id }, props: { concept } }));
}

/** 推奨学習順での番号（1から） */
export function conceptNumber(concept: Concept): number {
  return siteContent().concepts.findIndex((item) => item.id === concept.id) + 1;
}

/** 進捗の集計に使う骨組み（詳細設計書 §6.7） */
export function conceptOutline(concept: Concept): ConceptOutline {
  return {
    id: concept.id,
    questionIds: concept.questions.map((question) => question.id),
    exercises: concept.exercises.map((exercise) => ({ id: exercise.id, checkIds: exercise.checks.map((check) => check.id) })),
  };
}
