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

function render(rows: readonly RowView[], readLog = false): string {
  return renderToStaticMarkup(
    <ReportScoreModal
      score={{ content: 20, clarity: 10, japanese: 10, total: 40 }}
      rows={rows}
      good=""
      advice=""
      readLog={readLog}
      nextLabel="報告を つづける ▶"
      utterance="きのう けっさい がめん つくった。しんちょく20%。今の ところ 問題は ありません。"
      hasKey
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
    expect(html).toContain("どのように 伝えられたか");
    expect(html.match(/<table/gu)).toHaveLength(1);
    expect(rowsText(html)).toHaveLength(4);
  });

  it("言えた 札は ブラッシュアップ、直す ところが 無ければ「このままで 通じます」", () => {
    const [kinou, , , komari] = rowsText(render(ROWS));
    expect(kinou).toContain("✨ きのうは 決済の 画面を 作りました。");
    expect(kinou).toContain("あなた: きのう けっさい がめん つくった");
    expect(komari).toContain("✅ このままで 通じます");
    expect(komari).not.toContain("✨");
  });

  it("まだの 札は 答えを 出さず ヒント（型文）だけ", () => {
    const [, shinchoku, kyou] = rowsText(render(ROWS));
    expect(shinchoku).toContain("💡 「今、決済フロントエンド機能 ぜんたいの 進捗は ◯◯%です。」");
    expect(shinchoku).toContain("あなた: しんちょく20%");
    /* 学生の 数を 直した 文（「進捗は 20%です」）を 出さない——正しい 数に 見える。 */
    expect(shinchoku).not.toContain("✨");
    expect(shinchoku).not.toMatch(/進捗は\s*20%です/u);
    expect(kyou).toContain("💡 「きょうは ◯◯を します。」");
  });

  it("司会が つぎに 聞く 1つにだけ 👉（次の 行動は 1つ）", () => {
    const text = rowsText(render(ROWS));
    expect(text.filter((one) => one.includes("👉"))).toHaveLength(1);
    expect(text[1]).toContain("👉 つぎに 聞かれます: 進捗を、パーセントで お願いします。");
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
