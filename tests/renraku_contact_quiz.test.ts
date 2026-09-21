import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quizSetSchema, stageSchema } from "@/content/schema";
import { fillinSlots } from "@/lib/quiz/fillin";
import { replacedContent } from "@/lib/stage-routes";

/**
 * 連絡文の 練習（メール・Slack）を 別ページから もんだいへ 移した ところ（2026-09-20）。
 *
 * 指定:「gemini-live による AIテキスト採点を 入れて」「別ページで 開くのでは なく、
 *       問題コンポーネントとして AI問題を チェックできるように」
 *      「AIが 評価する ボタンは 各問題に 設置し、模範解答の 表示だけでなく、
 *       入力された 文章を ベースにした ブラッシュアップ回答も 見やすく 表示して」
 *
 * **移植は 差分ゼロが 既定**（AGENTS.md 規律10）。だから この 検査は
 * **元の 別ページ（`public/tools/hourensou/renraku_contact.html`）を 読んで**
 * 突き合わせる——手で 写した 一覧と くらべると、写し まちがいごと 通って しまう。
 */

const HTML = readFileSync(join("public", "tools", "hourensou", "renraku_contact.html"), "utf8");

function read<T>(...path: string[]): T {
  return JSON.parse(readFileSync(join(...path), "utf8")) as T;
}

const quiz = quizSetSchema.parse(read("content", "quizsets", "renraku_contact_quiz.json"));
const stage = stageSchema.parse(read("content", "stages", "renraku.json"));

/** 空白の ちがいは 見ない（アプリの 文は 分かち書きに する）。 */
const bare = (text: string) => text.replace(/\s+/gu, "");

/** 元の 別ページの こたえ（`data-answer`）を 出て きた 順に。 */
const ORIGINAL_ANSWERS = [...HTML.matchAll(/data-answer="([^"]*)"/g)].map((hit) => hit[1] ?? "");

const mails = quiz.questions.filter((q) => q.type === "fillin");
const slacks = quiz.questions.filter((q) => q.type === "free");

describe("連絡文の もんだい（移植）", () => {
  it("元の 別ページと 同じ 20問（メール10・Slack10）", () => {
    expect(quiz.questions).toHaveLength(20);
    expect(mails).toHaveLength(10);
    expect(slacks).toHaveLength(10);
    // 元の ページの 問いの 数（q-card）と 合わせる
    expect([...HTML.matchAll(/class="q-card"/g)]).toHaveLength(20);
  });

  it("メールの 欄の こたえは 元の ページと 同じ（並びも 同じ）", () => {
    const ported = mails.flatMap((q) =>
      q.type === "fillin" ? fillinSlots(q).map((slot) => bare(slot.answer)) : [],
    );
    expect(ported).toEqual(ORIGINAL_ANSWERS.map(bare));
  });

  it("黄色い しるしは 元の ページと 同じ 3問だけ（むずかしさの 階段を ならさない）", () => {
    /*
     * 元の 教材は **パターンの 1問目**（第1問・第4問・第7問）にだけ しるしを 付け、
     * 2問目からは 自分で さがさせて いた。そろえると 階段が 消える。
     */
    const marked = mails
      .map((q, at) => ((q.scene?.marks ?? []).length > 0 ? at + 1 : 0))
      .filter((at) => at > 0);
    expect(marked).toEqual([1, 4, 7]);
  });

  it("しるしは メモの 中に 本当に ある ことば（光らない しるしを 置かない）", () => {
    for (const q of mails) {
      for (const mark of q.scene?.marks ?? []) {
        expect(q.scene?.text, `「${mark}」が メモに 無い`).toContain(mark);
      }
    }
  });

  it("どの 問いにも AIの 観点が ある（ものさしは 答える 前に 見せる）", () => {
    for (const q of quiz.questions) {
      const ai = q.type === "free" || q.type === "fillin" ? q.ai : undefined;
      expect(ai, `${q.id} に AIの 観点が 無い`).toBeDefined();
      expect(ai?.checks.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it("Slackの 問いには お手本が ある（メールは 欄の 正解から 組み立てる）", () => {
    for (const q of slacks) {
      expect(q.type === "free" && q.ai?.model, `${q.id} に お手本が 無い`).toBeTruthy();
    }
    // メールの 側は 持たない（同じ 文を 2か所に 置くと、片方だけ 古く なる）
    for (const q of mails) expect(q.type === "fillin" && q.ai?.model).toBeFalsy();
  });

  it("お手本は 場面に 無い 数を 足して いない（言って いない ことを 書かない）", () => {
    // さいごの 1問は「場面を 自分で 決める」問いなので 数の もとが 無い
    for (const q of slacks.slice(0, -1)) {
      const model = q.type === "free" ? (q.ai?.model ?? "") : "";
      const scene = bare(q.scene?.text ?? "");
      for (const number of model.match(/\d+/g) ?? []) {
        expect(scene, `${q.id} の お手本に 場面に 無い 数「${number}」が ある`).toContain(number);
      }
    }
  });

  it("全問 1ページ・自分で 日本語を 出す 教材（選択式は 置かない）", () => {
    expect(quiz.answerMode).toBe("all");
    expect(quiz.phase).toBe("production");
    for (const q of quiz.questions) expect(["fillin", "free"]).toContain(q.type);
  });
});

describe("連絡ステージの 差し替え", () => {
  it("別ページは ステージから 外れ、同じ 位置に もんだいが 入る", () => {
    const refs = stage.contents.map((content) => content.ref);
    expect(refs).toContain("renraku_contact_quiz");
    expect(refs).not.toContain("renraku_contact");
    // 元の 別ページの ファイルは 消さない（先生が リンクを 配れば 開ける）
    expect(() => read("content", "links", "renraku_contact.json")).not.toThrow();
  });

  it("古い URL は もんだいへ 送る（配った リンクを 404 に しない）", () => {
    expect(replacedContent("renraku", "link-renraku_contact")).toEqual({
      type: "quizset",
      ref: "renraku_contact_quiz",
    });
    // ほかの ステージの 同じ 2段目は 引っぱらない
    expect(replacedContent("houkoku", "link-renraku_contact")).toBeNull();
  });
});
