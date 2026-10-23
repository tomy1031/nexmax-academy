/* UI strings in easy Japanese (やさしい日本語, about JLPT N4) with a quiet English line.
   Every kanji has furigana. Hard words link to the dictionary (KY.GLOSSARY). */
(function (root) {
  const KY = root.KY;

  KY.S = {
    start: { jp: 'はじめる', en: 'Start' },
    cont: { jp: 'つづきから', en: 'Continue' },
    binder: { jp: '{名刺|めいし}ファイル', en: 'Card file' },
    settings: { jp: '{設定|せってい}', en: 'Settings' },
    howto: { jp: 'あそびかた', en: 'How to play' },
    redRule: { jp: '{赤|あか}いものだけ {動|うご}かせます', en: 'Only the red thing moves.' },
    titleSub: { jp: '{日本|にほん}の IT{会社|かいしゃ}の「{空気|くうき}」を {読|よ}もう', en: 'Learn to read the air at a Japanese IT company' },
    titleFoot: { jp: '6つの チャプター・{全部|ぜんぶ}で 40{分|ぷん}ぐらい', en: '6 chapters · about 40 minutes' },

    /* first-run guide (導入ブロック) */
    guideTitle: { jp: 'はじめに', en: 'Before you start' },
    guideWhat: { jp: 'これは {何|なに}？', en: 'What is this?' },
    guideWhatBody: { jp: '{日本|にほん}の IT{会社|かいしゃ}で よくある {場面|ばめん}を、ミニゲームで {体験|たいけん}します。', en: 'You experience common situations at a Japanese IT company through mini-games.' },
    guideHow: { jp: 'どう すすめる？', en: 'How does it work?' },
    guideHowBody: { jp: '{赤|あか}いものを タップ、{長|なが}おし、ドラッグ。{何|なに}も しないのも OK。ゲームの あとで、こたえと オチを {見|み}よう！', en: 'Tap, hold or drag red objects — or do nothing. After each game, see the answer and the punchline!' },
    guideWords: { jp: 'わからない ことばは？', en: 'Words you do not know?' },
    guideWordsBody: { jp: '{下|した}に てんてんが ある ことばを タップすると、{辞書|じしょ}が {出|で}ます。', en: 'Tap a word with a dotted underline to open the dictionary.' },
    guideExample: { jp: 'ためしに タップ →', en: 'Try it →' },
    guideOk: { jp: 'わかりました', en: 'Got it' },

    /* map */
    mapTitle: { jp: 'IT{会社|かいしゃ}の {一日|いちにち}', en: 'A day at a Japanese IT company' },
    mapIntro: { jp: '1{問|もん}は 10〜20{秒|びょう}です。まわりを よく{見|み}て、{空気|くうき}を {読|よ}んでください。', en: 'Each stage takes 10–20 seconds. Watch the people around you and read the air.' },
    score: { jp: '{空気|くうき}{読|よ}み{度|ど}', en: 'Air-reading score' },
    chapter: { jp: 'チャプター', en: 'Chapter' },
    stages: { jp: '{問|もん}', en: 'stages' },
    soon: { jp: 'じゅんびちゅう', en: 'coming soon' },
    myRank: { jp: 'あなたの {役職|やくしょく}', en: 'My rank' },
    back: { jp: 'もどる', en: 'Back' },

    /* play */
    tapToStart: { jp: 'タップして スタート', en: 'Tap to start' },
    stage: { jp: 'ステージ', en: 'Stage' },
    seeWhy: { jp: '<<{解説|かいせつ}>>', en: 'Explanation' },
    paused: { jp: '{一時停止|いちじていし}', en: 'Paused' },
    pauseHint: { jp: 'ことばを タップすると、{意味|いみ}が {見|み}られます。', en: 'Tap a word to see what it means.' },
    resume: { jp: 'つづける', en: 'Resume' },
    retryStage: { jp: 'もう{一度|いちど} やる', en: 'Retry this stage' },
    toChapters: { jp: 'チャプターを えらぶ', en: 'Back to chapters' },
    loadError: { jp: 'この{問題|もんだい}を {読|よ}みこめませんでした。', en: 'This stage could not be loaded.' },

    /* manner card */
    mannerCard: { jp: 'マナー{名刺|めいし}', en: 'Manner card' },
    points: { jp: 'ここだけ おぼえよう！', en: 'Remember this!' },
    figure: { jp: '{図|ず}で {説明|せつめい}', en: 'Picture explanation' },
    demo: { jp: '{見本|みほん}を {見|み}る', en: 'Watch the model answer' },
    demoTitle: { jp: '{見本|みほん}', en: 'Model answer' },
    demoAgain: { jp: 'もう{一度|いちど} {見|み}る', en: 'Watch again' },
    phrase: { jp: '{使|つか}って みよう！', en: 'Say this!' },
    why: { jp: 'どうして？', en: 'Why?' },
    dont: { jp: 'してはいけない', en: "Don't" },
    tip: { jp: 'ひとこと メモ', en: 'Quick note' },
    listen: { jp: '{聞|き}く', en: 'Listen' },
    retry: { jp: 'もう{一度|いちど}', en: 'Retry' },
    next: { jp: '{次|つぎ}へ', en: 'Next' },
    chapterEnd: { jp: 'まとめへ', en: 'Chapter result' },
    close: { jp: 'とじる', en: 'Close' },
    play: { jp: 'あそぶ', en: 'Play' },

    /* settings */
    setFurigana: { jp: 'ふりがな', en: 'Furigana' },
    setFuriganaSub: { jp: '{漢字|かんじ}の {上|うえ}の よみかた', en: 'Readings above kanji' },
    setEnglish: { jp: '{英語|えいご}', en: 'English' },
    setEnglishSub: { jp: '{日本語|にほんご}の {下|した}に {小|ちい}さく {出|で}ます', en: 'Small translation under Japanese' },
    setRomaji: { jp: 'ローマ{字|じ}', en: 'Romaji' },
    setRomajiSub: { jp: '{使|つか}える ことばの よみかた', en: 'Latin letters for useful phrases' },
    setSound: { jp: '{音|おと}', en: 'Sound' },
    done: { jp: 'OK', en: 'Done' },
    reset: { jp: 'きろくを {全部|ぜんぶ} けす', en: 'Reset all progress' },
    resetSure: { jp: 'もう{一度|いちど} おすと けします', en: 'Tap again to erase all results' },

    /* dictionary */
    dictTitle: { jp: '{辞書|じしょ}', en: 'Dictionary' },

    /* ---------- M3: card file / chapter result / final rank / certificate ---------- */
    /* card file */
    fAll: { jp: 'すべて', en: 'All' },
    binderHint: { jp: '{名刺|めいし}を タップすると、もう{一度|いちど} {読|よ}めます。', en: 'Tap a card to read it again.' },
    binderNone: { jp: 'この しゅるいの {名刺|めいし}は まだ ありません。', en: 'No cards of this kind yet.' },
    notPlayed: { jp: 'まだ あそんでいません', en: 'Not played yet' },

    /* chapter result */
    resultHead: { jp: 'チャプター クリア！', en: 'Chapter clear!' },
    resultHigh: { jp: 'すばらしい！ この チャプターの {空気|くうき}は ばっちり {読|よ}めています。', en: 'Excellent! You read the air of this chapter perfectly.' },
    resultMid: { jp: 'いい ちょうし！ まちがえた ところは {名刺|めいし}で {読|よ}みなおして みましょう。', en: 'Good going! Re-read the cards for the ones you missed.' },
    resultLow: { jp: '{大丈夫|だいじょうぶ}。まちがえても {勉強|べんきょう}に なります。{名刺|めいし}を {読|よ}んで、もう{一度|いちど} あそんで みましょう。', en: "It's okay. Mistakes are how you learn. Read the cards and try again." },
    nextChapter: { jp: '{次|つぎ}の チャプターへ', en: 'Next chapter' },
    seeRank: { jp: 'あなたの {役職|やくしょく}を {見|み}る', en: 'See your rank' },

    /* final rank */
    finalHead: { jp: 'あなたの {役職|やくしょく}は…', en: 'Your rank is…' },
    cntGreat: { jp: '{読|よ}めた', en: 'Read it' },
    cntOk: { jp: 'まあまあ', en: 'Almost' },
    cntKy: { jp: 'KY', en: 'Missed it' },
    finalByChapter: { jp: 'チャプターごとの {空気|くうき}{読|よ}み{度|ど}', en: 'Score by chapter' },
    finalProvisional: { jp: 'まだ ぜんぶ あそんでいないので、この {役職|やくしょく}は かりの ものです。', en: 'You have not played every stage yet, so this rank is provisional.' },
    makeCert: { jp: '<<{修了証|しゅうりょうしょう}>>を つくる', en: 'Make my certificate' },

    /* certificate (hard words are dictionary words, defined in js/ui/certificate.js) */
    cert: { jp: '<<{修了証|しゅうりょうしょう}>>', en: 'Certificate of Completion' },
    certName: { jp: 'あなたの {名前|なまえ}', en: 'Your name' },
    certNamePh: { jp: 'なまえを いれてください', en: 'Type your name' },
    certText: { jp: '{空気読|くうきよ}み〜IT<<{業界編|ぎょうかいへん}>>〜の <<{研修|けんしゅう}>>を <<{修了|しゅうりょう}>>したことを <<{証明|しょうめい}>>します。', en: 'This certifies that the person named above has completed the training "Kuuki Yomi: IT Edition".' },
    certDate: { jp: '{日付|ひづけ}', en: 'Date' },
    certRank: { jp: '{役職|やくしょく}', en: 'Rank' },
    certChapters: { jp: 'おわった チャプター', en: 'Chapters completed' },
    certSave: { jp: 'JPGで ほぞん', en: 'Save as JPG' },
    certHint: { jp: '{名前|なまえ}を いれてから「JPGで ほぞん」を おすと、この <<{修了証|しゅうりょうしょう}>>が JPGの ファイルに なります。', en: 'Type your name, then press "Save as JPG" to get this certificate as an image file.' },
    certSaveError: { jp: 'ほぞん できませんでした。もう{一度|いちど} ためして ください。', en: 'Could not save. Please try again.' },
    certPartial: { jp: 'まだ ぜんぶの ステージを あそんでいません。', en: 'You have not played every stage yet.' },
  };

  /* grade headlines (verdict stamp) */
  KY.S.grade = {
    great: { jp: '{空気|くうき}{読|よ}めた！', en: 'You read the air!' },
    ok: { jp: 'まあまあ…', en: 'Almost…' },
    ky: { jp: 'KY…（{空気|くうき}{読|よ}めない）', en: "You didn't read the air" },
  };

  /* manner badges */
  KY.S.badge = {
    must: { label: { jp: '{基本|きほん}', en: 'MUST' }, note: { jp: 'どの{会社|かいしゃ}でも {大切|たいせつ}', en: 'Expected everywhere' } },
    depends: { label: { jp: '{会社|かいしゃ}による', en: 'DEPENDS' }, note: { jp: '{会社|かいしゃ}や {人|ひと}で ちがう', en: 'Varies by company or people' } },
    myth: { label: { jp: '{謎|なぞ}マナー', en: 'MYTH' }, note: { jp: 'しなくても {失礼|しつれい}ではない', en: 'Good to know, not required' } },
  };
})(typeof window !== 'undefined' ? window : globalThis);
