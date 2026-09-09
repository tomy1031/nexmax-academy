-- 「会社を 知る」の DB行に、松井社長の スライドを 足す
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:kaisha` の
-- DB行は 2026-09-08 の 前例（20260908061500）で 7本の ままに なって いる。
-- `content/stages/kaisha.json` に 8本目（`matsui_shachou` / slides）を 足しても、
-- DB行を 直さなければ **学習者の 画面には 出ない**。
--
-- ## なぜ 行ごと 消さないか
-- 前例（20260908061500）と 同じ 判断。2026-09-07 に 別のスレッドが スタジオから
-- 保存した エリアの絵（`area_riverside_capital.webp`）が まだ git に 無いため、
-- 行を 消すと その 仕事を 巻き戻す。だから `contents` の 1キーだけ `||` で
-- 差し替える（`area` `description` `furigana` には 触らない）。
--
-- 中身は `content/stages/kaisha.json` から そのまま 写した（7本＋新しい 1本）。
--
-- ## のこる 宿題
-- 行そのものは 残るので、kaisha は これからも DBが git に 勝つ。エリアの絵を
-- git に 入れる スレッドが 片づいたら、行を 消して git を 正に 戻すのが よい。

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
      jsonb_build_object('ref', 'kaisha_matsui', 'type', 'meeting'),
      jsonb_build_object('ref', 'matsui_shachou', 'type', 'slides')
    )
  ),
  updated_at = now()
where id = 'kaisha' and kind = 'stage';
