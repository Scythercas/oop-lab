// 学習データの形・検証・版の移行（詳細設計書 §6.2・§6.4）。
// ブラウザで動くため、ライブラリを使わずに検証する（配る JavaScript を小さくするため）。

export const LEARNING_DATA_KEY = 'oop-lab.learning-data';
export const BROKEN_DATA_KEY = 'oop-lab.learning-data.broken';
export const CURRENT_SCHEMA_VERSION = 1;
export const MAX_DRAFT_LENGTH = 20_000;
export const DEFAULT_LANGUAGE = 'java';
/** 書き出したファイルの目印（FR-073） */
export const EXPORT_FORMAT = 'oop-lab-learning-data';

export interface DraftRecord {
  code: string;
  savedAt: string;
}

export interface EvaluationRecord {
  /** 自己チェック項目 ID → できた（true）／できなかった（false） */
  results: Record<string, boolean>;
  evaluatedAt: string;
}

export interface ExerciseRecord {
  /** 選んだ実装言語（言語 ID か other） */
  implementationLanguage?: string;
  /** 実装言語ごとの下書き */
  drafts: Record<string, DraftRecord>;
  /** 評価方法ごとの結果。初回は self（自己評価）だけ。知らない評価方法も消さずに残す（NFR-15 ④） */
  evaluations: Record<string, EvaluationRecord>;
}

export interface LearningData {
  schemaVersion: number;
  updatedAt: string;
  settings: { displayLanguage: string };
  explanations: Record<string, { readAt: string }>;
  quiz: Record<string, { correct: boolean; answeredAt: string }>;
  exercises: Record<string, ExerciseRecord>;
}

export type ParseOutcome =
  | { kind: 'ok'; data: LearningData; changed: boolean }
  | { kind: 'newer'; version: number }
  | { kind: 'broken'; reason: string };

/** 版 n の学習データを版 n+1 にする関数（版ごとに1つ。初回は版1だけなので空） */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

export function createInitialData(now: string): LearningData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
    settings: { displayLanguage: DEFAULT_LANGUAGE },
    explanations: {},
    quiz: {},
    exercises: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** 形の合う項目だけを残す。捨てた数を返す */
function keepValid<T>(value: unknown, isValid: (item: unknown) => item is T): { items: Record<string, T>; dropped: number } {
  const items: Record<string, T> = {};
  let dropped = 0;
  if (!isRecord(value)) return { items, dropped: value === undefined ? 0 : 1 };
  for (const [key, item] of Object.entries(value)) {
    if (isValid(item)) items[key] = item;
    else dropped += 1;
  }
  return { items, dropped };
}

const isReadRecord = (item: unknown): item is { readAt: string } => isRecord(item) && isString(item.readAt);

const isQuizRecord = (item: unknown): item is { correct: boolean; answeredAt: string } =>
  isRecord(item) && typeof item.correct === 'boolean' && isString(item.answeredAt);

const isDraft = (item: unknown): item is DraftRecord =>
  isRecord(item) && isString(item.code) && item.code.length <= MAX_DRAFT_LENGTH && isString(item.savedAt);

const isEvaluation = (item: unknown): item is EvaluationRecord =>
  isRecord(item) && isString(item.evaluatedAt) && isRecord(item.results) && Object.values(item.results).every((v) => typeof v === 'boolean');

function sanitizeExercises(value: unknown): { items: Record<string, ExerciseRecord>; dropped: number } {
  const items: Record<string, ExerciseRecord> = {};
  let dropped = 0;
  if (!isRecord(value)) return { items, dropped: value === undefined ? 0 : 1 };
  for (const [id, item] of Object.entries(value)) {
    if (!isRecord(item)) {
      dropped += 1;
      continue;
    }
    const drafts = keepValid(item.drafts, isDraft);
    const evaluations = keepValid(item.evaluations, isEvaluation);
    dropped += drafts.dropped + evaluations.dropped;
    const record: ExerciseRecord = { drafts: drafts.items, evaluations: evaluations.items };
    if (isString(item.implementationLanguage)) record.implementationLanguage = item.implementationLanguage;
    else if (item.implementationLanguage !== undefined) dropped += 1;
    items[id] = record;
  }
  return { items, dropped };
}

/**
 * localStorage から読んだ文字列を学習データにする（§6.4）。
 * - 形の違う項目は、その項目だけを捨てる（ID が教材にあるかは見ない。NFR-11）
 * - 全体が JSON として読めない、または schemaVersion がなければ broken
 * - アプリより新しい版なら newer（読み込まない）
 */
export function parseLearningData(raw: string | null, now: string, migrations: Record<number, Migration> = MIGRATIONS): ParseOutcome {
  if (raw === null) return { kind: 'ok', data: createInitialData(now), changed: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'broken', reason: 'JSON として読めません' };
  }
  if (!isRecord(parsed) || typeof parsed.schemaVersion !== 'number' || !Number.isInteger(parsed.schemaVersion)) {
    return { kind: 'broken', reason: '版（schemaVersion）がありません' };
  }
  if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) return { kind: 'newer', version: parsed.schemaVersion };

  let current: Record<string, unknown> = parsed;
  let migrated = false;
  while ((current.schemaVersion as number) < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[current.schemaVersion as number];
    if (migrate === undefined) return { kind: 'broken', reason: `版 ${String(current.schemaVersion)} から移行できません` };
    try {
      current = migrate(current);
    } catch {
      return { kind: 'broken', reason: '版の移行に失敗しました' };
    }
    migrated = true;
  }

  const settings = isRecord(current.settings) ? current.settings : {};
  const explanations = keepValid(current.explanations, isReadRecord);
  const quiz = keepValid(current.quiz, isQuizRecord);
  const exercises = sanitizeExercises(current.exercises);
  const languageValid = isString(settings.displayLanguage);
  const data: LearningData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: isString(current.updatedAt) ? current.updatedAt : now,
    settings: { displayLanguage: languageValid ? (settings.displayLanguage as string) : DEFAULT_LANGUAGE },
    explanations: explanations.items,
    quiz: quiz.items,
    exercises: exercises.items,
  };
  const dropped = explanations.dropped + quiz.dropped + exercises.dropped + (languageValid ? 0 : 1);
  return { kind: 'ok', data, changed: migrated || dropped > 0 };
}

/** 表示言語の ID。知らない言語なら既定の言語として扱う（記録は書き換えない。§6.4） */
export function resolveDisplayLanguage(data: LearningData, knownLanguageIds: readonly string[]): string {
  return knownLanguageIds.includes(data.settings.displayLanguage) ? data.settings.displayLanguage : DEFAULT_LANGUAGE;
}

export function cloneData(data: LearningData): LearningData {
  return JSON.parse(JSON.stringify(data)) as LearningData;
}
