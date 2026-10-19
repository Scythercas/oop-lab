// 学習データの読み書き（詳細設計書 §2.3・§6）。localStorage を使ってよいのは、このモジュールだけ（SA-02）。
// 画面の部品は、この LearningStore だけを通して学習データを読み書きする（NFR-15 ①）。
import {
  BROKEN_DATA_KEY,
  EXPORT_FORMAT,
  LEARNING_DATA_KEY,
  type LearningData,
  cloneData,
  createInitialData,
  parseLearningData,
} from './learning-data.ts';

export type StoreStatus = 'ok' | 'unavailable' | 'newer-version';
export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota-exceeded' | 'newer-version' };
export type ImportResult = { ok: true } | { ok: false; reason: string };

/** 画面上部の帯で知らせること（§5.5） */
export type StoreNotice = 'unavailable' | 'quota-exceeded' | 'broken' | 'newer-version';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageEventSource {
  addEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
}

export interface LearningStore {
  readonly status: StoreStatus;
  get(): Readonly<LearningData>;
  update(change: (data: LearningData) => void): SaveResult;
  clear(): SaveResult;
  subscribe(listener: (data: Readonly<LearningData>) => void): () => void;
  /** 帯で知らせることが起きたときに呼ぶ（登録より前に起きたことも、登録した直後に呼ぶ） */
  onNotice(listener: (notice: StoreNotice) => void): () => void;
  exportJson(): string;
  importJson(text: string): ImportResult;
  /** 壊れていた学習データの退避先の中身（K28）。なければ null */
  readBrokenBackup(): string | null;
}

export interface StoreOptions {
  /** 既定は window.localStorage。使えないときは null */
  storage?: StorageLike | null;
  now?: () => string;
  /** 他のタブでの変更を知らせる storage イベントの発生元（既定は window） */
  events?: StorageEventSource | null;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function defaultEvents(): StorageEventSource | null {
  return typeof window === 'undefined' ? null : window;
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

export function createLocalLearningStore(options: StoreOptions = {}): LearningStore {
  const now = options.now ?? (() => new Date().toISOString());
  const listeners = new Set<(data: Readonly<LearningData>) => void>();
  const noticeListeners = new Set<(notice: StoreNotice) => void>();
  const notices: StoreNotice[] = [];
  let storage: StorageLike | null = options.storage === undefined ? defaultStorage() : options.storage;
  let status: StoreStatus = 'ok';
  let memory: LearningData = createInitialData(now());

  const notify = () => {
    for (const listener of listeners) listener(memory);
  };
  const raiseNotice = (notice: StoreNotice) => {
    notices.push(notice);
    for (const listener of noticeListeners) listener(notice);
  };
  const becomeUnavailable = () => {
    storage = null;
    status = 'unavailable';
    raiseNotice('unavailable');
  };

  /** localStorage から最新を読む（§6.4）。新しい版なら undefined、壊れていれば退避して初期化する */
  const readLatest = (store: StorageLike): LearningData | undefined => {
    const raw = store.getItem(LEARNING_DATA_KEY);
    const outcome = parseLearningData(raw, now());
    if (outcome.kind === 'ok') {
      if (outcome.changed) store.setItem(LEARNING_DATA_KEY, JSON.stringify(outcome.data));
      return outcome.data;
    }
    if (outcome.kind === 'newer') {
      status = 'newer-version';
      raiseNotice('newer-version');
      return undefined;
    }
    store.setItem(BROKEN_DATA_KEY, raw ?? '');
    const initial = createInitialData(now());
    store.setItem(LEARNING_DATA_KEY, JSON.stringify(initial));
    raiseNotice('broken');
    return initial;
  };

  /** 保存できないあいだは、そのページを表示している間だけメモリ上で記録する（§6.3） */
  const updateMemoryOnly = (change: (data: LearningData) => void): SaveResult => {
    const next = cloneData(memory);
    change(next);
    next.updatedAt = now();
    memory = next;
    notify();
    return { ok: false, reason: status === 'newer-version' ? 'newer-version' : 'unavailable' };
  };

  const update = (change: (data: LearningData) => void): SaveResult => {
    if (status !== 'ok' || storage === null) return updateMemoryOnly(change);
    try {
      // 他のタブで書き込まれた内容を消さないよう、書き込む直前に読み直す（§6.3）
      const latest = readLatest(storage);
      if (latest === undefined) return updateMemoryOnly(change);
      const next = cloneData(latest);
      change(next);
      next.updatedAt = now();
      storage.setItem(LEARNING_DATA_KEY, JSON.stringify(next));
      memory = next;
      notify();
      return { ok: true };
    } catch (error) {
      if (isQuotaError(error)) {
        raiseNotice('quota-exceeded');
        return { ok: false, reason: 'quota-exceeded' };
      }
      becomeUnavailable();
      return updateMemoryOnly(change);
    }
  };

  if (storage === null) {
    status = 'unavailable';
    raiseNotice('unavailable');
  } else {
    try {
      memory = readLatest(storage) ?? memory;
    } catch {
      becomeUnavailable();
    }
  }

  const events = options.events === undefined ? defaultEvents() : options.events;
  events?.addEventListener('storage', (event) => {
    if (status !== 'ok' || storage === null || event.key !== LEARNING_DATA_KEY) return;
    try {
      const latest = readLatest(storage);
      if (latest !== undefined) {
        memory = latest;
        notify();
      }
    } catch {
      // 読めないときは、手元の内容のまま続ける
    }
  });

  return {
    get status() {
      return status;
    },
    get: () => memory,
    update,
    clear() {
      memory = createInitialData(now());
      let result: SaveResult = { ok: false, reason: status === 'newer-version' ? 'newer-version' : 'unavailable' };
      if (status === 'ok' && storage !== null) {
        try {
          storage.removeItem(LEARNING_DATA_KEY);
          storage.removeItem(BROKEN_DATA_KEY);
          result = { ok: true };
        } catch {
          becomeUnavailable();
        }
      }
      notify();
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onNotice(listener) {
      noticeListeners.add(listener);
      for (const notice of notices) listener(notice);
      return () => noticeListeners.delete(listener);
    },
    exportJson: () => `${JSON.stringify({ format: EXPORT_FORMAT, ...memory }, null, 2)}\n`,
    importJson(text) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, reason: 'JSON として読めません' };
      }
      if (typeof parsed !== 'object' || parsed === null || (parsed as { format?: unknown }).format !== EXPORT_FORMAT) {
        return { ok: false, reason: 'このアプリで書き出したファイルではありません' };
      }
      const body: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
      delete body.format;
      const outcome = parseLearningData(JSON.stringify(body), now());
      if (outcome.kind === 'newer') return { ok: false, reason: '新しい版のアプリで書き出したファイルです' };
      if (outcome.kind === 'broken') return { ok: false, reason: outcome.reason };
      const imported = outcome.data;
      const result = update((data) => {
        data.settings = imported.settings;
        data.explanations = imported.explanations;
        data.quiz = imported.quiz;
        data.exercises = imported.exercises;
      });
      return result.ok ? { ok: true } : { ok: false, reason: '保存できませんでした' };
    },
    readBrokenBackup() {
      try {
        return storage?.getItem(BROKEN_DATA_KEY) ?? null;
      } catch {
        return null;
      }
    },
  };
}
