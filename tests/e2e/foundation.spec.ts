import { expect, test } from '@playwright/test';

// M1 の土台の確認。画面ができたら、テスト計画書 §6 のシステムテストを足していく。

test('トップに「公開準備中」の表示と使い方が出る', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('公開準備中');
  await expect(page.getByRole('heading', { level: 1, name: 'オブジェクト指向ラボ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '使い方' })).toBeVisible();
});

test('このサイトについて: 規約・ポリシー・ライセンス・報告先が出る（ST-16）', async ({ page }) => {
  await page.goto('/about/');
  for (const name of ['利用規約', 'プライバシーポリシー', 'ライセンス', '誤りの報告']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await expect(page.getByText('ISO 26262')).toBeVisible();
  const report = page.getByRole('link', { name: 'GitHub Issues' }).first();
  await expect(report).toHaveAttribute('href', 'https://github.com/Scythercas/oop-lab/issues/new');

  // フォントのライセンスが一覧に入っている（IT-04 を画面でも確かめる）
  await page.getByText('一覧を開く').click();
  await expect(page.getByRole('row', { name: /@fontsource-variable\/noto-sans-jp .* OFL-1\.1/ })).toBeVisible();
});

test('存在しない URL では「ページが見つかりません」を返す（ST-02 の一部）', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'ページが見つかりません' })).toBeVisible();
});

test('自分のドメイン以外へ通信しない（NT-01）', async ({ page, baseURL }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL!) && !url.startsWith('data:')) external.push(url);
  });
  for (const path of ['/', '/about/', '/no-such-page/']) {
    await page.goto(path, { waitUntil: 'networkidle' });
  }
  expect(external).toEqual([]);
});

test('Cookie を使わない（NT-10）', async ({ page, context }) => {
  const response = await page.goto('/');
  expect(response?.headers()['set-cookie']).toBeUndefined();
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(await context.cookies()).toEqual([]);
});

test('配信時のヘッダと CSP（NT-06）', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy|securitypolicyviolation/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`securitypolicyviolation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  for (const path of ['/', '/about/']) {
    const response = await page.goto(path, { waitUntil: 'networkidle' });
    const headers = response!.headers();
    expect(headers['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    // ページごとの CSP は meta 要素で出ている（詳細設計書 §9.3）
    const meta = page.locator('meta[http-equiv="content-security-policy"]');
    await expect(meta).toHaveCount(1);
    await expect(meta).toHaveAttribute('content', /default-src 'self'/);
  }
  expect(violations).toEqual([]);
});
