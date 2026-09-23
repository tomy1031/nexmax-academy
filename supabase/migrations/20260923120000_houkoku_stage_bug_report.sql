-- 「報連相：報告」の DB行に、バグ報告ゲーム（説明ページ＋もんだい）を「会社の ポジション」の つぎへ 差し込む
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:houkoku` は
-- スタジオで 保存ずみで、git の `contents` に 足した 2本が DB行には 無い。
-- 直さなければ **学習者には バグ報告ゲームが 出ない**。
-- （2026-09-23 の 指定「『会社のポジション』の続きにこちらのコンテンツを移植してください」）
--
-- ## なぜ contents を 丸ごと 書かないか
-- 前例（20260918120000）と 同じく、git に 無い 値を 巻き戻さない ため。この 行は
-- `houkoku_meeting` を 持って いない（20260915120000 の「のこる 宿題」）——丸ごと 書くと
-- その 判断まで 勝手に 変える。**`houkoku_hierarchy` の すぐ あとに 2本 足す だけ**。
--
-- ## 2回 流しても 同じ（すでに 入って いれば 何も しない）
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む。いまの 本番の コードは
-- `houkoku_bug_intro`・`houkoku_bug_quiz` を 知らないので、参照切れとして 外すだけ（落ちない）。
-- 統合から 本番への 昇格までの あいだに 緊急デプロイを しても、2本が 出ない だけで
-- ほかの 教材は そのまま。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(elem order by position, sub)
      from (
        select item as elem, position, 0 as sub
        from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
        union all
        select extra.elem, t.position, extra.sub
        from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
        cross join (
          values
            ('{"ref": "houkoku_bug_intro", "type": "article"}'::jsonb, 1),
            ('{"ref": "houkoku_bug_quiz", "type": "quizset", "gates": true}'::jsonb, 2)
        ) as extra(elem, sub)
        where t.item->>'ref' = 'houkoku_hierarchy'
      ) as merged
    )
  ),
  updated_at = now()
where id = 'houkoku'
  and kind = 'stage'
  and data->'contents' @> '[{"ref": "houkoku_hierarchy"}]'::jsonb
  and not (data->'contents' @> '[{"ref": "houkoku_bug_quiz"}]'::jsonb)
  and not (data->'contents' @> '[{"ref": "houkoku_bug_intro"}]'::jsonb);
