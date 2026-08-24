/**
 * 会社紹介 — 会社概要・理念・沿革・グループ会社。
 *
 * 宝さがしの 「いつ できた？」「どこに ある？」「たいせつに して いる ことば」は
 * ぜんぶ この ページに ある。表の 中の 数字は レベルで 変えない（変えると
 * 学習者が 見つけた 事実が レベルで ちがう ことに なる）。
 */

export const ABOUT = {
  id: "about",
  nav: "会社紹介",
  title: {
    n4: "会社の しょうかい",
    n3: "会社紹介・経営理念",
    en: "About us",
  },
  // ヒーロー画像は **置かない**（2026-08-23 の 指定）。この ページの 先頭は
  // すぐ 下の「本社の ビル」の 写真で、飾りの 絵を 上に 重ねると 同じ 種類の 絵が
  // 2枚 続いて、どちらが 会社の 建物か 分からなく なる。
  blocks: [
    {
      kind: "figure",
      src: "/gakushu/nextmake/img/honmachi.webp",
      alt: "",
      caption: {
        n4: "大阪の 本社が 入って いる ビルです。",
        n3: "大阪本社が入っているビルです。",
        en: "The building where our Osaka head office is.",
      },
    },
    { kind: "heading", text: { n4: "会社の 情報", n3: "会社概要", en: "Company profile" } },
    {
      kind: "table",
      rows: [
        { th: "会社の 名前", td: "株式会社 NEXT MAKE（ネクストメイク）" },
        { th: "社長", td: "代表取締役社長 松井 亮" },
        { th: "できた 日", td: "2018年1月5日" },
        { th: "本社", td: "〒550-0011 大阪府 大阪市 西区 阿波座2丁目2-18 NANKAI西本町ビル 7階" },
        {
          th: "東京本店",
          td: "〒141-0022 東京都 品川区 東五反田1丁目10番7号 アイオス五反田509号室",
        },
        { th: "取引の 銀行", td: "三井住友銀行 / 京都銀行 / りそな銀行" },
      ],
    },
    {
      kind: "heading",
      text: { n4: "たいせつに して いる こと", n3: "経営理念", en: "Our purpose" },
    },
    {
      kind: "quote",
      text: "人、文化、技術をつなぎ、まだ見ぬ価値を社会へ届ける",
      source: "MISSION",
      note: {
        n4: "人と 文化と 技術を つないで、まだ だれも 見た ことが ない 新しい ものを、社会に とどけます。この 文は どの ページの いちばん 下にも 書いて あります。",
        n3: "人と文化と技術をつなぎ、まだ誰も見たことのない価値を社会へ届けます。この一文は、すべてのページの最下部にも掲げています。",
        en: "Connecting people, culture and technology to deliver value the world has not seen yet. This sentence appears at the bottom of every page.",
      },
    },
    {
      kind: "quote",
      text: "世界中の才能が国境や環境を越えてつながり、誰もが新しい価値を生み出せる社会を創る",
      source: "VISION",
      note: {
        n4: "生まれた 場所は 関係 ありません。世界の 人が つながって、だれでも 新しい しごとを 作れる 社会を めざします。",
        n3: "生まれた国や環境に関係なく世界中の才能がつながり、誰もが新しい価値を生み出せる社会をつくります。",
        en: "A society where talent connects across borders, and anyone can create new value.",
      },
    },
    {
      kind: "heading",
      text: { n4: "大切に する 考えかた", n3: "VALUES（価値観）", en: "Our values" },
    },
    {
      kind: "cards",
      items: [
        {
          icon: "01",
          label: { n4: "才能を しんじる", n3: "才能を信じる", en: "Believe in talent" },
          text: {
            n4: "人の 可能性は、育った 場所で 決まりません。しんじる ところから 始まります。",
            n3: "人は環境によって可能性が決まるのではなく、可能性を信じることからすべてが始まります。",
            en: "Potential is not decided by where you grew up. Everything starts from believing in it.",
          },
        },
        {
          icon: "02",
          label: { n4: "価値を さがす", n3: "価値を探し続ける", en: "Keep looking for value" },
          text: {
            n4: "今の ままで いいと 思いません。歴史にも 文化にも 技術にも 人にも、まだ 眠って いる ものが あります。",
            n3: "現状に満足せず、歴史にも文化にも技術にも人にも、まだ眠る価値があると信じます。",
            en: "We never settle. Value still sleeps in history, culture, technology and people.",
          },
        },
        {
          icon: "03",
          label: { n4: "技術は 道具", n3: "技術は手段", en: "Technology is a means" },
          text: {
            n4: "AIも DXも 目的では ありません。人と 社会を ゆたかに する ための 道具です。",
            n3: "AIもDXも目的ではありません。人や社会を豊かにするための手段です。",
            en: "AI and DX are not goals. They are tools to enrich people and society.",
          },
        },
        {
          icon: "04",
          label: { n4: "挑戦を 楽しむ", n3: "挑戦を楽しむ", en: "Enjoy the challenge" },
          text: {
            n4: "前に やった 人が いない。だから やらない、では なく、だから やって みます。",
            n3: "前例がない。だからやらない。ではなく、前例がない。だから挑戦する。",
            en: "No precedent? That is exactly why we try.",
          },
        },
        {
          icon: "05",
          label: { n4: "人との つながり", n3: "人とのつながり", en: "Human connection" },
          text: {
            n4: "価値は 技術だけでは 生まれません。人と 人の 信頼から 生まれます。",
            n3: "価値は技術だけでは生まれません。人と人との信頼から生まれます。",
            en: "Value does not come from technology alone. It comes from trust between people.",
          },
        },
        {
          icon: "06",
          label: { n4: "世界を おもしろく", n3: "世界を面白くする", en: "Make the world better" },
          text: {
            n4: "きのうより 少し 便利に、少し ゆたかに、そして 笑顔を ふやします。",
            n3: "昨日より少し便利に、少し豊かに、そして笑顔を増やす。その積み重ねが未来を変えます。",
            en: "A little more convenient, a little richer, a few more smiles than yesterday.",
          },
        },
      ],
    },
    { kind: "heading", text: { n4: "会社の あゆみ", n3: "沿革", en: "History" } },
    {
      kind: "timeline",
      items: [
        {
          when: "2018年1月",
          what: {
            n4: "会社が できました。",
            n3: "株式会社NEXT MAKE設立。",
            en: "NEXT MAKE was founded.",
          },
        },
        {
          when: "2019年12月",
          what: {
            n4: "受託開発の しごとを 始めました。",
            n3: "受託開発事業を開始しました。",
            en: "We started contract development.",
          },
        },
        {
          when: "2021年9月",
          what: {
            n4: "デザインの しごとを 始めました。",
            n3: "デザイン制作事業を開始しました。",
            en: "We started design work.",
          },
        },
        {
          when: "2023年4月",
          what: {
            n4: "スマホの アプリの しごとを 始めました。",
            n3: "モバイルアプリ開発事業を開始しました。",
            en: "We started mobile app development.",
          },
        },
        {
          when: "2023年10月",
          what: {
            n4: "海外の しごとを 始めました。まず ベトナムです。",
            n3: "海外事業を開始しました。最初はベトナムです。",
            en: "We started overseas business, first in Vietnam.",
          },
        },
        {
          when: "2024年4月",
          what: {
            n4: "カンボジアでも 海外の しごとを 始めました。",
            n3: "カンボジアでも海外事業を開始しました。",
            en: "We also started business in Cambodia.",
          },
        },
        {
          when: "2024年9月",
          what: {
            n4: "カンボジアの 政府と AUPPと いっしょに、Japanese IT Pathway を 始めました。",
            n3: "カンボジア政府の支援のもと、AUPPと共にJapanese IT Pathwayプログラムを開始しました。",
            en: "With support from the Cambodian government and AUPP, we launched Japanese IT Pathway.",
          },
          mark: true,
        },
        {
          when: "2025年2月",
          what: {
            n4: "東京本店が できました。",
            n3: "東京本店を設立しました。",
            en: "The Tokyo office opened.",
          },
        },
        {
          when: "2026年6月",
          what: {
            n4: "カンボジアに 会社を 作りました。名前は Khmersabai です。",
            n3: "カンボジア法人「Khmersabai」を設立しました。",
            en: "We founded a Cambodian company, Khmersabai.",
          },
        },
        {
          when: "2026年7月",
          what: {
            n4: "新しい サービスを 出しました。NMClaw・観光DX・Verify・セキュリティドローン・Internship Lab です。",
            n3: "新サービス「NMClaw」「観光DX」「Verify」「セキュリティドローン」「Internship Lab」をリリースしました。",
            en: "We released NMClaw, Tourism DX, Verify, Security Drone and Internship Lab.",
          },
        },
      ],
    },
    {
      kind: "heading",
      text: { n4: "グループの 会社", n3: "グループ企業", en: "Group company" },
    },
    /*
     * オフィスは **ベトナムだけ**。`group.js` の 表（「オフィスの 場所: ベトナム（ホーチミン）」）が 正で、
     * 2026-08-23 の 是正が この ページにだけ 当たって いなかった（前は「大阪に 本社が あって」と
     * 書いて いた）。調査シートの「その 会社は どこの国に オフィスが ありますか」が ここに 当たる ので、
     * 2つの ページで 答えが ちがうと 採点できない。
     */
    {
      kind: "paragraph",
      text: {
        n4: "CONTINUE LLC.（コンティニュー）は、ネクストメイクの グループの 会社です。オフィスは ベトナムに あります。",
        n3: "CONTINUE LLC.（コンティニュー）はネクストメイクのグループ企業です。拠点はベトナムにあります。",
        en: "CONTINUE LLC. is a NEXT MAKE group company. Its office is in Vietnam.",
      },
    },
    {
      kind: "link",
      to: "group",
      label: {
        n4: "グループの 会社を 見る",
        n3: "グループ企業を見る",
        en: "See our group companies",
      },
    },
  ],
};
