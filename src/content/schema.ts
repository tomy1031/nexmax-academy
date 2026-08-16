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
 * リスニング（Zoom風の画面で「聞く」教材）
 *
 * Zoom風の対話（Gemini Live）は別種別の scenario＝「たいわ」。同じ枠を使うが
 * 教材としては別物なので、内部の kind まで呼び分ける。ここを共通の名前に戻すと、
 * 先生は一覧のどちらを開けば台本を直せるのか分からなくなる。
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

export const listeningSchema = z
  .object({
    kind: z.literal("listening"),
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
    /** 隠し原稿リベールのクリア条件（原稿の表示率%）。ここを超えると答え合わせへ進める。 */
    revealGoal: z.number().int().min(1).max(100).default(30),
    /**
     * 画面の型。
     * - `player` … ふつうの再生プレイヤー。字幕はフロートで追いかける
     * - `call`   … Zoom風の画面（相手の顔が並ぶ）
     * 「聞く」だけの教材に人の顔を並べる必要はないので、既定は player。
     */
    mode: z.enum(["player", "call"]).default("player"),
    /** 聞き取りチェックの設定（先生が課ごとに変えられる）。 */
    check: z
      .object({
        /**
         * 受けつける最小の文字数（ひらがなだけのとき）。
         * 短すぎる入力は「まぐれ当たり」になるので下限を置くが、
         * N4以下の学習者には3文字でも長い。課ごとに変えられるようにする。
         */
        minLength: z.number().int().min(1).max(8).default(3),
        /** 何回まちがえたら ヒントを出すか。 */
        maxMiss: z.number().int().min(1).max(20).default(3),
        /** 台本を最初から見せるか。既定は**見せない**（見えていると聞く練習にならない）。 */
        showScript: z.boolean().default(false),
        /** 聞き取りチェック（タイピング）を出すか。 */
        showTyping: z.boolean().default(true),
      })
      .default({ minLength: 3, maxMiss: 3, showScript: false, showTyping: true }),
    furigana: z.array(furiganaEntrySchema).optional(),
  })
  .superRefine((listening, ctx) => {
    const known = new Set([...listening.participants.map((p) => p.id), "me", "narration"]);
    listening.script.forEach((line, i) => {
      if (!known.has(line.speaker)) {
        ctx.addIssue({
          code: "custom",
          path: ["script", i, "speaker"],
          message: `話者「${line.speaker}」が participants にない（me / narration は使える）`,
        });
      }
    });

    const transcript = listening.script.map((l) => l.text).join("");
    const missing = listening.keywords.filter((kw) => !transcript.includes(kw));
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

/* ------------------------------------------------------------------ *
 * ステージ・漫画・説明ページ（コンテンツスタジオ — 設計07 §3〜§5）
 * ------------------------------------------------------------------ */

/** ステージから参照できるコンテンツ種別（設計07 §3）。 */
export const CONTENT_REF_TYPES = [
  "manga",
  "article",
  "slides",
  "listening",
  "quizset",
  "scenario",
  "meeting",
  "wordstage",
] as const;

const contentRefTypeSchema = z.enum(CONTENT_REF_TYPES);

/** ステージ内の1コンテンツ参照。contents[] の並びが学習順（順序の正はステージ側）。 */
export const stageContentRefSchema = z.object({
  ref: z.string().min(1),
  type: contentRefTypeSchema,
});

/**
 * ステージ＝コンテンツの入れ物と順序（設計07 §3）。マップはこのデータから描画する。
 * コンテンツ側はステージを知らない（付け替え・使い回しが自由）。
 * 参照切れは lint:content の参照整合検査（content-checks.ts）が落とす。
 */
/**
 * マップのエリア（そのステージが立つ土地）。設計: src/content/areas.ts
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」。土地はステージが持つ——コードに
 * 既定の並びを置くのはやめた。既定があると「マップに出ている土地」と「先生が作った
 * ステージ」がずれ、消したはずの土地が地図に残る。
 *
 * **表示名に国名を入れない**（areas.ts の方針）。国は情勢で差し替える前提なので、
 * 画面文言が国に依存していると差し替えのたびに UI を直すことになる。
 * とくに「タイ」は使用禁止（AGENTS.md）。都市名・遺跡名は国名ではないので使ってよい。
 */
export const mapAreaSchema = z.object({
  /** 画面に出す景色の名前。国名を入れない。 */
  name: plainText,
  reading: hiragana,
  /** 背景画像。`/img/scenes/...` か、スタジオでアップロードした画像のURL。 */
  image: z.string().min(1),
  /** 地図に小さく添える一言。 */
  note: plainText,
});

/**
 * ステージのIDに使えない語。
 *
 * ステージのIDはそのまま URL の1段目になる（`/houkoku/listening`）。アプリが
 * すでに使っている1段目と同じ名前を許すと、そのステージには**永久にたどり着けない**
 * （Next.js は静的なルートを優先するので、ステージ側は黙って無視される）。
 * 先生には理由が見えないので、保存の時点で止める。
 *
 * `img` は `public/` が配信される場所。1文字も余計に足していない——
 * ここに無い名前は、増やしたルートの名前がここに足されていないだけ。
 */
export const RESERVED_STAGE_IDS = [
  "admin",
  "api",
  "arcade",
  "article",
  "auth",
  "dictionary",
  "img",
  "listening",
  "login",
  "manga",
  "map",
  "nexmax",
  "quiz",
  "slides",
  "studio",
  "talk",
  "tutorial",
  "welcome",
] as const;

export const stageSchema = z.object({
  kind: z.literal("stage"),
  /** URL の1段目になる（`/houkoku/listening`）。変えると進捗の記録がつながらなくなる。 */
  id: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .refine((id) => !(RESERVED_STAGE_IDS as readonly string[]).includes(id), {
      message: `アプリが使っている名前なので URL にできない（${RESERVED_STAGE_IDS.join("・")}）`,
    }),
  /**
   * マップに並べる順（小さいほど手前）。番号そのものに意味はなく、並び替えの結果でしかない。
   * 飛び番でも構わない——連番に詰め直すと、離れたステージまで巻き込んで保存することになる。
   */
  order: z.number().int().min(1),
  title: plainText,
  reading: hiragana,
  description: plainText,
  /** マップのピン色。 */
  color: z.enum(["leaf", "sky", "coral", "sky-soft"]),
  status: z.enum(["draft", "published"]).default("published"),
  /**
   * まなびマップに 並べるか。**既定は true**（作ったステージは 地図に出る）。
   *
   * false にすると **地図から消えるが URL は生きる**。「はじめに」のように、
   * 学習の道すじには載せず、先生がリンクを配って見せる案内のための状態である。
   * 中の教材も `/<ステージ>/<種別>` でこれまでどおり開ける。
   *
   * `status`（したがき か こうかい か＝**完成度**）とは別の軸にした。draft を
   * 流用すると、完成しているのに未完成として扱われる——ふりがなの覆い検査が
   * warn に緩み（checkFuriganaCoverageOf）、DB経由では学習者から読めなくなり
   *（content-db の RLS）、先生がスタジオで「こうかい」を押した瞬間に地図へ出る。
   * 「完成しているか」と「地図に出すか」は、そもそも別の問いである。
   */
  listed: z.boolean().default(true),
  /** 学習順そのもの（並びが正）。 */
  contents: z.array(stageContentRefSchema).min(1),
  /** 紐づく単語ステージ（別管理・複数可）。 */
  wordStageIds: z.array(z.string().min(1)).default([]),
  /** マップでこのステージが立つ土地。 */
  area: mapAreaSchema.optional(),
});

/**
 * 画像スロット（設計07 §4・§5 共通）。
 * 「生成する／アップロードする／あとで」を status で表し、prompt / refs は再生成用に保存する。
 */
export const imageSlotSchema = z.object({
  /** 表示する画像。未生成なら省略。 */
  src: z.string().min(1).optional(),
  /** 生成に渡したプロンプト全文（再現・「少し直して再生成」用）。 */
  prompt: z.string().min(1).optional(),
  /** 参照画像（キャラ正典・同一場面の直前パネルなど）。 */
  refs: z.array(z.string().min(1)).default([]),
  status: z.enum(["empty", "generating", "done"]).default("empty"),
});

/** ことばチップ（語・読み・意味）。タップで辞書ポップアップ。 */
const vocabItemSchema = z.object({
  term: plainText,
  reading: hiragana,
  meaning: plainText,
  /**
   * 英語の意味。N5を超える語には必ず添える（docs/constraints.md 製品の制約——
   * ひらがなに開いても意味は伝わらない。漢字＋ふりがな＋英語で支える）。
   */
  en: z.string().optional(),
});

/** 漫画の中での登場人物（見出しに出す最小限）。設定と絵は character 側に持つ。 */
const mangaCharacterSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: plainText,
  role: plainText,
});

/**
 * 登場人物（教材をまたいで使い回す設定）。
 *
 * まんがのコマを何枚も作ると、**コマごとに顔や服が変わる**のが最大の問題になる。
 * これを防ぐ確立した方法は「先にキャラクターシート（設定画）を1枚作り、
 * それを参照画像として毎回渡す」こと——プロンプトで毎回容姿を書くより確実である
 *（Google の consistent-imagery codelab、および国内の実装記事の一致した結論）。
 * だから人物は まんがの中ではなく、**独立した保存先**に置く。
 *
 * 声も持つ。リスニングの音声づくり（Live TTS）で同じ人物が別の声になると、
 * 学習者は同じ人だと思えなくなる。
 */
export const characterSchema = z.object({
  kind: z.literal("character"),
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: plainText,
  reading: hiragana,
  /** 立場（先輩・リーダーなど）。上下関係が分からないと敬語の宛先が読めない。 */
  role: plainText,
  /**
   * 見た目の決めごと。あいまいな語を避け、色や形を具体的に書く
   *（「青いジャケット」ではなく「金ボタン3つの紺色ジャケット」）。
   * 抽象的だとコマ間で解釈がドリフトする。
   */
  looks: plainText,
  /** 性格・話し方。セリフを作らせるときの手がかり。 */
  personality: plainText.optional(),
  /** キャラクターシート（三面図＋表情差分）。生成のたびに参照画像として渡す。 */
  sheet: imageSlotSchema.default({ refs: [], status: "empty" }),
  /**
   * 学習者に見せる 顔の絵（しょうかいカード用）。
   *
   * `sheet` を そのまま出せない。あれは**生成のための設計画**で、三面図と表情差分が
   * 1枚に並んでいる——カードに入れると「後ろ姿と 泣き顔が 並んだ絵」になる。
   * だから 正面の1体を 切り出したものを 別に持つ（`portrait.webp`）。
   *
   * 無ければ しょうかいカードは 絵を出さずに 名前だけを 出す（絵の用意が
   * 遅れただけで 人物が 消えるほうが 困る — マップのエリアと同じ考え方）。
   */
  portrait: z.string().min(1).optional(),
  /** 先生が持ち込んだ参考画像。シートを作るときの入力になる。 */
  references: z.array(z.string().min(1)).default([]),
  /**
   * この人の声（src/lib/audio/voices.ts の名前）。
   * リスニングの音声づくりにも、ミーティングで Live が話すときにも使う。
   * **人物カードを1つの正**にしておかないと、教材ごとに声が食い違う。
   */
  voice: z.string().optional(),
  /**
   * 口パクの絵（母音5つ＋閉じ）。ミーティングで音に合わせて口を動かすのに使う。
   *
   * 省略したときは `/img/characters/<id>/mouth/<形>.webp` を見る（先に置いた分と
   * 互換）。**背景と顔は6枚で同じにする**こと——1枚でも違うと、切り替えのたびに
   * 画面がちらつく（実際に起きた。スタジオで作るときは口の部分だけを重ねている）。
   */
  mouth: z
    .object({
      closed: z.string().optional(),
      a: z.string().optional(),
      i: z.string().optional(),
      u: z.string().optional(),
      e: z.string().optional(),
      o: z.string().optional(),
    })
    .optional(),
});

/** セリフ1行。speaker は characters の id、または "narration"。 */
const mangaLineSchema = z.object({
  speaker: z.string().min(1),
  text: plainText,
});

const mangaPanelSchema = z.object({
  /** レイアウトヒント（story 形式でのみ意味を持つ。wide＝決めゴマ）。 */
  size: z.enum(["normal", "wide", "tall"]).default("normal"),
  image: imageSlotSchema.default({ refs: [], status: "empty" }),
  /** セリフは画像に焼き込まずデータで持つ（設計07 §4 最重要判断）。 */
  lines: z.array(mangaLineSchema).default([]),
  caption: plainText.optional(),
  /**
   * 絵の中に焼いた文字（`speechInImage: true` のときだけ入る）。
   *
   * `lines[i]` を読み辞書で かなに直したもの（`kanaOf`）。i番目の吹き出しに対応する。
   *
   * **AIに書かせない。** 機械変換にするのは、絵に焼いた文字とデータのセリフが
   * ずれる余地を無くすため——ずれると「セリフを直したのに古い字の絵が
   * 公開され続ける」ことになり、先生からは気づけない。セリフが正、絵は写し。
   *
   * ここに置く（プロンプトの中に閉じない）理由: 学習者が実際に読むのはこの文字列なので、
   * **禁止語検査の対象に入っていなければならない**（規律1・`collectStrings` は全文字列を走査する）。
   */
  bakedText: z.array(plainText).default([]),
});

const mangaPageSchema = z.object({
  /** 場面カード（story のみ・省略可）。例:「その日の午後 — 会議室」。 */
  title: plainText.optional(),
  panels: z.array(mangaPanelSchema).min(1),
  /**
   * そのページの補足。絵とセリフだけでは伝わらないこと
   *（「ここでは まだ 名前を 言っていません」など）を一言そえる。
   */
  note: plainText.optional(),
});

/** 漫画ページ（設計07 §4）。4コマもストーリーも同じ構造で、違いは量とレイアウトヒントだけ。 */
export const mangaSchema = z
  .object({
    kind: z.literal("manga"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    format: z.enum(["yonkoma", "story"]),
    title: plainText,
    description: plainText,
    furigana: z.array(furiganaEntrySchema).optional(),
    /**
     * 復習に出す語彙。furigana（ルビ合成のための最長一致辞書）とは役割が違う。
     * 辞書には「分」「終」のような送りがな幹も入るので、そのまま語彙として見せない
     *（意味を1行で書ける語だけをここに載せる — 設計07 §4）。
     */
    vocab: z.array(vocabItemSchema).optional(),
    characters: z.array(mangaCharacterSchema).optional(),
    /** 使い回す登場人物のID（character）。絵を作るとき 参照画像として渡す。 */
    castIds: z.array(z.string().min(1)).default([]),
    /**
     * セリフを**絵の中に**描くか。
     *
     * 既定は false（絵は文字なしで作り、セリフは画面で重ねる）。
     * 画像生成に日本語を描かせると漢字が崩れやすく、**ふりがなは実例がゼロ**で、
     * 原理的にも最も壊れる（本文より小さい・位置が厳密・画数の多い漢字の真上）。
     * 焼き込むと `lint:content` のふりがな全覆い検査も効かなくなる（AGENTS.md 規律2）。
     *
     * それでも「絵の中に入れたい」ときのために true を用意してある。
     * true にすると、画面はセリフを別に出さない。
     */
    speechInImage: z.boolean().default(false),
    pages: z.array(mangaPageSchema).min(1),
  })
  .superRefine((manga, ctx) => {
    const characters = manga.characters ?? [];
    const ids = characters.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["characters"], message: "characters の id が重複している" });
    }
    const known = new Set([...ids, "narration"]);
    manga.pages.forEach((page, pageIndex) => {
      page.panels.forEach((panel, panelIndex) => {
        panel.lines.forEach((line, lineIndex) => {
          if (!known.has(line.speaker)) {
            ctx.addIssue({
              code: "custom",
              path: ["pages", pageIndex, "panels", panelIndex, "lines", lineIndex, "speaker"],
              message: `話者「${line.speaker}」が characters にない（narration は使える）`,
            });
          }
        });
        checkBakedText(manga.speechInImage, panel, [
          "pages",
          pageIndex,
          "panels",
          panelIndex,
        ], ctx);
      });
    });
  });

/** 絵に描かせる日本語は長いほど崩れる。1つの吹き出しの上限。 */
const MAX_BAKED_CHARS = 20;
/** 絵に焼いてよい文字。かな・数字・句読点だけ（漢字はルビを焼けないので入れない）。 */
const KANA_AND_MARKS = /^[ぁ-ゖァ-ヶーゔ0-9０-９、。！？…「」・\s]*$/u;
const HAS_KANJI = /[㐀-鿿々]/u;

/**
 * 絵に焼く文字の検査。
 *
 * ここが無いと、次の壊れ方が**先生から見えないまま**残る:
 *   - セリフを直したのに絵が古い（学習者は絵の字を読むので、直した意味がない）
 *   - 絵に漢字が焼かれ、ふりがなを振れないまま学習者が止まる（規律2）
 *   - 「絵だけ」に戻したのに焼き文字が残り、絵の字とアプリのセリフが二重に出る
 */
function checkBakedText(
  speechInImage: boolean,
  panel: { lines: readonly { text: string }[]; bakedText: readonly string[] },
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const at = (field: string) => [...path, field];

  if (!speechInImage) {
    if (panel.bakedText.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: at("bakedText"),
        message: "「絵だけ」に もどしたら、絵も 作り直す（焼いた 文字が のこっている）",
      });
    }
    return;
  }

  if (panel.bakedText.length !== panel.lines.length) {
    ctx.addIssue({
      code: "custom",
      path: at("bakedText"),
      message: `焼いた 文字が ${panel.bakedText.length}こ、セリフが ${panel.lines.length}こ — 数を そろえる`,
    });
  }
  if (panel.lines.length > 2) {
    ctx.addIssue({
      code: "custom",
      path: at("lines"),
      message: "文字を 絵に 焼くときは 1コマ 2つの 吹き出しまで（多いと 字が くずれる）",
    });
  }
  panel.bakedText.forEach((text, i) => {
    if (HAS_KANJI.test(text)) {
      ctx.addIssue({
        code: "custom",
        path: at(`bakedText[${i}]`),
        message: "絵に 焼く 文字に 漢字は 使えない（ふりがなを 焼けないので 学習者が 読めない・規律2）",
      });
    } else if (!KANA_AND_MARKS.test(text)) {
      ctx.addIssue({
        code: "custom",
        path: at(`bakedText[${i}]`),
        message: "絵に 焼く 文字は ひらがな・カタカナ・数字・記号だけ",
      });
    }
    if ([...text].length > MAX_BAKED_CHARS) {
      ctx.addIssue({
        code: "custom",
        path: at(`bakedText[${i}]`),
        message: `絵に 焼く 文字は ${MAX_BAKED_CHARS}文字まで（長いと 字が くずれる）`,
      });
    }
  });
}

/**
 * 説明ページのブロック（設計07 §5）。生HTMLは持たない — 禁止語・ルビ・秘匿漏れの
 * 機械検査を確実に効かせ、XSSなくDB由来コンテンツを描画するため。
 * 判別キーは kind（link ブロックが参照先種別に type を使うため）。
 */
export const articleBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    text: plainText,
  }),
  z.object({ kind: z.literal("paragraph"), text: plainText }),
  imageSlotSchema.extend({ kind: z.literal("image"), caption: plainText.optional() }),
  z.object({ kind: z.literal("callout"), tone: z.enum(["point", "care"]), text: plainText }),
  z.object({ kind: z.literal("list"), items: z.array(plainText).min(1) }),
  z.object({ kind: z.literal("steps"), items: z.array(plainText).min(1) }),
  z.object({ kind: z.literal("vocab"), items: z.array(vocabItemSchema).min(1) }),
  /** 次の教材への誘導カード（ステージ内コンテンツ限定）。 */
  z.object({
    kind: z.literal("link"),
    ref: z.string().min(1),
    type: contentRefTypeSchema,
    label: plainText,
  }),
  /**
   * 外部サイトへのリンクカード（実サイト調査用）。本文中の URL 文字列は
   * タップできない——「先生が リンクを 出します」が自宅で成立しない事故を防ぐ
   *（願い #43・改善 #24）。学習者向けの誘導は必ずこのブロックで置く。
   */
  z.object({
    kind: z.literal("extlink"),
    url: z.string().url(),
    label: plainText,
    /** リンクの下に出す ひとこと（「あたらしい タブで ひらくよ」等）。 */
    note: plainText.optional(),
  }),
  /**
   * 登場人物の しょうかいカード（「キャラクター紹介」のためのブロック）。
   *
   * 絵と 名前は **人物カード（`content/characters/*.json`）から引く**。記事に
   * 書き写すと、人物カードの絵を差し替えたときに記事だけ古い絵のまま残る——
   * ミーティングの声を人物カードに一本化したのと同じ理由（`[stage]/[content]`）。
   *
   * 立場と ひとことは **記事側に持つ**。人物カードの `role` / `personality` は
   * 先生向けの覚書で（`looks` にいたっては英語の生成プロンプト）、学習者が読む
   * 言葉ではない。ここに書けば記事の読み辞書でふりがなを覆える（規律2）。
   */
  z.object({
    kind: z.literal("characters"),
    items: z
      .array(
        z.object({
          /** 人物カードの id（`content/characters/<id>.json`）。 */
          ref: z.string().min(1),
          /** 学習者に見せる立場。「せんぱい」「しゃちょう」など、やさしい言い方で。 */
          role: plainText,
          /** ひとこと しょうかい。 */
          note: plainText,
        }),
      )
      .min(1),
  }),
]);

/** 説明ページ（article / WYSIWYG — 設計07 §5）。保存形式はブロックJSON。 */
export const articleSchema = z.object({
  kind: z.literal("article"),
  id: z.string().regex(/^[a-z0-9_-]+$/),
  title: plainText,
  description: plainText,
  furigana: z.array(furiganaEntrySchema).optional(),
  blocks: z.array(articleBlockSchema).min(1),
});

/* ------------------------------------------------------------------ *
 * スライド（先生が授業で使う資料を、そのまま全画面で見せる）
 * ------------------------------------------------------------------ */

/** スライド1枚ぶんの ひとこと。全部の枚数ぶん書かなくてよい（書いた枚だけ出る）。 */
const slideNoteSchema = z.object({
  /** 何枚目か（1始まり＝PDFのページ番号と同じ）。 */
  page: z.number().int().min(1),
  /** その1枚で 見るところ。学習者が読む文なので ふりがな検査の対象になる。 */
  text: plainText,
});

/**
 * PDF らしい置き場所か。`?token=` のような問い合わせが付いていても通す。
 *
 * 拡張子まで見るのは、**先生が .pptx を そのまま上げても画面には何も出ない**から。
 * 変換はサーバでできない（Cloudflare Workers の無料枠に変換の置き場が無い）ので、
 * 上げた瞬間に理由を出すしかない。ここで止めないと、先生は「保存できたのに
 * 学習者の画面が真っ白」という、いちばん原因の見えない壊れ方に出会う。
 */
const pdfLocation = z
  .string()
  .min(1)
  .refine((url) => /\.pdf(\?|#|$)/i.test(url), {
    message:
      "PDF だけ 置けます（パワポは PowerPoint の「PDFとして ほぞん」で 書き出してから 上げてください）",
  });

/**
 * スライド教材 — パワポから書き出した PDF を1枚ずつ全画面で見せる。
 *
 * ## なぜ PDF か（他の道を採らなかった理由）
 * - **パワポのまま置いて外部のビューアに渡す**やり方は採らない。ファイルのURLを
 *   外の会社が取りに来られる状態にする必要があり、教材が実質公開になる。
 * - **サーバで変換**もしない。Cloudflare Workers に LibreOffice は載らず、
 *   変換サービスは無料枠に収まらない（docs/constraints.md「無料枠内で運用する」）。
 * - **ブラウザで pptx を直接描く**のも採らない。日本語のフォントと段組みが崩れ、
 *   先生が作った見た目のまま出ない——「そのまま表示できる」という目的に反する。
 *
 * 残るのは PDF で、これは**先生の見た目がそのまま出る**唯一の道である。
 * 書き出しの ひと手間は先生に残るが、崩れた資料を授業で使うほうが高くつく。
 *
 * ## 絵ではなく1つのファイルで持つ
 * 1枚ずつ画像にして並べる持ち方もあるが、先生は書き出しを何十回も繰り返すことになる。
 * PDF なら1ファイルで済み、差し替えも1回で終わる。
 *
 * ## 読めない字は ひとこと で助ける
 * PDF の中の文字にはふりがなを振れない（画像と同じで、アプリは中身に触れない）。
 * だから `notes` を持つ。**その1枚で何を見るか**を先生の言葉で添えると、
 * 資料が読み切れない学習者でも、その枚で掴むことが1つ残る（規律2 の受け皿）。
 */
export const slidesSchema = z
  .object({
    kind: z.literal("slides"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    description: plainText,
    /** PDFの場所（スタジオで上げたファイルの公開URL、または public/ のパス）。 */
    fileUrl: pdfLocation,
    /**
     * ぜんぶで何枚か。開く前に「ぜんぶで 12まい」と出すために持つ。
     * 先生に数えさせない——上げたときにブラウザが PDF から読んで入れる。
     */
    pageCount: z.number().int().min(1),
    /** 1枚ずつの ひとこと（書いた枚だけ出る）。 */
    notes: z.array(slideNoteSchema).default([]),
    furigana: z.array(furiganaEntrySchema).optional(),
  })
  .superRefine((slides, ctx) => {
    const seen = new Set<number>();
    slides.notes.forEach((note, i) => {
      if (note.page > slides.pageCount) {
        ctx.addIssue({
          code: "custom",
          path: ["notes", i, "page"],
          message: `${note.page}まい目の ひとことですが、スライドは ${slides.pageCount}まいです`,
        });
      }
      if (seen.has(note.page)) {
        ctx.addIssue({
          code: "custom",
          path: ["notes", i, "page"],
          message: `${note.page}まい目の ひとことが 2つ あります（1まいに 1つです）`,
        });
      }
      seen.add(note.page);
    });
  });

/**
 * ミーティングの質問1つ。
 *
 * **閉じた質問から開いた質問へ**並べる。いきなり「なぜ ITですか」を聞くと、
 * 答えられずに黙る——そこで会話が終わる。名前・出身のような1語で答えられる問いから
 * 始めて、答えられた実績を積んでから理由や気持ちに進む。
 */
const meetingQuestionSchema = z.object({
  id: z.string().min(1),
  /** 相手（ヘンディさん）の質問。 */
  ask: plainText,
  /** 答え方の足場。穴あきの型文にする（「わたしは ◯◯です。」）。 */
  hint: plainText,
  /**
   * 言えたことにする手がかり。空なら**何を書いても先へ進む**
   *（自己紹介に「正解」は無い。詰まらせないほうが大事）。
   */
  keywords: z.array(plainText).default([]),
  /** 受け答え。`◯◯` が学習者の答えに置きかわる（おうむ返し＋共感）。 */
  echo: plainText,
  /**
   * 質問を読み上げた音声（作り置き）。
   *
   * 質問は**毎回おなじ文**なので、その場でAIに読ませる必要が無い。作り置きすると
   * 3つ良くなる: ①開いた瞬間に鳴る（毎回2〜3秒待たない）②毎回おなじ声・おなじ
   * 速さで聞ける（聞き取りの練習は「同じ音」の繰り返しが効く）③キーが無い学習者にも
   * 声が届く。空なら Live が読む。
   */
  audioUrl: z.string().optional(),
});

/**
 * ミーティング（Zoomの練習）— 相手の質問に、自分の日本語で答える。
 *
 * `scenario`（たいわ）と分けてある理由は目的である。たいわは**聞き出す**練習で、
 * 模擬ページと要件10件が要る。こちらは**自分のことを話す**練習で、調べる相手も
 * 要件も無い。同じ型に押し込むと、空の模擬ページを作ることになる。
 *
 * 画面は `call-shell.tsx`（Zoom風の枠）を共有する。入室のノックから退出のお礼まで、
 * **Zoomの操作そのものにも慣れる**のがねらい。
 */
export const meetingSchema = z.object({
  kind: z.literal("meeting"),
  id: z.string().regex(/^[a-z0-9_-]+$/),
  title: plainText,
  description: plainText,
  /** 入室前に見せる「きょう やること」。 */
  focus: plainText,
  /**
   * 相手の人格（Live の systemInstruction 全文）。
   * **おうむ返し＋共感**で受けてから次を聞く、という進め方をここに書く。
   * 先生が管理画面で直せる（言い方の相性は教室ごとに違う）。
   */
  persona: plainText,
  /**
   * 学習者の発話をどう見るかの指示。
   * 判定を人格と分けるのは、**話し方を直しても採点の基準は動かない**ようにするため。
   * 「何を言えたら言えたことにするか」「どう助言するか」をここに書く。
   */
  judgePrompt: plainText,
  /** 相手（画面のタイルに出る人）。characters の id と name を写す。 */
  host: participantSchema,
  /** 質問。**並びが学習順**（閉じた質問 → 開いた質問）。 */
  questions: z.array(meetingQuestionSchema).min(3),
  /** ぜんぶ答えたあとに出す ひとこと。 */
  closing: plainText,
  /** おわりの ひとことを読み上げた音声（作り置き。質問の audioUrl と同じ考え方）。 */
  closingAudioUrl: z.string().optional(),
  /**
   * 好感度モード（恋愛ゲーム風・願い #43）。設定があるときだけハートのメーターが出る。
   * ハートは**上がるだけで下がらない**（P8: 罰を見せない）。判定の3段階
   *（veryGood/good/miss）を加点に写し、miss でも会話が進めば少し上がる。
   */
  affection: z
    .object({
      /** メーターの満タン値（ハートの数）。 */
      maxHearts: z.number().int().min(3).max(20).default(10),
      /** ここまで貯まると reward が開く。 */
      threshold: z.number().int().min(1),
      /** 開いたときに相手が話す「とっておきの話」（報酬は物語 — P2×P7）。 */
      reward: plainText,
    })
    .optional(),
  furigana: z.array(furiganaEntrySchema).optional(),
});

export const contentSchema = z.discriminatedUnion("kind", [
  characterSchema,
  meetingSchema,
  wordStageSchema,
  quizSetSchema,
  listeningSchema,
  scenarioSchema,
  stageSchema,
  mangaSchema,
  articleSchema,
  slidesSchema,
]);

export type Word = z.infer<typeof wordSchema>;
export type WordStage = z.infer<typeof wordStageSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizSet = z.infer<typeof quizSetSchema>;
export type Listening = z.infer<typeof listeningSchema>;
export type ListeningParticipant = z.infer<typeof participantSchema>;
export type ListeningScriptLine = z.infer<typeof scriptLineSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type MeetingQuestion = z.infer<typeof meetingQuestionSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type StageContentRef = z.infer<typeof stageContentRefSchema>;
export type ContentRefType = StageContentRef["type"];
export type ImageSlot = z.infer<typeof imageSlotSchema>;
export type Character = z.infer<typeof characterSchema>;
export type Manga = z.infer<typeof mangaSchema>;
export type MangaCharacter = z.infer<typeof mangaCharacterSchema>;
export type MangaPage = Manga["pages"][number];
export type MangaPanel = MangaPage["panels"][number];
export type MangaLine = z.infer<typeof mangaLineSchema>;
export type Article = z.infer<typeof articleSchema>;
export type ArticleBlock = z.infer<typeof articleBlockSchema>;
export type Slides = z.infer<typeof slidesSchema>;
export type SlideNote = z.infer<typeof slideNoteSchema>;
export type Content = z.infer<typeof contentSchema>;
