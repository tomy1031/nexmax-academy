import { describe, expect, it } from "vitest";
import {
  endsWithProposal,
  isDeepQuestion,
  isOpinionAnswer,
  isOpinionAsk,
  isQuestionLike,
  looksLikeQuestion,
  OPEN_TALK,
  OPEN_TALK_STYLE,
  partnerLineBefore,
} from "@/components/listening/open-talk";

/*
 * 深く 聞く たいわ（ウェブサイトの 要件定義・2026-11-04 の 指定）。
 * カードは 最低限。深く 聞いた しつもんを ほめて 数え、意見を 聞かれた あとの 答えでは
 * カードを 開けない。例は 2026-11-04 のコード検収で 実測した ものを そのまま 入れて いる。
 */
describe("深く 聞く たいわ", () => {
  it("使う 教材は ウェブサイトの 要件定義の Zoom と、要件定義（STEP11）の 山本社長だけ（ほかの たいわは 変えない）", () => {
    // 2026-11-10 に 要件定義（youken_aoba）を 足した（「もっと自由にいろんな質問ができるように」）
    expect([...OPEN_TALK]).toEqual(["youkenweb_zoom", "youken_aoba"]);
  });

  it("要件定義（STEP11）は 答えを 札に 出さず 自分で メモする。意見は 聞かれない", () => {
    expect(OPEN_TALK_STYLE.get("youken_aoba")).toMatchObject({ selfMemo: true, opinions: false });
    // ウェブサイトの 要件定義は これまでどおり（札に 答え・意見の 数）
    expect(OPEN_TALK_STYLE.get("youkenweb_zoom")).toMatchObject({
      selfMemo: false,
      opinions: true,
    });
  });

  it("しつもんの 形なら 深く なくても 受けとめる。あいづち・お礼は しつもんでは ない", () => {
    expect(isQuestionLike("お店は 何時から 開きますか")).toBe(true);
    expect(isQuestionLike("給料は どのくらいですか？")).toBe(true);
    expect(isQuestionLike("応募の しかたを 教えて ください")).toBe(true);
    expect(isQuestionLike("働く 時間を 知りたいです")).toBe(true);
    expect(isQuestionLike("コンセプトは 何")).toBe(true);
    expect(isQuestionLike("わかりました")).toBe(false);
    expect(isQuestionLike("ありがとうございます。")).toBe(false);
    expect(isQuestionLike("")).toBe(false);
  });

  it("「なぜ」「どんな」「たとえば」の しつもんは 深い しつもん", () => {
    expect(isDeepQuestion("山本社長に お聞きします。なぜ プノンペンですか。")).toBe(true);
    expect(isDeepQuestion("どんな ときに うれしいですか")).toBe(true);
    expect(isDeepQuestion("たとえば、どんな お客様ですか")).toBe(true);
    expect(isDeepQuestion("ほかに 心配な ことは ありますか")).toBe(true);
    expect(isDeepQuestion("ドウシテ ですか")).toBe(true);
    expect(isDeepQuestion("どんな ことが 心配か 教えて ください")).toBe(true);
  });

  it("数や はい・いいえで 終わる しつもん、しつもんで ない 文は 深い しつもんに しない", () => {
    expect(isDeepQuestion("予算は いくらですか")).toBe(false);
    expect(isDeepQuestion("茶道体験は 1日に 何回 ありますか")).toBe(false);
    expect(isDeepQuestion("写真を とっても いいですか")).toBe(false);
    expect(isDeepQuestion("もう少し ゆっくり お願いします")).toBe(false);
    expect(isDeepQuestion("ほかに ありません。ありがとうございました")).toBe(false);
    expect(isDeepQuestion("")).toBe(false);
  });

  it("相手が 意見を 聞いた 行を 見分ける（「いい 意見ですね」は 聞いて いない）", () => {
    expect(isOpinionAsk("カンボジアの 若い 方は、どうですか")).toBe(true);
    expect(isOpinionAsk("カンボジアの 若い 方は、茶道に 興味を 持って くれると 思いますか")).toBe(
      true,
    );
    expect(isOpinionAsk("いい 意見ですね。")).toBe(false);
    expect(isOpinionAsk("作る お金は 800,000円までです。")).toBe(false);
    expect(isOpinionAsk(undefined)).toBe(false);
  });

  it("しつもんの 形と 提案の 形", () => {
    expect(looksLikeQuestion("予算は いくらですか？")).toBe(true);
    expect(looksLikeQuestion("若い 人は 値段を 先に 知りたいです。")).toBe(false);
    expect(endsWithProposal("値段を のせるのは どうでしょうか。")).toBe(true);
    expect(endsWithProposal("値段を のせるのは どうですか")).toBe(true);
    expect(endsWithProposal("予算は いくらですか")).toBe(false);
  });

  it("直前の 相手の 行: 声は 最後の 自分の 行より 前、文字は 最後の 相手の 行", () => {
    const voice = [
      { from: "client", text: "カンボジアの 若い 方は、どうですか" },
      { from: "me", text: "クメール語が いいと 思います。" },
      { from: "client", text: "それは 知りませんでした" },
    ];
    expect(partnerLineBefore(voice, true)?.text).toBe("カンボジアの 若い 方は、どうですか");
    // 文字: 前に 同じ 文を 送って いても 取りちがえない（検収の 実測A）
    const typed = [
      { from: "client", text: "日本語と 英語は かならず 要ります。" },
      { from: "me", text: "クメール語が いいと 思います。" },
      { from: "client", text: "カンボジアの 若い 方は、どうですか" },
    ];
    expect(partnerLineBefore(typed, false)?.text).toBe("カンボジアの 若い 方は、どうですか");
  });

  const asked = [{ from: "client", text: "カンボジアの 若い 方は、どうですか" }];
  const answer = (utterance: string, targetId = "client", history = asked) =>
    isOpinionAnswer({ history, utterance, said: false, targetId });

  it("意見を 聞かれた あとの 答えは カードの 照合に かけない（提案の 形も 答え）", () => {
    // 「お金」で 予算の カードが 開いて いた
    expect(answer("若い 人は いくらか 知りたいです。お金が 心配ですから。")).toBe(true);
    // 教えた 提案の 型で 答えても すり抜けない
    expect(answer("お金が 心配ですから、値段を のせるのは どうですか")).toBe(true);
    expect(answer("クメール語の ページを 作るのは どうでしょうか")).toBe(true);
  });

  it("しつもん・お願い・中身の 無い 返事・ほかの 人への しつもんは 答えに しない", () => {
    expect(answer("予算は いくらですか")).toBe(false);
    expect(answer("予算を 教えて ください。")).toBe(false);
    expect(answer("すみません、わかりません")).toBe(false);
    // 🎤 を 先生へ 切りかえた あとの しつもんは、社長の 問いへの 答えでは ない
    expect(answer("茶道体験は 何回 ありますか", "sasaki")).toBe(false);
    expect(answer("写真は いいと 思います", "sasaki")).toBe(false);
    // 相手が 意見を 聞いて いなければ 答えでは ない
    const plain = [{ from: "client", text: "作る お金は 800,000円までです。" }];
    expect(answer("わかりました", "client", plain)).toBe(false);
  });
});
