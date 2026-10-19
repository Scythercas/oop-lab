// ビルド時に各ページで共有する教材と、表示言語の仕組み（詳細設計書 §5.1・§5.4）
import type { Content } from '../content/loader.ts';
import { CONTENT_ROOT } from '../content/root.ts';
import { checkContent } from '../content/validate.ts';
import { buildHeadScript, buildLanguageCss } from './head-script.ts';

let content: Content | undefined;

/** 教材（ビルドの中で1回だけ読む）。検証のエラーでは、astro.config の contentCheck がビルドを止める */
export function siteContent(): Content {
  content ??= checkContent(CONTENT_ROOT).content;
  return content;
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
