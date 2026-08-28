/**
 * 実績 — 作った ものと、お客さま。
 *
 * 宝さがしの「お客さまは だれ？」の 答えが ここ。**業種が ばらけて いる**ことが
 * 大事なので、車・法律・こども会・トラック・観光と、わざと ちがう 分野を 並べる。
 */

export const WORKS = {
  id: "works",
  nav: "実績",
  title: {
    n4: "実績",
    n3: "実績",
    en: "Our work",
  },
  hero: "/gakushu/nextmake/img/hero_works.webp",
  heroAlt: "",
  blocks: [
    {
      kind: "paragraph",
      text: {
        n4: "いろいろな お客さまと しごとを して きました。会社も、役所も、団体も います。",
        n3: "さまざまなお客さまと仕事をしてきました。企業だけでなく、自治体や団体のご依頼もあります。",
        en: "We have worked with many kinds of clients: companies, local government and associations.",
      },
    },
    {
      kind: "work",
      when: "2026年7月",
      tag: "観光DX",
      client: { n4: "徳島県 三好市", n3: "徳島県三好市", en: "Miyoshi City, Tokushima" },
      what: {
        n4: "町に 残る 歴史や 文化を、スマホの 動画と 音声で めぐる しくみを 作りました。歩きながら、町の ことを 知る ことが できます。",
        n3: "地域に残る歴史や文化を、動画ストーリーと音声ガイドで巡る仕組みを構築しました。歩きながら町を知ることができます。",
        en: "A way to tour the town's history with video stories and an audio guide, while walking.",
      },
    },
    {
      kind: "work",
      when: "2026年7月",
      tag: "NMClaw",
      client: { n4: "会社の 中の しごと", n3: "社内業務の可視化", en: "Internal operations" },
      what: {
        n4: "会社の チャットや 声の 記録を AIが 自動で まとめます。毎日の 報告を 作る 時間が 短く なりました。",
        n3: "社内のチャットや音声のデータをAIが自動で整理します。日報を作成する時間が大きく短くなりました。",
        en: "AI organises a company's chats and voice data, so writing the daily report takes much less time.",
      },
    },
    {
      kind: "work",
      when: "2026年3月",
      tag: "WEB制作",
      client: {
        n4: "株式会社 ウチダコーポレーション",
        n3: "株式会社ウチダコーポレーション様",
        en: "Uchida Corporation",
      },
      what: {
        n4: "車を 売って いる 会社の ホームページを 作りました。車を 買いたい お客さまが、かんたんに さがせるように しました。",
        n3: "新車・中古車を販売する企業のWebサイトを制作しました。車を探すお客さまが簡単に検索できるようにしました。",
        en: "A website for a car dealer, making it easy for customers to search for a car.",
      },
    },
    {
      kind: "work",
      when: "2025年7月",
      tag: "システム開発",
      client: {
        n4: "大阪府 こども会 育成連合会",
        n3: "大阪府こども会育成連合会様",
        en: "Osaka Children's Association",
      },
      what: {
        n4: "今まで 紙で して いた お金の 計算や 確認の しごとを、ぜんぶ パソコンで できる ように しました。",
        n3: "紙で行っていた会計や承認の業務を、すべてシステム上で行えるようにリニューアルしました。",
        en: "Accounting and approval work that used to be done on paper now runs on a computer.",
      },
    },
    {
      kind: "work",
      when: "2025年6月",
      tag: "システム開発",
      client: {
        n4: "ナカタニ自動車 株式会社",
        n3: "ナカタニ自動車株式会社様",
        en: "Nakatani Motors",
      },
      what: {
        n4: "車を 直す 会社の ために、しごとを 管理する システムを 作りました。",
        n3: "自動車整備・車検・鈑金塗装を手がける企業に、整備業向けの管理システムを導入しました。",
        en: "A management system for a garage that repairs and inspects cars.",
      },
    },
    {
      kind: "work",
      when: "2025年4月",
      tag: "WEB制作",
      client: {
        n4: "大阪府 トラック協会 南大阪支部",
        n3: "大阪府トラック協会南大阪支部様",
        en: "Osaka Truck Association",
      },
      what: {
        n4: "トラックの 会社が 集まる 団体の ホームページと システムを 作りました。",
        n3: "トラック事業者の団体のWebサイトと業務システムを構築しました。",
        en: "A website and business system for an association of trucking companies.",
      },
    },
    {
      kind: "paragraph",
      text: {
        n4: "大きくて 有名な 会社の システムを 作る しごとにも、たくさん 参加して います。",
        n3: "複数の一部上場企業のシステム開発にも携わっています。",
        en: "We also take part in system development for large listed companies.",
      },
    },
  ],
};
