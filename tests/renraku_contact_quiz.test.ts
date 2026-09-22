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

/*
 * 2026-09-21 の 指定「上級は別な教材として分けてください」で **2本に 分けた**。
 * 元の 別ページも 初級／上級の **タブ 2つ**だったので、その 形に 戻した ことに なる。
 * 移植の 突き合わせは **2本を 合わせた もの**で 見る——分けた ことで 問いが
 * 1つでも 落ちたら ここで 止まる。
 */
const mailSet = quizSetSchema.parse(read("content", "quizsets", "renraku_contact_quiz.json"));
const slackSet = quizSetSchema.parse(
  read("content", "quizsets", "renraku_contact_slack_quiz.json"),
);
const quiz = { questions: [...mailSet.questions, ...slackSet.questions] };
const stage = stageSchema.parse(read("content", "stages", "renraku.json"));

/** 空白の ちがいは 見ない（アプリの 文は 分かち書きに する）。 */
const bare = (text: string) => text.replace(/\s+/gu, "");

/** 元の 別ページの こたえ（`data-answer`）を 出て きた 順に。 */
const ORIGINAL_ANSWERS = [...HTML.matchAll(/data-answer="([^"]*)"/g)].map((hit) => hit[1] ?? "");

const mails = quiz.questions.filter((q) => q.type === "fillin");
const slacks = quiz.questions.filter((q) => q.type === "free");

describe("連絡文の もんだい（移植）", () => {
  it("元の 別ページと 同じ 20問（初級10・上級10）を 2本に 分けて 持つ", () => {
    expect(quiz.questions).toHaveLength(20);
    expect(mails).toHaveLength(10);
    expect(slacks).toHaveLength(10);
    // 元の ページの 問いの 数（q-card）と 合わせる
    expect([...HTML.matchAll(/class="q-card"/g)]).toHaveLength(20);
    // 1本に メールと Slackが 混ざって いない（分けた 意味が 無く なる）
    expect(mailSet.questions.every((q) => q.type === "fillin")).toBe(true);
    expect(slackSet.questions.every((q) => q.type === "free")).toBe(true);
  });

  it("2本とも 同じ やりかた・同じ 合格ラインで 出す（分けた だけで 難しさを 変えない）", () => {
    expect(slackSet.answerMode).toBe(mailSet.answerMode);
    expect(slackSet.passRate).toBe(mailSet.passRate);
  });

  it("章の 見出しは 元の ページの まま（タブの 名前は 教材の 題に 移した）", () => {
    // 元は タブ＝初級／上級、その 中の 見出しが パターンA…／レベル1…
    const heads = (set: typeof mailSet) => [
      ...new Set(set.questions.map((q) => q.section).filter((one) => one !== undefined)),
    ];
    expect(heads(mailSet)).toEqual([
      "パターンA：システムエラー",
      "パターンB：スケジュール変更",
      "パターンC：お願い・依頼",
    ]);
    expect(heads(slackSet)).toEqual([
      "レベル1",
      "レベル2",
      "レベル3",
      "レベル4",
      "レベル4（自由記述）",
    ]);
    for (const set of [mailSet, slackSet]) {
      for (const q of set.questions) {
        expect(q.section?.startsWith("初級"), `${q.id} に タブの 名前が 残って いる`).not.toBe(
          true,
        );
        expect(q.section?.startsWith("上級"), `${q.id} に タブの 名前が 残って いる`).not.toBe(
          true,
        );
      }
    }
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

  it("どの 問いも AIに 見て もらえる（`ai` が ある）", () => {
    for (const q of quiz.questions) {
      const ai = q.type === "free" || q.type === "fillin" ? q.ai : undefined;
      expect(ai, `${q.id} が AIの チェックに かからない`).toBeDefined();
    }
  });

  it("見る 単位は 型で ちがう（メールは 欄・Slackは 観点。ものさしを 2つに しない）", () => {
    // メール: ⭕✗は 欄の 正解から アプリが 決める。観点を 足すと 判定が 2つに なる（規律10）
    for (const q of mails) {
      expect(q.type === "fillin" && q.ai?.checks, `${q.id} に 観点が ある`).toBeFalsy();
    }
    // Slack: 機械の 正解が 無い ので、観点が ⭕✗の 単位に なる
    for (const q of slacks) {
      const checks = q.type === "free" ? (q.ai?.checks ?? []) : [];
      expect(checks.length, `${q.id} の 観点が 足りない`).toBeGreaterThanOrEqual(2);
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
    for (const set of [mailSet, slackSet]) {
      expect(set.answerMode).toBe("all");
      expect(set.phase).toBe("production");
    }
    for (const q of quiz.questions) expect(["fillin", "free"]).toContain(q.type);
  });
});

describe("連絡ステージの 差し替え", () => {
  it("上級は 初級の **すぐ うしろ**（前提が 揃う順）", () => {
    /*
     * 2026-09-21 の 指定で 2本に 分けた。並びは「足した順」では なく「前提が 揃う順」。
     * 上級（自分で 書く）は 初級（型に うめる）を 通って からで ないと 足場が 無い。
     */
    const refs = stage.contents.map((content) => content.ref);
    const mail = refs.indexOf("renraku_contact_quiz");
    const slack = refs.indexOf("renraku_contact_slack_quiz");
    expect(mail).toBeGreaterThan(0);
    expect(slack).toBe(mail + 1);
  });

  it("2本とも 関門では ない（元の 別ページと 同じ 通り道）", () => {
    for (const ref of ["renraku_contact_quiz", "renraku_contact_slack_quiz"]) {
      const item = stage.contents.find((content) => content.ref === ref);
      expect(item?.gates, `${ref} が 関門に なって いる`).toBe(false);
    }
  });

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
