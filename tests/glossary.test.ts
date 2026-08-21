import { describe, expect, it } from "vitest";
import { GLOSSARY, findGlossaryTerm, getGlossaryEntry } from "../src/content/glossary";
import {
  PERSONALITY_FAMILIES,
  PERSONALITY_INTRO,
  PERSONALITY_QUESTIONS,
  PERSONALITY_RESULT_READINGS,
  PERSONALITY_TYPES,
} from "../src/content/personality";

describe("語彙メモ台帳（07 §2.5）", () => {
  it("60語あり、表記が重複しない", () => {
    expect(GLOSSARY).toHaveLength(60);
    expect(new Set(GLOSSARY.map((entry) => entry.term)).size).toBe(GLOSSARY.length);
  });

  it("すべての語に読みと意味と英語（対訳・説明）がある", () => {
    for (const entry of GLOSSARY) {
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.reading.length).toBeGreaterThan(0);
      expect(entry.meaning.length).toBeGreaterThan(0);
      expect(entry.englishTerm.length).toBeGreaterThan(0);
      expect(entry.englishMeaning.length).toBeGreaterThan(0);
    }
  });

  it("英語は日本語を含まない（受け皿が日本語で書かれていたら意味が無い）", () => {
    const japanese = /[ぁ-んァ-ヶ一-鿿]/;
    for (const entry of GLOSSARY) {
      // 「「こう しませんか」と 言う こと」のような引用は例外にせず、
      // 英語欄そのものが日本語で書かれていないかを見る。
      expect(entry.englishMeaning.replace(/「[^」]*」/g, "")).not.toMatch(japanese);
      expect(entry.englishTerm).not.toMatch(japanese);
    }
  });

  it("englishTerm は説明ではなく見出し（チップに並べるので短く保つ）", () => {
    // 長い英文を入れると、ことばメモのチップが1行に収まらず設問カードを押し出す。
    // また「対訳で足りた人はそこで戻れる」という段の役目も果たさなくなる。
    for (const entry of GLOSSARY) {
      expect(entry.englishTerm.length).toBeLessThanOrEqual(20);
      expect(entry.englishTerm).not.toMatch(/[.。—]/);
    }
  });

  it("englishTerm と englishMeaning が同じ文言になっていない", () => {
    // 分割し忘れると、吹き出しに同じ英語が2回出る。
    for (const entry of GLOSSARY) {
      expect(entry.englishMeaning).not.toBe(entry.englishTerm);
    }
  });

  it("英語は本文には出ない（本文に出す語は term だけ）", () => {
    // english は説明であって表記ではない。term に英字が混ざっていないことで担保する。
    for (const entry of GLOSSARY) {
      expect(entry.term).not.toMatch(/[A-Za-z]/);
    }
  });

  it("漢字のある語は term を漢字で持つ（ひらがなに開かない）", () => {
    // ひらがなに開いても意味は出ない、というのがこの機構の前提（§2.5）。
    // kanji を持つ語は本文でも漢字で書き、ふりがなは reading から合成する。
    const kanaOnlyByDesign = new Set(["おもいやり", "おせわ", "おうえん", "よそう"]);
    for (const entry of GLOSSARY) {
      if (entry.kanji === null) continue;
      if (kanaOnlyByDesign.has(entry.term)) continue; // タイプ名なので かな のまま
      expect(entry.term).toBe(entry.kanji);
    }
  });

  it("意味メモ自体に禁止語・難語を持ち込まない", () => {
    // 擬態語は読めても意味が出ないので、ふりがなでも英語でも救えない。
    // 意味メモは**むずかしい語から逃げてきた先**なので、ここに擬態語があると行き止まりになる。
    const banned =
      /不正解|間違い|ダメ|かつやく|はっき|きちんと|はっきり|どきどき|じっくり|つぎつぎ|さっと|まっすぐ|しっかり/;
    for (const entry of GLOSSARY) {
      expect(entry.meaning).not.toMatch(banned);
    }
  });

  it("意味メモは、その語自身を使って説明しない（同語反復を避ける）", () => {
    for (const entry of GLOSSARY) {
      if (entry.term === "スマホ") continue; // 「スマートフォン」への言い換えは例外
      expect(entry.meaning.includes(entry.term)).toBe(false);
    }
  });

  it("getGlossaryEntry は台帳と一致し、未登録語は null", () => {
    for (const entry of GLOSSARY) {
      expect(getGlossaryEntry(entry.term)).toEqual(entry);
    }
    expect(getGlossaryEntry("そんざいしない語")).toBeNull();
  });
});

describe("findGlossaryTerm", () => {
  it("文中で最初に出た語を1件だけ返す", () => {
    expect(findGlossaryTerm("トラブルが 出た とき、対応 します。")?.term).toBe("トラブル");
    expect(findGlossaryTerm("さいごの 仕上げを します。")?.term).toBe("仕上げ");
  });

  it("対象語が無ければ null", () => {
    expect(findGlossaryTerm("きょうは あついですね。")).toBeNull();
  });

  it("1文につき1語しか返さない（下線を2本引かせない）", () => {
    const sentence = "運用と 対応の しごと。";
    const found = findGlossaryTerm(sentence);
    expect(found?.term).toBe("運用");
    expect([found].filter(Boolean)).toHaveLength(1);
  });

  it("「仕組み」が「組」に取られない（同位置なら長い語が勝つ）", () => {
    expect(findGlossaryTerm("仕組みを しらべます")?.term).toBe("仕組み");
  });
});

describe("学習者向け文言との対応", () => {
  it("台帳の語は、実際に学習者向け文言のどこかで使われている", () => {
    // 実データだけを見る。ここにリテラルを足すとテストが自分で自分を通してしまう。
    const corpus = [
      // 導入は台帳（PERSONALITY_INTRO）に置いてある。コンポーネントに直書きすると
      // ここに現れず、「性格」「診断」の語彙メモが素通りしてしまう。
      ...Object.values(PERSONALITY_INTRO).flatMap((intro) => [
        intro.title,
        intro.note,
        ...intro.lines,
        // 得意の例も学習者に出る文（絵の となりの 1行）。ここを 入れないと、
        // 例にしか 出ない語（「得意」など）が「使われていない語」に 見えてしまう。
        ...intro.examples.map((example) => example.text),
      ]),
      ...PERSONALITY_FAMILIES.map((family) => family.name),
      ...PERSONALITY_TYPES.flatMap((type) => [
        type.name,
        type.tagline,
        type.teamRole,
        type.teamRoleDetail,
        ...type.analysis,
      ]),
      ...PERSONALITY_QUESTIONS.flatMap((question) => [
        question.easy,
        question.a.easy,
        question.b.easy,
      ]),
    ].join("\n");

    const unused = GLOSSARY.filter((entry) => !corpus.includes(entry.term)).map(
      (entry) => entry.term,
    );
    expect(unused).toEqual([]);
  });

  it("漢字を含む語は読み辞書にあり、読みが台帳と一致する", () => {
    // teamRole（「段取り役」など）は GlossaryText を通らず RubyText 直なので、
    // 読み辞書に無いと漢字が裸で出る。台帳とのズレもここで止める。
    const dictionary = new Map(PERSONALITY_RESULT_READINGS.map((r) => [r.text, r.reading]));
    for (const entry of GLOSSARY) {
      if (!/[一-鿿]/.test(entry.term)) continue;
      if (entry.term === "組") continue; // 「まもり組」など家族名の一部。家族名側でルビを振る
      expect(dictionary.get(entry.term)).toBe(entry.reading);
    }
  });
});

describe("読み辞書の並び（RubyText は同位置なら先勝ち）", () => {
  it("短い語が長い語を食べる並びになっていない", () => {
    // RubyText は同じ位置で一致した語のうち配列で先に出たほうを採る。
    // 「手」が「手順」より前にあると、「手順」は永久に一致せず「順」が裸で残る。
    const offenders: string[] = [];
    PERSONALITY_RESULT_READINGS.forEach((entry, index) => {
      const shadowedBy = PERSONALITY_RESULT_READINGS.slice(0, index).find(
        (earlier) => earlier.text !== entry.text && entry.text.startsWith(earlier.text),
      );
      if (shadowedBy) offenders.push(`${entry.text} は ${shadowedBy.text} に食われる`);
    });
    expect(offenders).toEqual([]);
  });
});
