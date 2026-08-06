import { describe, expect, it } from "vitest";
import {
  checkDanglingRefs,
  checkDuplicateIds,
  checkFuriganaCoverage,
  checkReferenceIntegrity,
  checkStageOrder,
  collectLearnerTexts,
  type ContentEntry,
} from "../src/lib/content-checks";
import { contentSchema, type Content, type Stage } from "../src/content/schema";

/**
 * 検収の機械検査（設計07 §2）。
 * ここが素通しすると、先生は「保存できた」と思ったまま壊れた教材を公開してしまう。
 */

function parse(raw: unknown): Content {
  const result = contentSchema.safeParse(raw);
  if (!result.success) throw new Error(`fixture が壊れている: ${result.error.message}`);
  return result.data;
}

function stage(over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "stage",
    id: "s1",
    order: 1,
    title: "テスト",
    reading: "てすと",
    description: "てすとの ステージ",
    color: "leaf",
    status: "published",
    contents: [{ ref: "m1", type: "manga" }],
    wordStageIds: [],
    ...over,
  });
}

function manga(over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "manga",
    id: "m1",
    format: "yonkoma",
    title: "まんが",
    description: "てすとの まんが",
    pages: [{ panels: [{ lines: [] }] }],
    ...over,
  });
}

function article(blocks: unknown[], over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "article",
    id: "a1",
    title: "よみもの",
    description: "てすとの よみもの",
    blocks,
    ...over,
  });
}

const entry = (content: Content, file = `${content.id}.json`): ContentEntry => ({ file, content });

describe("ID重複の検査", () => {
  it("種別がちがっても同じIDなら弾く（進捗キーとDB主キーが種別を持たないため）", () => {
    const findings = checkDuplicateIds([
      entry(stage({ id: "same" }), "stage.json"),
      entry(manga({ id: "same" }), "manga.json"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
    expect(findings[0]?.message).toContain("種別をまたいで一意");
  });

  it("同じ種別の重複も従来どおり弾く", () => {
    const findings = checkDuplicateIds([
      entry(manga({ id: "dup" }), "a.json"),
      entry(manga({ id: "dup" }), "b.json"),
    ]);
    expect(findings).toHaveLength(1);
  });

  it("IDが全部ちがえば何も出ない", () => {
    expect(checkDuplicateIds([entry(stage()), entry(manga())])).toEqual([]);
  });
});

describe("マップの停留所の検査", () => {
  /** マップの土地（景色の名前・絵・一言）。国名を入れない。 */
  const area = {
    name: "しごとの しま",
    reading: "しごとの しま",
    image: "/img/scenes/area_office_island.webp",
    note: "あたらしい しごとの しま。",
  };

  it("公開ステージの ならびの ばんごう が重なったら知らせる（並び替えても動かないため）", () => {
    const findings = checkStageOrder([
      entry(stage({ id: "s1", order: 2, area }), "s1.json"),
      entry(stage({ id: "s2", order: 2, area }), "s2.json"),
    ]);
    expect(findings.some((f) => f.message.includes("ばんごう 2"))).toBe(true);
  });

  it("ばんごう が重なっても止めない（IDの順で安定して並ぶので、教材は消えない）", () => {
    const findings = checkStageOrder([
      entry(stage({ id: "s1", order: 2, area }), "s1.json"),
      entry(stage({ id: "s2", order: 2, area }), "s2.json"),
    ]);
    expect(findings.every((f) => f.level === "warn")).toBe(true);
  });

  it("area が無いステージは、決め方まで書いて警告する", () => {
    const findings = checkStageOrder([entry(stage({ id: "far" }), "far.json")]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("warn");
    // 直し方が書いていないと、先生は公開を取り下げるしかないと思ってしまう
    expect(findings[0]?.message).toContain("エリアの絵");
  });

  it("area が無くても「たどり着けない」とは言わない（ステージは出るので）", () => {
    const findings = checkStageOrder([entry(stage({ id: "far" }), "far.json")]);
    expect(findings[0]?.message).not.toContain("たどり着けない");
    expect(findings[0]?.message).toContain("空色の帯");
  });

  it("area を決めれば何も出ない — 管理画面だけでステージを足せる", () => {
    expect(checkStageOrder([entry(stage({ id: "far", area }), "far.json")])).toEqual([]);
  });

  it("下書きは検査しない（作りかけの重複で止めない）", () => {
    const findings = checkStageOrder([
      entry(stage({ id: "s1", order: 2, area }), "s1.json"),
      entry(stage({ id: "s2", order: 2, area, status: "draft" }), "s2.json"),
    ]);
    expect(findings).toEqual([]);
  });
});

describe("参照整合の検査", () => {
  const link = (ref: string, type: string) => ({
    kind: "link",
    ref,
    type,
    label: "つぎは これ",
  });

  it("記事の link 先が無ければ弾く（タップ先が404になる）", () => {
    const findings = checkReferenceIntegrity([entry(article([link("nope", "quizset")]), "a.json")]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("nope");
    expect(findings[0]?.message).toContain("404");
  });

  it("link 先が実在すれば通す", () => {
    const findings = checkReferenceIntegrity([
      entry(article([link("m1", "manga")]), "a.json"),
      entry(manga()),
    ]);
    expect(findings).toEqual([]);
  });

  it("種別違いは参照切れとして扱う（idだけ合っていても行き先が別）", () => {
    const findings = checkReferenceIntegrity([
      entry(article([link("m1", "quizset")]), "a.json"),
      entry(manga()),
    ]);
    expect(findings).toHaveLength(1);
  });

  it("ステージの参照切れは従来どおり弾く", () => {
    const findings = checkReferenceIntegrity([entry(stage())]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("m1");
  });
});

describe("保存するときの参照切れ（スタジオの保存経路）", () => {
  /** stage() は Content を返すので、ステージ1件を受け取る検査に渡せる形に絞る。 */
  const asStage = (content: Content): Stage => {
    if (content.kind !== "stage") throw new Error("fixture が stage ではない");
    return content;
  };
  const known = (...ids: string[]): ReadonlySet<string> => new Set(ids);

  it("contents の参照先がまだ無いIDなら1件しらせる", () => {
    const findings = checkDanglingRefs(asStage(stage()), known());
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("m1");
  });

  it("wordStageIds のまだ無いIDもしらせる", () => {
    const findings = checkDanglingRefs(asStage(stage({ wordStageIds: ["w1"] })), known("m1"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("w1");
  });

  it("参照先がぜんぶそろっていれば何も出ない", () => {
    const target = asStage(stage({ wordStageIds: ["w1"] }));
    expect(checkDanglingRefs(target, known("m1", "w1"))).toEqual([]);
  });

  it("level は必ず warn（error にすると、先に枠だけ作ったステージを保存できなくなる）", () => {
    const findings = checkDanglingRefs(asStage(stage({ wordStageIds: ["w1"] })), known());
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.level === "warn")).toBe(true);
    expect(findings.some((f) => f.level === "error")).toBe(false);
  });
});

/**
 * ふりがなの覆い漏れ（AGENTS.md 規律2）。
 * ここが素通しすると、読めない漢字が1つ残ったまま公開され、学習者はそこで止まる。
 * 逆に拾いすぎると、先生に直しようのない指摘（ID・画像パス・英語・AI用メモ）が並び、
 * 検査そのものが無視されるようになる。「学習者が読む文だけ・全部」が要件。
 */
describe("ふりがなの覆い漏れ検査", () => {
  /** セリフ1行だけの漫画（覆い漏れの置き場所として一番わかりやすい）。 */
  const mangaSaying = (text: string, over: Record<string, unknown> = {}) =>
    manga({
      pages: [{ panels: [{ lines: [{ speaker: "narration", text }] }] }],
      ...over,
    });

  const baseWords = Array.from({ length: 6 }, (_, i) => ({
    id: `w${i}`,
    term: "報告",
    reading: "ほうこく",
    meaningEn: `report ${i}`,
    wrongMeanings: [`plan ${i}`, `check ${i}`, `share ${i}`],
    explanationJa: "しごとの ようすを つたえる こと",
    example: "報告を おねがいします",
  }));

  function wordstage(over: Record<string, unknown> = {}): Content {
    return parse({
      kind: "wordstage",
      id: "ws1",
      title: "ことば",
      description: "ことばの れんしゅう",
      fieldSequence: ["term"],
      questionCount: 6,
      passRate: 70,
      words: baseWords,
      ...over,
    });
  }

  function scenario(over: Record<string, unknown> = {}): Content {
    const reqs = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i + 1}`,
      cat: "what",
      icon: "📌",
      label: "しめきり",
      secret: "らいしゅうの きんようび",
      // fact と keywords は判定の材料。画面に出ないので漢字があってもよい
      fact: "納期は 来週の 金曜日",
      keywords: ["しめきり", "納期", "きんよう"],
      hint: "いつまでに ひつようですか",
    }));
    return parse({
      kind: "scenario",
      id: "sc1",
      order: 1,
      title: "おみせの アプリ",
      subtitle: "はじめての ヒアリング",
      subtitleEn: "first hearing",
      emoji: "🛒",
      color: "sky",
      difficulty: 1,
      client: {
        name: "たなかさん",
        role: "てんちょう",
        desc: "おみせを やって います",
        voice: "Aoede",
        avatar: "/img/avatar.webp",
        tip: "ゆっくり きいて みよう",
      },
      mission: {
        chat: [
          { from: "hendy", text: "きょうは ヒアリングです" },
          { from: "me", text: "がんばります" },
        ],
        goal: "ようけんを ぜんぶ ききだす",
      },
      words: [
        { w: "納期", r: "のうき", en: "deadline", m: "しごとの しめきり" },
        { w: "予算", r: "よさん", en: "budget", m: "つかえる おかね" },
        { w: "要件", r: "ようけん", en: "requirement", m: "つくる ものの きまり" },
        { w: "確認", r: "かくにん", en: "check", m: "まちがいが ないか みる こと" },
      ],
      research: {
        intro: "まず おみせの ことを しらべます",
        pages: [
          {
            tab: "おみせの ページ",
            frame: "browser",
            url: "https://example.com",
            html: "<p>会社の あんない</p>",
          },
        ],
        quiz: Array.from({ length: 3 }, (_, i) => ({
          q: `しつもん ${i + 1}`,
          options: ["ひとつめ", "ふたつめ", "みっつめ"],
          answer: 0,
          why: "しらべると わかります",
        })),
        findings: ["わかった こと1", "わかった こと2", "わかった こと3"],
      },
      interview: {
        // Live への指示。学習者は読まないので漢字だらけでよい
        persona:
          "あなたは 店長です。予算は 五十万円、納期は 来週の 金曜日。聞かれるまで 言いません。",
        reqs,
      },
      doc: {
        projectName: "おみせの アプリ",
        clientLine: "たなかさん",
        sections: [
          {
            title: "きめた こと",
            items: reqs.map((r) => ({ reqId: r.id, text: "きめた ことを かきます" })),
          },
        ],
      },
      lesson: { title: "きょうの まとめ", points: ["ひとつめ", "ふたつめ"] },
      furigana: [
        ["納期", "のうき"],
        ["予算", "よさん"],
        ["要件", "ようけん"],
        ["確認", "かくにん"],
      ],
      ...over,
    });
  }

  it("覆えていない漢字を、どのフィールドかと一緒に error で知らせる", () => {
    const findings = checkFuriganaCoverage([entry(mangaSaying("会議の 資料です"))]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
    // 場所が無いと先生はどこを直せばよいか分からない
    expect(findings[0]?.message).toContain("pages[0].panels[0].lines[0].text");
    // 字が無いと何を足せばよいか分からない
    expect(findings[0]?.message).toContain("会");
    expect(findings[0]?.message).toContain("資");
  });

  it("読み辞書で覆えば何も出ない", () => {
    const covered = mangaSaying("会議の 資料です", {
      furigana: [
        ["会議", "かいぎ"],
        ["資料", "しりょう"],
      ],
    });
    expect(checkFuriganaCoverage([entry(covered)])).toEqual([]);
  });

  it("一部だけ覆えているときは、足りない字だけを言う", () => {
    const partial = mangaSaying("会議の 資料です", { furigana: [["会議", "かいぎ"]] });
    const findings = checkFuriganaCoverage([entry(partial)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("資 料");
    expect(findings[0]?.message).not.toContain("会");
  });

  it("「だいたい付いている」は通さない — level は必ず error（1語で学習者が止まる）", () => {
    const findings = checkFuriganaCoverage([entry(mangaSaying("報告を します"))]);
    expect(findings.every((f) => f.level === "error")).toBe(true);
  });

  it("画像の生成プロンプトは対象にしない（学習者は読まない・先生も直しようがない）", () => {
    const withImage = article([
      { kind: "image", src: "/img/a.webp", prompt: "会議室で 話す 人たち" },
    ]);
    expect(checkFuriganaCoverage([entry(withImage)])).toEqual([]);
  });

  it("単語ステージの term は読みを自分で持つので、解説文や例文でも覆えたものとして扱う", () => {
    // 語カードが「報告 / ほうこく」と並べて見せるので、読みは学習者に届いている
    expect(checkFuriganaCoverage([entry(wordstage())])).toEqual([]);
  });

  it("単語ステージの解説文にある別の漢字は覆い漏れとして出す", () => {
    const withOther = wordstage({
      words: [{ ...baseWords[0], explanationJa: "連絡を する こと" }, ...baseWords.slice(1)],
    });
    const findings = checkFuriganaCoverage([entry(withOther)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("words[0].explanationJa");
    expect(findings[0]?.message).toContain("連 絡");
  });

  it("英語のフィールド（meaningEn・wrongMeanings）は対象にしない", () => {
    expect(collectLearnerTexts(wordstage())).not.toContain("report 0");
  });

  it("ステージには読み辞書が無いので、直し方を「ひらがなで書く」と案内する", () => {
    const findings = checkFuriganaCoverage([entry(stage({ description: "朝の 会議" }))]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("description");
    expect(findings[0]?.message).toContain("ひらがな");
  });

  it("ステージのタイトルは reading が読みになるので、漢字のままでも通る", () => {
    const titled = stage({ title: "朝会と報告", reading: "あさかいと ほうこく" });
    expect(checkFuriganaCoverage([entry(titled)])).toEqual([]);
  });

  it("シナリオの persona・判定用キーワード・模擬ページHTMLは対象にしない", () => {
    // ここを拾うと、先生には直せない指摘が何十件も出て検査ごと無視される
    expect(checkFuriganaCoverage([entry(scenario())])).toEqual([]);
  });

  it("シナリオでも学習者が読む文は数える", () => {
    const findings = checkFuriganaCoverage([entry(scenario(scenarioResearchWithKanji()))]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("research.intro");
    expect(findings[0]?.message).toContain("会");
  });

  /** research をまるごと差し替える（intro にだけ漢字を入れる）。 */
  function scenarioResearchWithKanji() {
    return {
      research: {
        intro: "まず 会社の ことを しらべます",
        pages: [
          {
            tab: "おみせの ページ",
            frame: "browser",
            url: "https://example.com",
            html: "<p>あんない</p>",
          },
        ],
        quiz: Array.from({ length: 3 }, (_, i) => ({
          q: `しつもん ${i + 1}`,
          options: ["ひとつめ", "ふたつめ", "みっつめ"],
          answer: 0,
          why: "しらべると わかります",
        })),
        findings: ["わかった こと1", "わかった こと2", "わかった こと3"],
      },
    };
  }

  it("集める文はスタジオと検査で同じ（collectLearnerTexts が同じ本文を返す）", () => {
    const texts = collectLearnerTexts(mangaSaying("会議の 資料です"));
    expect(texts).toContain("会議の 資料です");
    // IDやファイル名は入らない（先生が直せないものを指摘しないため）
    expect(texts).not.toContain("m1");
  });
});
