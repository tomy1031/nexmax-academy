/* Dictionary entries: カタカナのことば（本文中で自動的に辞書リンクになる）.
   Meanings are easy Japanese (about N4) with furigana on every kanji — checked by tests/glossary.test.js.
   head: the headword as shown in the popup when the key is only part of the word (e.g. 願 → {願|ねが}う). */
(function (root) {
  const KY = root.KY;
  KY.addGlossary({
    /* ---------- work & office ---------- */
    'チーム': { yomi: 'チーム', jp: 'いっしょに {仕事|しごと}を する {人|ひと}の グループ。', en: 'team (the people you work with)' },
    'グループ': { yomi: 'グループ', jp: 'いっしょに {仕事|しごと}を する {人|ひと}の まとまり。{会社|かいしゃ}の {中|なか}に いくつも ある。', en: 'group (a team or department inside a company)' },
    'リーダー': { yomi: 'リーダー', jp: 'チームを まとめて、{仕事|しごと}を {進|すす}める {人|ひと}。', en: 'leader (the person who leads a team)' },
    'オフィス': { yomi: 'オフィス', jp: '{会社|かいしゃ}で みんなが {仕事|しごと}を する {部屋|へや}や {場所|ばしょ}。', en: 'office' },
    'ロビー': { yomi: 'ロビー', jp: '{建物|たてもの}の {入口|いりぐち}に ある、{人|ひと}が {待|ま}ったり {会|あ}ったり する ひろい ところ。', en: 'lobby (the entrance hall where visitors wait)' },
    'カウンター': { yomi: 'カウンター', jp: '{受付|うけつけ}や {店|みせ}で、{人|ひと}と {話|はな}す ための {長|なが}い つくえ。', en: 'counter (a reception desk or shop counter)' },
    'ビジネス': { yomi: 'ビジネス', jp: '{会社|かいしゃ}の {仕事|しごと}。{会社|かいしゃ}と {会社|かいしゃ}の やりとり。', en: 'business (work and dealings between companies, as in "business manners")' },
    'ルール': { yomi: 'ルール', jp: 'みんなが まもる {決|き}まり。{会社|かいしゃ}の ルールは、{会社|かいしゃ}ごとに ちがう。', en: 'rule (the company rules everyone follows)' },
    'マナー': { yomi: 'マナー', jp: '{人|ひと}と {会|あ}う ときに、{相手|あいて}を {大切|たいせつ}に する {正|ただ}しい {行動|こうどう}や {習慣|しゅうかん}。', en: 'manners / etiquette (in Japanese, "manner" means the polite way to behave, e.g. business manners)' },
    'ハラスメント': { yomi: 'ハラスメント', jp: '{相手|あいて}が いやがる ことを、{何度|なんど}も したり、{無理|むり}に させたり すること。{仕事|しごと}では してはいけません。', en: 'harassment (bullying or unwanted behavior at work)' },
    'トラブル': { yomi: 'トラブル', jp: '{問題|もんだい}。うまく いかなくて こまる こと。', en: 'trouble (a problem or incident, e.g. a system trouble)' },
    'アイデア': { yomi: 'アイデア', jp: '「こうしたら いい」と {思|おも}いついた、{新|あたら}しい {考|かんが}え。', en: 'idea (a new way of doing something that you thought of)' },
    'イメージ': { yomi: 'イメージ', jp: '{頭|あたま}の {中|なか}に ある、「こんな {感|かん}じ」と いう {考|かんが}え。', en: 'image (a picture in your mind, an impression of how something should look or feel)' },
    'タイミング': { yomi: 'タイミング', jp: 'なにかを する、ちょうど いい {時|とき}。{早|はや}すぎても おそすぎても いけない。', en: 'timing (the right moment to do something)' },
    'ニュース': { yomi: 'ニュース', jp: '{新|あたら}しい できごとの {知|し}らせ。「{悪|わる}い ニュース」は、よく ない {知|し}らせ。', en: 'news (new information; "bad news" = a problem you must report quickly)' },
    'メモ': { yomi: 'メモ', jp: 'わすれないように、{紙|かみ}や スマホに {書|か}く {小|ちい}さい {文|ぶん}。', en: 'memo / note (a quick written note so you do not forget)' },
    'タスク': { yomi: 'タスク', jp: '{自分|じぶん}が やる ことに なっている {仕事|しごと}。「やること」の ひとつ。', en: 'task (one item of work you are supposed to do)' },
    'サービス': { yomi: 'サービス', jp: '{会社|かいしゃ}が お{客様|きゃくさま}に {出|だ}す {仕事|しごと}や {商品|しょうひん}。アプリや システムの ことも {言|い}う。', en: 'service (what a company offers customers; in Japan it can also mean a free extra)' },

    /* ---------- computers & IT ---------- */
    'システム': { yomi: 'システム', jp: 'コンピューターで {動|うご}く、{仕事|しごと}の ための プログラムの こと。IT{会社|かいしゃ}の {名前|なまえ}にも よく {使|つか}う。', en: 'system (a computer system or software; also common in IT company names, e.g. "ABC Systems")' },
    'パソコン': { yomi: 'パソコン', jp: '{仕事|しごと}や {勉強|べんきょう}で {使|つか}う コンピューター。「パーソナルコンピューター」を みじかく した ことば。', en: 'PC / personal computer (a Japanese-made short form; used for laptops and desktops)' },
    'アプリ': { yomi: 'アプリ', jp: 'スマホや パソコンで {使|つか}う ソフト。「アプリケーション」を みじかく した ことば。', en: 'app (short for "application", software on a phone or computer)' },
    'ツール': { yomi: 'ツール', jp: '{仕事|しごと}を する ための {道具|どうぐ}。ソフトや アプリの ことが {多|おお}い。', en: 'tool (a handy software program, app or device for work)' },
    'データ': { yomi: 'データ', jp: '{文字|もじ}や すうじ、{写真|しゃしん}など、コンピューターに {入|い}れて {使|つか}う もの。', en: 'data (information stored on a computer, e.g. an electronic file)' },
    'ファイル': { yomi: 'ファイル', jp: 'パソコンの {中|なか}に ある、{文|ぶん}や {写真|しゃしん}の データ。{紙|かみ}を いれる ホルダーも ファイルと {言|い}う。', en: 'file (a computer file; also a paper folder or binder, e.g. a business-card file)' },
    'フォーマット': { yomi: 'フォーマット', jp: '{書|か}き{方|かた}や {形|かたち}の {決|き}まり。どこに なにを {書|か}くか、{決|き}まって いる。', en: 'format (the fixed layout of a document or file)' },
    'バージョン': { yomi: 'バージョン', jp: 'おなじ ものを {直|なお}して、{新|あたら}しく した {形|かたち}。{古|ふる}い バージョン、{新|あたら}しい バージョンの ように {言|い}う。', en: 'version (an older or newer edition of software or a document)' },
    'テスト': { yomi: 'テスト', jp: 'ちゃんと {動|うご}くか、まちがいが ないか、{試|ため}す こと。', en: 'test (checking that a system works; also a school exam)' },
    'エラー': { yomi: 'エラー', jp: 'システムや プログラムが うまく {動|うご}かない こと。{画面|がめん}に まちがいの {知|し}らせが {出|で}る。', en: 'error (a problem or failure in a system or program)' },

    /* ---------- messages & contact ---------- */
    'チャット': { yomi: 'チャット', jp: '{会社|かいしゃ}の {人|ひと}と、スマホや パソコンで {文字|もじ}を {送|おく}りあう こと。また、その アプリ。', en: 'chat (messaging app at work, such as Slack or Teams)' },
    'メール': { yomi: 'メール', jp: 'インターネットで {送|おく}る {手紙|てがみ}。{仕事|しごと}の {連絡|れんらく}に よく {使|つか}う。', en: 'email (in Japanese メール means email, not postal mail)' },
    'メッセージ': { yomi: 'メッセージ', jp: 'チャットや メールで {相手|あいて}に {送|おく}る {文|ぶん}。', en: 'message (a text you send in chat or email)' },
    'オンライン': { yomi: 'オンライン', jp: 'インターネットで つながっていること。オンライン{会議|かいぎ}は、{会社|かいしゃ}に {行|い}かなくても、パソコンで {話|はな}せる {会議|かいぎ}。', en: 'online (connected over the internet, e.g. an online meeting)' },
    'コール': { yomi: 'コール', jp: '{電話|でんわ}の ベルが なる こと。「3コール」は、ベルが 3{回|かい} なる こと。', en: 'ring (one ring of a telephone; "3コール" = three rings, not "a phone call")' },
    'スタンプ': { yomi: 'スタンプ', jp: '{名前|なまえ}や マークを インクで {紙|かみ}に おす ための {道具|どうぐ}。チャットで {気持|きも}ちを {伝|つた}える、{小|ちい}さい イラストの ことも {言|い}う。', en: 'stamp (an ink stamp; in chat apps, also a small sticker picture)' },

    /* ---------- food, drink & table ---------- */
    'アルコール': { yomi: 'アルコール', jp: 'お{酒|さけ}に {入|はい}っている、{飲|の}むと よった {気持|きも}ちに なる もの。「アルコールの {入|はい}った {飲|の}み{物|もの}」は お{酒|さけ}。', en: 'alcohol (the part of beer, wine, etc. that makes you drunk)' },
    'ソフトドリンク': { yomi: 'ソフトドリンク', jp: 'お{酒|さけ}が {入|はい}って いない {飲|の}み{物|もの}。ジュースや お{茶|ちゃ}など。', en: 'soft drink (any non-alcoholic drink: juice, tea, cola, water; the menu word for "no alcohol")' },
    'ウーロン': { yomi: 'ウーロン', jp: 'ウーロン{茶|ちゃ}は、{中国|ちゅうごく}の お{茶|ちゃ}。{飲|の}み{会|かい}で、お{酒|さけ}の かわりに よく {飲|の}む。', en: 'oolong (as in oolong tea, a Chinese tea; a common non-alcoholic choice at drinking parties)' },
    'ナプキン': { yomi: 'ナプキン', jp: 'ごはんの とき、{口|くち}や {手|て}を ふく {小|ちい}さい {紙|かみ}や ぬの。{服|ふく}が よごれないように ひざに かける。', en: 'napkin (paper or cloth for wiping your mouth and hands at a meal)' },
    'コースター': { yomi: 'コースター', jp: '{飲|の}み{物|もの}の コップや グラスの {下|した}に しく、{小|ちい}さくて まるい もの。', en: 'coaster (a small mat placed under a glass or cup)' },
  });
})(typeof window !== 'undefined' ? window : globalThis);
