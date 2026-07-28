import { z } from "zod";

/**
 * コンテンツスキーマ（フェーズ0・v1）
 *
 * 原則（docs/design/03 §1.4）: スキーマが検収の契約。
 * - 表示用テキストはプレーンテキストで持ち、ルビは表示時にエンジンが合成する
 * - 学習者向け文言の禁止語は lint:content が全文書を走査する
 * - スキーマ変更はマイグレーションスクリプトとセットで（/schema-change 手順）
 */

/** 学習者向け文言の禁止語（理解設計ガイド P8）。 */
export const FORBIDDEN_LEARNER_WORDS = [
  "不正解",
  "間違いです",
  "間違いだ",
  "ダメです",
  "ダメだ",
] as const;

const HTML_TAG = /<[a-zA-Z!/]/;

/** ルビHTML等の混入を禁止するプレーンテキスト。 */
export const plainText = z
  .string()
  .min(1)
  .refine((s) => !HTML_TAG.test(s), {
    message: "プレーンテキスト必須（HTMLタグ・ルビの手書きは禁止。ルビはエンジンが合成する）",
  });

const hiragana = z
  .string()
  .min(1)
  .regex(/^[ぁ-ゖーゔ・\s]+$/u, "読みはひらがなで書く");

/** 読み辞書エントリ: [表記, よみ]。複合語を先に置く（最長一致）。 */
export const furiganaEntrySchema = z.tuple([plainText, hiragana]);

const noJapanese = z
  .string()
  .min(1)
  .refine((s) => !/[ぁ-ゖァ-ヶ一-龯]/u.test(s), {
    message: "英語で書く（DATA DIVEの誤答選択肢は英語のみ）",
  });

/** 単語ゲーム（DATA DIVE系）の1語。 */
export const wordSchema = z.object({
  id: z.string().min(1),
  term: plainText,
  reading: hiragana,
  romaji: z.string().optional(),
  meaningEn: noJapanese,
  /** 意味的に紛らわしい英語の誤答3つ。 */
  wrongMeanings: z.array(noJapanese).length(3),
  /** やさしい日本語の解説（プレーン。ルビはエンジン合成）。 */
  explanationJa: plainText,
  /** 出典教材と同じ文脈の例文。 */
  example: plainText,
});

/** 単語ステージ（課ごとに1ステージ追加するだけでゲーム化される）。 */
export const wordStageSchema = z
  .object({
    kind: z.literal("wordstage"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    description: plainText,
    /** 教師が授業で伝える開放パスワード。省略時は最初から開放。 */
    password: z.string().optional(),
    fieldSequence: z.array(z.string()).min(1),
    questionCount: z.number().int().positive(),
    passRate: z.number().int().min(1).max(100),
    /** 複合語優先の読み辞書（表示ルビ用）。 */
    furigana: z.array(furiganaEntrySchema).optional(),
    words: z.array(wordSchema).min(6),
  })
  .superRefine((stage, ctx) => {
    if (stage.questionCount > stage.words.length) {
      ctx.addIssue({
        code: "custom",
        path: ["questionCount"],
        message: `questionCount(${stage.questionCount}) が語数(${stage.words.length})を超えている — 出題は語彙の部分集合`,
      });
    }
    const ids = stage.words.map((w) => w.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["words"], message: "words の id が重複している" });
    }
    stage.words.forEach((w, i) => {
      const meanings = [w.meaningEn, ...w.wrongMeanings].map((m) => m.trim().toLowerCase());
      if (new Set(meanings).size !== meanings.length) {
        ctx.addIssue({
          code: "custom",
          path: ["words", i, "wrongMeanings"],
          message: `「${w.term}」の選択肢に重複がある（誤答同士、または誤答＝正解）`,
        });
      }
    });
  });

/* ------------------------------------------------------------------ *
 * 問題セット（まなびの島の問題の種類を引き継いだ5型）
 * ------------------------------------------------------------------ */

/** 空欄のしるし。wordbank の文中でこの並びが1つの空欄になる。 */
export const BLANK_MARK = "___";

const quizCommon = {
  id: z.string().min(1),
  /** 設問文。 */
  q: plainText,
  /** 正誤に関わらず読ませる解説。実務に接続する（P8）。 */
  explain: plainText,
  points: z.number().int().positive().default(1),
};

/** 4択（読解確認）。 */
const chooseSchema = z.object({
  ...quizCommon,
  type: z.literal("choose"),
  options: z.array(plainText).min(2).max(6),
  /** options のインデックス。 */
  answer: z.number().int().min(0),
});

/** 複数選択。「ぜんぶ えらぶ」。 */
const multiSchema = z.object({
  ...quizCommon,
  type: z.literal("multi"),
  options: z.array(plainText).min(3).max(8),
  answers: z.array(z.number().int().min(0)).min(2),
});

/** 自由入力。表記ゆれは normalize.ts が吸収するので accept は別解だけを書く。 */
const keywordSchema = z.object({
  ...quizCommon,
  type: z.literal("keyword"),
  answer: plainText,
  /** 意味として同じ別解（表記ゆれは列挙しない）。 */
  accept: z.array(plainText).default([]),
});

/** 語群からの穴埋め。文中の ___ が空欄になる。 */
const wordbankSchema = z.object({
  ...quizCommon,
  type: z.literal("wordbank"),
  /** 1行ずつの文。空欄は ___ で表す。 */
  lines: z.array(plainText).min(1),
  /** 空欄の正解（出現順）。 */
  blanks: z.array(plainText).min(1),
  /** 画面に並べる語群（blanks＋まぎらわしい語）。 */
  bank: z.array(plainText).min(2),
});

/**
 * 気持ち→対応の2段階。
 * 「相手がどう感じているか」を先に選び、そのうえで「その場での言い方」を選ぶ。
 * 場面から答えが導ける設計にする（感情語の対応表で引ける — 理解設計ガイド）。
 */
const emotionSchema = z.object({
  ...quizCommon,
  type: z.literal("emotion"),
  /** 相手の気持ちの選択肢。 */
  feelings: z.array(plainText).min(3).max(5),
  answerFeeling: z.number().int().min(0),
  /** 2段階目の問い。 */
  replyQ: plainText,
  replies: z.array(plainText).min(3).max(5),
  answerReply: z.number().int().min(0),
});

export const quizQuestionSchema = z.discriminatedUnion("type", [
  chooseSchema,
  multiSchema,
  keywordSchema,
  wordbankSchema,
  emotionSchema,
]);

/** 選択で答える型（読解確認でだけ使ってよい）。 */
const SELECTION_TYPES = ["choose", "multi", "emotion"] as const;

export const quizSetSchema = z
  .object({
    kind: z.literal("quizset"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    description: plainText,
    /** 担当するネクマックス（04 §6.2）。 */
    nekumax: z.enum(["guide", "hello", "build", "listen", "cheer", "book"]).default("book"),
    /**
     * research = 読んだ・聞いた内容の確認 / production = 自分で日本語を出す。
     * 選択式は research でだけ使える（AGENTS.md 規律3）。
     */
    phase: z.enum(["research", "production"]).default("research"),
    passRate: z.number().int().min(1).max(100).default(70),
    furigana: z.array(furiganaEntrySchema).optional(),
    questions: z.array(quizQuestionSchema).min(1),
  })
  .superRefine((set, ctx) => {
    const ids = set.questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: "questions の id が重複している" });
    }

    set.questions.forEach((q, i) => {
      const at = (field: string) => ["questions", i, field];

      if (set.phase === "production" && SELECTION_TYPES.includes(q.type as never)) {
        ctx.addIssue({
          code: "custom",
          path: at("type"),
          message: `産出フェーズに選択式（${q.type}）は置けない。自由入力型を使う（規律3）`,
        });
      }

      if (q.type === "choose" && q.answer >= q.options.length) {
        ctx.addIssue({ code: "custom", path: at("answer"), message: "answer が options の範囲外" });
      }
      if (q.type === "multi") {
        if (q.answers.some((a) => a >= q.options.length)) {
          ctx.addIssue({
            code: "custom",
            path: at("answers"),
            message: "answers に options の範囲外がある",
          });
        }
        if (new Set(q.answers).size !== q.answers.length) {
          ctx.addIssue({ code: "custom", path: at("answers"), message: "answers が重複している" });
        }
        if (q.answers.length >= q.options.length) {
          ctx.addIssue({
            code: "custom",
            path: at("answers"),
            message: "すべてが正解の複数選択は問題にならない",
          });
        }
      }
      if (q.type === "emotion") {
        if (q.answerFeeling >= q.feelings.length) {
          ctx.addIssue({
            code: "custom",
            path: at("answerFeeling"),
            message: "answerFeeling が feelings の範囲外",
          });
        }
        if (q.answerReply >= q.replies.length) {
          ctx.addIssue({
            code: "custom",
            path: at("answerReply"),
            message: "answerReply が replies の範囲外",
          });
        }
      }
      if (q.type === "wordbank") {
        const marks = q.lines.join("").split(BLANK_MARK).length - 1;
        if (marks !== q.blanks.length) {
          ctx.addIssue({
            code: "custom",
            path: at("blanks"),
            message: `文中の空欄（${BLANK_MARK}）が${marks}個、blanks が${q.blanks.length}個で合わない`,
          });
        }
        const missing = q.blanks.filter((b) => !q.bank.includes(b));
        if (missing.length > 0) {
          ctx.addIssue({
            code: "custom",
            path: at("bank"),
            message: `正解「${missing.join("、")}」が語群にない`,
          });
        }
        if (q.bank.length <= q.blanks.length) {
          ctx.addIssue({
            code: "custom",
            path: at("bank"),
            message: "語群に まぎらわしい語がない（正解だけの語群は問題にならない）",
          });
        }
      }
    });
  });

/* ------------------------------------------------------------------ *
 * ミーティング（Zoom風の画面で「聞く」教材）
 * ------------------------------------------------------------------ */

/** 会議の参加者。自分は "me" 固定なのでここには入れない。 */
const participantSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: plainText,
  role: plainText,
  /** タイルの縁とイニシャルの色（テーマのアクセント名）。 */
  accent: z.enum(["sky", "leaf", "sun", "coral", "grape"]).default("sky"),
});

const scriptLineSchema = z.object({
  /** participants の id、または "me"・"narration"。 */
  speaker: z.string().min(1),
  text: plainText,
  /** 音声内の開始秒（あれば字幕を音に追従させる）。 */
  at: z.number().nonnegative().optional(),
});

export const meetingSchema = z
  .object({
    kind: z.literal("meeting"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    description: plainText,
    /** 聞く前に配る視点。「どこに注目して聞くか」を先に渡す（P6）。 */
    focus: plainText,
    participants: z.array(participantSchema).min(1),
    script: z.array(scriptLineSchema).min(2),
    /**
     * 音声ファイル。今は任意で、未設定なら台本を読む画面として成立させる。
     * 本番は R2 等の配信先URLを入れる。
     */
    audioUrl: z.string().optional(),
    /** 聞き取りチェック: 聞こえた言葉を入れて見つける。 */
    keywords: z.array(plainText).default([]),
    /** 隠し原稿リベールのクリア条件（原稿の表示率%）。 */
    revealGoal: z.number().int().min(1).max(100).default(30),
    furigana: z.array(furiganaEntrySchema).optional(),
  })
  .superRefine((meeting, ctx) => {
    const known = new Set([...meeting.participants.map((p) => p.id), "me", "narration"]);
    meeting.script.forEach((line, i) => {
      if (!known.has(line.speaker)) {
        ctx.addIssue({
          code: "custom",
          path: ["script", i, "speaker"],
          message: `話者「${line.speaker}」が participants にない（me / narration は使える）`,
        });
      }
    });

    const transcript = meeting.script.map((l) => l.text).join("");
    const missing = meeting.keywords.filter((kw) => !transcript.includes(kw));
    if (missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["keywords"],
        message: `台本に出てこない言葉が キーワードに入っている: ${missing.join("、")}`,
      });
    }
  });

/** ヒアリング型シナリオ（お客さまインタビュー系）。 */
const reqCatSchema = z.enum([
  "why",
  "who",
  "what",
  "when",
  "money",
  "how",
  "scope",
  "other",
]);

const reqSchema = z.object({
  id: z.string().regex(/^r(10|[1-9])$/),
  cat: reqCatSchema,
  icon: z.string().min(1),
  label: plainText,
  /** ボードが開いたとき表示される中身。 */
  secret: plainText,
  /** AI判定プロンプト用の事実（プレーン必須）。 */
  fact: plainText,
  /** ローカル判定用キーワード。漢字・かな両方で3語以上。 */
  keywords: z.array(plainText).min(3),
  /** 「こう聞いてみよう」の例文。 */
  hint: plainText,
});

const researchQuizSchema = z.object({
  q: plainText,
  options: z.array(plainText).length(3),
  /** options のインデックス。 */
  answer: z.number().int().min(0).max(2),
  /** 励まし系の解説（正誤に関わらず実務に接続する）。 */
  why: plainText,
});

const researchPageSchema = z.object({
  tab: plainText,
  frame: z.enum(["phone", "browser"]),
  url: z.string().min(1),
  /** 模擬ページHTML。秘匿情報（reqsで引き出す事実）を書かないこと（lintが警告）。 */
  html: z.string().min(1),
});

export const scenarioSchema = z
  .object({
    kind: z.literal("scenario"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    order: z.number().int().positive(),
    title: plainText,
    subtitle: plainText,
    subtitleEn: z.string().min(1),
    emoji: z.string().min(1),
    color: z.string().min(1),
    difficulty: z.number().int().min(1).max(3),
    client: z.object({
      name: plainText,
      role: plainText,
      desc: plainText,
      /** Live音声プリセット名。 */
      voice: z.string().min(1),
      avatar: z.string().min(1),
      /** 先輩キャラの攻略ひとこと。 */
      tip: plainText,
    }),
    mission: z.object({
      chat: z
        .array(
          z.object({
            from: z.enum(["hendy", "me"]),
            text: plainText,
          }),
        )
        .min(2),
      goal: plainText,
    }),
    /** きょうのことば（6語前後）。DATA DIVEステージに転用する。 */
    words: z
      .array(
        z.object({
          w: plainText,
          r: hiragana,
          en: z.string().min(1),
          m: plainText,
        }),
      )
      .min(4),
    research: z.object({
      intro: plainText,
      pages: z.array(researchPageSchema).min(1),
      quiz: z.array(researchQuizSchema).length(3),
      findings: z.array(plainText).min(3),
    }),
    interview: z.object({
      /** Live systemInstruction 全文。10か条契約・分かち書き・プレーン。 */
      persona: plainText,
      reqs: z.array(reqSchema).length(10),
    }),
    doc: z.object({
      projectName: plainText,
      clientLine: plainText,
      sections: z
        .array(
          z.object({
            title: plainText,
            items: z
              .array(
                z.object({
                  /** null = 事前調査由来（🔍表示）。 */
                  reqId: z.string().nullable(),
                  text: plainText,
                }),
              )
              .min(1),
          }),
        )
        .min(1),
    }),
    lesson: z.object({
      title: plainText,
      points: z.array(plainText).min(2),
    }),
    furigana: z.array(furiganaEntrySchema).optional(),
  })
  .superRefine((s, ctx) => {
    const reqIds = s.interview.reqs.map((r) => r.id);
    if (new Set(reqIds).size !== reqIds.length) {
      ctx.addIssue({ code: "custom", message: "reqs の id が重複している" });
    }
    const docReqIds = new Set(
      s.doc.sections.flatMap((sec) =>
        sec.items.map((i) => i.reqId).filter((x): x is string => x !== null),
      ),
    );
    for (const id of reqIds) {
      if (!docReqIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `doc に ${id} が1回も登場しない（全reqIdを要件定義書に配置する）`,
        });
      }
    }
  });

export const contentSchema = z.discriminatedUnion("kind", [
  wordStageSchema,
  quizSetSchema,
  meetingSchema,
  scenarioSchema,
]);

export type Word = z.infer<typeof wordSchema>;
export type WordStage = z.infer<typeof wordStageSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizSet = z.infer<typeof quizSetSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type MeetingParticipant = z.infer<typeof participantSchema>;
export type MeetingScriptLine = z.infer<typeof scriptLineSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Content = z.infer<typeof contentSchema>;
