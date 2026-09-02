import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_KANJI_FURIGANA, unknownKanji, usesOnlyAllowedKanji } from "@/lib/ai-kanji";
import { annotateRuby, buildFuriganaIndex } from "@/lib/text/furigana";

/**
 * AIが 漢字で 書いてよい ことば — **教材が 書かせる ことばと そろって いるか**
 *
 * ## なぜ この 検査が 要るか（2026-08-27 の 実機検証）
 * AIの 返しは 学習者の ことばを 写す。その 学習者の ことばは 教材が 与えて いる。
 * だから **教材が 書かせる ことばを AIが 書けない**と、こう なる:
 *
 *   学習者が 型文どおり 書く → AIが お手本で 同じ ことばを 返す →
 *   かなの 検査に 引っかかる → 1回 言い直させる → また 引っかかる →
 *   `kanaRetryFailed` で **見かたを まるごと 捨てて 規則ベースに 落ちる**
 *
 * 画面には 何も 断りが 出ない。好感度も 札の ラベルも 規則ベースの ものに 変わる。
 * 実機では「私は チームで 話す ことが 得意です。」の ターンが **2回とも** 落ちた
 *（`私` も `得意` も 一覧に 無かった）。
 *
 * 一覧を 手で 足すだけでは また ずれる ので、**教材の ことばで 引き当てる**。
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

describe("AIが 書ける ことば", () => {
  /**
   * 対話ゲームの 教材が 学習者に 書かせる 文。**型文と 設問**を 見る——
   * ここに 出て くる ことばが、そのまま 学習者の 口に 入る。
   */
  const learnerWords = (): string[] => {
    const meeting = read("content/meetings/kaisha_matsui.json");
    const quiz = read("content/quizsets/kaisha_omoshiroi.json");
    return [
      ...(meeting.talkGame?.talkHints ?? []),
      // 型文と お手本は しつもんの 中へ 移った（2026-09-01）。**両方 見る**——
      // 片方だけに すると、移した ときに 見張りが 黙って 外れる
      // 型文は **文ごとに 1つ**の 並び（2026-09-02）。1本ずつ ばらして 見る
      ...(meeting.talkGame?.openers ?? []).flatMap((one: { hint?: string[]; example?: string }) => [
        ...(one.hint ?? []),
        one.example ?? "",
      ]),
      ...(meeting.talkGame?.listenHints ?? []),
      ...quiz.questions.map((q: { q: string }) => q.q),
    ];
  };

  it("引き当てる 教材が 空で ない（検査が 空回りして いない）", () => {
    expect(learnerWords().length).toBeGreaterThan(5);
  });

  /*
   * ぜんぶの 漢字を 求めない。設問文には 教材だけの ことば（「調査シート」など）も
   * 混ざり、それは AIが 書く 文には 出て こない。見張るのは **型文**——
   * 学習者が そのまま 写して 話す 文である。
   */
  it("型文の 漢字は AIも 書ける（写した 返しが 落ちない）", () => {
    const meeting = read("content/meetings/kaisha_matsui.json");
    const hints: string[] = [
      ...(meeting.talkGame?.talkHints ?? []),
      // 型文と お手本は しつもんの 中へ 移った（2026-09-01）。**両方 見る**——
      // 片方だけに すると、移した ときに 見張りが 黙って 外れる
      ...(meeting.talkGame?.openers ?? []).flatMap((one: { hint?: string[]; example?: string }) => [
        ...(one.hint ?? []),
        one.example ?? "",
      ]),
      ...(meeting.talkGame?.listenHints ?? []),
    ];
    for (const hint of hints) {
      expect(unknownKanji(hint), `型文「${hint}」に AIが 書けない 漢字がある`).toEqual([]);
    }
  });

  it("相手役の 名前を 書ける（名のる たびに 落ちない）", () => {
    const meeting = read("content/meetings/kaisha_matsui.json");
    expect(usesOnlyAllowedKanji(`${meeting.host.name}です。`)).toBe(true);
  });

  /*
   * 実機で 落ちた その 文。ここが 緑なら、あの ターンは もう 規則ベースに 落ちない。
   */
  it("実機で 落ちた 文が 通る（2026-08-27 の 回帰）", () => {
    expect(usesOnlyAllowedKanji("私は チームで 話す ことが 得意です。")).toBe(true);
    expect(usesOnlyAllowedKanji("あなたの 気持ちが よく 伝わりました。")).toBe(true);
  });

  it("一覧に 無い 漢字は やはり 落とす（検査が ゆるく なって いない）", () => {
    expect(usesOnlyAllowedKanji("彼は 弁護士です。")).toBe(false);
  });
});

/**
 * 足した ことばが **ルビの 索引でも 正しく 読まれる**か。
 *
 * この 一覧は AIへの 指示と ルビの 索引の 両方に 使われる（最長一致）。
 * 短い ことばを 先に 足すと、長い ことばが そこで 切れて 読みが 崩れる——
 * 「気持ち」を「気」＋「持」に 割ると、画面には 別の 読みが 出る。
 */
describe("足した ことばの 読み", () => {
  const index = buildFuriganaIndex([...AI_KANJI_FURIGANA]);
  const ruby = (text: string) =>
    annotateRuby(text, index)
      .map((seg) => ("reading" in seg ? `${seg.text}(${seg.reading})` : seg.text))
      .join("");

  it("長い ことばが 先に 当たる", () => {
    expect(ruby("気持ち")).toBe("気持ち(きもち)");
    expect(ruby("外国語")).toBe("外国語(がいこくご)");
    expect(ruby("日本人")).toBe("日本人(にほんじん)");
  });

  /*
   * **動詞の 語幹が 1文字の 名詞に 取られない か**（2026-08-28 の 指摘）。
   *
   * 上 を 許して いる ので AIは「力を 上げる」と 書く。索引に 上=うえ しか
   * 無いと、画面には **上うえげる** と 出た。「うえげる」は ことばでは ない——
   * 学習者は そこで 読むのを やめる。
   */
  it("送りがなの ある 動詞は 語幹で 当たる（上うえげる を 出さない）", () => {
    expect(ruby("力を 上げる")).toBe("力(ちから)を 上げ(あげ)る");
    expect(ruby("上げて ください")).toBe("上げ(あげ)て ください");
    expect(ruby("気持ちが 上がりました")).toBe("気持ち(きもち)が 上が(あが)りました");
    // 「上手」「上」は これまでどおり
    expect(ruby("上手です")).toBe("上手(じょうず)です");
    expect(ruby("上の 文")).toBe("上(うえ)の 文");
  });

  it("読みは かなだけ（ルビに 漢字を 出さない）", () => {
    for (const [surface, reading] of AI_KANJI_FURIGANA) {
      expect(/[一-鿿々]/u.test(reading), `${surface} の 読み「${reading}」に 漢字がある`).toBe(
        false,
      );
    }
  });
});
