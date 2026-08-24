/**
 * 管理画面のAI指示出し（08 拡張経路）で使うプロンプトの組み立て。
 *
 * ここは「何をAIに渡すか」の境界そのものなので、UIから分離して単体テストできる形に置く。
 * - **名前・メール・性別は渡さない**（08 §2.1 の匿名化境界）
 * - 仮名は profile_id の先頭8文字。連番だと出力のたびに別人を指す
 * - ガードレール（08 §5・§6）はプロンプトに逐語で同梱する。プロンプト頼みの守りが
 *   弱いことは 08 §1.1 で認めたとおりなので、**出力は必ず教師が読んでから使う**前提。
 *   この画面の生成結果は保存されない。
 */
import {
  PERSONALITY_AXIS_META,
  PERSONALITY_QUESTIONS,
  getPersonalityType,
  type PersonalityAnswer,
  type PersonalityScores,
  type PersonalityTypeCode,
} from "@/content/personality";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { hasCompletedPersonality } from "@/lib/personality-stats";
import type { ProfileRow } from "@/lib/profile-db";

/** AIに渡す1人ぶん。ここに無いものは渡していない、という台帳を兼ねる。 */
export interface AnonymousStudent {
  handle: string;
  typeName: string;
  scores: PersonalityScores;
  answers: PersonalityAnswer[];
  answerLanguage: string | null;
  languageSwitched: boolean;
}

/** 診断ずみの行（`hasCompletedPersonality` を通した行）。 */
type CompletedProfileRow = ProfileRow & { personality_type: PersonalityTypeCode };

export function anonymizeProfile(profile: CompletedProfileRow): AnonymousStudent {
  return {
    handle: profile.id.slice(0, 8),
    typeName: getPersonalityType(profile.personality_type).name,
    scores: profile.scores,
    answers: profile.answers,
    answerLanguage: profile.answer_language,
    languageSwitched: profile.language_switched,
  };
}

/** 診断ずみの行だけを匿名化して返す。 */
export function anonymizeCohort(profiles: readonly ProfileRow[]): AnonymousStudent[] {
  // 関数をそのまま渡す（アロー越しだと型が絞られず、null 混入を型で防げない）。
  return profiles.filter(hasCompletedPersonality).map(anonymizeProfile);
}

/** 設問台帳のコンパクトな写し。Codex はリポジトリを読めないので、必要な文脈は全部ここで渡す。 */
function questionLedger(): string {
  return PERSONALITY_QUESTIONS.map((question) => {
    const meta = PERSONALITY_AXIS_META[question.axis];
    return `Q${question.id}[${meta.question}] ${question.easy} / a=${question.a.easy}(${question.a.pole}) b=${question.b.easy}(${question.b.pole})`;
  }).join("\n");
}

/**
 * ガードレール。08 §5・§6 の規律の逐語。
 * 変更するときは docs/design/08_授業サポート表示設計.md を先に直すこと。
 */
const GUARDRAILS = `## 書き方のきまり（必ず守る）
- 日本語で書く。
- 生徒本人が読んでも、本人の診断結果画面と矛盾しない文章だけを書く。教師にしか見せられない評言を書かない。
- 事実（どの設問でどちらを選んだか・件数）は断定してよい。解釈は「〜かもしれません」で書く。
- 提案はすべて教師の行動（動詞で終える）。かつ「足す方向」だけ（選べるようにする・出番を作る・足場を足す）。
- 発言や出番を減らす提案（指名を控える・後回しにする・待つ）は書かない。回答は本人の第2・第3言語で行われており、内向性と日本語への不安を区別できないため。
- 軸スコアが2か3（3対2の僅差）の軸は、断定の根拠に使わない。「教室で確かめること」に回す。
- 1問だけを根拠に断定しない。同じ軸の2問以上を挙げる。
- 提案には「このやり方が合っていないサイン」を添える。サインは、その行動を実行している最中に観測できるものにする。
- 次の内容は書かない: 能力・成績・将来の予測 / 「弱い」「苦手」「できない」等の欠損表現 / 「〜な性格です」という人格の断定 / 生徒間の比較や順位 / 相性の否定（合わない・離す） / ストレス・メンタル・家庭・発達への言及 / 「要注意」等の警戒表現 / 係や役割の割り当ての推薦 / 性別・国籍・年齢による一般化
- 次の語を使わない: ${FORBIDDEN_LEARNER_WORDS.join("・")}
- 全部の軸が3対2なら、無理に提案を作らず「この回答からは根拠を出せません」と書く。`;

function studentBlock(student: AnonymousStudent): string {
  const scores = `ei=${student.scores.ei} sn=${student.scores.sn} tf=${student.scores.tf} jp=${student.scores.jp}（各軸0〜5。左の極E/S/T/Jを数える。2か3は僅差）`;
  const language =
    student.answerLanguage === null
      ? "記録なし（日本語または英語で回答）"
      : `${student.answerLanguage}${student.languageSwitched ? "（途中で切り替えあり）" : ""}`;
  return [
    `仮名: ${student.handle}`,
    `タイプ: ${student.typeName}`,
    `軸スコア: ${scores}`,
    `回答: ${student.answers.map((answer, index) => `Q${index + 1}=${answer}`).join(" ")}`,
    `回答言語: ${language}`,
  ].join("\n");
}

export function buildStudentPrompt(student: AnonymousStudent, extraInstruction: string): string {
  return [
    "あなたは日本語学校の教師を支援する文章作成の担当です。",
    "カンボジアのIT専攻学生（日本語N4前後）が受けた性格アンケートの回答をもとに、担任の教師向けのメモを書いてください。",
    "",
    GUARDRAILS,
    "",
    "## 20問の設問（Ⓐ/Ⓑどちらが どの極を数えるか）",
    questionLedger(),
    "",
    "## この生徒の回答",
    studentBlock(student),
    "",
    "## 出力の形",
    "1. 明日の授業でできること（0〜3件。各件: 行動 → 根拠にした設問番号2つ以上 → 合っていないサイン）",
    "2. 教室で確かめること（僅差の軸があれば）",
    "3. 前提の注意（回答言語について1行）",
    "見出し以外の装飾は不要。全体で400字以内。",
    extraInstruction ? `\n## 教師からの追加の指示\n${extraInstruction}` : "",
  ]
    .join("\n")
    .trim();
}

export function buildClassPrompt(
  cohort: readonly AnonymousStudent[],
  extraInstruction: string,
): string {
  const total = cohort.length;
  const questionCounts = PERSONALITY_QUESTIONS.map((question, index) => {
    const a = cohort.filter((student) => student.answers[index] === "a").length;
    return `Q${question.id}: a=${a} b=${total - a}`;
  }).join("\n");
  const typeCounts = new Map<string, number>();
  for (const student of cohort) {
    typeCounts.set(student.typeName, (typeCounts.get(student.typeName) ?? 0) + 1);
  }
  const distribution = [...typeCounts.entries()]
    .map(([name, count]) => `${name}: ${count}人`)
    .join(" / ");

  return [
    "あなたは日本語学校の教師を支援する文章作成の担当です。",
    `クラス全体（回答者${total}人）の性格アンケートの集計をもとに、授業の進め方への示唆を書いてください。`,
    "",
    GUARDRAILS,
    "- 個人の仮名や特定の1人に触れない。クラス全体の傾向だけを書く。",
    "- 一方に8割以上偏った設問は個人差の根拠にしない。「設問が一方向に働いている可能性」として注記する。",
    "- 4割〜6割に割れた設問こそ、ペアの組み方や課題の出し方の材料として使う。",
    "",
    "## 20問の設問（Ⓐ/Ⓑどちらが どの極を数えるか）",
    questionLedger(),
    "",
    "## 集計",
    `タイプ分布: ${distribution}`,
    "設問別の選択数:",
    questionCounts,
    "",
    "## 出力の形",
    "1. 授業への示唆（最大3件。各件: 事実（件数） → 含意 → 明日の一手）",
    "2. 偏りの注記（あれば）",
    "見出し以外の装飾は不要。全体で500字以内。",
    extraInstruction ? `\n## 教師からの追加の指示\n${extraInstruction}` : "",
  ]
    .join("\n")
    .trim();
}
