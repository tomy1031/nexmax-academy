/**
 * つくる仕事 — お客さまの ために 作る しごと（受託開発）。
 *
 * 宝さがしの「なにを 作る 会社？」と「はたらきかた」の 答えが ここに ある。
 * 「受託開発」「常駐」は 本物の サイトでは 見つけにくい 語なので、ここでは
 * **語を 出して 意味を そえる**（漢字は 残す。ひらがなに 開かない）。
 * 出す 場所は 「2つの はたらきかた」の カード。冒頭の 段落に あった
 * 「これを 受託開発と 言います。」は 2026-08-31 に 消した（ユーザー指定）——
 * 同じ 語を 2回 名のる ぶん、いちばん 最初の 1文が 重く なって いた。
 */

export const MAKING = {
  id: "making",
  nav: "つくる仕事",
  title: {
    n4: "つくる仕事",
    n3: "つくる仕事",
    en: "Building for our clients",
  },
  hero: "/gakushu/nextmake/img/hero_making.webp",
  heroAlt: "",
  blocks: [
    {
      kind: "paragraph",
      text: {
        n4: "会社の 大きな しごとは、お客さまの ために ものを 作る ことです。",
        n3: "会社の中心的な仕事は、お客さまのために開発を行うことです。",
        en: "Our main work is building things for clients.",
      },
    },
    { kind: "heading", text: { n4: "作れる もの", n3: "提供するサービス", en: "What we build" } },
    {
      kind: "cards",
      items: [
        {
          icon: "🌐",
          label: { n4: "ホームページ", n3: "Web制作・EC", en: "Websites and online shops" },
          text: {
            n4: "会社の ホームページや、インターネットで 物を 売る お店を 作ります。",
            n3: "企業のWebサイトや、インターネット上で商品を販売するECサイトを制作します。",
            en: "We build company websites and online shops.",
          },
        },
        {
          icon: "📱",
          label: { n4: "スマホの アプリ", n3: "モバイルアプリ開発", en: "Mobile apps" },
          text: {
            n4: "iPhone や Android で 使う アプリを 計画して、作って、直します。",
            n3: "iPhoneやAndroidで動作するアプリを、企画から開発、運用まで行います。",
            en: "We plan, build and maintain apps for iPhone and Android.",
          },
        },
        {
          icon: "🏢",
          label: { n4: "会社の システム", n3: "業務システム開発", en: "Business systems" },
          text: {
            n4: "注文や お金の 計算など、会社の しごとを 楽に する システムを 作ります。",
            n3: "受発注や会計など、企業の業務を効率化するシステムを開発します。",
            en: "We build systems that make ordering, accounting and other office work easier.",
          },
        },
        {
          icon: "🖧",
          label: {
            n4: "サーバーと ネットワーク",
            n3: "インフラ設計・構築",
            en: "Servers and networks",
          },
          text: {
            n4: "インターネットが 止まらないように、裏がわの しくみを 安全に 用意します。",
            n3: "AWSやAzureなどのクラウド、または社内設置型のサーバーを構築し、最適な環境を提供します。",
            en: "We set up cloud or on-site servers so that services keep running safely.",
          },
        },
        {
          icon: "🎬",
          label: { n4: "動画", n3: "動画制作（VR・AR）", en: "Video, VR and AR" },
          text: {
            n4: "会社を しょうかいする 動画や、VR・AR の 動画を 作ります。",
            n3: "企業のプロモーション映像や、VR・AR向けの映像を制作します。",
            en: "We make promotional videos and VR or AR content.",
          },
        },
        {
          icon: "🎨",
          label: { n4: "デザイン", n3: "デザイン制作", en: "Design" },
          text: {
            n4: "会社の ロゴ、チラシ、パンフレット、お店の 看板、Tシャツを デザインします。",
            n3: "ロゴ、チラシ、パンフレット、看板、Tシャツなどをデザインします。",
            en: "We design logos, flyers, brochures, signs and T-shirts.",
          },
        },
        {
          icon: "🈯",
          label: { n4: "翻訳", n3: "多言語翻訳", en: "Translation" },
          text: {
            n4: "英語・ベトナム語・クメール語の 翻訳を します。",
            n3: "英語、ベトナム語、クメール語の翻訳を行っています。",
            en: "We translate between Japanese and English, Vietnamese and Khmer.",
          },
          mark: true,
        },
        {
          icon: "🛠️",
          label: { n4: "パソコンの 修理", n3: "PC修理・補助金支援", en: "PC repair and subsidies" },
          text: {
            n4: "こわれた パソコンを 直したり、国から もらえる ITの お金の 申し込みを 手伝ったり します。",
            n3: "PCの修理や、IT導入補助金の申請サポートを行っています。",
            en: "We repair computers and help with applications for government IT subsidies.",
          },
        },
      ],
    },
    {
      kind: "heading",
      text: { n4: "2つの はたらきかた", n3: "働き方の種類", en: "Two ways of working" },
    },
    {
      kind: "cards",
      items: [
        {
          icon: "🏠",
          label: { n4: "受託開発", n3: "受託開発", en: "Contract development" },
          text: {
            n4: "自分の 会社の 中で、お客さまに たのまれた ものを 作ります。",
            n3: "自社のオフィスで、お客さまから依頼されたものを開発します。",
            en: "We build what the client asked for, from our own office.",
          },
        },
        {
          icon: "🚉",
          label: { n4: "SES(常駐)", n3: "SES(常駐)", en: "On-site engineering (SES)" },
          text: {
            n4: "お客さまの 会社に 行って、その 会社の 中で はたらきます。",
            n3: "お客さまの会社に技術者が常駐し、その現場で開発や運用を担当します。",
            en: "An engineer works at the client's office, inside their team.",
          },
        },
      ],
    },
    {
      kind: "heading",
      text: { n4: "しごとの ながれ", n3: "ご提供までの流れ", en: "How a project runs" },
    },
    {
      kind: "steps",
      items: [
        { n4: "相談を 聞く", n3: "ご相談", en: "First talk" },
        { n4: "何を 作るか 決める", n3: "要件ヒアリング", en: "Gather requirements" },
        { n4: "お金を 計算する", n3: "お見積もり", en: "Estimate" },
        { n4: "契約を する", n3: "ご契約", en: "Contract" },
        { n4: "報告を する", n3: "報告", en: "Report progress", mark: true },
        { n4: "できた ものを わたす", n3: "納品", en: "Delivery" },
        { n4: "そのあとも 直す", n3: "保守・運用", en: "Maintenance" },
      ],
    },
  ],
};
