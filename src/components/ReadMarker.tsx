// 解説の「読み終えた」（要件定義書 FR-070、詳細設計書 K17）
import { getStore, hydratedMark, useHydrated, useLearningData } from './learning-store-client.ts';

interface Props {
  conceptId: string;
}

export default function ReadMarker({ conceptId }: Props) {
  const data = useLearningData();
  const hydrated = useHydrated();
  const read = hydrated && data.explanations[conceptId] !== undefined;

  const toggle = () =>
    getStore().update((next) => {
      if (next.explanations[conceptId] === undefined) next.explanations[conceptId] = { readAt: new Date().toISOString() };
      else delete next.explanations[conceptId];
    });

  return (
    <div className="read-marker" {...hydratedMark(hydrated)}>
      <button type="button" className="button" aria-pressed={hydrated ? read : undefined} onClick={toggle}>
        {read ? '✓ 読み終えた（取り消す）' : '読み終えた'}
      </button>
    </div>
  );
}
