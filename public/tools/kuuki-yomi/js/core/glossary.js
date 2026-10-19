/* Dictionary for the popup (辞書). Key = the word exactly as written (plain text, no furigana).
   { yomi: reading, jp: easy-Japanese meaning (every kanji with furigana), en: short English gloss }
   A text links to an entry automatically when one furigana group's base equals the key
   ({上座|かみざ}), or explicitly with <<…>> for longer phrases (<<{失礼|しつれい}いたします>>). */
(function (root) {
  const KY = root.KY;

  /* chapter files add their own words: KY.addGlossary({ '稟議': { yomi, jp, en } }) — first definition wins */
  KY.addGlossary = function (entries) {
    for (const k in entries) if (!KY.GLOSSARY[k]) KY.GLOSSARY[k] = entries[k];
  };

  KY.GLOSSARY = {
    /* ---------- people & titles ---------- */
    '役職': { yomi: 'やくしょく', jp: '{会社|かいしゃ}の {中|なか}の {立場|たちば}の {名前|なまえ}。{社長|しゃちょう}、{部長|ぶちょう}など。', en: 'job title / position' },
    '社長': { yomi: 'しゃちょう', jp: '{会社|かいしゃ}で いちばん {上|うえ}の {人|ひと}。', en: 'company president' },
    '部長': { yomi: 'ぶちょう', jp: '{大|おお}きい グループの リーダー。{課長|かちょう}より {上|うえ}。', en: 'department manager' },
    '課長': { yomi: 'かちょう', jp: '{部長|ぶちょう}の {下|した}で、{小|ちい}さい グループを まとめる リーダー。', en: 'section manager' },
    '係長': { yomi: 'かかりちょう', jp: '{課長|かちょう}の {下|した}で、チームを まとめる {人|ひと}。', en: 'assistant manager / subsection chief' },
    '主任': { yomi: 'しゅにん', jp: '{仕事|しごと}を よく {知|し}っている、{少|すこ}し {上|うえ}の {社員|しゃいん}。', en: 'chief / senior staff' },
    '上司': { yomi: 'じょうし', jp: '{自分|じぶん}より {上|うえ}の {立場|たちば}の {人|ひと}。ボス。', en: 'your boss' },
    '先輩': { yomi: 'せんぱい', jp: '{自分|じぶん}より {先|さき}に {会社|かいしゃ}に {入|はい}った {人|ひと}。', en: 'senior colleague' },
    '先方': { yomi: 'せんぽう', jp: '{相手|あいて}の {会社|かいしゃ}（の {人|ひと}）。', en: 'the other party / the client' },
    '弊社': { yomi: 'へいしゃ', jp: '{自分|じぶん}の {会社|かいしゃ}を {丁寧|ていねい}に {言|い}う ことば。', en: 'our company (humble)' },
    '社員': { yomi: 'しゃいん', jp: '{会社|かいしゃ}で {働|はたら}く {人|ひと}。', en: 'employee' },
    '入社': { yomi: 'にゅうしゃ', jp: '{会社|かいしゃ}に {入|はい}って {働|はたら}きはじめること。', en: 'joining a company' },

    /* ---------- places & things ---------- */
    '応接室': { yomi: 'おうせつしつ', jp: 'お{客様|きゃくさま}と {話|はな}すための {部屋|へや}。ソファが ある。', en: 'reception room' },
    '上座': { yomi: 'かみざ', jp: '{部屋|へや}で いちばん いい {席|せき}。ふつうは {入口|いりぐち}から いちばん はなれた {席|せき}。', en: 'seat of honor (farthest from the door)' },
    '下座': { yomi: 'しもざ', jp: '{入口|いりぐち}に いちばん {近|ちか}い {席|せき}。{立場|たちば}が {下|した}の {人|ひと}が すわる。', en: 'lowest seat (nearest the door)' },
    '名刺': { yomi: 'めいし', jp: '{仕事|しごと}で わたす {小|ちい}さい カード。{名前|なまえ}と {会社|かいしゃ}が {書|か}いてある。', en: 'business card' },
    '名刺交換': { yomi: 'めいしこうかん', jp: 'はじめて {会|あ}った {人|ひと}と {名刺|めいし}を わたしあうこと。', en: 'exchanging business cards' },
    '名刺入れ': { yomi: 'めいしいれ', jp: '{名刺|めいし}を {入|い}れる ケース。', en: 'business card case' },
    '打ち合わせ': { yomi: 'うちあわせ', jp: '{仕事|しごと}の ことを {話|はな}しあうこと。{小|ちい}さい {会議|かいぎ}。', en: 'meeting' },
    'リリース': { yomi: 'リリース', jp: 'できた システムを、{使|つか}う {人|ひと}に {出|だ}すこと。', en: 'release (going live)' },
    '仕様変更': { yomi: 'しようへんこう', jp: 'システムの {作|つく}り{方|かた}の {決|き}まりを、あとから {変|か}えること。', en: 'change of specifications' },
    '残業': { yomi: 'ざんぎょう', jp: '{決|き}まった {時間|じかん}の あとも {働|はたら}くこと。', en: 'overtime work' },
    '障害': { yomi: 'しょうがい', jp: 'システムが {止|と}まったり、{動|うご}かなく なったりすること。', en: 'system failure / outage' },
    '謝罪': { yomi: 'しゃざい', jp: 'あやまること。', en: 'apology' },
    '土下座': { yomi: 'どげざ', jp: 'ひざを ついて、{頭|あたま}を ゆかに つけて あやまること。とても {強|つよ}い あやまり{方|かた}。', en: 'kneeling with your head on the floor (dogeza)' },
    'お辞儀': { yomi: 'おじぎ', jp: '{頭|あたま}を {下|さ}げて あいさつ すること。', en: 'bow' },
    '謎': { yomi: 'なぞ', jp: 'よく わからない こと。ふしぎな こと。', en: 'mystery' },

    /* ---------- certificate ---------- */
    '修了証': { yomi: 'しゅうりょうしょう', jp: '{勉強|べんきょう}の クラスを おわらせた ことを しめす {紙|かみ}。', en: 'certificate of completion' },
    '修了': { yomi: 'しゅうりょう', jp: '{勉強|べんきょう}や クラスを、さいごまで おわらせること。', en: 'completion (of a course)' },
    '研修': { yomi: 'けんしゅう', jp: '{仕事|しごと}に ひつような ことを、{会社|かいしゃ}などで {習|なら}うこと。', en: 'training' },
    '証明': { yomi: 'しょうめい', jp: '「ほんとうです」と はっきり しめすこと。', en: 'certification / proof' },
    '印刷': { yomi: 'いんさつ', jp: 'プリンターで {紙|かみ}に {出|だ}すこと。', en: 'printing' },
    '業界編': { yomi: 'ぎょうかいへん', jp: 'IT{会社|かいしゃ}の {世界|せかい}の ことを {教|おし}える バージョン、という {意味|いみ}。', en: '"IT industry edition"' },

    /* ---------- polite phrases ---------- */
    '失礼': { yomi: 'しつれい', jp: '{相手|あいて}に よくない こと。「すみません」の {意味|いみ}でも {使|つか}う。', en: 'rude / excuse me' },
    '失礼いたします': { yomi: 'しつれいいたします', jp: '{部屋|へや}に {入|はい}る とき、すわる とき などに {言|い}う {丁寧|ていねい}な あいさつ。', en: 'Excuse me (polite)' },
    '申します': { yomi: 'もうします', jp: '「{言|い}います」の {丁寧|ていねい}な {言|い}い{方|かた}。{自分|じぶん}の {名前|なまえ}を {言|い}う ときに {使|つか}う。', en: '"my name is…" (humble)' },
    '頂戴いたします': { yomi: 'ちょうだいいたします', jp: '「もらいます」の とても {丁寧|ていねい}な {言|い}い{方|かた}。', en: 'I humbly receive it' },
    '申し訳ございませんでした': { yomi: 'もうしわけございませんでした', jp: '「すみませんでした」の いちばん {丁寧|ていねい}な {言|い}い{方|かた}。', en: 'I am truly sorry' },
    '可能': { yomi: 'かのう', jp: 'できること。', en: 'possible' },
  };
})(typeof window !== 'undefined' ? window : globalThis);
