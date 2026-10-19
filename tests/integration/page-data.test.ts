// 画面データの組み立て（テスト計画書 IT-01・IT-02）
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CodeHighlighter, createCodeHighlighter } from '../../src/build/highlight';
import {
  buildAnswersData,
  buildChangePageData,
  buildComparePageData,
  buildExercisePageData,
  buildExplanationPageData,
  buildQuizPageData,
} from '../../src/build/page-data';
import type { Concept, Content } from '../../src/content/loader';
import { checkContent } from '../../src/content/validate';
import { writeFixtureContent } from '../fixtures/content-fixture';

let root: string;
let content: Content;
let concept: Concept;
let highlighter: CodeHighlighter;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'page-data-'));
  writeFixtureContent(root);
  const result = checkContent(root);
  expect(result.diagnostics).toEqual([]);
  content = result.content;
  concept = content.concepts[0];
  highlighter = await createCodeHighlighter(content.languages);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('IT-01: テスト用の教材から、各画面のデータができる', () => {
  it('設計比較: 3言語 × 3つの組み合わせの差分と、設計ごとの規模', () => {
    const data = buildComparePageData(concept, content, highlighter);
    expect(data.designs.map((design) => design.label)).toEqual(['未適用', '適切', '過剰適用']);
    expect(data.designs[0].commentaryHtml).toContain('<h2>良い点</h2>');
    for (const language of ['java', 'cpp', 'vba']) {
      expect(Object.keys(data.byLanguage[language].pairs)).toEqual(['unapplied|proper', 'unapplied|overapplied', 'proper|overapplied']);
    }
    const javaPair = data.byLanguage.java.pairs['unapplied|proper']!;
    expect(javaPair.files.map((file) => `${file.path}:${file.status}`)).toEqual(['Lamp.java:added', 'Main.java:modified']);
    expect(javaPair.metrics.changedFiles).toBe(2);
    expect(Object.fromEntries(['java', 'cpp', 'vba'].map((id) => [id, data.byLanguage[id].states.overapplied!.size.classes]))).toEqual({
      java: 3,
      cpp: 2,
      vba: 2,
    });
    expect(data.byLanguage.vba.unsupported).toBe('テスト用の注記です。');
    expect(data.byLanguage.java.states.unapplied!.files[0].lines[0]).toContain('class');
  });

  it('変更シミュレーション: 設計ごとの、変更前からの差分', () => {
    const data = buildChangePageData(concept, content, highlighter);
    expect(data.changes.map((change) => change.id)).toEqual(['sample.state-label', 'sample.rename-rear']);
    const java = data.changes[0].byLanguage.java;
    expect(java.unapplied!.diff.metrics).toMatchObject({ changedFiles: 1, hunks: 1, changedLines: 4 });
    expect(java.proper!.diff.metrics).toMatchObject({ changedFiles: 1, hunks: 1, changedLines: 2 });
    expect(data.before.java.proper!.files.map((file) => file.path)).toEqual(['Lamp.java', 'Main.java']);
    expect(data.changes[0].commentaryHtml.reason).toBe('<p>差が出た理由</p>\n');
  });

  it('実装課題: 実行の入口を先頭にした開始コードと、模範解答', () => {
    const data = buildExercisePageData(concept, content, highlighter);
    const [exercise] = data.exercises;
    expect(exercise.startCode.java.startsWith('// ===== Main.java =====\npublic class Main {')).toBe(true);
    expect(exercise.startCode.vba.startsWith("' ===== Program.bas =====\nOption Explicit")).toBe(true);
    expect(exercise.answers.cpp.map((file) => file.path)).toEqual(['lamp.h', 'main.cpp']);
    expect(data.languages.find((language) => language.id === 'vba')).toMatchObject({ editor: 'vb', lineComment: "'" });
  });

  it('解説: 本文と、言語ごとの補足', () => {
    const data = buildExplanationPageData(concept, content);
    expect(data.explanationHtml).toContain('<h2>使わない方がよい時</h2>');
    expect(data.notes.vba).toEqual({ unsupported: 'テスト用の注記です。', bodyHtml: '<p>VBA の補足です。</p>\n' });
  });
});

describe('IT-02: クイズの画面に正解を含めず、正解は別のデータにする', () => {
  it('クイズの画面データに正解・解説がない', () => {
    const data = buildQuizPageData(concept, content, highlighter);
    const json = JSON.stringify(data);
    expect(json).not.toContain('正解の理由');
    expect(json).not.toContain('誤りの理由');
    expect(json).not.toContain('"correct"');
    expect(data.answersUrl).toBe('/data/answers/sample.json');
    expect(data.questions).toHaveLength(10);
    expect(Object.keys(data.questions[8].code!)).toEqual(['java', 'cpp', 'vba']);
  });

  it('正解データに、正解と解説がそろっている', () => {
    const answers = buildAnswersData(concept);
    expect(Object.keys(answers)).toHaveLength(10);
    expect(answers['sample.q01']).toEqual({
      correct: 'a',
      explanationHtml: '<p>正解の理由</p>\n',
      wrongReasonsHtml: { b: '<p>誤りの理由 b</p>\n', c: '<p>誤りの理由 c</p>\n', d: '<p>誤りの理由 d</p>\n' },
    });
  });
});
