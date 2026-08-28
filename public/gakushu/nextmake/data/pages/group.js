/**
 * グループ会社 — CONTINUE LLC.（ベトナムの 開発チーム）を 中心に。
 *
 * 宝さがしの「日本の ほかに どこに オフィスが ある？」の 答えが ここ。
 * ビルの フロア構成図は 作らない（2026-08-23 の 指定）。技術は 絵では なく
 * ことばの チップで 見せる。
 *
 * ページの 名前は「ベトナム」では なく **「グループ会社」**（2026-08-23 の 指定）。
 * ベトナムの チームが 中心だが、いっしょに 仕事を する 会社は ほかにも ある ので、
 * さいごに **名前だけ 並べる**。くわしくは 書かない——この ステージで 学習者が
 * 覚えるのは「1つの 会社だけで 仕事を して いる わけでは ない」という 形だけ。
 */

export const GROUP = {
  id: "group",
  nav: "グループ会社",
  title: {
    n4: "グループ会社",
    n3: "グループ会社",
    en: "Our group companies",
  },
  hero: "/gakushu/nextmake/img/hero_vietnam.webp",
  heroAlt: "",
  blocks: [
    {
      kind: "paragraph",
      text: {
        n4: "ネクストメイクは、1つの 会社だけで 仕事を して いる わけでは ありません。グループの 会社や、いっしょに 仕事を する 会社が あります。",
        n3: "ネクストメイクは1社だけで事業を進めているわけではありません。グループ企業やアライアンス企業と連携して、総合的なITソリューションを提供しています。",
        en: "NEXT MAKE does not work alone. It has group companies and partner companies.",
      },
    },
    {
      kind: "heading",
      text: {
        n4: "CONTINUE LLC.（コンティニュー）",
        n3: "CONTINUE LLC.（コンティニュー）",
        en: "CONTINUE LLC.",
      },
    },
    {
      kind: "paragraph",
      text: {
        n4: "グループの 会社 CONTINUE LLC. は、2023年に ベトナムで 開発を 始めました。日本人が いる 町の 近くに オフィスが あります。",
        n3: "グループ企業のCONTINUE LLC.は、2023年にベトナムで開発を開始しました。日本人が多く住む地域の近くに拠点を構えています。",
        en: "Our group company CONTINUE LLC. began development in Vietnam in 2023. Its office is near an area where many Japanese people live.",
      },
    },
    {
      kind: "table",
      rows: [
        { th: "会社の 名前", td: "CONTINUE LLC.（コンティニュー）" },
        { th: "代表", td: "川村 修和" },
        // オフィスは **ベトナムだけ**（2026-08-23 の 指定）。前は「日本（大阪）」も
        // 並べて いたが、CONTINUE の オフィスは 日本には 無い。
        { th: "オフィスの 場所", td: "ベトナム（ホーチミン）" },
        // 「始めた 年」と 書かない。文の 終わりの 1字の 年は 読み辞書で
        // 「ねん」に なる（日付が 圧倒的に 多い ため）ので、ここだけ「とし」に できない。
        { th: "いつから", td: "2023年" },
      ],
    },
    /*
     * CONTINUE の キャラクター Boo（2026-08-24 の 指定）。
     * 会社の 名前と 数字だけの ページに、**顔が 1つ** あると 覚えて もらえる。
     * 出どころは CONTINUE 自身の サイト（img/SOURCES.md）。
     */
    {
      kind: "heading",
      text: {
        n4: "Boo（ブー）",
        n3: "AIパペット「Boo（ブー）」",
        en: "Boo, the AI puppet",
      },
    },
    {
      kind: "paragraph",
      text: {
        n4: "Boo は CONTINUE が 作った AIの ぬいぐるみです。人と 話が できます。カンボジアビジネスフォーラムでは、うけつけの 仕事を しました。",
        n3: "BooはCONTINUEが開発したAIパペットです。人と会話ができます。カンボジアビジネスフォーラムでは受付を担当しました。",
        en: "Boo is an AI puppet built by CONTINUE. It can talk with people, and worked at the reception desk of the Cambodia Business Forum.",
      },
    },
    {
      kind: "figure",
      src: "/gakushu/nextmake/img/boo.webp",
      alt: "",
      caption: {
        n4: "うけつけに いる Boo です。大きい Boo と 小さい Boo が います。",
        n3: "受付に立つBooです。大小2体のBooがいます。",
        en: "Boo at the reception desk — there is a large one and a small one.",
      },
    },
    {
      kind: "heading",
      text: {
        n4: "海外で 作る やりかた",
        n3: "オフショア開発とは",
        en: "What is offshore development?",
      },
    },
    {
      kind: "paragraph",
      text: {
        n4: "日本の しごとを、外国の エンジニアが 作る やりかたを オフショア開発と 言います。",
        n3: "日本の案件を海外のエンジニアが開発する方法を、オフショア開発といいます。",
        en: "Offshore development means engineers overseas build systems for clients in Japan.",
      },
    },
    {
      kind: "cards",
      items: [
        {
          icon: "🧩",
          label: { n4: "日本と 同じ 品質", n3: "日本と同等の品質", en: "The same quality" },
          text: {
            n4: "ベトナムの エンジニアは 上手です。日本と 同じ レベルの システムを 作ります。",
            n3: "ベトナムのエンジニアは技術力が高く、日本と同等の品質のシステムを開発します。",
            en: "Engineers in Vietnam are highly skilled and build systems to the same standard as in Japan.",
          },
        },
        {
          icon: "🗣️",
          label: {
            n4: "日本語で 話を 聞く",
            n3: "日本語でのヒアリング",
            en: "Requirements in Japanese",
          },
          text: {
            n4: "日本人の スタッフが お客さまの 話を 聞いて、作りかたの 説明書を 書きます。",
            n3: "日本人スタッフがお客さまの要望を伺い、要件定義として設計書にまとめます。",
            en: "Japanese staff listen to the client and write the specification.",
          },
        },
        {
          icon: "📅",
          // まとめ役は **日本人の プロジェクトマネージャ**（2026-08-23 の 指定）。
          // 前は「現地の リーダー」と 書いて いたが、進行を 見るのは 日本側。
          label: {
            n4: "日本人が プロジェクトマネージャ",
            n3: "日本人プロジェクトマネージャーによる進行管理",
            en: "A Japanese project manager",
          },
          text: {
            n4: "日本人の プロジェクトマネージャが、いつ 何を するかを 決めて、チームを 進めます。",
            n3: "日本人のプロジェクトマネージャーが、スケジュールとチームの進行を管理します。",
            en: "A Japanese project manager runs the schedule and keeps the team moving.",
          },
        },
      ],
    },
    {
      kind: "heading",
      text: { n4: "使って いる 技術", n3: "使用している技術", en: "Technologies we use" },
    },
    {
      kind: "chips",
      groups: [
        {
          label: { n4: "画面を 作る", n3: "フロントエンド", en: "Front end" },
          items: ["HTML", "CSS", "React", "Vue.js", "AngularJS"],
        },
        {
          label: { n4: "アプリを 作る", n3: "モバイル・XR", en: "Mobile and XR" },
          items: ["Flutter", "Unity", "AR", "VR", "MR"],
        },
        {
          label: { n4: "裏がわを 作る", n3: "バックエンド", en: "Back end" },
          items: ["PHP", "Python", "Node.js"],
        },
      ],
    },
    {
      kind: "heading",
      text: {
        n4: "ITの 道具を 教える しごと",
        n3: "DXコンサルティング",
        en: "Helping companies go digital",
      },
    },
    {
      kind: "paragraph",
      text: {
        n4: "紙で して いた しごとを、パソコンや スマホで できるように します。Slack や Notion などの 道具の 使いかたも 教えます。",
        n3: "紙で行っていた業務をデジタルに置きかえる支援をしています。SlackやNotionなどのツールの導入もサポートします。",
        en: "We help companies move paper work onto computers, and teach them tools such as Slack and Notion.",
      },
    },
    {
      kind: "callout",
      tone: "point",
      text: {
        n4: "ベトナムの チームと 日本の チームは、毎日 れんらくを します。ちがう 国に いても、1つの チームです。",
        n3: "ベトナムのチームと日本のチームは毎日連絡を取り合っています。国が違っても、ひとつのチームです。",
        en: "The teams in Vietnam and Japan talk every day. Different countries, one team.",
      },
    },

    /*
     * ほかの 会社は **名前だけ**（2026-08-23 の 指定）。
     * くわしく 書くと、この ページの 中心（ベトナムの チーム）が ぼやける。
     *
     * **並びと 名前は 本家の 会社概要が 正**（<https://nextmake.site/company/> の
     * 「協力/関連会社」「警備会社」・2026-08-23 に 取得）。前は 設計書から 写した
     * Khmersabai・1st-step.vn・AUPP/CADT を 並べて いたが、AUPP と CADT は
     * **会社では なく 大学**で、カンボジア教育の ページの 話。混ぜると
     *「グループ会社」と「いっしょに 学生を そだてる 学校」の 区別が つかなく なる。
     */
    {
      kind: "heading",
      text: {
        n4: "ほかに いっしょに 仕事を する 会社",
        n3: "その他の関係会社",
        en: "Other companies we work with",
      },
    },
    {
      kind: "list",
      items: [
        { n4: "CONTINUE LLC.", n3: "CONTINUE LLC.", en: "CONTINUE LLC." },
        { n4: "株式会社業務代行", n3: "株式会社業務代行", en: "Gyomu Daiko Inc." },
        { n4: "株式会社SUISAI", n3: "株式会社SUISAI", en: "SUISAI Inc." },
        { n4: "株式会社L7", n3: "株式会社L7", en: "L7 Inc." },
        {
          n4: "アルト・インターナショナル株式会社（警備の 会社）",
          n3: "アルト・インターナショナル株式会社（警備会社）",
          en: "ALT International Inc. (security)",
        },
      ],
    },
    {
      kind: "link",
      to: "cambodia",
      label: {
        n4: "カンボジアの ことを 見る",
        n3: "カンボジア事業を見る",
        en: "See the Cambodia programme",
      },
    },
  ],
};
