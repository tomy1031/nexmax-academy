/**
 * カードの 絵 — ステージの 中で 使って いる 1枚を、そのまま カードの 顔に する
 *
 * マップを カードに 切りかえた とき、字だけの カードが 11枚 並んで いた。
 * 見出しと 説明を 読まない かぎり どの ステージかが 分からず、**戻って きた 学習者が
 * 自分の いた ところを 目で 探せない**（2026-09-22 の 指定「カードに 絵をつけて欲しい」）。
 *
 * 絵は **新しく 作らず、その ステージの 教材が すでに 使って いる もの**から 選ぶ。
 * 別の 絵を 用意すると、カードで 見た 絵が 中に 入ると 出て こない——カードは
 * 中身の 見本で あって、飾りでは ない。
 *
 * 選び方は 1つだけ: **学習順に 見て、いちばん 早く 見つかった「表紙級の 絵」**。
 * 表紙級とは 教材を 開いた ときに いちばん 上に 出る 1枚（まんがの 1コマ目・記事の
 * hero・スキットと リスニングの 表紙）で、どれも「この 教材は 何の 話か」を 1枚で
 * 見せる ために 作って ある。中ほどの 説明図を 拾うと、場面の 分からない 図だけが
 * カードに 並ぶ。
 *
 * 教材に 絵が 1枚も 無い ステージは **その 土地の 景色**（`area.image`）に 落とす。
 * 地図で 見て いる 絵と 同じ ものなので、地図と カードで 同じ ステージが 同じ 顔に なる。
 */

import type {
  Article,
  Content,
  ImageSlot,
  Listening,
  Manga,
  Meeting,
  QuizSet,
  Scenario,
  Skit,
  Stage,
  StageContentRef,
} from "@/content/schema";

/**
 * 画像スロットから 出せる 絵。
 *
 * **まだ 出来て いない 絵（`status !== "done"`）は 出さない**。画面の 絵の わく
 *（`ImageSlotFrame`）と 同じ 見分け方に する——そちらで「絵が 入ります」の 点線が
 * 出る ものが、カードでは 絵として 出て いる、という ずれを 作らない。
 */
function slotImage(slot: ImageSlot | undefined): string | null {
  return slot?.status === "done" && slot.src ? slot.src : null;
}

/** まんが: 1コマ目（絵の 出来て いる いちばん 早い コマ）。 */
function mangaImage(manga: Manga): string | null {
  for (const page of manga.pages) {
    for (const panel of page.panels) {
      const src = slotImage(panel.image);
      if (src) return src;
    }
  }
  return null;
}

/**
 * 記事: 表紙（hero）の 絵。無ければ 本文の 絵ブロックの 1枚目。
 *
 * カードの 中の 小さな 絵（`cards` / `missions` の items）は 拾わない。
 * あれは 一覧の 部品なので、1枚だけ 切り出すと 何の 絵か 分からなく なる。
 */
function articleImage(article: Article): string | null {
  for (const block of article.blocks) {
    if (block.kind !== "hero") continue;
    const src = slotImage(block.image);
    if (src) return src;
  }
  for (const block of article.blocks) {
    if (block.kind !== "image") continue;
    const src = slotImage(block);
    if (src) return src;
  }
  return null;
}

/** スキット: 表紙。無ければ セリフに 添えた 絵の 1枚目。 */
function skitImage(skit: Skit): string | null {
  const cover = slotImage(skit.cover);
  if (cover) return cover;
  for (const line of skit.lines) {
    const src = slotImage(line.image);
    if (src) return src;
  }
  return null;
}

/** リスニング: 聞く 前に 出す 表紙の 1枚。 */
function listeningImage(listening: Listening): string | null {
  return slotImage(listening.cover);
}

/** もんだい: 設問の 場面の 絵（いちばん 早い もの）。 */
function quizSetImage(set: QuizSet): string | null {
  for (const question of set.questions) {
    const src = slotImage(question.image);
    if (src) return src;
  }
  return null;
}

/** ミーティング: たいわの 画面の 背景（その 会話が 起きる 場所）。 */
function meetingImage(meeting: Meeting): string | null {
  return meeting.talkGame?.background ?? null;
}

/**
 * シナリオ: お客さまの 顔。
 *
 * `avatar` は 絵の 場所とは 限らない（`bakery` のように 頭文字の 丸に なる 名前も 入る）
 * ので、`/` で 始まる ものだけを 絵として 扱う。
 */
function scenarioImage(scenario: Scenario): string | null {
  const avatar = scenario.client.avatar;
  return avatar.startsWith("/") ? avatar : null;
}

/**
 * 教材 1本の 代表の 絵。持たない 種別（スライド・リンク・クエスト・単語）は null。
 */
export function contentCardImage(content: Content): string | null {
  switch (content.kind) {
    case "manga":
      return mangaImage(content);
    case "article":
      return articleImage(content);
    case "skit":
      return skitImage(content);
    case "listening":
      return listeningImage(content);
    case "quizset":
      return quizSetImage(content);
    case "meeting":
      return meetingImage(content);
    case "scenario":
      return scenarioImage(content);
    default:
      return null;
  }
}

/**
 * ステージ 1つの カードに 出す 絵。
 *
 * 教材を **学習順に** 見て いちばん 早く 見つかった 1枚。1枚も 無ければ その 土地の 景色。
 * どちらも 無ければ null（カードは これまでどおり 字だけで 出す——絵が 無い ことで
 * ステージが 消えるより、字だけで 出て いる ほうが よい）。
 */
export function stageCardImage(
  stage: Pick<Stage, "contents" | "area">,
  contentOf: (ref: StageContentRef) => Content | undefined,
): string | null {
  for (const ref of stage.contents) {
    const content = contentOf(ref);
    const src = content ? contentCardImage(content) : null;
    if (src) return src;
  }
  return stage.area?.image ?? null;
}
