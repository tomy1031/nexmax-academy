import type { FuriganaEntry } from "@/lib/text/furigana";
import type { StageContentRef } from "@/content/schema";
import {
  getArticle,
  getLink,
  getListening,
  getManga,
  getMeeting,
  getQuest,
  getQuizSet,
  getScenario,
  getSkit,
  getSlides,
  getWordStage,
} from "@/lib/content";

/**
 * ステージの 参照先（教材）の 見出しを 引く — ページから 切り出した 読み込み
 *
 * ## なぜ ページの 中に 置けないのか（2026-09-22）
 * もとは `src/app/[stage]/page.tsx` が `loadRef` を **export** して いて、子の
 * `[content]/page.tsx` が そこから 引いて いた。Next 16 は **ページの 書き出しを
 * 決まった 名前だけに 限る**ので、この 書き出しは 規約ちがいで ある:
 *
 *     Type error: Page "src/app/[stage]/page.tsx" does not match the required types
 *       of a Next.js Page. "loadRef" is not a valid Page export field.
 *
 * ところが この 検査は **型検査が その ページを 見直した ときだけ** 出る。
 * ふだんは 見直されないので 眠って いて、`[stage]/page.tsx` が 読んで いる
 * モジュール（`@/lib/map-data` など）の **形**が 変わった 瞬間に、
 * **関係の 無い 変更の ビルドが 落ちる**。実際 2026-09-22 に カードの 絵を
 * 足す 変更（`MapStage` に 欄を 1つ 足しただけ）で `npm run build` が 落ちた。
 *
 * 置き場を ここに 移せば、ページの 書き出しは 規約どおりに なり、罠も 消える。
 * 中身は 移しただけで、1行も 変えて いない。
 */

/**
 * 参照先の見出しを引く。参照切れ（null）はここでは落とさず一覧から外す
 * — 参照整合は lint:content が先に落とす契約なので、画面は壊さないほうを選ぶ。
 *
 * 読み辞書も一緒に持ち帰る。ステージ詳細の一覧は学習者が最初に見る画面なので、
 * ここで裸の漢字を出さない（AGENTS.md 規律2 — 表示時にエンジンがルビを合成する）。
 */
export interface LoadedRef {
  title: string;
  description: string;
  furigana?: readonly FuriganaEntry[];
}

export async function loadRef(ref: StageContentRef): Promise<LoadedRef | null> {
  switch (ref.type) {
    case "manga": {
      const manga = await getManga(ref.ref);
      return (
        manga && {
          title: manga.title,
          description: manga.description,
          furigana: manga.furigana,
        }
      );
    }
    case "article": {
      const article = await getArticle(ref.ref);
      return (
        article && {
          title: article.title,
          description: article.description,
          furigana: article.furigana,
        }
      );
    }
    case "slides": {
      const slides = await getSlides(ref.ref);
      return (
        slides && {
          title: slides.title,
          description: slides.description,
          furigana: slides.furigana,
        }
      );
    }
    case "listening": {
      const listening = await getListening(ref.ref);
      return (
        listening && {
          title: listening.title,
          description: listening.description,
          furigana: listening.furigana,
        }
      );
    }
    case "quizset": {
      const set = await getQuizSet(ref.ref);
      return set && { title: set.title, description: set.description, furigana: set.furigana };
    }
    case "scenario": {
      const scenario = await getScenario(ref.ref);
      return (
        scenario && {
          title: scenario.title,
          description: scenario.subtitle,
          furigana: scenario.furigana,
        }
      );
    }
    case "meeting": {
      const meeting = await getMeeting(ref.ref);
      return (
        meeting && {
          title: meeting.title,
          description: meeting.description,
          furigana: meeting.furigana,
        }
      );
    }
    case "wordstage": {
      const stage = await getWordStage(ref.ref);
      return (
        stage && {
          title: stage.title,
          description: stage.description,
          furigana: stage.furigana,
        }
      );
    }
    case "link": {
      const link = await getLink(ref.ref);
      return (
        link && {
          title: link.title,
          description: link.description,
          furigana: link.furigana,
        }
      );
    }
    case "skit": {
      const skit = await getSkit(ref.ref);
      return (
        skit && {
          title: skit.title,
          description: skit.description,
          furigana: skit.furigana,
        }
      );
    }
    case "quest": {
      const quest = await getQuest(ref.ref);
      return (
        quest && {
          title: quest.title,
          description: quest.description,
          furigana: quest.furigana,
        }
      );
    }
  }
}
