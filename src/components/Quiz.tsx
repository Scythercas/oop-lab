// SC-02d クイズ（基本設計書 §3.9、要件定義書 FR-050〜054、詳細設計書 §6.6）
import { useId, useMemo, useRef, useState } from 'react';
import type { QuizPageData } from '../build/page-data.ts';
import { type JudgeResult, createLocalQuizJudge } from '../domain/quiz-judge.ts';
import { CodeBlock } from './CodeTable.tsx';
import { getStore, hydratedMark, useHydrated } from './learning-store-client.ts';

interface Props {
  data: QuizPageData;
}

const JUDGE_FAILED = '判定できませんでした。通信状態を確かめて、もう一度解答してください。';

function choiceLabel(id: string): string {
  return id.toUpperCase();
}

export default function Quiz({ data }: Props) {
  const judge = useMemo(() => createLocalQuizJudge(data.answersUrl), [data.answersUrl]);
  const allIds = useMemo(() => data.questions.map((question) => question.id), [data.questions]);
  const [round, setRound] = useState<string[]>(allIds);
  const [retry, setRetry] = useState(false);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<string | undefined>();
  const [result, setResult] = useState<JudgeResult | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLParagraphElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const idPrefix = useId();
  const hydrated = useHydrated();

  const question = data.questions.find((item) => item.id === round[index]);
  const correctCount = round.filter((id) => scores[id] === true).length;
  const wrongCount = round.filter((id) => scores[id] === false).length;

  const answer = async () => {
    if (question === undefined || choice === undefined) return;
    setBusy(true);
    setError('');
    try {
      const judged = await judge.judge(question.id, choice);
      setResult(judged);
      setScores((current) => ({ ...current, [question.id]: judged.correct }));
      // 設問ごとに最新の正誤を保存する（FR-053）
      getStore().update((next) => {
        next.quiz[question.id] = { correct: judged.correct, answeredAt: new Date().toISOString() };
      });
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch {
      // 判定できなかったとき（QuizJudgeError）は記録しない。次に解答したときに取得をやり直す（§6.6）
      setError(JUDGE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setChoice(undefined);
    setResult(undefined);
    setError('');
    if (index + 1 < round.length) {
      setIndex(index + 1);
      requestAnimationFrame(() => questionHeading.current?.focus());
    } else {
      setFinished(true);
      requestAnimationFrame(() => summaryHeading.current?.focus());
    }
  };

  const start = (ids: string[], isRetry: boolean) => {
    setRound(ids);
    setRetry(isRetry);
    setIndex(0);
    setChoice(undefined);
    setResult(undefined);
    setError('');
    setScores({});
    setFinished(false);
    requestAnimationFrame(() => questionHeading.current?.focus());
  };

  if (finished) {
    const wrongIds = round.filter((id) => scores[id] !== true);
    return (
      <div className="quiz" {...hydratedMark(hydrated)}>
        <h2 ref={summaryHeading} tabIndex={-1}>
          結果のまとめ{retry ? '（解き直し）' : ''}
        </h2>
        <p className="quiz__summary">
          {round.length}問中 <strong>{correctCount}問</strong> 正解
        </p>
        {wrongIds.length > 0 && (
          <>
            <p>間違えた問題:</p>
            <ul>
              {wrongIds.map((id) => (
                <li key={id}>問題 {allIds.indexOf(id) + 1}</li>
              ))}
            </ul>
          </>
        )}
        <div className="button-row">
          {wrongIds.length > 0 && (
            <button type="button" className="button button--primary" onClick={() => start(wrongIds, true)}>
              間違えた問題だけ解き直す
            </button>
          )}
          <button type="button" className="button" onClick={() => start(allIds, false)}>
            最初から解き直す
          </button>
        </div>
      </div>
    );
  }

  if (question === undefined) return null;
  const answered = result !== undefined;
  const number = allIds.indexOf(question.id) + 1;

  return (
    <div className="quiz" {...hydratedMark(hydrated)}>
      <div className="quiz__status">
        <h2 ref={questionHeading} tabIndex={-1}>
          {retry ? '解き直し ' : ''}問題 {index + 1} / {round.length}
          {retry && <span className="quiz__original">（問題 {number}）</span>}
        </h2>
        <p aria-live="polite">
          正解 {correctCount} ・ 不正解 {wrongCount}
        </p>
      </div>
      <div className="prose quiz__stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />
      {question.code !== undefined && (
        <div data-follow-lang>
          {data.languages.map((language) => {
            const file = question.code?.[language.id];
            return (
              file !== undefined && (
                <div key={language.id} data-lang-block={language.id}>
                  <p className="code-file-name">{file.path}</p>
                  <CodeBlock file={file} caption={`${language.label} のコード: ${file.path}`} />
                </div>
              )
            );
          })}
        </div>
      )}
      <fieldset className="quiz__choices" disabled={answered}>
        <legend className="visually-hidden">選択肢</legend>
        {question.choices.map((item) => {
          const isCorrect = item.id === result?.correctChoiceId;
          const isWrongPick = result !== undefined && !result.correct && item.id === choice;
          return (
            <label key={item.id} className={`quiz__choice${isCorrect ? ' is-correct' : ''}${isWrongPick ? ' is-wrong' : ''}`}>
              <input
                type="radio"
                name={`${idPrefix}-${question.id}`}
                value={item.id}
                checked={choice === item.id}
                onChange={() => setChoice(item.id)}
              />
              <span className="quiz__choice-id">{choiceLabel(item.id)}.</span> <span dangerouslySetInnerHTML={{ __html: item.html }} />
            </label>
          );
        })}
      </fieldset>

      {error !== '' && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {!answered && (
        <div className="button-row">
          <button type="button" className="button button--primary" disabled={choice === undefined || busy} onClick={() => void answer()}>
            解答する
          </button>
        </div>
      )}

      {result !== undefined && (
        <div className="quiz__result">
          <p ref={resultHeading} tabIndex={-1} className={`quiz__verdict ${result.correct ? 'is-correct' : 'is-wrong'}`}>
            {result.correct ? '○ 正解' : `× 不正解。正解は ${choiceLabel(result.correctChoiceId)}`}
          </p>
          <h3>解説</h3>
          <div className="prose" dangerouslySetInnerHTML={{ __html: result.explanationHtml }} />
          <dl className="quiz__wrong-reasons">
            {question.choices
              .filter((item) => item.id !== result.correctChoiceId)
              .map((item) => (
                <div key={item.id}>
                  <dt>{choiceLabel(item.id)} が誤りである理由</dt>
                  <dd className="prose" dangerouslySetInnerHTML={{ __html: result.wrongReasonsHtml[item.id] ?? '' }} />
                </div>
              ))}
          </dl>
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={next}>
              {index + 1 < round.length ? '次の問題へ' : '結果を見る'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
