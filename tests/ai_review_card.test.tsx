import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiReviewCard } from "@/components/quiz/ai-review-card";
import type { AnswerCheck } from "@/components/quiz/answer-check";
import {
  buildQuizReviewPrompt,
  fieldAfter,
  hideUnwritten,
  parseQuizReview,
  QUIZ_REVIEW_TOOL,
  type QuizReviewContext,
} from "@/lib/quiz/ai-review";
import { buildFuriganaIndex } from "@/lib/text/furigana";

/**
 * AIの ひょうか（2026-10-26 の 指定）
 *
 * 「AIのチェック結果ですが、すごくわかりにくいです。上記のような構成にできますか？」
 * 「タイトルは…『AIのひょうか』」「タイトルの左にNEXMAXの画像」
 * 「文法のアドバイスは…文法ではないので、良い形にアレンジ」。同日の A/B で
 * 「直した 文の 中の まだ 書いて いない 中身は『？』で 隠す」。
 *
 * ここで 固定するのは:
 *  1. AIの 返事から **なおすところ**（書いた ところ・直した 形・読む 人の しつもん）と
 *     **文法アドバイス**を 取り出す
 *  2. 直した 形に **答えの 中身（URL・時刻・欄の 正解）が 出ない**（？？？に する）
 *  3. カードの 見出し・順番・ネクマックスの 絵・何問目か
 */

/** 写真の 場面（上級 Slack の 1問目）。 */
const SLACK: QuizReviewContext = {
  question: "下の 情報を もとに、Slackの メッセージを 書いて ください。",
  scene: "テスト用の URLが 変わった。（変更前：http://test-server1 → 変更後：http://test-server2）",
  model: "お疲れさまです。テスト用の URLが 変わりましたので、連絡します。",
  note: "",
  itemKind: "point",
  items: [
    { id: "ketsuron", label: "1行目で 何の 連絡かが 分かる" },
    { id: "ryouhou", label: "変更前と 変更後が 両方 書いて ある" },
    { id: "jijitsu", label: "事実だけで 書いて ある（気もちを 書いて いない）" },
  ],
  written: "@frontend_team\nテストURL変わった\n変更：http://test-server2",
};

/** 初級（メール）: 欄で 見る。 */
const MAIL: QuizReviewContext = {
  question: "メールを 完成させて ください。",
  scene: "",
  model: "",
  note: "",
  itemKind: "field",
  items: [
    {
      id: "f1",
      label: "宛先",
      value: "佐藤さん",
      answer: "システム管理部の 佐藤さん",
      ok: false,
      aiJudges: true,
    },
    { id: "f2", label: "直る予定", value: "今日の16:00", answer: "今日の 15:00", ok: false },
  ],
  written: "宛先：佐藤さん\n【直る予定】今日の16:00",
};

describe("AIへの 頼み", () => {
  it("なおすところ と 文法アドバイスの 書きかたを 伝える", () => {
    const prompt = buildQuizReviewPrompt(SLACK);
    expect(prompt).toContain("# ✗の 項目に 書く もの（before・after・ask）");
    expect(prompt).toContain("書かずに ？？？ に します");
    expect(prompt).toContain("# 文法アドバイス（grammar）");
    // 何を 書くか（中身）は 文法に 入れない（写真の 2つめは 文法では ない、の 指定）
    expect(prompt).toContain("grammar には 書きません");
  });

  it("Slack の 宛先（@）の 行は 宛先だけで よく、「1行目」は つぎの 行で 見ると 伝える", () => {
    // 2026-10-26「最初の行は宛先だけでいい。2行目に書いてあればいい。むしろ他の内容があってはいけない」
    const prompt = buildQuizReviewPrompt(SLACK);
    expect(prompt).toContain("宛先の 行は **宛先だけ**で 正しい 形です。");
    expect(prompt).toContain("宛先の 行の **つぎの 行**で 見ます");
    expect(prompt).toContain("宛先の 行に 宛先 以外の ことばも 書いて いたら");
  });

  it("道具に before・after・ask・grammar が ある", () => {
    const params = QUIZ_REVIEW_TOOL.functionDeclarations[0]!.parameters;
    expect(Object.keys(params.properties.items.items.properties)).toEqual(
      expect.arrayContaining(["before", "after", "ask"]),
    );
    expect(params.properties.grammar.items.required).toEqual(["point", "explain", "example"]);
    expect(params.required).toContain("grammar");
  });
});

describe("AIの 返事の 読み取り（なおすところ・文法アドバイス）", () => {
  /** Haiku で 試した ときの 返事（2026-10-26。写真の 場面）を もとに した もの。 */
  const args = {
    ok: false,
    items: [
      {
        id: "ketsuron",
        ok: false,
        note: "最初の 行だけでは、何の 連絡か わかりません。",
        before: "テストURL変わった",
        after: "テスト用の URLが 変わりました。",
        ask: "何の URL？ いつ 変わった？",
      },
      {
        id: "ryouhou",
        ok: false,
        note: "変更前の URLが ありません。",
        before: "変更：http://test-server2",
        // AIが 答えを 書いて しまった 形——機械で 隠す
        after: "変更前：http://test-server1\n変更後：http://test-server2",
        ask: "前は どの URL でしたか？",
      },
      { id: "jijitsu", ok: true, note: "事実だけで 書けて います。", before: "x", after: "y" },
    ],
    polished: "",
    grammar: [
      {
        point: "〜が 変わりました",
        explain: "何が 変わったかを 書きます。",
        example: "URLが 変わりました。",
      },
      { point: "〜です", explain: "ていねいに 書きます。", example: "15:00です。" },
      { point: "3つめ", explain: "多すぎる", example: "" },
    ],
  };

  it("✗の 項目に 書いた ところ・直した 形・読む 人の しつもんが 入る", () => {
    const review = parseQuizReview(args, SLACK)!;
    expect(review.items[0]).toMatchObject({
      ok: false,
      before: "テストURL変わった",
      after: "テスト用の URLが 変わりました。",
      ask: "何の URL？ いつ 変わった？",
    });
  });

  it("⭕の 項目には なおすところを 付けない", () => {
    const review = parseQuizReview(args, SLACK)!;
    expect(review.items[2]).toEqual({
      id: "jijitsu",
      ok: true,
      note: "事実だけで 書けて います。",
    });
  });

  it("学生が まだ 書いて いない URLは ？？？ に する（写せば ⭕に ならない ように）", () => {
    const review = parseQuizReview(args, SLACK)!;
    expect(review.items[1]?.after).toBe("変更前：？？？\n変更後：http://test-server2");
  });

  it("学生の 文に 無い 写しは「あなたの 文」として 出さない（「書いて いません」とも 言わない）", () => {
    const made = { ...args, items: [{ ...args.items[0], before: "テスト環境が 変わった" }] };
    expect(parseQuizReview(made, SLACK)?.items[0]?.before).toBeUndefined();
  });

  it.each(["テストURL変わった。", "変更: http://test-server2", "テスト URL 変わった"])(
    "句読点・空白の ちがう 写し「%s」も 学生の 文と して 出す",
    (quoted) => {
      const made = { ...args, items: [{ ...args.items[0], before: quoted }] };
      expect(parseQuizReview(made, SLACK)?.items[0]?.before).toBe(quoted);
    },
  );

  it("読む 人の しつもん・ひとことの 中の まだ 書いて いない URLも 隠す", () => {
    const made = {
      ...args,
      items: [
        {
          ...args.items[1],
          note: "http://test-server1 が ありません。",
          ask: "前は http://test-server1 でしたか？",
        },
      ],
    };
    const item = parseQuizReview(made, SLACK)?.items[0];
    expect(item?.ask).toBe("前は ？？？ でしたか？");
    expect(item?.note).toBe("？？？ が ありません。");
  });

  it("文法アドバイスは 2つまで。例文の 中の まだ 書いて いない 数字も 隠す", () => {
    const grammar = parseQuizReview(args, SLACK)?.grammar ?? [];
    expect(grammar.map((tip) => tip.point)).toEqual(["〜が 変わりました", "〜です"]);
    expect(grammar[1]?.example).toBe("？？？です。");
  });

  it("欄は 写しも 直した 形も アプリが 作る（AIの 直しに 正解が あっても 使わない）", () => {
    const review = parseQuizReview(
      {
        ok: false,
        items: [
          {
            id: "f1",
            ok: false,
            note: "部署が ありません。",
            before: "宛先：佐藤さん",
            after: "宛先：システム管理部の 佐藤さん",
          },
          {
            id: "f2",
            ok: false,
            note: "時間が ちがいます。",
            after: "【直る 予定】今日 の 15 : 00",
          },
        ],
        polished: "",
        grammar: [],
      },
      MAIL,
    )!;
    expect(review.items[0]).toMatchObject({ before: "佐藤さん", after: "？？？の 佐藤さん" });
    expect(review.items[1]).toMatchObject({ before: "今日の16:00", after: "今日の ？？？" });
  });

  it("欄の 正解は、空白の 位置を 変えても ひとこと・しつもん・文法の 例文から 隠す", () => {
    const review = parseQuizReview(
      {
        ok: false,
        items: [
          {
            id: "f1",
            ok: false,
            note: "「システム 管理部の 佐藤さん」と 書きます。",
            ask: "管理部の だれですか？",
          },
          { id: "f2", ok: false, note: "１５：００ です。" },
        ],
        polished: "",
        grammar: [
          {
            point: "〜に 送ります",
            explain: "",
            example: "システム管理部の 佐藤さんに 送ります。",
          },
        ],
      },
      MAIL,
    )!;
    expect(review.items[0]?.note).toBe("「？？？の 佐藤さん」と 書きます。");
    // 「管理部」は 正解の かたまり「システム管理部」の 一部——漢字の かたまりで 見る
    expect(review.items[0]?.ask).not.toContain("システム");
    expect(review.items[1]?.note).toBe("？？？ です。");
    expect(review.grammar?.[0]?.example).toBe("？？？の 佐藤さんに 送ります。");
  });

  it.each([
    ["システム管理部の 佐藤さん", "佐藤さん", "？？？の 佐藤さん"],
    ["株式会社さくらデザインの 鈴木様", "鈴木様", "？？？の 鈴木様"],
    ["品質管理（QA）チームの 皆様", "チームの 皆様", "？？？の 皆様"],
    ["開発2課の 山田さん", "山田さん", "？？？の 山田さん"],
    ["明日の 朝 9:00", "明日の8:00", "明日の ？？？ ？？？"],
    ["スマホ版も 確認する こと", "スマホ版", "スマホ版も ？？？ こと"],
  ])("欄の 直した 形: 正解「%s」・書いた「%s」→「%s」", (answer, value, expected) => {
    expect(fieldAfter(answer, value)).toBe(expected);
  });

  it("全角の 数字・英字も 隠す。学生が 書いた URLは 記号が 付いても 残す", () => {
    const written = "テストURL変わった http://test-server2";
    expect(hideUnwritten("今日の １５：００まで", written)).toBe("今日の ？？？まで");
    expect(hideUnwritten("ｈｔｔｐ：／／ｔｅｓｔ－ｓｅｒｖｅｒ１", written)).toBe("？？？");
    expect(hideUnwritten("URL: http://test-server2.", written)).toBe("URL: http://test-server2.");
  });

  it("文法アドバイスの 文の 形に AIが 付けた「」は 外す（画面が 囲む）", () => {
    const made = {
      ...args,
      grammar: [{ point: "「〜が 変わりました」", explain: "", example: "" }],
    };
    expect(parseQuizReview(made, SLACK)?.grammar?.[0]?.point).toBe("〜が 変わりました");
  });

  it("文法アドバイスが 来なくても 読める（空の 配列）", () => {
    expect(parseQuizReview({ ...args, grammar: undefined }, SLACK)?.grammar).toEqual([]);
  });

  it("hideUnwritten: 学生が 書いた URL・時刻は 残す", () => {
    expect(hideUnwritten("15:00に http://a2 へ", "15時? いや 15:00 と http://a2")).toBe(
      "15:00に http://a2 へ",
    );
  });
});

describe("カードの 見た目", () => {
  const furigana = buildFuriganaIndex([]);
  const check = (over: Partial<AnswerCheck> = {}): AnswerCheck => ({
    ok: false,
    of: SLACK.written,
    aiNote: "",
    polished: "",
    items: [
      {
        id: "ketsuron",
        ok: false,
        note: "何の 連絡かが わかりません。",
        before: "テストURL変わった",
        after: "テスト用の URLが 変わりました。",
        ask: "何の URL？",
      },
      { id: "jijitsu", ok: true, note: "事実だけで 書けて います。" },
    ],
    grammar: [
      {
        point: "〜が 変わりました",
        explain: "何が 変わったかを 書きます。",
        example: "URLが 変わりました。",
      },
    ],
    ...over,
  });
  const render = (value: AnswerCheck) =>
    renderToStaticMarkup(
      <AiReviewCard
        check={value}
        labels={new Map(SLACK.items.map((one) => [one.id, one.label]))}
        position={{ at: 1, of: 10 }}
        furigana={furigana}
        aiFurigana={furigana}
        gated
      />,
    );
  const plain = (html: string) => html.replace(/<rt>.*?<\/rt>/g, "").replace(/<[^>]+>/g, "");

  it("見出しは「AIの ひょうか」。左に ネクマックス、右に 何問目か", () => {
    const html = render(check());
    expect(plain(html)).toContain("AIの ひょうか");
    expect(html).toContain("nexmax%2Fguide.webp");
    expect(plain(html)).toContain("1/10");
  });

  it("なおすところ → 文法アドバイス の 順", () => {
    const text = plain(render(check()));
    const order = ["なおすところ", "文法アドバイス"].map((word) => text.indexOf(word));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("何の URL？");
    expect(text).toContain("テスト用の URLが 変わりました。");
  });

  it("あなたの メッセージ・よかったところ は 出さない（いったん 削除の 指定）", () => {
    const text = plain(render(check()));
    expect(text).not.toContain("あなたの メッセージ");
    expect(text).not.toContain("よかったところ");
    // ⭕の 項目の ひとことも 出さない
    expect(text).not.toContain("事実だけで 書けて います。");
  });

  it("ぜんぶ ⭕なら なおすところを 出さない", () => {
    const text = plain(
      render(check({ ok: true, items: [{ id: "jijitsu", ok: true, note: "よい" }], grammar: [] })),
    );
    expect(text).not.toContain("なおすところ");
    expect(text).not.toContain("文法アドバイス");
    expect(text).toContain("OKです");
  });

  it("写しが 見つからない ときは「書いて いません」と 言わず、直した 形だけ 出す", () => {
    const text = plain(
      render(
        check({
          items: [{ id: "ketsuron", ok: false, note: "x", after: "直した 形" }],
          grammar: [],
        }),
      ),
    );
    expect(text).not.toContain("書いて いません");
    expect(text).toContain("直した 形");
  });

  it("直した 形が 無い ときは 写しも 矢印も 出さない（矢印の 先が 空に ならない）", () => {
    const html = render(
      check({
        items: [{ id: "ketsuron", ok: false, note: "x", before: "テストURL変わった", after: "" }],
        grammar: [],
      }),
    );
    expect(html).not.toContain("→");
    expect(plain(html)).toContain("x");
  });

  it("ひとことが 無い ✗（AIに つながらなかった）は 項目の 名前で 見出しを 出す", () => {
    const text = plain(
      render(check({ items: [{ id: "ketsuron", ok: false, note: "" }], grammar: [] })),
    );
    expect(text).toContain("1行目で 何の 連絡かが 分かる");
  });
});

describe("こたえの チェックの 画面は AIの 文を AIの 読み索引で 描く", () => {
  // カードへ 渡す 索引を 取りちがえると、AIの 文の 漢字が 裸で 出る
  it.each(["mail-question.tsx", "slack-question.tsx"])("%s", (name) => {
    const code = readFileSync(join(__dirname, "..", "src", "components", "quiz", name), "utf8");
    expect(code).toMatch(/<AiReviewCard[\s\S]*?aiFurigana=\{aiFurigana\}/u);
  });
});
