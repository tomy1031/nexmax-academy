/**
 * 聞き取り専用の 読みの 台帳（src/content/listening-sounds.ts）の 見張り
 *
 * 2026-09-28 の 指定「ひらがなでも 漢字ありでも どちらも 正しく 機能するように、
 * パターンを しっかり 登録」。台帳に 載せた 教材は、**原稿の 数字・英字の 語が
 * ぜんぶ 読みを 持って いる**ことと、**キーワードが 漢字でも かなでも 当たる**ことを
 * 機械で 見る——1語 抜けると、その 語だけ かなで 打つと 永久に 外れる。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Tokenizer } from "kuromoji";
import { matchReading } from "../scripts/lib/speech_reading";
import { getTokenizer } from "../scripts/lib/yomi_check";
import { LISTENING_SOUNDS_LIKE } from "../src/content/listening-sounds";
import { annotateRuby, buildFuriganaIndex, kanaOf } from "../src/lib/text/furigana";
import {
  buildSoundsIndex,
  createListening,
  submitListening,
} from "../src/components/listening/listening-checks";

interface ListeningJson {
  readonly script: readonly { readonly text: string }[];
  readonly keywords: readonly string[];
  readonly furigana?: readonly (readonly [string, string])[];
  readonly check: { readonly minLength: number; readonly maxMiss: number };
}

function load(id: string): ListeningJson {
  return JSON.parse(readFileSync(join("content", "listening", `${id}.json`), "utf8"));
}

/** 字母を 1つずつ 読む 略語（CSV・API・AWS）。`spellLatin` が 開くので 台帳は 要らない。 */
const SPELLED_ACRONYM = /^[A-Z]{2,4}$/;

describe("聞き取り専用の 読みの 台帳", () => {
  const ids = Object.keys(LISTENING_SOUNDS_LIKE);

  it("台帳の 教材は ぜんぶ 実在する", () => {
    for (const id of ids) {
      expect(existsSync(join("content", "listening", `${id}.json`)), id).toBe(true);
    }
  });

  it("読みは ひらがな（と ー）だけ", () => {
    for (const [id, entries] of Object.entries(LISTENING_SOUNDS_LIKE)) {
      for (const [surface, reading] of entries) {
        expect(reading, `${id}: ${surface}`).toMatch(/^[ぁ-ゖー]+$/);
      }
    }
  });

  describe.each(ids)("%s", (id) => {
    const listening = load(id);
    const transcript = listening.script.map((line) => line.text).join("\n");
    const furigana = buildFuriganaIndex(listening.furigana ?? []);
    const sounds = buildSoundsIndex(LISTENING_SOUNDS_LIKE[id]);
    const rules = { minLength: listening.check.minLength, maxMiss: listening.check.maxMiss };
    const fresh = () => createListening(transcript, listening.keywords, rules, furigana, sounds);

    it("原稿の 数字・英字の 語は ぜんぶ 読みを 持つ（字母読みの 略語を のぞく）", () => {
      // 台帳の 表記に 当たる ところを 消してから、残った 数字・英字を 数える
      let rest = transcript;
      const surfaces = [...(LISTENING_SOUNDS_LIKE[id] ?? [])]
        .map(([surface]) => surface)
        .sort((a, b) => b.length - a.length);
      for (const surface of surfaces) rest = rest.split(surface).join("　");
      const leftovers = (rest.match(/[A-Za-z0-9０-９Ａ-Ｚａ-ｚ]+/g) ?? []).filter(
        (word) => !SPELLED_ACRONYM.test(word),
      );
      expect(leftovers).toEqual([]);
    });

    it("キーワードは 書かれた 形でも かなでも 見つかる", () => {
      for (const keyword of listening.keywords) {
        expect(submitListening(fresh(), keyword).foundKeywords, keyword).toContain(keyword);
        const kana = kanaOf(keyword, furigana);
        expect(kana, `${keyword} の 読みが 引けない`).not.toBeNull();
        const byKana = submitListening(fresh(), kana!);
        expect(byKana.foundKeywords, `${keyword} を「${kana}」で`).toContain(keyword);
      }
    });

    it("台帳の 読みは ぜんぶ かなで 打って 当たる（原稿に ある 表記の ぶん）", () => {
      for (const [surface, reading] of LISTENING_SOUNDS_LIKE[id] ?? []) {
        if (!transcript.includes(surface)) continue;
        const kind = submitListening(fresh(), reading).log[0]?.kind;
        expect(["partial", "keyword", "hiragana", "contains"], `${surface}→${reading}`).toContain(
          kind,
        );
      }
    });

    it("原稿の 漢字の 語は ぜんぶ かなで 打って 当たる（読み辞書の 読み）", () => {
      const missed: string[] = [];
      for (const line of listening.script) {
        for (const segment of annotateRuby(line.text, furigana)) {
          if (!segment.reading || segment.reading.length < rules.minLength) continue;
          const kind = submitListening(fresh(), segment.reading).log[0]?.kind;
          if (!["partial", "keyword", "hiragana", "contains"].includes(kind ?? "")) {
            missed.push(`${segment.text}→${segment.reading}（${kind}）`);
          }
        }
      }
      expect(missed).toEqual([]);
    });
  });
});

describe("音づくりの 読み比べも 同じ 台帳を 通す（scripts/lib/speech_reading.ts）", () => {
  let tokenizer: Tokenizer;
  beforeAll(async () => {
    tokenizer = await getTokenizer();
  }, 60_000);

  const cases: readonly (readonly [string, string, string])[] = [
    [
      "houkoku_chousa_listening",
      "100GB 保存すると、料金は 月に だいたい 360円です。",
      "100ギガバイト保存すると、料金は月にだいたい三百六十円です。",
    ],
    [
      "houkoku_chousa_listening",
      "今回は、S3を 使う 方が よいと 思います。",
      "今回は、エススリーを使う方がよいと思います。",
    ],
    [
      "houkoku_chourei_listening",
      "商品詳細機能 全体の 進捗は、80％です。",
      "商品詳細機能全体の進捗は、80パーセントです。",
    ],
    [
      "houkoku_shougai_listening",
      "今日の 10時ごろから、一部の ユーザーが 予約できない 問題が 発生して います。",
      "今日の十時頃から、一部のユーザーが予約できない問題が発生しています。",
    ],
    [
      "houkoku_kanryou_listening",
      "GitHubの Issueを 作ったので、内容を 確認して ください。",
      "ギットハブのイシューを作ったので、内容を確認してください。",
    ],
  ];

  it.each(cases)(
    "%s: 文字起こしの 書きかたが ちがっても 読みが 同じなら 通す",
    (id, text, heard) => {
      const listening = load(id);
      const match = matchReading(
        text,
        heard,
        buildFuriganaIndex(listening.furigana ?? []),
        tokenizer,
        buildSoundsIndex(LISTENING_SOUNDS_LIKE[id]),
      );
      expect(match.why).toBe("読みが ぴったり 一致");
    },
  );

  it("読み飛ばしは 台帳を 通しても 落とす（360円 を 言わなかった）", () => {
    const id = "houkoku_chousa_listening";
    const listening = load(id);
    const match = matchReading(
      "料金は 月に だいたい 360円です。",
      "料金は月にだいたいです。",
      buildFuriganaIndex(listening.furigana ?? []),
      tokenizer,
      buildSoundsIndex(LISTENING_SOUNDS_LIKE[id]),
    );
    expect(match.ok).toBe(false);
  });
});
