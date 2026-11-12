import { novelFailureTypes, type NovelFailureType, type NovelScene } from "@/content/schema";

/**
 * 相談の 練習（サウンドノベル）の 判定 — Gemini に 渡す 指示と、返事の 読み取り
 *
 * ## Gemini は 判定だけ（仕様書 v4 §5）
 * 返すのは 合格か・3つの 要素の あるなし・失敗の 型・聞き取った 文 だけ。
 * **学生に 見せる 文は 1つも 作らせない**——相手の 反応・ヒント・お手本は 教材の データ
 *（`novel.reactions` と `consult`）から 出す。N4 を こえる 日本語が 画面に 出ない ため。
 *
 * ## 合格は コードが 決める
 * 「3つが 全部 入って いて、失敗の 型に 当たらない」を ここで 数え直す。
 * Gemini が `pass` と 言っても 要素が 1つ 欠けて いれば やり直しに する——
 * 基準を AI の さじ加減に しない（朝礼・夕礼の `panels.ts` と 同じ 考え方）。
 *
 * 見ない もの: 助詞や 活用の まちがい・発音・敬語の レベル・語順・言いよどみ。
 */

export type NovelConsult = Extract<NovelScene, { type: "consult" }>;

export interface NovelJudgment {
  readonly result: "pass" | "retry";
  readonly hasContext: boolean;
  readonly hasProblem: boolean;
  readonly hasAsk: boolean;
  readonly failureType: NovelFailureType | "none";
  readonly heard: string;
}

/** 道具の 名前（仕様書 §5 の `report_judgment`）。 */
export const NOVEL_TOOL_NAME = "report_judgment";

/** 判定係への 決まり（つなぎの あいだ ずっと 変わらない もの）。 */
export const NOVEL_JUDGE_SYSTEM = [
  "あなたは 日本語の 授業の 判定係です。",
  "学生（日本語 N4・IT専攻）が、職場で 先輩に 相談する 練習を します。",
  "学生の ことばが とどいたら、かならず 1回だけ 道具 report_judgment を 呼びます。",
  "声では 返事を しません（道具を 呼ぶだけ）。学生に 話しかけません。",
  "意味が 伝われば よいです。助詞や 活用の まちがい・発音・敬語の レベル・語順・言いよどみは 見ません。",
  "お手本と 同じ ことばで なくても かまいません。",
].join("\n");

const FAILURE_NOTES: Record<NovelFailureType, string> = {
  vague: "①か ②が ない（何の 話か 分からない）",
  no_ask: "③が ない（相手に 何を して ほしいかが ない）",
  blaming: "「おかしい」「まちがって いる」と 言うだけで、何が ちがうかの 中身が ない",
  decided_alone:
    "自分で 決めた・約束した と 言う（「できます」「〜します」と 相手の 仕事を 決める）",
  hiding: "「たぶん 大丈夫」など、問題を そのまま 言わない",
  off_topic: "いまの 相談と 別の 話を して いる",
  unclear_audio: "声が 小さい・雑音が 多くて、ことばが ほとんど 聞き取れない",
};

export const NOVEL_TOOL = {
  functionDeclarations: [
    {
      name: NOVEL_TOOL_NAME,
      description:
        "学生の 相談を 見て、①②③の あるなしと 失敗の 型を 返す。学生が 話すたびに かならず 1回だけ 呼ぶ。",
      parameters: {
        type: "OBJECT",
        properties: {
          result: {
            type: "STRING",
            enum: ["pass", "retry"],
            description: "①②③が 全部 あり、失敗の 型に 当たらなければ pass。それ以外は retry。",
          },
          has_context: { type: "BOOLEAN", description: "① 見たもの・した ことが 入って いるか。" },
          has_problem: { type: "BOOLEAN", description: "② ちがい・問題が 入って いるか。" },
          has_ask: { type: "BOOLEAN", description: "③ 質問・お願いが 入って いるか。" },
          failure_type: {
            type: "STRING",
            enum: ["none", ...novelFailureTypes],
            description: "いちばん 当てはまる 失敗の 型。当たらなければ none。",
          },
          heard: { type: "STRING", description: "学生の ことば（とどいた 文を そのまま）。" },
        },
        required: ["result", "has_context", "has_problem", "has_ask", "failure_type", "heard"],
      },
    },
  ],
};

/** 1回ぶんの 頼み（その 相談の 判定基準＋学生の ことば）。 */
export function buildNovelJudgePrompt(
  consult: NovelConsult,
  partnerName: string,
  utterance: string,
): string {
  const types = (Object.keys(FAILURE_NOTES) as NovelFailureType[])
    .map((type) => `- ${type}: ${FAILURE_NOTES[type]}`)
    .join("\n");
  return [
    `場面: 学生は ${partnerName}さんに 相談して います（話題: ${consult.topic}）。`,
    "この 相談の 判定の 基準:",
    `① 見たもの・した こと: ${consult.criteria.context}`,
    `② ちがい・問題: ${consult.criteria.problem}`,
    `③ 質問・お願い: ${consult.criteria.ask}`,
    consult.criteria.note ? `気を つける こと: ${consult.criteria.note}` : null,
    "失敗の 型:",
    types,
    `参考の お手本（同じ ことばで なくて よい）: ${consult.example}`,
    "",
    `学生の ことば: 「${utterance}」`,
    "",
    "道具 report_judgment を 1回だけ 呼んで ください。",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

const asBool = (value: unknown): boolean => value === true || value === "true";

/**
 * 道具の 返事 → 判定。崩れて いたら null（画面は「もう一度」を 出す）。
 *
 * **合格は ここで 決め直す**: 3つ 全部 true で、型が none の ときだけ pass。
 * 型が none なのに 要素が 欠けて いれば、欠けた ものから 型を 決める
 *（②が 無い → vague、③だけ 無い → no_ask）。
 */
export function parseNovelJudgment(
  args: Record<string, unknown> | null,
  utterance: string,
): NovelJudgment | null {
  if (!args || typeof args !== "object") return null;
  const hasContext = asBool(args.has_context);
  const hasProblem = asBool(args.has_problem);
  const hasAsk = asBool(args.has_ask);
  const rawType = typeof args.failure_type === "string" ? args.failure_type : "none";
  const knownType = (novelFailureTypes as readonly string[]).includes(rawType)
    ? (rawType as NovelFailureType)
    : "none";
  const heard =
    typeof args.heard === "string" && args.heard.trim() ? args.heard.trim() : utterance.trim();
  return settleJudgment({ hasContext, hasProblem, hasAsk, failureType: knownType, heard });
}

/** 要素と 型から 合否を 決める（AI でも 手元の 照合でも 同じ 決まりを 通す）。 */
export function settleJudgment(input: {
  hasContext: boolean;
  hasProblem: boolean;
  hasAsk: boolean;
  failureType: NovelFailureType | "none";
  heard: string;
}): NovelJudgment {
  const { hasContext, hasProblem, hasAsk, heard } = input;
  let failureType = input.failureType;
  if (failureType === "none") {
    if (!hasContext || !hasProblem) failureType = "vague";
    else if (!hasAsk) failureType = "no_ask";
  }
  const pass = failureType === "none" && hasContext && hasProblem && hasAsk;
  return {
    result: pass ? "pass" : "retry",
    hasContext,
    hasProblem,
    hasAsk,
    failureType: pass ? "none" : failureType,
    heard,
  };
}

/**
 * お手本を 声に 出して 読んだか（3回目の 合格の 条件・仕様書 §6）。
 *
 * 聞き取りは 漢字・かな・句読点が ゆれるので、空白と 記号を 落とし、**2文字の かたまり**が
 * どれだけ 重なるかで 見る。半分 重なれば 読んだ ものと する——一字一句は 求めない。
 */
export function readsExample(utterance: string, example: string): boolean {
  const fold = (text: string) => text.replace(/[\s、。，．,.!?！？「」『』（）()・…〜~ー-]/g, "");
  const pairs = (text: string) => {
    const out = new Set<string>();
    for (let i = 0; i + 1 < text.length; i += 1) out.add(text.slice(i, i + 2));
    return out;
  };
  const said = pairs(fold(utterance));
  const model = pairs(fold(example));
  if (model.size === 0 || said.size === 0) return false;
  let hit = 0;
  for (const pair of model) if (said.has(pair)) hit += 1;
  return hit / model.size >= 0.5;
}

/** 失敗の 回数 → 星（1回で 合格 3つ・ヒントを 見て 2つ・お手本を 読んで 1つ）。 */
export function starsForFails(fails: number): 1 | 2 | 3 {
  if (fails <= 0) return 3;
  if (fails <= 2) return 2;
  return 1;
}

/** 失敗の 回数 → いま 出す 支え（0=なし・1=反応と 光る 番号・2=穴あき・3=お手本）。 */
export function retryLevel(fails: number): 0 | 1 | 2 | 3 {
  if (fails <= 0) return 0;
  if (fails === 1) return 1;
  if (fails === 2) return 2;
  return 3;
}
