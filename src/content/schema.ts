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
    /** 隠し原稿リベールのクリア条件（原稿の表示率%）。 */
    revealGoal: z.number().int().min(1).max(100).default(30),
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
  "listening",
  "quizset",
  "scenario",
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
 * マップは「1ステージ＝1エリア＝背景画像1枚」。ステージがこれを持つことで、
 * スタジオからステージを足すとマップの停留所も一緒に増える（コードを触らずに済む）。
 * 省略すると、既定のエリア（areas.ts の並び）がその step の位置に使われる。
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

export const stageSchema = z.object({
  kind: z.literal("stage"),
  id: z.string().regex(/^[a-z0-9_-]+$/),
  /** マップ上の順序（M1〜M12）。 */
  step: z.number().int().min(1).max(12),
  title: plainText,
  reading: hiragana,
  description: plainText,
  /** マップのピン色。 */
  color: z.enum(["leaf", "sky", "coral", "sky-soft"]),
  status: z.enum(["draft", "published"]).default("published"),
  /** 学習順そのもの（並びが正）。 */
  contents: z.array(stageContentRefSchema).min(1),
  /** 紐づく単語ステージ（別管理・複数可）。 */
  wordStageIds: z.array(z.string().min(1)).default([]),
  /** マップでこのステージが立つ土地。省略すると既定のエリアを使う。 */
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
});

/** 漫画の登場人物（画像の一貫性にも使う）。 */
const mangaCharacterSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: plainText,
  role: plainText,
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
});

const mangaPageSchema = z.object({
  /** 場面カード（story のみ・省略可）。例:「その日の午後 — 会議室」。 */
  title: plainText.optional(),
  panels: z.array(mangaPanelSchema).min(1),
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
      });
    });
  });

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

export const contentSchema = z.discriminatedUnion("kind", [
  wordStageSchema,
  quizSetSchema,
  listeningSchema,
  scenarioSchema,
  stageSchema,
  mangaSchema,
  articleSchema,
]);

export type Word = z.infer<typeof wordSchema>;
export type WordStage = z.infer<typeof wordStageSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizSet = z.infer<typeof quizSetSchema>;
export type Listening = z.infer<typeof listeningSchema>;
export type ListeningParticipant = z.infer<typeof participantSchema>;
export type ListeningScriptLine = z.infer<typeof scriptLineSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type StageContentRef = z.infer<typeof stageContentRefSchema>;
export type ContentRefType = StageContentRef["type"];
export type ImageSlot = z.infer<typeof imageSlotSchema>;
export type Manga = z.infer<typeof mangaSchema>;
export type MangaCharacter = z.infer<typeof mangaCharacterSchema>;
export type MangaPage = Manga["pages"][number];
export type MangaPanel = MangaPage["panels"][number];
export type MangaLine = z.infer<typeof mangaLineSchema>;
export type Article = z.infer<typeof articleSchema>;
export type ArticleBlock = z.infer<typeof articleBlockSchema>;
export type Content = z.infer<typeof contentSchema>;
