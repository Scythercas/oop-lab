// 異常系のシステムテスト（テスト計画書 §6.2 の ST-E01〜ST-E08）
import { expect, test } from '@playwright/test';
import { BROKEN_DATA_KEY, LEARNING_DATA_KEY, SAMPLE, SECOND, learningData, readLearningData, seedStorage, waitForHydration } from './helpers';

async function answerFirstQuestion(page: import('@playwright/test').Page, choice = 'A.') {
  await page.getByRole('radio', { name: new RegExp(`^${choice.replace('.', '\\.')}`) }).check();
  await page.getByRole('button', { name: '解答する' }).click();
}

test('ST-E01: 保存領域が使えないときは帯で知らせ、学習は続けられる', async ({ page }) => {
  await page.addInitScript(() => {
    const fail = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    Storage.prototype.getItem = fail;
    Storage.prototype.setItem = fail;
    Storage.prototype.removeItem = fail;
  });
  await page.goto(`/concepts/${SAMPLE}/quiz/`);
  await waitForHydration(page);
  await expect(page.getByRole('status').filter({ hasText: '学習の記録を保存できません' })).toBeVisible();
  await answerFirstQuestion(page);
  await expect(page.getByText('○ 正解')).toBeVisible();
});

test('ST-E02: 壊れた学習データは帯で知らせて初期化し、退避した記録を書き出せる', async ({ page }) => {
  await seedStorage(page, { [LEARNING_DATA_KEY]: '{壊れた' });
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByRole('status').filter({ hasText: '学習の記録が読み込めなかったため、初期化しました。' })).toBeVisible();
  expect((await readLearningData(page))?.schemaVersion).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), BROKEN_DATA_KEY)).toBe('{壊れた');

  await page.goto('/my/');
  await waitForHydration(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '退避した記録を書き出す' }).click();
  expect((await downloading).suggestedFilename()).toMatch(/^oop-lab-broken-\d{4}-\d{2}-\d{2}\.json$/);
});

test('ST-E03: 新しい版の学習データは、帯で再読み込みを促し、上書きしない', async ({ page }) => {
  const newer = JSON.stringify({ schemaVersion: 99, future: true });
  await seedStorage(page, { [LEARNING_DATA_KEY]: newer });
  await page.goto(`/concepts/${SAMPLE}/quiz/`);
  await waitForHydration(page);
  await expect(page.getByRole('status').filter({ hasText: '新しい版のアプリで保存された記録があります。' })).toBeVisible();
  await answerFirstQuestion(page);
  await expect(page.getByText('○ 正解')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), LEARNING_DATA_KEY)).toBe(newer);
});

test('ST-E04: 2つのタブで別々の設問に解答すると、両方の記録が残る', async ({ context }) => {
  // 両方のタブを先に開いておく（2つ目のタブの手元の記録は、1つ目のタブが解答する前のもの）
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(`/concepts/${SAMPLE}/quiz/`);
  await second.goto(`/concepts/${SECOND}/quiz/`);
  await waitForHydration(first);
  await waitForHydration(second);
  await answerFirstQuestion(first);
  await expect(first.getByText('○ 正解')).toBeVisible();
  await answerFirstQuestion(second);
  await expect(second.getByText('○ 正解')).toBeVisible();

  const saved = await readLearningData(first);
  expect(Object.keys(saved?.quiz ?? {}).sort()).toEqual([`${SAMPLE}.q01`, `${SECOND}.q01`]);
});

test('ST-E05: 教材にない設問の記録を含む学習データでも、画面がエラーにならない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seedStorage(page, {
    [LEARNING_DATA_KEY]: JSON.stringify(
      learningData((data) => {
        data.quiz['deleted.q99'] = { correct: true, answeredAt: data.updatedAt };
        data.explanations['deleted'] = { readAt: data.updatedAt };
        data.exercises['deleted.ex01'] = { drafts: {}, evaluations: { self: { results: { 'deleted.ex01.c1': true }, evaluatedAt: data.updatedAt } } };
      }),
    ),
  });
  for (const path of ['/', '/my/', `/concepts/${SAMPLE}/quiz/`, `/concepts/${SAMPLE}/exercise/`]) {
    await page.goto(path);
    await waitForHydration(page);
  }
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.locator('.concept-card').nth(0)).toContainText('クイズ 0 / 10 問正解');
  expect(errors).toEqual([]);
});

test('ST-E06: 正解データを取得できないときは、判定できなかった旨を出し、記録しない', async ({ page }) => {
  await page.route('**/data/answers/*.json', (route) => route.abort());
  await page.goto(`/concepts/${SAMPLE}/quiz/`);
  await waitForHydration(page);
  await answerFirstQuestion(page);
  await expect(page.getByRole('alert')).toHaveText('判定できませんでした。通信状態を確かめて、もう一度解答してください。');
  expect((await readLearningData(page))?.quiz ?? {}).toEqual({});

  // 次の解答で取得をやり直す
  await page.unroute('**/data/answers/*.json');
  await expect(page.getByRole('button', { name: '解答する' })).toBeEnabled();
  await page.getByRole('button', { name: '解答する' }).click();
  await expect(page.getByText('○ 正解')).toBeVisible();
});

test.describe('JavaScript が動かないとき', () => {
  test.use({ javaScriptEnabled: false });

  test('ST-E07: 解説と既定の言語（Java）のコードが読め、対話部品の場所に案内が出る', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/`);
    await expect(page.getByRole('heading', { level: 2, name: '定義' })).toBeVisible();
    await page.goto(`/concepts/${SAMPLE}/compare/`);
    const visible = page.locator('[data-lang-block]:visible');
    await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute('data-lang-block', 'java');
    await expect(visible.locator('.code-table')).toContainText('class Lamp');
    // Playwright で JavaScript を切っても、HTML の解析はスクリプトが有効な扱いのままなので、<noscript> の中身は描画されない。
    // そのため、案内と、動かない部品を隠す指定が <noscript> に入っていることを確かめる（本物のブラウザでは描画される）
    const notices = await page.locator('noscript').allTextContents();
    expect(notices.some((text) => text.includes('この操作には JavaScript が必要です。ブラウザの設定で JavaScript を有効にしてください。'))).toBe(true);
    expect(notices.some((text) => text.includes('.js-only{display:none'))).toBe(true);
    await expect(page.locator('.js-only').first()).toBeAttached();
  });
});

test('ST-E08: 保存領域がいっぱいのときは、容量不足の帯が出て、既存の記録は残る', async ({ page }) => {
  const existing = JSON.stringify(learningData((data) => (data.explanations[SAMPLE] = { readAt: data.updatedAt })));
  await seedStorage(page, { [LEARNING_DATA_KEY]: existing });
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key && sessionStorage.getItem('e2e-seeded') !== null && document.readyState !== 'loading') {
        throw new DOMException('full', 'QuotaExceededError');
      }
      original.call(this, name, value);
    };
  }, LEARNING_DATA_KEY);
  await page.goto(`/concepts/${SAMPLE}/quiz/`);
  await waitForHydration(page);
  await answerFirstQuestion(page);
  await expect(page.getByRole('status').filter({ hasText: '保存できる容量を超えたため、記録できませんでした。' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), LEARNING_DATA_KEY)).toBe(existing);
});
