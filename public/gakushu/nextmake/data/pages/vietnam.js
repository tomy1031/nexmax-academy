/**
 * ベトナム — グループ会社 CONTINUE LLC. の 海外の 開発チーム。
 *
 * 宝さがしの「日本の ほかに どこに オフィスが ある？」の 答えが ここ。
 * ビルの フロア構成図は 作らない（2026-08-23 の 指定）。技術は 絵では なく
 * ことばの チップで 見せる。
 */

export const VIETNAM = {
  id: "vietnam",
  nav: "ベトナム",
  title: {
    n4: "ベトナムで 作る",
    n3: "ベトナム・オフショア開発",
    en: "Development in Vietnam",
  },
  hero: "/gakushu/nextmake/img/hero_vietnam.webp",
  heroAlt: "",
  blocks: [
    {
      kind: "paragraph",
      text: {
        n4: "グループの 会社 CONTINUE LLC. は、2023年に ベトナムで 開発を 始めました。日本人が いる 町の 近くに オフィスが あります。",
        n3: "グループ企業のCONTINUE LLC.は、2023年にベトナムで開発を開始しました。日本人が多く住む地域の近くに拠点を構えています。",
        en: "Our group company CONTINUE LLC. began development in Vietnam in 2023. Its office is near an area where many Japanese people live.",
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
          label: {
            n4: "現地の リーダー",
            n3: "現地PMによる進行管理",
            en: "A local project manager",
          },
          text: {
            n4: "ベトナム人の リーダーが、いつ 何を するかを 決めて、チームを 進めます。",
            n3: "ベトナム人のプロジェクトマネージャーが、スケジュールとチームの進行を管理します。",
            en: "A Vietnamese project manager runs the schedule and keeps the team moving.",
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
  ],
};
