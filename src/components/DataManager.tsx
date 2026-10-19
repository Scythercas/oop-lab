// 学習データの全消去・書き出し・読み込み、壊れた記録の書き出し（要件定義書 FR-072・FR-073、詳細設計書 §6.5・K28）
import { useRef, useState } from 'react';
import { getStore, hydratedMark, useHydrated } from './learning-store-client.ts';

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DataManager() {
  const hydrated = useHydrated();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const broken = hydrated ? getStore().readBrokenBackup() : null;

  const clearAll = () => {
    if (!window.confirm('学習の記録をすべて消します。元に戻せません。よろしいですか。')) return;
    const result = getStore().clear();
    setMessage(result.ok ? '学習の記録をすべて消しました。' : '学習の記録を消せませんでした。');
  };

  const importFile = async (file: File) => {
    if (!window.confirm('今の学習の記録を、ファイルの内容で置き換えます。よろしいですか。')) return;
    const result = getStore().importJson(await file.text());
    setMessage(
      result.ok ? 'ファイルから学習の記録を読み込みました。' : `ファイルの形式が正しくないため、読み込めませんでした（${result.reason}）。今の記録はそのままです。`,
    );
  };

  return (
    <div className="data-manager" {...hydratedMark(hydrated)}>
      <div className="data-manager__actions">
        <button type="button" className="button" disabled={!hydrated} onClick={() => download(`oop-lab-${today()}.json`, getStore().exportJson())}>
          記録をファイルに書き出す
        </button>
        <button type="button" className="button" disabled={!hydrated} onClick={() => fileInput.current?.click()}>
          ファイルから読み込む
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void importFile(file);
            event.target.value = '';
          }}
        />
        <button type="button" className="button button--danger" disabled={!hydrated} onClick={clearAll}>
          記録をすべて消す
        </button>
      </div>
      {broken !== null && (
        <p>
          読み込めなかった以前の記録を退避しています。
          <button type="button" className="button button--link" onClick={() => download(`oop-lab-broken-${today()}.json`, broken)}>
            退避した記録を書き出す
          </button>
        </p>
      )}
      <p className="data-manager__message" role="status">
        {message}
      </p>
    </div>
  );
}
