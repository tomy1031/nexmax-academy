/**
 * カンボジア教育 — Japanese IT Pathway。
 *
 * ここが M0 の 山場。**学習者は 自分たちが 載って いる ページを 読む**。
 * だから 数字も 年表も 実際の ものを そのまま 置く（`docs/research/nextmake_site_突き合わせ`）。
 * 大きな 数は 桁区切りで 書く（制約: 1.5万人 → 15,000人）。
 */

export const CAMBODIA = {
  id: "cambodia",
  nav: "カンボジア教育",
  title: {
    n4: "カンボジアと いっしょに",
    n3: "海外人材育成プログラム",
    en: "Japanese IT Pathway",
  },
  hero: "/gakushu/nextmake/img/hero_cambodia.webp",
  heroAlt: "",
  blocks: [
    {
      kind: "quote",
      text: "Japanese IT Pathway プログラム",
      source: "カンボジア郵便電気通信省 × AUPP × NEXTMAKE",
      note: {
        n4: "カンボジアの 政府と 大学と ネクストメイクが いっしょに 進めて いる プロジェクトです。",
        n3: "カンボジア政府、大学、そしてネクストメイクが共同で進めている国際プロジェクトです。",
        en: "An international project run together by the Cambodian government, universities and NEXT MAKE.",
      },
    },
    {
      kind: "heading",
      text: { n4: "2つの 目的", n3: "プログラムの目的", en: "Two goals" },
    },
    {
      kind: "cards",
      items: [
        {
          icon: "🇯🇵",
          label: {
            n4: "日本の 人手不足を なおす",
            n3: "日本国内の人材不足の解消",
            en: "Filling Japan's shortage",
          },
          text: {
            n4: "日本では 2030年に、ITエンジニアが 750,000人 足りなく なると 言われて います。",
            n3: "日本では2030年に、ITエンジニアが750,000人不足すると予測されています。",
            en: "By 2030 Japan is expected to be short of 750,000 IT engineers.",
          },
        },
        {
          icon: "🇰🇭",
          label: {
            n4: "カンボジアの 力を 上げる",
            n3: "カンボジアの国家発展への貢献",
            en: "Growing Cambodia",
          },
          text: {
            n4: "カンボジアの 新しい ITエンジニアの 技術を 上げて、国の 発展に 役立てます。",
            n3: "カンボジアの新世代ITエンジニアの技術力を高め、国の発展に貢献します。",
            en: "Raising the skills of Cambodia's new IT engineers, to help the country grow.",
          },
        },
      ],
    },
    {
      kind: "heading",
      text: { n4: "会社が する こと", n3: "サポートの内容", en: "What we provide" },
    },
    {
      kind: "steps",
      items: [
        {
          n4: "日本語の 勉強。日本語能力試験 N3 に 合格する ための 授業を します。",
          n3: "日本語教育。日本語能力試験N3合格に向けたカリキュラムを提供します。",
          en: "Japanese lessons, aimed at passing JLPT N3.",
        },
        {
          n4: "ITの 勉強。日本の IT業界で はたらける 力を つけます。",
          n3: "IT教育。日本のIT業界で活躍できる人材を育成します。",
          en: "IT training, so you can work in Japan's IT industry.",
        },
        {
          n4: "しごとの 紹介。プログラムを 終わった 人に、日本の IT会社への 就職を 手伝います。",
          n3: "就職支援。プログラム修了者に、日本のIT企業への就職をサポートします。",
          en: "Job support, helping graduates find work at IT companies in Japan.",
        },
      ],
    },
    {
      kind: "heading",
      text: { n4: "これまでの あゆみ", n3: "プログラムの歩み", en: "What has happened so far" },
    },
    {
      kind: "timeline",
      items: [
        {
          when: "2024年8月",
          what: {
            n4: "AUPP と ネクストメイクが 約束を 結びました。",
            n3: "AUPPとNEXTMAKEのパートナーシップ調印式を行いました。",
            en: "AUPP and NEXT MAKE signed a partnership.",
          },
        },
        {
          when: "2024年9月",
          what: {
            n4: "AUPP の 1期生の 日本語の 授業が 始まりました。",
            n3: "AUPP1期生の日本語授業が始まりました。",
            en: "Japanese lessons began for the first AUPP group.",
          },
        },
        {
          when: "2024年11月",
          what: {
            n4: "AUPP で まんがの イベントを しました。絵を かく 人が 大学に 来ました。",
            n3: "AUPPでMangaイベントを開催しました。イラストレーターが大学を訪問しました。",
            en: "We held a manga event at AUPP, with an illustrator visiting the university.",
          },
        },
        {
          when: "2025年6月",
          what: {
            n4: "大阪で カンボジアビジネスフォーラムを しました。120社 より 多い 会社が 来ました。",
            n3: "大阪でカンボジアビジネスフォーラムを開催しました。120社以上の企業が参加しました。",
            en: "We held a Cambodia Business Forum in Osaka, with more than 120 companies.",
          },
        },
        {
          when: "2025年8月",
          what: {
            n4: "AUPP の 1期生の 日本語の 授業が 終わりました。ITの 授業が 始まりました。",
            n3: "AUPP1期生の日本語授業修了式を行い、IT授業を開始しました。",
            en: "The first AUPP group finished Japanese class and started IT class.",
          },
          mark: true,
        },
        {
          when: "2025年10月",
          what: {
            n4: "日本の 文化の 運動会を しました。学生が リーダーに なって 計画しました。",
            n3: "日本文化である運動会を開催しました。在籍する学生がリーダーとして企画しました。",
            en: "We held a Japanese-style sports day, planned by one of the students.",
          },
        },
        {
          when: "2026年1月",
          what: {
            n4: "CADT の 1期生の 日本語の 授業が 終わりました。学生が 2人、スピーチを しました。",
            n3: "CADT1期生の日本語授業修了式を行い、学生代表2名がスピーチをしました。",
            en: "The first CADT group finished Japanese class. Two students gave a speech.",
          },
          mark: true,
        },
        {
          when: "2026年6月",
          what: {
            n4: "日本の IT会社が カンボジアに 来ました。",
            n3: "日本のIT企業がJapanese IT Pathwayに現地来訪しました。",
            en: "IT companies from Japan visited the programme in Cambodia.",
          },
        },
      ],
    },
    {
      kind: "heading",
      text: {
        n4: "カンボジアの 人の いい ところ",
        n3: "カンボジア人材の特徴",
        en: "About Cambodian talent",
      },
    },
    {
      kind: "list",
      items: [
        { n4: "日本が 好きな 人が 多い", n3: "親日的である", en: "Many people like Japan" },
        {
          n4: "日本の 文化や 技術に 興味が ある",
          n3: "日本の文化や技術に興味がある",
          en: "Interested in Japanese culture and technology",
        },
        {
          n4: "知りたい 気持ちが 強く、上を めざす",
          n3: "知的好奇心と向上心が高い",
          en: "Curious, and always aiming higher",
        },
        {
          n4: "人に 合わせる 力、やわらかい 考えかた、礼儀を 大切に する",
          n3: "協調性、柔軟性、礼儀正しさを重んじる",
          en: "Cooperative, flexible and polite",
        },
      ],
    },
    {
      kind: "callout",
      tone: "point",
      text: {
        n4: "この ページに 書いて ある 学生は、みなさんの 先輩や 同級生です。会社の サイトに、みなさんの 名前が のって います。",
        n3: "このページに登場する学生は、みなさんの先輩や同級生です。会社のサイトに、みなさんの歩みが載っています。",
        en: "The students on this page are your classmates and seniors. Your own programme is on the company's website.",
      },
    },
    {
      kind: "link",
      to: "services",
      label: {
        n4: "そのあとの しごとを 見る",
        n3: "修了後のキャリアを見る",
        en: "See what comes after",
      },
    },
  ],
};
