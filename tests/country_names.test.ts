import { describe, expect, it } from "vitest";
import {
  checkCountryNames,
  checkCountryNamesInTexts,
  checkFuriganaCoverageOf,
} from "../src/lib/content-checks";
import { contentSchema, type Content } from "../src/content/schema";

/**
 * 国名の検査（AGENTS.md 規律9）と、1件ぶんのふりがな検査
 *
 * どちらも **保存経路に無かった** ものを足したぶん。
 * 規律9 は文書にはあったが検査コードが1行も無く、規律2 は CI にしか無かった
 *（＝スタジオで作った教材は CI を通らないまま公開できていた）。
 * 人が読んで気づく前提の規律は、AIに教材を作らせ始めた瞬間に破れる。
 */

function parse(raw: unknown): Content {
  const result = contentSchema.safeParse(raw);
  if (!result.success) throw new Error(`fixture が壊れている: ${result.error.message}`);
  return result.data;
}

/** セリフ1つだけのまんが。学習者に見える文の最小形。 */
function saying(text: string, furigana: [string, string][] = []): Content {
  return parse({
    kind: "manga",
    id: "m1",
    format: "yonkoma",
    title: "まんが",
    description: "てすとの まんが",
    furigana,
    pages: [{ panels: [{ lines: [{ speaker: "narration", text }] }] }],
  });
}

describe("使ってはいけない国名は止める", () => {
  it("「タイ」は error（規律9が名指しで禁じている）", () => {
    const findings = checkCountryNames("f", saying("らいねん タイに 行きます。"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
    expect(findings[0]?.message).toContain("タイ");
  });

  it("どこに出たかが分かるよう、前後を添えて出す（先生が直せないと意味がない）", () => {
    const findings = checkCountryNames("f", saying("らいねん タイに 行きます。"));
    expect(findings[0]?.message).toContain("行きます");
  });
});

describe("ふつうの日本語の語を 国名と まちがえない", () => {
  /*
   * ここが弱いと誤検出だらけになり、**検査そのものが無視されるようになる**。
   * 「タイ」はカタカナ語の途中に山ほど出るので、前後がカタカナなら国名とみなさない。
   */
  it.each([
    "タイトルを 書きます。",
    "タイプを えらびます。",
    "タイミングが 大切です。",
    "ネクタイを します。",
    "だいたい 分かりました。",
    "タイヤを かえます。",
  ])("%s は 拾わない", (text) => {
    expect(checkCountryNames("f", saying(text))).toEqual([]);
  });
});

describe("タイ以外の国名は そのまま通す", () => {
  /*
   * 2026-08-23 の是正。ここには以前「合意ずみの国名」と「出したら warn を出す国名」の
   * 一覧があったが、規律9 の読み違いだった。禁じられているのは**タイだけ**で、
   * 「国名を出さない」のは**まなびマップの見せかた**の話（src/content/areas.ts）。
   * 本文まで縛った結果、会社の海外拠点を説明できなくなっていた。
   */
  it.each([
    ["日本で はたらきます。", [["日本", "にほん"]] as [string, string][]],
    ["カンボジアから 来ました。", []],
    ["ベトナムに オフィスが あります。", []],
    ["インドネシアの メダンで 生まれました。", []],
    ["韓国と シンガポールにも 行きました。", []],
  ])("%s は 何も言わない", (text, furigana) => {
    expect(checkCountryNames("f", saying(text, furigana))).toEqual([]);
  });

  it("warn は もう1件も出ない（合図そのものを やめた）", () => {
    const findings = checkCountryNames("f", saying("ベトナムの 話を します。"));
    expect(findings.filter((f) => f.level === "warn")).toEqual([]);
  });
});

describe("先生だけが見る覚書は 対象にしない", () => {
  /*
   * 登場人物の looks（絵を作るときの指示）は画面に出ない。
   * ここまで弾くと「Southeast Asian」と書けなくなって、絵の質が落ちる。
   */
  it("character の looks に地名があっても 何も言わない", () => {
    const character = parse({
      kind: "character",
      id: "c1",
      name: "ニャム",
      reading: "にゃむ",
      role: "同期",
      looks: "Southeast Asian woman. Grew up near the Mekong in ベトナム.",
    });
    expect(checkCountryNames("f", character)).toEqual([]);
  });
});

describe("教材データ以外の文も 同じ判定で見る（スライド原稿の入口）", () => {
  /*
   * スライドの組版原稿（scripts/slides/<教材ID>/index.html）は Content ではないので、
   * 抽出した文をこちらへ渡す。判定を2重に持つと一覧の更新が片方に落ちるため、
   * checkCountryNames はこの関数へ委譲している。
   */
  it("文字列の列を直接受けて、同じ error を出す", () => {
    const findings = checkCountryNamesInTexts("f", ["らいねん タイに 行きます。"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
  });

  it("カタカナ語の誤検出よけも同じに働く", () => {
    expect(checkCountryNamesInTexts("f", ["タイトルを 書きます。"])).toEqual([]);
  });

  it("引用は 当たった出現箇所を指す（1つ目の「タイトル」ではなく）", () => {
    /*
     * 原稿は1スライドが1行に畳まれるので、同じ行に「タイトル」と「タイ」が並ぶ。
     * 引用が「タイトル」側を指すと、既知の誤検出に見えて指摘が握りつぶされる。
     */
    const findings = checkCountryNamesInTexts("f", [
      "タイトルを 書きます。らいねん タイに 行きます。",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("タイに 行きます");
  });
});

describe("1件ぶんのふりがな検査（保存経路で使う）", () => {
  it("覆えていない漢字を、どのフィールドかまで添えて出す", () => {
    const findings = checkFuriganaCoverageOf("f", saying("会議を します。"), "error");
    expect(findings).toHaveLength(1);
    // 足りない漢字は1字ずつ並ぶ（どの字を辞書に足せばよいか、そのまま読める形）
    expect(findings[0]?.message).toContain("会");
    expect(findings[0]?.message).toContain("議");
    // どこに足すかが分からないと直せないので、場所も要る
    expect(findings[0]?.message).toContain("lines");
  });

  it("読み辞書で覆えていれば 何も言わない", () => {
    const covered = saying("会議を します。", [["会議", "かいぎ"]]);
    expect(checkFuriganaCoverageOf("f", covered, "error")).toEqual([]);
  });

  it("公開のときは error、下書きのときは warn（作りかけを保存させる）", () => {
    const broken = saying("会議を します。");
    expect(checkFuriganaCoverageOf("f", broken, "error")[0]?.level).toBe("error");
    expect(checkFuriganaCoverageOf("f", broken, "warn")[0]?.level).toBe("warn");
  });
});
