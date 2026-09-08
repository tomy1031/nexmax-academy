/**
 * たいわの 相手（1人でも 3人でも 同じ 形で 持つ）
 *
 * ## なぜ 要るか
 * 「アプリの 要件定義」（youken2）は **山本社長・お茶の 先生・店長の 3人**が 同じ Zoom に
 * いる（2026-09-08 の 指定「複数人を Zoom UI で出す。マイクは 誰に 話しかけるかを
 * 選択可能に」）。学習者は 🎤 で 相手を 選んで 聞く。**だれが 何を 知って いるか**
 *（役割）を 考える ことが この 教材の 学びで、聞く 相手を まちがえると 札は 開かない。
 *
 * これまでの 教材（お客さまインタビュー 5話・山本社長）は 相手が 1人で、データは
 * `client` と `interview.persona` に 分かれて いる。ここで **1人でも 3人でも 同じ 並び**
 *（`TalkPerson[]`）に そろえて、画面が 「1人の とき」と「3人の とき」で 別の 道を
 * 持たない ように する（道が 2本 あると 片方が 必ず 腐る）。
 *
 * 純関数だけ。Live が 無い 環境でも 単体テストで 検証できる。
 */

import type { Scenario, ScenarioReq, ScenarioReqKind } from "@/content/schema";
import type { FuriganaEntry } from "@/lib/text/furigana";
import { resolveMatch, type MatchableReq } from "./req-matcher";

/** 主催者（client）の id。`reqs[].owner` を 省いた 札は この 人の もの。 */
export const CLIENT_ID = "client";

export type TalkAccent = "sky" | "leaf" | "sun" | "coral" | "grape";

export interface TalkPerson {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly desc: string;
  readonly voice: string;
  readonly avatar: string;
  readonly tip: string;
  readonly accent: TalkAccent;
  /** Live の systemInstruction。 */
  readonly persona: string;
}

/** 教材の 相手を 1つの 並びに する。先頭は いつも 主催者（client）。 */
export function talkPeople(scenario: Scenario): readonly TalkPerson[] {
  const client: TalkPerson = {
    id: CLIENT_ID,
    ...scenario.client,
    accent: "leaf",
    persona: scenario.interview.persona,
  };
  const others = (scenario.interview.others ?? []).map<TalkPerson>((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    desc: person.desc,
    voice: person.voice,
    avatar: person.avatar,
    tip: person.tip,
    accent: person.accent,
    persona: person.persona,
  }));
  return [client, ...others];
}

/** その 札を 知って いる 人。省いて あれば 主催者。 */
export function ownerOf(req: Pick<ScenarioReq, "owner">): string {
  return req.owner ?? CLIENT_ID;
}

/** `avatar` が `/img/...` なら 顔の 絵。そうでなければ 頭文字の 丸（call-shell の 既定）。 */
export function avatarSrc(person: Pick<TalkPerson, "avatar">): string | null {
  return person.avatar.startsWith("/") ? person.avatar : null;
}

/**
 * 発話が **いま 話しかけて いる 人**に 対して、どの 札を 開くかを 決める。
 *
 * - `opened`      … 話題が 合い、聞いた 相手が 担当 → 札が 開く
 * - `wrongPerson` … 話題は 合って いるが、担当は 別の 人 → 札は 開かず、担当を 教える
 *                   （役割を 考える 練習そのもの。ぼかさず「◯◯が くわしい」と 言い切る — 規律1）
 * - `close`       … 1語だけ 当たった（あと ひとこと）
 * - `none`        … あいさつ・関係の ない 話
 *
 * 判定の 芯は これまでの `resolveMatch`（ことばの 照合）で、ここは **担当の 突き合わせ**を
 * 足しただけ。相手が 1人の 教材では 担当は 全部 その人なので、これまでと 同じ 結果に なる。
 */
export type AddressedOutcome =
  | { readonly kind: "opened"; readonly reqId: string }
  | { readonly kind: "wrongPerson"; readonly reqId: string; readonly ownerId: string }
  | { readonly kind: "close"; readonly near: string }
  | { readonly kind: "none" };

export function judgeAddressed({
  utterance,
  reqs,
  openIds,
  targetId,
}: {
  utterance: string;
  reqs: readonly (MatchableReq & Pick<ScenarioReq, "owner">)[];
  openIds: ReadonlySet<string>;
  /** いま 話しかけて いる 人の id。 */
  targetId: string;
}): AddressedOutcome {
  const outcome = resolveMatch({ utterance, reqs, openIds, aiReqId: null });
  if (outcome.reqId) {
    const req = reqs.find((r) => r.id === outcome.reqId);
    const ownerId = req ? ownerOf(req) : CLIENT_ID;
    if (ownerId === targetId) return { kind: "opened", reqId: outcome.reqId };
    return { kind: "wrongPerson", reqId: outcome.reqId, ownerId };
  }
  if (outcome.near) return { kind: "close", near: outcome.near };
  return { kind: "none" };
}

/** 会話の 1行（画面の 字幕・相手を 切りかえても 残す）。 */
export interface TalkLine {
  /** "me" か 相手の id。 */
  readonly from: string;
  readonly text: string;
  readonly mode: "text" | "voice";
  /** 台本の 返事（Live が 無い ときに 画面が 出す）。読みは 教材の 辞書で 引ける。 */
  readonly scripted?: boolean;
}

/** つなぎ直す ときに 相手へ 渡す、これまでの 会話の 行数。 */
export const CONTEXT_LINES = 10;

/**
 * 相手を 切りかえて つなぎ直す ときの systemInstruction。
 *
 * Live は 1本の つなぎに 1人の 声しか 持てない ので、相手を かえる＝つなぎ直す。
 * そのまま つなぐと、その 人は **会議の 途中から 記憶が 無い**（さっき 学習者が
 * 社長に 聞いた ことを 知らない）。だから これまでの 会話を 添えて、「同じ 会議に
 * ずっと いた 人」として 続きから 話させる。あいさつを やり直させない。
 */
export function personaWithContext(
  person: TalkPerson,
  history: readonly TalkLine[],
  people: readonly TalkPerson[],
): string {
  const recent = history.slice(-CONTEXT_LINES);
  if (recent.length === 0) return person.persona;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const lines = recent.map((line) =>
    line.from === "me" ? `学習者: ${line.text}` : `${nameOf(line.from)}: ${line.text}`,
  );
  return [
    person.persona,
    "",
    "【これまでの 会話】",
    "あなたは この 会議に はじめから いました。下の やりとりは もう 聞いて います。",
    "会議の はじめの あいさつは もう すんで います。学習者が はじめて あなたに 話しかけた ときだけ、名前と 立場を 1つの 文で 名乗ってから 答えます（「はじめまして」の 長い あいさつは しません）。そのあとは この 続きとして 1つか 2つの 文で 答えます。",
    ...lines,
  ].join("\n");
}

/** ボードの 段（要件の 種類）。並びは 要件定義の 整理の 順。 */
export const REQ_KIND_ORDER: readonly ScenarioReqKind[] = [
  "problem",
  "functional",
  "nonfunctional",
  "constraint",
];

/** 段の 見出し（画面の ことば。読みは `PEOPLE_FURIGANA`）。 */
export const REQ_KIND_LABEL: Record<ScenarioReqKind, string> = {
  problem: "😥 こまって いる こと",
  functional: "⚙️ 機能要件（アプリが する こと）",
  nonfunctional: "🛡️ 非機能要件（アプリの ようす・まもる こと）",
  constraint: "💰 予算・納期・きまり",
};

/** 種類ごとに 札を まとめる。種類の 無い 札は `null` の 段（1人の 教材は 全部 ここ）。 */
export function groupReqsByKind(
  reqs: readonly ScenarioReq[],
): readonly { readonly kind: ScenarioReqKind | null; readonly reqs: readonly ScenarioReq[] }[] {
  const groups = REQ_KIND_ORDER.map((kind) => ({
    kind,
    reqs: reqs.filter((req) => req.kind === kind),
  })).filter((group) => group.reqs.length > 0);
  const rest = reqs.filter((req) => !req.kind);
  return rest.length > 0 ? [{ kind: null, reqs: rest }, ...groups] : groups;
}

/**
 * 画面が 自分で 出す 字の 読み（教材の 辞書とは 混ぜない — memo-step の MEMO_FURIGANA と 同じ 分けかた）。
 */
export const PEOPLE_FURIGANA: readonly FuriganaEntry[] = [
  ["非機能要件", "ひきのうようけん"],
  ["機能要件", "きのうようけん"],
  ["予算", "よさん"],
  ["納期", "のうき"],
  ["話", "はな"],
  ["聞", "き"],
  ["人", "ひと"],
];
