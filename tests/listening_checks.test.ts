import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import {
  createListening,
  DEFAULT_RESCUE_WORD,
  DEFAULT_RULES,
  lengthBonus,
  MAX_MISS,
  opensRescue,
  POINTS,
  remainingKeywords,
  replayListening,
  rescueWordOf,
  revealRate,
  submitListening,
  type ListeningState,
} from "../src/components/listening/listening-checks";

const TRANSCRIPT =
  "サーバーが止まっています。原因はまだ分かりません。テストが止まってしまいました。";
const KEYWORDS = ["サーバー", "原因", "テスト"];

function fresh(): ListeningState {
  return createListening(TRANSCRIPT, KEYWORDS);
}

describe("聞き取り判定（入力欄は1つ・原典の配点）", () => {
  it("キーワードそのものは5点＋長さのボーナス、原稿もその場で開く", () => {
    const s = submitListening(fresh(), "サーバー");
    expect(s.score).toBe(POINTS.keyword + lengthBonus("サーバー", DEFAULT_RULES));
    expect(s.foundKeywords).toEqual(["サーバー"]);
    expect(s.log[0]?.kind).toBe("keyword");
    // 原稿の「サーバー」4文字が見えている
    for (let i = 0; i < 4; i += 1) expect(s.revealed.has(i)).toBe(true);
  });

  it("読み・別表記で当てたときは3点（原典どおり点差がある）", () => {
    const s = submitListening(fresh(), "さーばー");
    expect(s.score).toBe(POINTS.hiragana + lengthBonus("さーばー", DEFAULT_RULES));
    expect(s.log[0]?.kind).toBe("hiragana");
    expect(s.foundKeywords).toEqual(["サーバー"]);
  });

  it("キーワードを含む言い方は、含んだ数ぶん点が入る", () => {
    const s = submitListening(fresh(), "サーバーが止まっています");
    expect(s.log[0]?.kind).toBe("contains");
    expect(s.score).toBe(POINTS.contains + lengthBonus("サーバーが止まっています", DEFAULT_RULES));
    expect(s.foundKeywords).toEqual(["サーバー"]);
  });

  it("キーワードは含むが本文にない言い方は「おしい」で0点", () => {
    const s = submitListening(fresh(), "サーバーが動いています");
    expect(s.log[0]?.kind).toBe("close");
    expect(s.score).toBe(0);
    expect(s.foundKeywords).toEqual([]);
  });

  it("キーワードでなくても本文にあれば2点", () => {
    const s = submitListening(fresh(), "分かりません");
    expect(s.log[0]?.kind).toBe("partial");
    expect(s.score).toBe(POINTS.partial + lengthBonus("分かりません", DEFAULT_RULES));
    expect(s.otherHits).toBe(1);
  });

  it("短すぎる入力はミスとして数える", () => {
    const s = submitListening(fresh(), "あい");
    expect(s.log[0]?.kind).toBe("tooShort");
    expect(s.misses).toBe(1);
  });

  it("本文にない言葉はミス。3回までで、それ以上は増え続ける", () => {
    let s = fresh();
    for (let i = 0; i < MAX_MISS; i += 1) s = submitListening(s, `りんご${i}`);
    expect(s.misses).toBe(MAX_MISS);
    expect(s.score).toBe(0);
  });

  it("同じ言葉を二度入れても点は増えない", () => {
    const once = submitListening(fresh(), "サーバー");
    const twice = submitListening(once, "サーバー");
    expect(twice.score).toBe(once.score);
    expect(twice.foundKeywords).toEqual(["サーバー"]);
  });

  it("表記がちがっても同じ言葉として扱う（半角カナ・ひらがな）", () => {
    expect(submitListening(fresh(), "ｻｰﾊﾞｰ").foundKeywords).toEqual(["サーバー"]);
  });

  it("見つけるほど原稿が開き、のこりが減る", () => {
    const start = fresh();
    expect(remainingKeywords(start)).toBe(3);

    const s = ["サーバー", "原因", "テスト"].reduce(submitListening, start);
    expect(remainingKeywords(s)).toBe(0);
    expect(revealRate(s)).toBeGreaterThan(revealRate(start));
    const expected = ["サーバー", "原因", "テスト"].reduce(
      (sum, word) => sum + POINTS.keyword + lengthBonus(word, DEFAULT_RULES),
      0,
    );
    expect(s.score).toBe(expected);
  });

  it("空の入力は何も起こさない", () => {
    const s = fresh();
    expect(submitListening(s, "   ")).toBe(s);
  });

  it("記号は最初から見えていて、文字は隠れている", () => {
    const s = fresh();
    expect(s.revealed.has(TRANSCRIPT.indexOf("。"))).toBe(true);
    expect(s.revealed.has(0)).toBe(false);
  });

  it("何も当てていないときの表示率は 0%（句読点を分母に入れない）", () => {
    // 分母を原稿の長さにしていたころは、句読点が見えているぶんだけ
    // いきなり 11% から始まっていた。学習者から見ると嘘をつかれたことになる。
    expect(revealRate(fresh())).toBe(0);
  });

  it("長い言葉ほど点が高い", () => {
    const short = submitListening(fresh(), "原因");
    const long = submitListening(fresh(), "サーバーが止まっています");
    expect(long.score).toBeGreaterThan(short.score);
  });

  it("受けつける文字数は教材ごとに変えられる", () => {
    const loose = createListening(TRANSCRIPT, KEYWORDS, { minLength: 2, maxMiss: 3 });
    // 「まだ」は本文にあるが、3文字必要なら短すぎ扱いになる
    expect(submitListening(fresh(), "まだ").log[0]?.kind).toBe("tooShort");
    expect(submitListening(loose, "まだ").log[0]?.kind).toBe("partial");
  });

  it("入れた言葉を保存しておけば、開いた原稿は次に来ても開いたまま", () => {
    const played = ["サーバー", "原因"].reduce(submitListening, fresh());
    const restored = replayListening(fresh(), [...played.usedInputs]);
    expect(restored.foundKeywords).toEqual(played.foundKeywords);
    expect(revealRate(restored)).toBe(revealRate(played));
    // 前回のミスは持ち越さない
    expect(restored.misses).toBe(0);
  });

  /*
   * 2026-09-04 の 指摘 3つ。どれも 「学習者が 実際に やる こと」で 見張る。
   */
});

describe("ひらがなで 打っても 当たる（読み辞書を 通す）", () => {
  const 原稿 = "受託開発では、完成した ときに 達成感を 感じられます。";
  const 辞書 = buildFuriganaIndex([
    ["受託開発", "じゅたくかいはつ"],
    ["達成感", "たっせいかん"],
    ["完成", "かんせい"],
    ["感", "かん"],
  ]);
  const rules = { minLength: 2, maxMiss: 5 };

  it("原稿の 漢字を **かなで** 打って 当たる（前は 絶対に 当たらなかった）", () => {
    const state = submitListening(createListening(原稿, ["受託開発"], rules, 辞書), "たっせいかん");
    expect(state.log[0]?.kind).toBe("partial");
    expect(revealRate(state)).toBeGreaterThan(0);
  });

  it("キーワードも かなで 当たる", () => {
    const state = submitListening(
      createListening(原稿, ["受託開発"], rules, 辞書),
      "じゅたくかいはつ",
    );
    expect(state.log[0]?.kind).toBe("hiragana");
    expect(state.foundKeywords).toEqual(["受託開発"]);
  });

  it("辞書が 無い ときは 素の 形で 当たる（英字・カタカナ）", () => {
    const state = submitListening(createListening("SESの 話です。", ["SES"], rules), "SES");
    expect(state.log[0]?.kind).toBe("keyword");
  });

  it("かなで 当てても 漢字で 当てても、同じ ところが ひらく", () => {
    const かな = submitListening(createListening(原稿, [], rules, 辞書), "たっせいかん");
    const 漢字 = submitListening(createListening(原稿, [], rules, 辞書), "達成感");
    expect(revealRate(かな)).toBe(revealRate(漢字));
  });
});

describe("同じ ことばを 2回 打った とき", () => {
  const 原稿 = "達成感が あります。";
  const 辞書 = buildFuriganaIndex([["達成感", "たっせいかん"]]);
  const rules = { minLength: 2, maxMiss: 5 };

  it("「まだ 出ていない」では なく repeat に する", () => {
    let state = createListening(原稿, [], rules, 辞書);
    state = submitListening(state, "たっせいかん");
    state = submitListening(state, "たっせいかん");
    expect(state.log[0]?.kind).toBe("repeat");
    expect(state.log[0]?.kind).not.toBe("miss");
  });

  it("表記が ちがっても 同じ ことばなら 二度は 稼げない", () => {
    let state = createListening(原稿, [], rules, 辞書);
    state = submitListening(state, "たっせいかん");
    const 点 = state.score;
    state = submitListening(state, "達成感");
    expect(state.log[0]?.kind).toBe("repeat");
    expect(state.score).toBe(点);
  });

  it("repeat は ミスに 数えない", () => {
    let state = createListening(原稿, [], rules, 辞書);
    state = submitListening(state, "たっせいかん");
    state = submitListening(state, "たっせいかん");
    expect(state.misses).toBe(0);
  });
});

describe("あいことば（教材ごと・表示率が届かない学習者の逃げ道）", () => {
  it("教材の ことばで 開く", () => {
    const 教材 = { rescueWord: "もくようび" };
    expect(rescueWordOf(教材)).toBe("もくようび");
    expect(opensRescue("もくようび", 教材)).toBe(true);
    expect(opensRescue("きんようび", 教材)).toBe(false);
  });

  it("あいことばの 無い 教材は 何を 打っても 開かない（2026-09-22 の 指定 B）", () => {
    for (const 教材 of [{}, { rescueWord: "" }, { rescueWord: "   " }, { rescueWord: "、、" }]) {
      expect(rescueWordOf(教材)).toBe("");
      expect(opensRescue("なんでも", 教材)).toBe(false);
      expect(opensRescue(DEFAULT_RESCUE_WORD, 教材)).toBe(false);
      // 記号だけの ときに 空と 比べて しまうと「空欄でも 開く」に なる
      expect(opensRescue("", 教材)).toBe(false);
    }
  });

  it("既定の ことばは 新しい 教材の ための もので、それ自体は 鍵に ならない", () => {
    expect(DEFAULT_RESCUE_WORD).toBe("ネクマックス");
    expect(opensRescue(DEFAULT_RESCUE_WORD, { rescueWord: DEFAULT_RESCUE_WORD })).toBe(true);
  });

  it("カタカナ・全角・大文字・前後の 空白で 弾かない", () => {
    expect(opensRescue(" ねくまっくす ", { rescueWord: "ネクマックス" })).toBe(true);
    expect(opensRescue("ＳＥＳ", { rescueWord: "ses" })).toBe(true);
  });

  it("読み辞書が あれば かなで 打っても 開く（漢字を 出せない 学習者を 落とさない）", () => {
    const 辞書 = buildFuriganaIndex([["報告", "ほうこく"]]);
    expect(opensRescue("ほうこく", { rescueWord: "報告" }, 辞書)).toBe(true);
    expect(opensRescue("報告", { rescueWord: "報告" }, 辞書)).toBe(true);
    expect(opensRescue("れんらく", { rescueWord: "報告" }, 辞書)).toBe(false);
  });

  it("英字は 1文字ずつの 読みでも 開く（SES → えすいーえす）", () => {
    expect(opensRescue("えすいーえす", { rescueWord: "SES" })).toBe(true);
  });
});

describe("いまの 教材の あいことばは、先生が 言った とおりに 打てば 開く", () => {
  const dir = join(__dirname, "..", "content", "listening");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));

  it("リスニングの 教材が 読めて いる（この 検査そのものが 空回りして いない）", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    const data = JSON.parse(readFileSync(join(dir, name), "utf8")) as {
      rescueWord?: string;
      furigana?: [string, string][];
    };
    /*
     * あいことばの 無い 教材は 逃げ道を 置かない ことを 選んだ もの（指定 B）なので
     * ここでは 何も 言わない。**入れた のに 開かない** ときだけ 落とす。
     */
    if (!data.rescueWord) continue;

    it(`${name}: そのままでも、かなでも 開く`, () => {
      const furigana = buildFuriganaIndex(data.furigana ?? []);
      const word = data.rescueWord as string;
      expect(opensRescue(word, data, furigana)).toBe(true);
      // 読み辞書に 読みが あるなら、その かなでも 開く（漢字を 出せない 学習者の 道）
      const reading = (data.furigana ?? []).find(([term]) => term === word)?.[1];
      if (reading) expect(opensRescue(reading, data, furigana)).toBe(true);
    });
  }
});
