/* Manner card (マナー名刺): the learning screen after each stage, also opened from the Card File.
   Card texts are T objects in easy Japanese; dictionary words open the popup. */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;
  const { el } = KY.svg;

  /* 50 stage-specific, outcome-aware reactions and N4-level takeaways. */
  const COPY = {
  "1-1": {
    "rule": {
      "jp": "{会社|かいしゃ}に {入|はい}った すぐ あとに、「おはようございます！！」と {言|い}おう。",
      "en": "Say “Good morning!” before you sit down. Be the first to greet."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "「おはようございます！！」 {朝|あさ}から {元気|げんき}で いいね！",
        "en": "A clear “Good morning!” Nice start!"
      },
      "retry": {
        "jp": "{会社|かいしゃ}に {来|き}たのに、まだ あいさつが {聞|き}こえない…！",
        "en": "You arrived, but nobody heard a greeting…"
      }
    }
  },
  "1-2": {
    "rule": {
      "jp": "お{客様|きゃくさま}が オフィスに {来|き}たら、{仕事|しごと}を {止|と}めて、{席|せき}から {立|た}って あいさつしよう。",
      "en": "When a visitor comes into the office, pause your work, stand up, and greet them."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "お{客様|きゃくさま}が {来|き}た！ {席|せき}から {立|た}って、あいさつできた！",
        "en": "The visitor arrived. You stood up and greeted them!"
      },
      "retry": {
        "jp": "お{客様|きゃくさま}が {来|き}た。あいさつは、{座|すわ}った まま？",
        "en": "A visitor has arrived. Are you still sitting?"
      }
    }
  },
  "1-3": {
    "rule": {
      "jp": "{順番|じゅんばん}は {社長|しゃちょう} → {部長|ぶちょう} → {課長|かちょう} → {係長|かかりちょう} → {主任|しゅにん}。",
      "en": "Common order: president, department manager, section manager, subsection chief, senior staff."
    },
    "note": {
      "jp": "{役職|やくしょく}の {名前|なまえ}は {会社|かいしゃ}で ちがうよ。",
      "en": "Job titles vary between companies."
    },
    "reaction": {
      "great": {
        "jp": "{会社|かいしゃ}の {役職|やくしょく}、{上|うえ}から {順番|じゅんばん}に {並|なら}んだ！",
        "en": "You put the job titles in the right order!"
      },
      "retry": {
        "jp": "{役職|やくしょく}の {順番|じゅんばん}が ちがうと、{先輩|せんぱい}も びっくり！",
        "en": "The titles are out of order. Your coworker looks surprised!"
      }
    }
  },
  "1-4": {
    "rule": {
      "jp": "{遅|おく}れて いたら、すぐ {言|い}おう。「{何|なに}が {問題|もんだい}か」と「どうするか」を {伝|つた}えよう。",
      "en": "If work is behind, say so early. Tell the team what is wrong and what you will do."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{問題|もんだい}も {正直|しょうじき}に {報告|ほうこく}。チームが {助|たす}かる！",
        "en": "An honest progress report helps the team!"
      },
      "retry": {
        "jp": "「{順調|じゅんちょう}です」と {言|い}ったけど、{仕事|しごと}は {遅|おく}れている…！",
        "en": "You said things were on track, but work is behind…"
      }
    }
  },
  "1-5": {
    "rule": {
      "jp": "チャットは、あいさつと {用事|ようじ}を いっしょに {書|か}こう。{返事|へんじ}が {早|はや}くなるよ。",
      "en": "In chat, write the greeting AND what you need in one message."
    },
    "note": {
      "jp": "あいさつを {書|か}かない チームも あるよ。",
      "en": "Some teams skip greetings in chat."
    },
    "reaction": {
      "great": {
        "jp": "あいさつと {用件|ようけん}を {一度|いちど}に {送|おく}れた！",
        "en": "Greeting and request in one message. Nice!"
      },
      "retry": {
        "jp": "チャットに あいさつだけ。{相手|あいて}は {次|つぎ}の {文|ぶん}を {待|ま}っている…！",
        "en": "You only sent a greeting. Now they have to wait for your question…"
      }
    }
  },
  "1-6": {
    "rule": {
      "jp": "{会社|かいしゃ}の {電話|でんわ}は、なるべく {早|はや}く {出|で}て、{会社|かいしゃ}の {名前|なまえ}を {言|い}おう。",
      "en": "Answer the office phone promptly and say the company name."
    },
    "note": {
      "jp": "「3コール」は ひとつの {目安|めやす}。{会社|かいしゃ}の ルールを {聞|き}こう。",
      "en": "Three rings is only a guideline. Follow your workplace's rules."
    },
    "reaction": {
      "great": {
        "jp": "プルルル… はい、{電話|でんわ}に {出|で}られた！",
        "en": "Ring-ring! You answered the office phone!"
      },
      "retry": {
        "jp": "プルルル…まだ {鳴|な}っている。だれか {出|で}て！",
        "en": "Ring-ring… it is still ringing. Somebody answer!"
      }
    }
  },
  "1-7": {
    "rule": {
      "jp": "{画面|がめん}を {共有|きょうゆう}する {前|まえ}に、{通知|つうち}を オフ！ {見|み}せる {画面|がめん}も {確認|かくにん}。",
      "en": "Before sharing your screen, turn off notifications and check what everyone can see."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{画面共有|がめんきょうゆう}の {前|まえ}に {確認|かくにん}。{安心|あんしん}！",
        "en": "You checked before screen sharing. Safe!"
      },
      "retry": {
        "jp": "{会議中|かいぎちゅう}に {私用|しよう}の {通知|つうち}が {見|み}えたら、あわてる！",
        "en": "A personal notification during the meeting? Awkward!"
      }
    }
  },
  "1-8": {
    "rule": {
      "jp": "{先|さき}に {帰|かえ}る ときは、「お{先|さき}に {失礼|しつれい}します」と {言|い}おう。",
      "en": "When leaving before your coworkers, say “Osaki ni shitsurei shimasu.”"
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "「お{先|さき}に {失礼|しつれい}します！」{気持|きも}ちよく {帰|かえ}れた！",
        "en": "“I’m heading out first!” A nice way to leave!"
      },
      "retry": {
        "jp": "{先|さき}に {帰|かえ}る とき、{一言|ひとこと}あると いいね。",
        "en": "Leaving before others? One short phrase helps."
      }
    }
  },
  "1-9": {
    "rule": {
      "jp": "{遅|おく}れると {分|わ}かったら、すぐ {連絡|れんらく}。「{理由|りゆう}」と「{着|つ}く {時間|じかん}」を {伝|つた}えよう。",
      "en": "If you know you will be late, contact work immediately. Say why and when you expect to arrive."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{遅|おく}れると {分|わ}かったら、すぐ {連絡|れんらく}！",
        "en": "You reported the delay as soon as you knew!"
      },
      "retry": {
        "jp": "{電車|でんしゃ}が {止|と}まった。{会社|かいしゃ}には まだ {連絡|れんらく}が ない…！",
        "en": "The train has stopped, but work still does not know…"
      }
    }
  },
  "1-10": {
    "rule": {
      "jp": "{会議|かいぎ}は {少|すこ}し {前|まえ}に {行|い}って、{時間|じかん}どおりに {始|はじ}められるように しよう。",
      "en": "Arrive a little early so the meeting can start on time."
    },
    "note": {
      "jp": "まだ {部屋|へや}を {使|つか}って いたら、{外|そと}で {待|ま}とう。",
      "en": "If the room is in use, wait outside."
    },
    "reaction": {
      "great": {
        "jp": "{会議|かいぎ}の {前|まえ}に {準備|じゅんび}できた！",
        "en": "You were ready before the meeting. Great!"
      },
      "retry": {
        "jp": "10{時|じ}から {会議|かいぎ}。もう 10{時|じ}！ {準備|じゅんび}は？",
        "en": "The meeting starts at 10. It is already 10! Are you ready?"
      }
    }
  },
  "2-1": {
    "rule": {
      "jp": "14{時|じ}の {約束|やくそく}なら、{受付|うけつけ}は 13{時|じ}55{分|ふん}ごろが {目安|めやす}。",
      "en": "For a 2 p.m. appointment, arriving at reception around 1:55 is a useful guide."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{約束|やくそく}の {少|すこ}し {前|まえ}に {受付|うけつけ}へ。ちょうどいい！",
        "en": "You arrived at reception just before the appointment!"
      },
      "retry": {
        "jp": "{早|はや}すぎても、{遅|おそ}すぎても、{相手|あいて}は {困|こま}るかも。",
        "en": "Too early or too late can make things difficult for the host."
      }
    }
  },
  "2-2": {
    "rule": {
      "jp": "{客先|きゃくさき}では、{建物|たてもの}に {入|はい}る {前|まえ}に コートを {脱|ぬ}いで おこう。",
      "en": "When visiting a client, take off your coat before entering the building."
    },
    "note": {
      "jp": "{天気|てんき}や {場所|ばしょ}に {合|あ}わせて、{無理|むり}は しないでね。",
      "en": "Be practical about the weather and the location."
    },
    "reaction": {
      "great": {
        "jp": "コートを {脱|ぬ}いで、{気持|きも}ちよく {訪問|ほうもん}！",
        "en": "Coat off, ready to visit the client!"
      },
      "retry": {
        "jp": "コートを {着|き}たまま {入|はい}る？ {少|すこ}し {待|ま}って！",
        "en": "Walking in with your coat still on? Check first!"
      }
    }
  },
  "2-3": {
    "rule": {
      "jp": "{受付|うけつけ}では、{会社名|かいしゃめい}・{名前|なまえ}・{時間|じかん}・{会|あ}う {人|ひと}を {言|い}おう。",
      "en": "At reception, say your company, name, meeting time and whom you are visiting."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{受付|うけつけ}の {人|ひと}に、{名前|なまえ}と {約束|やくそく}を {伝|つた}えられた！",
        "en": "Reception knows your name and appointment!"
      },
      "retry": {
        "jp": "「{田中|たなか}さんに {会|あ}いたいです」だけでは、{受付|うけつけ}の {人|ひと}が {困|こま}るかも。",
        "en": "“I want to see Tanaka” may not be enough for reception."
      }
    }
  },
  "2-4": {
    "rule": {
      "jp": "{案内|あんない}する {人|ひと}は、エレベーターの ボタンの {前|まえ}へ。{行|い}く {階|かい}を {聞|き}こう。",
      "en": "If you are guiding the group, stand by the buttons and ask which floor."
    },
    "note": {
      "jp": "どこが {上座|かみざ}かは {場所|ばしょ}で ちがうよ。",
      "en": "The seat-of-honor rules differ by setting."
    },
    "reaction": {
      "great": {
        "jp": "エレベーターの ボタンは {自分|じぶん}が {担当|たんとう}！",
        "en": "You took care of the elevator buttons!"
      },
      "retry": {
        "jp": "お{客様|きゃくさま}と エレベーター。ボタンは だれが {押|お}す？",
        "en": "You and the client are in the lift. Who will press the button?"
      }
    }
  },
  "2-5": {
    "rule": {
      "jp": "{開|ひら}く ボタンを {押|お}して、お{客様|きゃくさま}に {先|さき}に {降|お}りてもらおう。",
      "en": "Hold the door-open button and let the client exit first."
    },
    "note": {
      "jp": "{安全|あんぜん}が いちばん {大切|たいせつ}。",
      "en": "Safety comes first."
    },
    "reaction": {
      "great": {
        "jp": "ドアを {開|あ}けて、お{客様|きゃくさま}が {先|さき}に おりた！",
        "en": "You held the doors so the guest could exit first!"
      },
      "retry": {
        "jp": "エレベーターの ドアが {閉|し}まりそう！ お{客様|きゃくさま}は まだ {中|なか}！",
        "en": "The doors are closing, but the guest is still inside!"
      }
    }
  },
  "2-6": {
    "rule": {
      "jp": "{客先|きゃくさき}では、{席|せき}を すすめられたら そこへ。{自分|じぶん}で {選|えら}ぶなら {入口|いりぐち}の {近|ちか}く。",
      "en": "At a client’s office, sit where you are invited. Otherwise, wait or choose a seat near the door."
    },
    "note": {
      "jp": "{席|せき}の ルールより、{相手|あいて}の {案内|あんない}を {大切|たいせつ}に。",
      "en": "Follow your host’s directions over rigid seating rules."
    },
    "reaction": {
      "great": {
        "jp": "{案内|あんない}された {席|せき}に {座|すわ}れた！",
        "en": "You followed the host’s seating instructions!"
      },
      "retry": {
        "jp": "{席|せき}を {決|き}める {前|まえ}に、{案内|あんない}を {聞|き}こう。",
        "en": "Before choosing a seat, listen to the host."
      }
    }
  },
  "2-7": {
    "rule": {
      "jp": "お{客様|きゃくさま}が {来|き}たら {立|た}って、{顔|かお}を {見|み}て あいさつしよう。",
      "en": "Stand up when the client enters and greet them while looking at them."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "お{客様|きゃくさま}を {見|み}て、{立|た}って あいさつ！",
        "en": "You stood up to greet the arriving guest!"
      },
      "retry": {
        "jp": "お{客様|きゃくさま}が {来|き}たのに、まだ {座|すわ}っている…？",
        "en": "The client arrived. Are you still sitting?"
      }
    }
  },
  "2-8": {
    "rule": {
      "jp": "{名刺|めいし}は {相手|あいて}が {読|よ}める {向|む}きで {渡|わた}そう。<<{打|う}ち{合|あ}わせ>>の {間|あいだ}は、もらった {名刺|めいし}を テーブルに {置|お}こう。",
      "en": "Present your business card facing the other person. Treat the card you receive carefully."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{名刺|めいし}が {相手|あいて}に {読|よ}める {向|む}き！",
        "en": "You handed the card over the right way round!"
      },
      "retry": {
        "jp": "{名刺|めいし}は {相手|あいて}に {名前|なまえ}を {見|み}せる もの。{向|む}きを {確認|かくにん}！",
        "en": "The point is to let the other person read your name. Check the direction!"
      }
    }
  },
  "3-1": {
    "rule": {
      "jp": "{名刺|めいし}は、{座|すわ}っている {人|ひと}の {順番|じゅんばん}に {置|お}こう。{名前|なまえ}を {見|み}ながら {話|はな}せるよ。",
      "en": "Place cards in the same order people are seated, so you can check their names."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{名刺|めいし}と {席|せき}が {合|あ}っている！",
        "en": "Cards match where people are sitting!"
      },
      "retry": {
        "jp": "{名刺|めいし}と {人|ひと}が {合|あ}わないと、{名前|なまえ}を {間違|まちが}えるかも。",
        "en": "If the cards do not match the seats, you might get a name wrong."
      }
    }
  },
  "3-2": {
    "rule": {
      "jp": "{名刺|めいし}を <<{切|き}らした>> ときは、まず <<{謝|あやま}って>>、{会社名|かいしゃめい}と {名前|なまえ}を {言|い}おう。あとで {連絡先|れんらくさき}を {送|おく}ろう。",
      "en": "If you have no business card, apologize, introduce yourself, and send contact details later."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{名刺|めいし}が なくても、{名前|なまえ}を ちゃんと {伝|つた}えた！",
        "en": "No cards left, but you introduced yourself!"
      },
      "retry": {
        "jp": "{名刺|めいし}が ない！ だまって いても {名前|なまえ}は {伝|つた}わらない。",
        "en": "No business cards! Staying silent will not tell anyone your name."
      }
    }
  },
  "3-3": {
    "rule": {
      "jp": "のどが <<からから>>でも、{相手|あいて}に「どうぞ」と {言|い}われてから、「いただきます」と {飲|の}もう。",
      "en": "When your host says “Please go ahead,” say “Itadakimasu” and drink."
    },
    "note": {
      "jp": "{相手|あいて}が {先|さき}に {飲|の}んだら、{飲|の}んでも いいよ。",
      "en": "It is also fine to drink once your host starts."
    },
    "reaction": {
      "great": {
        "jp": "「どうぞ」の あとに「いただきます」。いい {感|かん}じ！",
        "en": "“Please, have some.” “Thank you.” Nicely done!"
      },
      "retry": {
        "jp": "お{茶|ちゃ}が {来|き}た。まだ {話|はなし}の {途中|とちゅう}かも？",
        "en": "Tea has arrived, but the conversation may not be finished."
      }
    }
  },
  "3-4": {
    "rule": {
      "jp": "{上司|じょうし}が {来|く}る {前|まえ}なら、{入口|いりぐち}に {近|ちか}い {席|せき}が {安心|あんしん}。",
      "en": "If you arrive before your boss, a seat near the door is a safe choice."
    },
    "note": {
      "jp": "チームの {会議|かいぎ}は、{自由|じゆう}に {座|すわ}る {会社|かいしゃ}も {多|おお}いよ。",
      "en": "Many teams do not care about seat order."
    },
    "reaction": {
      "great": {
        "jp": "{席|せき}の {場所|ばしょ}も {考|かんが}えた！",
        "en": "You thought about where to sit!"
      },
      "retry": {
        "jp": "{会議室|かいぎしつ}で いちばん {奥|おく}の {席|せき}。そこに {座|すわ}っていい？",
        "en": "The best seat is at the back. Should you sit there?"
      }
    }
  },
  "3-5": {
    "rule": {
      "jp": "{話|はなし}の {区切|くぎ}りで かるく うなずこう。{相手|あいて}に「{聞|き}いています」が {伝|つた}わるよ。",
      "en": "Nod gently at natural pauses to show that you are listening."
    },
    "note": {
      "jp": "うなずきすぎると、{首|くび}も つかれちゃう！",
      "en": "Don’t nod so much you wear out your neck!"
    },
    "reaction": {
      "great": {
        "jp": "うなずいて「{聞|き}いています」が {伝|つた}わった！",
        "en": "A nod shows you are listening!"
      },
      "retry": {
        "jp": "オンライン{会議|かいぎ}。{相手|あいて}は あなたが {聞|き}いているか {分|わ}からない…！",
        "en": "In a video call, they cannot tell whether you are listening…"
      }
    }
  },
  "3-6": {
    "rule": {
      "jp": "「{検討|けんとう}します」は、まだ {決|き}まっていない {意味|いみ}。{次|つぎ}に {話|はな}す {日|ひ}を {聞|き}こう。",
      "en": "“We’ll consider it” does not mean yes. Ask when you can follow up."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "「{検討|けんとう}します」の {次|つぎ}も {確認|かくにん}！",
        "en": "You checked what happens after “We will consider it”!"
      },
      "retry": {
        "jp": "「{検討|けんとう}します」は、まだ {決|き}まって いないよ。",
        "en": "“We will consider it” is not a final yes."
      }
    }
  },
  "3-7": {
    "rule": {
      "jp": "{即答|そくとう}で「やります！」は {危険|きけん}。{時間|じかん}や {影響|えいきょう}を {確認|かくにん}して、{相談|そうだん}しよう。",
      "en": "Don’t instantly promise a last-minute change. Check the effort and impact, then discuss options."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "お{客様|きゃくさま}と リリースの {日|ひ}を {相談|そうだん}できた！",
        "en": "You discussed the release timing with the client!"
      },
      "retry": {
        "jp": "リリースの {前日|ぜんじつ}に {変更|へんこう}？ まず チームに {確認|かくにん}！",
        "en": "A change the day before release? Check with the team first!"
      }
    }
  },
  "3-8": {
    "rule": {
      "jp": "{会議|かいぎ}の {終|お}わりは、あいさつを {終|お}えてから {退出|たいしゅつ}しよう。",
      "en": "Finish the farewell before leaving the online meeting."
    },
    "note": {
      "jp": "お{客様|きゃくさま}の {会議|かいぎ}では、{先|さき}に {相手|あいて}を {見送|みおく}ると {丁寧|ていねい}。",
      "en": "In a client meeting, letting the client leave first is polite."
    },
    "reaction": {
      "great": {
        "jp": "お{礼|れい}を {言|い}ってから {退出|たいしゅつ}！",
        "en": "You thanked everyone before leaving the call!"
      },
      "retry": {
        "jp": "「ありがとうございました」の {途中|とちゅう}で {画面|がめん}が {消|き}えたら、びっくり！",
        "en": "If the screen disappears halfway through “Thank you,” everyone is surprised!"
      }
    }
  },
  "4-1": {
    "rule": {
      "jp": "{問題|もんだい}が {出|で}たとき、すぐ {直|なお}せる {日|ひ}と {時間|じかん}を チームで {決|き}めよう。",
      "en": "Choose a release time when the team can respond if something breaks."
    },
    "note": {
      "jp": "{月曜|げつよう}が {正解|せいかい}とは {限|かぎ}らない。チームの {準備|じゅんび}で {決|き}まるよ。",
      "en": "Monday is not always best; it depends on the team's readiness."
    },
    "reaction": {
      "great": {
        "jp": "トラブルに {対応|たいおう}できる {日|ひ}を {選|えら}んだ！",
        "en": "You chose a release time with support available!"
      },
      "retry": {
        "jp": "{金曜日|きんようび}の {夜|よる}に リリース。{問題|もんだい}が {出|で}たら、だれが {直|なお}す？",
        "en": "Release on Friday night? Who will fix bugs if something breaks?"
      }
    }
  },
  "4-2": {
    "rule": {
      "jp": "{作|つく}る {前|まえ}に「たとえば、こうですか？」と {見本|みほん}を {見|み}せて {聞|き}こう。",
      "en": "Before building, show an example and ask, “Do you mean something like this?”"
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "「いい{感|かん}じ」の {意味|いみ}を {確認|かくにん}できた！",
        "en": "You clarified what “make it nice” means!"
      },
      "retry": {
        "jp": "「いい{感|かん}じに」は、{人|ひと}に よって {違|ちが}う！",
        "en": "“Make it nice” means different things to different people!"
      }
    }
  },
  "4-3": {
    "rule": {
      "jp": "{大|おお}きな エラーは、{直|なお}す {前|まえ}に すぐ {報告|ほうこく}。まず {何|なに}が {起|お}きたか {話|はな}そう。",
      "en": "Report major production issues immediately, before trying to fix everything yourself."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "エラー！ すぐ {報告|ほうこく}。チームが {動|うご}ける！",
        "en": "An error! You reported it so the team could act!"
      },
      "retry": {
        "jp": "{本番|ほんばん}で エラー。ひとりで {全部|ぜんぶ} {直|なお}す {前|まえ}に {報告|ほうこく}！",
        "en": "A production error? Report it before trying to fix everything alone!"
      }
    }
  },
  "4-4": {
    "rule": {
      "jp": "{稟議書|りんぎしょ}は {会社|かいしゃ}の {決|き}まった {順番|じゅんばん}で {回|まわ}そう。",
      "en": "Send the approval document in the order your company requires."
    },
    "note": {
      "jp": "{紙|かみ}も {電子|でんし}システムも あるよ。",
      "en": "Some offices use paper stamps; others use online approval."
    },
    "reaction": {
      "great": {
        "jp": "{会社|かいしゃ}の {決|き}まりどおりに {書類|しょるい}を {回|まわ}せた！",
        "en": "You followed the approval steps at work!"
      },
      "retry": {
        "jp": "{書類|しょるい}に ハンコが {必要|ひつよう}。だれに {先|さき}に {聞|き}く？",
        "en": "The document needs approval. Who should see it first?"
      }
    }
  },
  "4-5": {
    "rule": {
      "jp": "{部長|ぶちょう}への {返事|へんじ}に {迷|まよ}ったら、「{承知|しょうち}しました」が {安心|あんしん}。",
      "en": "When unsure how to reply to a manager, “Shōchi shimashita” is a polite choice."
    },
    "note": {
      "jp": "「{了解|りょうかい}です」で {大丈夫|だいじょうぶ}な チームも あるよ。",
      "en": "Some teams are also fine with “Ryōkai desu.”"
    },
    "reaction": {
      "great": {
        "jp": "{部長|ぶちょう}にも {丁寧|ていねい}な {返事|へんじ}が できた！",
        "en": "You replied politely to the department manager!"
      },
      "retry": {
        "jp": "{部長|ぶちょう}から チャット。「りょ」だけで {大丈夫|だいじょうぶ}？",
        "en": "Your boss sent a message. Is “k” enough?"
      }
    }
  },
  "4-6": {
    "rule": {
      "jp": "{指定|してい}の {形|かたち}で {作|つく}り、{使|つか}いにくければ {理由|りゆう}を {言|い}って {相談|そうだん}しよう。",
      "en": "Use the requested template, but explain problems and suggest improvements."
    },
    "note": {
      "jp": "{勝手|かって}に {変|か}えると、お{客様|きゃくさま}が {困|こま}ることも。",
      "en": "Changing the format without asking can cause trouble for the client."
    },
    "reaction": {
      "great": {
        "jp": "{指定|してい}の Excelを {作|つく}った。{困|こま}ったら {相談|そうだん}！",
        "en": "You followed the Excel format and can ask if it is difficult!"
      },
      "retry": {
        "jp": "Excelの マスが たくさん！ でも {会社|かいしゃ}の {指定|してい}が あるかも。",
        "en": "Lots of Excel cells! But your workplace may require that format."
      }
    }
  },
  "4-7": {
    "rule": {
      "jp": "「{大丈夫|だいじょうぶ}です」は、{前|まえ}と {後|あと}の {話|はなし}で {意味|いみ}が {変|か}わることが あるよ。",
      "en": "If “Daijōbu desu” is unclear, politely ask again whether they want it."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "{後|あと}の {話|はなし}を {聞|き}いて、「{大丈夫|だいじょうぶ}です」の {意味|いみ}が わかった！",
        "en": "You checked what “daijōbu desu” means!"
      },
      "retry": {
        "jp": "「{大丈夫|だいじょうぶ}です」は、{前|まえ}と {後|あと}の {言葉|ことば}も よく {聞|き}こう。",
        "en": "“Daijōbu desu”: yes or no? Ask once more."
      }
    }
  },
  "4-8": {
    "rule": {
      "jp": "{有給|ゆうきゅう}の {理由|りゆう}は、{短|みじか}くて OK。{早|はや}めに {申請|しんせい}して、{仕事|しごと}を {引|ひ}き{継|つ}ごう。",
      "en": "A short reason for paid leave is enough. Apply and hand over any work as needed."
    },
    "note": {
      "jp": "{休|やす}むことも {大切|たいせつ}。{無理|むり}に {理由|りゆう}を {話|はな}さなくていいよ。",
      "en": "Rest matters. You do not need to share private details."
    },
    "reaction": {
      "great": {
        "jp": "{休|やす}みの {申請|しんせい}は {短|みじか}く、{早|はや}めに！",
        "en": "You made a clear request for time off early!"
      },
      "retry": {
        "jp": "{有給|ゆうきゅう}を {取|と}りたい。{長|なが}い {説明|せつめい}より {早|はや}い {連絡|れんらく}！",
        "en": "Need paid leave? A timely request matters more than a long explanation."
      }
    }
  },
  "5-1": {
    "rule": {
      "jp": "{座敷|ざしき}では、{入口|いりぐち}に {近|ちか}い {席|せき}が {新人|しんじん}の {目安|めやす}。",
      "en": "At a traditional tatami restaurant, the seat near the entrance is often for junior staff."
    },
    "note": {
      "jp": "{自由|じゆう}に {座|すわ}る {飲|の}み{会|かい}も あるよ。",
      "en": "At many social dinners, people sit wherever they like."
    },
    "reaction": {
      "great": {
        "jp": "{座敷|ざしき}では {席|せき}の {場所|ばしょ}も {気|き}をつけた！",
        "en": "You paid attention to the seating arrangement!"
      },
      "retry": {
        "jp": "{部長|ぶちょう}の {席|せき}に {先|さき}に {座|すわ}っちゃう？",
        "en": "Are you about to sit in the manager’s seat?"
      }
    }
  },
  "5-2": {
    "rule": {
      "jp": "{乾杯|かんぱい}の {声|こえ}が {出|で}てから {飲|の}もう。お{酒|さけ}でなくても OK！",
      "en": "Wait until everyone says “Kanpai!” before drinking. A soft drink is fine."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "「{乾杯|かんぱい}！」みんなで {同|おな}じ タイミング！",
        "en": "“Cheers!” Everyone drinks together!"
      },
      "retry": {
        "jp": "{話|はなし}が {終|お}わる {前|まえ}に {飲|の}むと、あれ？ ひとりだけ？",
        "en": "Drinking before the toast? You may be the only one!"
      }
    }
  },
  "5-3": {
    "rule": {
      "jp": "{高|たか}さより、{笑顔|えがお}で「{乾杯|かんぱい}！」が {大切|たいせつ}。",
      "en": "The friendly “Cheers!” matters more than which glass is lower."
    },
    "note": {
      "jp": "グラスを {低|ひく}くするのは {必|かなら}ず する ルールじゃないよ。",
      "en": "Keeping your glass lower is not a required rule."
    },
    "reaction": {
      "great": {
        "jp": "グラスの {高|たか}さより、{笑顔|えがお}で {乾杯|かんぱい}！",
        "en": "A friendly “Cheers!” matters more than glass height!"
      },
      "retry": {
        "jp": "{乾杯|かんぱい}で グラスの {高|たか}さを {考|かんが}えすぎ？",
        "en": "Worrying too much about glass height at a toast?"
      }
    }
  },
  "5-4": {
    "rule": {
      "jp": "グラスの {中|なか}が {少|すく}なく なったら、「<<おつぎ>>しましょうか？」と {聞|き}こう。",
      "en": "Ask before refilling someone’s glass. If they say no, respect it."
    },
    "note": {
      "jp": "お{酌|しゃく}を しない {会社|かいしゃ}も あるよ。",
      "en": "Many teams do not expect anyone to pour drinks."
    },
    "reaction": {
      "great": {
        "jp": "{飲|の}み{物|もの}を {注|そそ}ぐ {前|まえ}に {聞|き}けた！",
        "en": "You asked before refilling someone’s glass!"
      },
      "retry": {
        "jp": "{飲|の}み{物|もの}を {注|そそ}ぐ？ まず {相手|あいて}に {聞|き}こう。",
        "en": "Going to refill a glass? Ask first."
      }
    }
  },
  "5-5": {
    "rule": {
      "jp": "お{酒|さけ}を {飲|の}まない ときは、はっきり {断|ことわ}って、{好|す}きな {飲|の}み{物|もの}を {頼|たの}もう。",
      "en": "If you do not drink alcohol, just say so and order what you want."
    },
    "note": {
      "jp": "お{酒|さけ}を {無理|むり}に {飲|の}ませるのは ダメ！",
      "en": "Never pressure anyone to drink alcohol."
    },
    "reaction": {
      "great": {
        "jp": "お{酒|さけ}を {飲|の}まなくても、{楽|たの}しく {乾杯|かんぱい}！",
        "en": "You joined the toast without drinking alcohol!"
      },
      "retry": {
        "jp": "{飲|の}めない ときは、{無理|むり}しなくて いいよ。",
        "en": "You do not have to drink alcohol if you do not want to."
      }
    }
  },
  "5-6": {
    "rule": {
      "jp": "{最後|さいご}の ひとつは、「{誰|だれ}か {食|た}べますか？」と {聞|き}いてみよう。",
      "en": "For the last piece on a shared plate, try asking whether anyone wants it."
    },
    "note": {
      "jp": "なかの いい チームなら、{気|き}にしないことも あるよ。",
      "en": "Close-knit teams may not mind who takes it."
    },
    "reaction": {
      "great": {
        "jp": "{最後|さいご}の からあげ、みんなに {聞|き}いてから！",
        "en": "You checked before taking the last piece!"
      },
      "retry": {
        "jp": "お{皿|さら}に からあげが {一|ひと}つ。だれが {食|た}べる？",
        "en": "Only one piece of chicken is left. Who gets it?"
      }
    }
  },
  "5-7": {
    "rule": {
      "jp": "{行|い}かない ときは、「{今日|きょう}は {帰|かえ}ります。ありがとうございました」と {言|い}おう。",
      "en": "If you are not going, say clearly, “I’m going home today. Thank you!”"
    },
    "note": {
      "jp": "{参加|さんか}するか どうかは {自分|じぶん}で {決|き}めていいよ。",
      "en": "Joining an after-party is your choice."
    },
    "reaction": {
      "great": {
        "jp": "{二次会|にじかい}は {行|い}かない と {伝|つた}えられた！",
        "en": "You politely said you would skip the after-party!"
      },
      "retry": {
        "jp": "{二次会|にじかい}に {行|い}かない？ {一言|ひとこと} {伝|つた}えよう。",
        "en": "Skipping the after-party? Just tell people kindly."
      }
    }
  },
  "5-8": {
    "rule": {
      "jp": "{次|つぎ}に {会|あ}ったら、「{昨日|きのう}は ごちそうさまでした！」と {伝|つた}えよう。",
      "en": "When you next see the person who treated you, thank them again."
    },
    "note": {
      "jp": "{次|つぎ}の {日|ひ}に {言|い}うのは {丁寧|ていねい}だけど、{必|かなら}ず {二回|にかい}という {決|き}まりでは ないよ。",
      "en": "Thanking them again is considerate, not a strict two-thank-you rule."
    },
    "reaction": {
      "great": {
        "jp": "{昨日|きのう}の ごちそうに、もう {一度|いちど}お{礼|れい}！",
        "en": "You thanked them again for yesterday’s meal!"
      },
      "retry": {
        "jp": "{昨日|きのう}ごちそうに なった。{今日|きょう} {会|あ}ったら {何|なん}と {言|い}う？",
        "en": "Someone treated you yesterday. What will you say today?"
      }
    }
  },
  "6-1": {
    "rule": {
      "jp": "{運転手|うんてんしゅ}が いる タクシーでは、{案内|あんない}する {人|ひと}が {助手席|じょしゅせき}に {座|すわ}ることが {多|おお}いよ。",
      "en": "In a chauffeured taxi, the person guiding the group often sits in front."
    },
    "note": {
      "jp": "お{客様|きゃくさま}の {希望|きぼう}が {最優先|さいゆうせん}。",
      "en": "The passenger’s preference comes first."
    },
    "reaction": {
      "great": {
        "jp": "{乗|の}る {前|まえ}に {席|せき}を {考|かんが}えた！",
        "en": "You thought about the seats before getting in!"
      },
      "retry": {
        "jp": "タクシーで お{客様|きゃくさま}と {一緒|いっしょ}。どこに {座|すわ}る？",
        "en": "In a taxi with a client, where should you sit?"
      }
    }
  },
  "6-2": {
    "rule": {
      "jp": "{上司|じょうし}が {運転|うんてん}する {車|くるま}では、{助手席|じょしゅせき}に {座|すわ}ると {自然|しぜん}。",
      "en": "When your manager is driving, sitting in the front passenger seat often feels natural."
    },
    "note": {
      "jp": "「{後|うし}ろへ どうぞ」と {言|い}われたら、{後|うし}ろへ。",
      "en": "If invited to sit in the back, do so."
    },
    "reaction": {
      "great": {
        "jp": "{上司|じょうし}が {運転|うんてん}。{助手席|じょしゅせき}で {会話|かいわ}できる！",
        "en": "Your manager is driving; the front seat helps conversation!"
      },
      "retry": {
        "jp": "{上司|じょうし}が {運転|うんてん}する {車|くるま}。{後|うし}ろに {座|すわ}る？",
        "en": "Your boss is driving. Are you sitting in the back?"
      }
    }
  },
  "6-3": {
    "rule": {
      "jp": "お{客様|きゃくさま}には {入口|いりぐち}から {遠|とお}い {席|せき}を。{自分|じぶん}は {入口|いりぐち}の {近|ちか}くへ。",
      "en": "Offer the guest a seat far from the door and take a seat near the entrance."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "まるい テーブルでも、お{客様|きゃくさま}の {席|せき}を {先|さき}に！",
        "en": "You chose a comfortable guest seat at the round table!"
      },
      "retry": {
        "jp": "まるい テーブル。どこが お{客様|きゃくさま}の {席|せき}？",
        "en": "A round table: where should the guest sit?"
      }
    }
  },
  "6-4": {
    "rule": {
      "jp": "{自分|じぶん}の {会社|かいしゃ}では、お{客様|きゃくさま}を {入口|いりぐち}から {遠|とお}い ソファへ {案内|あんない}しよう。",
      "en": "In your own office, guide visitors to the sofa away from the door."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "お{客様|きゃくさま}を ソファへ {案内|あんない}できた！",
        "en": "You guided the visitor to the sofa!"
      },
      "retry": {
        "jp": "お{客様|きゃくさま}が {来|き}た。{入口|いりぐち}で {立|た}たせたまま？",
        "en": "The visitor has arrived. Will you leave them standing at the door?"
      }
    }
  },
  "6-5": {
    "rule": {
      "jp": "{最初|さいしょ}の あいさつが {終|お}わったら、{仕事|しごと}の {話|はなし}の {前|まえ}に {渡|わた}そう。",
      "en": "Give the gift after the greeting and before the business discussion."
    },
    "note": {
      "jp": "{相手|あいて}が いそがしい ときは、{無理|むり}に {渡|わた}さないでね。",
      "en": "If the timing is awkward, wait for a suitable moment."
    },
    "reaction": {
      "great": {
        "jp": "お{土産|みやげ}を {自然|しぜん}な タイミングで {渡|わた}せた！",
        "en": "You gave the gift at a natural moment!"
      },
      "retry": {
        "jp": "お{土産|みやげ}を {持|も}ってきた。いつ {渡|わた}そう？",
        "en": "You brought a gift. When should you give it?"
      }
    }
  },
  "6-6": {
    "rule": {
      "jp": "{謝|あやま}る ときは、{言葉|ことば}で {謝|あやま}ってから、{深|ふか}く {頭|あたま}を {下|さ}げよう。",
      "en": "Apologize sincerely in words, then make a respectful deep bow."
    },
    "note": {
      "jp": "{土下座|どげざ}は {必要|ひつよう}ない。{相手|あいて}にも させないでね。",
      "en": "Never demand that someone kneel in apology."
    },
    "reaction": {
      "great": {
        "jp": "{言葉|ことば}と おじぎで、{丁寧|ていねい}に {謝|あやま}れた！",
        "en": "You apologized sincerely with words and a bow!"
      },
      "retry": {
        "jp": "{謝|あやま}る ときに {必要|ひつよう}なのは、{大|おお}きな {動|うご}きより {気持|きも}ち。",
        "en": "An apology needs sincerity more than a dramatic gesture."
      }
    }
  },
  "6-7": {
    "rule": {
      "jp": "まず {謝|あやま}ろう。{次|つぎ}に {原因|げんいん}と {対策|たいさく}を {説明|せつめい}しよう。",
      "en": "Apologize first; then explain the cause and your plan to prevent it happening again."
    },
    "note": null,
    "reaction": {
      "great": {
        "jp": "まず {謝|あやま}って、そのあと {説明|せつめい}できた！",
        "en": "You apologized first, then explained what happened!"
      },
      "retry": {
        "jp": "お{客様|きゃくさま}に {謝|あやま}る {場面|ばめん}。「でも…」から {始|はじ}める？",
        "en": "You need to apologize to a client. Should you start with “But…”?"
      }
    }
  },
  "6-8": {
    "rule": {
      "jp": "お{客様|きゃくさま}を {見送|みおく}る ときは、ドアが {閉|し}まるまで {丁寧|ていねい}に あいさつしよう。",
      "en": "When seeing a client off, keep your farewell polite until the elevator doors close."
    },
    "note": {
      "jp": "エレベーターの {近|ちか}くに ほかの {人|ひと}が いたら、{通|とお}れる {場所|ばしょ}を あけましょう。",
      "en": "When others use the elevator, leave space for them to pass."
    },
    "reaction": {
      "great": {
        "jp": "エレベーターの ドアが {閉|し}まるまで {見送|みおく}れた！",
        "en": "You saw the visitor off until the elevator doors closed!"
      },
      "retry": {
        "jp": "お{客様|きゃくさま}が {帰|かえ}る。ドアが {閉|し}まる {前|まえ}に {行|い}っちゃう？",
        "en": "The guest is leaving. Should you walk away before the doors close?"
      }
    }
  }
};

  function defaultDiagram(svg) {
    const p = new KY.Person({ x: 100, y: 140, s: 1.05, color: 'npc', bow: 30 });
    svg.append(el('line', { x1: 40, y1: 141, x2: 160, y2: 141, stroke: '#ddd', 'stroke-width': 2 }), p.el);
  }

  /* card.figure: a big labelled picture (kana only inside the SVG) + a numbered legend in easy Japanese */

  function bowGuideHTML(){
    return `<section class="sec bow-guide"><h3>${UI.T({jp:"お{辞儀|じぎ}の {角度|かくど}（{図|ず}で {説明|せつめい}）",en:"Types of bowing"})}</h3>
      <div class="bow-grid">
        <div><div class="bow-figure" style="--a:15deg"><i></i></div><b>${UI.T({jp:'15°：{会釈|えしゃく}',en:'Light bow — 15°'})}</b><p>${UI.T({jp:'{会社|かいしゃ}で {会|あ}った ときの かるい あいさつ。',en:""})}</p></div>
        <div><div class="bow-figure" style="--a:30deg"><i></i></div><b>${UI.T({jp:'30°：{敬礼|けいれい}',en:'Standard bow — 30°'})}</b><p>${UI.T({jp:'お{客様|きゃくさま}や {上司|じょうし}への あいさつ。',en:""})}</p></div>
        <div><div class="bow-figure" style="--a:45deg"><i></i></div><b>${UI.T({jp:'45°：{最敬礼|さいけいれい}',en:'Deep bow — 45°'})}</b><p>${UI.T({jp:'{深|ふか}い お{礼|れい}や、あやまる とき。',en:""})}</p></div>
        <div><div class="bow-ground">🙇</div><b>${UI.T({jp:'{土下座|どげざ}',en:'Dogeza'})}</b><p>${UI.T({jp:'テレビや {映画|えいが}で {見|み}ることが あります。{仕事|しごと}では しません。',en:""})}</p></div>
      </div></section>`;
  }

  function figureHTML(f) {
    const n = it => `<span class="fig-n${it.you ? ' you' : it.top ? ' top' : ''}">${KY.text.esc(String(it.n))}</span>`;
    return `<details class="card-figure-details" open><summary>${UI.L(S.figure)} ▾</summary><section class="sec fig">
      <div class="fig-svg" id="c-figure"></div>
      ${f.rule ? `<p class="fig-rule">${UI.TE(f.rule)}</p>` : ''}
      <ol class="fig-legend">${(f.legend || []).map(it => `<li>${n(it)}<div>${UI.TE(it)}</div></li>`).join('')}</ol>
    </section></details>`;
  }

  /* model answer: the stage replays by itself with its correct input (def.test.great); watch only */
  function openDemo(def) {
    let run = null;
    const m = UI.modal(`
      <div class="demo-head"><h2>${UI.L(S.demoTitle)}</h2><button class="icon-btn" type="button" id="demo-x" aria-label="${KY.text.esc(S.close.en)}">×</button></div>
      <div class="demo-host" id="demo-host"></div>
      <div class="demo-actions"><button class="btn" type="button" id="demo-again">↻ ${UI.L(S.demoAgain)}</button></div>`,
    { cls: 'demo-sheet', onClose: () => { if (run) run.destroy(); run = null; } });
    const host = m.el.querySelector('#demo-host');
    const play = () => {
      if (run) run.destroy();
      try {
        run = KY.run(def, host, {});
        run.scene.demo = true;
        /* the other person's reaction (shown in the verdict when you play) appears as a caption */
        run.scene.on('outcome', key => {
          const o = def.outcomes[key];
          if (o && o.line) run.scene.caption(o.who ? { jp: `${o.who.jp}「${o.line.jp}」`, en: o.line.en } : o.line);
        });
        run.scene.on('end', () => {
          const done = UI.h('div', 'demo-done', `${UI.stampSVG('great', 'mini-stamp')}`);
          host.append(done);
        });
        run.begin();
        run.simulate(def.test.great);
      } catch (e) { console.error(e); }
    };
    m.el.querySelector('#demo-x').onclick = () => m.close();
    m.el.querySelector('#demo-again').onclick = () => { KY.sfx.play('tap'); play(); };
    play();
  }

  UI.card = {
    /* opts: { grade, key, fromPlay, fromBinder } */
    open(id, opts = {}) {
      const def = KY.stage(id);
      if (!def) { UI.map.open(); return; }
      const c = def.card;
      const copy = ['1-4','1-5','1-8','1-9','4-1','4-4','4-8'].includes(id) ? null : COPY[id];
      const reaction = opts.grade && copy?.reaction ? (opts.grade === 'great' ? copy.reaction.great : copy.reaction.retry) : null;
      const ch = UI.chapter(def.chapter);
      const B = UI.BADGE[c.badge] || UI.BADGE.must;
      const scr = UI.$('#scr-card');
      const G = opts.grade ? UI.GRADE[opts.grade] : null;
      const nextId = UI.nextStageId(id);
      const last = UI.isLastOfChapter(id);

      scr.innerHTML = `
        <div class="card-top">
          ${G ? `<div class="card-result">${UI.stampSVG(opts.grade, 'mini-stamp')}<span>${UI.L(G.head)}</span></div>` : '<div></div>'}
          ${UI.enBtn()}
        </div>
        <div class="card-wrap">
          <article class="meishi" aria-label="${KY.text.esc(S.mannerCard.en)}">
            <div class="m-left">
              <div class="m-co">${UI.L(S.chapter)} ${def.chapter} ${UI.L(ch.title)}<br>No. ${def.id}</div>
              <div class="m-name">${UI.TE(c.name)}</div>
              <div class="m-foot">${UI.L(S.mannerCard)}</div>
            </div>
            <div class="m-right">
              <span class="badge ${c.badge}">${UI.L(B.label)}</span>
              <div class="badge-note">${UI.L(B.note)}</div>
              <div class="m-diagram" id="m-diagram"></div>
            </div>
          </article>
        </div>
        <div class="card-body">
          ${reaction ? `<div class="card-reaction ${opts.grade === 'great' ? 'success' : 'try-again'}">${UI.TE(reaction)}</div>` : ''}
          <section class="sec card-rule"><h3>${UI.L(S.points)}</h3>
            ${copy ? `<p>${UI.TE(copy.rule)}</p>` : `<ul>${c.points.map(p => `<li>${UI.TE(p)}</li>`).join('')}</ul>`}
          </section>
          ${c.figure ? figureHTML(c.figure) : ''}
          ${id === '1-2' || id === '6-4' ? bowGuideHTML() : ''}
          <section class="sec card-phrase"><h3>${UI.L(S.phrase)}</h3>
            <div class="phrase">${UI.TE(c.phrase)}<button class="icon-btn speak" type="button" id="c-speak" aria-label="${KY.text.esc(S.listen.en)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8h3l4-3v10l-4-3H4z" fill="currentColor"/><path d="M14 7.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>
          </section>
          ${copy?.note || c.tip ? `<div class="card-note"><span>${UI.L(S.tip)}</span>${UI.TE(c.tip || copy.note)}</div>` : ''}
          ${def.test ? `<button class="btn demo-btn" type="button" id="c-demo"><span class="demo-play" aria-hidden="true">▶</span>${UI.L(S.demo)}</button>` : ''}
        </div>
        <div class="card-actions">
          ${opts.fromBinder
            ? `<button class="btn" type="button" id="c-play">${UI.L(S.play)} ${def.id}</button><button class="btn primary" type="button" id="c-close">${UI.L(S.close)}</button>`
            : `<button class="btn" type="button" id="c-retry">↻ ${UI.L(S.retry)}</button><button class="btn primary" type="button" id="c-next">${UI.L(last ? S.chapterEnd : S.next)} ${!last && nextId ? `<small class="next-stage-no">${nextId}</small>` : ''} ▶</button>`}
        </div>`;

      const svg = el('svg', { viewBox: '0 0 200 150', 'aria-hidden': 'true' });
      try { (c.diagram || defaultDiagram)(svg); } catch (e) { console.error(e); }
      UI.$('#m-diagram').append(svg);
      if (c.figure) {
        const big = el('svg', { viewBox: c.figure.viewBox || '0 0 320 244', role: 'img', 'aria-label': c.figure.rule ? c.figure.rule.en : '' });
        try { c.figure.draw(big); } catch (e) { console.error(e); }
        UI.$('#c-figure').append(big);
      }
      UI.show('scr-card');

      if (UI.$('#c-demo')) UI.$('#c-demo').onclick = () => openDemo(def);
      UI.$('#c-speak').onclick = () => { if (!KY.sfx.speak(KY.text.kana(c.phrase.jp))) UI.$('#c-speak').disabled = true; };
      if (opts.fromBinder) {
        UI.$('#c-close').onclick = () => UI.binder.open();
        UI.$('#c-play').onclick = () => UI.play.open(def.id);
      } else {
        UI.$('#c-retry').onclick = () => UI.play.open(def.id);
        UI.$('#c-next').onclick = () => {
          UI.play.cleanup();
          if (last) UI.result.open(def.chapter);
          else if (nextId) UI.play.open(nextId);
          else UI.map.open();
        };
      }
    },
  };
})(window);
