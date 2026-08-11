/**
 * まとめて作る — 「まだ できていないもの」を数える
 *
 * 教材が増えるほど、絵の無いコマは教材の中に散らばる。エディタを1つずつ開いて
 * 探すのは現実的でなく、**探す作業そのものが「作らない理由」になる**。
 * ここで全部の教材を1回走査して、足りないものを1つの並びにする。
 *
 * ## 純関数だけ置く
 * 生成も保存もしない。「何が足りないか」と「できたものをどこへ入れるか」だけを
 * 決める。ネットワークを含めるとテストできなくなり、
 * **一括処理はテストできないと怖くて使えない**（失敗すると教材を壊しうるので）。
 *
 * ## 直列に流す前提
 * ブリッジは1接続1操作（`CodexTransport.activeTurn` が1枠）なので、
 * 呼ぶ側はこの並びを**上から1件ずつ**処理する。並列にすると2件目以降が
 * 「前の生成が終わるまで待ってください」で落ちる。
 */

import type { Content } from "@/content/schema";
import { buildCharacterSheetPrompt } from "@/lib/manga-prompt";

/** 作れるものの種類。増やすときは `applyAsset` にも足す（対で持つのが契約）。 */
export type AssetKind = "mangaPanel" | "articleImage" | "characterSheet" | "listeningAudio";

export interface MissingAsset {
  /** 画面の並びで一意。React の key と「選んだもの」の記録に使う。 */
  readonly id: string;
  readonly kind: AssetKind;
  /** どの教材か（保存先を引くのに使う）。 */
  readonly contentId: string;
  /** 先生に見せる名前（「はじめての 朝会 — 2ページ目 3コマ目」）。 */
  readonly label: string;
  /** 生成に渡す指示。空なら作れない（＝先に指示を書く必要がある）。 */
  readonly prompt: string;
  /** 参照画像のURL（顔や服をぶれさせないために渡す）。 */
  readonly references: readonly string[];
  /** Storage の置き場。 */
  readonly prefix: string;
}

/**
 * まんがのコマの位置は **id の中に持つ**（`manga:<教材ID>:<ページ>:<コマ>`）。
 *
 * モジュールの外に Map を置くと、2回走査したときに前回のぶんが残り、
 * 教材を消したあとに古い位置へ書き戻す事故になる。id から読めば、
 * `applyAsset` は引数だけで決まる純関数のままでいられる。
 * 教材IDに `:` は入らない（スキーマが `[a-z0-9_-]+` に絞っている）ので、区切れる。
 */
function panelAtFrom(id: string): { page: number; panel: number } | null {
  const parts = id.split(":");
  if (parts.length !== 4 || parts[0] !== "manga") return null;
  const page = Number(parts[2]);
  const panel = Number(parts[3]);
  if (!Number.isInteger(page) || !Number.isInteger(panel)) return null;
  return { page, panel };
}

/**
 * 読み物の画像ブロックの位置も同じく **id の中に持つ**（`article:<教材ID>:<ブロック番号>`）。
 * 理由は `panelAtFrom` と同じ——モジュールの外に位置を覚えると、古い位置へ書き戻す。
 */
function blockAtFrom(id: string): number | null {
  const parts = id.split(":");
  if (parts.length !== 3 || parts[0] !== "article") return null;
  const block = Number(parts[2]);
  return Number.isInteger(block) ? block : null;
}

/**
 * まだ絵や音の無いものを集める。
 *
 * 「無い」の判定は **`src` が空かどうか**にする。`status` は見ない——
 * `status: "generating"` はタブを閉じると更新されないので、
 * 「作っている最中のまま永久に残った嘘」を掴んでしまう。
 * 実体があるか無いかだけが信用できる。
 */
export function collectMissingAssets(contents: readonly Content[]): MissingAsset[] {
  const found: MissingAsset[] = [];

  for (const content of contents) {
    switch (content.kind) {
      case "manga": {
        content.pages.forEach((page, p) => {
          page.panels.forEach((panel, c) => {
            if (panel.image.src) return;
            found.push({
              id: `manga:${content.id}:${p}:${c}`,
              kind: "mangaPanel",
              contentId: content.id,
              label: `${content.title} — ${p + 1}ページ目 ${c + 1}コマ目`,
              prompt: panel.image.prompt ?? "",
              references: panel.image.refs,
              prefix: `manga/${content.id}`,
            });
          });
        });
        break;
      }
      case "article": {
        /**
         * 読み物の挿絵。番号は**画像ブロックの通し番号ではなく blocks の添字**にする。
         * 「3まいめの え」を数えるのは先生に見せるラベルだけの話で、書き戻す先は
         * blocks の位置だから——画像以外のブロックを1つ足したとたんにズレる。
         */
        let nth = 0;
        content.blocks.forEach((block, b) => {
          if (block.kind !== "image") return;
          nth += 1;
          if (block.src) return;
          found.push({
            id: `article:${content.id}:${b}`,
            kind: "articleImage",
            contentId: content.id,
            label: `${content.title} — ${nth}まいめの え`,
            prompt: block.prompt ?? "",
            references: block.refs,
            prefix: `article/${content.id}`,
          });
        });
        break;
      }
      case "character": {
        if (content.sheet.src) break;
        found.push({
          id: `character:${content.id}`,
          kind: "characterSheet",
          contentId: content.id,
          label: `${content.name}（${content.role}）の 設定画`,
          // シートの指示は保存していないので、その場で組み立てる。
          // 画面の「AIで つくる」と同じ文字列になる（`character-editor.tsx` と同じ関数）
          prompt: content.sheet.prompt ?? buildCharacterSheetPrompt(content),
          references: content.references,
          prefix: `characters/${content.id}`,
        });
        break;
      }
      case "listening": {
        if (content.audioUrl) break;
        found.push({
          id: `listening:${content.id}`,
          kind: "listeningAudio",
          contentId: content.id,
          label: `${content.title} の 音声（${content.script.length}行）`,
          // 音声は台本そのものが指示なので prompt は使わない
          prompt: "",
          references: [],
          prefix: `listening/${content.id}`,
        });
        break;
      }
      default:
        break;
    }
  }
  return found;
}

/**
 * できたものを教材へ入れて、新しい教材を返す（元は変えない）。
 *
 * 見つからない・種類が合わないときは **元をそのまま返す**。投げないのは、
 * 一括処理の途中で1件おかしくても残りを続けたいから
 *（止めると、先生は「どこまでできたのか」が分からなくなる）。
 */
export function applyAsset(content: Content, asset: MissingAsset, url: string): Content {
  if (content.id !== asset.contentId) return content;

  switch (asset.kind) {
    case "mangaPanel": {
      if (content.kind !== "manga") return content;
      const at = panelAtFrom(asset.id);
      if (!at) return content;
      return {
        ...content,
        pages: content.pages.map((page, p) =>
          p !== at.page
            ? page
            : {
                ...page,
                panels: page.panels.map((panel, c) =>
                  c !== at.panel
                    ? panel
                    : { ...panel, image: { ...panel.image, src: url, status: "done" as const } },
                ),
              },
        ),
      };
    }
    case "articleImage": {
      if (content.kind !== "article") return content;
      const at = blockAtFrom(asset.id);
      if (at === null) return content;
      return {
        ...content,
        blocks: content.blocks.map((block, b) =>
          b !== at || block.kind !== "image"
            ? block
            : { ...block, src: url, status: "done" as const },
        ),
      };
    }
    case "characterSheet": {
      if (content.kind !== "character") return content;
      return {
        ...content,
        sheet: { ...content.sheet, src: url, prompt: asset.prompt, status: "done" as const },
      };
    }
    case "listeningAudio": {
      if (content.kind !== "listening") return content;
      return { ...content, audioUrl: url };
    }
  }
}

/**
 * 一括処理の1件ぶんの結末。
 *
 * `skipped` を `failed` と分けるのは、先生の次の行動が違うから:
 * 指示が空なら**指示を書く**、失敗ならもう一度**押す**。
 */
export type AssetOutcome =
  | { readonly state: "done"; readonly url: string }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "skipped"; readonly message: string };

/**
 * 作れるかどうかの下見。作れないものを実行前に外しておくと、
 * 「8件やって6件失敗」ではなく「6件やります・2件は指示がありません」と先に言える。
 */
export function reasonCannotMake(asset: MissingAsset): string | null {
  if (asset.kind === "listeningAudio") return null;
  if (asset.prompt.trim().length === 0) {
    return "絵の 指示が ありません。教材の画面で 先に 書いてください";
  }
  return null;
}

/** 進み具合の要約（画面の「3/8まい」と、終わったあとの報告に使う）。 */
export function summarize(outcomes: ReadonlyMap<string, AssetOutcome>): {
  done: number;
  failed: number;
  skipped: number;
} {
  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const outcome of outcomes.values()) {
    if (outcome.state === "done") done += 1;
    else if (outcome.state === "failed") failed += 1;
    else skipped += 1;
  }
  return { done, failed, skipped };
}
