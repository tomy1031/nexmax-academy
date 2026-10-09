import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProbeScoreModal, type RowView } from "../src/components/asakai/asakai-score-modal";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * 聞き返しへの こたえの あと — **伝わって いない 回の 道は「もう一度報告」の 1つ**
 *（2026-10-09 の 決定）。
 *
 * 前は 主ボタン「つぎの しつもんを 聞く」と 副ボタン「言い直す」の 2つで、伝わって いないのに
 * 先へ 進めた。いまは 伝わって いない 回（打ち切りでは ない）は「もう一度報告」だけ——
 * 押すと 同じ しつもんの まま 答え直す。伝わるまで 何回でも。
 */
const index = buildFuriganaIndex([]);

const ROWS: RowView[] = [
  {
    id: "shinchoku",
    label: "進捗",
    mark: "missing",
    advice: "",
    example: "",
    said: "",
    polished: "",
    hint: "",
  },
];

type Props = Parameters<typeof ProbeScoreModal>[0];

const base: Props = {
  heard: false,
  question: "進捗を、パーセントで お願いします。",
  answer: "すみません、わかりません。",
  good: "",
  advice: "",
  score: { content: 0, clarity: null, japanese: null, total: null },
  rows: ROWS,
  nextLabel: "つぎの しつもんを 聞く ▶",
  rest: "進捗",
  judged: false,
  failReason: null,
  index,
  onClose: () => undefined,
};

/** ふりがな（rt）と タグを 外した 画面の 字。 */
function text(html: string): string {
  return html
    .replace(/<rt>[^<]*<\/rt>/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/\s+/gu, "");
}

/** ボタンの 名前（aria-label）の 並び。 */
function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*\saria-label="([^"]*)"/gu)].map((match) => match[1] ?? "");
}

describe("ProbeScoreModal の 道", () => {
  it("伝わって いない 回は「もう一度報告」だけ（つぎの しつもんも 言い直すも 出ない）", () => {
    const html = renderToStaticMarkup(<ProbeScoreModal {...base} onRetry={() => undefined} />);
    expect(buttons(html)).toEqual(["もう一度報告"]);
    expect(html).not.toContain("つぎの しつもんを 聞く");
    expect(html).not.toContain("言い直す");
    expect(text(html)).toContain("内容:まだ伝わっていません");
  });

  it("伝わった 回は「もう一度報告」が 無い（主ボタンは つぎへ）", () => {
    const html = renderToStaticMarkup(
      <ProbeScoreModal {...base} heard onRetry={() => undefined} />,
    );
    expect(buttons(html)).toEqual(["つぎの しつもんを 聞く ▶"]);
    expect(html).not.toContain("もう一度報告");
    expect(text(html)).toContain("内容:伝わりました");
  });

  it("打ち切りは「伝わりませんでした」。「もう一度報告」は 出ない（主ボタンは つぎへ）", () => {
    const html = renderToStaticMarkup(
      <ProbeScoreModal {...base} gaveUpLabel="進捗" nextLabel="きょうの 評価を 見る ▶" />,
    );
    expect(buttons(html)).toEqual(["きょうの 評価を 見る ▶"]);
    expect(html).not.toContain("もう一度報告");
    const shown = text(html);
    expect(shown).toContain("内容:伝わりませんでした");
    expect(shown).not.toContain("まだ伝わっていません");
    expect(html).toContain("❌");
  });

  it("伝わって いない 回の ボタン・幕・Esc は 同じ 先（onRetry）へ 行く", () => {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    /* 関数部品を そのまま 呼んで、殻（ModalShell）に 渡した 先を 見る（フックは 使って いない）。 */
    const shell = ProbeScoreModal({ ...base, onRetry, onClose });
    expect(shell.props.closeLabel).toBe("もう一度報告");
    expect(shell.props.secondary).toBeUndefined();
    shell.props.onClose();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("onRetry が 無い とき（夕礼の 作業記録の 読み上げ）は 字だけ「もう一度報告」・押し先は onClose", () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(<ProbeScoreModal {...base} readLog onClose={onClose} />);
    expect(buttons(html)).toEqual(["もう一度報告"]);
    const shell = ProbeScoreModal({ ...base, readLog: true, onClose });
    shell.props.onClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("伝わった 回・打ち切りの 押し先は onClose（onRetry を 渡しても 使わない）", () => {
    for (const over of [{ heard: true }, { gaveUpLabel: "進捗" }]) {
      const onRetry = vi.fn();
      const onClose = vi.fn();
      const shell = ProbeScoreModal({ ...base, ...over, onRetry, onClose });
      shell.props.onClose();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    }
  });
});
