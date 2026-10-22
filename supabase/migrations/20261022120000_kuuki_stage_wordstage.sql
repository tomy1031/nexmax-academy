-- 「空気を 読む」の DB行に、単語テスト（kuuki_kotoba・53語）を ひもづける
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:kuuki` は
-- スタジオで 保存ずみ（2026-10-16 10:44 UTC）で、`wordStageIds` が `[]` の ままである。
-- 2026-10-22 に git の ステージへ 単語テストを 足したので、DB行を 直さなければ
-- **学習者には 単語テストが 出ない**（20260915120000 の houkoku と 同じ型）。
--
-- ## なぜ 行ごと 消さないか
-- git に 無い 値を 持って いる かも しれない。前例と 同じく、要る キー 1つだけ `||` で
-- 差し替える（`contents` `area` `description` `furigana` には 触らない）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む（force-static）。
-- 本番の 古い ビルドは この 更新を 読まない。古い git に kuuki_kotoba が 無くても、
-- ステージの ページは 見つからない 単語テストを 落とす（src/app/[stage]/page.tsx「参照切れは 落とす」）。

update studio_contents
set
  data = data || jsonb_build_object('wordStageIds', jsonb_build_array('kuuki_kotoba'))
where id = 'kuuki' and kind = 'stage';
