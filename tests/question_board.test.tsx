import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionCards } from "../src/components/meeting/question-board";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/**
 * しつもんの 板（相手の 顔の すぐ下の カード列）
 *
 * 2026-08-31 の 指摘 2件を ここで 固定する。
 * ①「11つの 質問」→「11個の 質問」 ②一度 開いた カードが ？ に 戻らない。
 */

const FURIGANA = buildFuriganaIndex([
  ["質問", "しつもん"],
  ["社長", "しゃちょう"],
  ["名前", "なまえ"],
]);

const ORDER = ["q1", "q2", "q3"];
const LABELS = { q1: "会社が できた 年は？", q2: "社長の 名前は？", q3: "サービスを 2つ" };

function render(props: Partial<Parameters<typeof QuestionCards>[0]> = {}): string {
  return renderToStaticMarkup(
    <QuestionCards
      order={ORDER}
      labels={LABELS}
      openIds={new Set()}
      answeredIds={new Set()}
      currentId={null}
      reachedAt={0}
      justOpenedId={null}
      missedIds={new Set()}
      furigana={FURIGANA}
      {...props}
    />,
  );
}

describe("見出し", () => {
  it("数え方は「個」（「11つ」に しない）", () => {
    const html = render();
    expect(html).toContain("個");
    expect(html).not.toContain("3つの");
  });
});

describe("カードの 中身", () => {
  it("まだ 答えて いない カードは ？ で 伏せる", () => {
    const html = render();
    expect(html).toContain("？");
    expect(html).not.toContain("社長");
  });

  /*
   * 「一度 開かれた はずの カードが 非表示の 状態に 戻って しまった」（2026-08-31）。
   * ✓（openIds）は 判定で 動くが、答えた ことは 取り消されない——
   * ことばは 出したままに する。
   */
  it("答えた カードは、✓ が 外れても ことばを 出したまま", () => {
    const html = render({ answeredIds: new Set(["q2"]) });
    expect(html).toContain("社長");
  });

  it("赤い 印（できなかった）でも ことばは 見える", () => {
    const html = render({ missedIds: new Set(["q2"]) });
    expect(html).toContain("社長");
  });
});
