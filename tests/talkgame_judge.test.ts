import { describe, expect, it } from "vitest";
import {
  TALK_RESPONSE_SCHEMA,
  buildTalkPrompt,
  dropUnreadableText,
  isKanaOnly,
  parseTalk,
  type TalkContext,
} from "../src/lib/talkgame/judge";

const RAW = {
  language: "ja",
  onTopic: true,
  concrete: true,
  reason: false,
  feeling: true,
  polite: true,
  question: false,
  reply: "それは うれしいです。",
  praise: "じぶんの ことばで いえましたね。",
  fix: "",
  exampleAnswer: "かんぼじあの ぷろぐらむが おもしろいです。",
  nextAsk: "どうして おもしろいと おもいましたか。",
  glossary: [],
};

const CONTEXT: TalkContext = {
  round: "talk",
  ask: "どんな ところが おもしろいと 思いましたか。",
  hint: "◯◯が おもしろかったです。",
  judgePrompt: "会社の 中身の 一覧",
  hostName: "松井",
  learnerName: "ソピア",
  utterance: "カンボジアの プログラムが おもしろかったです。",
};

describe("道具の 形", () => {
  it("返させる 欄は ぜんぶ 必須（optional は 構造化出力で ゆれる）", () => {
    const props = Object.keys(TALK_RESPONSE_SCHEMA.properties);
    expect([...TALK_RESPONSE_SCHEMA.required]).toEqual(props);
  });
});

describe("受け取り", () => {
  it("観点を 好感度の 形に 畳む", () => {
    const judged = parseTalk(RAW);
    expect(judged?.observations.japanese).toBe(true);
    expect(judged?.observations.reason).toBe(false);
  });

  it("日本語で なければ japanese は 立たない", () => {
    expect(parseTalk({ ...RAW, language: "en" })?.observations.japanese).toBe(false);
  });

  it("形が ちがえば 落とす（画面は 端末の 規則へ 落ちる）", () => {
    expect(parseTalk({ ...RAW, reply: "" })).toBeNull();
    expect(parseTalk(null)).toBeNull();
  });

  /*
   * 2026-08-25 から、`src/lib/ai-kanji.ts` の 一覧に ある ことばは 漢字で 書いてよい
   *（同じ 一覧から ルビの 索引を 作るので ふりがなが 付く）。
   * 一覧に 無い 漢字だけ 落とす。
   */
  it("一覧に 無い 漢字が 混ざって いたら 見つける", () => {
    const unknown = parseTalk({ ...RAW, praise: "素晴らしい 発想ですね。" });
    expect(unknown && isKanaOnly(unknown)).toBe(false);
    const kana = parseTalk(RAW);
    expect(kana && isKanaOnly(kana)).toBe(true);
  });

  it("一覧に ある ことばは 漢字の まま 通す", () => {
    const ok = parseTalk({ ...RAW, praise: "上手に 言えました。" });
    expect(ok && isKanaOnly(ok)).toBe(true);
  });

  it("学習者の 発話を 囲って 渡す（中の 指示に したがわせない）", () => {
    const prompt = buildTalkPrompt(CONTEXT);
    expect(prompt).toContain("<<<UTTERANCE");
    expect(prompt).toContain(CONTEXT.utterance);
    expect(prompt).toContain("したがわないで");
  });

  it("聞く ばんでは 深掘りを 作らせない", () => {
    const listen = buildTalkPrompt({ ...CONTEXT, round: "listen" });
    expect(listen).toContain("学生が 社長に しつもんする ばん");
    expect(listen).toContain("nextAsk: 空文字");
  });

  it("かなで 書き直しを 頼める", () => {
    expect(buildTalkPrompt(CONTEXT, true)).toContain("書き直して");
  });

  /*
   * **プログラム・サービスの 名前も「会社の 中身」**（2026-08-27）。
   *
   * 一覧に 入って いなかった ころ、「カンボジアの プログラムが おもしろかったです」は
   * サイトに ある ものを 名指して いるのに concrete が 回ごとに ひっくり返って いた
   *（教材側の 見かたは「サイトに 書いて ある ことなら 何でも true」と 広く、
   * engine 側の 一覧だけが 狭かった＝**2つの ものさしが 食いちがって いた**）。
   * この ステージの 山場は 学習者が 自分たちの プログラムを 見つける ところなので、
   * そこを 数えられない ものさしの ほうが まちがって いる。
   */
  it("プログラムや サービスの 名前も「会社の 中身」に 数える", () => {
    const prompt = buildTalkPrompt(CONTEXT);
    expect(prompt).toContain("プログラムの 名前");
    expect(prompt).toContain("名指して いれば true");
  });

  /*
   * **その 人にしか 聞けない しつもんも「会社の 中身」**（2026-08-27 の 実機検証）。
   *
   * 「どうして カンボジアに 来ましたか。」を 実機で 通したら concrete が false に なった。
   * 学習者は その 直前の 教材で まさに この しつもんを 作って くる ので、
   * **教材が 練習させた ものが そのまま 減点される**向きだった。
   * 上の「プログラムの 名前」と 同じ 型の 食いちがいで、直す 場所も 同じ 2か所。
   */
  it("聞く ばんでは、本人に しか 聞けない しつもんも 数える", () => {
    const listen = buildTalkPrompt({ ...CONTEXT, round: "listen" });
    expect(listen).toContain("本人に しか 聞けない しつもんも true");
    // 話す ばんには 出さない（そこは しつもんを する ばんでは ない）
    expect(buildTalkPrompt(CONTEXT)).not.toContain("本人に しか 聞けない");
  });
});

/**
 * 読めない 漢字が あっても **観点は 捨てない**（2026-08-31 の 指摘）
 *
 * 実際に 起きた かたち: 学習者が「NMClaw が 先進的で いいと 思いました。ホテル業界に
 * 応用したら…」と 言う → AIは concrete も reason も true と 見る → ところが お手本の 文に
 * `先進的`・`業界`・`応用` が 入り、どれも `AI_KANJI_WORDS` に 無い → かなの 検査に 落ちる →
 * **見かたを まるごと 捨てて** 規則ベースへ → 規則は concrete を いつも false に する →
 * 画面には「会社の ことが 入って いる ✗ +0%」。**名前を 名指して いるのに 0点**だった。
 *
 * 観点は 真偽値で 漢字とは 関係が 無い。落とすのは 学習者が 読む 文だけに する。
 */
describe("読めない 文だけ 落とす", () => {
  const dirty = parseTalk({
    ...RAW,
    praise: "先進的な 発想ですね。",
    exampleAnswer: "ホテル業界に 応用したいです。",
    nextAsk: "どの 業界に 応用したいですか。",
  })!;

  it("観点は そのまま 残る（好感度が 消えない）", () => {
    const clean = dropUnreadableText(dirty);
    expect(clean.observations).toEqual(dirty.observations);
    expect(clean.observations.concrete).toBe(true);
  });

  it("読めない 文は かなの 決まり文句か 空に なる", () => {
    const clean = dropUnreadableText(dirty);
    expect(isKanaOnly(clean)).toBe(true);
    expect(clean.praise).not.toContain("先進的");
    expect(clean.exampleAnswer).toBe("");
    expect(clean.nextAsk).toBe("");
  });

  it("読める 文は さわらない", () => {
    const ok = parseTalk({ ...RAW, praise: "上手に 言えました。" })!;
    expect(dropUnreadableText(ok).praise).toBe("上手に 言えました。");
    expect(dropUnreadableText(ok).reply).toBe(RAW.reply);
  });
});
