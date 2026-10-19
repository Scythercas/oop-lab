// 進捗の集計（詳細設計書 §6.7）。教材から消えた設問やチェック項目の記録は数えない（NFR-11）
import type { LearningData } from './learning-data.ts';

/** 集計に使う、概念ごとの教材の骨組み（ビルド時に作って画面に埋め込む） */
export interface ConceptOutline {
  id: string;
  questionIds: string[];
  exercises: { id: string; checkIds: string[] }[];
}

export interface ConceptProgress {
  conceptId: string;
  explanationRead: boolean;
  quiz: { correct: number; total: number };
  checks: { done: number; total: number };
}

/** 自己評価の評価方法（NFR-15 ④。将来の採点は別の評価方法として並ぶ） */
export const SELF_EVALUATION = 'self';

export function summarizeProgress(data: LearningData, outline: ConceptOutline): ConceptProgress {
  const correct = outline.questionIds.filter((id) => data.quiz[id]?.correct === true).length;
  let done = 0;
  let total = 0;
  for (const exercise of outline.exercises) {
    const results = data.exercises[exercise.id]?.evaluations[SELF_EVALUATION]?.results ?? {};
    total += exercise.checkIds.length;
    done += exercise.checkIds.filter((id) => results[id] === true).length;
  }
  return {
    conceptId: outline.id,
    explanationRead: data.explanations[outline.id] !== undefined,
    quiz: { correct, total: outline.questionIds.length },
    checks: { done, total },
  };
}
