/**
 * 事業 — 自分たちで 作って いる 新しい サービス。
 *
 * タブに しないで **縦に 並べる**。タブに すると 開いて いない ぶんの 文が
 * 画面に 出ない ので、端末の 中の 検索でも 見つからず、ルビの 検査も 通り抜ける。
 *
 * ## 1つ1つを くわしく 書く（2026-08-23 の 指定）
 * 名前と ひとことだけでは、学習者は「なにを する サービスか」を ヘンディさんに
 * 説明できない。どの サービスも 同じ 3つで そろえる:
 *   ① こまって いた こと（なぜ 要るのか）
 *   ② どう うごきますか（順番）
 *   ③ できる こと
 * 見出しは `UI.service` が 持つ ので、5つが かならず 同じ 呼び名で 並ぶ。
 * 中身の 出どころは 本家の 各サービスページ（2026-08-23 取得）。
 */

export const SERVICES = {
  id: "services",
  nav: "事業",
  title: {
    n4: "自分たちで 作る サービス",
    n3: "先進事業（自社サービス）",
    en: "Our own services",
  },
  hero: "/gakushu/nextmake/img/hero_services.webp",
  heroAlt: "",
  blocks: [
    {
      kind: "paragraph",
      text: {
        n4: "お客さまの ものを 作る だけでは ありません。自分たちの サービスも 作って います。2026年7月に 新しく 出した ものを しょうかいします。",
        n3: "受託開発だけではなく、自社サービスの開発も行っています。2026年7月にリリースした新サービスを紹介します。",
        en: "We do not only build for clients. We also create our own services. Here are the ones we released in July 2026.",
      },
    },

    /* ---------------- 01 NMClaw ---------------- */
    {
      kind: "service",
      name: "NMClaw",
      image: "/gakushu/nextmake/img/svc_nmclaw.webp",
      reading: "エヌエムクロー",
      icon: "🤖",
      lead: { n4: "情報を、価値へ", n3: "情報を、価値へ", en: "From information to value" },
      text: {
        n4: "話すだけで、会社の 情報が 整理される しくみです。現場の 会話や チャットから、AIが ひつような ことを あつめます。",
        n3: "話すだけで社内の情報が整理される仕組みです。現場の会話や音声、チャットから必要な情報を集め、業務で使えるデータに変えます。",
        en: "Just talk, and the company's information organises itself. AI collects what it needs from conversations and chats.",
      },
      before: [
        {
          n4: "話した ことが その 人の 中で 止まって、ひつような 人に とどかない。",
          n3: "口頭報告や個人のメモに残り、必要な人へ届かない。",
          en: "What was said stays with one person and never reaches the people who need it.",
        },
        {
          n4: "同じ ことを、いくつもの 場所に 何回も 書いて いる。",
          n3: "同じ内容を複数の台帳やシステムへ繰り返し入力している。",
          en: "The same thing gets typed into several systems again and again.",
        },
        {
          n4: "数が そろうまでに 時間が かかり、決めるのが おそく なる。",
          n3: "集計されるまで時間がかかり、判断が後手になる。",
          en: "Numbers take so long to add up that decisions come late.",
        },
      ],
      how: [
        {
          n4: "話すか、チャットに 書く。ふだんの ことばで だいじょうぶです。",
          n3: "チャットや音声で入力する。普段の言葉で現場の状況をそのまま共有する。",
          en: "Speak or type into the chat, in everyday words.",
        },
        {
          n4: "AIが 読む。お客さま・お金・いつまで・する ことを 見つけます。",
          n3: "AIが内容を理解し、顧客、案件、金額、期日、タスクを読み取る。",
          en: "AI reads it and picks out the client, the amount, the deadline and the tasks.",
        },
        {
          n4: "足りない ことは、AIが 聞きます。",
          n3: "不足している内容をAIが確認する。",
          en: "If something is missing, the AI asks.",
        },
        {
          n4: "見つけた ことを、正しい ところに 入れます。",
          n3: "読み取った内容を適切な業務項目へ自動で振り分ける。",
          en: "What it found goes into the right place automatically.",
        },
        {
          n4: "まとめて、見える 形に します。",
          n3: "ダッシュボードやレポートとして可視化する。",
          en: "Then it becomes a dashboard or a report you can look at.",
        },
      ],
      can: [
        {
          label: { n4: "声で 入れる", n3: "音声・チャット入力", en: "Voice and chat input" },
          text: {
            n4: "パソコンを ひらかなくても、話すだけで 記録できます。",
            n3: "PCを開かなくても、話す・送るという自然な操作で情報を残せます。",
            en: "No need to open a computer — just talk.",
          },
        },
        {
          label: { n4: "毎日の まとめ", n3: "業務サマリー", en: "Daily summary" },
          text: {
            n4: "その日・その週の ことを、読みやすく まとめて とどけます。",
            n3: "日次・週次の状況を、必要な人へ読みやすくまとめて届けます。",
            en: "It sends a readable summary of the day or the week.",
          },
        },
        {
          label: { n4: "わすれものを 知らせる", n3: "アラート・タスク化", en: "Alerts and tasks" },
          text: {
            n4: "いつまでの ことや、やり のこした ことを 見つけて 教えます。",
            n3: "期日や対応漏れを見つけ、次にすべき行動を明確にします。",
            en: "It spots deadlines and things left undone, and says what to do next.",
          },
        },
      ],
    },

    /* ---------------- 02 観光DX ---------------- */
    {
      kind: "service",
      name: "観光DX",
      image: "/gakushu/nextmake/img/svc_tourism.webp",
      reading: "かんこうディーエックス",
      icon: "🗺️",
      lead: { n4: "文化を、体験へ", n3: "文化を、体験へ", en: "From culture to experience" },
      text: {
        n4: "1つの QRコードから、町の 物語が ひらきます。町に ねむって いる 歴史を 動画に して、来た 人を 町ぜんたいへ 案内します。",
        n3: "ひとつのQRから街の物語がひらきます。観光地に眠る歴史や文化を動画ストーリーに変え、訪れる人を街全体へ案内します。",
        en: "One QR code opens the town's story. History becomes video, and visitors are guided around the whole town.",
      },
      before: [
        {
          n4: "名所を 見るだけで、なぜ そこが 大切なのか 分からない。",
          n3: "名所を見るだけで、その背景にある人々の営みや歴史が伝わらない。",
          en: "You look at the famous spot but never learn why it matters.",
        },
        {
          n4: "アプリを 入れるのが めんどうで、そこで やめて しまう。",
          n3: "専用アプリのインストールが必要だと、そこで離脱してしまう。",
          en: "Having to install an app is where most people give up.",
        },
        {
          n4: "有名な ところだけ 見て、町の ほかの お店には 行かない。",
          n3: "有名な観光地だけを訪れ、地域の店や宿に立ち寄らない。",
          en: "Visitors see the famous place and skip the rest of the town.",
        },
      ],
      how: [
        {
          n4: "町に ある QRコードを 読みます。アプリは いりません。",
          n3: "観光地に設置されたQRコードを読み取る。アプリのインストールは不要。",
          en: "Scan the QR code in the town. No app needed.",
        },
        {
          n4: "物語の はじめを、ただで 見ます。みじかい 動画です。",
          n3: "物語の一部を無料で見る。短い動画ガイドで入口を体験する。",
          en: "Watch the start of the story free — a short video.",
        },
        {
          n4: "つづきが 見たい 人は、スマホで チケットを 買います。",
          n3: "続きを見たい方は、WEB上でガイドチケットを購入する。",
          en: "If you want the rest, buy a ticket on your phone.",
        },
        {
          n4: "町ぜんぶの 動画と 道が ひらきます。",
          n3: "購入後、街全体を巡る動画ガイドとルートが開放される。",
          en: "The videos and routes for the whole town open up.",
        },
        {
          n4: "動画を 見ながら 歩きます。ごはんの お店や 宿も 同じ 地図に 出ます。",
          n3: "動画を見ながら街を回遊する。周辺の飲食店、宿、土産も同じマップで見つけられる。",
          en: "Walk while watching. Restaurants and inns are on the same map.",
        },
      ],
      can: [
        {
          label: { n4: "いろいろな 言葉", n3: "多言語の音声・字幕", en: "Many languages" },
          text: {
            n4: "音声も 字も、いろいろな 言葉で 出せます。",
            n3: "多言語の音声ガイドと字幕に対応します。",
            en: "Audio and subtitles come in several languages.",
          },
        },
        {
          label: {
            n4: "古い 写真や 地図",
            n3: "写真・古地図・地域資料",
            en: "Old photos and maps",
          },
          text: {
            n4: "町に 残って いた 写真や 古い 地図も 見られます。",
            n3: "地域に残る記録や写真、古地図を動画ストーリーに編集します。",
            en: "Old photos and maps kept in the town are part of the story.",
          },
        },
        {
          label: { n4: "町に お金が もどる", n3: "地域還元", en: "Money goes back to the town" },
          text: {
            n4: "チケットの お金の 一部が、その 町に もどります。",
            n3: "ガイド売上の一部を地域へ還元する仕組みです。",
            en: "Part of the ticket money goes back to the local area.",
          },
        },
      ],
    },

    /* ---------------- 03 Verify ---------------- */
    {
      kind: "service",
      name: "Verify",
      image: "/gakushu/nextmake/img/svc_verify.webp",
      reading: "ヴェリファイ",
      icon: "🔒",
      lead: { n4: "信頼を、証明へ", n3: "信頼を、証明へ", en: "From trust to proof" },
      text: {
        n4: "紙も PDFも、そのままで だいじょうぶ。QRコードを 1つ 足すだけで、その 証明書が 本物か どうかを 調べられます。",
        n3: "紙もPDFもそのまま。QRひとつで真正性を証明します。現在の発行フローを大きく変えずに、検証できる信頼を加えます。",
        en: "Paper and PDF stay as they are. One QR code proves the document is genuine.",
      },
      before: [
        {
          n4: "紙の 証明書が 本物か どうか、見ただけでは 分からない。",
          n3: "紙やPDFの証明書は、見ただけでは真正性を確かめられない。",
          en: "You cannot tell from looking whether a paper certificate is real.",
        },
        {
          n4: "出した あとで 中身を 書きかえられても、気づけない。",
          n3: "発行後に内容が書き換えられても検知できない。",
          en: "If someone edits it after it was issued, nobody notices.",
        },
        {
          n4: "しくみを 変えると、いまの やりかたが ぜんぶ 止まって しまう。",
          n3: "検証の仕組みを入れるために、既存の発行フローを変えるのは負担が大きい。",
          en: "Changing the whole issuing process to add checks is too much work.",
        },
      ],
      how: [
        {
          n4: "いまの しくみで、証明書を 作ります。",
          n3: "今お使いのシステムや書式で、証明情報を作成する。",
          en: "Make the certificate with the system you already use.",
        },
        {
          n4: "いつもの 人が、いつもの ように 見て 決めます。",
          n3: "既存の確認・承認手順を維持したまま運用する。",
          en: "The same people approve it the same way as before.",
        },
        {
          n4: "調べる ための QRコードを 足します。",
          n3: "ベリファイと連携し、証明書ごとの検証用QRを追加する。",
          en: "A QR code for checking is added.",
        },
        {
          n4: "紙か PDFで わたします。見た目は ほとんど 同じです。",
          n3: "紙・PDFを発行する。見た目と渡し方は大きく変わらない。",
          en: "Hand it over as paper or PDF — it looks almost the same.",
        },
      ],
      can: [
        {
          label: { n4: "だれが 出したか", n3: "発行元の確認", en: "Who issued it" },
          text: {
            n4: "正しい 学校や 団体が 出した ものか 分かります。",
            n3: "正規の機関が発行した証明書かどうかを確認します。",
            en: "You can see whether a real school or body issued it.",
          },
        },
        {
          label: { n4: "書きかえられて いないか", n3: "改変の有無", en: "Has it been changed" },
          text: {
            n4: "出した あとで 中身が 変わって いないかを 見ます。",
            n3: "発行後に内容が書き換えられていないかを検証します。",
            en: "It checks that nothing was edited after it was issued.",
          },
        },
        {
          label: { n4: "いまも 生きて いるか", n3: "現在の有効性", en: "Is it still valid" },
          text: {
            n4: "もう つかえない ものに なって いないかを 見ます。",
            n3: "失効や更新を含め、現在も有効かどうかを確認します。",
            en: "It checks whether the certificate is still valid today.",
          },
        },
        {
          label: {
            n4: "QRに 名前を 入れない",
            n3: "QRへ個人情報を保存しない",
            en: "No personal data in the QR",
          },
          text: {
            n4: "QRコードの 中に、その 人の 名前や 情報は 入れません。",
            n3: "QRコードには個人情報を保存せず、照合に必要な限定情報だけを持たせます。",
            en: "The QR holds no personal data — only what is needed to check.",
          },
        },
      ],
      note: {
        n4: "この サービスは 2026年に、国連の 賞を もらいました。United Nations Public Service Awards と いう 賞です。",
        n3: "2026年、国連公共サービス賞（United Nations Public Service Awards）を受賞しています。",
        en: "In 2026 this service won a United Nations Public Service Award.",
      },
    },

    /* ---------------- 04 セキュリティドローン ---------------- */
    {
      kind: "service",
      name: "セキュリティドローン",
      image: "/gakushu/nextmake/img/svc_drone.webp",
      reading: "セキュリティドローン",
      icon: "🚁",
      lead: { n4: "危険を、安全へ", n3: "異常の兆候を、安全へ", en: "From risk to safety" },
      text: {
        n4: "AIが 考えて、ドローンが 自分で 飛びます。空から 見て、あぶない ことを 早く 見つけます。",
        n3: "AIによる自律制御、リアルタイム画像解析、クラウド連携を統合したドローンソリューションです。",
        en: "AI thinks, and the drone flies by itself. It looks from the sky and finds danger early.",
      },
      before: [
        {
          n4: "広い 場所を 人が 歩いて 見るのは、時間が かかる。",
          n3: "広い敷地や施設を人が巡回して確認するには時間がかかる。",
          en: "Walking around a big site to check it takes a long time.",
        },
        {
          n4: "橋や 高い ところの 点検は、人には あぶない。",
          n3: "橋梁や高所の点検は、人が行うと危険をともなう。",
          en: "Checking bridges and high places is dangerous for people.",
        },
        {
          n4: "何か あった とき、どこが どう なって いるか すぐに 分からない。",
          n3: "災害時に、被災地の状況を広域かつ迅速に把握することが難しい。",
          en: "When something happens, it is hard to see quickly what is going on.",
        },
      ],
      how: [
        {
          n4: "AIが 道と まわりを 見て、飛ぶ 道を 決めます。",
          n3: "飛行ルート、障害物、周辺状況をAIが解析し、自律運用を支援する。",
          en: "AI reads the route and the surroundings, and decides the flight path.",
        },
        {
          n4: "自分で 飛んで 行って、写真と 動画を とります。",
          n3: "離陸から巡回、帰還までを自律的に飛行し、映像を取得する。",
          en: "It flies there by itself and records video.",
        },
        {
          n4: "見た ものを AIが すぐに 調べます。人・車・熱の 変化を 見つけます。",
          n3: "可視光・赤外線の映像から、人、車両、設備異常、温度変化をリアルタイムに検出する。",
          en: "AI checks what it saw at once: people, vehicles, faults, heat changes.",
        },
        {
          n4: "見つけたら、スマホに 知らせます。記録も 残します。",
          n3: "検知した内容を通知し、映像や飛行履歴をクラウドへ記録する。",
          en: "If it finds something, it notifies you and keeps the record.",
        },
      ],
      can: [
        {
          label: { n4: "見はり", n3: "セキュリティ強化", en: "Security patrol" },
          text: {
            n4: "工場や 広い 場所を まわって、入って きた 人を 知らせます。",
            n3: "施設、工場、イベント会場を巡回し、侵入や異常の確認・通知・記録を支援します。",
            en: "It patrols factories and large sites and reports intruders.",
          },
        },
        {
          label: { n4: "点検", n3: "インフラ点検", en: "Infrastructure checks" },
          text: {
            n4: "橋・道・建物・太陽光の 設備を 空から 見ます。",
            n3: "橋梁、道路、建物、太陽光設備などを撮影・解析し、点検の負担を軽減します。",
            en: "It inspects bridges, roads, buildings and solar panels from the air.",
          },
        },
        {
          label: { n4: "災害の とき", n3: "災害対応", en: "Disasters" },
          text: {
            n4: "こまって いる 場所の ようすを、早く 広く 見ます。",
            n3: "被災地の状況を広域かつ迅速に把握し、捜索・救助活動を支援します。",
            en: "It sees a wide disaster area quickly, to help search and rescue.",
          },
        },
        {
          label: { n4: "田んぼや 畑", n3: "スマート農業", en: "Farming" },
          text: {
            n4: "作物の そだちかたや、かわいて いる ところを 上から 見ます。",
            n3: "圃場の生育、病害、乾燥状態を上空から把握し、散布や巡回を効率化します。",
            en: "It checks crop growth and dry spots from above.",
          },
        },
      ],
    },

    /* ---------------- 05 Internship Lab ---------------- */
    {
      kind: "service",
      name: "NEXTMAKE Internship Lab",
      image: "/gakushu/nextmake/img/svc_lab.webp",
      reading: "ネクストメイク インターンシップ ラボ",
      icon: "🧑‍💻",
      lead: {
        n4: "才能を、会社の 力へ",
        n3: "才能を、企業の力へ",
        en: "From talent to strength",
      },
      text: {
        n4: "海外の 大学生 2〜3人で チームを 作ります。日本人の リーダーと いっしょに、本当の 仕事を します。",
        n3: "海外有力大学の学生2〜3名でチームを編成し、日本人PMが要件整理から進行・品質管理まで担います。",
        en: "Two or three students from overseas form a team and work on real projects with a Japanese project manager.",
      },
      before: [
        {
          n4: "日本の 会社は、エンジニアを 見つけるのが むずかしい。",
          n3: "日本企業ではエンジニアの採用が難しくなっている。",
          en: "Companies in Japan find it hard to hire engineers.",
        },
        {
          n4: "海外の 仕事を 進められる 人が いない。英語が できる 人も 少ない。",
          n3: "海外展開を進める人材がいない。英語対応できる社員も少ない。",
          en: "There is nobody to run overseas work, and few staff speak English.",
        },
        {
          n4: "新しい ことを する 人の 手が、足りない。",
          n3: "新規事業に割けるリソースがない。",
          en: "There are no spare hands for anything new.",
        },
      ],
      how: [
        {
          n4: "会社が「したい こと」を 話します。",
          n3: "企業が事業課題、目的、判断基準を共有する。",
          en: "The company says what it wants to do.",
        },
        {
          n4: "日本人の リーダーが、それを 仕事の 形に します。",
          n3: "日本人PMが要件を整理し、タスクを設計する。",
          en: "The Japanese project manager turns it into tasks.",
        },
        {
          n4: "学生の チームが 作ります。日本語で 報告します。",
          n3: "学生チームが開発を担当し、日本語で報告する。",
          en: "The student team builds it and reports in Japanese.",
        },
        {
          n4: "リーダーが 見て 直して、会社に わたします。",
          n3: "PMがレビューと品質管理を行い、成果物を納める。",
          en: "The manager reviews it and hands it to the company.",
        },
      ],
      can: [
        {
          label: { n4: "日本語の 勉強", n3: "日本語教育", en: "Japanese" },
          text: {
            n4: "日本語で 報告する・相談する ことを 学びます。",
            n3: "日本語での報告・相談・日々のコミュニケーションを学びます。",
            en: "You learn to report and consult in Japanese.",
          },
        },
        {
          label: { n4: "ITの 勉強", n3: "IT教育", en: "IT" },
          text: {
            n4: "作る こと・ためす こと・AI・デザインを 学びます。",
            n3: "開発、テスト、AI、デザインなど、実務につながるITスキルを学びます。",
            en: "You learn building, testing, AI and design.",
          },
        },
        {
          label: {
            n4: "日本の 会社の やりかた",
            n3: "日本企業文化",
            en: "How Japanese companies work",
          },
          text: {
            n4: "いつまでに 出すか、報告、品質、チームで はたらく こと を 学びます。",
            n3: "納期、報告、品質、チームで働く姿勢など、日本企業の仕事の進め方を学びます。",
            en: "Deadlines, reporting, quality, and working as a team.",
          },
        },
      ],
      note: {
        n4: "この チームは、Japanese IT Pathway を 終わった 学生が 中心です。みなさんの つぎの 場所です。",
        n3: "このチームはJapanese IT Pathwayの修了生が中心です。みなさんの次の場所になります。",
        en: "The team is mainly Japanese IT Pathway graduates. This is where you go next.",
      },
    },

    {
      kind: "callout",
      tone: "point",
      text: {
        n4: "Internship Lab の 説明に「報告」と 書いて あります。会社の しごとでも、報告は とても 大切です。",
        n3: "Internship Labの説明には「報告」という言葉があります。会社の仕事でも、報告はとても大切です。",
        en: 'The words "reporting" appear in the Internship Lab description. Reporting really matters at work.',
      },
    },
  ],
};
