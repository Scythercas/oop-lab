// 表示言語を決める先頭スクリプトの生成（詳細設計書 §5.4）。
// 描画の前に動く必要があるため、学習データストアを通さず localStorage を読み取り専用で直接読む（§2.1 の例外）。
// キー名・版・項目の場所は学習データストアの定数から作り、二重に持たない。
import { createHash } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, LEARNING_DATA_KEY } from '../domain/learning-data.ts';

/**
 * 記録された表示言語が読めて、版が同じで、知っている言語なら <html data-lang> を書き換える。
 * それ以外（保存領域が使えない、壊れている、版が違う、知らない言語）は何もしない（既定の Java のまま）。
 */
export function buildHeadScript(languageIds: readonly string[]): string {
  return [
    '(function(){try{',
    `var r=localStorage.getItem(${JSON.stringify(LEARNING_DATA_KEY)});if(!r)return;`,
    'var d=JSON.parse(r);',
    `if(!d||d.schemaVersion!==${CURRENT_SCHEMA_VERSION}||!d.settings)return;`,
    'var l=d.settings.displayLanguage;',
    `if(${JSON.stringify(languageIds)}.indexOf(l)>=0)document.documentElement.setAttribute("data-lang",l);`,
    '}catch(e){}})();',
  ].join('');
}

/** CSP の script-src に入れるハッシュ値（Astro の security.csp.scriptDirective.hashes の形） */
export function scriptHash(script: string): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}`;
}

/**
 * 表示言語に従う領域（data-follow-lang）の中で、表示言語と違う言語の表示（data-lang-block）を隠す CSS（§5.4 の3）。
 * 言語は languages.yaml から作るので、言語を足してもコードを変えずに済む（NFR-09）。
 */
export function buildLanguageCss(languageIds: readonly string[]): string {
  return languageIds
    .map((id) => {
      const value = JSON.stringify(id);
      return `html[data-lang=${value}] [data-follow-lang] [data-lang-block]:not([data-lang-block=${value}]){display:none}`;
    })
    .join('\n');
}
