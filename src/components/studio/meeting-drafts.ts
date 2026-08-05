/**
 * ミーティングの空の下書きと、エディタが使う判定（コンテンツスタジオ）
 *
 * ミーティングは「参加者・台本・キーワード」が互いに縛り合っている教材で、
 * schema.ts の superRefine が ①participants にない話者 ②台本に出てこないキーワード
 * の2つで保存を止める。止まった理由は保存を押すまで分からないので、同じ判定を
 * ここに純関数で置き、エディタが入力中に画面へ出せるようにしておく。
 *
 * ここの判定がスキーマとずれると「画面では何も言われないのに保存できない」になり、
 * 先生が原因を探せなくなる。判定の書き方（joinして includes）はスキーマに合わせてある。
 */

import type { Meeting, MeetingParticipant } from "@/content/schema";

/** 台本の話す人に使える特別枠。participants には入れない（schema.ts の superRefine と同じ）。 */
export const SPEAKER_ME = "me";
export const SPEAKER_NARRATION = "narration";

/**
 * 「＋ミーティング」を押した直後の形。
 *
 * 台本は2行から（スキーマの下限）、参加者は1人ぶんの空欄から始める。
 * 中身が空のままでは保存の検査で止まるが、それは意図どおり（検査が公開可否を決める）。
 */
export function emptyMeeting(): Meeting {
  return {
    kind: "meeting",
    id: "",
    title: "",
    description: "",
    focus: "",
    participants: [emptyMeetingParticipant()],
    script: [
      { speaker: SPEAKER_NARRATION, text: "" },
      { speaker: SPEAKER_ME, text: "" },
    ],
    keywords: [],
    revealGoal: 30,
  };
}

/** 参加者1人ぶんの空欄。accent は既定の「そら」から始める。 */
export function emptyMeetingParticipant(): MeetingParticipant {
  return { id: "", name: "", role: "", accent: "sky" };
}

/** タイルの色（先生向けの表示名）。学習者の画面では縁とイニシャルの色になる。 */
export const MEETING_ACCENT_OPTIONS: readonly {
  value: MeetingParticipant["accent"];
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
export function missingKeywords(meeting: Meeting): string[] {
  const transcript = meeting.script.map((line) => line.text).join("");
  return meeting.keywords.filter((keyword) => keyword.length > 0 && !transcript.includes(keyword));
}

/**
 * その話者が話している台本の行数を数える。
 *
 * 参加者を消しても台本の行は残る。残った行は話者が participants にない状態になり、
 * 保存の検査で止まる。消す前に「何行が宙に浮くか」を見せるために使う。
 * "me" / "narration" も数えられる（台本の組み立てを見直すときの目安になる）。
 */
export function countLinesBySpeaker(meeting: Meeting, speakerId: string): number {
  return meeting.script.filter((line) => line.speaker === speakerId).length;
}
