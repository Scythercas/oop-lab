// 画面の機能のシステムテスト（テスト計画書 §6.1 の ST-01〜ST-17）。テスト用教材で、画面の動きを確かめる
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { LEARNING_DATA_KEY, SAMPLE, SECOND, learningData, readLearningData, seedStorage, waitForHydration } from './helpers';

const visibleBlock = (page: import('@playwright/test').Page) => page.locator('[data-lang-block]:visible');

async function chooseLanguage(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('group', { name: '表示言語' }).getByRole('button', { name: label, exact: true }).click();
}

test.describe('トップと移動', () => {
  test('ST-01: 概念が推奨順に並び、学習状況が出る', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    const cards = page.locator('.concept-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('サンプル');
    await expect(cards.nth(1)).toContainText('2つ目の概念');
    await expect(cards.nth(0).getByRole('list', { name: '学習状況' })).toContainText('クイズ 0 / 10 問正解');
  });

  test('ST-02: ヘッダ・タブ・関連概念のリンクで移動でき、戻るが効く', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'サンプル' }).click();
    await expect(page).toHaveURL(`/concepts/${SAMPLE}/`);
    for (const [name, path] of [
      ['設計比較', 'compare/'],
      ['変更シミュレーション', 'change/'],
      ['クイズ', 'quiz/'],
      ['実装課題', 'exercise/'],
      ['解説', ''],
    ]) {
      await page.getByRole('navigation', { name: '概念ページの切り替え' }).getByRole('link', { name }).click();
      await expect(page).toHaveURL(`/concepts/${SAMPLE}/${path}`);
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    }
    await page.getByRole('navigation', { name: '関連する概念' }).getByRole('link', { name: '2つ目の概念' }).click();
    await expect(page).toHaveURL(`/concepts/${SECOND}/`);
    await page.goBack();
    await expect(page).toHaveURL(`/concepts/${SAMPLE}/`);
    await page.getByRole('link', { name: '学習データ' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '学習の記録' })).toBeVisible();
    await page.getByRole('link', { name: '概念一覧' }).click();
    await expect(page).toHaveURL('/');
    // 各タブの URL を直接開ける
    const response = await page.goto(`/concepts/${SECOND}/quiz/`);
    expect(response?.status()).toBe(200);
  });
});

test.describe('表示言語', () => {
  test('ST-03: 切り替えるとコードがその言語になり、選んでいる設計は保たれ、再訪時は最初の描画から復元される', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/compare/`);
    await waitForHydration(page);
    await page.getByLabel('右', { exact: true }).selectOption({ label: '過剰適用' });
    await expect(visibleBlock(page).getByRole('button', { name: /Describable\.java/ })).toBeVisible();

    await chooseLanguage(page, 'C++');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'cpp');
    await expect(visibleBlock(page).getByRole('button', { name: /describable\.h/ })).toBeVisible();
    await expect(page.getByLabel('右', { exact: true })).toHaveValue('overapplied');

    // 再訪: 描画（body の作成）の時点で、すでに C++ になっている
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.body !== null) {
          (window as unknown as { __langAtBody?: string }).__langAtBody = document.documentElement.dataset.lang;
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.goto(`/concepts/${SAMPLE}/`);
    expect(await page.evaluate(() => (window as unknown as { __langAtBody?: string }).__langAtBody)).toBe('cpp');
    await waitForHydration(page);
    await expect(page.getByRole('group', { name: '表示言語' }).getByRole('button', { name: 'C++' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('ST-04: 直接表現できない言語では、コードの上に注記が出る', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/compare/`);
    await waitForHydration(page);
    await expect(page.getByText('テスト用の注記です。')).toBeHidden();
    await chooseLanguage(page, 'VBA');
    await expect(visibleBlock(page).getByRole('note')).toHaveText('テスト用の注記です。');
    await expect(visibleBlock(page).getByRole('button', { name: /Lamp\.cls/ })).toBeVisible();
  });
});

test.describe('解説', () => {
  test('ST-05: 8つの要素と言語ごとの補足が出て、「読み終えた」がトップに反映される', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/`);
    await waitForHydration(page);
    for (const name of ['定義', '目的', 'メリット', 'デメリット', '使い時', '使わない方がよい時', 'よくある誤り', '関連概念']) {
      await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'VBA での補足' })).toBeHidden();
    await chooseLanguage(page, 'VBA');
    await expect(page.getByRole('heading', { name: 'VBA での補足' })).toBeVisible();
    await expect(page.getByText('VBA の補足です。')).toBeVisible();

    await page.getByRole('button', { name: '読み終えた' }).click();
    await expect(page.getByRole('button', { name: /読み終えた（取り消す）/ })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/');
    await expect(page.locator('.concept-card').nth(0)).toContainText('解説 ✓ 読了');
  });
});

test.describe('設計比較', () => {
  test('ST-06: 仕様・既定の組み合わせ・ファイルの状態・規模・差分の記号・解説が出る', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/compare/`);
    await waitForHydration(page);
    await page.getByText('仕様を見る').click();
    await expect(page.getByText('ランプの名前と状態を表示する。')).toBeVisible();

    const left = page.getByLabel('左', { exact: true });
    const right = page.getByLabel('右', { exact: true });
    await expect(left).toHaveValue('unapplied');
    await expect(right).toHaveValue('proper');
    await expect(left.locator('option')).toHaveText(['未適用', '適切', '過剰適用']);

    const block = visibleBlock(page);
    // 変更行数が最も多いファイル（追加された Lamp.java）を最初に選ぶ
    await expect(block.getByRole('button', { name: 'Lamp.java（追加）' })).toHaveAttribute('aria-pressed', 'true');
    await expect(block.getByRole('button', { name: 'Main.java（変更）' })).toBeVisible();
    await expect(block.getByRole('columnheader', { name: /未適用: 1ファイル・1クラス・\d+行/ })).toBeVisible();
    await expect(block.getByRole('columnheader', { name: /適切: 2ファイル・2クラス・\d+行/ })).toBeVisible();
    await expect(block.locator('.code-table__mark', { hasText: '+' }).first()).toBeVisible();
    await expect(block.locator('.code-table__mark').filter({ hasText: '追加' }).first()).toBeAttached();

    await block.getByRole('button', { name: 'Main.java（変更）' }).click();
    await expect(block.locator('.code-table__mark', { hasText: '-' }).first()).toBeVisible();

    await expect(page.getByRole('heading', { name: '未適用の設計について' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '適切の設計について' })).toBeVisible();

    // 左右を入れ替えると、追加と削除が入れ替わる
    await left.selectOption('proper');
    await right.selectOption('unapplied');
    await expect(block.getByRole('button', { name: 'Lamp.java（削除）' })).toBeVisible();

    // 過剰適用のない概念では、選択肢に出さない
    await page.goto(`/concepts/${SECOND}/compare/`);
    await expect(page.getByLabel('左', { exact: true }).locator('option')).toHaveText(['未適用', '適切']);
  });

  test('ST-07: 差分の表示形式（左右・1列）を切り替えられる', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/compare/`);
    await waitForHydration(page);
    await expect(visibleBlock(page).locator('.code-table--split')).toBeVisible();
    await page.getByRole('radio', { name: '1列' }).check();
    await expect(visibleBlock(page).locator('.code-table--unified')).toBeVisible();
    await expect(visibleBlock(page).locator('.code-table--split')).toHaveCount(0);
  });
});

test.describe('変更シミュレーション', () => {
  test('ST-08: 変更要求を選ぶと、差分・修正量・棒・解説が出て、設計を切り替えられる', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/change/`);
    await waitForHydration(page);
    const block = visibleBlock(page);
    await expect(page.getByRole('radio', { name: '変更 state-label' })).toBeChecked();
    const unapplied = block.getByRole('region', { name: '未適用の設計' });
    const proper = block.getByRole('region', { name: '適切の設計' });
    await expect(unapplied).toContainText('修正量: 1ファイル・1箇所');
    await expect(unapplied).toContainText('+2行 -2行');
    await expect(proper).toContainText('+1行 -1行');
    await expect(block.getByRole('figure')).toContainText('未適用4行');
    await expect(block.getByRole('figure')).toContainText('適切2行');
    for (const name of ['差が出た理由', '修正漏れが起きやすい箇所', 'この変更から分かること']) {
      await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
    }

    await page.getByLabel('2つ目の設計').selectOption({ label: '過剰適用' });
    await expect(block.getByRole('region', { name: '過剰適用の設計' })).toBeVisible();

    // 選び直すと、初期状態に新しい変更要求を当てた結果になる（前の変更は含まない）
    await page.getByRole('radio', { name: '変更 rename-rear' }).check();
    const panel = block.getByRole('region', { name: '未適用の設計' });
    await expect(panel.locator('.is-added')).toContainText(['テールランプ']);
    await expect(panel.locator('.is-added')).not.toContainText(['点灯中']);
  });
});

test.describe('クイズ', () => {
  test('ST-09: 解答すると正誤と解説が出て、結果が保存され、間違えた問題だけ解き直せる', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/quiz/`);
    await waitForHydration(page);
    for (let index = 0; index < 10; index += 1) {
      await expect(page.getByRole('heading', { level: 2, name: `問題 ${index + 1} / 10` })).toBeVisible();
      if (index === 8) {
        // コードを含む設問は、表示言語のコード
        await expect(visibleBlock(page)).toContainText('Lamp.java');
        await chooseLanguage(page, 'C++');
        await expect(visibleBlock(page)).toContainText('lamp.h');
      }
      // 1問目と2問目は間違え、ほかは正解する（正解はすべて a）
      const pick = index < 2 ? 'B.' : 'A.';
      await page.getByRole('radio', { name: new RegExp(`^${pick}`) }).check();
      await page.getByRole('button', { name: '解答する' }).click();
      if (index < 2) {
        await expect(page.getByText('× 不正解。正解は A')).toBeVisible();
        await expect(page.getByText('B が誤りである理由')).toBeVisible();
        await expect(page.getByText('誤りの理由 b')).toBeVisible();
      } else {
        await expect(page.getByText('○ 正解')).toBeVisible();
      }
      await expect(page.getByText('正解の理由')).toBeVisible();
      await page.getByRole('button', { name: index < 9 ? '次の問題へ' : '結果を見る' }).click();
    }
    await expect(page.getByText('10問中 8問 正解')).toBeVisible();
    const saved = await readLearningData(page);
    expect(saved?.quiz[`${SAMPLE}.q01`]?.correct).toBe(false);
    expect(saved?.quiz[`${SAMPLE}.q03`]?.correct).toBe(true);

    await page.getByRole('button', { name: '間違えた問題だけ解き直す' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /解き直し 問題 1 \/ 2/ })).toBeVisible();
    await page.getByRole('radio', { name: /^A\./ }).check();
    await page.getByRole('button', { name: '解答する' }).click();
    await expect(page.getByText('○ 正解')).toBeVisible();
    expect((await readLearningData(page))?.quiz[`${SAMPLE}.q01`]?.correct).toBe(true);

    await page.goto('/');
    await expect(page.locator('.concept-card').nth(0)).toContainText('クイズ 9 / 10 問正解');
  });
});

test.describe('実装課題', () => {
  test('ST-11: 実装言語・開始コード・下書きの自動保存・文字数の上限', async ({ page }) => {
    await seedStorage(page, { [LEARNING_DATA_KEY]: JSON.stringify(learningData((data) => (data.settings.displayLanguage = 'cpp'))) });
    await page.goto(`/concepts/${SAMPLE}/exercise/`);
    await waitForHydration(page);
    await expect(page.getByText('未適用のコードを書き直してください。')).toBeVisible();
    await expect(page.getByText('車幅灯を加えてください。')).toBeVisible();
    // 実装言語の初期値は表示言語
    const language = page.getByLabel('実装言語:');
    await expect(language).toHaveValue('cpp');
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('// ===== main.cpp =====');
    // 選んだ言語で色付けされる（字句ごとに span で囲まれる）
    await expect(editor.locator('.cm-line span:not([class*="Bracket"])').first()).toBeVisible();

    // 「その他」では空になり、色付けされない
    await language.selectOption('other');
    await expect(page.locator('.cm-content')).toHaveText('');
    await page.locator('.cm-content').click();
    await page.keyboard.type('class Lamp { int x; }');
    await expect(page.locator('.cm-content')).toHaveText('class Lamp { int x; }');
    // 括弧の対応の表示（cm-matchingBracket）は色付けではないので数えない
    await expect(page.locator('.cm-content .cm-line span:not([class*="Bracket"])')).toHaveCount(0);

    // 下書きは自動保存され、再訪時に戻る
    await language.selectOption('java');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('// 自分のメモ');
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByLabel('実装言語:')).toHaveValue('java');
    await expect(page.locator('.cm-content')).toContainText('// 自分のメモ');

    // 表示言語を切り替えても、実装言語と下書きは変わらない
    await chooseLanguage(page, 'VBA');
    await expect(page.getByLabel('実装言語:')).toHaveValue('java');
    await expect(page.locator('.cm-content')).toContainText('// 自分のメモ');

    // 20,000文字を超えて入力できず、案内が出る
    await page.locator('.cm-content').click();
    await page.keyboard.insertText('x'.repeat(20_000));
    await expect(page.getByText('下書きは1つの言語につき20,000文字までです。')).toBeVisible();
    await expect(page.locator('.cm-content')).not.toContainText('xxxxxxxxxx');
  });

  test('ST-12: 模範解答は実装言語で出て、その後は表示言語に合わせる。自己評価が保存される', async ({ page }) => {
    await page.goto(`/concepts/${SAMPLE}/exercise/`);
    await waitForHydration(page);
    await expect(page.getByText('あなたのコードは実行・採点されず、このブラウザの外にも送られません。評価は自己評価です。')).toBeVisible();
    await page.getByLabel('実装言語:').selectOption('vba');
    // エディタが VBA の開始コードに入れ替わってから確認する
    await expect(page.locator('.cm-content')).toContainText("' ===== Program.bas =====");
    await page.getByRole('button', { name: '解答を確認' }).click();
    await expect(page.getByRole('heading', { name: '模範解答（VBA）' })).toBeVisible();
    await expect(page.getByRole('group', { name: '模範解答のファイル' })).toContainText('Lamp.cls');

    await chooseLanguage(page, 'C++');
    await expect(page.getByRole('heading', { name: '模範解答（C++）' })).toBeVisible();
    await expect(page.getByLabel('実装言語:')).toHaveValue('vba');

    const check = page.getByRole('group', { name: 'チェック 1' });
    await check.getByRole('radio', { name: 'できた', exact: true }).check();
    await page.getByRole('group', { name: 'チェック 2' }).getByRole('radio', { name: 'できなかった' }).check();
    const saved = await readLearningData(page);
    const evaluations = (saved?.exercises[`${SAMPLE}.ex01`] as { evaluations: { self: { results: Record<string, boolean> } } }).evaluations;
    expect(evaluations.self.results).toEqual({ [`${SAMPLE}.ex01.c1`]: true, [`${SAMPLE}.ex01.c2`]: false });

    await page.goto('/');
    await expect(page.locator('.concept-card').nth(0)).toContainText('自己チェック 1 / 3');
  });
});

test.describe('学習データ', () => {
  test('ST-14: 学習状況と保存場所の説明が出て、確認のうえで全消去できる', async ({ page }) => {
    await seedStorage(page, {
      [LEARNING_DATA_KEY]: JSON.stringify(learningData((data) => (data.quiz[`${SAMPLE}.q01`] = { correct: true, answeredAt: data.updatedAt }))),
    });
    await page.goto('/my/');
    await waitForHydration(page);
    await expect(page.locator('.concept-card').nth(0)).toContainText('クイズ 1 / 10 問正解');
    await expect(page.getByText('このブラウザ内にだけ保存されます。別のブラウザや端末には引き継がれません。')).toBeVisible();

    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: '記録をすべて消す' }).click();
    await expect(page.locator('.concept-card').nth(0)).toContainText('クイズ 1 / 10 問正解');

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('学習の記録をすべて消します。元に戻せません。よろしいですか。');
      void dialog.accept();
    });
    await page.getByRole('button', { name: '記録をすべて消す' }).click();
    await expect(page.getByText('学習の記録をすべて消しました。')).toBeVisible();
    await expect(page.locator('.concept-card').nth(0)).toContainText('クイズ 0 / 10 問正解');
    expect(await readLearningData(page)).toBeNull();
  });

  test('ST-15: 書き出したファイルを読み込むと元に戻り、不正なファイルは読み込まない', async ({ page }) => {
    await seedStorage(page, {
      [LEARNING_DATA_KEY]: JSON.stringify(learningData((data) => (data.explanations[SAMPLE] = { readAt: data.updatedAt }))),
    });
    await page.goto('/my/');
    await waitForHydration(page);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: '記録をファイルに書き出す' }).click();
    const exported = readFileSync((await (await downloading).path())!, 'utf8');
    expect(JSON.parse(exported)).toMatchObject({ format: 'oop-lab-learning-data', explanations: { [SAMPLE]: {} } });

    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: '記録をすべて消す' }).click();
    await expect(page.locator('.concept-card').nth(0)).toContainText('解説 未読');

    await page.locator('input[type=file]').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await expect(page.getByText('ファイルから学習の記録を読み込みました。')).toBeVisible();
    await expect(page.locator('.concept-card').nth(0)).toContainText('解説 ✓ 読了');

    await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"not":"data"}') });
    await expect(page.getByText(/ファイルの形式が正しくないため、読み込めませんでした（.+）。今の記録はそのままです。/)).toBeVisible();
    await expect(page.locator('.concept-card').nth(0)).toContainText('解説 ✓ 読了');
  });
});

test('ST-17: エディタと読み込んだファイルの中のスクリプトは、文字として表示され、実行されない', async ({ page }) => {
  const attack = '<script>window.__attacked = 1</script><img src=x onerror="window.__attacked = 2">';
  await page.goto(`/concepts/${SAMPLE}/exercise/`);
  await waitForHydration(page);
  await page.getByLabel('実装言語:').selectOption('other');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText(attack);
  await page.waitForTimeout(1500);
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.cm-content')).toHaveText(attack);
  expect(await page.evaluate(() => (window as unknown as { __attacked?: number }).__attacked)).toBeUndefined();

  // 読み込んだファイルの下書きも、文字として表示される
  const data = learningData((value) => {
    value.exercises[`${SAMPLE}.ex01`] = {
      implementationLanguage: 'java',
      drafts: { java: { code: attack, savedAt: value.updatedAt } },
      evaluations: {},
    };
  });
  await page.goto('/my/');
  await waitForHydration(page);
  page.on('dialog', (dialog) => void dialog.accept());
  const file = JSON.stringify({ format: 'oop-lab-learning-data', ...data });
  await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await expect(page.getByText('ファイルから学習の記録を読み込みました。')).toBeVisible();
  await page.goto(`/concepts/${SAMPLE}/exercise/`);
  await waitForHydration(page);
  await expect(page.locator('.cm-content')).toHaveText(attack);
  expect(await page.evaluate(() => (window as unknown as { __attacked?: number }).__attacked)).toBeUndefined();
});
