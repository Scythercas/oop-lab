// クイズの判定（詳細設計書 §2.3・§6.6）。将来はサーバ側の判定に差し替える（NFR-15 ③）。

export interface JudgeResult {
  correct: boolean;
  correctChoiceId: string;
  /** 正解の理由（HTML） */
  explanationHtml: string;
  /** 正解以外の選択肢ごとの、誤りである理由（HTML） */
  wrongReasonsHtml: Record<string, string>;
}

export interface QuizJudge {
  judge(questionId: string, choiceId: string): Promise<JudgeResult>;
}

/** 正解データを取得できない、または設問の正解がないとき */
export class QuizJudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuizJudgeError';
  }
}

interface AnswerEntry {
  correct: string;
  explanationHtml: string;
  wrongReasonsHtml: Record<string, string>;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** 最初の判定のときに正解データを取得して手元に持ち、以後はそれと照合する。取得に失敗したら次の判定でやり直す */
export function createLocalQuizJudge(answersUrl: string, fetcher: Fetcher = (url) => fetch(url)): QuizJudge {
  let answers: Promise<Record<string, AnswerEntry>> | undefined;

  const load = (): Promise<Record<string, AnswerEntry>> => {
    answers ??= fetcher(answersUrl)
      .then(async (response) => {
        if (!response.ok) throw new QuizJudgeError(`正解データを取得できませんでした（${response.status}）`);
        return (await response.json()) as Record<string, AnswerEntry>;
      })
      .catch((error: unknown) => {
        answers = undefined;
        throw error instanceof QuizJudgeError ? error : new QuizJudgeError('正解データを取得できませんでした');
      });
    return answers;
  };

  return {
    async judge(questionId, choiceId) {
      const entry = (await load())[questionId];
      if (entry === undefined) throw new QuizJudgeError(`設問「${questionId}」の正解がありません`);
      return {
        correct: entry.correct === choiceId,
        correctChoiceId: entry.correct,
        explanationHtml: entry.explanationHtml,
        wrongReasonsHtml: entry.wrongReasonsHtml,
      };
    },
  };
}
