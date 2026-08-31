"use client";

import type { QuestPhase } from "@/content/schema";
import { NexMaxType } from "@/components/nexmax-types";
import type { QuestPlayer } from "@/lib/quest/state";

/**
 * クエストの 絵 — **絵文字は ここ 1か所だけ**に 置く
 *
 * 相手役の 絵は まだ 無い。手描きの SVG で 自作しない（絶対規律7）ので、
 * いまは 絵文字を **大きく** 出す。あとで Codex image-gen-2 で 描いた 絵に
 * 差しかえる ときに、直すのは この ファイルだけで 済む——画面の あちこちに
 * 👼 を 書いて しまうと、差しかえの 日に 取りこぼしが 出る。
 */
export const ENEMY_ART: Record<QuestPhase["enemy"]["art"], string> = {
  angel: "👼",
  yamada: "🧑‍💼",
  engineer: "🧑‍💻",
};

/** 会話の 話し手（`hero` は メンバー本人なので ここには 無い）。 */
export const SPEAKER_ART = {
  god: "👼",
  yamada: "🧑‍💼",
  engineer: "🧑‍💻",
} as const;

/** 会話の 話し手の 呼び名。 */
export const SPEAKER_NAME = {
  god: "神社長",
  yamada: "山田さん",
  engineer: "エンジニア",
} as const;

/**
 * 遊ぶ 人の 絵 — **その人の ネクマックス**。
 *
 * 診断が まだの 人は `type` が null なので、ネクマックスの 絵を 出さない
 *（`getPersonalityType(null)` は 落ちる）。代わりに 中立の しるしを 置く——
 * 空けると 名簿の 並びが 崩れ、「この人だけ 何か 足りない」に 見える。
 *
 * **4文字コード（ISTJ 等）は 1文字も 出さない**（`nexmax-catalog.tsx` の 規律）。
 * `NexMaxType` が 出すのは 絵と 呼び名だけなので、そのまま 使える。
 */
export function PlayerFace({
  player,
  size = 56,
  bob = false,
}: {
  /** 絵に 要るのは この 2つだけ（えらぶ 画面の 名簿にも そのまま 渡せる）。 */
  player: Pick<QuestPlayer, "type" | "gender">;
  size?: number;
  bob?: boolean;
}) {
  if (!player.type) {
    return (
      <span
        aria-hidden
        className="border-hairline grid shrink-0 place-items-center rounded-2xl border-2 bg-white"
        style={{ width: size, height: size, fontSize: size * 0.5, lineHeight: 1 }}
      >
        🙂
      </span>
    );
  }
  return (
    <NexMaxType
      code={player.type}
      gender={player.gender}
      size={size}
      bob={bob}
      className="shrink-0"
    />
  );
}
