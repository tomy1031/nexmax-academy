/**
 * ステージの 一覧に 出す「参照先の 見出し」を 引く
 *
 * ## なぜ ページの 外に 置くか（2026-09-20）
 * ここは 元は `src/app/[stage]/page.tsx` の `export` だった。Next は **page.tsx が
 * 決められた もの以外を export する ことを 許さない**（`default`・`generateStaticParams`・
 * `dynamic` など）。ふだんは 気づかないが、**その ページが 型検査の 対象に 入った
 * ビルドで だけ** `"loadRef" is not a valid Page export field` と 言って 止まる——
 * 何も 直して いない ファイルが、別の 変更の ついでに 落ちる。
 *
 * ページは 画面の ため、引きものは ここ。2つの ページ（ステージのトップと 教材の ページ）が
 * 同じ 引きものを 使うので、置き場は どちらでも ない ところに する。
 */

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
import type { FuriganaEntry } from "@/lib/text/furigana";

/**
 * 参照先の見出しを引く。参照切れ（null）はここでは落とさず一覧から外す
 * — 参照整合は lint:content が先に落とす契約なので、画面は壊さないほうを選ぶ。
 *
 * 読み辞書も一緒に持ち帰る。ステージ詳細の一覧は学習者が最初に見る画面なので、
 * ここで裸の漢字を出さない（AGENTS.md 規律2 — 表示時にエンジンがルビを合成する）。
 */
interface LoadedRef {
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
