// ビルド時の検証 B01: 変更要求の期待と修正行数の照合（詳細設計書 §4.4、要件定義書 CR-05）
import type { Diagnostic } from '../content/diagnostics.ts';
import type { Content } from '../content/loader.ts';
import { diffStates } from './diff.ts';

export interface ExpectationResult {
  changeId: string;
  languageId: string;
  unapplied: number;
  proper: number;
  satisfied: boolean;
}

/** 全言語で、適切な設計と未適用の設計の修正行数を比べる。過剰適用は照合しない（解説で扱う） */
export function evaluateExpectations(content: Content): ExpectationResult[] {
  const results: ExpectationResult[] = [];
  for (const concept of content.concepts) {
    const unappliedBase = concept.designs.find((design) => design.kind === 'unapplied')?.code;
    const properBase = concept.designs.find((design) => design.kind === 'proper')?.code;
    for (const change of concept.changes) {
      for (const language of content.languages) {
        const unapplied = diffStates(unappliedBase?.[language.id] ?? [], change.code.unapplied?.[language.id] ?? []).metrics.changedLines;
        const proper = diffStates(properBase?.[language.id] ?? [], change.code.proper?.[language.id] ?? []).metrics.changedLines;
        const satisfied = change.expectation === 'proper-fewer' ? proper < unapplied : proper >= unapplied;
        results.push({ changeId: change.id, languageId: language.id, unapplied, proper, satisfied });
      }
    }
  }
  return results;
}

export function checkExpectations(content: Content): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const results = evaluateExpectations(content);
  for (const concept of content.concepts) {
    for (const change of concept.changes) {
      for (const result of results.filter((item) => item.changeId === change.id && !item.satisfied)) {
        const label = content.languages.find((language) => language.id === result.languageId)?.label ?? result.languageId;
        const expected =
          change.expectation === 'proper-fewer' ? '適切のほうが少ない（proper-fewer）' : '適切のほうが少なくない（proper-not-fewer）';
        diagnostics.push({
          rule: 'B01',
          level: 'error',
          file: `concepts/${concept.folder}/changes/${change.name}/change.yaml`,
          message: `${label}: 修正行数が 適切 ${result.proper} 行・未適用 ${result.unapplied} 行で、期待「${expected}」と合いません`,
        });
      }
    }
  }
  return diagnostics;
}
