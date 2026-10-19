// E2E テストの共通の補助（テスト計画書 §6）。サイトは npm run build:e2e でテスト用教材から作る
import type { Page } from '@playwright/test';

export const LEARNING_DATA_KEY = 'oop-lab.learning-data';
export const BROKEN_DATA_KEY = 'oop-lab.learning-data.broken';

/** テスト用教材の概念（tests/e2e/build-site.ts） */
export const SAMPLE = 'sample';
export const SECOND = 'second';

/** すべての画面（NT-01・NT-04・NT-06・NT-07 で巡回する） */
export const ALL_PAGES = [
  '/',
  '/my/',
  '/about/',
  ...[SAMPLE, SECOND].flatMap((id) => ['', 'compare/', 'change/', 'quiz/', 'exercise/'].map((tab) => `/concepts/${id}/${tab}`)),
];

export interface LearningDataLike {
  schemaVersion: number;
  updatedAt: string;
  settings: { displayLanguage: string };
  explanations: Record<string, { readAt: string }>;
  quiz: Record<string, { correct: boolean; answeredAt: string }>;
  exercises: Record<string, unknown>;
}

export function learningData(change: (data: LearningDataLike) => void = () => {}): LearningDataLike {
  const data: LearningDataLike = {
    schemaVersion: 1,
    updatedAt: '2026-10-20T00:00:00.000Z',
    settings: { displayLanguage: 'java' },
    explanations: {},
    quiz: {},
    exercises: {},
  };
  change(data);
  return data;
}

/** ページを開く前に、localStorage に値を入れておく（最初に開いたときだけ） */
export async function seedStorage(page: Page, items: Record<string, string>): Promise<void> {
  await page.addInitScript((values) => {
    if (sessionStorage.getItem('e2e-seeded') !== null) return;
    sessionStorage.setItem('e2e-seeded', '1');
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, items);
}

export async function readLearningData(page: Page): Promise<LearningDataLike | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LEARNING_DATA_KEY);
  return raw === null ? null : (JSON.parse(raw) as LearningDataLike);
}

/** CSP の違反を記録する（NT-06） */
export async function recordCspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/Content[- ]Security[- ]Policy/i.test(message.text())) messages.push(message.text());
  });
  return async () => [
    ...messages,
    ...(await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])),
  ];
}

/**
 * 対話部品がすべて動き出すまで待つ（HTML の解析が終わり、部品のルート要素に data-hydrated が付いたら。何も描かない部品は数えない）。
 * 解析の途中だと部品の要素がまだなく、判定が空の一覧で成り立ってしまうため、readyState も見る
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.readyState !== 'loading' &&
      [...document.querySelectorAll('astro-island')].every(
        (island) => !island.hasAttribute('ssr') && (island.firstElementChild === null || island.firstElementChild.hasAttribute('data-hydrated')),
      ),
  );
}
