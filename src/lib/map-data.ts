/**
 * マップの中身 — 公開されているステージを、そのまま地図の停留所にする
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」（src/content/areas.ts）。
 *
 * 以前はここで「コードに書いた既定のステージ ∪ スタジオで作ったステージ」を重ねていた。
 * やめた理由は1つ。**既定があると、地図に出ているものと先生が作ったものがずれる**。
 * 先生が1つも作っていなくても5つの停留所が地図にあり、押しても中身が無い。
 * いまは公開ステージだけを `order` の順に並べる——地図に出ているものは全部、
 * 先生が作って公開したものになる。
 *
 * 純関数だけ。node:fs も React も持たないので、ページからも scripts からも呼べる。
 */

import type { MapArea } from "@/content/areas";
import type { ContentRefType, Stage } from "@/content/schema";
import type { FuriganaEntry } from "@/lib/text/furigana";
import { stageContentPath } from "@/lib/stage-routes";

/**
 * マップに出すステージ1つ分（カードとピンの中身）。
 *
 * `kinds` は中に入っている教材の種別。以前は `kind`/`kindLabel` を
 * コードに書いた「動画/読解」「ペアワーク」で決めていたが、それは中身と一致しない
 * ラベルだった（まんが＋リスニング＋もんだいのステージが「ペアワーク」と出ていた）。
 * 中身から導けば、ずれようがない。
 */
export interface MapStage {
  id: string;
  /**
   * 地図の上から数えた番号（STEP 01…）。`order` そのものではない。
   * `order` は並び替えの結果でしかなく飛び番になりうるので、そのまま出すと
   * 「STEP 01 の次が STEP 30」になる。
   */
  number: number;
  title: string;
  reading: string;
  description: string;
  /** 説明文の 読み辞書。カードは これで ルビを 合成する（規律2）。 */
  furigana: readonly FuriganaEntry[];
  color: Stage["color"];
  kinds: readonly ContentRefType[];
  /**
   * 中の教材（学習順）。「さいしょから」「つづきから」の行き先と、
   * どこまで進んだかの判定に使う。IDは進捗キーでもある。
   */
  contents: readonly MapStageContent[];
  /**
   * ひもづく単語ステージ。マップの「単語を 勉強」は、どの課の単語かが決まっていないと
   * 学習者を一覧に放り出すことになるので、**そのステージのもの**へ直行させる。
   */
  wordStageIds: readonly string[];
}

export interface MapStageContent {
  id: string;
  type: ContentRefType;
  href: string;
}

/** マップの並び順（order の昇順・同点はIDで安定させる）。 */
export function sortStages(stages: readonly Stage[]): Stage[] {
  return [...stages].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * 地図に停留所として出るステージか。
 *
 * 2つの問いの積である——**完成しているか**（status）と **地図に出すか**（listed）。
 * 「はじめに」のような案内は完成していても地図には出さない。URLは生きているので、
 * 先生がリンクを配れば開ける（`listed` の由来は schema.ts のコメント）。
 */
export function isOnMap(stage: Stage): boolean {
  return stage.status === "published" && stage.listed;
}

/** 地図に出るステージだけを、地図の並び順で。 */
export function mapListedStages(stages: readonly Stage[]): Stage[] {
  return sortStages(stages.filter(isOnMap));
}

/**
 * 地図の上から数えた STEP 番号。**地図に出ないステージは null**。
 *
 * 数え方をここ1か所に閉じるのは、ステージのトップと教材の枠で別々に数えていたのを
 * そろえるため。以前はどちらも「見つからなければ 1」に倒していたので、地図に無い
 * ステージが本物の STEP 01 と同じ札を出していた。番号が無いことは、番号 1 ではない。
 */
export function stageStepNumber(stages: readonly Stage[], stageId: string): number | null {
  const index = mapListedStages(stages).findIndex((stage) => stage.id === stageId);
  return index < 0 ? null : index + 1;
}

export function toMapStages(stages: readonly Stage[]): MapStage[] {
  return sortStages(stages).map((stage, index) => ({
    id: stage.id,
    number: index + 1,
    title: stage.title,
    reading: stage.reading,
    description: stage.description,
    furigana: stage.furigana ?? [],
    color: stage.color,
    // 同じ種別が2つあっても、しるしは1つでいい（「まんが・まんが・もんだい」は読みにくい）
    kinds: [...new Set(stage.contents.map((content) => content.type))],
    contents: stage.contents.flatMap((content, position) => {
      const href = stageContentPath(stage.id, stage.contents, position);
      return href ? [{ id: content.ref, type: content.type, href }] : [];
    }),
    wordStageIds: stage.wordStageIds,
  }));
}

/**
 * マップのエリア（土地）。ステージ1つにつき1つ。
 *
 * 絵が無くても空色の帯として出す——絵の用意が遅れただけでステージが地図から消えると、
 * 学習者は昨日あった教材を探しまわることになる。
 */
export function toMapAreas(stages: readonly Stage[]): MapArea[] {
  return sortStages(stages).map((stage) => ({
    id: `area-${stage.id}`,
    name: stage.area?.name ?? stage.title,
    reading: stage.area?.reading ?? stage.reading,
    image: stage.area?.image ?? "",
    stageId: stage.id,
    note: stage.area?.note ?? stage.description,
  }));
}

/**
 * マップのステージカードで押せる行き先（さいしょから／つづきから／単語）。
 *
 * 純関数として切り出してあるのは、この判断が**ログインの内側**にあって通しの検証から
 * 見えないからである。マップはプロフィールを引けないと `/welcome` へ送り返すので、
 * 鍵ゼロのE2Eではここを通れない（`tests/e2e/modoru.spec.ts` の但し書き）。
 * 見張れるのは単体テストだけなので、判断はここに置く。
 */
export interface MapStageActions {
  /** ▶「つづきから」の行き先。教材が1つも無ければ null（札は「ステージを ひらく」に変わる）。 */
  resume: MapStageContent | null;
  /** つづきの位置（0始まり）。「3／5」の数え札に使う。 */
  resumeIndex: number;
  /** ぜんぶ おわっているか（札が「もういちど 見る」に変わる）。 */
  allDone: boolean;
  /**
   * ↩「最初から」の行き先＝**ステージのトップ**（2026-08-25 の指定）。
   *
   * 以前は1本目の教材へ直行していた。やり直したい学習者は、まず**何が何本あって
   * どこまで進んだか**を見てから選ぶので、いきなり教材の中に入れると戻る手間が増える。
   * まだ1本目にいる学習者には出さない（「つづきから」で足りる）。
   */
  restartHref: string | null;
  /**
   * 📖「単語を 勉強」の行き先。**ひもづく単語ステージが無ければ null＝札を出さない**
   *（2026-08-25 の指定）。
   *
   * 以前は無いときも `/arcade`（ことばアーケードの一覧）へ送っていた。だが札には
   * 「この ステージの ことば」と書いてあるので、学習者はそれを探して、どの課のものか
   * 分からない一覧の前で止まる。ことばだけ練習したい人にはサイドメニューの「単語」がある。
   *
   * 行き先は **ステージID**（`/arcade/<ステージID>`）。セットが 1つなら そのまま 開き、
   * 2つ以上（初級・中級…）なら えらぶ 画面に なる。以前は `wordStageIds[0]` へ
   * 直に 送って いて、**ステージトップと 行き先が ちがって いた**（願い #203 で そろえた）。
   */
  wordsHref: string | null;
}

export function mapStageActions(stage: MapStage, progressCodes: string): MapStageActions {
  const items = stage.contents;
  const firstUnfinished = [...progressCodes].findIndex((code) => code !== "2");
  const resumeIndex = firstUnfinished < 0 ? 0 : firstUnfinished;
  const resume = items[resumeIndex] ?? null;
  const first = items[0] ?? null;

  return {
    resume,
    resumeIndex,
    allDone: firstUnfinished < 0 && items.length > 0,
    restartHref: first && resume && first.href !== resume.href ? `/${stage.id}` : null,
    wordsHref: stage.wordStageIds.length > 0 ? `/arcade/${stage.id}` : null,
  };
}
