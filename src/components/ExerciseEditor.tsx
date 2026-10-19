// SC-02e 実装課題（基本設計書 §3.10、要件定義書 FR-060〜067・FR-069、詳細設計書 §5.6）
import { useEffect, useId, useRef, useState } from 'react';
import type { ExercisePageData, ExerciseView } from '../build/page-data.ts';
import { type ExerciseRecord, type LearningData, MAX_DRAFT_LENGTH } from '../domain/learning-data.ts';
import { SELF_EVALUATION } from '../domain/progress.ts';
import { CodeBlock } from './CodeTable.tsx';
import type { EditorHandle } from './codemirror.ts';
import { getStore, hydratedMark, useDisplayLanguage, useHydrated, useLearningData } from './learning-store-client.ts';

interface Props {
  data: ExercisePageData;
}

type LanguageOption = ExercisePageData['languages'][number];

const OTHER = 'other';
const OTHER_LABEL = 'その他';
const AUTOSAVE_DELAY_MS = 1000;
const LIMIT_MESSAGE = `下書きは1つの言語につき${MAX_DRAFT_LENGTH.toLocaleString('ja-JP')}文字までです。`;
const PRIVACY_NOTICE = 'あなたのコードは実行・採点されず、このブラウザの外にも送られません。評価は自己評価です。';

function exerciseRecord(data: LearningData, exerciseId: string): ExerciseRecord {
  data.exercises[exerciseId] ??= { drafts: {}, evaluations: {} };
  return data.exercises[exerciseId];
}

export default function ExerciseEditor({ data }: Props) {
  const [exerciseId, setExerciseId] = useState(data.exercises[0]?.id ?? '');
  const exercise = data.exercises.find((item) => item.id === exerciseId);
  const idPrefix = useId();
  const hydrated = useHydrated();

  return (
    <div className="exercise" {...hydratedMark(hydrated)}>
      {data.exercises.length > 1 && (
        <div className="controls">
          <label htmlFor={`${idPrefix}-exercise`}>課題:</label>
          <select id={`${idPrefix}-exercise`} value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>
            {data.exercises.map((item, index) => (
              <option key={item.id} value={item.id}>
                課題 {index + 1}
              </option>
            ))}
          </select>
        </div>
      )}
      {exercise !== undefined && <ExercisePanel key={exercise.id} exercise={exercise} languages={data.languages} />}
    </div>
  );
}

function ExercisePanel({ exercise, languages }: { exercise: ExerciseView; languages: LanguageOption[] }) {
  const ids = languages.map((language) => language.id);
  const [displayLanguage] = useDisplayLanguage(ids);
  const learningData = useLearningData();
  const hydrated = useHydrated();
  const idPrefix = useId();
  const record = hydrated ? learningData.exercises[exercise.id] : undefined;
  const stored = record?.implementationLanguage;
  const implementationLanguage = stored !== undefined && (stored === OTHER || ids.includes(stored)) ? stored : displayLanguage;

  // 実装言語の初期値は、課題を初めて開いたときの表示言語。以後は表示言語を切り替えても変えない（§3.10）
  useEffect(() => {
    if (!hydrated || getStore().get().exercises[exercise.id]?.implementationLanguage !== undefined) return;
    getStore().update((next) => {
      exerciseRecord(next, exercise.id).implementationLanguage ??= displayLanguage;
    });
  }, [hydrated, exercise.id, displayLanguage]);

  const chooseLanguage = (languageId: string) =>
    getStore().update((next) => {
      exerciseRecord(next, exercise.id).implementationLanguage = languageId;
    });

  const draft = record?.drafts[implementationLanguage]?.code;
  const startCode = implementationLanguage === OTHER ? '' : (exercise.startCode[implementationLanguage] ?? '');
  const editorLanguage = languages.find((language) => language.id === implementationLanguage);

  const saveDraft = (languageId: string, code: string) => {
    if (getStore().get().exercises[exercise.id]?.drafts[languageId]?.code === code) return;
    getStore().update((next) => {
      exerciseRecord(next, exercise.id).drafts[languageId] = { code, savedAt: new Date().toISOString() };
    });
  };

  return (
    <div className="exercise__panel">
      <section aria-labelledby={`${idPrefix}-statement`}>
        <h2 id={`${idPrefix}-statement`}>課題</h2>
        <div className="prose" dangerouslySetInnerHTML={{ __html: exercise.statementHtml }} />
        <h3>追加の仕様</h3>
        <div className="prose" dangerouslySetInnerHTML={{ __html: exercise.additionalSpecHtml }} />
      </section>

      <div className="controls">
        <label htmlFor={`${idPrefix}-language`}>実装言語:</label>
        <select
          id={`${idPrefix}-language`}
          value={implementationLanguage}
          disabled={!hydrated}
          onChange={(event) => chooseLanguage(event.target.value)}
        >
          {languages.map((language) => (
            <option key={language.id} value={language.id}>
              {language.label}
            </option>
          ))}
          <option value={OTHER}>{OTHER_LABEL}</option>
        </select>
      </div>

      {hydrated ? (
        <CodeEditor
          key={implementationLanguage}
          initialDoc={draft ?? startCode}
          editor={editorLanguage?.editor}
          label={`${editorLanguage?.label ?? OTHER_LABEL} のコード`}
          onSave={(code) => saveDraft(implementationLanguage, code)}
        />
      ) : (
        <p className="editor-placeholder">エディタを読み込んでいます…</p>
      )}
      <p className="notice">{PRIVACY_NOTICE}</p>

      <Review exercise={exercise} languages={languages} implementationLanguage={implementationLanguage} displayLanguage={displayLanguage} record={record} />
    </div>
  );
}

interface CodeEditorProps {
  initialDoc: string;
  editor: string | undefined;
  label: string;
  onSave: (code: string) => void;
}

/** エディタ本体。自動保存は、入力が止まって1秒後・エディタから離れたとき・ページを離れるときに行う（§5.6） */
function CodeEditor({ initialDoc, editor, label, onSave }: CodeEditorProps) {
  const parent = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const save = useRef(onSave);
  save.current = onSave;

  useEffect(() => {
    let handle: EditorHandle | undefined;
    let cancelled = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (dirty && handle !== undefined) {
        dirty = false;
        save.current(handle.getDoc());
      }
    };
    window.addEventListener('pagehide', flush);
    import('./codemirror.ts')
      .then(({ createEditor }) => {
        if (cancelled || parent.current === null) return;
        handle = createEditor(parent.current, {
          doc: initialDoc,
          editor,
          maxLength: MAX_DRAFT_LENGTH,
          label,
          onChange: () => {
            dirty = true;
            setLimitReached(false);
            if (timer !== undefined) clearTimeout(timer);
            timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
          },
          onBlur: flush,
          onLimit: () => setLimitReached(true),
        });
        setReady(true);
      })
      .catch(() => {
        // 通信が切れた、ページを移る途中だった、など
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', flush);
      flush();
      handle?.destroy();
    };
    // エディタは言語ごとに作り直す（key で切り替える）ので、最初の値だけを使う
  }, []);

  return (
    <div className="editor">
      <div ref={parent} className="editor__surface" data-testid="code-editor" />
      {!ready && !loadFailed && <p className="editor-placeholder">エディタを読み込んでいます…</p>}
      {loadFailed && (
        <p className="error-message" role="alert">
          エディタを読み込めませんでした。通信状態を確かめて、ページを再読み込みしてください。
        </p>
      )}
      <p className="editor__limit" role="status">
        {limitReached ? LIMIT_MESSAGE : ''}
      </p>
    </div>
  );
}

interface ReviewProps {
  exercise: ExerciseView;
  languages: LanguageOption[];
  implementationLanguage: string;
  displayLanguage: string;
  record: ExerciseRecord | undefined;
}

/** 「解答を確認」の後に出す、模範解答と自己チェック（FR-065〜067） */
function Review({ exercise, languages, implementationLanguage, displayLanguage, record }: ReviewProps) {
  const [answerLanguage, setAnswerLanguage] = useState<string | undefined>();
  const [fileIndex, setFileIndex] = useState(0);
  const lastDisplayLanguage = useRef(displayLanguage);
  const heading = useRef<HTMLHeadingElement>(null);
  const idPrefix = useId();

  // 確認の直後は実装言語（「その他」なら表示言語）。その後は表示言語の切り替えに合わせる（§3.10）
  useEffect(() => {
    if (answerLanguage !== undefined && lastDisplayLanguage.current !== displayLanguage) {
      setAnswerLanguage(displayLanguage);
      setFileIndex(0);
    }
    lastDisplayLanguage.current = displayLanguage;
  }, [displayLanguage, answerLanguage]);

  const reveal = () => {
    setAnswerLanguage(implementationLanguage === OTHER ? displayLanguage : implementationLanguage);
    setFileIndex(0);
    requestAnimationFrame(() => heading.current?.focus());
  };

  const results = record?.evaluations[SELF_EVALUATION]?.results ?? {};
  const evaluate = (checkId: string, done: boolean) =>
    getStore().update((next) => {
      const evaluations = exerciseRecord(next, exercise.id).evaluations;
      const self = (evaluations[SELF_EVALUATION] ??= { results: {}, evaluatedAt: '' });
      self.results[checkId] = done;
      self.evaluatedAt = new Date().toISOString();
    });

  if (answerLanguage === undefined) {
    return (
      <div className="button-row">
        <button type="button" className="button button--primary" onClick={reveal}>
          解答を確認
        </button>
      </div>
    );
  }

  const files = exercise.answers[answerLanguage] ?? [];
  const file = files[fileIndex] ?? files[0];
  const languageLabel = languages.find((language) => language.id === answerLanguage)?.label ?? answerLanguage;

  return (
    <div className="exercise__review">
      <h2 ref={heading} tabIndex={-1}>
        模範解答（{languageLabel}）
      </h2>
      <div className="file-list" role="group" aria-label="模範解答のファイル">
        {files.map((item, index) => (
          <button key={item.path} type="button" className="file-list__item" aria-pressed={item === file} onClick={() => setFileIndex(index)}>
            {item.path}
          </button>
        ))}
      </div>
      {file !== undefined && <CodeBlock file={file} caption={`模範解答（${languageLabel}）: ${file.path}`} />}

      <h2>自己チェック</h2>
      <ul className="self-checks">
        {exercise.checks.map((check) => (
          <li key={check.id}>
            <fieldset>
              <legend>{check.text}</legend>
              <label>
                <input type="radio" name={`${idPrefix}-${check.id}`} checked={results[check.id] === true} onChange={() => evaluate(check.id, true)} />
                できた
              </label>
              <label>
                <input
                  type="radio"
                  name={`${idPrefix}-${check.id}`}
                  checked={results[check.id] === false}
                  onChange={() => evaluate(check.id, false)}
                />
                できなかった
              </label>
            </fieldset>
          </li>
        ))}
      </ul>
    </div>
  );
}
