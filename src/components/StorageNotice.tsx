// 学習データを保存できないときなどに出す帯（詳細設計書 §5.5）
import { useEffect, useState } from 'react';
import type { StoreNotice } from '../domain/learning-store.ts';
import { getStore } from './learning-store-client.ts';

const MESSAGES: Record<StoreNotice, string> = {
  unavailable: '学習の記録を保存できません（ブラウザの設定やプライベートモードの可能性があります）。このページを表示している間だけ記録します。',
  'quota-exceeded': '保存できる容量を超えたため、記録できませんでした。「学習データ」の画面で、不要な記録を消してください。',
  broken: '学習の記録が読み込めなかったため、初期化しました。元の内容は「学習データ」の画面から書き出せます。',
  'newer-version': '新しい版のアプリで保存された記録があります。ページを再読み込みしてください。',
};

export default function StorageNotice() {
  const [notices, setNotices] = useState<StoreNotice[]>([]);

  useEffect(
    () =>
      getStore().onNotice((notice) => {
        setNotices((current) => (current.includes(notice) ? current : [...current, notice]));
      }),
    [],
  );

  if (notices.length === 0) return null;
  return (
    // 帯は動き始めてからしか出ないので、いつも動き始めた目印を付ける
    <div className="storage-notice" role="status" data-hydrated="">
      {notices.map((notice) => (
        <p key={notice}>{MESSAGES[notice]}</p>
      ))}
    </div>
  );
}
