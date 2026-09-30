import type { ContentRefType } from "@/content/schema";
import { contentKindMeta } from "@/lib/content-kinds";

/**
 * スタジオに まだ エディタが 無い 種別 → 直す 場所（content/ の 置き場）。
 *
 * ステージの ながれで「✎ ひらく」を 押したとき、ここに ある 種別は 開かずに
 * 理由を 出す。2026-09-30 まで スキット・クエスト・リンク・タイピングが 無く、
 * 押しても 何も 起きなかった（openContent の switch に case が 無かった）。
 * エディタを 足したら ここから 外して、openContent に case を 書く。
 */
export const NO_EDITOR_DIRS = {
  scenario: "scenarios",
  skit: "skits",
  quest: "quests",
  link: "links",
  typing: "typing",
} as const satisfies Partial<Record<ContentRefType, string>>;

export type NoEditorType = keyof typeof NO_EDITOR_DIRS;

/** 「✎ ひらく」を 押したときの 知らせ。押しても 何も 起きないより、理由を 出す。 */
export function noEditorMessage(type: NoEditorType): string {
  return `${contentKindMeta(type).label}は まだ スタジオで 直せません（content/${NO_EDITOR_DIRS[type]} の JSON で 作ります）。`;
}
