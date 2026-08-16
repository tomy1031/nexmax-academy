/**
 * 話した日本語を見て、つぎに直すところを1つだけ返す。
 *
 * ## なぜ1つだけか
 * 直すところを3つ並べると、学習者は「ぜんぶ だめだった」と受け取る（設計01 P8）。
 * 会話の練習で止めたいのは沈黙であって、間違いではない。だから
 * **できたことを先に言い、直すのは いちばん効く1つだけ**にする。
 *
 * ## なぜAIに投げないか
 * ここで見るのは「ていねいさ」「長さ」「文の終わり」といった、規則で判る形だけ。
 * 規則で判ることをAIに投げると、返事を待つ数秒ぶん会話が止まり、しかも毎回
 * 同じ助言が違う言い方で返る。**同じ間違いには同じ言葉で返す**ほうが学習者は覚える。
 * 意味の当否や自然さの助言は、AIを足すときにこの層の外側へ重ねる。
 */

/** 助言の種類。文言は下の ADVICE が持つ（自由文字列を画面に書かない）。 */
export type AdviceKey = "empty" | "tooShort" | "notPolite" | "noPeriod" | "good";

export interface AdviceText {
  /** できたことの ひとこと。 */
  readonly praise: string;
  /** つぎに直すところ（無いときは null）。 */
  readonly fix: string | null;
  /** 直したあとの言い方の例（無いときは null）。 */
  readonly example: string | null;
}

const ADVICE: Record<AdviceKey, (answer: string) => AdviceText> = {
  empty: () => ({
    praise: "だいじょうぶです。ゆっくりで いいですよ。",
    fix: "まだ 何も 書いて いません。ヒントを 見て、1つだけ 書いて みましょう。",
    example: null,
  }),
  tooShort: (answer) => ({
    praise: "書けましたね。",
    fix: "もう すこし 長く 言うと、もっと よく つたわります。",
    example: `${answer}です。`,
  }),
  notPolite: (answer) => ({
    praise: "つたわりました！",
    fix: "しごとでは「です」「ます」を つかいます。",
    example: `${answer}です。`,
  }),
  noPeriod: () => ({
    praise: "いい 答えです。",
    fix: "さいごに「。」を つけると、文が おわった ことが わかります。",
    example: null,
  }),
  good: () => ({
    praise: "とても いい 言い方です！ そのままで つうじます。",
    fix: null,
    example: null,
  }),
};

/** 文の終わりが ていねい形か。 */
const POLITE_END = /(です|ます|でした|ました|ですか|ますか)[。！？!?]?\s*$/u;
/** 句点で終わっているか。 */
const HAS_PERIOD = /[。！？!?]\s*$/u;

/**
 * 答えを見て、返す助言を決める。
 *
 * 見る順は「答えていない → 短すぎる → ていねいでない → 句点が無い → よい」。
 * 上から順に1つ目で止めるのは、いちばん効く1つだけ返すため。
 */
export function checkJapanese(raw: string): { key: AdviceKey; text: AdviceText } {
  const answer = raw.trim();
  if (answer.length === 0) return { key: "empty", text: ADVICE.empty(answer) };
  // 1〜2文字は名前や国名のこともあるので「まちがい」にはしない。長くする提案に留める
  if ([...answer].length <= 3) return { key: "tooShort", text: ADVICE.tooShort(answer) };
  if (!POLITE_END.test(answer)) return { key: "notPolite", text: ADVICE.notPolite(answer) };
  if (!HAS_PERIOD.test(answer)) return { key: "noPeriod", text: ADVICE.noPeriod(answer) };
  return { key: "good", text: ADVICE.good(answer) };
}

/*
 * おうむ返しに 差し込む「答えの 中身」の 取り出しは ここに 置かない。
 * 以前 ここに あった `coreOf` は 末尾の「します。」だけを 削る 作りで、
 * 「ソピアです。よろしく おねがいします。」を「ソピアです。よろしく おねがいし」に
 * していた。文の 切り出しは 差し込みと ひとつづきの 仕事なので、
 * `src/lib/meeting/speech.ts` の `answerCore`（`fillAnswer` が 中で 呼ぶ）が 持つ。
 */
