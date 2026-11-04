-- 連絡の しかた（renraku_lecture）の DB行を、2026-11-04 の 直しと 同じ 形に する
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。この 教材は DB に 行が ある
--（2026-10-30 に git と 同じ 中身で 入った）ので、git の content/articles/renraku_lecture.json を
-- 直すだけでは 学習者に 古い 文が 出つづける。
--
-- ## 直す もの（tomy さんの 指定・2026-11-04）
--   1節 まとめ    「あなたを 慰める ことに」→「あなたが 元気に なる ために」
--   2節 ケーススタディ「どんな ときに 連絡するか」だけに する。絵と 簡単な 文で 4つ
--                 （スケジュールの 変更／開発環境・本番環境の アップデート／バグが 発生／遅刻・欠席・早退）。
--                 ケース A・B の まとめ絵（s2.webp）と、送る 相手・件名・本文の 書きかたは 外す
--   4節 【 】     フォーマルで なくても 使う、見やすく する ラベル。箇条書きと セットで 使う
--   5節 電話      「電話の あとは」→「電話で 大切な 話を した ときは」
--   5節 人に よって 箇条書き 4つ と「ここが ポイント」を 消す
-- 読み辞書（furigana）には 新しい 文の 語だけ 足す（本番環境・箇条書き・日にち・話を・元気・関係・電車・遅刻・欠席・早退・下・休・帰）。
-- 今 ある 読みと、ほかの 節には 触らない。
--
-- ## いま 流して 安全か
-- 使う ブロックは 今の 本番の コードが 読める もの だけ（paragraph・cards＋image・heading・list・callout）。
-- カードの 絵（/img/hourensou/renraku/case_1〜4.webp）は この PR で 足す ので、STG には すぐ、
-- 本番には 次の 授業前の 自動反映で 届く。
-- 直す 所が 今の 文の ままの 行 だけを 直す（先生が 直した 行・2回目には 何も しない）。

update studio_contents
set data = jsonb_set(
  jsonb_set(
    data,
    '{blocks}',
    (
      select jsonb_agg(
        case t.position
          when 8 then t.block || jsonb_build_object('text', $t$気持ちを 伝えると、相手は あなたが 元気に なる ために 時間を 使って しまいます。事実だけを 伝えれば、相手は すぐに 解決の ために 動けます。$t$::text)
          when 11 then $j${
  "kind": "paragraph",
  "text": "どんな ときに 連絡するのでしょうか。よく ある 4つの ケースを 見て みましょう。どれも、チームの みんなの 仕事に 関係が あります。"
}$j$::jsonb
          when 12 then $j${
  "kind": "cards",
  "columns": 2,
  "items": [
    {
      "icon": "🗓",
      "label": "ケース 1",
      "title": "スケジュールの 変更",
      "text": "MTG（ミーティング）の 日にちや 時間が 変わった とき。",
      "image": {
        "src": "/img/hourensou/renraku/case_1.webp",
        "prompt": "Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand, no tangled or merged fingers. Match the drawing style and the colours of the FIRST reference picture exactly. The junior engineer is the young man of the reference picture with short dark brown hair wearing a coral-orange shirt jacket over a white tee; the team leader is the man of the reference picture with short black hair in a navy blazer over a white shirt. This is a TEACHING picture, not a mood picture: a student who can hardly read Japanese must understand the message from the picture alone. EMOTIONS ARE BIG AND OBVIOUS, like a Japanese comedy manga — exaggerated faces and whole-body poses that read from across the room. Happy and relieved people beam with huge open smiles and sparkling eyes, raise a fist or give a thumbs-up, with little sparkles around them. Puzzled people tilt their heads under a big question mark. Manga symbols are welcome and carry the message: big question marks, exclamation marks, sweat drops, lightbulbs, sparkles, motion lines, check marks.\nTHE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: four everyday moments when the junior engineer must send a message to his team right away. One wide picture divided into FOUR EQUAL PANELS in a 2 by 2 grid, separated by clean white gutters about 24 pixels wide, with no panel touching another. At the top of every panel sits one wide rounded cream label panel that holds that panel’s title word, printed large on ONE single line with clear room above every kanji for its furigana. Every panel shows the junior engineer of the reference picture (short dark brown hair, coral-orange shirt jacket over a white tee), and in every panel he holds his smartphone or sits at his laptop, ready to tell his team. TOP-LEFT PANEL (title: the first word below): in the bright office, the junior engineer stands at a large wall schedule board and slides one coral meeting card from a higher row down to the next row, a thick coral arrow showing the move; beside the board two large clock faces, the first showing two o’clock and the second showing three o’clock, with a coral arrow between them. Behind him three teammates at their desks look up with surprised round eyes and small exclamation marks — the change matters to everybody. TOP-RIGHT PANEL (title: the second word below): the junior engineer sits at his laptop with a huge proud grin and a big thumbs-up. Beside his desk stand two server racks side by side; the left rack carries a small cream tag with the word DEV and the right rack a small cream tag with the word PROD. One big green upward arrow and sparkles rise above both racks, and his laptop screen shows the word UPDATE above a progress bar that is completely full. Two teammates nearby turn their heads toward him with bright faces. BOTTOM-LEFT PANEL (title: the third word below): the junior engineer jumps back from his desk in shock, both hands on his head, huge sweat drops, wide eyes and a wavy open mouth; his big monitor shows a bright red warning screen with a large cartoon beetle drawing and the word BUG in big letters, and red exclamation marks burst around the monitor. BOTTOM-RIGHT PANEL (title: the fourth word below), the only panel that is NOT in the office: on its left two-thirds, a crowded train platform in the morning — the junior engineer, with a backpack on, stands beside a train that has stopped with its doors shut, sweat drops on his face and a worried wavy mouth, typing a message on his smartphone; a big station clock shows ten to nine, and a hanging departure board shows soft abstract bars and the English word DELAY in red; a small cream tag with the fifth word below sits next to him. On the right one-third, two small round insets stacked one above the other, each with a thick outline: the UPPER inset shows the same young man at home in bed in pajamas, flushed cheeks, a thermometer in his mouth and a cold towel on his forehead, holding his phone — a small cream tag with the sixth word below; the LOWER inset shows the same young man walking out of the office door in the early afternoon with his bag, giving a small apologetic bow and a wave, a wall clock behind him showing one o’clock — a small cream tag with the seventh word below. The four panels are the same size and read left to right, top to bottom.\nThe Japanese words in this picture are exactly: スケジュールの 変更（変更＝へんこう） / 開発環境・本番環境の アップデート（開発＝かいはつ、環境＝かんきょう、本番＝ほんばん） / バグが 発生（発生＝はっせい） / 遅刻・欠席・早退（遅刻＝ちこく、欠席＝けっせき、早退＝そうたい） / 遅刻（ちこく） / 欠席（けっせき） / 早退（そうたい） / DEV / PROD / UPDATE / BUG / DELAY.\nOutput: one landscape illustration, 1536x1024.\nLettering — read this part carefully. The picture contains ONLY the words listed above, and no other writing at all. Print each Japanese word LARGE and horizontally in a bold rounded gothic Japanese font, with generous space around it — either on a soft cream label with a rounded border, or inside a white speech balloon whose tail clearly points at the person who says it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp. Words written only in hiragana or katakana take no furigana, and Latin letters and numbers take no furigana either. The readings in round brackets are for you only — never print the brackets or the reading in the brackets as text. Spell every character exactly as given. Screens, papers and whiteboards show only soft abstract shapes apart from the listed words. No other letters, numbers, logos or watermarks anywhere in the picture.\nNever: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, horror or a scary dark mood, real grief, violence, watermarks, real company logos or brand marks of any kind (no fruit logo on laptops or phones, no chat-app logos), national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.",
        "refs": [
          "/img/hourensou/renraku/s1.webp"
        ],
        "status": "done"
      }
    },
    {
      "icon": "🚀",
      "label": "ケース 2",
      "title": "開発環境・本番環境の アップデート",
      "text": "開発環境（development）や 本番環境（production）を 新しく した とき。",
      "image": {
        "src": "/img/hourensou/renraku/case_2.webp",
        "prompt": "Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand, no tangled or merged fingers. Match the drawing style and the colours of the FIRST reference picture exactly. The junior engineer is the young man of the reference picture with short dark brown hair wearing a coral-orange shirt jacket over a white tee; the team leader is the man of the reference picture with short black hair in a navy blazer over a white shirt. This is a TEACHING picture, not a mood picture: a student who can hardly read Japanese must understand the message from the picture alone. EMOTIONS ARE BIG AND OBVIOUS, like a Japanese comedy manga — exaggerated faces and whole-body poses that read from across the room. Happy and relieved people beam with huge open smiles and sparkling eyes, raise a fist or give a thumbs-up, with little sparkles around them. Puzzled people tilt their heads under a big question mark. Manga symbols are welcome and carry the message: big question marks, exclamation marks, sweat drops, lightbulbs, sparkles, motion lines, check marks.\nTHE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: four everyday moments when the junior engineer must send a message to his team right away. One wide picture divided into FOUR EQUAL PANELS in a 2 by 2 grid, separated by clean white gutters about 24 pixels wide, with no panel touching another. At the top of every panel sits one wide rounded cream label panel that holds that panel’s title word, printed large on ONE single line with clear room above every kanji for its furigana. Every panel shows the junior engineer of the reference picture (short dark brown hair, coral-orange shirt jacket over a white tee), and in every panel he holds his smartphone or sits at his laptop, ready to tell his team. TOP-LEFT PANEL (title: the first word below): in the bright office, the junior engineer stands at a large wall schedule board and slides one coral meeting card from a higher row down to the next row, a thick coral arrow showing the move; beside the board two large clock faces, the first showing two o’clock and the second showing three o’clock, with a coral arrow between them. Behind him three teammates at their desks look up with surprised round eyes and small exclamation marks — the change matters to everybody. TOP-RIGHT PANEL (title: the second word below): the junior engineer sits at his laptop with a huge proud grin and a big thumbs-up. Beside his desk stand two server racks side by side; the left rack carries a small cream tag with the word DEV and the right rack a small cream tag with the word PROD. One big green upward arrow and sparkles rise above both racks, and his laptop screen shows the word UPDATE above a progress bar that is completely full. Two teammates nearby turn their heads toward him with bright faces. BOTTOM-LEFT PANEL (title: the third word below): the junior engineer jumps back from his desk in shock, both hands on his head, huge sweat drops, wide eyes and a wavy open mouth; his big monitor shows a bright red warning screen with a large cartoon beetle drawing and the word BUG in big letters, and red exclamation marks burst around the monitor. BOTTOM-RIGHT PANEL (title: the fourth word below), the only panel that is NOT in the office: on its left two-thirds, a crowded train platform in the morning — the junior engineer, with a backpack on, stands beside a train that has stopped with its doors shut, sweat drops on his face and a worried wavy mouth, typing a message on his smartphone; a big station clock shows ten to nine, and a hanging departure board shows soft abstract bars and the English word DELAY in red; a small cream tag with the fifth word below sits next to him. On the right one-third, two small round insets stacked one above the other, each with a thick outline: the UPPER inset shows the same young man at home in bed in pajamas, flushed cheeks, a thermometer in his mouth and a cold towel on his forehead, holding his phone — a small cream tag with the sixth word below; the LOWER inset shows the same young man walking out of the office door in the early afternoon with his bag, giving a small apologetic bow and a wave, a wall clock behind him showing one o’clock — a small cream tag with the seventh word below. The four panels are the same size and read left to right, top to bottom.\nThe Japanese words in this picture are exactly: スケジュールの 変更（変更＝へんこう） / 開発環境・本番環境の アップデート（開発＝かいはつ、環境＝かんきょう、本番＝ほんばん） / バグが 発生（発生＝はっせい） / 遅刻・欠席・早退（遅刻＝ちこく、欠席＝けっせき、早退＝そうたい） / 遅刻（ちこく） / 欠席（けっせき） / 早退（そうたい） / DEV / PROD / UPDATE / BUG / DELAY.\nOutput: one landscape illustration, 1536x1024.\nLettering — read this part carefully. The picture contains ONLY the words listed above, and no other writing at all. Print each Japanese word LARGE and horizontally in a bold rounded gothic Japanese font, with generous space around it — either on a soft cream label with a rounded border, or inside a white speech balloon whose tail clearly points at the person who says it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp. Words written only in hiragana or katakana take no furigana, and Latin letters and numbers take no furigana either. The readings in round brackets are for you only — never print the brackets or the reading in the brackets as text. Spell every character exactly as given. Screens, papers and whiteboards show only soft abstract shapes apart from the listed words. No other letters, numbers, logos or watermarks anywhere in the picture.\nNever: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, horror or a scary dark mood, real grief, violence, watermarks, real company logos or brand marks of any kind (no fruit logo on laptops or phones, no chat-app logos), national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.",
        "refs": [
          "/img/hourensou/renraku/s1.webp"
        ],
        "status": "done"
      }
    },
    {
      "icon": "🐞",
      "label": "ケース 3",
      "title": "バグが 発生",
      "text": "バグ（bug）が 起きた とき。システムが 正しく 動かない とき。",
      "image": {
        "src": "/img/hourensou/renraku/case_3.webp",
        "prompt": "Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand, no tangled or merged fingers. Match the drawing style and the colours of the FIRST reference picture exactly. The junior engineer is the young man of the reference picture with short dark brown hair wearing a coral-orange shirt jacket over a white tee; the team leader is the man of the reference picture with short black hair in a navy blazer over a white shirt. This is a TEACHING picture, not a mood picture: a student who can hardly read Japanese must understand the message from the picture alone. EMOTIONS ARE BIG AND OBVIOUS, like a Japanese comedy manga — exaggerated faces and whole-body poses that read from across the room. Happy and relieved people beam with huge open smiles and sparkling eyes, raise a fist or give a thumbs-up, with little sparkles around them. Puzzled people tilt their heads under a big question mark. Manga symbols are welcome and carry the message: big question marks, exclamation marks, sweat drops, lightbulbs, sparkles, motion lines, check marks.\nTHE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: four everyday moments when the junior engineer must send a message to his team right away. One wide picture divided into FOUR EQUAL PANELS in a 2 by 2 grid, separated by clean white gutters about 24 pixels wide, with no panel touching another. At the top of every panel sits one wide rounded cream label panel that holds that panel’s title word, printed large on ONE single line with clear room above every kanji for its furigana. Every panel shows the junior engineer of the reference picture (short dark brown hair, coral-orange shirt jacket over a white tee), and in every panel he holds his smartphone or sits at his laptop, ready to tell his team. TOP-LEFT PANEL (title: the first word below): in the bright office, the junior engineer stands at a large wall schedule board and slides one coral meeting card from a higher row down to the next row, a thick coral arrow showing the move; beside the board two large clock faces, the first showing two o’clock and the second showing three o’clock, with a coral arrow between them. Behind him three teammates at their desks look up with surprised round eyes and small exclamation marks — the change matters to everybody. TOP-RIGHT PANEL (title: the second word below): the junior engineer sits at his laptop with a huge proud grin and a big thumbs-up. Beside his desk stand two server racks side by side; the left rack carries a small cream tag with the word DEV and the right rack a small cream tag with the word PROD. One big green upward arrow and sparkles rise above both racks, and his laptop screen shows the word UPDATE above a progress bar that is completely full. Two teammates nearby turn their heads toward him with bright faces. BOTTOM-LEFT PANEL (title: the third word below): the junior engineer jumps back from his desk in shock, both hands on his head, huge sweat drops, wide eyes and a wavy open mouth; his big monitor shows a bright red warning screen with a large cartoon beetle drawing and the word BUG in big letters, and red exclamation marks burst around the monitor. BOTTOM-RIGHT PANEL (title: the fourth word below), the only panel that is NOT in the office: on its left two-thirds, a crowded train platform in the morning — the junior engineer, with a backpack on, stands beside a train that has stopped with its doors shut, sweat drops on his face and a worried wavy mouth, typing a message on his smartphone; a big station clock shows ten to nine, and a hanging departure board shows soft abstract bars and the English word DELAY in red; a small cream tag with the fifth word below sits next to him. On the right one-third, two small round insets stacked one above the other, each with a thick outline: the UPPER inset shows the same young man at home in bed in pajamas, flushed cheeks, a thermometer in his mouth and a cold towel on his forehead, holding his phone — a small cream tag with the sixth word below; the LOWER inset shows the same young man walking out of the office door in the early afternoon with his bag, giving a small apologetic bow and a wave, a wall clock behind him showing one o’clock — a small cream tag with the seventh word below. The four panels are the same size and read left to right, top to bottom.\nThe Japanese words in this picture are exactly: スケジュールの 変更（変更＝へんこう） / 開発環境・本番環境の アップデート（開発＝かいはつ、環境＝かんきょう、本番＝ほんばん） / バグが 発生（発生＝はっせい） / 遅刻・欠席・早退（遅刻＝ちこく、欠席＝けっせき、早退＝そうたい） / 遅刻（ちこく） / 欠席（けっせき） / 早退（そうたい） / DEV / PROD / UPDATE / BUG / DELAY.\nOutput: one landscape illustration, 1536x1024.\nLettering — read this part carefully. The picture contains ONLY the words listed above, and no other writing at all. Print each Japanese word LARGE and horizontally in a bold rounded gothic Japanese font, with generous space around it — either on a soft cream label with a rounded border, or inside a white speech balloon whose tail clearly points at the person who says it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp. Words written only in hiragana or katakana take no furigana, and Latin letters and numbers take no furigana either. The readings in round brackets are for you only — never print the brackets or the reading in the brackets as text. Spell every character exactly as given. Screens, papers and whiteboards show only soft abstract shapes apart from the listed words. No other letters, numbers, logos or watermarks anywhere in the picture.\nNever: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, horror or a scary dark mood, real grief, violence, watermarks, real company logos or brand marks of any kind (no fruit logo on laptops or phones, no chat-app logos), national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.",
        "refs": [
          "/img/hourensou/renraku/s1.webp"
        ],
        "status": "done"
      }
    },
    {
      "icon": "🚃",
      "label": "ケース 4",
      "title": "遅刻・欠席・早退",
      "items": [
        "遅刻（late）… 電車が 遅れて、会社に 遅れる とき。",
        "欠席（absent）… 会社を 休む とき。",
        "早退（leave early）… 早く 帰る とき。"
      ],
      "image": {
        "src": "/img/hourensou/renraku/case_4.webp",
        "prompt": "Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand, no tangled or merged fingers. Match the drawing style and the colours of the FIRST reference picture exactly. The junior engineer is the young man of the reference picture with short dark brown hair wearing a coral-orange shirt jacket over a white tee; the team leader is the man of the reference picture with short black hair in a navy blazer over a white shirt. This is a TEACHING picture, not a mood picture: a student who can hardly read Japanese must understand the message from the picture alone. EMOTIONS ARE BIG AND OBVIOUS, like a Japanese comedy manga — exaggerated faces and whole-body poses that read from across the room. Happy and relieved people beam with huge open smiles and sparkling eyes, raise a fist or give a thumbs-up, with little sparkles around them. Puzzled people tilt their heads under a big question mark. Manga symbols are welcome and carry the message: big question marks, exclamation marks, sweat drops, lightbulbs, sparkles, motion lines, check marks.\nTHE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: four everyday moments when the junior engineer must send a message to his team right away. One wide picture divided into FOUR EQUAL PANELS in a 2 by 2 grid, separated by clean white gutters about 24 pixels wide, with no panel touching another. At the top of every panel sits one wide rounded cream label panel that holds that panel’s title word, printed large on ONE single line with clear room above every kanji for its furigana. Every panel shows the junior engineer of the reference picture (short dark brown hair, coral-orange shirt jacket over a white tee), and in every panel he holds his smartphone or sits at his laptop, ready to tell his team. TOP-LEFT PANEL (title: the first word below): in the bright office, the junior engineer stands at a large wall schedule board and slides one coral meeting card from a higher row down to the next row, a thick coral arrow showing the move; beside the board two large clock faces, the first showing two o’clock and the second showing three o’clock, with a coral arrow between them. Behind him three teammates at their desks look up with surprised round eyes and small exclamation marks — the change matters to everybody. TOP-RIGHT PANEL (title: the second word below): the junior engineer sits at his laptop with a huge proud grin and a big thumbs-up. Beside his desk stand two server racks side by side; the left rack carries a small cream tag with the word DEV and the right rack a small cream tag with the word PROD. One big green upward arrow and sparkles rise above both racks, and his laptop screen shows the word UPDATE above a progress bar that is completely full. Two teammates nearby turn their heads toward him with bright faces. BOTTOM-LEFT PANEL (title: the third word below): the junior engineer jumps back from his desk in shock, both hands on his head, huge sweat drops, wide eyes and a wavy open mouth; his big monitor shows a bright red warning screen with a large cartoon beetle drawing and the word BUG in big letters, and red exclamation marks burst around the monitor. BOTTOM-RIGHT PANEL (title: the fourth word below), the only panel that is NOT in the office: on its left two-thirds, a crowded train platform in the morning — the junior engineer, with a backpack on, stands beside a train that has stopped with its doors shut, sweat drops on his face and a worried wavy mouth, typing a message on his smartphone; a big station clock shows ten to nine, and a hanging departure board shows soft abstract bars and the English word DELAY in red; a small cream tag with the fifth word below sits next to him. On the right one-third, two small round insets stacked one above the other, each with a thick outline: the UPPER inset shows the same young man at home in bed in pajamas, flushed cheeks, a thermometer in his mouth and a cold towel on his forehead, holding his phone — a small cream tag with the sixth word below; the LOWER inset shows the same young man walking out of the office door in the early afternoon with his bag, giving a small apologetic bow and a wave, a wall clock behind him showing one o’clock — a small cream tag with the seventh word below. The four panels are the same size and read left to right, top to bottom.\nThe Japanese words in this picture are exactly: スケジュールの 変更（変更＝へんこう） / 開発環境・本番環境の アップデート（開発＝かいはつ、環境＝かんきょう、本番＝ほんばん） / バグが 発生（発生＝はっせい） / 遅刻・欠席・早退（遅刻＝ちこく、欠席＝けっせき、早退＝そうたい） / 遅刻（ちこく） / 欠席（けっせき） / 早退（そうたい） / DEV / PROD / UPDATE / BUG / DELAY.\nOutput: one landscape illustration, 1536x1024.\nLettering — read this part carefully. The picture contains ONLY the words listed above, and no other writing at all. Print each Japanese word LARGE and horizontally in a bold rounded gothic Japanese font, with generous space around it — either on a soft cream label with a rounded border, or inside a white speech balloon whose tail clearly points at the person who says it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp. Words written only in hiragana or katakana take no furigana, and Latin letters and numbers take no furigana either. The readings in round brackets are for you only — never print the brackets or the reading in the brackets as text. Spell every character exactly as given. Screens, papers and whiteboards show only soft abstract shapes apart from the listed words. No other letters, numbers, logos or watermarks anywhere in the picture.\nNever: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, horror or a scary dark mood, real grief, violence, watermarks, real company logos or brand marks of any kind (no fruit logo on laptops or phones, no chat-app logos), national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.",
        "refs": [
          "/img/hourensou/renraku/s1.webp"
        ],
        "status": "done"
      }
    }
  ]
}$j$::jsonb
          when 16 then t.block || jsonb_build_object('text', $t$4. 【 】と 箇条書きで 見やすく する$t$::text)
          when 17 then t.block || jsonb_build_object('caption', $t$【 】と 箇条書きで 書いた 連絡の 見本$t$::text)
          when 18 then t.block || jsonb_build_object('text', $t$【 】は、連絡を 見やすく する ための ラベルの ような ものです。フォーマルな メールだけで なく、ふだんの チャットでも 使います。【 】の 下には、箇条書き（・ bullet points）で 短く 書きます。【 】と 箇条書きは セットで 使いましょう。$t$::text)
          when 19 then jsonb_set(t.block, '{items,1}', to_jsonb($t$本文でも【原因】【対策】【期限】のように 見出しを 付けて、その 下に 箇条書きで 書くと、長い 文も 読んで もらえます。$t$::text))
          when 27 then t.block || jsonb_build_object('text', $t$電話で 大切な 話を した ときは、決まった ことを 文字でも 送りましょう。記録が 残ります。$t$::text)
          else t.block
        end
        order by t.position
      )
      from jsonb_array_elements(data->'blocks') with ordinality as t(block, position)
      where t.position not in (10, 32, 33)
    )
  ),
  '{furigana}',
  coalesce(data->'furigana', '[]'::jsonb) || $j$[
  [
    "本番環境",
    "ほんばんかんきょう"
  ],
  [
    "箇条書き",
    "かじょうがき"
  ],
  [
    "日にち",
    "ひにち"
  ],
  [
    "話を",
    "はなしを"
  ],
  [
    "元気",
    "げんき"
  ],
  [
    "関係",
    "かんけい"
  ],
  [
    "電車",
    "でんしゃ"
  ],
  [
    "遅刻",
    "ちこく"
  ],
  [
    "欠席",
    "けっせき"
  ],
  [
    "早退",
    "そうたい"
  ],
  [
    "下",
    "した"
  ],
  [
    "休",
    "やす"
  ],
  [
    "帰",
    "かえ"
  ]
]$j$::jsonb
)
where id = 'renraku_lecture'
  and kind = 'article'
  and jsonb_array_length(data->'blocks') = 39
  and data->'blocks'->7->>'text' = $t$気持ちを 伝えると、相手は あなたを 慰める ことに 時間を 使って しまいます。事実だけを 伝えれば、相手は すぐに 解決の ために 動けます。$t$
  and data->'blocks'->9->>'src' = $t$/img/hourensou/renraku/s2.webp$t$
  and data->'blocks'->10->>'text' = $t$実際の 連絡を 2つ 見て みましょう。どちらも「送る 相手」と「件名」を 先に 決めて から、中身を 書いて います。$t$
  and data->'blocks'->11->'items'->0->>'title' = $t$予定の 変更$t$
  and data->'blocks'->15->>'text' = $t$4. メールは【 】で 読みやすく する$t$
  and data->'blocks'->16->>'caption' = $t$【 】で 分けた メールの 見本$t$
  and data->'blocks'->17->>'text' = $t$社外の お客様や、他の 部署への メールなど、少し フォーマルな 連絡には【 】を 使いましょう。$t$
  and data->'blocks'->18->'items'->>1 = $t$本文でも【原因】【対策】【期限】のように 見出しを 付けると、長い 文も 読んで もらえます。$t$
  and data->'blocks'->26->>'text' = $t$電話の あとは、決まった ことを 文字でも 送りましょう。記録が 残ります。$t$
  and data->'blocks'->31->'items'->>0 = $t$相手が よく 使う 方法に 合わせます。チャットで 届いた 連絡には、チャットで 返します。$t$
  and data->'blocks'->32->>'text' = $t$いい 方法は、場面と 相手で 変わります。場面と 相手を 見て、選びましょう。$t$;
