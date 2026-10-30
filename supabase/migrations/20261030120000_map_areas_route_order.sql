-- まなびマップの 土地を、道のりの 順（カンボジア → ベトナム）に 当てなおす（2026-10-30）
--
-- ## なぜ 要るか
-- tomy さんの 依頼（要望 #686）「カンボジア国内の数ももう少し増やして（koh rong島、ボコー国立公園、
-- バッタンバン、floating village）経路順になるように」「経由する国ももっと増やして、国順にしてください」。
-- 地図は STEP 5〜7 に 日本の 絵（横浜・福岡・京都）が 入り、そのあと ベトナムへ 戻って いた。
-- 新しい 絵を 足し、STEP 1〜8 を カンボジア（アンコールワット → 水上の 村 → バッタンバン → プノンペン →
-- コーロン島 → ボコー → カンポット → ケップ）、STEP 9〜 を ベトナム（南から）に 当てなおす。
--
-- 合流の きまりは「同一IDなら DBが 勝つ」。下の 8ステージは DB行が あるので、git の
-- content/stages/*.json を 直しただけでは 地図が 変わらない（shigoto・renraku・interview・youken2 は
-- DB行が 無いので git だけで 変わる。hajimari は 変えない）。
--
-- ## なぜ 行ごと 消さないか
-- 前例（20261022150000 ほか）と 同じく、要る キー 1つ（area）だけ `||` で 差し替える。
-- **いまの 絵が 前の 割り当ての ままの 行だけ** 書きかえる——先生が スタジオで 絵を
-- 選びなおして いたら、その 選択を 上書きしない。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- 書くのは 絵の パスと ひとことだけ。新しい 絵は 同じ PR で public/img/scenes/ に 入る。
-- 古い コードの まま 新しい 絵の パスを 読んでも、絵が 無ければ 空色の 帯に なるだけで 壊れない。

update studio_contents
set data = data || jsonb_build_object('area', '{"image":"/img/scenes/area_floating_village.webp","note":"みずうみの うえに、いえや がっこうが うかぶ むらです。"}'::jsonb)
where id = 'kaisha' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_riverside_capital.webp';

update studio_contents
set data = data || jsonb_build_object('area', '{"image":"/img/scenes/area_jungle_island_beach.webp","note":"しろい すなはまと あおい うみの しまです。"}'::jsonb)
where id = 'houkoku-kiku' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_ferris_harbour.webp';

update studio_contents
set data = data || jsonb_build_object('area', '{"name":"プノンペン","reading":"ぷのんぺん","image":"/img/scenes/area_riverside_capital.webp","note":"ふるい たてものと たかい ビルが ならぶ まちです。この まちにも、たくさんの かいしゃが あります。"}'::jsonb)
where id = 'houkoku' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_crab_shore.webp';

update studio_contents
set data = data || jsonb_build_object('area', '{"image":"/img/scenes/area_cloud_plateau.webp","note":"くもが ながれる たかい やまの うえに、ふるい きょうかいが たっています。"}'::jsonb)
where id = 'asakai' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_stall_bay_town.webp';

update studio_contents
set data = data || jsonb_build_object('area', '{"image":"/img/scenes/area_pepper_riverside.webp","note":"ひろい かわに ふるい てつの はしが かかる、コショウの まちです。"}'::jsonb)
where id = 'kuuki' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_pagoda_lane.webp';

update studio_contents
set data = data || jsonb_build_object('area', '{"image":"/img/scenes/area_floating_market_delta.webp","note":"かわの うえで、ふねから くだものや やさいを うる いちばです。"}'::jsonb)
where id = 'soudan' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_dragon_river.webp';

update studio_contents
set data = data || jsonb_build_object('area', '{"image":"/img/scenes/area_lantern_old_port.webp","note":"ちょうちんが ならぶ、きいろい いえの まちです。ここで お客様に 会います。"}'::jsonb)
where id = 'youken' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_stone_facade_plaza.webp';

update studio_contents
set data = data || jsonb_build_object('area', '{"image":"/img/scenes/area_motorbike_avenue.webp","note":"バイクが たくさん とおる、にぎやかな まちです。"}'::jsonb)
where id = 'kaihatsu' and kind = 'stage'
  and data->'area'->>'image' = '/img/scenes/area_lake_oldquarter.webp';
