// 画面の部品から学習データストアを使うための入口（詳細設計書 §5.3）。
// ページの中で1つの学習データストアを共有する。
import { useEffect, useState, useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE, type LearningData, createInitialData, resolveDisplayLanguage } from '../domain/learning-data.ts';
import { type LearningStore, createLocalLearningStore } from '../domain/learning-store.ts';

let store: LearningStore | undefined;
const serverSnapshot = createInitialData('1970-01-01T00:00:00.000Z');

export function getStore(): LearningStore {
  store ??= createLocalLearningStore();
  return store;
}

/** 学習データ。サーバ側の描画（ビルド時）では初期データを返す */
export function useLearningData(): Readonly<LearningData> {
  return useSyncExternalStore(
    (listener) => getStore().subscribe(listener),
    () => getStore().get(),
    () => serverSnapshot,
  );
}

/** 部品のルート要素に付ける、動き始めた目印（E2E テストは、これが付くまで待ってから操作する） */
export function hydratedMark(hydrated: boolean): { 'data-hydrated'?: '' } {
  return hydrated ? { 'data-hydrated': '' } : {};
}

/**
 * ブラウザで部品が動き始めたら true。学習データによって変わる表示は、これが true になってから出す
 * （ビルド時に作った HTML と、ブラウザでの最初の描画を一致させるため）。
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/** 表示言語（詳細設計書 §5.4）。ブラウザで動き始める前は既定の言語 */
export function useDisplayLanguage(languageIds: readonly string[]): [string, (id: string) => void] {
  const data = useLearningData();
  const hydrated = useHydrated();
  const current = hydrated ? resolveDisplayLanguage(data, languageIds) : DEFAULT_LANGUAGE;
  const change = (id: string) => {
    document.documentElement.setAttribute('data-lang', id);
    getStore().update((next) => {
      next.settings.displayLanguage = id;
    });
  };
  return [current, change];
}
