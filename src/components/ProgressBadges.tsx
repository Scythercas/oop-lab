// 概念ごとの学習状況（要件定義書 FR-002・FR-070、基本設計書 §3.4）
import { type ConceptOutline, summarizeProgress } from '../domain/progress.ts';
import { hydratedMark, useHydrated, useLearningData } from './learning-store-client.ts';

interface Props {
  outline: ConceptOutline;
}

export default function ProgressBadges({ outline }: Props) {
  const data = useLearningData();
  const hydrated = useHydrated();
  const progress = summarizeProgress(data, outline);
  const show = (text: string) => (hydrated ? text : '…');

  return (
    <ul className="progress-badges" aria-label="学習状況" {...hydratedMark(hydrated)}>
      <li>
        解説 <strong>{show(progress.explanationRead ? '✓ 読了' : '未読')}</strong>
      </li>
      <li>
        クイズ <strong>{show(`${progress.quiz.correct} / ${progress.quiz.total} 問正解`)}</strong>
      </li>
      <li>
        課題 <strong>{show(`自己チェック ${progress.checks.done} / ${progress.checks.total}`)}</strong>
      </li>
    </ul>
  );
}
