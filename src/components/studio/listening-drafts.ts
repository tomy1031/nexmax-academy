/**
 * リスニングの空の下書きと、エディタが使う判定（コンテンツスタジオ）
 *
 * リスニングは「参加者・台本・キーワード」が互いに縛り合っている教材で、
 * schema.ts の superRefine が ①participants にない話者 ②台本に出てこないキーワード
 * の2つで保存を止める。止まった理由は保存を押すまで分からないので、同じ判定を
 * ここに純関数で置き、エディタが入力中に画面へ出せるようにしておく。
 *
 * ここの判定がスキーマとずれると「画面では何も言われないのに保存できない」になり、
 * 先生が原因を探せなくなる。判定の書き方（joinして includes）はスキーマに合わせてある。
 */

import type { Listening, ListeningParticipant } from "@/content/schema";
import { DEFAULT_RESCUE_WORD, rescueWordOf } from "@/components/listening/listening-checks";
import { normalizeReading } from "@/lib/text/normalize";

/** 台本の話す人に使える特別枠。participants には入れない（schema.ts の superRefine と同じ）。 */
export const SPEAKER_ME = "me";
export const SPEAKER_NARRATION = "narration";

/**
 * 「＋リスニング」を押した直後の形。
 *
 * 台本は2行から（スキーマの下限）、参加者は1人ぶんの空欄から始める。
 * 中身が空のままでは保存の検査で止まるが、それは意図どおり（検査が公開可否を決める）。
 */
export function emptyListening(): Listening {
  return {
    kind: "listening",
    id: "",
    title: "",
    description: "",
    focus: "",
    participants: [emptyListeningParticipant()],
    script: [
      { speaker: SPEAKER_NARRATION, text: "" },
      { speaker: SPEAKER_ME, text: "" },
    ],
    keywords: [],
    revealGoal: 30,
    // あいことばは 入れた 形から 始める（空だと 逃げ道が 出ない。2026-09-22 の 指定）。
    // 教材ごとに その 課の 大事な ことばへ 変えてもらう。
    rescueWord: DEFAULT_RESCUE_WORD,
    // 「聞く」教材なので、既定は 顔を並べない再生プレイヤー。
    // 原稿は 穴埋めの 形で はじめから 出す（2026-09-16 の 指定）
    mode: "player",
    check: { minLength: 3, maxMiss: 3, showScript: true, showTyping: true },
  };
}

/** 参加者1人ぶんの空欄。accent は既定の「そら」から始める。 */
export function emptyListeningParticipant(): ListeningParticipant {
  return { id: "", name: "", role: "", accent: "sky" };
}

/** タイルの色（先生向けの表示名）。学習者の画面では縁とイニシャルの色になる。 */
export const LISTENING_ACCENT_OPTIONS: readonly {
  value: ListeningParticipant["accent"];
  label: string;
}[] = [
  { value: "sky", label: "そら" },
  { value: "leaf", label: "みどり" },
  { value: "sun", label: "たいよう" },
  { value: "coral", label: "コーラル" },
  { value: "grape", label: "ぶどう" },
];

/**
 * 台本に出てこないキーワードを返す。
 *
 * 聞き取りチェックは「台本の中の言葉を聞き取って入れる」遊びなので、台本に無い言葉を
 * キーワードにすると学習者が絶対に見つけられない。だからスキーマが保存を止める。
 * 判定はスキーマと同じ「全行の text をつないだ文字列に含まれるか」でそろえてある。
 *
 * 空文字（まだ何も入っていない行）は数えない。空欄は plainText の検査で別に止まるので、
 * ここで二重に出すと入力中の画面がうるさくなる。
 */
export function missingKeywords(listening: Listening): string[] {
  const transcript = listening.script.map((line) => line.text).join("");
  return listening.keywords.filter(
    (keyword) => keyword.length > 0 && !transcript.includes(keyword),
  );
}

/**
 * その話者が話している台本の行数を数える。
 *
 * 参加者を消しても台本の行は残る。残った行は話者が participants にない状態になり、
 * 保存の検査で止まる。消す前に「何行が宙に浮くか」を見せるために使う。
 * "me" / "narration" も数えられる（台本の組み立てを見直すときの目安になる）。
 */
export function countLinesBySpeaker(listening: Listening, speakerId: string): number {
  return listening.script.filter((line) => line.speaker === speakerId).length;
}

/**
 * あいことばが **聞く 前の 画面に そのまま 出て いる**か。
 *
 * 題・せつめい・「聞く まえに 配る 見かた」は まえおきの 画面に 出る。そこに
 * 同じ ことばが あると、**先生に 聞かなくても 読んで 打てる**——関所が 関所で
 * なくなる。2026-09-22 に 実際に 7本中 5本が こう なった
 *（「その 課の 要点」を 選んだ ら、要点は まさに 見かたに 書いて あった）。
 *
 * 参加者の 名前・役も 見る——`mode: "call"` では 顔と 一緒に 関所と 同じ 画面に 並ぶ。
 *
 * 比べかたは 判定と 同じ 正規化（空白・記号・かぎかっこを 落とす）。
 * 画面の 見たままを 打てば 通って しまう ので、そこまで 含めて 見る。
 *
 * **同じ ステージの ほかの 教材までは 見ない。** あいことばは その 課の ことば
 * なので、ステージの どこかには 必ず 出て くる（2026-09-22 に 広げて みて、
 * 短い キーワードは 例外なく 当たった）。守りたいのは
 * 「打って いる その 画面に 答えが 書いて ある」形だけ。
 */
export function rescueWordOnScreen(listening: Listening): boolean {
  const word = rescueWordOf(listening);
  if (word.length === 0) return false;
  const people = listening.participants.map((p) => `${p.name}${p.role}`).join("");
  const shown = normalizeReading(
    `${listening.title}${listening.description}${listening.focus}${people}`,
  );
  return shown.includes(normalizeReading(word));
}
