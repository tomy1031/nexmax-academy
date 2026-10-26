import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { quizQuestionSchema, type QuizQuestion } from "@/content/schema";
import { AnswerCheckProvider, type AnswerCheck } from "@/components/quiz/answer-check";
import { CheckBand } from "@/components/quiz/check-parts";
import { guardsCopy, noPasteProps } from "@/components/quiz/copy-guard";
import { SceneCard } from "@/components/quiz/scene-card";
import { SlackQuestion } from "@/components/quiz/slack-question";
import { buildFuriganaIndex } from "@/lib/text/furigana";

/**
 * 連絡文の 練習: なおすところを 書きかえても 消さない・コピペを 止める（2026-10-26 の 指定）
 *
 * 「修正点が入力した瞬間に消えるのはやめて。その代わりそのフィールドはコピペ不可にして。
 *  あともとにする情報もコピペ不可。初級も上級も」
 */

const furigana = buildFuriganaIndex([]);

const SLACK = quizQuestionSchema.parse({
  id: "slack_1",
  type: "free",
  q: "Slackの メッセージを 書いて ください。",
  minLength: 5,
  explain: "せつめい",
  scene: { style: "slack", from: "あなた", text: "テスト用の URLが 変わった。" },
  ai: {
    checks: [{ id: "ryouhou", label: "変更前と 変更後が 両方 書いて ある" }],
    model: "おてほん",
  },
}) as Extract<QuizQuestion, { type: "free" }>;

const MAIL = quizQuestionSchema.parse({
  id: "mail",
  type: "fillin",
  q: "メールを 完成させて ください。",
  explain: "せつめい",
  head: [{ kind: "write", label: "宛先", answer: "全社員" }],
  blanks: [{ label: "原因", answer: "サーバーの エラー" }],
  ai: { note: "欄の 正解は アプリが 見る。" },
});

describe("コピペを 止める 問い", () => {
  it("連絡文の 練習（初級：メール・上級：Slack）は 止める", () => {
    expect(guardsCopy(MAIL)).toBe(true);
    expect(guardsCopy(SLACK)).toBe(true);
  });

  it("書けば 点の 自由記述（関門に しない チェック）と ふつうの 問いは 止めない", () => {
    const loose = quizQuestionSchema.parse({
      ...SLACK,
      ai: { ...SLACK.ai, gate: false },
    });
    expect(guardsCopy(loose)).toBe(false);
    expect(guardsCopy(quizQuestionSchema.parse({ ...SLACK, ai: undefined }))).toBe(false);
  });

  it("入力欄の 貼り付け・落とし込みを 止めて 知らせる。コピー・切り取りも 止める", () => {
    const blocked = vi.fn();
    const props = noPasteProps(blocked);
    const event = () => ({ preventDefault: vi.fn() }) as never;
    for (const name of ["onPaste", "onDrop", "onCopy", "onCut"] as const) {
      const one = event() as { preventDefault: ReturnType<typeof vi.fn> };
      props[name](one as never);
      expect(one.preventDefault, name).toHaveBeenCalled();
    }
    expect(blocked).toHaveBeenCalledTimes(2);
  });

  it("もとにする 情報（場面の メモ）は 選べない", () => {
    const scene = SLACK.scene!;
    expect(renderToStaticMarkup(<SceneCard scene={scene} furigana={furigana} noCopy />)).toContain(
      "select-none",
    );
    expect(renderToStaticMarkup(<SceneCard scene={scene} furigana={furigana} />)).not.toContain(
      "select-none",
    );
  });

  it.each(["mail-question.tsx", "slack-question.tsx"])(
    "%s の 入力欄に 貼り付け止めを 付けて いる",
    (name) => {
      const code = readFileSync(join(__dirname, "..", "src", "components", "quiz", name), "utf8");
      expect(code).toContain("{...noPaste}");
      expect(code).toContain("PASTE_BLOCKED_NOTE");
    },
  );

  it("問いの 画面は 場面の メモに コピー止めを 渡す（2か所ぜんぶ）", () => {
    const code = readFileSync(
      join(__dirname, "..", "src", "components", "quiz", "quiz-runner.tsx"),
      "utf8",
    );
    expect(code.match(/<SceneCard[^>]*noCopy=\{guardsCopy\(question\)\}/g)).toHaveLength(2);
  });
});

describe("書きかえても なおすところを 消さない", () => {
  const check: AnswerCheck = {
    ok: false,
    of: "前に チェックした 文",
    aiNote: "",
    polished: "",
    items: [
      {
        id: "ryouhou",
        ok: false,
        note: "変更前が ありません。",
        before: "前に",
        after: "変更前：？？？",
        ask: "前は どれ？",
      },
    ],
    grammar: [],
  };
  const render = (input: string) =>
    renderToStaticMarkup(
      <AnswerCheckProvider setId="s" checks={{ slack_1: check }} onChange={() => {}}>
        <SlackQuestion
          question={SLACK}
          furigana={furigana}
          onSubmit={() => {}}
          submitMode
          draft={{ kind: "free", input }}
        />
      </AnswerCheckProvider>,
    );
  const plain = (html: string) => html.replace(/<rt>.*?<\/rt>/g, "").replace(/<[^>]+>/g, "");

  it("チェックした 文の ままなら、なおすところと「なおす ところが」を 出す", () => {
    const text = plain(render("前に チェックした 文"));
    expect(text).toContain("なおすところ");
    expect(text).toContain("なおす ところが 1こ");
  });

  it("書きかえた あとも なおすところは 出した まま。帯だけ「もう いちど チェック」", () => {
    const html = render("書きかえた 文");
    const text = plain(html);
    expect(text).toContain("なおすところ");
    expect(text).toContain("変更前：？？？");
    expect(text).toContain("書きかえました");
    // 前の けっかで「進めます」とも「なおす ところが」とも 言わない
    expect(text).not.toContain("進めます");
    expect(text).not.toContain("なおす ところが");
    // やり直しの うす赤も 残す
    expect(html).toContain("#fff0f3");
  });

  it("書きかえた あとの 帯は、前が ⭕でも「次へ 進めます」と 言わない", () => {
    const html = renderToStaticMarkup(
      <CheckBand ok left={0} aiNote="" furigana={furigana} stale />,
    );
    expect(html).not.toContain("進めます");
  });
});
