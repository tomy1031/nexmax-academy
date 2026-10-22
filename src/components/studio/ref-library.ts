import { CONTENT_REF_TYPES, type ContentRefType } from "@/content/schema";
import type { RefOption } from "./stage-editor";

/** 1本の 教材の 名札。「もう ある ものから えらぶ」と「ほぞんずみか」には これだけ 要る。 */
export interface RefSource {
  readonly id: string;
  readonly title: string;
}

/**
 * 種別 → その種別の 教材（git ∪ DB）。**ステージに 置ける 種別を ぜんぶ 必須に する。**
 *
 * 2026-09-30 まで 一覧は 種別を 手で 並べて いて、あとから 足した スキット・クエスト・
 * リンク・タイピングが 入って いなかった。ステージの ながれで それらが
 * 「まだ ほぞんして いません — 学習者には 出ません。」と 出ていた（実際は 出ている）。
 * `schema.ts` の CONTENT_REF_TYPES に 種別を 足したら、ここを 埋めるまで 型検査が 通らない。
 */
export type RefSources = Readonly<Record<ContentRefType, readonly RefSource[]>>;

/**
 * 並べる順。単語ステージだけ 最後に 置く——「ことばの ゲーム」欄は id だけで 題名を
 * 引くので、同じ id の 別種別が あっても 単語ステージの 題名が 勝つように（これまでの 並び）。
 */
const ORDER: readonly ContentRefType[] = [
  ...CONTENT_REF_TYPES.filter((type) => type !== "wordstage"),
  "wordstage",
];

/** ステージ編集へ 渡す「もう ある 教材」の 一覧（全種別）。 */
export function buildRefLibrary(sources: RefSources): RefOption[] {
  return ORDER.flatMap((type) =>
    sources[type].map((item) => ({ id: item.id, type, title: item.title })),
  );
}
