-- 朝礼の 講義（asakai_lecture）の DB行から「✅ 問題を 話す ときは、3つ 考えます」と その 下の カード 3枚を 外す
--
-- ## なぜ 要るか
-- 2026-10-07 の 指定「✅ 問題を 話す ときは、3つ 考えます　この内容を消してください」
-- （消す 範囲は 同日の 回答「見出し＋カード3枚」）。合流の きまりは「同一IDなら DBが 勝つ」
-- （設計07 §11.1）ので、git の content/articles/asakai_lecture.json から 外すだけでは 学習者に 出つづける。
--
-- ## 外す もの（2ブロック）
--   見出し「✅ 問題を 話す ときは、3つ 考えます」
--   カード 3枚「①どこで？」「②何が 起きて いる？」「③今、どう して いる？」（絵つき）
-- 4節に 残るのは 見出し「4．問題が ある ときは、分かりやすく 話そう」と 比べる カード 2枚
--（「問題が あります。」／「ログイン画面で 問題が あります。今、原因を 調べて います。」）。
-- 朝礼の 練習が 見る「何が 起きて いて、今 どう して いるか」は この カードと 7節の 型
--（「＿＿＿＿で 問題が あります。今、＿＿＿＿して います。」）が 引き継ぐ（規律10）。
-- ほかの ブロックと 並びには 触らない。当たる ものが 無ければ 何も しない。
--
-- ## いま 流して 安全か
-- 記事の ブロックを 2つ 外すだけ。参照切れには ならない（いまの 本番の コードでも 読める）。

update studio_contents
set
  data = data || jsonb_build_object(
    'blocks', (
      select jsonb_agg(block order by position)
      from jsonb_array_elements(data->'blocks') with ordinality as t(block, position)
      where not (
          block->>'kind' = 'heading'
          and block->>'text' = '✅ 問題を 話す ときは、3つ 考えます'
        )
        and not (
          block->>'kind' = 'cards'
          and block->'items' @> '[{"title": "どこで？"}, {"title": "何が 起きて いる？"}, {"title": "今、どう して いる？"}]'::jsonb
        )
    )
  ),
  updated_at = now()
where id = 'asakai_lecture'
  and kind = 'article'
  and data->'blocks' @> '[{"kind": "heading", "text": "✅ 問題を 話す ときは、3つ 考えます"}]'::jsonb;
