-- 「報連相：報告」の DB行の 読み辞書で、「話」を はな → はなし に 替える
--
-- ## なぜ 要るか
-- 単語テストの 画面は、セットの 読み辞書の あとに ステージの 読み辞書を 重ねて
-- **後ろが 勝つ**（`src/lib/wordstage-merge.ts` の findLearnerWordSets）。
-- 2026-09-15 に 報告の 単語テストを 初級・上級に 作り直したら、ステージの
-- `["話","はな"]` が セット側の `["話","はなし"]` に 勝ち、4つの 文が
-- 「話[はな]が 長く」「その 話[はな]の ことです」の ように 誤読に なった
-- （yomi-kensa の 検収で 発見。結論・用件・お客さま・指示 の 例文と 説明文）。
-- ステージの 説明文に「話」は 無いので、この 1語を 替えても ほかの 画面は 変わらない。
--
-- `stage:houkoku` は スタジオで 保存ずみで DBが git に 勝つので、git
-- （content/stages/houkoku.json）と 同じ 直しを ここでも する。
--
-- ## なぜ 1要素だけ 替えるか
-- 前例（20260915120000 ほか）と 同じく、DBにしか 無い 値を 巻き戻さない ため。
-- 読み辞書の 並びは そのまま、`["話","はな"]` の 要素だけを 差し替える。
--
-- ## いま 流して 安全か
-- 読みが 1つ 変わる だけで、どの 版の コードでも 読める 形の まま。

update studio_contents
set
  data = jsonb_set(
    data,
    '{furigana}',
    (
      select jsonb_agg(
        case when e = '["話", "はな"]'::jsonb then '["話", "はなし"]'::jsonb else e end
        order by ord
      )
      from jsonb_array_elements(data -> 'furigana') with ordinality as t (e, ord)
    )
  )
where id = 'houkoku'
  and kind = 'stage'
  and data -> 'furigana' @> '[["話", "はな"]]'::jsonb;
