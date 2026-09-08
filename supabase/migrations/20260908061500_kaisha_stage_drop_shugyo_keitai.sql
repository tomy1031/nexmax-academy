-- 「会社を 知る」の DB行から、しごとステージへ 移した 3本を 落とす
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。2026-09-07 に
-- 就業形態の 3本（`kaisha_shugyo_keitai_listening` / `kaisha_shugyo_keitai` /
-- `kaisha_shugyo_keitai_check`）を `content/stages/shigoto.json` へ 切り出したが、
-- `stage:kaisha` の DB行が 古い 10本の ままなので、**git を 直しても
-- 学習者の 画面は 1文字も 変わらない**。ステージ2に 8〜10本目が 残って 見える。
--
-- ## なぜ 行ごと 消さないか（前例 20260827120000 とは 判断を 変えた）
-- あの ときは 行を 消して git を 正に 戻した。今回は 消せない——
-- 2026-09-07 13:03 に **別のスレッドが スタジオから エリアの絵を 保存して いる**
-- （`area.image` が git の `area_palace_town.webp` では なく
-- `area_riverside_capital.webp`。`youken` `kaihatsu` も 同じ 時刻に 新しい 絵に
-- なって いて、その 絵は まだ git に 無い）。行を 消すと **その 仕事を 巻き戻す**。
--
-- だから **要る キーだけ** `||` で 差し替える（`area` には 触らない）。
-- 中身は `content/stages/kaisha.json`（origin/main）から そのまま 写した。
--
-- ## なぜ いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- 本番は すでに この 切り出しを 含む ビルドを 配信ずみ（main HEAD・2026-09-08 05:59 UTC）。
-- `/shigoto` は 本番でも 生きて いて、古いURLも 転送される。だから この 更新で
-- 3本が どこからも 行けなく なる 瞬間は 無い。
--
-- ## のこる 宿題（この SQL では 直さない）
-- 行そのものは 残るので、**kaisha は これからも DBが git に 勝つ**。
-- エリアの絵を git に 入れる スレッドが 片づいたら、前例（20260827120000）と 同じく
-- 行を 消して git を 正に 戻すのが よい。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', jsonb_build_array(
      jsonb_build_object('ref', 'kaisha_shirabekata', 'type', 'article'),
      jsonb_build_object('ref', 'nextmake_gakushu_site', 'type', 'link'),
      jsonb_build_object('ref', 'kaisha_houkoku', 'type', 'quizset'),
      jsonb_build_object('ref', 'kaisha_houkoku_meeting', 'type', 'meeting'),
      jsonb_build_object('ref', 'kaisha_matsui_junbi', 'type', 'article'),
      jsonb_build_object('ref', 'kaisha_omoshiroi', 'type', 'quizset'),
      jsonb_build_object('ref', 'kaisha_matsui', 'type', 'meeting')
    ),
    'description', '5つの STEPで NEXT MAKEを 調べます。まず 調べかたを 学びます。Webサイトで 調査シートを うめて、ヘンディさんに 報告します。さいごに AI松井社長と 話す 準備を して、社長と 話します。',
    'furigana', jsonb_build_array(
      jsonb_build_array('松井社長', 'まついしゃちょう'),
      jsonb_build_array('準備', 'じゅんび'),
      jsonb_build_array('社長', 'しゃちょう'),
      jsonb_build_array('会社', 'かいしゃ'),
      jsonb_build_array('報告', 'ほうこく'),
      jsonb_build_array('自分', 'じぶん'),
      jsonb_build_array('調べ', 'しらべ'),
      jsonb_build_array('調査', 'ちょうさ'),
      jsonb_build_array('関係', 'かんけい'),
      jsonb_build_array('学', 'まな'),
      jsonb_build_array('知', 'し'),
      jsonb_build_array('考', 'かんが'),
      jsonb_build_array('話し', 'はなし'),
      jsonb_build_array('話す', 'はなす'),
      jsonb_build_array('話', 'はなし')
    )
  ),
  updated_at = now()
where id = 'kaisha' and kind = 'stage';
