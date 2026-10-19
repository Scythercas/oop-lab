// 学習データ・学習データストア・クイズの判定・進捗の集計・先頭スクリプト
// （テスト計画書 UT-LD-01〜08、UT-LS-01〜08、UT-QJ-01〜03、UT-PROG-01・02、UT-HEAD-01）
import { describe, expect, it, vi } from 'vitest';
import { buildHeadScript, buildLanguageCss, scriptHash } from '../../src/build/head-script';
import {
  BROKEN_DATA_KEY,
  LEARNING_DATA_KEY,
  type LearningData,
  MAX_DRAFT_LENGTH,
  createInitialData,
  parseLearningData,
  resolveDisplayLanguage,
} from '../../src/domain/learning-data';
import { type StorageLike, createLocalLearningStore } from '../../src/domain/learning-store';
import { summarizeProgress } from '../../src/domain/progress';
import { QuizJudgeError, createLocalQuizJudge } from '../../src/domain/quiz-judge';

const NOW = '2026-10-20T00:00:00.000Z';

/** テスト用の保存領域。quota を超えると書き込みを失敗させられる */
class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  quota = Number.POSITIVE_INFINITY;
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException('quota', 'QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

/** storage イベントを手で起こせる発生元 */
class FakeEvents {
  private listener?: (event: StorageEvent) => void;
  addEventListener(_type: 'storage', listener: (event: StorageEvent) => void) {
    this.listener = listener;
  }
  fire(key: string) {
    this.listener?.({ key } as StorageEvent);
  }
}

function dataWith(change: (data: LearningData) => void): string {
  const data = createInitialData(NOW);
  change(data);
  return JSON.stringify(data);
}

describe('parseLearningData', () => {
  it('UT-LD-01: 学習データがないときは初期データ', () => {
    expect(parseLearningData(null, NOW)).toEqual({ kind: 'ok', data: createInitialData(NOW), changed: false });
  });

  it('UT-LD-02: 古い版は移行関数を順に当てて新しい形式にする', () => {
    const migrate = vi.fn((data: Record<string, unknown>) => ({ ...data, schemaVersion: 1, settings: { displayLanguage: data.lang } }));
    const outcome = parseLearningData(JSON.stringify({ schemaVersion: 0, lang: 'cpp' }), NOW, { 0: migrate });
    expect(migrate).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, data: { schemaVersion: 1, settings: { displayLanguage: 'cpp' } } });
    expect(parseLearningData(JSON.stringify({ schemaVersion: 0 }), NOW, {})).toEqual({ kind: 'broken', reason: '版 0 から移行できません' });
  });

  it('UT-LD-03: 新しい版は読み込まない', () => {
    expect(parseLearningData(JSON.stringify({ schemaVersion: 2 }), NOW)).toEqual({ kind: 'newer', version: 2 });
  });

  it('UT-LD-04: 全体が読めないときは broken、一部だけ形が違うときはその項目だけ捨てる', () => {
    expect(parseLearningData('{', NOW).kind).toBe('broken');
    expect(parseLearningData('{"quiz":{}}', NOW).kind).toBe('broken');
    const raw = dataWith((data) => {
      data.quiz['a.q01'] = { correct: true, answeredAt: NOW };
      (data.quiz as Record<string, unknown>)['a.q02'] = { correct: 'yes' };
    });
    const outcome = parseLearningData(raw, NOW);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(outcome.kind === 'ok' && Object.keys(outcome.data.quiz)).toEqual(['a.q01']);
  });

  it('UT-LD-05: 教材にない ID の記録も消さずに残す', () => {
    const raw = dataWith((data) => {
      data.explanations['removed-concept'] = { readAt: NOW };
    });
    const outcome = parseLearningData(raw, NOW);
    expect(outcome.kind === 'ok' && outcome.data.explanations['removed-concept']).toEqual({ readAt: NOW });
  });

  it('UT-LD-06: 20,000文字を超える下書きは、その下書きだけを捨てる', () => {
    const raw = dataWith((data) => {
      data.exercises['a.ex01'] = {
        drafts: { java: { code: 'x'.repeat(MAX_DRAFT_LENGTH + 1), savedAt: NOW }, cpp: { code: 'ok', savedAt: NOW } },
        evaluations: {},
      };
    });
    const outcome = parseLearningData(raw, NOW);
    expect(outcome.kind === 'ok' && Object.keys(outcome.data.exercises['a.ex01'].drafts)).toEqual(['cpp']);
  });

  it('UT-LD-07: 自己評価は evaluations.self に置き、知らない評価方法も残す', () => {
    const raw = dataWith((data) => {
      data.exercises['a.ex01'] = {
        drafts: {},
        evaluations: {
          self: { results: { 'a.ex01.c1': true }, evaluatedAt: NOW },
          graded: { results: { 'a.ex01.c1': false }, evaluatedAt: NOW },
        },
      };
    });
    const outcome = parseLearningData(raw, NOW);
    expect(outcome.kind === 'ok' && Object.keys(outcome.data.exercises['a.ex01'].evaluations)).toEqual(['self', 'graded']);
  });

  it('UT-LD-08: 知らない表示言語は Java として扱い、記録は書き換えない', () => {
    const outcome = parseLearningData(dataWith((data) => (data.settings.displayLanguage = 'python')), NOW);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.data.settings.displayLanguage).toBe('python');
    expect(resolveDisplayLanguage(outcome.data, ['java', 'cpp', 'vba'])).toBe('java');
  });
});

describe('createLocalLearningStore', () => {
  it('UT-LS-01: 書き込む直前に読み直すため、別のタブの記録を消さない', () => {
    const storage = new FakeStorage();
    const tabA = createLocalLearningStore({ storage, now: () => NOW, events: null });
    const tabB = createLocalLearningStore({ storage, now: () => NOW, events: null });
    tabA.update((data) => (data.quiz['a.q01'] = { correct: true, answeredAt: NOW }));
    tabB.update((data) => (data.quiz['a.q02'] = { correct: false, answeredAt: NOW }));
    const saved = JSON.parse(storage.getItem(LEARNING_DATA_KEY)!) as LearningData;
    expect(Object.keys(saved.quiz)).toEqual(['a.q01', 'a.q02']);
  });

  it('UT-LS-02: storage イベントを受けると読み直して知らせる', () => {
    const storage = new FakeStorage();
    const events = new FakeEvents();
    const store = createLocalLearningStore({ storage, now: () => NOW, events });
    const listener = vi.fn();
    store.subscribe(listener);
    storage.setItem(LEARNING_DATA_KEY, dataWith((data) => (data.settings.displayLanguage = 'vba')));
    events.fire(LEARNING_DATA_KEY);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.get().settings.displayLanguage).toBe('vba');
  });

  it('UT-LS-03: 容量不足のときは書き込まずに quota-exceeded を返し、既存の記録は変わらない', () => {
    const storage = new FakeStorage();
    const store = createLocalLearningStore({ storage, now: () => NOW, events: null });
    store.update((data) => (data.quiz['a.q01'] = { correct: true, answeredAt: NOW }));
    const before = storage.getItem(LEARNING_DATA_KEY);
    const notices: string[] = [];
    store.onNotice((notice) => notices.push(notice));
    storage.quota = 10;
    expect(store.update((data) => (data.quiz['a.q02'] = { correct: true, answeredAt: NOW }))).toEqual({ ok: false, reason: 'quota-exceeded' });
    expect(storage.getItem(LEARNING_DATA_KEY)).toBe(before);
    expect(notices).toEqual(['quota-exceeded']);
  });

  it('UT-LS-04・08: 保存領域が使えないときは unavailable になり、メモリ上で記録を続ける', () => {
    const store = createLocalLearningStore({ storage: null, now: () => NOW, events: null });
    expect(store.status).toBe('unavailable');
    expect(store.update((data) => (data.explanations.a = { readAt: NOW }))).toEqual({ ok: false, reason: 'unavailable' });
    expect(store.get().explanations.a).toEqual({ readAt: NOW });

    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const notices: string[] = [];
    const blocked = createLocalLearningStore({ storage: throwing, now: () => NOW, events: null });
    blocked.onNotice((notice) => notices.push(notice));
    expect(blocked.status).toBe('unavailable');
    expect(notices).toEqual(['unavailable']);
  });

  it('UT-LS-05・08: 新しい版の記録があるときは保存しない', () => {
    const storage = new FakeStorage();
    storage.setItem(LEARNING_DATA_KEY, JSON.stringify({ schemaVersion: 9 }));
    const store = createLocalLearningStore({ storage, now: () => NOW, events: null });
    expect(store.status).toBe('newer-version');
    expect(store.update((data) => (data.explanations.a = { readAt: NOW }))).toEqual({ ok: false, reason: 'newer-version' });
    expect(storage.getItem(LEARNING_DATA_KEY)).toBe('{"schemaVersion":9}');
    expect(store.get().explanations.a).toEqual({ readAt: NOW });
  });

  it('壊れた記録は退避してから初期化し、退避した中身を読める（K28）', () => {
    const storage = new FakeStorage();
    storage.setItem(LEARNING_DATA_KEY, '{壊れた');
    const store = createLocalLearningStore({ storage, now: () => NOW, events: null });
    const notices: string[] = [];
    store.onNotice((notice) => notices.push(notice));
    expect(notices).toEqual(['broken']);
    expect(store.readBrokenBackup()).toBe('{壊れた');
    expect(storage.getItem(BROKEN_DATA_KEY)).toBe('{壊れた');
    expect(store.get()).toEqual(createInitialData(NOW));
  });

  it('UT-LS-06: 全消去で初期データに戻り、退避した記録も消える', () => {
    const storage = new FakeStorage();
    storage.setItem(BROKEN_DATA_KEY, 'old');
    const store = createLocalLearningStore({ storage, now: () => NOW, events: null });
    store.update((data) => (data.explanations.a = { readAt: NOW }));
    expect(store.clear()).toEqual({ ok: true });
    expect(store.get()).toEqual(createInitialData(NOW));
    expect(storage.getItem(LEARNING_DATA_KEY)).toBeNull();
    expect(store.readBrokenBackup()).toBeNull();
  });

  it('UT-LS-07: 書き出したものを読み込むと元に戻り、不正なファイルは読み込まない', () => {
    const storage = new FakeStorage();
    const store = createLocalLearningStore({ storage, now: () => NOW, events: null });
    store.update((data) => (data.quiz['a.q01'] = { correct: true, answeredAt: NOW }));
    const exported = store.exportJson();
    store.clear();
    expect(store.importJson('{"format":"other"}')).toEqual({ ok: false, reason: 'このアプリで書き出したファイルではありません' });
    expect(store.importJson('{')).toEqual({ ok: false, reason: 'JSON として読めません' });
    expect(store.get().quiz).toEqual({});
    expect(store.importJson(exported)).toEqual({ ok: true });
    expect(store.get().quiz['a.q01']).toEqual({ correct: true, answeredAt: NOW });
  });
});

describe('createLocalQuizJudge', () => {
  const answers = {
    'a.q01': { correct: 'c', explanationHtml: '<p>理由</p>', wrongReasonsHtml: { a: '<p>a</p>', b: '<p>b</p>', d: '<p>d</p>' } },
  };

  it('UT-QJ-01・02: 正解・不正解を判定し、正解データの取得は1回だけ', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => answers }));
    const judge = createLocalQuizJudge('/data/answers/a.json', fetcher);
    await expect(judge.judge('a.q01', 'c')).resolves.toMatchObject({ correct: true, correctChoiceId: 'c' });
    await expect(judge.judge('a.q01', 'a')).resolves.toMatchObject({ correct: false, explanationHtml: '<p>理由</p>' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('UT-QJ-03: 取得に失敗したら QuizJudgeError で reject し、次の判定で取得をやり直す', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => answers });
    const judge = createLocalQuizJudge('/data/answers/a.json', fetcher);
    await expect(judge.judge('a.q01', 'c')).rejects.toBeInstanceOf(QuizJudgeError);
    await expect(judge.judge('a.q01', 'c')).resolves.toMatchObject({ correct: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('summarizeProgress', () => {
  const outline = { id: 'a', questionIds: ['a.q01', 'a.q02'], exercises: [{ id: 'a.ex01', checkIds: ['a.ex01.c1', 'a.ex01.c2'] }] };

  it('UT-PROG-01: 解説・クイズ・課題の学習状況を集計する', () => {
    const data = createInitialData(NOW);
    data.explanations.a = { readAt: NOW };
    data.quiz['a.q01'] = { correct: true, answeredAt: NOW };
    data.quiz['a.q02'] = { correct: false, answeredAt: NOW };
    data.exercises['a.ex01'] = { drafts: {}, evaluations: { self: { results: { 'a.ex01.c1': true, 'a.ex01.c2': false }, evaluatedAt: NOW } } };
    expect(summarizeProgress(data, outline)).toEqual({
      conceptId: 'a',
      explanationRead: true,
      quiz: { correct: 1, total: 2 },
      checks: { done: 1, total: 2 },
    });
  });

  it('UT-PROG-02: 教材にない設問やチェック項目、採点の記録は数えない', () => {
    const data = createInitialData(NOW);
    data.quiz['a.q99'] = { correct: true, answeredAt: NOW };
    data.exercises['a.ex01'] = {
      drafts: {},
      evaluations: {
        self: { results: { 'a.ex01.c9': true }, evaluatedAt: NOW },
        graded: { results: { 'a.ex01.c1': true }, evaluatedAt: NOW },
      },
    };
    expect(summarizeProgress(data, outline)).toMatchObject({ quiz: { correct: 0, total: 2 }, checks: { done: 0, total: 2 } });
  });
});

describe('buildHeadScript（UT-HEAD-01）', () => {
  const script = buildHeadScript(['java', 'cpp', 'vba']);

  function run(raw: string | null | Error): string | null {
    const attributes: Record<string, string> = {};
    const localStorage = {
      getItem: () => {
        if (raw instanceof Error) throw raw;
        return raw;
      },
    };
    const document = { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } };
    new Function('localStorage', 'document', script)(localStorage, document);
    return attributes['data-lang'] ?? null;
  }

  it('正しい値のときは、その言語にする', () => {
    expect(run(dataWith((data) => (data.settings.displayLanguage = 'vba')))).toBe('vba');
  });

  it('保存がない・壊れている・版が新しい・知らない言語・読めないときは何もしない（Java のまま）', () => {
    expect(run(null)).toBeNull();
    expect(run('{壊れた')).toBeNull();
    expect(run(JSON.stringify({ schemaVersion: 2, settings: { displayLanguage: 'cpp' } }))).toBeNull();
    expect(run(dataWith((data) => (data.settings.displayLanguage = 'python')))).toBeNull();
    expect(run(new Error('SecurityError'))).toBeNull();
  });

  it('CSP 用のハッシュ値を作る', () => {
    expect(scriptHash(script)).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
  });

  it('表示言語に従う領域で、ほかの言語を隠す CSS を言語ごとに作る', () => {
    expect(buildLanguageCss(['java', 'cpp']).split('\n')).toEqual([
      'html[data-lang="java"] [data-follow-lang] [data-lang-block]:not([data-lang-block="java"]){display:none}',
      'html[data-lang="cpp"] [data-follow-lang] [data-lang-block]:not([data-lang-block="cpp"]){display:none}',
    ]);
  });
});
