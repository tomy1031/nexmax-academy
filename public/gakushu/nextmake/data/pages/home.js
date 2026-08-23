/**
 * ホーム — サイトの入口。
 *
 * ねらいは「この 会社は 何を して いる 会社か」を **1画面で つかませる**こと。
 * 宝さがしの 3つの目（なにを 作る／お客さまは だれ／どんな 人が はたらいて いる）へ、
 * ここから 枝分かれ する。
 */

export const HOME = {
  id: "home",
  nav: "ホーム",
  title: {
    n4: "ITで 新しい 次を 作る",
    n3: "ITで新しい次を創造する",
    en: "Creating what comes next, with IT",
  },
  hero: "/gakushu/nextmake/img/hero_home.webp",
  heroAlt: "",
  blocks: [
    {
      kind: "quote",
      text: "世界中の才能をつなぎ、まだ見ぬ可能性を価値へ変える",
      source: "SLOGAN",
      note: {
        n4: "世界の あちこちに いる 才能を つないで、まだ だれも 見て いない 可能性を、みんなが 使える ものに 変えます。",
        n3: "世界中にいる才能をつなぎ、まだ誰も気づいていない可能性を、社会で使われる価値に変えていきます。",
        en: "We connect talent from around the world and turn hidden potential into value that society can use.",
      },
    },
    {
      kind: "paragraph",
      text: {
        n4: "ネクストメイクは、大阪と 東京に オフィスが ある ITの 会社です。お客さまの ために ホームページや アプリや システムを 作ります。",
        n3: "ネクストメイクは、大阪と東京に拠点を置くIT企業です。お客さまのためにWebサイトやアプリ、業務システムを開発しています。",
        en: "NEXT MAKE is an IT company with offices in Osaka and Tokyo. We build websites, apps and business systems for our clients.",
      },
    },
    {
      kind: "paragraph",
      text: {
        n4: "日本だけでは ありません。海外にも 仲間が います。ベトナムでは グループの 会社が 開発を して います。カンボジアでは 学生と いっしょに 勉強を して います。",
        n3: "活動は日本だけではありません。ベトナムではグループ会社が開発を担当し、カンボジアでは大学の学生と一緒に学ぶ取り組みを進めています。",
        en: "We do not work only in Japan. A group company develops software in Vietnam, and in Cambodia we study together with university students.",
      },
    },
    { kind: "heading", text: { n4: "3つの とくちょう", n3: "3つの特徴", en: "Three strengths" } },
    {
      kind: "cards",
      items: [
        {
          icon: "🤖",
          label: {
            n4: "新しい 技術",
            n3: "先端の技術",
            en: "Advanced technology",
          },
          text: {
            n4: "AI・ドローン・デジタルの 証明など、新しい 技術を 使った サービスを 作って います。",
            n3: "AI、ドローン、デジタル証明など、先端の技術を使ったサービスを開発しています。",
            en: "We build services using AI, drones and digital certification.",
          },
          to: "services",
        },
        {
          icon: "🌏",
          label: {
            n4: "海外の チーム",
            n3: "海外の開発チーム",
            en: "Overseas team",
          },
          text: {
            n4: "グループの 会社が ベトナムに あります。日本と 同じ やりかたで、いっしょに 作ります。",
            n3: "グループ会社がベトナムにあります。日本と同じ品質で、一緒に開発を進めています。",
            en: "Our group company is in Vietnam. We build together, to the same standard as in Japan.",
          },
          to: "vietnam",
        },
        {
          icon: "🎓",
          label: {
            n4: "世界の 人と 学ぶ",
            n3: "世界の人と共に学ぶ",
            en: "Learning together",
          },
          text: {
            n4: "カンボジアの 学生と いっしょに、ITと 日本語を 勉強して います。",
            n3: "カンボジアの学生と一緒に、ITと日本語を学ぶプログラムを運営しています。",
            en: "We study IT and Japanese together with students in Cambodia.",
          },
          to: "cambodia",
        },
      ],
    },
    {
      kind: "heading",
      text: { n4: "会社の こと", n3: "会社の基本情報", en: "About the company" },
    },
    {
      kind: "table",
      rows: [
        { th: "会社の 名前", td: "株式会社 NEXT MAKE（ネクストメイク）" },
        { th: "社長", td: "松井 亮" },
        { th: "できた 日", td: "2018年1月5日" },
        { th: "本社", td: "大阪市 西区" },
        { th: "東京本店", td: "東京都 品川区" },
      ],
    },
    {
      kind: "paragraph",
      text: {
        n4: "もっと くわしい ことは、上の メニューから 見て ください。",
        n3: "さらに詳しい内容は、上のメニューから各ページをご覧ください。",
        en: "For more details, please use the menu at the top of the page.",
      },
    },
  ],
};
