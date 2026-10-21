"use client";

import type { QuestPhase } from "@/content/schema";
import { assetUrl } from "@/lib/asset-url";
import type { QuestPlayer } from "@/lib/quest/state";

/**
 * クエストの 絵 — **ドット絵の 置き場は ここ 1か所だけ**に 書く
 *
 * 2026-10-20 に ドット絵の RPG へ 作りかえた。絵は どれも Codex（image-gen-2）で 描き、
 * 本物の ドット絵の 粗さに 直して `public/img/quest/` に 置いた
 *（指示書は `scripts/images/quest_pixel_*.json`）。手描きの SVG では 作らない（必ず守るルール 7）。
 *
 * - 背景 … 章ごとに 1枚（10枚）。その 工程の 場所の 絵
 * - 相手役 … 場面ごとに 1枚（30枚）。名前の 気分（せっかち・おサイフを きにする…）が 絵で 分かる
 * - 仲間 … 性格タイプ × 男女の ネクマックス（32枚）。タイプが まだの 人は 水色の 元の 姿
 *
 * パスは **`assetUrl` を 通す**——中身を 差しかえた とき、URL の `?v=` が 変わって
 * 学習者に 届く（`src/lib/asset-url.ts`）。
 */
const DIR = "/img/quest";

const two = (n: number) => String(n).padStart(2, "0");

/** 場面の 名前（「第2章：…」）から 章の 番号を とる。 */
export function chapterOf(phase: Pick<QuestPhase, "name">): number {
  return Number(/第(\d+)章/.exec(phase.name)?.[1] ?? 1);
}

/** 章の はじめの 場面か（「(1/3)」）。章の 札を 出す 合図。 */
export function isChapterStart(phase: Pick<QuestPhase, "name">): boolean {
  return /\(1\//.test(phase.name);
}

export function chapterBackground(chapter: number): string {
  return assetUrl(`${DIR}/bg/ch${two(chapter)}.png`) ?? "";
}

export function enemySprite(phaseId: number): string {
  return assetUrl(`${DIR}/enemy/p${two(phaseId)}.png`) ?? "";
}

export const WATERFALL_MAP = `${DIR}/waterfall.png`;

/** 予算・たまったバグ・体力・EXP の しるし。 */
export const QUEST_ICON = {
  coin: `${DIR}/ui/coin.png`,
  bug: `${DIR}/ui/bug.png`,
  heart: `${DIR}/ui/heart.png`,
  star: `${DIR}/ui/star.png`,
} as const;

export function questIcon(name: keyof typeof QUEST_ICON): string {
  return assetUrl(QUEST_ICON[name]) ?? "";
}

/** 会話の 話し手（`hero` は メンバー本人なので ここには 無い）。 */
export const SPEAKER_NAME = {
  god: "神社長",
  yamada: "山田さん",
  engineer: "エンジニア",
} as const;

/** 話し手と 相手役の 絵の 対応。 */
const SPEAKER_ENEMY: Record<keyof typeof SPEAKER_NAME, QuestPhase["enemy"]["art"]> = {
  god: "angel",
  yamada: "yamada",
  engineer: "engineer",
};

/** 話し手の ふだんの 顔（場面の 相手役で ない とき）。 */
const SPEAKER_PLAIN: Record<keyof typeof SPEAKER_NAME, string> = {
  god: `${DIR}/enemy/angel.png`,
  yamada: `${DIR}/enemy/p01.png`,
  engineer: `${DIR}/enemy/engineer.png`,
};

/** 登場人物の ふだんの 姿（STORY の 紹介に 使う）。 */
export function plainSpeakerSprite(speaker: keyof typeof SPEAKER_NAME): string {
  return assetUrl(SPEAKER_PLAIN[speaker]) ?? "";
}

/**
 * 会話の 顔。**その 場面の 相手役が 話す ときは 場面の 絵**（気分が そろう）、
 * ほかの 人が 話す ときは ふだんの 顔。
 */
export function speakerSprite(speaker: keyof typeof SPEAKER_NAME, phase: QuestPhase): string {
  if (phase.enemy.art === SPEAKER_ENEMY[speaker]) return enemySprite(phase.id);
  return assetUrl(SPEAKER_PLAIN[speaker]) ?? "";
}

/**
 * 遊ぶ 人の ドット絵 — **その人の ネクマックス**。
 *
 * 診断が まだの 人は `type` が null なので、水色の 元の ネクマックスを 出す——空けると
 * 名簿の 並びが 崩れ、「この人だけ 何か 足りない」に 見える。
 *
 * **4文字コード（ISTJ 等）は 画面に 1文字も 出さない**（`nexmax-catalog.tsx` の 規律）。
 * ファイルの 名前に 使うだけで、alt にも 入れない。
 */
export function playerSprite(player: Pick<QuestPlayer, "type" | "gender">): string {
  const file = player.type ? `${player.type}${player.gender === "female" ? "_f" : ""}` : "base";
  return assetUrl(`${DIR}/nexmax/${file}.png`) ?? "";
}

/**
 * 顔だけを 四角く 切りぬいて 見せる（名簿・PARTY・会話）。
 * 人は 頭が 上、ネクマックスと 神社長は 頭が まん中より 少し 上に ある。
 */
export function SpriteFace({
  src,
  focus = "55% 36%",
  size,
  className = "",
}: {
  src: string;
  focus?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`qx-face ${className}`}
      style={{
        backgroundImage: `url(${src})`,
        backgroundPosition: focus,
        ...(size ? { width: size, height: size } : {}),
      }}
    />
  );
}

/** 相手役の 顔の 切りぬき位置。 */
export function enemyFocus(art: QuestPhase["enemy"]["art"]): string {
  return art === "angel" ? "50% 40%" : "50% 8%";
}

/** 話し手の 顔の 切りぬき位置。 */
export function speakerFocus(speaker: keyof typeof SPEAKER_NAME): string {
  return enemyFocus(SPEAKER_ENEMY[speaker]);
}

/** 遊ぶ 人の 顔（ネクマックスの ドット絵を 切りぬく）。 */
export function PlayerFace({
  player,
  size = 32,
  className = "",
}: {
  /** 絵に 要るのは この 2つだけ（えらぶ 画面の 名簿にも そのまま 渡せる）。 */
  player: Pick<QuestPlayer, "type" | "gender">;
  size?: number;
  className?: string;
}) {
  return <SpriteFace src={playerSprite(player)} size={size} className={className} />;
}
