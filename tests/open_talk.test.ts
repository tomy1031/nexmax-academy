import { describe, expect, it } from "vitest";
import {
  isDeepQuestion,
  isOpinionAnswer,
  isOpinionAsk,
  looksLikeQuestion,
  OPEN_TALK,
  partnerLineBefore,
} from "@/components/listening/open-talk";

/*
 * 深く 聞く たいわ（ウェブサイトの 要件定義・2026-11-04 の 指定）。
 * カードは 最低限。深く 聞いた しつもんを ほめて 数え、意見を 聞かれた あとの 答えでは
 * カードを 開けない。
 */
describe("深く 聞く たいわ", () => {
  it("使う 教材は ウェブサイトの 要件定義の Zoom だけ（ほかの たいわは 変えない）", () => {
    expect([...OPEN_TALK]).toEqual(["youkenweb_zoom"]);
  });

  it("「なぜ」「どんな」「たとえば」の しつもんは 深い しつもん", () => {
    expect(isDeepQuestion("山本社長に お聞きします。なぜ プノンペンですか。")).toBe(true);
    expect(isDeepQuestion("どんな ときに うれしいですか")).toBe(true);
    expect(isDeepQuestion("たとえば、どんな お客様ですか")).toBe(true);
    expect(isDeepQuestion("ほかに 心配な ことは ありますか")).toBe(true);
    expect(isDeepQuestion("ドウシテ ですか")).toBe(true);
  });

  it("数や はい・いいえで 終わる しつもんは 深い しつもんに しない", () => {
    expect(isDeepQuestion("予算は いくらですか")).toBe(false);
    expect(isDeepQuestion("茶道体験は 1日に 何回 ありますか")).toBe(false);
    expect(isDeepQuestion("写真を とっても いいですか")).toBe(false);
    expect(isDeepQuestion("")).toBe(false);
  });

  it("相手が 意見を 聞いた 行を 見分ける", () => {
    expect(isOpinionAsk("カンボジアの 若い 方は、どうですか")).toBe(true);
    expect(isOpinionAsk("カンボジアの 若い 方は、茶道に 興味を 持って くれると 思いますか")).toBe(
      true,
    );
    expect(isOpinionAsk("作る お金は 800,000円までです。")).toBe(false);
    expect(isOpinionAsk(undefined)).toBe(false);
  });

  it("文の 終わりが「か」「？」なら しつもんの 形", () => {
    expect(looksLikeQuestion("クメール語の ページは どうですか。")).toBe(true);
    expect(looksLikeQuestion("予算は いくらですか？")).toBe(true);
    expect(looksLikeQuestion("若い 人は 値段を 先に 知りたいです。")).toBe(false);
    expect(looksLikeQuestion("クメール語が いいと 思います")).toBe(false);
  });

  it("直前の 相手の 行は、最後の 自分の 行より 前から とる（声は 返事の 書きはじめが 先に 入る）", () => {
    const history = [
      { from: "client", text: "カンボジアの 若い 方は、どうですか" },
      { from: "me", text: "クメール語が いいと 思います。" },
      { from: "client", text: "それは 知りませんでした" },
    ];
    expect(partnerLineBefore(history, "クメール語が いいと 思います。")).toBe(
      "カンボジアの 若い 方は、どうですか",
    );
    // 文字で 送った ときは 自分の 行が まだ 無い → 最後の 相手の 行
    expect(partnerLineBefore(history.slice(0, 1), "若い 人は 値段が 大事です")).toBe(
      "カンボジアの 若い 方は、どうですか",
    );
  });

  it("意見を 聞かれた あとの 答えは カードの 照合に かけない。しつもんで 返したら かける", () => {
    const asked = [{ from: "client", text: "カンボジアの 若い 方は、どうですか" }];
    // 実測の 誤開き（2026-11-04 の R7 検収）: 「お金」で 予算の カードが 開いて いた
    expect(isOpinionAnswer(asked, "若い 人は いくらか 知りたいです。お金が 心配ですから。")).toBe(
      true,
    );
    expect(isOpinionAnswer(asked, "予算は いくらですか")).toBe(false);
    const plain = [{ from: "client", text: "作る お金は 800,000円までです。" }];
    expect(isOpinionAnswer(plain, "わかりました")).toBe(false);
  });
});
