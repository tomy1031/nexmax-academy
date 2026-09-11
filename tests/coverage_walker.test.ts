import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { collectLabeledTexts } from "@/lib/content-checks";
import { contentSchema, type Content } from "@/content/schema";

/**
 * **ふりがなの 検査が 見て いない ところ**を 見つける（2026-09-11）
 *
 * ## なぜ 要るか
 * 規律2（ふりがな全覆い）の 入り口は `collectLabeledTexts` で、これは
 * **教材の 種類ごとに 手で 書いた 一覧**である。スキーマに 欄を 足した 人が
 * ここを 足し忘れると、**その 欄だけ 検査の 外**に 出る——
 * `lint:content` も CI も 緑の まま、画面にだけ 裸の 漢字が 出る。
 *
 * 2026-09-11 に 実発生した: `meetingSchema.asakai`（朝礼・夕礼の 5場面）を
 * 足した とき、`collectLabeledTexts` に 1行も 足して いなかった。
 * あとから 足したら **142件**の 裸の漢字と 読みちがいが 出た
 *（「先生 18人（ひと）に 見せる」「同じ ことの 行（い）は 1つに まとめます」）。
 * 同じ 形の 事故は 2026-08-26 の DB でも 起きて いる——
 * **検査が 見て いない ことは、検査では 気づけない。**
 *
 * ## どう 見つけるか
 * 教材の JSON を **まるごと 深く 歩いて** 文字列を ぜんぶ 集め、
 * そこから「学習者が 読まない もの」（下の `NOT_LEARNER_TEXT`）を 引く。
 * のこりが `collectLabeledTexts` の 出力に 入って いなければ、
 * **検査の 外に 出て いる 学習者の 字**である。
 *
 * ## 足しかた
 * 新しい 欄が 学習者に 見えるなら `collectLabeledTexts` に 足す。
 * 見えない（AIへの 言い渡し・当たり判定の 材料・id・URL）なら
 * `NOT_LEARNER_TEXT` に **理由つきで** 足す。どちらかを 必ず 選ばせる。
 */

const ROOT = join(__dirname, "..");

/**
 * 学習者が 読まない 欄（キーの 名前で 判断する）。
 *
 * **書く＝画面に 出ない ことを 目で 確かめた 印**（`yomi_allow` と 同じ 運用）。
 */
const NOT_LEARNER_TEXT: readonly { key: RegExp; why: string }[] = [
  { key: /^kind$/, why: "教材の 種類（データの 型）" },
  { key: /^id$/, why: "保存の ための 名前" },
  { key: /(^|\.)ref$/, why: "ほかの 教材を 指す 名前" },
  { key: /(^|\.)type$/, why: "種別" },
  { key: /(^|\.)speakerId$/, why: "だれが 言うかの id" },
  { key: /(^|\.)persona$/, why: "AIへの 言い渡し（画面に 出ない）" },
  { key: /(^|\.)judgePrompt$/, why: "AIへの 言い渡し（画面に 出ない）" },
  { key: /(^|\.)keywords(\[|$)/, why: "当たり判定の 材料（画面に 出ない）" },
  { key: /(^|\.)accept(\[|$)/, why: "当たり判定の 材料" },
  { key: /(^|\.)allOf(\[|$)/, why: "当たり判定の 材料" },
  { key: /(^|\.)fact$/, why: "AIに 渡す「言えたら わかる 中身」（画面に 出ない）" },
  { key: /(^|\.)prompt$/, why: "絵を 作る ための 英語の 指示" },
  { key: /(^|\.)status$/, why: "したがき か 公開か" },
  { key: /(^|\.)audio(Url)?$/, why: "音の 置き場" },
  { key: /(^|\.)image$/, why: "絵の 置き場" },
  { key: /(^|\.)src$/, why: "絵の 置き場" },
  { key: /(^|\.)url$/, why: "リンク先" },
  { key: /(^|\.)href$/, why: "リンク先" },
  { key: /(^|\.)voice$/, why: "声の 名前" },
  { key: /(^|\.)reading$/, why: "読みそのもの（かな）" },
  { key: /(^|\.)romaji$/, why: "ローマ字" },
  { key: /(^|\.)furigana(\[|$)/, why: "読み辞書そのもの" },
  { key: /(^|\.)wordIds(\[|$)/, why: "ことばを 指す 名前" },
  { key: /(^|\.)wordStageIds(\[|$)/, why: "ことばステージを 指す 名前" },
  { key: /(^|\.)color$/, why: "色の 名前" },
  { key: /(^|\.)tone$/, why: "見た目の つまみ" },
  { key: /(^|\.)accent$/, why: "色の 名前" },
  { key: /(^|\.)icon$/, why: "絵文字" },
  { key: /(^|\.)face$/, why: "絵文字" },
  { key: /(^|\.)size$/, why: "見た目の つまみ" },
  { key: /(^|\.)kindLabel$/, why: "種別の 呼び名（コードが 持つ）" },
  { key: /(^|\.)day$/, why: "曜日の 記号（mon…fri）" },
  { key: /(^|\.)box$/, why: "箱の 名前は カードの 中で 別に 検査する" },
  { key: /(^|\.)rule$/, why: "当たり判定の やり方" },
  { key: /(^|\.)key$/, why: "行の 名前（データの 型）" },
  { key: /(^|\.)level$/, why: "むずかしさ（easy / hard）" },
  { key: /(^|\.)chairId$/, why: "司会の id" },
  { key: /(^|\.)mode$/, why: "ばん（ask / listen）" },
  { key: /(^|\.)phase$/, why: "学習の 段（データの 型）" },
  { key: /(^|\.)nekumax$/, why: "ネクマックスの 出しかた" },
  { key: /(^|\.)answerMode$/, why: "やりかた（データの 型）" },
  { key: /(^|\.)password$/, why: "先生が 配る 合いことば" },
  { key: /(^|\.)fieldSequence(\[|$)/, why: "ゲームの 背景の 名前" },
  { key: /(^|\.)state$/, why: "箱の 状態（done / now / later）" },
  { key: /(^|\.)from$/, why: "準備フォームの 設問を 指す 名前" },
  { key: /(^|\.)refs(\[|$)/, why: "絵の 置き場" },
  { key: /(^|\.)looks$/, why: "絵を 作る ための 英語の 指示" },
  { key: /(^|\.)speaker$/, why: "だれが 言うかの id" },
];

/** 漢字か かなを 含む＝日本語の 文（記号・英数だけの 値は 見ない）。 */
const JAPANESE = /[ぁ-んァ-ヶ一-鿿]/u;

function deepStrings(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === "string") {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => deepStrings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      deepStrings(v, path === "" ? k : `${path}.${k}`, out);
    }
  }
}

function contentFiles(): { file: string; content: Content }[] {
  const out: { file: string; content: Content }[] = [];
  const dirs = readdirSync(join(ROOT, "content"), { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  );
  for (const dir of dirs) {
    for (const name of readdirSync(join(ROOT, "content", dir.name))) {
      if (!name.endsWith(".json")) continue;
      const file = `content/${dir.name}/${name}`;
      const parsed = contentSchema.safeParse(
        JSON.parse(readFileSync(join(ROOT, file), "utf8")) as unknown,
      );
      if (parsed.success) out.push({ file, content: parsed.data });
    }
  }
  return out;
}

/**
 * **いま すでに 検査の 外に 出て いる 欄**（2026-09-11 に 数えた）。
 *
 * `KNOWN_BARE_KANJI`（`tests/e2e/furigana.spec.ts`）と 同じ 運用で、
 * **ここに 無い ものが 出たら 落とす**——直すか どうかは 画面の 持ち主が 決めるが、
 * **数を 増やさない こと**だけを 機械が 守る。1つ 直したら 1行 消す。
 *
 * 借金の 中身（2026-09-11 現在・のべ 1617件）:
 *
 * - `quest.*` … **クエスト教材 まるごと**（のべ 583件）。30の 場面の セリフ・
 *   4択の 本文・結果の 文が 1つも 検査されて いない。朝礼・夕礼と 同じ 形の 穴で、
 *   いちばん 大きい。別タスクで 拾う
 * - `vocab.words[].term` … ことばの 見出し（917件）。`coverageEntries` が
 *   「見出しと 読みを 並べて 見せる ので 覆われて いる」と 扱って いる ぶん
 * - `scenario.research.pages[].html` … 調査用の 模擬ページ（HTMLの 中身）
 * - `quizset.questions[].placeholder` … 入力欄の うすい 字。**学習者に 見える**
 * - `character.name` / `role` / `personality` … 人物カード
 * - `wordstage.label` / `manga.pages[].note` / `quizset.…groups[].label` / `scenario.words[].r`
 */
const KNOWN_ESCAPED: readonly string[] = [
  "character.name",
  "character.personality",
  "character.role",
  "manga.pages[].note",
  "quest.description",
  "quest.focus",
  "quest.phases[].chapter",
  "quest.phases[].desc",
  "quest.phases[].dialogue[].text",
  "quest.phases[].enemy.name",
  "quest.phases[].name",
  "quest.phases[].options[].explanation",
  "quest.phases[].options[].resultText",
  "quest.phases[].options[].text",
  "quest.phases[].question",
  "quest.title",
  "quizset.questions[].groups[].label",
  "quizset.questions[].placeholder",
  "scenario.research.pages[].html",
  "scenario.words[].r",
  "vocab.words[].term",
  "wordstage.label",
];

describe("ふりがなの 検査が 見て いない 学習者の 字は 無い", () => {
  const files = contentFiles();

  it("教材が 1件 以上 読めて いる（この 検査そのものが 空回りして いない）", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("検査の 外に 出て いる 欄が、記録より 増えて いない", () => {
    const escaped = new Map<string, string>();

    for (const { file, content } of files) {
      const checked = new Set(collectLabeledTexts(content).map((item) => item.text));
      const all: [string, string][] = [];
      deepStrings(content, "", all);

      for (const [path, text] of all) {
        if (!JAPANESE.test(text)) continue;
        if (NOT_LEARNER_TEXT.some((rule) => rule.key.test(path))) continue;
        if (checked.has(text)) continue;
        /* 並びの 番号を 落として「欄の 形」に する（1つの 欄が 何百件にも 見えない ように）。 */
        const shape = `${content.kind}.${path.replace(/\[\d+\]/gu, "[]")}`;
        if (!escaped.has(shape)) escaped.set(shape, `${file} ${path} 「${text.slice(0, 30)}」`);
      }
    }

    /*
     * 落ちた ときの 直しかたは 3つ:
     *  - 学習者に 見える 欄 → `collectLabeledTexts` に 足す（これが 本すじ）
     *  - 見えない 欄       → `NOT_LEARNER_TEXT` に **理由つきで** 足す
     *  - どちらでも ない   → `KNOWN_ESCAPED` に 足す（**借金を 1行 増やす**。
     *                       なぜ いま 直せないかを コメントに 書く）
     */
    const fresh = [...escaped]
      .filter(([shape]) => !KNOWN_ESCAPED.includes(shape))
      .map(([shape, where]) => `${shape}  （例: ${where}）`);
    expect(fresh).toEqual([]);
  });

  it("記録に あるのに もう 出て こない 欄は 消す（借金を 減らしたら 1行 消す）", () => {
    const shapes = new Set<string>();
    for (const { content } of files) {
      const checked = new Set(collectLabeledTexts(content).map((item) => item.text));
      const all: [string, string][] = [];
      deepStrings(content, "", all);
      for (const [path, text] of all) {
        if (!JAPANESE.test(text)) continue;
        if (NOT_LEARNER_TEXT.some((rule) => rule.key.test(path))) continue;
        if (checked.has(text)) continue;
        shapes.add(`${content.kind}.${path.replace(/\[\d+\]/gu, "[]")}`);
      }
    }
    expect(KNOWN_ESCAPED.filter((shape) => !shapes.has(shape))).toEqual([]);
  });
});
