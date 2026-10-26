import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiReviewCard } from "@/components/quiz/ai-review-card";
import type { AnswerCheck } from "@/components/quiz/answer-check";
import {
  buildQuizReviewPrompt,
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

  it("学生の 文に 無い 写しは「あなたの 文」として 出さない", () => {
    const made = { ...args, items: [{ ...args.items[0], before: "テスト環境が 変わった" }] };
    expect(parseQuizReview(made, SLACK)?.items[0]?.before).toBe("");
  });

  it("文法アドバイスは 2つまで。例文の 中の まだ 書いて いない 数字も 隠す", () => {
    const grammar = parseQuizReview(args, SLACK)?.grammar ?? [];
    expect(grammar.map((tip) => tip.point)).toEqual(["〜が 変わりました", "〜です"]);
    expect(grammar[1]?.example).toBe("？？？です。");
  });

  it("欄は 学生が その 欄に 書いた ものを 写しに 使い、欄の 名前と 正解の ことばを 落とす", () => {
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
          { id: "f2", ok: false, note: "時間が ちがいます。", after: "【直る予定】今日の 15:00" },
        ],
        polished: "",
        grammar: [],
      },
      MAIL,
    )!;
    expect(review.items[0]).toMatchObject({ before: "佐藤さん", after: "？？？の 佐藤さん" });
    expect(review.items[1]).toMatchObject({ before: "今日の16:00", after: "今日の ？？？" });
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
        written={SLACK.written}
        writtenTitle="あなたの メッセージ"
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

  it("あなたの メッセージ → なおすところ → よかったところ → 文法アドバイス の 順", () => {
    const text = plain(render(check()));
    const order = ["あなたの メッセージ", "なおすところ", "よかったところ", "文法アドバイス"].map(
      (word) => text.indexOf(word),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("何の URL？");
    expect(text).toContain("テスト用の URLが 変わりました。");
  });

  it("ぜんぶ ⭕なら なおすところを 出さない", () => {
    const text = plain(
      render(check({ ok: true, items: [{ id: "jijitsu", ok: true, note: "よい" }], grammar: [] })),
    );
    expect(text).not.toContain("なおすところ");
    expect(text).not.toContain("文法アドバイス");
    expect(text).toContain("OKです");
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
