/**
 * 教材の 健康しらべ — **DBの 古い 版が gitの 教材を 隠して いないか**
 *
 * ## なぜ 要るか（2026-08-26 の 事故）
 *
 * 「会社を 知る」の ことばを 3セット（初級・中級・上級）に して git に 入れ、
 * CI も e2e も 緑で、STG にも 本番にも 載った。**なのに 学習者の 画面には
 * 初級しか 出て いなかった。**
 *
 * 原因は 合流の きまり（設計07 §11.1「同一IDは DBが勝つ」）である。
 * スタジオで 1度でも 保存した ステージは DBに 行が でき、その行の
 * `wordStageIds` は 保存した 時点の ままだった（`["stage23_kaisha"]`）。
 * git に セットを 足しても、**DBの 版が 勝つので 永久に 出ない**。
 *
 * 見つからなかったのは、これが **どこにも 印を 出さない**からである——
 * git は 正しく、DBも 壊れて おらず、機械の 検査は ぜんぶ 通る。
 * 気づけるのは「画面に 出ない」と 人が 言った ときだけだった。
 *
 * だから ここで **数えて 名指しする**。判定は 純粋な 関数に して おき
 *（テストで 固定できる）、公開の `/api/health/content` が これを 返す。
 * ログイン無しで 見られる のは、返すのが **idと 数だけ**だからである
 *（教材の 中身も 学習者の データも 出さない。id は public リポジトリに 元から ある）。
 */

/** しらべる のに 要る 最小の かたち（Stage / WordStage の 部分集合）。 */
export interface HealthStage {
  readonly id: string;
  readonly wordStageIds?: readonly string[];
  /**
   * ステージの 中の 教材の 並び。**ことばセットと 同じ 事故が ここでも 起きる**
   *（2026-08-27）。DBに 保存ずみの ステージに git で 教材を 1本 足しても、
   * DBの 版が 勝つので **学習者の 画面には 永久に 出ない**。逆に git から 教材を
   * 消すと、DBの 版だけが それを 指したまま 残り、**ステージの 途中で 404**に なる。
   * どちらも 検査は ぜんぶ 緑——だから ここで 数えて 名指しする。
   */
  readonly contents?: readonly { readonly ref: string; readonly type: string }[];
}

export interface HealthWordStage {
  readonly id: string;
  readonly words: readonly unknown[];
  readonly questionCount: number;
}

export interface StageHealth {
  readonly id: string;
  /** 学習者に 出て いるのは どちらの 版か。 */
  readonly source: "git" | "db";
  readonly wordStageIds: readonly string[];
  /** git には ある のに、いま 出て いない セット（＝DBの 版に 隠されて いる）。 */
  readonly hiddenByDb: readonly string[];
  /** 並びには ある のに、単語ステージ そのものが 見つからない id。 */
  readonly missing: readonly string[];
  /** git の 並びには ある のに、いま 出て いない 教材（＝DBの 版に 隠されて いる）。 */
  readonly hiddenContents: readonly string[];
  /** 並びには ある のに、教材 そのものが 見つからない id（＝開くと 404）。 */
  readonly missingContents: readonly string[];
}

export interface WordStageHealth {
  readonly id: string;
  readonly source: "git" | "db";
  readonly words: number;
  readonly questionCount: number;
}

export interface ContentHealth {
  readonly stages: readonly StageHealth[];
  readonly wordStages: readonly WordStageHealth[];
  /** 人が 読む 一行。**空なら 健康**。 */
  readonly warnings: readonly string[];
}

export function buildContentHealth({
  gitStages,
  liveStages,
  liveWordStages,
  dbPublishedIds,
  liveContentIds,
}: {
  /** git（焼き込み）の ステージ。 */
  gitStages: readonly HealthStage[];
  /** 学習者に 出て いる ステージ（git ∪ DB の 合流ずみ）。 */
  liveStages: readonly HealthStage[];
  /** 学習者に 出て いる 単語ステージ。 */
  liveWordStages: readonly HealthWordStage[];
  /** DBに 公開で 入って いる `kind:id`。 */
  dbPublishedIds: ReadonlySet<string>;
  /**
   * 学習者に 出て いる 教材ぜんぶの `kind:id`（git ∪ DB）。
   * 渡さない ときは 教材の 参照切れを 数えない（呼ぶ側が まだ 集めて いない ため）。
   */
  liveContentIds?: ReadonlySet<string>;
}): ContentHealth {
  const gitById = new Map(gitStages.map((s) => [s.id, s]));
  const liveWordStageIds = new Set(liveWordStages.map((s) => s.id));
  const warnings: string[] = [];

  const stages = liveStages.map((stage): StageHealth => {
    const source = dbPublishedIds.has(`stage:${stage.id}`) ? "db" : "git";
    const live = stage.wordStageIds ?? [];
    const fromGit = gitById.get(stage.id)?.wordStageIds ?? [];
    const hiddenByDb = source === "db" ? fromGit.filter((id) => !live.includes(id)) : [];
    const missing = live.filter((id) => !liveWordStageIds.has(id));

    if (hiddenByDb.length > 0) {
      warnings.push(
        `stage:${stage.id} — DBの 版が gitの ことばセットを ${hiddenByDb.length}本 隠している（${hiddenByDb.join(" / ")}）`,
      );
    }
    if (missing.length > 0) {
      warnings.push(
        `stage:${stage.id} — ことばセットが 見つからない（${missing.join(" / ")}）。参照が 切れているか、語が 引けずに 落ちている`,
      );
    }

    /*
     * 教材の 並びも 同じ 見かたで 数える。**キーは `種別:id`**——同じ id の
     * ページと もんだいが 別物として 並ぶ ことが ある（`stageContentRefSchema`）。
     */
    const liveContents = (stage.contents ?? []).map((c) => `${c.type}:${c.ref}`);
    const gitContents = (gitById.get(stage.id)?.contents ?? []).map((c) => `${c.type}:${c.ref}`);
    const hiddenContents =
      source === "db" ? gitContents.filter((key) => !liveContents.includes(key)) : [];
    const missingContents = liveContentIds
      ? liveContents.filter((key) => !liveContentIds.has(key))
      : [];

    if (hiddenContents.length > 0) {
      warnings.push(
        `stage:${stage.id} — DBの 版が gitの 教材を ${hiddenContents.length}本 隠している（${hiddenContents.join(" / ")}）。スタジオで ステージを 保存し直すか、DBの 行を 消す`,
      );
    }
    if (missingContents.length > 0) {
      warnings.push(
        `stage:${stage.id} — 教材が 見つからない（${missingContents.join(" / ")}）。学習者は ステージの 途中で 404に なる`,
      );
    }

    return {
      id: stage.id,
      source,
      wordStageIds: live,
      hiddenByDb,
      missing,
      hiddenContents,
      missingContents,
    };
  });

  const wordStages = liveWordStages.map((stage): WordStageHealth => {
    const source = dbPublishedIds.has(`wordstage:${stage.id}`) ? "db" : "git";
    if (stage.questionCount > stage.words.length) {
      warnings.push(
        `wordstage:${stage.id} — 出題数(${stage.questionCount})が 語数(${stage.words.length})より 多い`,
      );
    }
    return { id: stage.id, source, words: stage.words.length, questionCount: stage.questionCount };
  });

  return { stages, wordStages, warnings };
}
