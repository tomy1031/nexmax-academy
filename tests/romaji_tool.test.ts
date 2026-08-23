/**
 * ローマ字入力れんしゅう（public/tools/romaji）の教材データを機械で確かめる。
 *
 * この教材は React ではなく **1枚の静的なページ**なので、アプリの検査
 *（`npm run lint:content`）が中身を見ない。見ないぶん、ここで見る。
 *
 * 見るのは2つ:
 *  1. **打ち方が読みと合っているか** — 画面に出る `romaji` のとおりに打ったとき、
 *     ほんとうに `reading` の かな に なるか。ここがずれていると、学習者は
 *     ヒントのとおり打ったのに先へ進めない（いちばん心の折れる壊れ方）。
 *  2. **読めない漢字が残っていないか** — 説明文の漢字が読み辞書で覆えているか
 *     （AGENTS.md 規律2 と同じ検査を、同じ関数で行う）。
 */

import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { buildFuriganaIndex, uncoveredKanji } from "@/lib/text/furigana";
// 静的ページの素の JS モジュール（tsconfig の allowJs で そのまま 読める）
import {
  FURIGANA,
  GLOSSARY,
  LESSONS,
  MESSAGES,
  SCREEN_TEXT,
} from "../public/tools/romaji/lessons.js";
// 同上（じゅんびのマニュアル）
import { MANUAL } from "../public/tools/romaji/manual.js";

interface PracticeItem {
  show: string;
  reading: string;
  romaji: string;
  en?: string;
}

interface Block {
  kind: string;
  text?: string;
  title?: string;
  items?: unknown[];
}

interface Lesson {
  id: string;
  chapter: string;
  title: string;
  lead: string;
  blocks: Block[];
  items: PracticeItem[];
}

interface ManualStep {
  title: string;
  text: string;
  art: string | null;
}

interface ManualPlatform {
  id: string;
  name: string;
  icon: string;
  steps: ManualStep[];
}

const lessons = LESSONS as Lesson[];
const manual = MANUAL as ManualPlatform[];
const screenText = SCREEN_TEXT as Record<string, string>;
const messages = MESSAGES as Record<string, string>;

/** 学習者が読む文を、この教材のぜんぶから 集める。 */
function learnerTexts(): string[] {
  const texts: string[] = [...Object.values(screenText), ...Object.values(messages)];
  for (const lesson of lessons) {
    texts.push(lesson.title, lesson.lead);
    for (const block of lesson.blocks) {
      if (block.text) texts.push(block.text);
      if (block.title) texts.push(block.title);
      if (block.kind === "steps" || block.kind === "list") {
        for (const item of (block.items ?? []) as string[]) texts.push(item);
      }
    }
    for (const item of lesson.items) texts.push(item.show);
  }
  for (const platform of manual) {
    for (const step of platform.steps) texts.push(step.title, step.text);
  }
  return texts;
}

/* ------------------------------------------------------------------ *
 * ローマ字 → かな（IME と同じ読み替え）
 * ------------------------------------------------------------------ */

/**
 * IME が受け取る主な打ち方。1つの かな に 2つ以上の 打ち方が あるものは
 * どちらも 入れてある（si / shi など）。
 */
const ROMAJI: Record<string, string> = {
  a: "あ",
  i: "い",
  u: "う",
  e: "え",
  o: "お",
  ka: "か",
  ki: "き",
  ku: "く",
  ke: "け",
  ko: "こ",
  sa: "さ",
  si: "し",
  shi: "し",
  su: "す",
  se: "せ",
  so: "そ",
  ta: "た",
  ti: "ち",
  chi: "ち",
  tu: "つ",
  tsu: "つ",
  te: "て",
  to: "と",
  na: "な",
  ni: "に",
  nu: "ぬ",
  ne: "ね",
  no: "の",
  ha: "は",
  hi: "ひ",
  hu: "ふ",
  fu: "ふ",
  he: "へ",
  ho: "ほ",
  ma: "ま",
  mi: "み",
  mu: "む",
  me: "め",
  mo: "も",
  ya: "や",
  yu: "ゆ",
  yo: "よ",
  ra: "ら",
  ri: "り",
  ru: "る",
  re: "れ",
  ro: "ろ",
  wa: "わ",
  wi: "うぃ",
  we: "うぇ",
  wo: "を",
  nn: "ん",
  "n'": "ん",
  ga: "が",
  gi: "ぎ",
  gu: "ぐ",
  ge: "げ",
  go: "ご",
  za: "ざ",
  zi: "じ",
  ji: "じ",
  zu: "ず",
  ze: "ぜ",
  zo: "ぞ",
  da: "だ",
  di: "ぢ",
  du: "づ",
  de: "で",
  do: "ど",
  ba: "ば",
  bi: "び",
  bu: "ぶ",
  be: "べ",
  bo: "ぼ",
  pa: "ぱ",
  pi: "ぴ",
  pu: "ぷ",
  pe: "ぺ",
  po: "ぽ",
  kya: "きゃ",
  kyu: "きゅ",
  kyo: "きょ",
  sya: "しゃ",
  syu: "しゅ",
  syo: "しょ",
  sha: "しゃ",
  shu: "しゅ",
  sho: "しょ",
  tya: "ちゃ",
  tyu: "ちゅ",
  tyo: "ちょ",
  cha: "ちゃ",
  chu: "ちゅ",
  cho: "ちょ",
  nya: "にゃ",
  nyu: "にゅ",
  nyo: "にょ",
  hya: "ひゃ",
  hyu: "ひゅ",
  hyo: "ひょ",
  mya: "みゃ",
  myu: "みゅ",
  myo: "みょ",
  rya: "りゃ",
  ryu: "りゅ",
  ryo: "りょ",
  gya: "ぎゃ",
  gyu: "ぎゅ",
  gyo: "ぎょ",
  zya: "じゃ",
  zyu: "じゅ",
  zyo: "じょ",
  ja: "じゃ",
  ju: "じゅ",
  jo: "じょ",
  bya: "びゃ",
  byu: "びゅ",
  byo: "びょ",
  pya: "ぴゃ",
  pyu: "ぴゅ",
  pyo: "ぴょ",
  fa: "ふぁ",
  fi: "ふぃ",
  fe: "ふぇ",
  fo: "ふぉ",
  thi: "てぃ",
  dhi: "でぃ",
  la: "ぁ",
  li: "ぃ",
  lu: "ぅ",
  le: "ぇ",
  lo: "ぉ",
  xa: "ぁ",
  xi: "ぃ",
  xu: "ぅ",
  xe: "ぇ",
  xo: "ぉ",
  lya: "ゃ",
  lyu: "ゅ",
  lyo: "ょ",
  ltu: "っ",
  xtu: "っ",
  "-": "ー",
};

const VOWELS = new Set(["a", "i", "u", "e", "o"]);

/** 打った文字を、IME が出す かな に する。読めない並びは `?` を混ぜて返す。 */
export function toKana(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const three = input.slice(i, i + 3);
    const two = input.slice(i, i + 2);
    const one = input[i] ?? "";

    if (ROMAJI[three]) {
      out += ROMAJI[three];
      i += 3;
      continue;
    }
    if (ROMAJI[two]) {
      out += ROMAJI[two];
      i += 2;
      continue;
    }
    // 促音: 同じ子音が2つ続く（「っ」＋その子音）。n は「ん」なので外す
    if (one !== "n" && !VOWELS.has(one) && input[i + 1] === one) {
      out += "っ";
      i += 1;
      continue;
    }
    // 「ん」: n のあとが 母音でも y でもなければ、その n は「ん」
    if (one === "n") {
      const next = input[i + 1] ?? "";
      if (next === "" || (!VOWELS.has(next) && next !== "y")) {
        out += "ん";
        i += 1;
        continue;
      }
    }
    if (ROMAJI[one]) {
      out += ROMAJI[one];
      i += 1;
      continue;
    }
    out += "?";
    i += 1;
  }
  return out;
}

describe("ローマ字→かな の 読み替え", () => {
  it("よくある打ち方を IME と同じ かな にする", () => {
    expect(toKana("aiueo")).toBe("あいうえお");
    expect(toKana("shi")).toBe("し");
    expect(toKana("si")).toBe("し");
    expect(toKana("gakkou")).toBe("がっこう");
    expect(toKana("honn")).toBe("ほん");
    expect(toKana("ra-menn")).toBe("らーめん");
    expect(toKana("kyakyukyo")).toBe("きゃきゅきょ");
    expect(toKana("pa-thi-")).toBe("ぱーてぃー");
  });
});

describe("れんしゅうの データ", () => {
  it("ヒントの ローマ字を そのまま 打つと、読みの かな に なる", () => {
    const wrong: string[] = [];
    for (const lesson of lessons) {
      for (const item of lesson.items) {
        const kana = toKana(item.romaji);
        if (kana !== item.reading) {
          wrong.push(
            `${lesson.id} / ${item.show}: ${item.romaji} → ${kana}（ほしい: ${item.reading}）`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("かなの問題は、見せる文と 読みが 同じ（カタカナ表記は たたんでくらべる・漢字の課だけ 別）", () => {
    /*
     * カタカナ語は **カタカナのまま**見せる（「ラーメン」）。実務で 目にする 形が
     * ひらがなでは ないからで、打つのは ひらがなでも 正解になる（app.js の normalize が
     * カタカナを たたむ）。だから ここも 同じ たたみ方で くらべる。
     */
    const fold = (text: string) =>
      text.replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
    const mismatched = lessons
      .filter((lesson) => lesson.id !== "kanji")
      .flatMap((lesson) =>
        lesson.items
          .filter((item) => fold(item.show) !== item.reading)
          .map((item) => `${lesson.id} / ${item.show} ≠ ${item.reading}`),
      );
    expect(mismatched).toEqual([]);
  });

  it("問題の ある レッスンには 説明が ついている", () => {
    for (const lesson of lessons) {
      expect(lesson.title.length).toBeGreaterThan(0);
      expect(lesson.lead.length).toBeGreaterThan(0);
    }
  });

  it("レッスンの id が 重複しない", () => {
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("学習者に見せる文（規律1）", () => {
  /*
   * この教材は content/ の JSON では ないので `lint:content` の 禁止語検査が 届かない。
   * 検査の 目を ここに 移す——フィードバックの 文言は app.js ではなく
   * lessons.js の MESSAGES に 置く 決まりにして、まとめて 走査する。
   */
  it("禁止語（不正解・間違い・ダメ）を つかっていない", () => {
    const hits: string[] = [];
    for (const text of learnerTexts()) {
      for (const word of FORBIDDEN_LEARNER_WORDS) {
        if (text.includes(word)) hits.push(`「${word}」: ${text}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("国名「タイ」を つかっていない（規律9）", () => {
    /*
     * 判定は アプリと **同じ関数** を 呼ぶ。ここで 正規表現を 書き写すと、
     * 規律が 変わった とき 片方だけ 古いまま 残る（2026-08-23 に 実際 そうなった）。
     */
    expect(checkCountryNamesInTexts("public/tools/romaji", learnerTexts())).toEqual([]);
  });
});

describe("読めない漢字が 残っていない（規律2）", () => {
  it("学習者が読む文の漢字は、ぜんぶ 読み辞書で 覆えている", () => {
    const index = buildFuriganaIndex(FURIGANA as [string, string][]);
    /*
     * タイトル画面・フィードバック・じゅんびの マニュアルも 同じ 検査に かける。
     * ここが 抜けると、**つまずいている人が 読む文だけ** ルビの 覆いから こぼれる。
     */
    const texts = learnerTexts();

    const missing = new Set<string>();
    for (const text of texts) {
      for (const kanji of uncoveredKanji(text, index)) missing.add(kanji);
    }
    expect([...missing]).toEqual([]);
  });

  it("マニュアルは 端末ごとに 手順と 図を 持つ", () => {
    expect(manual.length).toBeGreaterThanOrEqual(3);
    for (const platform of manual) {
      expect(platform.steps.length).toBeGreaterThan(0);
      for (const step of platform.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.text.length).toBeGreaterThan(0);
        // 図は 省略できるが、あるなら SVG であること（画面に 生の 文字列が 出ない）
        if (step.art !== null) expect(step.art.startsWith("<svg")).toBe(true);
      }
    }
  });

  it("ことばの意味（英語）は 読み辞書にも ある語だけを 説明する", () => {
    const known = new Set((FURIGANA as [string, string][]).map(([surface]) => surface));
    const orphan = (GLOSSARY as [string, string][])
      .map(([term]) => term)
      .filter((term) => /[㐀-鿿々]/.test(term) && !known.has(term));
    expect(orphan).toEqual([]);
  });
});
