// 非機能のシステムテスト（テスト計画書 §6.3 の NT-01・02・04〜07・10）
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { ALL_PAGES, SAMPLE, recordCspViolations, waitForHydration } from './helpers';

/** 主な操作（設計の切り替え・変更要求の選択・クイズの解答・エディタの読み込み・表示言語の切り替え） */
async function operateEverything(page: Page): Promise<void> {
  await page.goto(`/concepts/${SAMPLE}/compare/`);
  await waitForHydration(page);
  await page.getByLabel('右', { exact: true }).selectOption('overapplied');
  await page.getByRole('group', { name: '表示言語' }).getByRole('button', { name: 'C++' }).click();
  await page.goto(`/concepts/${SAMPLE}/change/`);
  await waitForHydration(page);
  await page.getByRole('radio', { name: '変更 rename-rear' }).check();
  await page.goto(`/concepts/${SAMPLE}/quiz/`);
  await waitForHydration(page);
  await page.getByRole('radio', { name: /^A\./ }).check();
  await page.getByRole('button', { name: '解答する' }).click();
  await expect(page.getByText('○ 正解')).toBeVisible();
  await page.goto(`/concepts/${SAMPLE}/exercise/`);
  await waitForHydration(page);
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('button', { name: '解答を確認' }).click();
  await page.getByRole('group', { name: '表示言語' }).getByRole('button', { name: 'Java' }).click();
}

test('NT-01: 全画面の操作中に、自分のドメイン以外への通信がない', async ({ page, baseURL }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL!) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });
  for (const path of [...ALL_PAGES, '/no-such-page/']) await page.goto(path, { waitUntil: 'networkidle' });
  await operateEverything(page);
  expect(external).toEqual([]);
});

test('NT-02: 設計の切り替え・変更要求の選択・表示言語の切り替えが0.5秒以内に反映される', async ({ page }) => {
  await page.goto(`/concepts/${SAMPLE}/compare/`);
  await waitForHydration(page);
  // 画面の中で、操作してから表示が変わるまでの時間を測る
  const designSwitch = await page.evaluate(async () => {
    const select = [...document.querySelectorAll('select')].find((item) => item.labels?.[0]?.textContent === '右')!;
    const start = performance.now();
    select.value = 'overapplied';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return new Promise<number>((resolve) => {
      const check = () =>
        document.querySelector('[data-lang-block="java"] .file-list')?.textContent?.includes('Describable.java')
          ? resolve(performance.now() - start)
          : requestAnimationFrame(check);
      check();
    });
  });
  const languageSwitch = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>('.language-switcher__button[data-value="cpp"]')!;
    const start = performance.now();
    button.click();
    return new Promise<number>((resolve) => {
      const check = () =>
        (document.querySelector<HTMLElement>('[data-lang-block="cpp"]')?.offsetParent ?? null) !== null
          ? resolve(performance.now() - start)
          : requestAnimationFrame(check);
      check();
    });
  });
  await page.goto(`/concepts/${SAMPLE}/change/`);
  await waitForHydration(page);
  const changeSelect = await page.evaluate(async () => {
    const radio = [...document.querySelectorAll<HTMLInputElement>('input[type=radio]')].find((item) => item.value.endsWith('rename-rear'))!;
    const start = performance.now();
    radio.click();
    return new Promise<number>((resolve) => {
      const check = () =>
        [...document.querySelectorAll('[data-lang-block="cpp"] .is-added')].some((cell) => cell.textContent?.includes('テールランプ'))
          ? resolve(performance.now() - start)
          : requestAnimationFrame(check);
      check();
    });
  });
  test.info().annotations.push({ type: '計測（ミリ秒）', description: JSON.stringify({ designSwitch, languageSwitch, changeSelect }) });
  expect(designSwitch).toBeLessThan(500);
  expect(languageSwitch).toBeLessThan(500);
  expect(changeSelect).toBeLessThan(500);
});

test('NT-04: 自動のアクセシビリティ検査で、重大な違反がない', async ({ page }) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  for (const path of ALL_PAGES) {
    await page.goto(path);
    await waitForHydration(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const violation of results.violations) {
      if (violation.impact === 'critical' || violation.impact === 'serious') {
        problems.push(`${path} ${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(' | ')}`);
      }
    }
  }
  expect(problems).toEqual([]);
});

/** Tab を押して、条件に合う要素にフォーカスを移す */
async function tabTo(page: Page, selector: string, limit = 80): Promise<void> {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((target) => document.activeElement?.matches(target) ?? false, selector)) return;
  }
  throw new Error(`Tab で ${selector} に移れませんでした`);
}

test('NT-05: 主要な操作をキーボードだけで行える', async ({ page, browserName }) => {
  // macOS 流の WebKit は、Tab でリンクに移らない設定が既定のため、Alt+Tab の代わりにリンクだけフォーカスで確かめる
  await page.goto('/');
  await waitForHydration(page);
  if (browserName === 'webkit') await page.getByRole('link', { name: 'サンプル' }).focus();
  else await tabTo(page, `a[href="/concepts/${SAMPLE}/"]`);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/concepts/${SAMPLE}/$`));
  await waitForHydration(page);

  // 表示言語の切り替え
  await tabTo(page, '.language-switcher__button[data-value="vba"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-lang', 'vba');

  // 設計の切り替え（選択欄にフォーカスし、矢印キーで選ぶ）
  await page.goto(`/concepts/${SAMPLE}/compare/`);
  await waitForHydration(page);
  await tabTo(page, 'select');
  await tabTo(page, 'select');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('右', { exact: true })).toHaveValue('overapplied');

  // 変更要求の選択
  await page.goto(`/concepts/${SAMPLE}/change/`);
  await waitForHydration(page);
  await tabTo(page, 'input[type=radio]');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: '変更 rename-rear' })).toBeChecked();

  // クイズの解答
  await page.goto(`/concepts/${SAMPLE}/quiz/`);
  await waitForHydration(page);
  await tabTo(page, 'input[type=radio]');
  await page.keyboard.press('Space');
  await tabTo(page, 'button.button--primary');
  await page.keyboard.press('Enter');
  await expect(page.getByText('○ 正解')).toBeVisible();
});

test('NT-06: 画面の操作中に、CSP の違反が記録されない', async ({ page }) => {
  const violations = await recordCspViolations(page);
  for (const path of ALL_PAGES) {
    await page.goto(path, { waitUntil: 'networkidle' });
    expect(await violations(), path).toEqual([]);
  }
  await operateEverything(page);
  expect(await violations()).toEqual([]);
});

test('NT-07: 画面幅1024px で、ページ全体が横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const path of ALL_PAGES) {
    await page.goto(path);
    await waitForHydration(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('NT-10: Cookie を使わない', async ({ page, context }) => {
  const setCookies: string[] = [];
  page.on('response', (response) => {
    const header = response.headers()['set-cookie'];
    if (header !== undefined) setCookies.push(`${response.url()}: ${header}`);
  });
  for (const path of ALL_PAGES) await page.goto(path);
  await operateEverything(page);
  expect(setCookies).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(await context.cookies()).toEqual([]);
});
