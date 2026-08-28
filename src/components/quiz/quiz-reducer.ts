/**
 * 問題エンジンの状態機械（純関数）
 *
 * 問題の種類は旧アプリ「まなびの島」から引き継ぐ（4択・気持ち2段階・自由入力・
 * 語群穴埋め・複数選択）。実装とデザインは新テーマで作り直している。
 *
 * 判定はすべて共有の normalize.ts を通す。旧実装のように「accept」に表記ゆれを
 * 人力で並べる必要はない。
 *
 * ## やりかたは 3つ（QuizMode）
 * - `"one"` … **1問ずつ**。答えた 瞬間に 採点し、こたえと せつめいを 読んで つぎへ。
 * - `"submit"` … **1問ずつ 見て、まとめて 出す**。ぜんぶ 書いてから 出す。採点は 出した
 *   あと 1回だけで、途中で 合って いるかは 見せない（テストの やりかた）。
 * - `"all"` … **ぜんぶ 1ページに 出す**。採点は `submit` と 同じ。教材と 行き来しながら
 *   書ける ように する ための 見せかた（2026-08-23）。
 *
 * どれを 使うかは **先生が 教材に 持たせる**（`answerMode`）。
 *
 * `submit` と `all` は **採点の しかたが 同じ**なので、判定の 分岐では
 * `mode !== "one"` で 見る——`=== "submit"` と 書くと、`all` の とき だけ
 * 進めない・確認に 行けない といった 抜けが 生まれる。
 *
 * 採点は どちらの やりかたでも `@/lib/quiz/draft` の `gradeDraft` 1つを 通す
 * ——2か所に 置くと、片方だけ 直した 日に 同じ答えで 点が ちがう ことが 起きる。
 */

import type { QuizQuestion, QuizSet } from "@/content/schema";
import { INPUT_ISSUE_FEEDBACK, type FeedbackKey } from "@/lib/feedback";
import { draftAnswered, gradeDraft, type QuizDraft } from "@/lib/quiz/draft";
import { inspectReadingInput } from "@/lib/text/normalize";

/** もんだいの やりかた。 */
export type QuizMode = "one" | "submit" | "all";

export type QuizPhase =
  /** 出題中（emotion は1段階目の「気持ち」を聞いている）。 */
  | {
      readonly kind: "ask";
      /**
       * 回答としては受け取らず、入力の直しだけをお願いしている状態。
       * IME が英語のままなど「答えは分かっているのに打てない」ときに使う。
       */
      readonly inputIssue?: FeedbackKey;
      /**
       * その 注意が どの もんだいの ものか（`"all"` のとき だけ 使う）。
       * 全問が 画面に 出て いるので、持ち主が 分からないと 直す 欄が 決まらない。
       */
      readonly inputIssueQuestionId?: string;
    }
  /**
   * emotion の2段階目。気持ちが分かったうえで「言い方」を聞く。
   *
   * `feelingIndex` は **選んだ気持ちの番号**。合っていたか（`feelingOk`）だけでなく
   * 番号も持つのは、先生が見たいのが「外したか」ではなく **どれを選んだか**だから
   * （記録に残す文を2段階目で組み立てる — `answerReply`）。
   *
   * **1問ずつのときだけ**の 段階。まとめて 出す ときは 合って いるかを 見せないので、
   * 下書き（`drafts`）の 気もちが 決まって いるかで 2段階目を 出す。
   */
  | {
      readonly kind: "emotionReply";
      readonly feelingOk: boolean;
      readonly feelingIndex: number;
    }
  | {
      readonly kind: "explain";
      readonly correct: boolean;
      readonly feedback: FeedbackKey;
      /**
       * 学習者が 出した こたえの 文（「あなたの こたえ」に 出す）。
       *
       * 以前は 自由入力の ときだけ 持って いた。えらんだ 選択肢が 画面に 残らないと、
       * 学習者は **自分が どれを 選んだか** 分からないまま「こたえ」だけを 見る
       * ことに なる（2026-08-19 の 指摘）。だから 型を 問わず 持つ。
       */
      readonly answer?: string;
    }
  /**
   * まとめて 出す ときの「出す まえの かくにん」。
   * 何を 書いたか・どこが のこって いるかを 一覧で 見て、直しに 戻れる。
   */
  | { readonly kind: "confirm" }
  | { readonly kind: "finished" };

export interface QuizResult {
  readonly questionId: string;
  readonly correct: boolean;
  readonly earned: number;
  /**
   * 学習者が 出した こたえ（自由入力の 文字・えらんだ 選択肢の 文）。
   * 空文字 = 何も 書かずに 出した（そこで 詰まった 記録として 残す）。
   *
   * **番号ではなく 文そのもの**を 持つ。教材の 選択肢を 1行 入れ替えると 番号の 意味が
   * 変わり、去年の 記録が 読めなく なる。先生が 読みたいのも「2」ではなく 学生の 言葉である。
   * 自由入力は **正規化せず 生のまま**——表記ゆれこそ 先生が 見たいもの。
   */
  readonly answer: string;
}

/** 問題IDごとの 下書き（まとめて 出す ときだけ 使う）。 */
export type QuizDrafts = Readonly<Record<string, QuizDraft>>;

export interface QuizState {
  readonly setId: string;
  readonly passRate: number;
  readonly mode: QuizMode;
  readonly questions: readonly QuizQuestion[];
  readonly index: number;
  readonly phase: QuizPhase;
  readonly results: readonly QuizResult[];
  /** まとめて 出す ときの 採点まえの こたえ。1問ずつの ときは 空のまま。 */
  readonly drafts: QuizDrafts;
}

/**
 * こたえの action に そえる「どの もんだいの ことか」。
 *
 * 付けなければ **いま 見て いる もんだい**（これまでどおり）。
 * `"all"`（ぜんぶ 1ページ）では 画面に 全問が 出て いるので、番号では 決まらない
 * ——書いた 行の ID を そのまま 渡す。
 *
 * `goto` を 先に 撃って から 答える 案は 採らない。自由入力は **1打鍵ごとに**
 * 送られる ので dispatch が 倍に なり、`goto` が 相を `ask` に 戻すので
 * IME の 注意（`inputIssue`）が 打つ たびに 消える。
 */
type Targeted = { readonly questionId?: string };

export type QuizAction =
  | ({ readonly type: "answerChoice"; readonly index: number } & Targeted)
  | ({ readonly type: "answerMulti"; readonly indexes: readonly number[] } & Targeted)
  | ({ readonly type: "answerKeyword"; readonly input: string } & Targeted)
  | ({
      readonly type: "answerFree";
      readonly input: string;
      /** 英語の 下書き（`free.english` の ある 問いだけ）。採点には 使わない。 */
      readonly en?: string;
    } & Targeted)
  | ({ readonly type: "answerWordbank"; readonly filled: readonly (string | null)[] } & Targeted)
  | ({ readonly type: "answerFeeling"; readonly index: number } & Targeted)
  | ({ readonly type: "answerReply"; readonly index: number } & Targeted)
  | { readonly type: "next" }
  /**
   * 「まえの もんだい」。
   *
   * **1問ずつ**では 答え直しでは なく 読み直し——点も 記録も 動かさない
   * （動かせるように すると、先生が 見る「どの設問で 止まるか」が 学習者の 迷いの
   * ぶんだけ 変わってしまう）。前の問題は 答えと 解説の ついた 形で 出て、
   * 「つぎへ」で もとの 位置に 帰る。
   *
   * **まとめて 出す**では ふつうの 行き来（出す まえは いつでも 書き直せる）。
   * 「出す まえの かくにん」からは、さいごの もんだいへ 帰る。
   */
  | { readonly type: "back" }
  /** かくにん画面から その もんだいへ 飛ぶ（まとめて 出す のみ）。 */
  | { readonly type: "goto"; readonly index: number }
  /** ぜんぶ 出す（まとめて 出す のみ）。ここで はじめて 採点する。 */
  | { readonly type: "submit" };

/**
 * まっさらな 回を 作る。
 *
 * `drafts` を 渡すと **前の 回の こたえを 持ったまま** やり直す（採点は 消える）。
 * 26問の うち 2問 だけ 直したい ときに、合って いた 24問を 打ち直させない ため
 *（2026-08-25 の 指定「もう一度を 押した時に、前回の 回答が 記憶して 表示され」）。
 */
export function createQuizSession(
  set: QuizSet,
  questions = set.questions,
  mode: QuizMode = "one",
  drafts: QuizDrafts = {},
): QuizState {
  return {
    setId: set.id,
    passRate: set.passRate,
    mode,
    questions,
    index: 0,
    phase: questions.length === 0 ? { kind: "finished" } : { kind: "ask" },
    results: [],
    drafts,
  };
}

/**
 * 端末に 残って いた「つづきから」で 組み立てる（`@/lib/quiz/resume` の QuizStart から）。
 *
 * **1問ずつ**の `results` は すでに 採点ずみなので、そのまま 積み直す——answer系の
 * action を 再生する 必要は ない（1問が 答えた 瞬間に 確定する、もんだいの 設計上）。
 * **まとめて 出す**は 採点まえの `drafts` を そのまま 戻し、見て いた 番号から 再開する。
 * `index` が 問題数の 範囲外に なる ことは `startFrom` が 防ぐので、ここでは
 * 呼び出し側の 契約（`QuizStart`）を そのまま 信じる。
 */
export function resumeQuizSession(
  set: QuizSet,
  index: number,
  results: readonly QuizResult[],
  mode: QuizMode = "one",
  drafts: QuizDrafts = {},
): QuizState {
  return {
    setId: set.id,
    passRate: set.passRate,
    mode,
    questions: set.questions,
    index,
    phase: set.questions.length === 0 ? { kind: "finished" } : { kind: "ask" },
    results,
    drafts,
  };
}

export function currentQuestion(state: QuizState): QuizQuestion | null {
  return state.questions[state.index] ?? null;
}

/**
 * この action が 向いて いる もんだい。
 *
 * `questionId` が 無ければ **いま 見て いる もんだい**——1問ずつ・まとめて 出す の
 * これまでの 呼び出しは 1ミリも 変わらない。ID が 付いて いれば その もんだい
 *（`"all"` では 全問が 画面に 出て いるので 番号では 決まらない）。
 */
function targetQuestion(state: QuizState, action: QuizAction): QuizQuestion | null {
  const id = "questionId" in action ? action.questionId : undefined;
  if (id === undefined) return currentQuestion(state);
  return state.questions.find((question) => question.id === id) ?? null;
}

/** いま 見て いる もんだいの 下書き（まとめて 出す のみ）。 */
export function currentDraft(state: QuizState): QuizDraft | undefined {
  const question = currentQuestion(state);
  return question ? state.drafts[question.id] : undefined;
}

/** 何問 こたえたか（まとめて 出す の「のこり」を 数える）。 */
export function answeredCount(state: QuizState): number {
  return state.questions.filter((q) => draftAnswered(q, state.drafts[q.id])).length;
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  // 出したあと（finished）は もう 動かさない。かくにん画面だけは 例外的に 動く
  if (state.phase.kind === "finished") return state;

  switch (action.type) {
    case "goto": {
      if (state.mode === "one") return state;
      if (action.index < 0 || action.index >= state.questions.length) return state;
      return { ...state, index: action.index, phase: { kind: "ask" } };
    }

    case "submit": {
      if (state.mode === "one") return state;
      // **出して いない ものも 1行 残す**（「書けずに 出した」ことも 先生には 記録）
      const results = state.questions.map((question) => {
        const grade = gradeDraft(question, state.drafts[question.id]);
        return {
          questionId: question.id,
          correct: grade.correct,
          earned: grade.earned,
          answer: grade.answer,
        };
      });
      return { ...state, results, phase: { kind: "finished" } };
    }

    default:
      break;
  }

  const question = targetQuestion(state, action);
  if (!question) return state;

  switch (action.type) {
    case "answerChoice":
      if (question.type !== "choose") return state;
      return put(state, question, { kind: "choice", index: action.index });

    case "answerMulti": {
      if (question.type !== "multi") return state;
      return put(state, question, { kind: "multi", indexes: [...action.indexes] });
    }

    /*
     * 自由記述。**書いた ものを 置くだけ**。
     *
     * 正解が 無いので、`answerKeyword` の ような「ひらがなで 入力してね」の
     * 注意も 出さない——ローマ字で 書きたい 学習者を 止める 理由が 無い。
     */
    case "answerFree": {
      if (question.type !== "free") return state;
      /*
       * 英語の 下書きは **入って きた ぶんだけ 置きかえ、来なければ 前を 残す**。
       * 2つの 欄が 別々に 打たれる ので、片方を 打つ たびに もう片方を
       * `undefined` で 塗ると、日本語を 打った 瞬間に 英語が 消える。
       */
      const before = state.drafts[question.id];
      const en = action.en ?? (before?.kind === "free" ? before.en : undefined);
      return put(state, question, { kind: "free", input: action.input, en });
    }

    case "answerKeyword": {
      if (question.type !== "keyword") return state;
      const draft: QuizDraft = { kind: "keyword", input: action.input };

      // IME が英語のままの取りこぼしを救う。ここでは回答を消費しない
      //（1問を IME のせいで失わせない）。
      //
      // **正解がラテン文字の設問では出さない**（`PM`・`AI` のように「アルファベットで
      // 答えて ください」と聞いている問題）。そこで「ひらがなで 入力してね」と出すと、
      // 設問と正反対の案内になり、学習者は打ち直しようがなくなる。
      const wantsLatin = [question.answer, ...question.accept].some(
        (a) => inspectReadingInput(a) === "latin",
      );
      const latin = action.input.trim() !== "" && inspectReadingInput(action.input) === "latin";

      if (state.mode !== "one") {
        // まとめて 出す ときは **合って いるかを 見ずに** 注意だけ 出す
        //（判定を 混ぜると、注意の 有無で 正誤が 透けて しまう）。書いた ものは 残す。
        const at = state.questions.indexOf(question);
        return {
          ...state,
          index: at >= 0 ? at : state.index,
          drafts: { ...state.drafts, [question.id]: draft },
          phase:
            latin && !wantsLatin
              ? {
                  kind: "ask",
                  inputIssue: INPUT_ISSUE_FEEDBACK.latin,
                  // どの もんだいの 話かを 持つ。ぜんぶ 1ページの ときに 上へ 1つ 出すと、
                  // 学習者は どの 欄を 直すのか 分からない
                  inputIssueQuestionId: question.id,
                }
              : { kind: "ask" },
        };
      }

      if (state.phase.kind !== "ask") return state;
      if (!action.input.trim()) return state;
      // **必ず判定を済ませてから**見る——accept には「AUPP」「Japanese IT Pathway」の
      // ようなラテン文字の正解があり、先に弾くと正解を「打ち直して」と突き返すことになる。
      if (!gradeDraft(question, draft).correct && !wantsLatin && latin) {
        return { ...state, phase: { kind: "ask", inputIssue: INPUT_ISSUE_FEEDBACK.latin } };
      }
      return put(state, question, draft);
    }

    case "answerWordbank": {
      if (question.type !== "wordbank") return state;
      return put(state, question, { kind: "wordbank", filled: [...action.filled] });
    }

    case "answerFeeling": {
      if (question.type !== "emotion") return state;
      if (state.mode !== "one") {
        const before = state.drafts[question.id];
        const kept =
          before?.kind === "emotion" && before.feeling === action.index ? before.reply : null;
        return {
          ...state,
          // 気もちを 選び直したら 言い方は 選び直す（前の 言い方は その 気もちの ものだった）
          drafts: {
            ...state.drafts,
            [question.id]: { kind: "emotion", feeling: action.index, reply: kept },
          },
          phase: { kind: "ask" },
        };
      }
      if (state.phase.kind !== "ask") return state;
      // 気持ちを外しても2段階目には進む。ここで止めると学びが切れる。
      return {
        ...state,
        phase: {
          kind: "emotionReply",
          feelingOk: action.index === question.answerFeeling,
          feelingIndex: action.index,
        },
      };
    }

    case "answerReply": {
      if (question.type !== "emotion") return state;
      if (state.mode !== "one") {
        const before = state.drafts[question.id];
        if (before?.kind !== "emotion" || before.feeling === null) return state;
        return {
          ...state,
          drafts: {
            ...state.drafts,
            [question.id]: { kind: "emotion", feeling: before.feeling, reply: action.index },
          },
          phase: { kind: "ask" },
        };
      }
      if (state.phase.kind !== "emotionReply") return state;
      return put(state, question, {
        kind: "emotion",
        feeling: state.phase.feelingIndex,
        reply: action.index,
      });
    }

    case "next": {
      if (state.mode !== "one") {
        if (state.phase.kind !== "ask") return state;
        const next = state.index + 1;
        // さいごの もんだいの つぎは「出す まえの かくにん」（いきなり 採点しない）
        if (next >= state.questions.length) return { ...state, phase: { kind: "confirm" } };
        return { ...state, index: next, phase: { kind: "ask" } };
      }
      if (state.phase.kind !== "explain") return state;
      const next = state.index + 1;
      if (next >= state.questions.length) return { ...state, phase: { kind: "finished" } };
      // **もう 答えた問題に 戻ってきた**ときは、もう一度 聞かない（"back" の 帰り道）。
      // ここで ask に すると 同じ問題の 記録が 2行 できる。
      return { ...state, index: next, phase: answeredPhase(state, next) ?? { kind: "ask" } };
    }

    case "back": {
      if (state.mode !== "one") {
        // かくにん画面からは さいごの もんだいへ 帰る（「見なおす」）
        if (state.phase.kind === "confirm") {
          return { ...state, index: state.questions.length - 1, phase: { kind: "ask" } };
        }
        if (state.index === 0) return state;
        return { ...state, index: state.index - 1, phase: { kind: "ask" } };
      }
      if (state.index === 0) return state;
      const prev = state.index - 1;
      const phase = answeredPhase(state, prev);
      // 答えて いない ところへは 戻らない（しおりから 途中に 入った ときに 起きる）
      if (!phase) return state;
      return { ...state, index: prev, phase };
    }

    default:
      return state;
  }
}

/**
 * 出された こたえを 受け取る。
 *
 * **1問ずつ**は ここで 採点して 解説へ。**まとめて 出す**は 下書きに 置くだけで、
 * 合って いるかは 何も 見せない。
 */
function put(state: QuizState, question: QuizQuestion, draft: QuizDraft): QuizState {
  if (state.mode !== "one") {
    /*
     * `index` を **さいごに さわった もんだい**に 合わせる。しおり（quiz/resume の
     * `index`）が そこを 指すので、教材と 行き来した あとに 書きかけの 行へ 戻せる。
     * 1問ずつ 見る やりかたでは 見て いる もんだいが 対象なので、何も 変わらない。
     */
    const at = state.questions.indexOf(question);
    return {
      ...state,
      index: at >= 0 ? at : state.index,
      drafts: { ...state.drafts, [question.id]: draft },
      phase: { kind: "ask" },
    };
  }
  if (state.phase.kind !== "ask" && state.phase.kind !== "emotionReply") return state;
  // 空の こたえは 受け取らない（1問ずつでは「こたえる」ボタンが 押せない 状態にあたる）
  if (!draftAnswered(question, draft)) return state;
  return closeOne(state, question, gradeDraft(question, draft));
}

/** 1問ずつの 採点を 閉じる（記録を 1行 積み、解説の 画面に する）。 */
function closeOne(
  state: QuizState,
  question: QuizQuestion,
  grade: ReturnType<typeof gradeDraft>,
): QuizState {
  return {
    ...state,
    results: [
      ...state.results,
      {
        questionId: question.id,
        correct: grade.correct,
        earned: grade.earned,
        answer: grade.answer,
      },
    ],
    phase: {
      kind: "explain",
      correct: grade.correct,
      // 一部だけ合っているときは「あと すこし」に寄せる
      feedback: grade.correct ? "quiz.correct" : grade.partial ? "quiz.partial" : "quiz.review",
      answer: grade.answer,
    },
  };
}

/**
 * すでに 答えた問題の「解説の 画面」を 組み直す（読み直し用）。まだ 答えて いなければ null。
 *
 * 記録（`results`）から 作るので、**点も 記録も 動かない**。
 * ひとつだけ 落ちるものが ある: 複数選択の「あと すこし」（`quiz.partial`）は
 * 記録に 残していないので、読み直しでは ふつうの 見直しの 言い方に なる。
 * 言い方の ために 記録の 形を 増やすほどでは ない、と 判断した。
 */
function answeredPhase(state: QuizState, index: number): QuizPhase | null {
  const question = state.questions[index];
  if (!question) return null;
  const result = state.results.find((r) => r.questionId === question.id);
  if (!result) return null;
  return {
    kind: "explain",
    correct: result.correct,
    feedback: result.correct ? "quiz.correct" : "quiz.review",
    answer: result.answer,
  };
}

export interface QuizSummary {
  readonly total: number;
  readonly correct: number;
  readonly earned: number;
  readonly maxPoints: number;
  /** 何問中 何問 正解かの 割合（%・整数）。画面に 出すのも 合否も この数。 */
  readonly percent: number;
  readonly passed: boolean;
  readonly missedQuestionIds: readonly string[];
}

export function summarizeQuiz(state: QuizState): QuizSummary {
  const answered = state.results.length;
  const correct = state.results.filter((r) => r.correct).length;
  const earned = state.results.reduce((sum, r) => sum + r.earned, 0);
  /*
   * 満点は **答えた 問題の 配点**を 足す。
   *
   * 以前は「先頭から N問」で 数えて いた。しおり（位置）だけが 残って いた 回は
   * 答えた 問題と 先頭が ずれるので、配点の ちがう 教材では 取った 点が 満点を
   * 超える（実際に「6 / 5 てん」で 合格！ と 出た）。記録は 問題IDを 持って いるので、
   * 並びに 頼らず 引き当てる。
   */
  const points = new Map(state.questions.map((q) => [q.id, q.points]));
  const maxPoints = state.results.reduce((sum, r) => sum + (points.get(r.questionId) ?? 0), 0);
  /*
   * 合否も 画面も **何問中 何問**で 数える（2026-08-19 ユーザー指定
   * 「満点というより何問中何問正解の何％かがわかればよい」）。
   *
   * 点（`earned` / `maxPoints`）は 先生に 残す 1問ごとの 記録の ために 持ち続けるが、
   * 学習者に 見せる 数とは 分ける。丸めた 割合で 判定するのは、**画面に 出た 数と
   * 合否が 食い違わない ようにする**ため（67% と 出して 不合格、を 起こさない）。
   */
  const percent = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  return {
    total: answered,
    correct,
    earned,
    maxPoints,
    percent,
    passed: answered > 0 && percent >= state.passRate,
    missedQuestionIds: state.results.filter((r) => !r.correct).map((r) => r.questionId),
  };
}

/**
 * 教材の 問題 **ぜんぶに 触れた回**か。
 *
 * 成績（TestResult）・DBの `full_set`・ステージの「おわった」は、どれも この1つで 決める
 * ——同じ 判断を 3か所で 別々に 書くと、いつか 1か所だけ ずれる。
 *
 * false に なるのは 2つ:
 *  - 「まちがえた もんだいだけ」の やり直し（問題を 絞った セッション）
 *  - しおりだけが 残って いて **途中から 始めた 回**（`@/lib/quiz/resume` の 規則5）。
 *    3問しか 見て いない 回を 完走に すると、5問の 教材が「3 / 3・合格」で 固まる
 *    ——成績は 初回だけが 正式（`recordFirstTestResult`）なので、あとから 直せない。
 */
export function isWholeSetRun(state: QuizState, setSize: number): boolean {
  return setSize > 0 && state.questions.length === setSize && state.results.length === setSize;
}
