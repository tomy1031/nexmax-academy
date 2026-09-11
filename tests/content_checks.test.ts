import { describe, expect, it } from "vitest";
import {
  checkDanglingRefs,
  checkDescriptionScope,
  checkDuplicateIds,
  checkFuriganaCoverage,
  checkReferenceIntegrity,
  checkSecretLeaks,
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
    title: "ページ",
    description: "てすとの ページ",
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

describe("説明文の 守備範囲の 検査", () => {
  /**
   * 説明は「ここに 何が あるか」だけを 書く。進み方・クリア条件は 学習者に 要らない
   * （順番は カードの 通し番号、終わったかは しるしが 画面で 見せている）うえ、
   * 教材カードの 説明は 2行で 切れるので、仕組みの 話を 足すと 中身の 説明が
   * 画面から 押し出される。2026-09-11 の指定「それ生徒が知る必要ありますか？
   * ありませんよね？そもそもここはステージの内容の説明です」の 実行体。
   */

  /** 説明の 欄だけを 差し替えた ステージ（既定の 説明は 中身の 話に して おく）。 */
  const described = (description: string, over: Record<string, unknown> = {}) =>
    stage({ description, ...over });

  /** クエストは 種別ごとの walker から 漏れやすい（「クリア」と 書きたく なる 教材）。 */
  const quest = (description: string): Content =>
    parse({
      kind: "quest",
      id: "q1",
      title: "クエスト",
      description,
      focus: "チームで 一年を 進みます。",
      phases: [
        {
          id: 1,
          chapter: "社内ミーティング",
          name: "はじまり",
          desc: "はじめの 場面です。",
          enemy: { name: "山田さん", art: "yamada" },
          question: "どう しますか。",
          options: [
            {
              text: "先に 聞く",
              type: "critical",
              risk: -1,
              hpCost: 0,
              moneyCost: 0,
              explanation: "先に 聞くと ずれが 減ります。",
              resultText: "ずれが 減りました。",
            },
            {
              text: "メモを 取る",
              type: "hit",
              risk: 0,
              hpCost: 0,
              moneyCost: 0,
              explanation: "メモは あとで 役に 立ちます。",
              resultText: "メモを 取りました。",
            },
            {
              text: "だまって 進む",
              type: "miss",
              risk: 3,
              hpCost: 5,
              moneyCost: 0,
              explanation: "聞かないと あとで 直しが 出ます。",
              resultText: "直しが 出ました。",
            },
            {
              text: "あとで 考える",
              type: "miss",
              risk: 4,
              hpCost: 5,
              moneyCost: 0,
              explanation: "あとまわしは 時間を 食います。",
              resultText: "時間が 減りました。",
            },
          ],
        },
      ],
    });

  it("つぎの ステージの 予告を 弾く（引用と 直し方まで 出す）", () => {
    const findings = checkDescriptionScope(
      "houkoku.json",
      described("報告の しかたを 学びます。朝礼は つぎの ステージです。"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
    expect(findings[0]?.message).toContain("つぎの ステージ");
    expect(findings[0]?.message).toContain("教材の 中身だけ");
  });

  it("とばしても終わる（クリア条件）の 説明を 弾く", () => {
    const findings = checkDescriptionScope(
      "asakai.json",
      described("毎日の 朝礼で 報告します。夕礼は とばしても、この ステージは 終わります。"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("ステージ");
  });

  it("ステージ以外の 教材の 説明も 見る（仕組みの 話は どこに 書いても 同じ）", () => {
    const findings = checkDescriptionScope(
      "m1.json",
      manga({ description: "朝礼の まんがです。クリアすると つぎが 開きます。" }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("クリア");
  });

  it("クエストの 説明も 見る（種別ごとの walker では 素通りしていた）", () => {
    const findings = checkDescriptionScope(
      "q1.json",
      quest("クリアすると つぎの ステージが 開きます。"),
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.message.includes("説明文（description）"))).toEqual([true, true]);
  });

  it("見どころ（focus）に 書き写しても 弾く（欄を 移すだけの 逃げ道を 作らない）", () => {
    const listening = parse({
      kind: "listening",
      id: "l1",
      title: "リスニング",
      description: "朝の 会話を 聞きます。",
      focus: "やらなくても ステージは 終わります。",
      audioUrl: "/audio/l1.mp3",
      participants: [{ id: "hendy", name: "ヘンディ", role: "先輩" }],
      script: [
        { speaker: "hendy", text: "おはようございます。" },
        { speaker: "me", text: "おはようございます。" },
      ],
      questions: [],
    });
    const findings = checkDescriptionScope("l1.json", listening);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("説明文（focus）");
  });

  it("まなびマップの ひとことも 見る（カードの 説明と 同じ 場所に 出る）", () => {
    const findings = checkDescriptionScope(
      "s1.json",
      described("報告の しかたを 練習します。", {
        area: {
          name: "しごとの しま",
          reading: "しごとの しま",
          image: "/img/scenes/area_office_island.webp",
          note: "この ステージを 終わると 行けます。",
        },
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("説明文（area.note）");
  });

  it("中身だけを 書いた 説明は 通す", () => {
    expect(
      checkDescriptionScope(
        "s1.json",
        described("上司への 報告の しかたを 読んで、聞いて、声に 出して 練習します。"),
      ),
    ).toEqual([]);
  });

  it("IT の ことば（ステージング環境・キャッシュを クリア）は 通す", () => {
    expect(
      checkDescriptionScope(
        "m1.json",
        manga({ description: "ステージング環境で ためして、キャッシュを クリアします。" }),
      ),
    ).toEqual([]);
  });

  it("「ロック」は 語に 入れない（ブロック・クロック・デッドロックの 誤検出を 避ける）", () => {
    expect(
      checkDescriptionScope(
        "m1.json",
        manga({ description: "デッドロックと ブロックチェーンの 話です。" }),
      ),
    ).toEqual([]);
  });

  it("本文（セリフ）は 見ない — 物語の 中で「クリア」と 言う ことは ある", () => {
    const withLine = parse({
      kind: "manga",
      id: "m2",
      format: "yonkoma",
      title: "まんが",
      description: "ゲームの 話の まんがです。",
      pages: [{ panels: [{ lines: [{ speaker: "narration", text: "ゲームを クリアした。" }] }] }],
    });
    expect(checkDescriptionScope("m2.json", withLine)).toEqual([]);
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

  /*
   * ことばの 正に あっても、**対訳の1語と 誤答3つ**が そろって いない 語は
   * 単語ゲームに 出せない（`src/lib/vocabulary.ts` の `isPlayable`）。
   * 参照は 生きて いる ので 参照切れの 検査には かからず、セットが 黙って 短く なる。
   */
  const playable = Array.from({ length: 6 }, (_, i) => ({
    id: `w${i}`,
    term: `報告${i}`,
    reading: "ほうこく",
    meaningJa: "しごとの ようすを つたえる こと",
    englishTerm: `Report ${i}`,
    wrongMeanings: [`Plan ${i}`, `Check ${i}`, `Share ${i}`],
  }));

  const vocab = (words: unknown[] = playable) =>
    parse({ kind: "vocab", id: "vocabulary", title: "ことば", words });

  /** `wordIds` で ことばの 正を 参照する 単語ステージ（いまの 保存の かたち）。 */
  const wordSet = (wordIds: string[]) =>
    parse({
      kind: "wordstage",
      id: "ws1",
      title: "ことば",
      description: "ことばの れんしゅう",
      fieldSequence: ["forest"],
      questionCount: 6,
      passRate: 70,
      wordIds,
    });

  const allIds = playable.map((word) => word.id);

  /** 誤答を 持たない＝辞書・ツールチップにだけ 出る 語。 */
  const dictionaryOnly = (() => {
    const { wrongMeanings: _unused, ...rest } = playable[0]!;
    return [rest, ...playable.slice(1)];
  })();

  it("対訳も誤答も そろった語だけを 参照して いれば通す", () => {
    expect(
      checkReferenceIntegrity([entry(wordSet(allIds), "ws1.json"), entry(vocab(), "vocab.json")]),
    ).toEqual([]);
  });

  it("誤答3つが 無い語を 出題しようと して いたら弾く（セットが黙って短くなる）", () => {
    const findings = checkReferenceIntegrity([
      entry(wordSet(allIds), "ws1.json"),
      entry(vocab(dictionaryOnly), "vocab.json"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe("ws1.json");
    expect(findings[0]?.message).toContain("w0");
    expect(findings[0]?.message).toContain("wrongMeanings");
  });

  it("誤答を 持たない語も、まんが・記事の ことばカードからは 参照してよい", () => {
    expect(
      checkReferenceIntegrity([
        entry(manga({ vocabIds: ["w0"] })),
        entry(vocab(dictionaryOnly), "vocab.json"),
      ]),
    ).toEqual([]);
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

  it("ステージの説明文も、読み辞書で覆えていなければ出す（直し方は furigana）", () => {
    const findings = checkFuriganaCoverage([entry(stage({ description: "朝の 会議" }))]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("description");
    expect(findings[0]?.message).toContain("furigana");
  });

  it("ステージの説明文は furigana で覆えば通る（漢字＋ふりがなで書ける）", () => {
    const covered = stage({
      description: "朝の 会議",
      furigana: [
        ["朝", "あさ"],
        ["会議", "かいぎ"],
      ],
    });
    expect(checkFuriganaCoverage([entry(covered)])).toEqual([]);
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

  /**
   * ミーティングを型に足したとき、この switch に case を書き忘れると
   * **1件も数えないまま素通りする**（漢字だらけの質問が検査を通ってしまう）。
   * 実際に一度そうなっていたので、両側から留める。
   */
  function meeting(over: Record<string, unknown> = {}): Content {
    return parse({
      kind: "meeting",
      id: "mt1",
      title: "ミーティング",
      description: "Zoomで はなします",
      focus: "じこしょうかいを します",
      host: { id: "hendy", name: "ヘンディ", role: "せんぱい", accent: "sky" },
      persona: "あなたは 会社の 先輩です。やさしい 日本語で 話します。",
      judgePrompt: "できた ところを 1つ ほめて、直す ところを 1つ 言います。",
      questions: Array.from({ length: 3 }, (_, i) => ({
        id: `q${i + 1}`,
        ask: "おなまえを おしえて ください",
        hint: "「わたしは ◯◯です。」",
        keywords: ["名前"],
        echo: "◯◯さんですね。おぼえました。",
      })),
      closing: "ありがとう ございました。",
      ...over,
    });
  }

  it("ミーティングの persona・judgePrompt・keywords は対象にしない（AIへの指示）", () => {
    // どれも漢字を含むが、先生が学習者向けに直すものではない
    expect(checkFuriganaCoverage([entry(meeting())])).toEqual([]);
  });

  it("ミーティングでも学習者が読む文（質問・受け答え）は数える", () => {
    const withKanji = meeting({
      questions: [
        {
          id: "q1",
          ask: "学校は どこですか",
          hint: "「◯◯です。」",
          keywords: [],
          echo: "そうですか",
        },
        { id: "q2", ask: "げんきですか", hint: "「はい。」", keywords: [], echo: "よかったです" },
        {
          id: "q3",
          ask: "また はなしましょう",
          hint: "「はい。」",
          keywords: [],
          echo: "たのしみです",
        },
      ],
    });
    const findings = checkFuriganaCoverage([entry(withKanji)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("questions[0].ask");
    expect(findings[0]?.message).toContain("学 校");
  });

  /**
   * 好感度の「とっておきの話」は、ハートを貯めきった学習者が読む文なのに、
   * 長いあいだ集める対象から漏れていた（**いちばん嬉しい場面だけ規律2の外**）。
   */
  it("ミーティングの とっておきの話（affection.reward）も数える", () => {
    const withReward = meeting({
      affection: { maxHearts: 10, threshold: 7, reward: "世界中に すごい 人が います" },
    });
    const findings = checkFuriganaCoverage([entry(withReward)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("affection.reward");
    expect(findings[0]?.message).toContain("世 界 中");
  });

  it("読み辞書で覆えば とっておきの話も通る", () => {
    const covered = meeting({
      affection: { maxHearts: 10, threshold: 7, reward: "世界中に すごい 人が います" },
      furigana: [
        ["世界中", "せかいじゅう"],
        ["人", "ひと"],
      ],
    });
    expect(checkFuriganaCoverage([entry(covered)])).toEqual([]);
  });

  it("そとの サイトへ行くカード（extlink）の見出しと ひとことも数える", () => {
    const findings = checkFuriganaCoverage([
      entry(
        article([
          {
            kind: "extlink",
            url: "https://example.com",
            label: "会社の ページ",
            note: "あたらしい タブで ひらきます",
          },
        ]),
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("blocks[0].label");
    expect(findings[0]?.message).toContain("会 社");
  });

  it("リスニングの 話す人の 名前と 立場も数える（Zoom風のタイルに出る）", () => {
    const listening = parse({
      kind: "listening",
      id: "ls1",
      title: "あさかい",
      description: "あさの ミーティング",
      focus: "だれが なにを はなすか きく",
      participants: [{ id: "p1", name: "藤木", role: "せんぱい", accent: "sky" }],
      script: [
        { speaker: "p1", text: "おはよう ございます" },
        { speaker: "me", text: "おはよう ございます" },
      ],
    });
    const findings = checkFuriganaCoverage([entry(listening)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("participants[0].name");
    expect(findings[0]?.message).toContain("藤 木");
  });

  /**
   * クエスト（30の 場面の 選択ゲーム）は、種別ごとの switch に `case "quest"` が
   * 無かった あいだ **まるごと 検査の 外**に いた（2026-09-11 に 気づいた。
   * `lint:content` は 緑の まま、画面にだけ 裸の 漢字が 出て いた）。
   * 朝礼・夕礼（`meeting.asakai`）と 同じ 形の 穴なので、欄ごとに 釘を 打つ。
   */
  function quest(over: Record<string, unknown> = {}): Content {
    return parse({
      kind: "quest",
      id: "q1",
      title: "クエスト",
      description: "しごとの ながれを ためす ゲーム",
      focus: "きいてから つくる じゅんばんを たしかめる",
      phases: [
        {
          id: 1,
          chapter: "しゃないミーティング",
          name: "だい1しょう：しゃないミーティング",
          desc: "かいしゃの なかでの じゅんび",
          enemy: { name: "やまださん", art: "yamada" },
          dialogue: [{ speaker: "yamada", text: "あたらしい しごとだよ" }],
          question: "まず なにを しますか",
          options: [
            {
              text: "おきゃくさまの ことを しらべる",
              type: "critical",
              risk: -1,
              hpCost: 5,
              moneyCost: 0,
              explanation: "しらべるのが だいいっぽです",
              resultText: "【いちばん いい て】よく わかった",
            },
            {
              text: "やまださんに きく",
              type: "hit",
              risk: 0,
              hpCost: 10,
              moneyCost: 0,
              explanation: "きくのも たいせつです",
              resultText: "【いい て】ヒントが もらえた",
            },
            {
              text: "すぐに つくりはじめる",
              type: "miss",
              risk: 5,
              hpCost: 10,
              moneyCost: 0,
              explanation: "さきに きく ほうが よいです",
              resultText: "【あとに ひびく て】やりなおしに なった",
            },
            {
              text: "なにも しない",
              type: "miss",
              risk: 5,
              hpCost: 15,
              moneyCost: 0,
              explanation: "うごかないと すすみません",
              resultText: "【あとに ひびく て】じかんが なくなった",
            },
          ],
        },
      ],
      ...over,
    });
  }

  it("クエストの かなだけの 場面は 何も出ない（土台が 空回りして いない）", () => {
    expect(checkFuriganaCoverage([entry(quest())])).toEqual([]);
  });

  it("クエストの セリフ・しつもん・4択・解説・結果の ひとことを ぜんぶ数える", () => {
    const phase = (quest() as Extract<Content, { kind: "quest" }>).phases[0]!;
    const withKanji = quest({
      phases: [
        {
          ...phase,
          dialogue: [{ speaker: "yamada", text: "新しい 案件です" }],
          question: "最初に なにを しますか",
          options: [
            { ...phase.options[0]!, text: "会社を しらべる", explanation: "調査が 先です" },
            { ...phase.options[1]!, resultText: "【いい て】相談できた" },
            phase.options[2]!,
            phase.options[3]!,
          ],
        },
      ],
    });
    const fields = checkFuriganaCoverage([entry(withKanji)]).map((f) => f.message);
    expect(fields.some((m) => m.includes("phases[0].dialogue[0].text"))).toBe(true);
    expect(fields.some((m) => m.includes("phases[0].question"))).toBe(true);
    expect(fields.some((m) => m.includes("phases[0].options[0].text"))).toBe(true);
    expect(fields.some((m) => m.includes("phases[0].options[0].explanation"))).toBe(true);
    expect(fields.some((m) => m.includes("phases[0].options[1].resultText"))).toBe(true);
    // 字まで 言わないと、先生は 何を 足せばよいか 分からない
    expect(fields.find((m) => m.includes("phases[0].question"))).toContain("最 初");
  });

  it("クエストの 見出し・説明・見どころ・章・場面・相手の 名前も数える", () => {
    const withKanji = quest({ title: "冒険", description: "会社の 話", focus: "順番を 見る" });
    const fields = checkFuriganaCoverage([entry(withKanji)]).map((f) => f.message);
    expect(fields.some((m) => m.includes("title"))).toBe(true);
    expect(fields.some((m) => m.includes("description"))).toBe(true);
    expect(fields.some((m) => m.includes("focus"))).toBe(true);

    const base = quest() as Extract<Content, { kind: "quest" }>;
    const withPhaseKanji = quest({
      phases: [
        {
          ...base.phases[0]!,
          chapter: "開発",
          name: "第7章：開発",
          enemy: { name: "神社長", art: "angel" },
        },
      ],
    });
    const more = checkFuriganaCoverage([entry(withPhaseKanji)]).map((f) => f.message);
    expect(more.some((m) => m.includes("phases[0].chapter"))).toBe(true);
    expect(more.some((m) => m.includes("phases[0].name"))).toBe(true);
    expect(more.some((m) => m.includes("phases[0].enemy.name"))).toBe(true);
  });

  it("クエストも 読み辞書で覆えば通る", () => {
    const covered = quest({
      title: "冒険",
      description: "会社の 話",
      focus: "順番を 見る",
      furigana: [
        ["冒険", "ぼうけん"],
        ["会社", "かいしゃ"],
        ["話", "はなし"],
        ["順番", "じゅんばん"],
        ["見", "み"],
      ],
    });
    expect(checkFuriganaCoverage([entry(covered)])).toEqual([]);
  });

  /**
   * `phases[].desc` は 2026-09-11 現在 **どの 画面も 引いて いない**
   *（`src/components/quest/` を 全部 見た）。画面に 出ない 字に 読みを 求めると、
   * 先生には 直しようの ない 指摘に なる。出す ように なったら ここを 裏返す。
   */
  it("画面に出ない欄（場面の おぼえがき・相手の 絵・話し手のid）は対象にしない", () => {
    const base = quest() as Extract<Content, { kind: "quest" }>;
    const hidden = quest({
      phases: [
        {
          ...base.phases[0]!,
          desc: "会社の 中での 準備",
          enemy: { name: "やまださん", art: "engineer" },
        },
      ],
    });
    expect(checkFuriganaCoverage([entry(hidden)])).toEqual([]);
  });

  it("集める文はスタジオと検査で同じ（collectLearnerTexts が同じ本文を返す）", () => {
    const texts = collectLearnerTexts(mangaSaying("会議の 資料です"));
    expect(texts).toContain("会議の 資料です");
    // IDやファイル名は入らない（先生が直せないものを指摘しないため）
    expect(texts).not.toContain("m1");
  });
});

/**
 * 秘匿漏れの 検査（規律6・P4）。
 *
 * ここは 2026-09-07 に **見る ものを 取り替えた**——キーワード（学習者が 言いそうな 語）
 * から、答え そのもの（`secret` / `fact`）へ。取り替えた 側が 効いて いる ことと、
 * 伏線（P4）を 潰しに 戻って いない ことを、両方 見張る。
 */
describe("秘匿漏れの検査（規律6・P4）", () => {
  /** reqs 10本ぶん。1本目だけ 中身を 差し替えられる。 */
  function reqs(first: Record<string, unknown> = {}) {
    return Array.from({ length: 10 }, (_, i) => ({
      id: `r${i + 1}`,
      cat: "what",
      icon: "📌",
      label: "しめきり",
      secret: "らいしゅうの きんようびまでに ほしい",
      fact: "納期は 来週の 金曜日まで",
      keywords: ["しめきり", "納期", "きんよう"],
      hint: "いつまでに ひつようですか",
      ...(i === 0 ? first : {}),
    }));
  }

  /** 模擬ページの html だけ 差し替えられる シナリオ。 */
  function withPage(html: string, first: Record<string, unknown> = {}): Content {
    const list = reqs(first);
    return parse({
      kind: "scenario",
      id: "sc_leak",
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
        avatar: "shop",
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
        pages: [{ tab: "おみせの ページ", frame: "browser", url: "https://example.com", html }],
        quiz: Array.from({ length: 3 }, (_, i) => ({
          q: `しつもん ${i + 1}`,
          options: ["ひとつめ", "ふたつめ", "みっつめ"],
          answer: 0,
          why: "しらべると わかります",
        })),
        findings: ["わかった こと1", "わかった こと2", "わかった こと3"],
      },
      interview: { persona: "あなたは 店長です。聞かれるまで 言いません。", reqs: list },
      doc: {
        projectName: "おみせの アプリ",
        clientLine: "たなかさん",
        sections: [
          {
            title: "きめた こと",
            items: list.map((r) => ({ reqId: r.id, text: "きめた ことを かきます" })),
          },
        ],
      },
      lesson: { title: "きょうの まとめ", points: ["ひとつめ", "ふたつめ"] },
    });
  }

  const scenarioOf = (c: Content) => {
    if (c.kind !== "scenario") throw new Error("fixture が scenario ではない");
    return c;
  };

  it("答え（secret）が そのまま 模擬ページに あると 止める", () => {
    const found = checkSecretLeaks(
      "f.json",
      scenarioOf(withPage("<p>らいしゅうの きんようびまでに ほしいです</p>")),
    );
    const errors = found.filter((f) => f.level === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toContain("secret");
  });

  it("判定用の 事実（fact）も 同じく 止める", () => {
    const found = checkSecretLeaks(
      "f.json",
      scenarioOf(withPage("<p>納期は 来週の 金曜日まで</p>")),
    );
    expect(found.some((f) => f.level === "error" && f.message.includes("fact"))).toBe(true);
  });

  it("ルビで 読みを はさんでも 見のがさない（<rt> を 先に 捨てる）", () => {
    const ruby =
      "<p>らいしゅうの きんようびまでに ほしい</p>" +
      "<p><ruby>納期<rt>のうき</rt></ruby>は <ruby>来週<rt>らいしゅう</rt></ruby>の " +
      "<ruby>金曜日<rt>きんようび</rt></ruby>まで</p>";
    expect(
      checkSecretLeaks("f.json", scenarioOf(withPage(ruby))).some(
        (f) => f.level === "error" && f.message.includes("fact"),
      ),
    ).toBe(true);
  });

  it("キーワードが 出て いるだけなら 止めない（P4の 伏線は 残す）", () => {
    const found = checkSecretLeaks(
      "f.json",
      scenarioOf(withPage("<p><ruby>納期<rt>のうき</rt></ruby>の ごそうだんは DMへ</p>")),
    );
    expect(found.every((f) => f.level === "warn")).toBe(true);
    expect(found.length).toBeGreaterThan(0);
  });

  it("短い 答えは 拾わない（たまたまの 一致で 検査が 無視されないように）", () => {
    const found = checkSecretLeaks(
      "f.json",
      scenarioOf(
        withPage("<p>はい、やって います</p>", {
          secret: "はい",
          fact: "はい",
          keywords: ["ぜんぜん", "ちがう", "ことば"],
        }),
      ),
    );
    expect(found.filter((f) => f.message.startsWith("r1"))).toEqual([]);
  });

  it("事前調査が 無い 教材は そもそも 漏れようが ない", () => {
    const bare = parse({
      ...JSON.parse(JSON.stringify(withPage("<p>らいしゅうの きんようびまでに ほしい</p>"))),
      research: undefined,
    });
    expect(checkSecretLeaks("f.json", scenarioOf(bare))).toEqual([]);
  });
});
