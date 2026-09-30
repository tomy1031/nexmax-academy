-- 「報連相：報告」の DB行から、報告の リスニング 5場面（リスニング＋もんだい 10本）を 外す
--
-- ## なぜ 要るか
-- 10本は 新しい ステージ「報連相：報告（リスニング）」（content/stages/houkoku-kiku.json）へ 移した。
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。20260928120000 で DB行の
-- おわりに 足した ので、git の `contents` から 外すだけでは 学習者には 報告の ステージにも
-- 出つづける（2つの ステージに 同じ 10本が 並ぶ）。
-- （2026-09-30 の 指定「リスニングを 別な ステージに 移します。報連相：報告（リスニング）」）
--
-- ## 外すだけ（ほかの 要素と 並びには 触らない）。無ければ 何も しない
-- 教材の ファイル（content/listening/・content/quizsets/）は 消さない。新しい ステージは
-- git だけで 持つ（DB行は 作らない）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージから 10本 外すだけ。参照切れには ならない。ステージの ページは ビルド時に 焼き込む
-- ので、本番は 次の デプロイまで 変わらない。統合から 本番への 昇格の 前に 緊急デプロイを
-- した ときだけ、10本が しばらく どこにも 出ない（学習の 記録は 教材の IDで 持つので 消えない）。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(item order by position)
      from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
      where not (item->>'ref' = any (array[
        'houkoku_kanryou_listening', 'houkoku_kanryou_quiz',
        'houkoku_okure_listening', 'houkoku_okure_quiz',
        'houkoku_shougai_listening', 'houkoku_shougai_quiz',
        'houkoku_chousa_listening', 'houkoku_chousa_quiz',
        'houkoku_chourei_listening', 'houkoku_chourei_quiz'
      ]))
    )
  ),
  updated_at = now()
where id = 'houkoku'
  and kind = 'stage'
  and jsonb_typeof(data->'contents') = 'array'
  -- 10本の どれかが 入って いる ときだけ（2回 流しても 同じ）
  and exists (
    select 1
    from jsonb_array_elements(data->'contents') as t(item)
    where item->>'ref' = any (array[
      'houkoku_kanryou_listening', 'houkoku_kanryou_quiz',
      'houkoku_okure_listening', 'houkoku_okure_quiz',
      'houkoku_shougai_listening', 'houkoku_shougai_quiz',
      'houkoku_chousa_listening', 'houkoku_chousa_quiz',
      'houkoku_chourei_listening', 'houkoku_chourei_quiz'
    ])
  )
  -- 外した あとに 1本も 残らないなら 触らない（jsonb_agg が null を 返す）
  and exists (
    select 1
    from jsonb_array_elements(data->'contents') as t(item)
    where not (item->>'ref' = any (array[
      'houkoku_kanryou_listening', 'houkoku_kanryou_quiz',
      'houkoku_okure_listening', 'houkoku_okure_quiz',
      'houkoku_shougai_listening', 'houkoku_shougai_quiz',
      'houkoku_chousa_listening', 'houkoku_chousa_quiz',
      'houkoku_chourei_listening', 'houkoku_chourei_quiz'
    ]))
  );

-- ## 説明から 1文 外す（git と そろえる）
-- 20260928120000 で 足した「さいごに、いろいろな 場面の 報告を 聞いて 確かめます。」を 外す。
-- **いまの 説明が その ときの 文の ままの ときだけ** 戻す（先生が 直して いたら 触らない）。
-- 読み辞書からも、その ときに 足した 場面・確かめ を 外す。

update studio_contents
set
  data = jsonb_set(
    jsonb_set(
      data,
      '{description}',
      to_jsonb(
        '日本の 会社の「報連相」を 学びます。上司への 報告の しかたを 読んで、聞いて、声に 出して 練習します。'::text
      )
    ),
    '{furigana}',
    coalesce(
      (
        select jsonb_agg(entry order by position)
        from jsonb_array_elements(coalesce(data->'furigana', '[]'::jsonb)) with ordinality as t(entry, position)
        where entry not in ('["場面", "ばめん"]'::jsonb, '["確かめ", "たしかめ"]'::jsonb)
      ),
      '[]'::jsonb
    )
  ),
  updated_at = now()
where id = 'houkoku'
  and kind = 'stage'
  and data->>'description' = '日本の 会社の「報連相」を 学びます。上司への 報告の しかたを 読んで、聞いて、声に 出して 練習します。さいごに、いろいろな 場面の 報告を 聞いて 確かめます。';
