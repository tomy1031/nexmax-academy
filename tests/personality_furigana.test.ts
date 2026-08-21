import { describe, expect, it } from "vitest";
import {
  PERSONALITY_AXIS_META,
  PERSONALITY_FAMILIES,
  PERSONALITY_INTRO,
  PERSONALITY_QUESTIONS,
  PERSONALITY_RESULT_READINGS,
  PERSONALITY_TYPES,
  questionReadings,
  type Reading,
} from "@/content/personality";
import { GLOSSARY } from "@/content/glossary";

/**
 * ふりがなの 覆い（AGENTS.md 規律2）を **台帳の側で** 見張る
 *
 * 画面の e2e（tests/e2e/shindan.spec.ts）は 出来上がった 画面を 見るが、
 * そちらは 1回の 通しで 通った 分しか 見えない（20問 × 3言語 を 全部は 踏めない）。
 * ここは 台帳の 全文を 総当たりして、**1文字でも 裸の 漢字が 残っていないか** を見る。
 *
 * 当たり方は `RubyText`（`ReadingsRuby`）と 同じ——**同じ位置で 一致したら 配列で先に
 * 出たほうが 勝つ**。だから ここが 通れば 画面でも 覆えている。
 */

const KANJI = /[々一-鿿]/;

/** `ReadingsRuby` と同じ走査で、ルビが付かずに残る漢字の かたまり を返す。 */
function bareKanjiRuns(text: string, readings: readonly Reading[]): string[] {
  const gaps: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let next: Reading | undefined;
    let nextIndex = text.length;
    for (const reading of readings) {
      const index = text.indexOf(reading.text, cursor);
      if (index >= 0 && index < nextIndex) {
        nextIndex = index;
        next = reading;
      }
    }
    if (!next) {
      gaps.push(text.slice(cursor));
      break;
    }
    if (nextIndex > cursor) gaps.push(text.slice(cursor, nextIndex));
    cursor = nextIndex + next.text.length;
  }

  return gaps
    .flatMap((gap) => gap.split(/[^々一-鿿]+/))
    .filter((run) => run.length > 0 && KANJI.test(run));
}

/** 検査する文（どこの文かが分かる形で持つ。落ちたときに直す場所が分かるように）。 */
interface Line {
  readonly where: string;
  readonly text: string;
  readonly readings: readonly Reading[];
}

const R = PERSONALITY_RESULT_READINGS;

function introLines(): Line[] {
  const lines: Line[] = [];
  for (const [language, intro] of Object.entries(PERSONALITY_INTRO)) {
    if (language === "english") continue;
    for (const text of [
      intro.title,
      intro.note,
      intro.startLabel,
      ...intro.lines,
      ...intro.examples.map((example) => example.text),
    ]) {
      lines.push({ where: `導入（${language}）`, text, readings: R });
    }
  }
  return lines;
}

function resultLines(): Line[] {
  const lines: Line[] = [];
  for (const family of PERSONALITY_FAMILIES) {
    // 家族名だけは 呼び出し側が 家族の読みを 足して渡す（welcome-wizard / nexmax-catalog）。
    lines.push({
      where: `家族「${family.name}」`,
      text: family.name,
      readings: [{ text: family.name, reading: family.reading }, ...R],
    });
    for (const strength of family.strengths) {
      lines.push({ where: `家族「${family.name}」の とくい`, text: strength, readings: R });
    }
  }
  for (const type of PERSONALITY_TYPES) {
    for (const text of [
      type.name,
      type.shortName,
      type.tagline,
      type.teamRole,
      type.teamRoleDetail,
      ...type.analysis,
    ]) {
      lines.push({ where: `タイプ ${type.code}`, text, readings: R });
    }
  }
  for (const meta of Object.values(PERSONALITY_AXIS_META)) {
    for (const text of [meta.question, ...meta.poleLabels, ...meta.poleDescriptions]) {
      lines.push({ where: `軸 ${meta.id}`, text, readings: R });
    }
  }
  return lines;
}

function questionLines(): Line[] {
  const lines: Line[] = [];
  for (const question of PERSONALITY_QUESTIONS) {
    const where = `Q${question.id}`;
    // 設問の読み辞書は **やさしい日本語と日本語の両方** を覆う必要がある。
    // 画面は同じ `question.readings` を どちらのモードでも使うため（welcome-wizard の OptionText）。
    for (const text of [
      question.easy,
      question.japanese,
      question.a.easy,
      question.a.japanese,
      question.b.easy,
      question.b.japanese,
    ]) {
      lines.push({ where, text, readings: questionReadings(question) });
    }
  }
  return lines;
}

function report(lines: readonly Line[]): string[] {
  return lines.flatMap((line) =>
    bareKanjiRuns(line.text, line.readings).map((run) => `${line.where}「${run}」← ${line.text}`),
  );
}

describe("ふりがなの覆い（規律2）", () => {
  it("導入の文に 裸の漢字が 無い", () => {
    expect(report(introLines())).toEqual([]);
  });

  it("結果画面の文（呼び名・ひとこと・分析・チーム役割・軸）に 裸の漢字が 無い", () => {
    expect(report(resultLines())).toEqual([]);
  });

  it("20問の 柱書きと 選択肢に 裸の漢字が 無い（やさしい日本語・日本語の 両方）", () => {
    expect(report(questionLines())).toEqual([]);
  });
});

describe("語彙メモの吹き出し（説明文にも ふりがな）", () => {
  it("意味メモの漢字が 読み辞書で 覆えている", () => {
    // 吹き出しの意味は **むずかしい語から 逃げてきた先**。ここが 裸の漢字だと、
    // いちばん 助けが 要る 学習者が そこで 行き止まりに なる（docs/constraints.md）。
    const lines = GLOSSARY.map((entry) => ({
      where: `語彙メモ「${entry.term}」`,
      text: entry.meaning,
      readings: R,
    }));
    expect(report(lines)).toEqual([]);
  });
});

describe("読み辞書の並び（設問ごとの readings も 先勝ち）", () => {
  it("短い語が 長い語を 食べる 並びに なっていない", () => {
    const offenders: string[] = [];
    for (const question of PERSONALITY_QUESTIONS) {
      // 設問ごとの台帳そのものを見る（つないだあとは questionReadings が長さ順に直す）。
      question.readings.forEach((entry, index) => {
        const shadowedBy = question.readings
          .slice(0, index)
          .find((earlier) => earlier.text !== entry.text && entry.text.startsWith(earlier.text));
        if (shadowedBy) {
          offenders.push(`Q${question.id}: ${entry.text} は ${shadowedBy.text} に食われる`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
