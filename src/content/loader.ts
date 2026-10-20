// content/ を読み、型付きの教材モデルにする（詳細設計書 §2.2・§3）。
// 見つかった問題は止めずに DiagnosticList に記録し、まとめて報告できるようにする。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import { DiagnosticList } from './diagnostics.ts';
import {
  type Answer,
  type ChangeMeta,
  type ConceptMeta,
  type DesignKind,
  type Diagram,
  type ExerciseMeta,
  type Language,
  type Question,
  answersSchema,
  changeSchema,
  conceptSchema,
  describeIssues,
  diagramsSchema,
  exerciseSchema,
  languagesSchema,
  notesFrontMatterSchema,
  questionsSchema,
} from './schema.ts';
import { findFormatProblems } from './text-format.ts';

/** ソースファイル1つ。path は状態のフォルダからの相対パス */
export interface SourceFile {
  path: string;
  content: string;
}

/** 言語 ID ごとのソースファイル一式（1つの「状態」の、全言語分） */
export type CodeByLanguage = Record<string, SourceFile[]>;

export interface Design {
  kind: DesignKind;
  commentary: string;
  code: CodeByLanguage;
}

export interface Change extends ChangeMeta {
  /** フォルダ名（変更要求 ID の「.」より後ろ） */
  name: string;
  expectedOutput: string;
  code: Partial<Record<DesignKind, CodeByLanguage>>;
}

export interface Exercise extends ExerciseMeta {
  /** フォルダ名（課題 ID の「.」より後ろ） */
  name: string;
  expectedOutput: string;
  answer: CodeByLanguage;
}

export interface LanguageNote {
  /** その言語では概念を直接表現できない旨（要件定義書 FR-013） */
  unsupported?: string;
  body: string;
}

export interface Concept extends ConceptMeta {
  folder: string;
  explanation: string;
  expectedOutput: string;
  notes: Record<string, LanguageNote>;
  designs: Design[];
  changes: Change[];
  questions: Question[];
  answers: Answer[];
  exercises: Exercise[];
  /** 図（diagrams.yaml。詳細設計書 §3.3） */
  diagrams: Diagram[];
}

export interface Content {
  root: string;
  languages: Language[];
  concepts: Concept[];
}

export function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

class ContentReader {
  readonly root: string;
  readonly diagnostics: DiagnosticList;

  constructor(root: string, diagnostics: DiagnosticList) {
    this.root = resolve(root);
    this.diagnostics = diagnostics;
  }

  rel(path: string): string {
    return relative(this.root, path).split(sep).join('/');
  }

  /** テキストを読み、書式を調べる。無ければ undefined（required なら V05 のエラー） */
  text(path: string, required = true): string | undefined {
    if (!existsSync(path) || !statSync(path).isFile()) {
      if (required) this.diagnostics.error('V05', this.rel(path), 'ファイルがありません');
      return undefined;
    }
    const bytes = readFileSync(path);
    for (const problem of findFormatProblems(bytes)) this.diagnostics.error('V06', this.rel(path), problem);
    return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  }

  /** YAML を読み、形を検証する。問題があれば undefined（V01 のエラー） */
  yaml<T>(path: string, schema: z.ZodType<T>): T | undefined {
    const source = this.text(path);
    return source === undefined ? undefined : this.parseYaml(source, this.rel(path), schema);
  }

  parseYaml<T>(source: string, file: string, schema: z.ZodType<T>): T | undefined {
    let data: unknown;
    try {
      data = parseYaml(source, { prettyErrors: true });
    } catch (error) {
      this.diagnostics.error('V01', file, `YAML として読めません: ${(error as Error).message.split('\n')[0]}`);
      return undefined;
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      for (const message of describeIssues(result.error)) this.diagnostics.error('V01', file, message);
      return undefined;
    }
    return result.data;
  }

  entries(path: string): { name: string; isDirectory: boolean }[] {
    if (!existsSync(path)) return [];
    return readdirSync(path, { withFileTypes: true })
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      .sort((a, b) => compareOrdinal(a.name, b.name));
  }

  folders(path: string): string[] {
    return this.entries(path)
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name);
  }
}

export function loadContent(root: string, diagnostics: DiagnosticList): Content {
  const reader = new ContentReader(root, diagnostics);
  const languages = (reader.yaml(join(reader.root, 'languages.yaml'), languagesSchema) ?? []).sort(
    (a, b) => a.order - b.order,
  );
  const concepts: Concept[] = [];
  if (languages.length > 0) {
    for (const folder of reader.folders(join(reader.root, 'concepts'))) {
      const concept = loadConcept(reader, join(reader.root, 'concepts', folder), folder, languages);
      if (concept !== undefined) concepts.push(concept);
    }
  }
  concepts.sort((a, b) => a.order - b.order || compareOrdinal(a.id, b.id));
  return { root: reader.root, languages, concepts };
}

function loadConcept(reader: ContentReader, dir: string, folder: string, languages: Language[]): Concept | undefined {
  const meta = reader.yaml(join(dir, 'concept.yaml'), conceptSchema);
  if (meta === undefined) return undefined;

  const designs: Design[] = meta.variations.map((kind) => ({
    kind,
    commentary: reader.text(join(dir, 'variations', kind, 'commentary.md')) ?? '',
    code: readCode(reader, join(dir, 'variations', kind), languages, ['commentary.md']),
  }));
  for (const name of reader.folders(join(dir, 'variations'))) {
    if (!meta.variations.includes(name as DesignKind)) {
      reader.diagnostics.error('V05', reader.rel(join(dir, 'variations', name)), 'concept.yaml の variations にない設計のフォルダです');
    }
  }

  const changes: Change[] = [];
  for (const name of reader.folders(join(dir, 'changes'))) {
    const changeDir = join(dir, 'changes', name);
    const changeMeta = reader.yaml(join(changeDir, 'change.yaml'), changeSchema);
    if (changeMeta === undefined) continue;
    const code: Partial<Record<DesignKind, CodeByLanguage>> = {};
    for (const kind of meta.variations) code[kind] = readCode(reader, join(changeDir, kind), languages);
    reportUnknownFolders(reader, changeDir, meta.variations);
    changes.push({
      ...changeMeta,
      name,
      expectedOutput: reader.text(join(changeDir, 'expected-output.txt')) ?? '',
      code,
    });
  }
  changes.sort((a, b) => a.order - b.order || compareOrdinal(a.name, b.name));

  const exercises: Exercise[] = [];
  for (const name of reader.folders(join(dir, 'exercises'))) {
    const exerciseDir = join(dir, 'exercises', name);
    const exerciseMeta = reader.yaml(join(exerciseDir, 'exercise.yaml'), exerciseSchema);
    if (exerciseMeta === undefined) continue;
    reportUnknownFolders(reader, exerciseDir, ['answer']);
    exercises.push({
      ...exerciseMeta,
      name,
      expectedOutput: reader.text(join(exerciseDir, 'expected-output.txt')) ?? '',
      answer: readCode(reader, join(exerciseDir, 'answer'), languages),
    });
  }

  return {
    ...meta,
    folder,
    explanation: reader.text(join(dir, 'explanation.md')) ?? '',
    expectedOutput: reader.text(join(dir, 'expected-output.txt')) ?? '',
    notes: readNotes(reader, join(dir, 'notes'), languages),
    designs,
    changes,
    questions: reader.yaml(join(dir, 'quiz', 'questions.yaml'), questionsSchema) ?? [],
    answers: reader.yaml(join(dir, 'quiz', 'answers.yaml'), answersSchema) ?? [],
    exercises,
    diagrams: reader.yaml(join(dir, 'diagrams.yaml'), diagramsSchema) ?? [],
  };
}

function reportUnknownFolders(reader: ContentReader, dir: string, allowed: readonly string[]): void {
  for (const name of reader.folders(dir)) {
    if (!allowed.includes(name)) reader.diagnostics.error('V05', reader.rel(join(dir, name)), '想定していないフォルダです');
  }
}

/** 状態のフォルダ（設計・変更後・模範解答）の下にある、言語ごとのソースを読む */
function readCode(reader: ContentReader, stateDir: string, languages: Language[], extraFiles: string[] = []): CodeByLanguage {
  const code: CodeByLanguage = {};
  for (const language of languages) code[language.id] = readSources(reader, join(stateDir, language.id), language);
  for (const entry of reader.entries(stateDir)) {
    const known = entry.isDirectory ? languages.some((language) => language.id === entry.name) : extraFiles.includes(entry.name);
    if (!known) reader.diagnostics.error('V05', reader.rel(join(stateDir, entry.name)), '想定していないファイルまたはフォルダです');
  }
  return code;
}

function readSources(reader: ContentReader, dir: string, language: Language): SourceFile[] {
  if (!existsSync(dir)) {
    reader.diagnostics.error('V05', reader.rel(dir), `${language.label} のソースのフォルダがありません`);
    return [];
  }
  const files: SourceFile[] = [];
  for (const entry of reader.entries(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) {
      reader.diagnostics.error('V01', reader.rel(path), 'ソースのフォルダの中にフォルダを置かないでください');
      continue;
    }
    if (!language.extensions.includes(extname(entry.name))) {
      reader.diagnostics.error('V01', reader.rel(path), `${language.label} では使えない拡張子です（${language.extensions.join('・')}）`);
      continue;
    }
    const content = reader.text(path);
    if (content !== undefined) files.push({ path: entry.name, content });
  }
  if (files.length === 0) reader.diagnostics.error('V05', reader.rel(dir), 'ソースファイルがありません');
  return files;
}

function readNotes(reader: ContentReader, dir: string, languages: Language[]): Record<string, LanguageNote> {
  const notes: Record<string, LanguageNote> = {};
  for (const entry of reader.entries(dir)) {
    const path = join(dir, entry.name);
    const languageId = entry.name.replace(/\.md$/, '');
    if (entry.isDirectory || !entry.name.endsWith('.md') || !languages.some((language) => language.id === languageId)) {
      reader.diagnostics.error('V05', reader.rel(path), 'notes には「言語 ID.md」だけを置いてください');
      continue;
    }
    const source = reader.text(path);
    if (source !== undefined) notes[languageId] = parseNote(reader, source, reader.rel(path));
  }
  return notes;
}

/** 先頭の「---」で囲んだ YAML（見出し部）と本文に分ける（詳細設計書 §3.3） */
function parseNote(reader: ContentReader, source: string, file: string): LanguageNote {
  if (!source.startsWith('---\n')) return { body: source };
  const end = source.indexOf('\n---\n', 3);
  if (end < 0) {
    reader.diagnostics.error('V01', file, '見出し部の終わり（---）がありません');
    return { body: source };
  }
  const frontMatter = reader.parseYaml(source.slice(4, end + 1), file, notesFrontMatterSchema) ?? {};
  return { ...frontMatter, body: source.slice(end + 5) };
}
