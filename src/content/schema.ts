import { z } from "zod";

/**
 * コンテンツスキーマ（フェーズ0・v1）
 *
 * 原則（docs/design/03 §1.4）: スキーマが検収の契約。
 * - 表示用テキストはプレーンテキストで持ち、ルビは表示時にエンジンが合成する
 * - 学習者向け文言の禁止語は lint:content が全文書を走査する
 * - スキーマ変更はマイグレーションスクリプトとセットで（/schema-change 手順）
 */

/**
 * 学習者向け文言の禁止語（理解設計ガイド P8）。
 *
 * ## まず「結果を ぼかさない」が 先に 来る（2026-09-03 の 指定）
 * 正解か 不正解か、合格か 不合格かが **学習者の 理解に 要る 場面では、はっきり 書く**。
 * そこを ぼかして「よくできたね」の ような 綺麗事だけを 出すのは **害でしかない**——
 * 学習者は 自分が 何を 直せば いいのか 分からなく なる。
 *
 * ## だから「不正解」「間違いです」は 禁止語では ない
 * 2026-09-03 に 一覧から 外した。ユーザーの 指定:
 *「正解か不正解か、合格か不合格か明記しないと理解できない箇所で綺麗事のような
 *  メッセージが表示される（よくできたね）のは害でしかない」。
 *
 * **語を 禁じると、判定そのものを ぼかす 方へ 逃げる。** 「不正解」と 書けない AI は
 * 「おしい！」「いい ちょうしです」で 済ませ、**いちばん 要る 情報（どちらだったか）が
 * 消える**。禁じるべきは 事実の 判定では なく、**人に 向けた 見下し**だけ。
 *
 * ## 残して ある のは「人を 責める ことば」だけ
 * 「ダメです」は こたえでは なく **人**を 名ざす 言い方に なりやすい。
 * 同じ ことは 「不正解です。正しい こたえは ◯◯です」で 過不足なく 言える。
 *
 * 判定を 言った あとに **次の 行動を 1つ** 添える（P8）。ゲームの 最中は
 * ⭕／❌ の しるしと 正しい こたえだけ（constraints 2026-08-27）。
 *
 * ## 会話練習（ミーティング・たいわ）は 別の 型
 * こちらは 相手役の AI が **ポジティブに 受け取る**のが 正しい——挑戦して 話した
 * ことを まず 受ける。ただし **分からなかった ときは 分かった ふりを せず、聞き返す**
 *（「すみません、もう 一度 お願いします」）。聞き返しは 会話の 自然な 一部で、しかも
 * **学習者に「通じなかった」を 正確に 伝える**唯一の 手——褒めて 流すと、通じて
 * いない ことが 最後まで 分からない（2026-09-03 の 指定）。
 */
export const FORBIDDEN_LEARNER_WORDS = ["ダメです", "ダメだ"] as const;

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

/**
 * 画像スロット（設計07 §4・§5 共通）。
 * 「生成する／アップロードする／あとで」を status で表し、prompt / refs は再生成用に保存する。
 *
 * **ここに 置いて ある**のは、問題（`quizCommon`）・記事・まんが・人物の どれもが
 * これを 使うため。const は 巻き上がらないので、いちばん 早く 使う ところ
 *（この 下の 問題セット）より 前に 無いと、読みこんだ 瞬間に 落ちる。
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

/* ------------------------------------------------------------------ *
 * ことばの 正（vocab）— 語彙の 置き場は ここ 1つ
 *
 * これまで 語彙は **5か所**に あった（単語ステージ／記事の vocab ブロック／
 * まんがの vocab／スライドの ノート／`src/content/glossary.ts`）。同じ
 * 「要件定義」が いくつも あり、**説明が 別々に 育つ**。先生が 直せるのは
 * そのうち 単語ステージだけで、直しても 他の 4か所は 古いままだった。
 *
 * そこで **語は ここにしか 置かない**。教材（ステージ・記事・まんが・スライド）は
 * `id` で 参照するだけに する（2026-08-20 ユーザー判断「まだボリュームが少ない
 * 今こそ 1か所に すべき」）。
 * ------------------------------------------------------------------ */

/** ことば 1語。学習者に 出す ものは ぜんぶ ここに 持つ。 */
export const vocabWordSchema = z.object({
  /**
   * 語の id。**進み具合（mastery）の 保存キー**なので あとから 変えない。
   * 単語ステージから 移した 語は、そのときの id を そのまま 引き継ぐ
   *（変えると 学習履歴が 切れる）。
   */
  id: z.string().regex(/^[a-z0-9_-]+$/),
  term: plainText,
  reading: hiragana,
  romaji: z.string().optional(),
  /** やさしい日本語の 説明（1文）。 */
  meaningJa: plainText,
  /**
   * 対訳の1語。**説明ではなく 見出し**なので 短く 保つ。
   * まだN4を 勉強中の 学習者が、説明を 読まずに ここで 足りるように するための 段。
   *
   * 教材から 拾ったばかりの 語には まだ 無い ことが ある（先生が あとで 足す）。
   * ただし **単語ゲームに 出す 語（`wrongMeanings` を 持つ 語）には 必ず 要る**
   *——4択の 正解が これだからである。
   */
  englishTerm: noJapanese.optional(),
  /** 意味の 英語。日本語の 説明でも 英語1語でも 届かなかった ときの 受け皿。 */
  englishMeaning: noJapanese.optional(),
  /** 出典教材と 同じ 文脈の 例文。 */
  example: plainText.optional(),
  /**
   * 単語ゲームの 誤答3つ。**ゲームに 出す 語だけ** 持つ
   *（持たない 語は 辞書・ツールチップにだけ 出る）。
   */
  wrongMeanings: z.array(noJapanese).length(3).optional(),
  /**
   * この語の 説明文・例文に 要る 読み辞書。
   *
   * 束（`vocab.furigana`）は みんなで 使う 土台で、ここは **その語だけの 足し前**。
   * 説明文を 直す 人が 同じ 場所で 読みも 足せるように、語の となりに 置く
   *（別ファイルへ 行かないと 直せないと、読めない 漢字は 直らないまま 残る）。
   */
  furigana: z.array(furiganaEntrySchema).optional(),
});

/** ことばの 束（いまは 1ファイル）。 */
export const vocabSchema = z
  .object({
    kind: z.literal("vocab"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    /** 複合語優先の読み辞書（説明文・例文の 漢字を 覆う）。 */
    furigana: z.array(furiganaEntrySchema).optional(),
    words: z.array(vocabWordSchema).min(1),
  })
  .superRefine((book, ctx) => {
    const ids = book.words.map((w) => w.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["words"], message: "words の id が重複している" });
    }
    const terms = book.words.map((w) => w.term);
    if (new Set(terms).size !== terms.length) {
      ctx.addIssue({
        code: "custom",
        path: ["words"],
        message: "同じ 表記の ことばが 2つ ある — 説明が 2つ 育つので 1つに まとめる",
      });
    }
    book.words.forEach((w, i) => {
      if (!w.wrongMeanings) return;
      if (!w.englishTerm) {
        ctx.addIssue({
          code: "custom",
          path: ["words", i, "englishTerm"],
          message: `「${w.term}」は 単語ゲームに 出る（誤答が ある）ので 対訳の1語が 要る`,
        });
        return;
      }
      const meanings = [w.englishTerm, ...w.wrongMeanings].map((m) => m.trim().toLowerCase());
      if (new Set(meanings).size !== meanings.length) {
        ctx.addIssue({
          code: "custom",
          path: ["words", i, "wrongMeanings"],
          message: `「${w.term}」の選択肢に重複がある（誤答同士、または誤答＝正解）`,
        });
      }
    });
  });

/** 単語ステージ（課ごとに1ステージ追加するだけでゲーム化される）。 */
export const wordStageSchema = z
  .object({
    kind: z.literal("wordstage"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    description: plainText,
    /**
     * セット名（「初級」「中級」など。数も 名前も 自由）。**学習者に 見える**。
     *
     * label の ある 単語ステージは、ステージの 中で **別々の セット**として 出す。
     * label の 無い ものは これまでどおり **1つに 統合**する（2026-08-19 の
     * 「ITとビジネスを 分けなくてよい」は 名前の 無い ものに 生きつづける）。
     * 統合と 分割の 実装は `src/lib/wordstage-merge.ts`。
     */
    label: plainText.optional(),
    /** 教師が授業で伝える開放パスワード。省略時は最初から開放。 */
    password: z.string().optional(),
    fieldSequence: z.array(z.string()).min(1),
    questionCount: z.number().int().positive(),
    passRate: z.number().int().min(1).max(100),
    /** 複合語優先の読み辞書（表示ルビ用）。語を 参照で 持つ ときは 正の 側が 運ぶ。 */
    furigana: z.array(furiganaEntrySchema).optional(),
    /**
     * ことばの id（`content/vocab/vocabulary.json`）。**これが これからの 持ちかた**。
     * 読み出すとき（`src/lib/content.ts`）に 正から 引いて `words` を 埋める——
     * だから ゲームも 辞書も スタジオも これまでどおり `words` を 見れば よい。
     */
    wordIds: z.array(z.string().min(1)).min(6).optional(),
    /**
     * 語を 直に 持つ 古い かたち。スタジオが 作った ものが まだ この形なので 残す。
     * 新しく 足すなら `wordIds` を 使う（語の 説明が 2つ 育つのを 防ぐため）。
     */
    words: z.array(wordSchema).min(6).optional(),
  })
  .superRefine((stage, ctx) => {
    if (!stage.wordIds && !stage.words) {
      ctx.addIssue({
        code: "custom",
        path: ["wordIds"],
        message: "ことばが 無い — wordIds（正への 参照）を 書く",
      });
      return;
    }
    const count = stage.wordIds?.length ?? stage.words?.length ?? 0;
    if (stage.wordIds) {
      const ids = stage.wordIds;
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", path: ["wordIds"], message: "wordIds が重複している" });
      }
    }
    if (stage.questionCount > count) {
      ctx.addIssue({
        code: "custom",
        path: ["questionCount"],
        message: `questionCount(${stage.questionCount}) が語数(${count})を超えている — 出題は語彙の部分集合`,
      });
    }
    if (!stage.words) return;
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
  /*
   * この あとの ミーティングで **口に 出して 報告する** もんだい。
   * けっかの 画面で しるしを 付け、その ぶんだけ 絞って 見られるように する
   *（2026-08-25 の 指定「そちらのページを 見ながら ヘンディさんに 報告したい」）。
   * 省いてよい——付けなければ しるしは 出ない。
   */
  report: z.boolean().optional(),
  /*
   * ------------------------------------------------------------------
   * ここから下の 4つは **配布資料（会社研究の 調査シート）の 見やすさを
   * 教材の 画面でも 出す ため**に 足した（2026-08-27 の 指定）。
   * どれも 省ける——書かなければ これまでと 同じ 見た目で 出る。
   * ------------------------------------------------------------------
   */
  /**
   * 章（MISSION）の 名前。
   *
   * 同じ 文字が つづく あいだを 1つの まとまりと して、全問1ページの ときに
   * **章の 見出しを 1回だけ** 出す。25問が 見出しなしで 並ぶと、
   * いま どの 話を 調べて いるのかが 画面から 消える。
   *
   * 「章」を 別の 配列に しないのは、問いを 1つ 足した 日に **章と 問いの
   * 対応が 1つずつ ずれる**のを 防ぐため（`optionImages` を 並びの 配列に した
   * のと 同じ 判断）。問いが 自分の 章を 持って いれば ずれようが ない。
   */
  section: plainText.optional(),
  /** 章の 下の ひとこと（「『会社の しょうかい』を 見る」）。 */
  sectionNote: plainText.optional(),
  /**
   * どこを 見れば 分かるか（🔎 の 札）。
   *
   * これまでは 設問文の 中に 改行で「＊会社の しょうかいの ページ」と 書いて いた。
   * 文の 一部なので **読み上げにも 混ざり**、どこからが 問いなのかが 分かりにくい。
   */
  source: plainText.optional(),
  /**
   * 押すと 開く ヒント。**答えそのものは 書かない**（調べる 練習が 消える）。
   * 産出（`free`）の 問いでは「考える ヒント」として 使う。
   */
  hints: z.array(z.object({ title: plainText, text: plainText })).min(1).optional(),
  /**
   * 設問の **場面の 絵**（省略できる）。設問文の 上に 出る。
   *
   * 字だけの 設問は、N4の 学習者には **読むだけで 力を 使い切る**。
   * とくに「いま 話しかけて よいか」を 聞く 問いは、**先輩の 机の まわりが
   * どう なって いるか**が 答えの もと なので、それを 字で 書き並べると
   * 測って いるのが 場面の 読みでは なく **長い 日本語を 読む 速さ**に なる。
   * 絵に すれば 見た 瞬間に 場面が 入り、考える ところに 力が 残る。
   *
   * `optionImages`（選択肢ごとの 絵）とは 別もの。あちらは **えらぶ もの**の 絵で、
   * こちらは **問いが 起きて いる 場面**の 絵——1問に 1枚 しか 無い。
   *
   * 絵が まだ 無い あいだ（`status: "empty"`）は 画面に 点線の わくが 出る。
   * 空けて おくと **作り忘れが 画面から 見えなく なる**（記事の 絵と 同じ 決めごと）。
   */
  image: imageSlotSchema.optional(),
};

/** 4択（読解確認）。 */
const chooseSchema = z
  .object({
    ...quizCommon,
    type: z.literal("choose"),
    options: z.array(plainText).min(2).max(6),
    /** options のインデックス。 */
    answer: z.number().int().min(0),
    /**
     * 選択肢ごとの 絵（省略できる）。`options` と **同じ 並び・同じ 数**で 書く。
     *
     * 字だけの 選択肢は、N4の 学習者には **読むだけで 力を 使い切る**。
     * スライドで 絵つきで 見せた 問いを、テストでは 字だけで 聞くと、
     * 分かって いても 選べない——測っているのが 理解ではなく 読む速さに なる。
     *
     * 並びの 配列に したのは、`options` の 形（ただの 文字列）を 変えないため。
     * 選択肢を オブジェクトに すると、いま ある 教材ぜんぶの 書き直しに なる。
     */
    optionImages: z.array(z.string().min(1)).optional(),
  })
  .superRefine((question, ctx) => {
    // 数が ずれた ままでも 画面は 出るが、**絵と 文が 1つずつ ずれる**——
    // いちばん 気づきにくい 壊れ方なので、ここで 止める。
    if (question.optionImages && question.optionImages.length !== question.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["optionImages"],
        message: `選択肢は ${question.options.length}つ ですが、絵は ${question.optionImages.length}枚です（同じ数で 書く）`,
      });
    }
  });

/** 複数選択。「ぜんぶ えらぶ」。 */
const multiSchema = z.object({
  ...quizCommon,
  type: z.literal("multi"),
  options: z.array(plainText).min(3).max(8),
  answers: z.array(z.number().int().min(0)).min(2),
  /**
   * **並んで いる もの ぜんぶが 正解**だと 分かって いて、そう したい とき。
   *
   * ふだんは 弾く（下の 検査）。えらぶ ものが 無い 問いは、読まずに ぜんぶ 押せば
   * 満点に なる ので、ほとんどの ばあい 作りかけの まちがいで ある。
   *
   * ただし **配布資料が「この 4つが いい ところです」と 並べて いる**ような、
   * 読んで たしかめる ための 問いは ある（2026-08-27・28 の 指定
   *「正解は以下全てを選択するように（複数選択と明示）」「選択肢は4つでいいです。5つもいらない」）。
   * まぎらわしい 5つ目を こちらで 足すのは **配布資料の 改変**に なるので、
   * 足すのでは なく、ここに **書いた ときだけ** 通す。
   * 書き忘れでは 通らない ので、うっかり 全部正解に なる ことは 防げる。
   */
  allCorrect: z.literal(true).optional(),
});

/** 自由入力。表記ゆれは normalize.ts が吸収するので accept は別解だけを書く。 */
const keywordSchema = z.object({
  ...quizCommon,
  type: z.literal("keyword"),
  answer: plainText,
  /** 意味として同じ別解（表記ゆれは列挙しない）。 */
  accept: z.array(plainText).default([]),
  /**
   * 入力欄の うすい 字（2026-08-27 の 指定「placeholder を 参考の HTMLの とおりに。
   * 管理画面でも 編集できるように」）。
   *
   * **答えを 書かない。** 書く 形の 見本（「例：株式会社○○」「名前」）だけに する——
   * ここに 答えを 置くと、読まずに 写すだけの 問いに なる。
   */
  placeholder: plainText.optional(),
});

/**
 * いくつかを **順不同で** 入力する（「5つの サービスを 書いて ください」）。
 *
 * ## なぜ 語群（wordbank）では 足りないか
 * 語群は **並んだ ふだから えらぶ**ので、サイトを 見なくても 消去法で 当たる。
 * 配布資料の 調査シートは 5つの 空欄に **自分で 打たせて** いた——
 * 名前を 思い出して 打つ ことまでが この 問いの ねらいで ある
 *（2026-08-27 の 指定「5つのサービス：入力問題にして（順不同をOKとする）」）。
 *
 * ## 採点
 * 欄と 答えを 1対1で 見ない。**どの 欄に 書いても よい**——
 * `groups` の うち いくつ 当たったかを 数え、ぜんぶ 当たれば 正解に する。
 * 部分点は `earned` に 出す（配布資料の `multiResult` と 同じ 数え方）。
 */
const listSchema = z.object({
  ...quizCommon,
  type: z.literal("list"),
  /**
   * 答えの まとまり。1つの まとまりに つき 1つ 当たれば よい
   *（表記ゆれは `normalize.ts` が 吸収するので、意味の ちがう 別名だけを 書く）。
   */
  groups: z
    .array(
      z.object({
        /** けっかに 出す 代表の 書き方。 */
        label: plainText,
        /** 同じ ものと 見なす 別の 書き方。 */
        accept: z.array(plainText).default([]),
      }),
    )
    .min(2)
    .max(8),
  /** 欄ごとの うすい 字（省くと 番号が 出る）。`groups` と 同じ 数だけ 書く。 */
  placeholders: z.array(plainText).optional(),
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
  /*
   * 順番を 見ない（＝**そろって いれば 合格**）。
   * 「5つの サービスを えらぶ」の ような、並びに 意味の 無い 問いのため
   *（2026-08-25 の 指定「順番なしで5つ選択する問題にして」）。
   * 省くと これまでどおり 出た 順に くらべる。
   */
  unordered: z.boolean().optional(),
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

/**
 * 自由記述。**正解が 無い**問い。
 *
 * 「なぜ おもしろいと 思いましたか」「もし ここで はたらいたら 何が できそうですか」
 * のような、学習者の 考えを 書かせる 問い。`keyword` で 書かせると
 * **その 学習者だけの 正しい こたえが「ちがいます」に なる**——規律1（不正解と
 * 言わない）を、いちばん 大事な ところで 破る ことに なる。
 *
 * 書いて あれば 点が 入る。採点するのは 中身では なく「書いた こと」。
 * 中身は 先生が 読む（産出は 人が 見る、が この 教材の 建てつけ）。
 */
const freeSchema = z.object({
  ...quizCommon,
  type: z.literal("free"),
  /** 書きだしの ヒント（空でも よい）。入力欄の うすい 字に なる。 */
  placeholder: plainText.optional(),
  /** 点が 入る 最低の 字数。短すぎる 返事で 先へ 進むのを 防ぐ。 */
  minLength: z.number().int().min(1).max(200).default(2),
  /**
   * 日本語の 型文（入力欄の 下に 出す 足場）。`placeholder` は 打ち始めると
   * 消えるので、**打ちながら 見られる 型文**を 別に 置く。
   */
  starter: plainText.optional(),
  /**
   * 先に 英語で 下書きする 欄（要る 教材だけ）。
   *
   * 「日本語で 考えられる 人は さいしょから 日本語で 書いて OK」という
   * 配布資料の 建てつけを そのまま 持ち込む もの。**採点は 日本語の 欄だけ**で、
   * 英語は 書いても 書かなくても 点に 関わらない——英語で 考える 段を
   * 点に すると、日本語で 直に 書ける 人が 損を する。
   *
   * 中の 文が 英語なので `plainText`（日本語の 検査）には かけない。
   */
  english: z
    .object({
      placeholder: z.string().min(1).optional(),
      /** 書き出しの 型（「I like ... because ...」）。 */
      starter: z.string().min(1).optional(),
    })
    .optional(),
});

export const quizQuestionSchema = z.discriminatedUnion("type", [
  chooseSchema,
  multiSchema,
  keywordSchema,
  listSchema,
  wordbankSchema,
  emotionSchema,
  freeSchema,
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
    /**
     * こたえの 出しかた。**決めるのは 先生（管理画面）**で、学習者は 選べない。
     *
     * - `"submit"`（**既定**）… 1問ずつ 見て、ぜんぶ 書いてから まとめて 出す。
     *   途中では 正誤を 見せず、「こたえを 見る」も 置かない。採点は 出した あとの 1回だけ。
     * - `"one"` … 1問 こたえるたびに こたえと せつめいを 読む。
     * - `"all"` … **ぜんぶ 1ページに 出す**。採点は `submit` と 同じで、出した あとの 1回だけ。
     *
     * 学習者に 選ばせない のは、同じ 教材を 同じ 条件で 受けさせたい 先生の 都合が
     * 先に 立つため（2026-08-19 指定「まとめて出すかをきめるのは管理画面。
     * デフォルトは全てまとめて出す」）。
     *
     * ## なぜ `"all"` を 別の 軸に しないか
     * 「見せかた」と「採点の タイミング」を 2つの 軸に 分けると、`all` × 1問ずつ採点 という
     * **成り立たない 組み合わせ**が 型の 上に 残る（全問 見えて いるのに 1問ごとに 答えを
     * 見せたら、下の 問題の 答えが 先に 割れる）。全問 1ページなら 出すのは 必然的に 1回
     * なので、値を 1つ 足すのが 正しい（2026-08-23 の 指定）。
     *
     * ## 足すときの 注意（下書きが 消える 事故）
     * この 列挙を 広げたら、**同じ変更の 中で `src/lib/quiz/resume.ts` の 保存スキーマも
     * 広げる**。あちらが 知らない 値を 読むと `safeParse` が 落ち、`readQuizResume` が
     * null を 返して、**学習者が 書いた ものが 黙って 全部 消える**。
     */
    answerMode: z.enum(["one", "submit", "all"]).default("submit"),
    passRate: z.number().int().min(1).max(100).default(70),
    /**
     * **ぜんぶ うめるまで こたえを 出せなく する**（2026-08-27 の 指定
     * 「ちゃんと全ての項目を埋めない限り見られないようにしてください」）。
     *
     * 既定は `false`——これまでの 教材は「分からない もんだいで 足止めしない」
     * ほうの 決めごとで 作って あり、いっせいに 変えると **書けない 1問で
     * 教材が 終われなく なる**（関門が 開かない）。だから 教材ごとに 先生が 決める。
     *
     * `true` に してよい 教材は 2つ。
     *  - **調べれば 必ず 答えが 見つかる** もの（調査シートは 学習用サイトに 全部 ある）
     *  - **書けば 通る** もの（自由記述だけの 教材。中身は 採点しない）
     *
     * 危ないのは その 中間——正解の ある 選択式・キーワードで、サイトのどこにも
     * 書いて いない ことを 聞いて いる 教材。そこで これを 立てると、
     * 見つけようの 無い 1問が 出口を ふさぐ。
     */
    requireAll: z.boolean().default(false),
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
        if (q.answers.length >= q.options.length && q.allCorrect !== true) {
          ctx.addIssue({
            code: "custom",
            path: at("answers"),
            message:
              "すべてが正解の複数選択は問題にならない（そう作りたいときだけ allCorrect: true と書く）",
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
    /**
     * 動画ファイル（2026-08-29 の指定「リスニングも動画の場合も対応できるように」）。
     *
     * ## 音と 同じ 道に 載せる
     * 聞き取りチェックも 原稿の ひらきも 速さの ボタンも **そのまま 効く**。
     * `<audio>` と `<video>` は どちらも `HTMLMediaElement` なので、
     * 画面が 出す 札を 変えるだけで よい（`playbackRate` も `preservesPitch` も 同じ）。
     *
     * ## 音と 両方は 置けない（下の 検査）
     * どちらを 鳴らすかが データから 読めなく なる。片方が 黙って 無視される のは
     * 先生から いちばん 見えない 壊れ方なので、保存の 時点で 止める。
     */
    videoUrl: z.string().optional(),
    /**
     * YouTube で 聞かせる ばあい（2026-08-29 の 指定）。ID でも URL でも よい。
     *
     * **速さの ボタンは 出ない。** YouTube の プレイヤーは 別の 会社の 枠の 中に
     * あって、こちらから `playbackRate` を 触れない。押しても 何も 起きない ボタンを
     * 置くと「効かない 画面」に なる（docs/constraints.md「いま 触っても 意味の 無い
     * ものは 押せない形に する」）ので、**YouTube の ときは 出さず**、
     * 速さは 動画の 中の ⚙ で 変えて もらう。
     */
    youtube: z.string().optional(),
    /**
     * 動画を 読みこむ 前に 出す 絵（`videoUrl` / `youtube` の ときだけ 効く）。
     * 省くと 黒い 面に 再生ボタンが 出る。回線の 細い 教室では 無い ほうが 軽い。
     */
    posterUrl: z.string().optional(),
    /**
     * 聞く 前に 1枚だけ 出す 表紙の 絵（2026-09-04 の 指定）。
     *
     * ## なぜ 1枚だけか
     * 場面が まったく 見えないまま 音だけ 聞くのは、N4の 学習者には 重い——
     * 「だれが 何の 話を して いるのか」を 先に 渡すと、聞く 前に 視点が 立つ（P6）。
     * ただし **答えを 見せない**。この 教材の 問いは「どこで 働くか／何を 作るか」
     * なので、絵で そこまで 描くと **聞かずに 答えられて しまう**。
     * 描いて よいのは **それぞれの タイプの 雰囲気まで**（同日の 指定）。
     *
     * 動画の `posterUrl` とは 別。あちらは 再生前の 面で、こちらは 画面の 上に
     * ずっと 出る 1枚。
     */
    cover: imageSlotSchema.optional(),
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
    /*
     * 鳴らす ものは **1つだけ**。2つ 置くと どちらが 鳴るかが データから 読めず、
     * 片方が 黙って 無視される——先生から いちばん 見えない 壊れ方なので ここで 止める。
     */
    const sources = [listening.audioUrl, listening.videoUrl, listening.youtube].filter(
      Boolean,
    ).length;
    if (sources > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["videoUrl"],
        message:
          "音・動画・YouTube は どれか 1つだけ — どれを 鳴らすかが 決まらない（ほかを 消す）",
      });
    }

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
  "link",
  "skit",
  "quest",
] as const;

const contentRefTypeSchema = z.enum(CONTENT_REF_TYPES);

/** ステージ内の1コンテンツ参照。contents[] の並びが学習順（順序の正はステージ側）。 */
export const stageContentRefSchema = z.object({
  ref: z.string().min(1),
  type: contentRefTypeSchema,
  /**
   * その1本だけ 関門にするか（省略＝種別の 既定。src/lib/content-kinds.ts の `gates`）。
   *
   * 種別ごとの 既定だけでは、**同じ種別の 中で 役割が 違う教材**を 置けない。
   * 「はじめに」の かくにんテストが その例で、授業の 流れは
   * 「スライド → すぐ テスト」だから 並びは スライドの 直後で なければ ならない。
   * ところが もんだい（quizset）の 既定は 関門なので、そこに 置くと
   * **その先の ページ2本が 合格するまで 🔒 に 戻る**——すでに 読み終えた
   * 学習者の 画面から、読めていた ものが 消える。
   *
   * かといって 既定そのものを false にすると、朝会・会社見学の もんだいまで
   * 飛ばせるようになる（あちらは 関門で いてほしい）。だから **1本だけ**外す。
   *
   * 省略を「既定に したがう」と 読むのは わざと。ここに 何も 書かない教材が
   * 大多数で、書いた ときだけ「これは 特別」と 目に 入るほうが 事故が 少ない。
   */
  gates: z.boolean().optional(),
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
  "link",
  "listening",
  "login",
  "manga",
  "map",
  "nexmax",
  "quest",
  "quiz",
  "skit",
  "slides",
  "studio",
  "talk",
  "tutorial",
  "welcome",
  "wordtest",
] as const;


/* ------------------------------------------------------------------ *
 * クエスト（チームで 遊ぶ 選択の ゲーム）
 *
 * 旧アプリの `waterfall_quest.html`（3145行の 1枚もの）を データと エンジンに
 * 分けた もの。**遊び方・得点式は 原典どおり**で、変えたのは 持ち方だけ——
 * ことばアーケードを reducer に 切り出した ときと 同じ 判断。
 *
 * ## なぜ リンク教材（`public/tools/...`）に しないか
 * リンク教材は iframe の 中なので、**アプリの React も Supabase の 客も 共有しない**。
 * この ゲームは 4人の 名簿を 引き、セーブを 4人で 共有して DB に 置く ので、
 * 中で 何が 起きたかが 見えない 作りだと 成り立たない。
 * ------------------------------------------------------------------ */

/** クエストの 1手（4つの えらびかたの うちの 1つ）。 */
const questOptionSchema = z.object({
  text: plainText,
  /**
   * 手の 質。**原典の 3段**を そのまま 持つ。
   * `critical` … いちばん 良い 手（リスクが 減る）／`hit` … 良い 手／`miss` … その場は 楽な 手
   */
  type: z.enum(["critical", "hit", "miss"]),
  /** 隠れリスクの 増減。critical は -1、hit は 0、miss は +3〜+5。 */
  risk: z.number().int(),
  /** その手を 出した 人の 体力の 減り。 */
  hpCost: z.number().int().min(0),
  /** お金の 増減（0 か 負の 数）。 */
  moneyCost: z.number().int().max(0),
  /** えらんだ あとに 読ませる 説明。**正誤に かかわらず 読ませる**（設計01 P8）。 */
  explanation: plainText,
  /** えらんだ 直後の ひとこと。 */
  resultText: plainText,
});

/** クエストの 1場面。 */
const questPhaseSchema = z.object({
  id: z.number().int().min(1),
  /** 章の 名前（社内ミーティング・要件定義 など）。 */
  chapter: plainText,
  name: plainText,
  desc: plainText,
  enemy: z.object({
    name: plainText,
    /** 相手の 絵（`src/components/quest/` が 持つ 3人）。 */
    art: z.enum(["angel", "yamada", "engineer"]),
  }),
  /** 場面の 前に 流れる 会話。`hero` は **えらんだ 4人に 順番で 割り当てる**。 */
  dialogue: z
    .array(
      z.object({
        speaker: z.enum(["hero", "god", "yamada", "engineer", "system"]),
        text: plainText,
      }),
    )
    .default([]),
  question: plainText,
  /** 4つ。critical 1・hit 1・miss 2（下の 検査で 守る）。 */
  options: z.array(questOptionSchema).length(4),
});

export const questSchema = z
  .object({
    kind: z.literal("quest"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    description: plainText,
    focus: plainText,
    /** はじめの お金（人数に よらない ぶん）。 */
    budgetBase: z.number().int().positive().default(2000),
    /** 1人 増えるごとに 足す お金。 */
    budgetPerMember: z.number().int().min(0).default(500),
    /** 1手ごとに 減る お金（1人あたり）。 */
    turnCostPerMember: z.number().int().min(0).default(5),
    startHp: z.number().int().positive().default(100),
    phases: z.array(questPhaseSchema).min(1),
    furigana: z.array(furiganaEntrySchema).optional(),
  })
  .superRefine((quest, ctx) => {
    quest.phases.forEach((phase, i) => {
      /*
       * **1場面に critical 1つと hit 1つ**。原典は「その 2つを 見つけたら 場面クリア」
       * という 進み方なので、どちらかが 欠けると **その 場面から 永久に 出られない**。
       * 画面では 気づけない ので 保存の 時点で 止める。
       */
      const count = (type: string) => phase.options.filter((o) => o.type === type).length;
      if (count("critical") !== 1 || count("hit") !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["phases", i, "options"],
          message: `場面 ${phase.id}: いちばん 良い 手と 良い 手を 1つずつ 置く（いまは critical ${count("critical")} / hit ${count("hit")}）`,
        });
      }
    });
  });

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
  /**
   * 見出しと 説明の 読み辞書（最長一致）。
   *
   * 説明文は **漢字＋ふりがな**で書く（規律2・constraints「ひらがなに開かない」）。
   * ひらがなに開いた 説明文は、読めても 意味が 取れない——2026-08-18 に
   * マップの カードで 実際に そうなっていた。ルビは 画面が この辞書から 合成する
   *（`RubyText`。ルビHTMLは 手書きしない）。
   */
  furigana: z.array(furiganaEntrySchema).optional(),
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
    /** 復習に出す語彙（正への 参照）。`vocab` の 代わりに こちらを 使う。 */
    vocabIds: z.array(z.string().min(1)).optional(),
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
  imageSlotSchema.extend({
    kind: z.literal("image"),
    caption: plainText.optional(),
    /**
     * 絵の 大きさ（省ける。省くと これまでどおり）。
     *
     * - 省略 … 本文の 幅より 少し しぼる。**絵が「見出し」に 見えない**ため の 既定
     * - `"wide"` … 本文の 幅いっぱい。**説明の 図**（中に 字が ある もの）はこちら
     *
     * ## なぜ 一律に 大きく しないのか
     * 2026-08-30 の 指定「説明用の画像が小さすぎて…ちゃんとわかるようにしてください」
     *「**他の要素では小さくないといけない場合もあるので、この時は大きくするような設定に
     * してください**」。てじゅんの サムネイルは 小さい ことに 意味が あり（並びを 目で 追う）、
     * 場面の さし絵は 大きすぎると 本文と 切れる。**大きく したい 絵にだけ 付ける**。
     */
    size: z.enum(["normal", "wide"]).optional(),
  }),
  /**
   * 動画（2026-08-29 の指定「動画ブロック追加お願いします」）。
   *
   * ## なぜ 絵の スロットに 相乗りさせないか
   * `imageSlotSchema` は **生成のための 型**で、`prompt` と `refs`（参照画像）と
   * `status: "generating"` を 持つ。動画は こちらが 差し替える もので、
   * AIに 作らせる 道が 無い——空の 欄を 3つ 抱えた 型に なる。
   *
   * ## 中の ことばは 覆えない
   * 動画の 中の 音と 字には ふりがなを 振れない（PDFの スライドと 同じ立場）。
   * だから `note` を 持つ。**その 動画で 何を 見るか**を 先生の ことばで 添えると、
   * 聞き取れなかった 学習者にも つかむ ものが 1つ 残る（`slidesSchema.notes` と 同じ 受け皿）。
   */
  z
    .object({
    kind: z.literal("video"),
    /** 動画の 場所（`/video/...`）。YouTube の ときは 空に する。 */
    src: z.string().min(1).optional(),
    /**
     * YouTube（2026-08-29 の 指定「ファイルの場合と youtube の場合と」）。
     *
     * 先生が **見て いる ページの URL を そのまま 貼れる**ように、ID でも
     * `watch?v=` でも `youtu.be` でも 受ける（読み取りは `src/lib/video.ts`）。
     * 保存されるのは 貼った ものそのままで、ID への 直しは 出す ときに 1回 する
     *——直して 保存すると、先生が あとで 見た ときに **自分が 貼った ものと
     * ちがう 字**が 入って いて、直して よいのか 分からなく なる。
     */
    youtube: z.string().min(1).optional(),
    /**
     * 読みこむ 前に 出す 絵。**省ける**——無ければ 黒い 面に 再生ボタンが 出る。
     *
     * 置くと 1枚ぶん 先に 落ちる ので、**回線の 細い 教室では 無い ほうが 軽い**。
     * 「何の 動画か」は 下の `note` が ことばで 言う。
     */
    poster: z.string().min(1).optional(),
    /** 読み上げ用（画面には 出さない — 絵の `caption` と 同じ 扱い）。 */
    caption: plainText.optional(),
    /** その 動画で 見るところ。学習者が 読む 文。 */
    note: plainText.optional(),
    })
    .superRefine((block, ctx) => {
      /*
       * **どちらか 1つ**。両方 空だと 黒い 枠だけが 出て、両方 あると どちらを
       * 出すかが データから 読めない——どちらも 先生の 画面からは 見えない 壊れ方。
       */
      const sources = [block.src, block.youtube].filter(Boolean).length;
      if (sources !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["src"],
          message:
            sources === 0
              ? "動画の 場所が 空です — ファイルの ばしょ か YouTube の どちらかを 書く"
              : "ファイルと YouTube の 両方は 置けない — どちらか 1つに する",
        });
      }
    }),
  z.object({ kind: z.literal("callout"), tone: z.enum(["point", "care"]), text: plainText }),
  z.object({ kind: z.literal("list"), items: z.array(plainText).min(1) }),
  /*
   * てじゅん。**1歩ごとに 小さな 絵を 置ける**（`images[i]` が `items[i]` に 対応）。
   * 大きな 絵を 1枚 置くと「どの 歩の 絵か」が 分からず、絵が 説明を 助けない
   *（2026-08-25 の 指定）。省いてよい——絵の 無い てじゅんは これまで どおり 出る。
   */
  z.object({
    kind: z.literal("steps"),
    items: z.array(plainText).min(1),
    images: z.array(imageSlotSchema).optional(),
  }),
  /*
   * ことばの ブロック。**これからは `wordIds`（正への 参照）で 書く**。
   * `items` は 語を 直に 持って いた ころの かたちで、まだ 残って いる 記事の ため。
   */
  z
    .object({
      kind: z.literal("vocab"),
      wordIds: z.array(z.string().min(1)).min(1).optional(),
      items: z.array(vocabItemSchema).min(1).optional(),
    })
    .refine((block) => Boolean(block.wordIds ?? block.items), {
      message: "ことばが 無い — wordIds（正への 参照）を 書く",
      path: ["wordIds"],
    }),
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
  /*
   * ------------------------------------------------------------------
   * ここから下は **配布資料（会社研究の HTML 4枚）を 教材に 移すために 足した 5つ**
   *（2026-08-27 の 指定「今後コンポーネントとして使えるように」）。
   *
   * どれも **1つの 教材のための 部品では ない**。HTML の 見た目を そのまま
   * 持ち込むと `hero-kaisha` のような 使い回せない ブロックに なるので、
   * 「表紙」「カードの 並び」「調べる ことの 一覧」「前と 後」「帯」という
   * **見た目の 役目**で 切って ある。会社研究に しか 出て こない 語は
   * どれの 名前にも 入れて いない。
   * ------------------------------------------------------------------
   */
  /**
   * 表紙（hero）。ページの いちばん 上に 1つ 置く。
   *
   * これまでは `heading` ＋ `paragraph` ＋ `image` の 3つで 代用して いたが、
   * **開いた 瞬間に「何の ページか」が 分からない**（見出しと 絵が 別々の 段に
   * 並ぶだけ）。配布資料が どれも 表紙から 始まって いたのは そのためで、
   * ここだけは 専用の 形を 持たせる。
   */
  z.object({
    kind: z.literal("hero"),
    /** 上の 小さな 札（「🔎 STEP 1」など）。省ける。 */
    eyebrow: plainText.optional(),
    title: plainText,
    /** 太い リード文。 */
    lead: plainText.optional(),
    /** その下の ひとこと。 */
    note: plainText.optional(),
    /** 右に 置く 絵。**まだ 無くてよい**——`status: "empty"` なら 画面に
     *  「絵が 入ります」の わくが 出る（作る 場所が 見えるように する）。 */
    image: imageSlotSchema.optional(),
  }),
  /**
   * カードの 並び（cards）。
   *
   * `list`（かじょうがき）との ちがいは **1項目に 見出し・絵・小さな 一覧を
   * 持てる** こと。「なぜ 調べるの？」の 3枚、「今日 すること」の STEPカード、
   * 「これから 考える 5つのこと」——配布資料の 大半が この 形だった。
   */
  z.object({
    kind: z.literal("cards"),
    /**
     * 見た目。
     * - `plain` … 白い カード（既定）
     * - `dark`  … 紺の 帯の 中に 並べる（手順の 3つ など、流れを 見せたい とき）
     * - `step`  … 番号の 札つき（1歩ずつ 進む もの）
     */
    tone: z.enum(["plain", "dark", "step"]).default("plain"),
    /** 1行に 何枚 並べるか（画面が せまい ときは 自動で 減る）。 */
    columns: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
    items: z
      .array(
        z.object({
          /** 絵文字（🏢 など）。 */
          icon: plainText.optional(),
          /** 札（「STEP 1」など）。`tone: "step"` では 番号が 自動で 入る。 */
          label: plainText.optional(),
          title: plainText,
          text: plainText.optional(),
          /** カードの 中の 小さな かじょうがき。 */
          items: z.array(plainText).optional(),
          image: imageSlotSchema.optional(),
        }),
      )
      .min(1),
  }),
  /**
   * 調べる ことの 一覧（missions）。
   *
   * 1件が「番号・題・どこを 見るか・見つける ことの 一覧・ヒント」を 持つ。
   * `cards` と 分けて あるのは **ヒントが 押すと 開く** ためで、
   * 答えに 近い 文を いつも 見せると 調べる 練習に ならない。
   */
  z.object({
    kind: z.literal("missions"),
    items: z
      .array(
        z.object({
          /** 番号（「1」）。省くと 並び順の 番号が 入る。 */
          badge: plainText.optional(),
          title: plainText,
          /** どこを 見るか（「『会社の しょうかい』を 見る」）。 */
          where: plainText.optional(),
          /** 見つける ことの 一覧。 */
          points: z.array(plainText).min(1),
          /** 押すと 開く ヒント。**答えそのものは 書かない**。 */
          hint: plainText.optional(),
          /** 下に 出す ひとこと（ことばの 説明など）。 */
          note: plainText.optional(),
          /** 目立たせる（学習者に いちばん 近い もの）。 */
          focus: z.boolean().optional(),
          /**
           * 小さな 絵（省ける）。**カードの 中に 置く**ので、無くても 形は くずれない。
           * 「どこを 見るか」を 字だけで 7枚 並べると 目が すべる——1枚ごとに
           * 絵が あると、どの 話だったかを 絵で 思い出せる。
           */
          image: imageSlotSchema.optional(),
        }),
      )
      .min(1),
  }),
  /**
   * 前と 後の 対比（compare）。
   *
   * 「ヘンディさんに 話した こと」→「松井社長に 話す こと」のように、
   * **何が 変わるのか**を 2枚 並べて 見せる。文だけで「ちがいます」と 言うより、
   * 並べた ほうが 早い。
   */
  z.object({
    kind: z.literal("compare"),
    before: z.object({ title: plainText, lines: z.array(plainText).min(1) }),
    after: z.object({ title: plainText, lines: z.array(plainText).min(1) }),
  }),
  /**
   * 帯（banner）。ゴール・大切な こと・引用。
   *
   * `callout`（ポイント枠）は **1文の ための 枠**で、題も 札も 持てない。
   * 「この STEPの ゴール」のように **題＋文＋いくつかの 札**が 要る ところで使う。
   */
  z.object({
    kind: z.literal("banner"),
    /** `goal` … 目あて / `message` … 大切な こと / `quote` … 引用のように 見せる */
    tone: z.enum(["goal", "message", "quote"]).default("message"),
    icon: plainText.optional(),
    title: plainText.optional(),
    text: plainText,
    /** 下に 並べる 小さな 札。 */
    badges: z.array(plainText).optional(),
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

/* ------------------------------------------------------------------ *
 * リンク教材（外の1ページを そのまま 学習の1本にする）
 * ------------------------------------------------------------------ */

/**
 * 埋め込める行き先か。
 *
 * `http://` を弾くのは、アプリが https で動くから。混在した中身はブラウザが
 * 黙って落とすので、学習者の画面は**理由の出ない白い枠**になる。上げた時点で言う。
 */
const embeddableUrl = z
  .string()
  .min(1)
  .refine((url) => url.startsWith("/") || url.startsWith("https://"), {
    message:
      "行き先は `/` で はじまる アプリの中の 場所か、`https://` の URL にする（http:// は ブラウザが 埋め込みを 止めます）",
  });

/**
 * リンク教材 — 1枚で完結する練習ページを、ステージの ながれ の中に置く
 *
 * ## なぜ「開くだけ」の種別が要るか
 * ローマ字入力の練習のように、**キーボードと IME を相手にする教材**は、
 * まんが・よみもの・もんだいの どの型にも入らない。無理に article の中へ
 * 押し込むと、記事の本文の中に入力欄が生えることになり、学習者は
 * 「これは読むものか、打つものか」が分からなくなる。
 *
 * 中身は1枚のページ（`public/tools/...` に置いた自前の練習や、外のサイト）で、
 * アプリは**入れ物と行き先だけ**を持つ。教材を1本足すのに React の画面を
 * 増やさなくてよい——ステージの ながれ に 🔗 が1つ増えるだけになる。
 *
 * ## 既定は全画面（`view`）
 * 練習ページは**画面いっぱいで使う**ほうが手が動く。枠の中の小さな窓に
 * 入力欄が沈むと、キーボードを見ながら打つ学習者の視線が行ったり来たりする。
 * だから既定は全画面で、資料のように「並べて見せたい」ものだけ `inline` にする。
 *
 * ## 関門にしない（content-kinds.ts の `gates: false`）
 * 行き先の中で何が起きたかは、アプリからは見えない（外のサイトなら なおさら）。
 * 見えないものを通行の条件にすると、スライドのときと同じで**1本の教材で
 * ステージ全体が止まる**。「おわった」の記録は残すが、先へは進める。
 */
export const linkSchema = z.object({
  kind: z.literal("link"),
  id: z.string().regex(/^[a-z0-9_-]+$/),
  title: plainText,
  description: plainText,
  /** 行き先（アプリの中の `/tools/...` か、外の `https://...`）。 */
  url: embeddableUrl,
  /** 開いたときの見せ方。既定は全画面。 */
  view: z.enum(["fullscreen", "inline"]).default("fullscreen"),
  /** `inline` のときの高さ（px）。全画面のときは使わない。 */
  height: z.number().int().min(320).max(2000).default(720),
  /**
   * 埋め込まず、別のタブで開くか。
   *
   * 外のサイトには**埋め込みを断る設定**（X-Frame-Options / CSP frame-ancestors）が
   * あり、断られると学習者には白い枠しか見えない。そういう行き先は最初から
   * 別のタブにする。自前のページ（`/tools/...`）では false のままでよい。
   */
  newTab: z.boolean().default(false),
  /** 開く前に添える ひとこと（そこで何をするのか）。 */
  note: plainText.optional(),
  furigana: z.array(furiganaEntrySchema).optional(),
});

/* ------------------------------------------------------------------ *
 * スキット（お手本の 会話を 1行ずつ 聞いて、口に 出して まねる）
 * ------------------------------------------------------------------ */

/** スキットの 登場人物。**声**を 持つのは 人物カード側なので id で つなぐ。 */
const skitRoleSchema = z.object({
  /** `content/characters/<id>.json` の id か、その スキットだけの 名前。 */
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: plainText,
  /** 立場（「PM」「先輩」）。**敬語の 宛先**が 読めないと まねる 意味が 半分 消える。 */
  role: plainText,
  /** ふきだしの 色（リスニングの 参加者と 同じ 名前を 使う）。 */
  accent: z.enum(["sky", "leaf", "sun", "coral", "grape"]).default("sky"),
  /**
   * ふきだしを 左右 どちらに 寄せるか。
   *
   * 学習者が **自分で 言う ほうの 役**を `right` に する。旧アプリの スキットも
   * 左右で 分けて いて、色だけで 分けるより「どっちが 自分の セリフか」が 速く 分かる。
   */
  side: z.enum(["left", "right"]).default("left"),
});

/**
 * スキットの 1行。
 *
 * ## なぜ 行ごとに 音を 持つのか
 * まるごと 1本の 音声（リスニング教材）とは **ねらいが ちがう**。あちらは
 * 通して 聞いて 中身を つかむ 練習で、こちらは **1行を 何度も 聞いて まねる**
 * 練習である。通しの音では「その1行だけ」に 戻れないので、行ごとに 分けて 持つ。
 */
const skitLineSchema = z.object({
  /** `roles` の id、または "narration"（ト書き）。 */
  speaker: z.string().min(1),
  text: plainText,
  /**
   * その行の 音（`/audio/...`）。**空でも よい**——画面は そのとき
   * ブラウザの 読み上げで 鳴らす（旧アプリの スキットと 同じ 動き）ので、
   * 音を 作る 前でも スピーカーの ボタンは 使える。
   */
  audioUrl: z.string().optional(),
  /**
   * その行に 添える 絵（省ける）。**行の となり**に 置くので、
   * 「どの セリフの 場面か」が 迷わない。
   */
  image: imageSlotSchema.optional(),
  /** 言い方の ひとこと（「ここで 一度 止まる」）。学習者が 読む 文。 */
  note: plainText.optional(),
});

/**
 * スキット教材 — お手本の 会話を 1行ずつ 聞いて、口に 出して まねる
 *
 * ## なぜ リスニングと 別の 種別に するか
 * リスニング（`listeningSchema`）は **聞き取れたかを 測る** 教材で、台本は
 * 既定で 伏せて ある（`check.showScript` の 既定が false）。スキットは 逆で、
 * **台本を 見ながら 声に 出す**のが 目的だから、伏せる 仕組みが まるごと 邪魔に なる。
 * 同じ型に 押し込むと「台本を 見せる リスニング」という、名前と 中身の 食い違った
 * 教材が できる——先生は 一覧の どちらを 開けば 直せるのか 分からなくなる
 *（たいわ と ミーティングを 分けたのと 同じ 判断）。
 *
 * ## 絵は 行に つく
 * 場面の 絵を 1枚 上に 置く 持ち方も あるが、それだと 会話が 進んでも 絵は
 * そのままで、**どの セリフの 場面か**が 見えない。てじゅん（`steps`）に
 * 1歩ずつ 絵を 置いた のと 同じ 理由で、絵は 行に 持たせる。
 * 表紙の 1枚だけは 別に `cover` で 置ける。
 */
export const skitSchema = z
  .object({
    kind: z.literal("skit"),
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: plainText,
    description: plainText,
    /** 何に 気をつけて まねるか。読む 前に 渡す 視点（設計01 P6）。 */
    focus: plainText,
    /** 表紙の 絵（省ける）。 */
    cover: imageSlotSchema.optional(),
    roles: z.array(skitRoleSchema).min(1),
    lines: z.array(skitLineSchema).min(2),
    furigana: z.array(furiganaEntrySchema).optional(),
  })
  .superRefine((skit, ctx) => {
    const ids = skit.roles.map((r) => r.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["roles"], message: "roles の id が重複している" });
    }
    const known = new Set([...ids, "narration"]);
    skit.lines.forEach((line, i) => {
      if (!known.has(line.speaker)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "speaker"],
          message: `話者「${line.speaker}」が roles にない（narration は使える）`,
        });
      }
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
/**
 * 対話ゲームの「見る ところ」に えらべる 観点。
 *
 * いつも 見る もの（にほんご・かみ合い・ていねい）は ここに 入れない——
 * どの しつもんでも 同じ ように 見る ものなので、教材ごとに 書き分ける ものが
 * 無い（コードが 持つ: `src/lib/talkgame/affinity.ts` の `ALWAYS_POINTS`）。
 * ここに 並ぶのは **しつもんによって 要る／要らないが 変わる もの**だけ。
 */
export const talkFocusKeys = ["concrete", "reason", "feeling"] as const;
export type TalkFocusKey = (typeof talkFocusKeys)[number];

/**
 * 話す ばんの 出だしの しつもん 1本。
 *
 * 文字列で 書いても 読める（前からの 教材）。その ときの `focus` は
 * 既定の 2つ（会社の 中身・りゆう）に なる——前と 同じ 見え方に なる ように。
 */
const talkOpener = z.preprocess(
  (value) => (typeof value === "string" ? { ask: value } : value),
  z.object({
    /** 相手が 声に 出して 聞く 文。 */
    ask: plainText,
    /**
     * 準備の フォーム（quizset）の 設問ID。無ければ「じゅんびに 無い しつもん」と 出す。
     */
    from: z.string().min(1).optional(),
    /** この しつもんで とくに 見る ところ（1〜3つ）。 */
    focus: z
      .array(z.enum(talkFocusKeys))
      .min(1)
      .max(talkFocusKeys.length)
      .default(["concrete", "reason"]),
    /**
     * この しつもんの ヒント（答え方の 型文）。**文ごとに 1つ**。
     *
     * **しつもんごとに 持つ**（2026-09-01 の 指定「その時の問いにあったヒントを出して欲しい」）。
     * 前は `talkGame.talkHints` を **ぜんぶ まとめて** 出して いたので、
     * 3問目の 学習者にも 1問目・6問目の 型文が 並んで いた——読む ものが 増える だけで、
     * いま 要る 1本を 見つけるのは 学習者の しごとに なって いた。
     *
     * ## なぜ 1文ずつ 分けて 持つか（2026-09-02 の 指定）
     * 「私は ◯◯です。◯◯だからです。」と 1つの 文字列に して いた ころは、
     * **りゆうが おまけに 見えて いた**。画面で 1つの ふきだしに 入るので、
     * 前半だけ 言って 終わる 学習者が 出る。
     *
     *     「私は ◯◯を やって みたいです。」
     *     「なぜなら ◯◯だからです。」
     *
     * と **2つの ふきだし**に すると、言う ことが 2つ ある と ひと目で 分かる。
     * 「なぜなら」を 型に 入れて あるのは、りゆうが この しつもんの 見どころ（`focus`）だから。
     *
     * 無ければ `talkHints` の 同じ 番号に 落ちる（前からの 教材が そのまま 動く）。
     */
    hint: z.array(plainText).min(1).optional(),
    /**
     * その しつもんの **お手本**（画面には `(ex)` として 出す）。
     *
     * 型文（`hint`）が「言い方の かたち」なのに 対して、こちらは
     * **中身まで 入った 1つの 答え**。相手の 心が 動く のは どういう 答えかを 見せる
     *（2026-09-01 の 指定「松井社長の心を打ちそうな例を表示して欲しい」）。
     *
     * ## 写させる ためでは ない
     * だから **型文と 並べて 出す**。型文の ◯◯ は 空の まま 残して あるので、
     * お手本を 見た あとでも 自分の ことばを 入れる ところは 自分で 埋める ことに なる。
     *
     * ## **型文と 同じ 形で 書く**（2026-09-02 の 指定）
     * 型文が「私は ◯◯を やって みたいです。／なぜなら ◯◯だからです。」なら、
     * お手本も その 形で 書く。形が ちがうと、**どちらを まねれば よいのか 分からない**。
     */
    example: plainText.optional(),
  }),
);
export type TalkOpener = z.infer<typeof talkOpener>;

export const meetingSchema = z.object({
  kind: z.literal("meeting"),
  /**
   * どちらの **ばん**か（2026-08-23 の 指定「ヘンディさんからの 質問と
   * ヘンディさんへの 質問を 分ける」）。
   *
   * - `"ask"` … 相手が しつもんし、学習者が 答える
   * - `"listen"` … 学習者が しつもんし、相手が 答える（`discover` の 札を 開く）
   * - 欄が 無い … **前からの 教材**（1つの 中に 2つの ばんを 持って いた もの）
   *
   * ばんを 教材の 中の 概念から **ステージの 中の 並び**へ 出す ための 欄。
   * 増やしたければ 教材を 足す——ステージは 並びも 関門（ロック）も もう 持って いる。
   * 「無い＝前からの もの」に して あるのは、**移行の あいだ 両方 動かす**ため。
   */
  mode: z.enum(["ask", "listen"]).optional(),
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
  judgePrompt: plainText.optional(),
  /** 相手（画面のタイルに出る人）。characters の id と name を写す。 */
  host: participantSchema,
  /**
   * 質問。**並びが学習順**（閉じた質問 → 開いた質問）。
   *
   * 空に できるのは **聞く ばんの 教材**（`mode: "listen"`）だけ。
   * 下の `superRefine` が、それ以外では 3つ 以上と 見かたの 指示を 求める。
   */
  questions: z.array(meetingQuestionSchema).default([]),
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
  /**
   * 対話ゲーム（好感度 100% を 目ざす 会話・願い #177）。
   *
   * この 欄が あると、教材は **ミーティングとは 別の 画面**（`TalkGameSession`）で 開く。
   * ヘンディさんの「話す ばん／聞く ばん」（`mode`）とは 別物に する、という
   * 2026-08-23 の 指定に よる——同じ 部品に 相乗りさせると、片方を 直すたびに
   * もう片方が 黙って 動く。
   *
   * ## なぜ ハート（`affection`）と 別に するか
   * ハートは **決まった 数の しつもん**に 1回ずつ 答えて たまる（上限 12）。
   * こちらは **100% に なるまで 会話が つづく**——たまり方が ちがうので、
   * 同じ 欄に 押し込むと「12個の ハート」と「100%」の どちらが 正なのかが
   * データから 読めなく なる。
   *
   * ## しつもんは データに 全部 書かない
   * 出だしだけ データが 持ち、**深掘りは その場で AI が 作る**。
   * 学習者が 何を おもしろいと 言うかは 先に 書けないので、書けるのは
   * 「どこから 始めるか」と「どこで 終わるか」だけ。
   */
  talkGame: z
    .object({
      /** 満タン（%）。ここに 届くと クリア。 */
      goal: z.number().int().min(50).max(100).default(100),
      /**
       * 「聞く ばん」が 開く ところ（%）。**2つの 役**を 持つ。
       *
       * - ここに とどいたら 聞く ばんへ 移る
       *   （2026-08-24 の 指定「一定数の 好感度を 得たら、そこから 逆に 学生が 質問する」）
       * - 深掘りの 上限で 移る ときの **底上げ先**。上手で なくても
       *   話しきれば ここに 立てる（設計01 P8）
       *
       * **ばんが 変わる 引き金は これ 1つ**（2026-08-31 に「おもしろいメーター」を
       * 廃止した）。前は「おもしろい を n個 見つけたら」も 引き金だった が、
       * その 札は AIが 漢字まじりの ラベルを 返すと 立たない ので、**鍵の ある 教室では
       * ほとんど 数えられて いなかった**——見えない ところで 進み方が 変わって いた。
       */
      openAt: z.number().int().min(10).max(95).default(60),
      /** 相手の 第一声（画面に 出る）。 */
      opening: plainText,
      /**
       * 話す ばんの 出だしの しつもん（順に 出す）。
       *
       * ## しつもんごとに「見る ところ」を 持つ（2026-08-31 の 指定）
       * ぜんぶの しつもんを 同じ 観点で 見て いた ころ、「あなたの いい ところは
       * 何ですか」にも **会社の 中身が 入って いるか（concrete）が +3%** で
       * かかって いた——**その しつもんが 聞いて いない ことで 点が 動く**ので、
       * 学習者からは 採点の ものさしが 見えない
       *（2026-08-31「採点基準が不明確で嬉しい気持ちにならない」）。
       *
       * `focus` に 書いた ものだけが、その しつもんの 山場に なる。
       * いつも 見る もの（にほんご・かみ合い・ていねい）は コードが 持つ
       *（`src/lib/talkgame/affinity.ts`）ので ここには 書かない。
       *
       * ## `from` は 準備フォームとの 対応
       * この しつもんが、準備の フォーム（quizset）の どの 設問で 書いた ことかを 指す。
       * 画面が「じゅんびの ◯ で 書きましたね」と 出せる ように する ため。
       * **対応の 無い しつもんを 相手に 言わせない**——準備して 来た ことと
       * 聞かれる ことが ずれると、学習者は 何を 話せば よいのか 分からなく なる
       *（2026-08-31「質問の内容が事前にまとめた内容と一致していない箇所があります」）。
       *
       * 前からの 教材（ただの 文字列の 並び）も そのまま 読める。
       */
      openers: z.array(talkOpener).min(1),
      /** 深掘りの 予備。AIの しつもんが 取れなかった ときに 画面が 出す。 */
      probes: z.array(plainText).default([]),
      /** 話す ばんの 型文（答え方の 足場）。 */
      talkHints: z.array(plainText).default([]),
      /**
       * 聞く ばんへ 移る ときの ことば。
       * **疑問形に しない**（相手に しつもんさせない・2026-08-21 の 決まり）。
       */
      listenInvite: plainText,
      /** 聞く ばんの 型文（聞き方の 足場）。 */
      listenHints: z.array(plainText).default([]),
      /**
       * 聞く ばんの お手本（`(ex)`）。
       *
       * 聞く ばんには「その ときの 問い」が 無い（しつもんするのは 学習者）ので、
       * 型文は これまでどおり ぜんぶ 出す。お手本だけ 1つ 添える。
       */
      listenExample: plainText.optional(),
      /** 満タンで 相手が 話す「とっておきの 話」（報酬は 物語 — 設計01 P2×P7）。 */
      reward: plainText,
      /**
       * 作り置きの 音（セリフの 鍵 → `/audio/...` の URL）。2026-08-31 の 指定
       *「松井社長の 用意された セリフは 全て 音声化して ください」。
       *
       * 鍵は `opening` / `opener-<n>` / `probe-<n>` / `listenInvite` / `reward`。
       * 作るのは `scripts/make_meeting_audio.ts`（鍵が 要るので ふだんは Actions で 回す）。
       *
       * ## なぜ 欄ごとの `audioUrl` に しないか
       * ミーティングの しつもんは 1つずつ オブジェクトなので `audioUrl` を 生やせる。
       * こちらは `probes` が **ただの 文字列の 並び**で、`opening` / `listenInvite` /
       * `reward` も 1つずつ 別の 欄——欄ごとに 足すと 5種類 増える うえ、`probes` は
       * 形ごと 変える ことに なる。**鍵 → URL の 対応表 1枚**で 足りる。
       *
       * ## 作り置きに できない ものが ある
       * その場で AIが 作る 深掘りの しつもんと 返事は 毎回 ちがう ので、ここには 入らない。
       * そこは これまでどおり Live の 声が 読む（鍵の 無い 学習者には 字だけ 出る）。
       */
      audio: z.record(z.string(), z.string()).default({}),
      /** 画面の 背景（`/img/...`）。 */
      background: z.string().min(1),
      /** 相手の 立ち絵。気もちで 差しかえる。 */
      figures: z.object({
        neutral: z.string().min(1),
        smile: z.string().min(1),
        think: z.string().min(1),
      }),
    })
    .optional(),
  /**
   * ぜんぶ 答えた あとに「聞き出す」もの（願い #94）。
   *
   * しつもんが 終わった あとの 自由な おしゃべりが、ただの 雑談で 終わって いた。
   * **相手の ことを 3つ 見つける**という 目あてを 置くと、聞く 練習に なる
   *（設計01 P2: 自分で 引き出した ものだから 開く 価値が ある）。
   *
   * 判定は **この 端末の 中だけ**（`keywords` の 照合）。AIを 足さないのは、
   * 鍵の 無い 学習者にも 同じ 体験を 残す ため。声が つながって いない ときは
   * `answer` を そのまま 相手の ことばとして 出す——**聞けば 答えが 返る**
   * という 会話の 形は、声の あるなしで 変えない。
   */
  discover: z
    .array(
      z.object({
        id: z.string().min(1),
        /** 何を 見つけるか（伏せ札の 表に 出す 短い ことば）。 */
        label: plainText,
        /** 学習者の しつもんに 出る ことば（どれか 1つ 当たれば 開く）。 */
        keywords: z.array(z.string().min(1)).min(1),
        /** 相手の 答え（声が つながって いない ときに 画面が 出す）。 */
        answer: plainText,
      }),
    )
    .default([]),
  /**
   * 同じ しつもんに 何回まで 言い直せるか（先生が 教材ごとに 決める）。
   *
   * 既定は `MAX_ATTEMPTS`（2回）。**その場で 1回 練習すれば 先へ 進む**という
   * 2026-08-20 の 指定を、教室ごとに 動かせるように した もの（2026-08-22 の 指定）。
   *
   * - `1`〜`10` … その 回数の あとは 必ず つぎへ 進む
   * - `null` … **なし**。できるまで 何回でも 言い直す
   * - 欄が 無い（`undefined`）… 既定の 2回（前からの 教材は ここに 入る）
   *
   * `null` を えらべる ように したのは、**時間に ゆとりの ある 教室**が あるため。
   * ただし 既定には しない——上限が 無いと、いちばん 助けが 要る 学習者だけが
   * 会話を 終われなく なる（`clampRetry` の 説明）。
   */
  maxAttempts: z.number().int().min(1).max(10).nullable().optional(),
  /**
   * 会話の 最中に 開ける「じぶんの メモ」（2026-08-27 の 指定
   * 「回答した内容をミーティングで表示させる方法はないか」）。
   *
   * 中身は **その もんだいで 自分が 書いた こたえ**で、教材には 持たない
   *（学習者ごとに ちがう ものを 教材が 持てる はずが ない）。ここに 書くのは
   * **どの もんだいの こたえを 出すか**だけ。実体は 端末の「こたえノート」
   *（`src/lib/answers/notebook.ts`）から 引く。
   *
   * ミーティング専用に しないのは、同じ「メモを 見ながら 話す」形を
   * これから 別の 対話にも 置くため——部品（`AnswerNotebook`）も 引き先も
   * 教材の 種類を 知らない 作りに して ある。
   */
  notes: z
    .array(
      z.object({
        /** もんだい（quizset）の id。 */
        ref: z.string().min(1),
        /** メモの 見出し（「調査シートの こたえ」）。 */
        label: plainText,
        /**
         * ほうこくの しるし（`report`）が ついた 問だけ 出す。
         * 25問 ぜんぶを 開いたままだと カンペに ならない（けっかの 画面と 同じ理由）。
         */
        reportOnly: z.boolean().optional(),
      }),
    )
    .default([]),
  furigana: z.array(furiganaEntrySchema).optional(),
}).superRefine((meeting, ctx) => {
  /*
   * **答える ばんには しつもんと 見かたが 要る**。
   *
   * `questions` と `judgePrompt` を ゆるめたのは 聞く ばんの 教材の ため だけ。
   * 型の 上で ゆるめた ぶんを ここで 締め直さないと、**しつもんの 無い 答える ばん**が
   * 保存できて しまう（学習者は 何も 聞かれない 部屋に 入る）。
   */
  if (meeting.mode === "listen") return;
  /*
   * **対話ゲームは しつもんを 持たない**（願い #177）。
   *
   * 出だしは `talkGame.openers` が 持ち、そのあとの 深掘りは その場で AI が 作る。
   * ここで 3つ 求めると、書けない しつもん（学習者が 何を おもしろいと 言うかは
   * 先に 分からない）を 埋めさせる ことに なる。
   */
  if (meeting.talkGame) return;
  if (meeting.questions.length < 3) {
    ctx.addIssue({
      code: "custom",
      path: ["questions"],
      message: "しつもんは 3つ 以上（聞く ばんの 教材なら mode を listen に する）",
    });
  }
  if (!meeting.judgePrompt) {
    ctx.addIssue({
      code: "custom",
      path: ["judgePrompt"],
      message: "日本語の 見かたが 空（聞く ばんの 教材なら mode を listen に する）",
    });
  }
});

export const contentSchema = z.discriminatedUnion("kind", [
  vocabSchema,
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
  linkSchema,
  skitSchema,
  questSchema,
]);

export type VocabWord = z.infer<typeof vocabWordSchema>;
export type VocabBook = z.infer<typeof vocabSchema>;
export type Word = z.infer<typeof wordSchema>;
/**
 * **保存の かたち**（JSON / DB）。`wordIds`（正への 参照）か、古い `words` の どちらか。
 */
export type StoredWordStage = z.infer<typeof wordStageSchema>;

/**
 * **読み出したあとの かたち**。`words` は かならず ある。
 *
 * 保存が 参照でも、`src/lib/content.ts` が 正から 引いて 埋めてから 返すので、
 * ゲーム・辞書・スタジオは これまでどおり `words` だけを 見れば よい
 *（語の 置き場を 1か所に した ときに、読む側 12か所を 書き換えずに 済ませる ための 境目）。
 */
export type WordStage = Omit<StoredWordStage, "words" | "wordIds"> & { words: Word[] };
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
export type Quest = z.infer<typeof questSchema>;
export type QuestPhase = Quest["phases"][number];
export type QuestOption = QuestPhase["options"][number];
export type MangaCharacter = z.infer<typeof mangaCharacterSchema>;
export type MangaPage = Manga["pages"][number];
export type MangaPanel = MangaPage["panels"][number];
export type MangaLine = z.infer<typeof mangaLineSchema>;
export type Article = z.infer<typeof articleSchema>;
export type ArticleBlock = z.infer<typeof articleBlockSchema>;
export type Slides = z.infer<typeof slidesSchema>;
export type SlideNote = z.infer<typeof slideNoteSchema>;
export type LinkContent = z.infer<typeof linkSchema>;
export type Skit = z.infer<typeof skitSchema>;
export type SkitRole = z.infer<typeof skitRoleSchema>;
export type SkitLine = z.infer<typeof skitLineSchema>;
export type Content = z.infer<typeof contentSchema>;
