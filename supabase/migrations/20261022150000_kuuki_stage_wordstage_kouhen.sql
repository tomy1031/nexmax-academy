-- 「空気を 読む」の DB行の 単語テストを、前編・後編の 2セットに する
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:kuuki` は DB行が あり、
-- 20261022120000 で `wordStageIds` を `["kuuki_kotoba"]`（53語・1セット）に した。
-- 同じ日に tomy さんの 指定で 前編（kuuki_kotoba・26語）と 後編（kuuki_kotoba_kouhen・27語）に
-- 分けたので、DB行を 直さなければ **学習者には 前編しか 出ない**。
--
-- ## なぜ 行ごと 消さないか
-- 前例（20261022120000 / 20260915120000）と 同じく、要る キー 1つだけ `||` で 差し替える
-- （`contents` `area` `description` `furigana` には 触らない）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む（force-static）。
-- 古い git に kuuki_kotoba_kouhen が 無くても、ステージの ページは 見つからない 単語テストを
-- 落とす（src/app/[stage]/page.tsx「参照切れは 落とす」）。

update studio_contents
set
  data = data || jsonb_build_object(
    'wordStageIds', jsonb_build_array('kuuki_kotoba', 'kuuki_kotoba_kouhen')
  )
where id = 'kuuki' and kind = 'stage';
