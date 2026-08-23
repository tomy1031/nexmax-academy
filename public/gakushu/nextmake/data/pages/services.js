/**
 * 事業 — 自分たちで 作って いる 新しい サービス。
 *
 * タブに しないで **縦に 並べる**。タブに すると 開いて いない ぶんの 文が
 * 画面に 出ない ので、端末の 中の 検索でも 見つからず、ルビの 検査も 通り抜ける。
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
    {
      kind: "service",
      name: "NMClaw",
      reading: "エヌエムクロー",
      icon: "🤖",
      lead: { n4: "情報を、価値へ", n3: "情報を、価値へ", en: "From information to value" },
      text: {
        n4: "会社の 中の 人の 声や チャットを、AIが 自動で あつめて 整理します。今日 する ことや まとめを すぐに 作るので、しごとが 早く なります。",
        n3: "社内の会話やチャットに散らばった情報をAIが自動で集めて整理します。当日のタスクや要約をすぐに作成できるため、業務が速く進みます。",
        en: "AI gathers and organises the conversations and chats inside a company, then produces today's tasks and a summary right away.",
      },
    },
    {
      kind: "service",
      name: "観光DX",
      reading: "かんこうディーエックス",
      icon: "🗺️",
      lead: { n4: "文化を、体験へ", n3: "文化を、体験へ", en: "From culture to experience" },
      text: {
        n4: "町の 歴史や おもしろい 話を、スマホで 楽しむ しくみです。スマホで 入場券を 買ったり、いろいろな 言葉の 音声を 聞きながら 歩いたり できます。",
        n3: "地域の歴史や物語をスマートフォンで楽しめる仕組みです。チケットの購入や、多言語の音声ガイドを聞きながらのまち歩きができます。",
        en: "A way to enjoy a town's history and stories on a smartphone: buy tickets, and walk while listening to an audio guide in your language.",
      },
    },
    {
      kind: "service",
      name: "Verify",
      reading: "ヴェリファイ",
      icon: "🔒",
      lead: { n4: "信頼を、証明へ", n3: "信頼を、証明へ", en: "From trust to proof" },
      text: {
        n4: "学校を 出た 証明や 資格、高い ブランドの 品物が 本物か どうかを 調べます。スマホの QRコードで、だれでも すぐに 確かめられます。",
        n3: "学歴や資格、ブランド品が本物かどうかを、スマートフォンのQRコードで誰でもすぐに確認できます。",
        en: "Anyone can check whether a diploma, a qualification or a branded item is genuine, using a QR code on a smartphone.",
      },
    },
    {
      kind: "service",
      name: "セキュリティドローン",
      reading: "セキュリティドローン",
      icon: "🚁",
      lead: { n4: "危険を、安全へ", n3: "異常を、安全へ", en: "From risk to safety" },
      text: {
        n4: "あぶない 人や 事故を AIが 見つけます。ドローンが 自動で 飛んで 行って、写真を とったり、声で 注意したり、スマホに れんらくしたり します。",
        n3: "AIが侵入や異常を検知すると、ドローンが自動で現場へ向かい、撮影・警告・通知・記録を行います。",
        en: "When AI detects an intruder or an accident, a drone flies there by itself to record, warn and notify.",
      },
    },
    {
      kind: "service",
      name: "NEXTMAKE Internship Lab",
      reading: "ネクストメイク インターンシップ ラボ",
      icon: "🧑‍💻",
      lead: {
        n4: "才能を、会社の 力へ",
        n3: "才能を、企業の力へ",
        en: "From talent to strength",
      },
      text: {
        n4: "日本語と ITを 勉強した 海外の 大学生が チームを 作ります。日本人の リーダーと いっしょに、本当の しごとを します。",
        n3: "日本語とITを学んだ海外の大学生でチームを編成し、日本人PMと共に実際のプロジェクトを進めます。",
        en: "Students from overseas who have studied Japanese and IT form a team and work on real projects with a Japanese project manager.",
      },
      note: {
        n4: "この チームは、Japanese IT Pathway を 終わった 学生が 中心です。ここで 学ぶ ことは、納期・報告・品質・チームで はたらく ことです。",
        n3: "このチームはJapanese IT Pathwayの修了生が中心です。納期、報告、品質、チームで働く姿勢を学びます。",
        en: "The team is mainly made up of Japanese IT Pathway graduates. They learn about deadlines, reporting, quality and teamwork.",
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
