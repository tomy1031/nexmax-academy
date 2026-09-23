import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportScoreModal, type RowView } from "../src/components/asakai/asakai-score-modal";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * 報告の あとの ポップアップ — **項目ごとの 表**（2026-09-19 の 指定
 *「ブラッシュアップは 項目ごとに まとめて」「数値など 正しく 言えて いない 場合は
 * 答えは 出さず…ヒントに」「内容は 合って いて 日本語が おかしい 場合は、正しい 日本語を
 * ブラッシュアップと して 表で」「まだです の ところも 表で 一括で」）。
 */
const index = buildFuriganaIndex([]);

const row = (over: Partial<RowView> & Pick<RowView, "id" | "label" | "mark">): RowView => ({
  advice: "",
  example: "",
  said: "",
  polished: "",
  hint: "",
  ...over,
});

const ROWS: RowView[] = [
  row({
    id: "kinou",
    label: "きのう したこと",
    mark: "first",
    said: "きのう けっさい がめん つくった",
    polished: "きのうは 決済の 画面を 作りました。",
  }),
  row({
    id: "shinchoku",
    label: "担当の 機能 ぜんたいの 進捗",
    mark: "missing",
    said: "しんちょく20%",
    advice: "進捗を、パーセントで お願いします。",
    hint: "「今、決済フロントエンド機能 ぜんたいの 進捗は ◯◯%です。」",
  }),
  row({
    id: "kyou",
    label: "きょう すること",
    mark: "missing",
    advice: "きょう する ことを、もう いちど お願いします。",
    hint: "「きょうは ◯◯を します。」",
  }),
  row({
    id: "komari",
    label: "問題・確認",
    mark: "first",
    said: "今の ところ 問題は ありません。",
    polished: "今の ところ 問題は ありません。",
  }),
];

function render(
  rows: readonly RowView[],
  readLog = false,
  failReason: string | null = null,
): string {
  return renderToStaticMarkup(
    <ReportScoreModal
      score={
        failReason === null
          ? { content: 20, clarity: 10, japanese: 10, total: 40 }
          : { content: 20, clarity: null, japanese: null, total: null }
      }
      rows={rows}
      good=""
      advice=""
      readLog={readLog}
      nextLabel="報告を つづける ▶"
      utterance="きのう けっさい がめん つくった。しんちょく20%。今の ところ 問題は ありません。"
      failReason={failReason}
      index={index}
      onClose={() => undefined}
    />,
  );
}

/** 表の 行ごとの 字（タグを 外す）。 */
function rowsText(html: string): string[] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gu)]
    .map((match) => (match[1] ?? "").replace(/<rt>[^<]*<\/rt>/gu, "").replace(/<[^>]+>/gu, ""))
    .slice(1);
}

describe("報告の ポップアップの 表", () => {
  it("1つの 表に 4項目 ぜんぶ（まだの 札も）", () => {
    const html = render(ROWS);
    /* 2026-09-23 の 指定で「どのように 伝えられたか」から 名前を 変えた。 */
    expect(html).toContain("あなたの 報告と ブラッシュアップ");
    expect(html).not.toContain("どのように 伝えられたか");
    expect(html.match(/<table/gu)).toHaveLength(1);
    expect(rowsText(html)).toHaveLength(4);
  });

  it("言えた 札は ブラッシュアップ、直す ところが 無ければ「このままで 通じます」", () => {
    const [kinou, , , komari] = rowsText(render(ROWS));
    /* あなたの 発言と ブラッシュアップは 枠で 分ける（2026-09-20 の 指定）。 */
    expect(kinou).toContain("あなたの 発言");
    expect(kinou).toContain("きのう けっさい がめん つくった");
    expect(kinou).toContain("✨ ブラッシュアップ");
    expect(kinou).toContain("決済の 画面を 作りました。");
    expect(komari).toContain("✅ このままで 通じます");
    expect(komari).not.toContain("ブラッシュアップ");
  });

  it("まだの 札は 答えを 出さず ヒント（型文）だけ", () => {
    const [, shinchoku, kyou] = rowsText(render(ROWS));
    expect(shinchoku).toContain("💡 ヒント");
    expect(shinchoku).toContain("「今、決済フロントエンド機能 ぜんたいの 進捗は ◯◯%です。」");
    expect(shinchoku).toContain("しんちょく20%");
    /* 学生の 数を 直した 文（「進捗は 20%です」）を 出さない——正しい 数に 見える。 */
    expect(shinchoku).not.toContain("✨");
    expect(shinchoku).not.toMatch(/進捗は\s*20%です/u);
    expect(kyou).toContain("「きょうは ◯◯を します。」");
  });

  it("司会が つぎに 聞く 1つにだけ 👉（次の 行動は 1つ）", () => {
    const text = rowsText(render(ROWS));
    expect(text.filter((one) => one.includes("👉"))).toHaveLength(1);
    /* **短く 1行**（2026-09-20 の 指定）。何を 聞かれるかは 司会が 声で 言う。 */
    expect(text[1]).toContain("👉 つぎに 聞かれます");
    expect(text[1]).not.toContain("パーセントで お願いします");
  });

  it("点の 見出しに 仕組みの ことばを 出さない（2026-09-23 の 指定）", () => {
    /*
     * 「合格に 効くのは 報告の 内容です。」「AIの 見かたが 届きませんでした」は
     * 学習者の ことばでは ない——読んだ 人が いちばん 先に つまずく 文だった。
     */
    const html = render(ROWS);
    expect(html).not.toContain("合格に 効く");
    expect(html).not.toContain("AIの 見かた");
    expect(html).not.toContain("AIの 鍵");
  });

  /*
   * **なぜ AIの 点が 出ないかを 名前で 言う**（2026-09-23 の 指定
   *「鍵がない＝GeminiAPIキーがないということですか？ ならそのように言って
   *  APIキーの登録をうながしてください」）。
   *
   * 前は どの 失敗も「いまは AIの 見かたが 届きませんでした」の 1文だった ので、
   * **キーを 登録して いる 人が キーを 疑う**ことに なって いた。
   */
  it("キーが 無い ときは そう 言って、登録の 行き先を 出す", () => {
    const html = render(ROWS, false, "noKey");
    expect(html).toContain("APIキーが 登録されて いません");
    expect(html).toContain("/map/settings");
    expect(html).toContain("マイクで 話す");
  });

  it("間に 合わなかった ときは キーの 話を しない", () => {
    const html = render(ROWS, false, "timeout");
    expect(html).toContain("返事が 間に 合いませんでした");
    expect(html).toContain("もう いちど 報告すると 出ます");
    expect(html).not.toContain("APIキー");
    expect(html).not.toContain("/map/settings");
  });

  it("知らない 理由でも 黙らない（共有の 台帳の 既定へ 寄せる）", () => {
    const html = render(ROWS, false, "なぞ");
    expect(html).toContain("Google から ");
    expect(html).toContain("が ありませんでした");
  });

  /*
   * **キーが 壊れて いる 側も 言い分ける**（2026-09-23 の code-critic 検収）。
   *
   * 朝礼だけの 台帳に 書き写して いた ころ、期限切れ・IP制限・API が OFF・
   * VPN（場所）の 7つが 落ちて いて、その 学習者は
   *「返事が 届きませんでした。もう いちど 報告すると 出ます。」を 永久に 読む
   * ことに なって いた——**ユーザーが 報告して きたのと 同じ 型の 故障**。
   * 文は `src/lib/ai/key-check.ts` の 台帳（型で 全部の 名前を 要求する）から 引く。
   */
  it("キーが 期限切れ・制限つきの ときも 名前で 言う", () => {
    const expired = render(ROWS, false, "keyExpired");
    expect(expired).toContain("期限");
    expect(expired).not.toContain("もう いちど 報告すると");
    /* 書きかえれば 直る ので、せっていへ 送る。 */
    expect(expired).toContain("/map/settings");

    const restricted = render(ROWS, false, "keyRestricted");
    expect(restricted).toContain("制限");
    /* 先生に 頼む しか ない 理由には 行き先を 出さない（押しても 直せない）。 */
    expect(restricted).not.toContain("/map/settings");
  });

  it("VPN（場所）で はじかれた ときは、キーの 話を しない", () => {
    const html = render(ROWS, false, "locationNotSupported");
    expect(html).toContain("VPN");
    expect(html).not.toContain("/map/settings");
  });

  /*
   * **返事は 届いたのに 数が 欠けた 回**（同検収）。前は 理由が null の まま
   * 点だけ「—」で、ユーザーが 報告して きた 画面と 一字一句 同じだった。
   */
  it("AIが 点を つけなかった 回も 理由を 出す", () => {
    const html = render(ROWS, false, "badScore");
    expect(html).toContain("AIが 点を つけませんでした");
  });

  /*
   * **何回 報告しても 出ない 理由に「もう いちど」と 言わない**（同検収）。
   * できない ことを つぎの 一手に しない。
   */
  it("見る ところが 無い 日は、先生へ 送る", () => {
    const html = render(ROWS, false, "noFacts");
    expect(html).toContain("先生に つたえて ください");
    expect(html).not.toContain("もう いちど 報告すると");
  });

  it("点が 出て いる ときは 理由を 出さない", () => {
    const html = render(ROWS, false, null);
    expect(html).not.toContain("APIキー");
    expect(html).not.toContain("届きませんでした");
  });

  it("作業記録の 読み上げを 差し戻した ターンは ヒントも 👉 も 出さない", () => {
    const text = rowsText(render(ROWS, true));
    expect(text.some((one) => one.includes("💡") || one.includes("👉"))).toBe(false);
  });

  it("AIが 見て いない（鍵が 無い）ときは「このままで 通じます」と 言わない", () => {
    const [kinou] = rowsText(render(ROWS.map((one) => ({ ...one, said: "", polished: "" }))));
    expect(kinou).not.toContain("このままで");
    expect(kinou).toContain("—");
  });
});
