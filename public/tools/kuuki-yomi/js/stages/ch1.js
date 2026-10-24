/* Chapter 1 — Morning at the Office (朝のオフィス) */
(function (root) {
  const KY = root.KY;

  /* dictionary words used in this chapter (popup 辞書) */
  KY.addGlossary({
    '敬礼':{yomi:'けいれい',jp:'30{度|ど}ぐらい {頭|あたま}を {下|さ}げる あいさつ。',en:'30-degree bow'},'最敬礼':{yomi:'さいけいれい',jp:'45{度|ど}ぐらい {頭|あたま}を {下|さ}げる あいさつ。',en:'deep 45-degree bow'},'土下座':{yomi:'どげざ',jp:'{床|ゆか}に {手|て}や {頭|あたま}を {下|さ}げる こと。{会社|かいしゃ}では ふつう しません。',en:'kneeling apology; not normal workplace behavior'},
    '書類':{yomi:'しょるい',jp:'{仕事|しごと}の {紙|かみ}や データ。',en:'document'},
    '報連相': { yomi: 'ほうれんそう', jp: '{報告|ほうこく}・{連絡|れんらく}・{相談|そうだん}の こと。{仕事|しごと}を {進|すす}める ための、{知|し}らせ{方|かた}の {基本|きほん}です。', en: 'hō-ren-sō: report, inform, consult (the basics of keeping others in the loop)' },
    '進捗': { yomi: 'しんちょく', jp: '{仕事|しごと}が どれくらい {進|すす}んで いるか、という こと。', en: 'progress (how far the work has come)' },
    '朝礼': { yomi: 'ちょうれい', jp: '{朝|あさ}、{仕事|しごと}を はじめる {前|まえ}に みんなで {集|あつ}まって、あいさつや {今日|きょう}の {予定|よてい}を {話|はな}す こと。', en: 'morning assembly (chōrei): the team gathers before work to greet and share the day\'s plan' },
    '順調': { yomi: 'じゅんちょう', jp: '{予定|よてい}どおりに うまく いっている こと。', en: 'going smoothly / on schedule' },
    '対策': { yomi: 'たいさく', jp: '{問題|もんだい}を {直|なお}す ために する こと。', en: 'countermeasure / a plan to fix a problem' },
    '遅れ': { yomi: 'おくれ', jp: '{予定|よてい}の {時間|じかん}より あとに なる こと。', en: 'delay / being behind schedule' },
    'お疲れ様です': { yomi: 'おつかれさまです', jp: '{同|おな}じ {会社|かいしゃ}の {人|ひと}に {言|い}う あいさつ。「{仕事|しごと}を ありがとう」の {気持|きも}ちです。{会|あ}った とき、{別|わか}れる ときに {使|つか}います。', en: 'Thank you for your hard work (a daily greeting between colleagues)' },
    '失礼します': { yomi: 'しつれいします', jp: '{部屋|へや}を {出|で}る とき、{先|さき}に {帰|かえ}る ときに {言|い}う あいさつ。「すみません」の {気持|きも}ちも あります。', en: 'Excuse me (when leaving a room or the office)' },
    'ご苦労様': { yomi: 'ごくろうさま', jp: '{仕事|しごと}を した {人|ひと}に「ありがとう」と {言|い}う ことば。{上|うえ}の {人|ひと}が {下|した}の {人|ひと}に {使|つか}う、と {考|かんが}える {人|ひと}が {多|おお}いです。', en: '"Thanks for your work" — many people feel it is only for a senior to say to a junior' },
    '会釈': { yomi: 'えしゃく', jp: '15°ぐらい {頭|あたま}を {下|さ}げる、かるい あいさつ。', en: 'light bow (about 15°)' },
    '廊下': { yomi: 'ろうか', jp: '{部屋|へや}と {部屋|へや}の あいだの、{長|なが}い {道|みち}。', en: 'hallway / corridor' },
    '遅刻': { yomi: 'ちこく', jp: '{会社|かいしゃ}に、{決|き}まった {時間|じかん}より あとに {着|つ}く こと。', en: 'being late (to work or an appointment)' },
    '遅延証明書': { yomi: 'ちえんしょうめいしょ', jp: '{電車|でんしゃ}が {予定|よてい}より あとに なった ことを、{駅|えき}が {書|か}いて くれる {紙|かみ}。{会社|かいしゃ}に {出|だ}す ことが あります。', en: 'train delay certificate (issued by the station; some companies ask for it)' },
    '5分前行動': { yomi: 'ごふんまえこうどう', jp: '{約束|やくそく}の 5{分|ふん} {前|まえ}に、その {場所|ばしょ}に {着|つ}いて、すぐ はじめられる ように {準備|じゅんび}して おく こと。', en: 'gofun-mae kōdō: being in place five minutes early and ready to start' },
    'おはようございます': { yomi: 'おはようございます', jp: '{朝|あさ}の あいさつ。{会社|かいしゃ}に {着|つ}いて、はじめて {会|あ}う {人|ひと}に {言|い}います。', en: 'Good morning (also the first greeting of the day at many workplaces)' },
  });

  const WHO = {
    senior: { jp: '{先輩|せんぱい}', en: 'Senior colleague' },
    bucho: { jp: '{部長|ぶちょう}', en: 'Dept. Manager' },
    colleague: { jp: '{同僚|どうりょう}', en: 'Colleague' },
    ceo: { jp: '{社長|しゃちょう}', en: 'President' },
    leader: { jp: 'リーダー', en: 'Team leader' },
    boss: { jp: '{上司|じょうし}', en: 'Your boss' },
    kacho: { jp: '{課長|かちょう}', en: 'Section Manager' },
    caller: { jp: 'お{客様|きゃくさま}', en: 'Caller' },
  };

  /* ------------------------------------------------------------------ stage-local helpers
     (everything that touches the DOM / KY.svg lives inside functions so Node can load this file) */

  /* big invisible touch target for a person (tap / hold) */
  function bigHit(person, w = 64, h = 124) {
    person.el.insertBefore(KY.svg.el('rect', { x: -w / 2, y: -h, width: w, height: h, fill: 'transparent' }), person.el.firstChild);
    return person;
  }

  /* keep a speech bubble above a person who is moving (uses the scene's overlay tracking) */
  function follow(scene, node, person, lift = 4) {
    const it = scene.overlays.find(o => o.node === node);
    if (!it) return node;
    it.stop = scene.every(() => {
      const a = person.anchor(), y = a.y - lift;
      if (a.x !== it.x || y !== it.y) { it.x = a.x; it.y = y; scene._layoutItem(it); }
    });
    return node;
  }

  /* a seated person typing at a desk */
  function typing(scene, p, phase = 0) {
    scene.every((dt, t) => p.set({ arms: { f: [24, 46 + 7 * Math.sin(t / 120 + phase)], b: [18, 46 + 7 * Math.sin(t / 140 + phase + 1.7)] } }));
  }

  /* small speech bubble for the manner-card diagrams */
  function dBubble(svg, x, y, w, h, str, color, size = 10) {
    const { el } = KY.svg;
    svg.append(
      el('rect', { x, y, width: w, height: h, rx: 9, fill: '#fff', stroke: color, 'stroke-width': 2.2 }),
      el('path', { d: `M${x + 14} ${y + h} l-3 7 l11 -7`, fill: '#fff', stroke: color, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
      el('line', { x1: x + 15, y1: y + h, x2: x + 21, y2: y + h, stroke: '#fff', 'stroke-width': 3.4 }),
    );
    KY.diag.label(svg, x + w / 2, y + h / 2 + size * 0.36, str, { size, color, weight: 900 });
  }

  /* a flame (gold, not red: red is for things the player operates) */
  function flame(x, y, s = 1) {
    const { el, g, C } = KY.svg;
    return g({ transform: `translate(${x} ${y}) scale(${s})` }, [
      el('path', { d: 'M0 0 C-13 -2 -17 -17 -8 -30 C-6 -21 -2 -19 -3 -26 C0 -36 2 -42 0 -50 C15 -39 24 -21 15 -8 C11 -2 6 0 0 0 Z', fill: C.gold, stroke: C.ink, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
      el('path', { d: 'M0 -1 C-6 -3 -8 -11 -3 -17 C0 -11 4 -10 5 -15 C9 -9 8 -3 0 -1 Z', fill: '#f6dc8c' }),
    ]);
  }

  /* a mark (sweat, ?, ...) at a fixed place in the scene (for things that are not people) */
  function markAt(scene, x, y, name, s = 0.8) {
    const { g } = KY.svg;
    const m = g({ transform: `translate(${x} ${y}) scale(${s})` }, [KY.drawMark(name)]);
    scene.add('top', m);
    return m;
  }

  /* ------------------------------------------------------------------ 1-1 */
  KY.defineStage({
    id: '1-1',
    chapter: 1,
    title: { jp: '{朝|あさ}の オフィス', en: 'Morning at the Office' },
    intro: { jp: '{朝|あさ}9{時|じ}。{会社|かいしゃ}に {着|つ}いて、{自分|じぶん}の {席|せき}に {向|む}かって います。', en: "It's 9:00 a.m. You've just arrived at the office and are heading to your desk." },
    time: 9000,
    mechanic: 'timing',
    setup(scene) {
      const P = KY.props;
      scene.camera({ zoom: 1.2, x: 180, y: 430 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.door({ x: 38, floor: 470, w: 46, h: 140, open: 0.85 }));
      scene.add('bg', P.window({ x: 236, y: 226, w: 76, h: 58 }));
      scene.add('bg', P.clock({ x: 170, y: 262, r: 19, h: 9, m: 0 }));
      scene.label(170, 226, { jp: '{朝|あさ}9{時|じ}', en: '9:00 a.m.' }, 'deadline');
      /* back row: two colleagues facing each other across a desk */
      scene.add('mid', P.officeChair({ x: 112, facing: 1 }));
      scene.add('mid', P.officeChair({ x: 282, facing: -1 }));
      const c1 = scene.person({ x: 112, y: 470, pose: 'sit', facing: 1, tag: WHO.senior });
      const c2 = scene.person({ x: 282, y: 470, pose: 'sit', facing: -1, color: 'npc2' });
      scene.add('mid', P.table({ x: 197, y: 420, w: 104 }));
      scene.add('mid', P.monitor({ x: 176, y: 410, w: 26, h: 28 }));
      scene.add('mid', P.monitor({ x: 218, y: 410, w: 26, h: 28 }));
      /* front row: your desk */
      scene.add('mid', P.officeChair({ x: 178, floor: 550, facing: 1 }));
      const player = scene.person({ x: 62, y: 470, facing: 1, color: 'player', player: true });
      bigHit(player, 72, 132);
      scene.add('mid', P.table({ x: 264, y: 500, w: 100, floor: 550 }));
      scene.add('mid', P.monitor({ x: 288, y: 490, w: 26, h: 28 }));
      typing(scene, c1, 0);
      typing(scene, c2, 2.4);
      return { player, c1, c2 };
    },
    params: {
      target: 'player',
      label: 'You (tap to greet)',
      script: [
        /* you walk in from the door and cross the office to your desk (about 4 s) */
        [400, (s, r) => {
          const X0 = 62, X1 = 178, Y0 = 470, Y1 = 550, LEN = Math.hypot(X1 - X0, Y1 - Y0);
          const sm = k => k * k * (3 - 2 * k);
          s.tween({
            from: 0, to: 1, dur: 4200, ease: 'linear',
            step: u => r.player.set({ x: X0 + (X1 - X0) * u, y: Y0 + (Y1 - Y0) * sm(Math.min(1, u / 0.5)), pose: 'walk', walk: (u * LEN) / 9, facing: 1 }),
            done: () => { r.player.set({ pose: 'sit', walk: 0, x: X1, y: Y1 }); s.flag('seated'); },
          });
        }],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'never';
        return flags.seated !== undefined && tapAt >= flags.seated ? 'late' : 'great';
      },
      onTap(scene, r, key) {
        const b = scene.say(r.player, { jp: 'おはようございます！！', en: 'Good morning!!' }, { dur: 2300, cls: 'mine' });
        follow(scene, b, r.player);
        if (key === 'great') scene.after(700, () => scene.say(r.c1, { jp: 'おはようございます！！', en: 'Good morning!!' }, { dur: 1500, lift: 30 }));
        return key === 'great' ? 1800 : 1300;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.senior, line: { jp: '{朝|あさ}から {元気|げんき}で いいね！', en: 'Great energy this morning!' } },
      late: { grade: 'ok', who: WHO.senior, line: { jp: 'あ、いたんだ。…おはようございます。', en: "Oh, you're here. ...Good morning." },
        react(scene, r) { r.c1.mark('q'); } },
      never: { grade: 'ky', who: WHO.senior, line: { jp: '…（{誰|だれ}か{来|き}た？）', en: '...(Did someone come in?)' },
        react(scene, r) { r.c1.mark('q'); r.c2.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{朝|あさ}の あいさつ', en: 'The morning greeting' },
      points: [
        { jp: '{会社|かいしゃ}に {着|つ}いたら、{自分|じぶん}から {先|さき}に「<<おはようございます>>」と {言|い}います。', en: 'When you arrive, greet first: "ohayō gozaimasu".' },
        { jp: '{会社|かいしゃ}に {入|はい}った すぐ あとに、あいさつ しよう。', en: 'Greet colleagues right after you enter the office.' },
        { jp: '{明|あか}るい {声|こえ}で、{相手|あいて}の {方|ほう}を {見|み}て {言|い}います。', en: 'Use a bright voice and look at the person.' },
      ],
      phrase: { jp: '<<おはようございます>>', ro: 'ohayō gozaimasu', en: 'Good morning.' },
      why: { jp: '{日本|にほん}の {会社|かいしゃ}では、{朝|あさ}の あいさつで {一日|いちにち}が はじまります。{自分|じぶん}から {言|い}うと、まわりの {人|ひと}に「{会社|かいしゃ}に {着|つ}きました」と {知|し}らせる ことにも なります。', en: 'In Japanese offices the day starts with this greeting. Saying it first also tells everyone that you have arrived.' },
      dont: { jp: '{何|なに}も {言|い}わずに {席|せき}に {座|すわ}らない。', en: "Don't sit down without saying anything." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.floor(svg, 132);
        svg.append(el('rect', { x: 10, y: 66, width: 26, height: 66, fill: '#ececec', stroke: '#c4c4c4', 'stroke-width': 2.5 }));
        D.person(svg, { x: 66, y: 132, s: 0.72, pose: 'walk', walk: 1.1, color: 'player' });
        D.rect(svg, 112, 100, 54, 7, { r: 3 });
        D.person(svg, { x: 182, y: 132, s: 0.6, pose: 'sit', facing: -1 });
        dBubble(svg, 30, 10, 128, 26, 'おはようございます！', C.red, 10);
        D.arrow(svg, 90, 84, 108, 84, { color: C.red });
      },
    },
    test: { great: { at: 700 }, ok: { at: 7000 }, ky: null },
  });

  /* ------------------------------------------------------------------ 1-2 */
  /* During work, a visitor enters the office. Tap your seated red character to stand and greet. */
  KY.defineStage({
    id: '1-2',
    chapter: 1,
    title: { jp: '{仕事中|しごとちゅう}に お{客様|きゃくさま}が {来|き}た！', en: 'A Visitor Arrives While You Work!' },
    intro: { jp: 'パソコンで {仕事中|しごとちゅう}です。お{客様|きゃくさま}が オフィスに {来|き}ます。{赤|あか}い {人|ひと}を タップすると {立|た}ちます。いつ {立|た}つ？', en: 'You are working at your computer. A visitor is about to enter the office. Tap the red person to stand up. When should you stand?' },
    time: 9500,
    mechanic: 'timing',
    setup(scene) {
      const P = KY.props;
      scene.camera({ zoom: 1.10, x: 180, y: 445 });
      scene.add('bg', P.backdrop({ floor: 480 }));
      scene.add('bg', P.window({ x: 60, y: 247, w: 70, h: 60 }));
      scene.add('bg', P.door({ x: 320, floor: 480, w: 48, h: 143, open: 0.8 }));
      scene.add('bg', P.clock({ x: 176, y: 283, r: 17, h: 9, m: 20 }));
      scene.add('mid', P.officeChair({ x: 137, floor: 480, facing: 1 }));
      scene.add('mid', P.table({ x: 205, y: 435, w: 96 }));
      scene.add('mid', P.monitor({ x: 212, y: 422, w: 29, h: 30 }));
      const player = scene.person({ x: 137, y: 480, pose: 'sit', facing: 1, color: 'player', player: true });
      bigHit(player, 80, 140);
      const colleague = scene.person({ x: 70, y: 480, pose: 'stand', facing: 1, tag: WHO.senior });
      const visitor = scene.person({ x: 378, y: 480, pose: 'stand', facing: -1, tag: { jp: 'お{客様|きゃくさま}', en: 'Visitor' } });
      const stopTyping = scene.every((dt, t) => {
        player.set({ arms: { f: [24, 46 + 7 * Math.sin(t / 120)], b: [18, 46 + 7 * Math.sin(t / 140 + 1.7)] } });
      });
      return { player, visitor, colleague, stopTyping };
    },
    params: {
      target: 'player',
      label: 'You (tap to stand and greet)',
      script: [
        [1100, (s, r) => { r.stopVisitor = s.walk(r.visitor, 294, 4800); }],
        [3800, (s, r) => {
          s.flag('entered');
          s.say(r.visitor, { jp: 'こんにちは。', en: 'Hello.' }, { dur: 2100 });
        }],
        [6700, s => s.flag('tooLate')],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'miss';
        if (flags.entered === undefined) return 'early';
        return flags.tooLate === undefined ? 'great' : 'late';
      },
      onTap(scene, r, key) {
        r.stopTyping();
        r.player.set({ pose: 'stand', facing: 1, arms: null });
        const b = scene.say(r.player, { jp: 'こんにちは。いらっしゃいませ！', en: 'Hello, welcome!' }, { dur: 1800, cls: 'mine' });
        follow(scene, b, r.player);
        scene.tween({ from: 0, to: 18, dur: 270, ease: 'out', step: v => r.player.set({ bow: v }) });
        scene.after(680, () => scene.tween({ from: 18, to: 0, dur: 310, ease: 'inout', step: v => r.player.set({ bow: v }) }));
        if (key === 'great') scene.after(340, () => r.visitor.mark('sparkle'));
        return 1700;
      },
      onTimeout(scene, r) {
        r.visitor.mark('q');
        r.player.mark('dots');
        return 700;
      },
    },
    outcomes: {
      great: { grade: 'great', who: { jp: 'お{客様|きゃくさま}', en: 'Visitor' }, line: { jp: 'こんにちは。{迎|むか}えてくれて、ありがとうございます！', en: 'Hello! Thank you for welcoming me!' } },
      early: { grade: 'ok', who: { jp: 'お{客様|きゃくさま}', en: 'Visitor' }, line: { jp: 'あ、もう {立|た}っている。{準備|じゅんび}が {早|はや}いですね！', en: 'Oh, you are already standing. You are well prepared!' } },
      late: { grade: 'ok', who: { jp: 'お{客様|きゃくさま}', en: 'Visitor' }, line: { jp: 'あ、こんにちは。{仕事中|しごとちゅう}でしたか？', en: 'Oh, hello. Were you busy working?' } },
      miss: { grade: 'ky', who: { jp: 'お{客様|きゃくさま}', en: 'Visitor' }, line: { jp: '（あれ？ だれに あいさつしたら いいんだろう…）', en: '(Hmm, who should I greet…?)' }, react(scene, r) { r.visitor.mark('q'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{立|た}って あいさつ', en: 'Stand Up to Greet a Visitor' },
      points: [
        { jp: '{仕事中|しごとちゅう}でも、お{客様|きゃくさま}が {来|き}たら {席|せき}から {立|た}って あいさつします。', en: 'Even when working, stand and greet visitors who enter the office.' },
        { jp: '{相手|あいて}を {見|み}て、「こんにちは。いらっしゃいませ」と {言|い}いましょう。', en: 'Look at the visitor and say, “Hello, welcome.”' },
      ],
      phrase: { jp: 'こんにちは。いらっしゃいませ。', ro: 'konnichiwa. irasshaimase.', en: 'Hello, welcome.' },
      why: { jp: '{席|せき}から {立|た}つと、お{客様|きゃくさま}に「あなたが {来|き}たことに {気|き}づいています」と {伝|つた}わります。', en: 'Standing up shows the visitor that you noticed their arrival.' },
      dont: { jp: '{仕事|しごと}を {続|つづ}けながら、{下|した}を {向|む}いたままに しない。', en: 'Do not keep working without looking up.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.floor(svg, 133);
        D.person(svg, { x: 75, y: 133, s: 0.73, color: 'player', bow: 15 });
        D.person(svg, { x: 157, y: 133, s: 0.70, facing: -1 });
        svg.append(el('rect', { x: 4, y: 87, width: 35, height: 6, rx: 3, fill: '#bababa' }));
        svg.append(el('rect', { x: 12, y: 66, width: 21, height: 21, rx: 3, fill: '#ebebeb', stroke: '#888' }));
        dBubble(svg, 35, 12, 128, 27, 'いらっしゃいませ！', C.red, 10);
      },
    },
    test: { great: { at: 4500 }, ok: { at: 1700 }, ky: null },
  });

  /* ------------------------------------------------------------------ 1-3 */
  KY.defineStage({
    id: '1-3',
    chapter: 1,
    title: { jp: '{役職|やくしょく}の {人|ひと}に {書類|しょるい}を とどけよう', en: "Who's the Boss?" },
    intro: { jp: '{書類|しょるい}を、{役職|やくしょく}が {上|うえ}の {人|ひと}から {順番|じゅんばん}に とどけて！ {名札|なふだ}を ドラッグしよう。', en: 'Your first day. A senior colleague explains the job titles at a typical Japanese company.' },
    time: 25000,
    mechanic: 'order',
    setup(scene) {
      const { el, C } = KY.svg;
      scene.add('bg', el('rect', { x: 34, y: 104, width: 292, height: 330, rx: 10, fill: '#fbfbfa', stroke: '#cfcfcf', 'stroke-width': 3 }));
      for(let i=0;i<5;i++){ const y=135+i*60;scene.add('bg',el('rect',{x:106,y:y-13,width:150,height:40,rx:7,fill:'#e6e5e1',stroke:'#b1b1ae','stroke-width':2}));scene.add('bg',el('rect',{x:205,y:y-9,width:28,height:20,rx:2,fill:'white',stroke:'#b4b4b4'}));}
      scene.label(180,100,{jp:'{書類|しょるい}を {順番|じゅんばん}に とどける',en:'Deliver documents in rank order'});
      scene.add('bg', el('line', { x1: 34, y1: 470, x2: 326, y2: 470, stroke: C.faint, 'stroke-width': 2 }));
      scene.label(62, 150, { jp: '{上|うえ}', en: 'top' });
      scene.label(62, 390, { jp: '{下|した}', en: 'bottom' });
      return {};
    },
    params: {
      script: [
        [200, s => s.bubble({ x: 180, y: 70, tail: 'none', who: WHO.senior, text: { jp: '{上|うえ}の {役職|やくしょく}の {人|ひと}から {書類|しょるい}を わたそう！', en: 'Try putting the job titles in order, from the top.' } })],
      ],
      cards: [
        { id: 'shacho', image: KY.roleHeads.shacho, text: { jp: '{社長|しゃちょう}', en: 'President' } },
        { id: 'bucho', image: KY.roleHeads.bucho, text: { jp: '{部長|ぶちょう}', en: 'Dept. Manager' } },
        { id: 'kacho', image: KY.roleHeads.kacho, text: { jp: '{課長|かちょう}', en: 'Section Manager' } },
        { id: 'kakaricho', image: KY.roleHeads.kakaricho, text: { jp: '{係長|かかりちょう}', en: 'Assistant Manager' } },
        { id: 'shunin', image: KY.roleHeads.shunin, text: { jp: '{主任|しゅにん}', en: 'Chief' } },
      ],
      slots: [
        { x: 180, y: 150, w: 120, h: 42 },
        { x: 180, y: 210, w: 120, h: 42 },
        { x: 180, y: 270, w: 120, h: 42 },
        { x: 180, y: 330, w: 120, h: 42 },
        { x: 180, y: 390, w: 120, h: 42 },
      ],
      tray: { y: 528 },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.senior, line: { jp: '{完璧|かんぺき}！これで{名刺|めいし}を{見|み}ても{迷|まよ}わないね。', en: "Perfect! Now business cards won't confuse you." } },
      ok: { grade: 'ok', who: WHO.senior, line: { jp: '{惜|お}しい！{真|ま}ん{中|なか}あたりが{入|い}れ{替|か}わってるよ。', en: 'So close! A couple in the middle are swapped.' } },
      ky: { grade: 'ky', who: WHO.bucho, line: { jp: '…{私|わたし}、そんなに{下|した}だったかな？', en: '...Am I really that low?' } },
    },
    card: {
      badge: 'must',
      name: { jp: '{役職|やくしょく}の {順番|じゅんばん}', en: 'The order of job titles' },
      points: [
        { jp: 'よくある {順番|じゅんばん}：{社長|しゃちょう}＞{部長|ぶちょう}＞{課長|かちょう}＞{係長|かかりちょう}＞{主任|しゅにん}。', en: 'A typical order: President > Dept. Manager > Section Manager > Assistant Manager > Chief.' },
        { jp: '{役職|やくしょく}は {名前|なまえ}の あとに つけて よびます。「{田中|たなか}{部長|ぶちょう}」。', en: 'A title goes after the name, like an honorific: "Tanaka-buchō".' },
        { jp: '{会社|かいしゃ}によって {役職|やくしょく}は ちがいます。みんなを「さん」で よぶ {会社|かいしゃ}も あります。', en: 'Titles differ by company. Some companies call everyone "-san".' },
      ],
      phrase: { jp: '{田中|たなか}{部長|ぶちょう}、おはようございます', ro: 'Tanaka-buchō, ohayō gozaimasu', en: 'Good morning, Mr./Ms. Tanaka (department manager).' },
      why: { jp: '{役職|やくしょく}で、すわる {席|せき}や {名刺|めいし}を わたす {順番|じゅんばん}が {決|き}まります。だから はじめに おぼえると {役|やく}に {立|た}ちます。', en: 'Rank decides who sits where and who exchanges business cards first, so learning it early helps with every other manner.' },
      dont: { jp: '「{田中|たなか}{部長|ぶちょう}さん」とは {言|い}いません。{役職|やくしょく}だけで {丁寧|ていねい}です。', en: 'Don\'t say "Tanaka-buchō-san" — the title is already polite on its own.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        const { el } = KY.svg;
        svg.append(el('path', { d: 'M100 10 L178 138 L22 138 Z', fill: '#f4f4f2', stroke: '#cfcfcf', 'stroke-width': 2 }));
        const rows = ['しゃちょう', 'ぶちょう', 'かちょう', 'かかりちょう', 'しゅにん'];
        rows.forEach((r, i) => D.label(svg, 100, 34 + i * 23, r, { color: i === 0 ? C.ink : '#666', size: 10 }));
      },
    },
    test: { great: ['shacho', 'bucho', 'kacho', 'kakaricho', 'shunin'], ok: ['shacho', 'bucho', 'kakaricho', 'kacho', 'shunin'], ky: ['shunin', 'kakaricho', 'kacho', 'bucho', 'shacho'] },
  });

  /* ------------------------------------------------------------------ 1-4 */
  KY.defineStage({
    id:'1-4',chapter:1,title:{jp:'{進捗|しんちょく}は 60％！',en:'Report your real progress'},
    intro:{jp:'{仕事|しごと}は 60％ おわりました。バーを 55〜65％に して、{上司|じょうし}に {報告|ほうこく}しよう。ボタンで {数字|すうじ}を {変|か}えられます。',en:'The work is 60% complete. Keep the bar between 55 and 65%, then report. Use the buttons.'},
    time:15000,mechanic:'action',
    setup(scene){const P=KY.props,{el,C}=KY.svg;scene.add('bg',P.backdrop({floor:470})); scene.add('mid',P.table({x:180,y:423,w:220}));
      const player=scene.person({x:74,y:470,color:'player',player:true});const boss=scene.person({x:292,y:470,facing:-1,tag:{jp:'{上司|じょうし}',en:'Boss'}});
      scene.add('mid',el('rect',{x:30,y:190,width:300,height:156,rx:14,fill:'#fff',stroke:'#999','stroke-width':3}));
      scene.add('mid',el('rect',{x:55,y:270,width:250,height:30,rx:8,fill:'#ebebeb'}));
      scene.add('mid',el('rect',{x:55+250*.55,y:263,width:250*.10,height:44,rx:5,fill:'#d2ecd7',stroke:'#0a8b38','stroke-width':1.5}));
      const bar=el('rect',{x:55,y:270,width:0,height:30,rx:7,fill:C.red});scene.add('mid',bar);const pct=KY.mini.label(scene,180,244,'48％',C.ink,25);
      scene.label(180,150,{jp:'{本当|ほんとう}の {進捗|しんちょく} 60％',en:'Actual progress: 60%'});
      scene.label(180,329,{jp:'OK：55〜65％',en:'OK: 55–65%'});return {player,boss,bar,pct};},
    params:{start(s,r){let v=48,done=false;const update=()=>{KY.svg.set(r.bar,{width:250*Math.min(100,v)/100});r.pct.textContent=Math.round(v)+'％';};
      const up=KY.mini.button(s,'▲ あげる','Up',()=>{v=Math.min(100,v+5);update();},'up');
      const down=KY.mini.button(s,'▼ さげる','Down',()=>{v=Math.max(0,v-6);update();},'down');
      const send=KY.mini.button(s,'{報告|ほうこく}する','Report',()=>{if(done)return;done=true;up.remove();down.remove();send.remove();const key=v>65?'high':v<55?'low':'great';s.say(r.player,{jp:'{進捗|しんちょく}は '+Math.round(v)+'％ です。',en:'Progress is '+Math.round(v)+'%.'},{dur:1400,cls:'mine'});s.after(800,()=>{if(key==='high'){KY.mini.folderFlood(s);r.boss.mark('sparkle');}if(key==='low')r.boss.mark('q');s.end(key);});},'report');
      let holdingUp=false,holdingDown=false;
      const stop=()=>{holdingUp=false;holdingDown=false;};
      up.addEventListener('pointerdown',()=>holdingUp=true);down.addEventListener('pointerdown',()=>holdingDown=true);
      ['pointerup','pointercancel','pointerleave'].forEach(ev=>{up.addEventListener(ev,stop);down.addEventListener(ev,stop);});
      s.every((dt)=>{if(done)return;v=Math.max(0,Math.min(100,v+dt*(0.004+(holdingUp?0.012:0)-(holdingDown?0.016:0))));update();});s.timer(s.def.time,()=>{if(!done){done=true;up.remove();down.remove();send.remove();s.end(v>65?'high':v<55?'low':'great');}});
      s._progress={set(x){v=x;update();},report(){send.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));}};},simulate(s,r,input){s.at(1500,()=>{s._progress.set(input==='high'?90:input==='low'?30:60);s._progress.report();});}},
    outcomes:{great:{grade:'great',line:{jp:'60％！ {本当|ほんとう}の {数字|すうじ}で {報告|ほうこく}できた！',en:'60%! You reported the real progress!'}},high:{grade:'ky',line:{jp:'「もう そんなに {終|お}わったの？ つぎも お{願|ねが}い！」{仕事|しごと}が いっぱい！',en:'“Already that far? Here is more work!” So many tasks!'}},low:{grade:'ky',line:{jp:'「えっ、まだ それだけ？ {何|なに}が あったの？」',en:'“Only that much? What happened?”'}}},
    card:{badge: "must", name: {jp:"進捗は正しく伝える",en:"進捗は正しく伝える"}, points:[{jp:"{仕事|しごと}が 60％ おわったら、60％と {報告|ほうこく}しよう。{多|おお}くも {少|すく}なくも {言|い}わない。",en:"{仕事|しごと}が 60％ おわったら、60％と {報告|ほうこく}しよう。{多|おお}くも {少|すく}なくも {言|い}わない。"}], phrase:{jp:"{進捗|しんちょく}は 60％ です。",en:"{進捗|しんちょく}は 60％ です。"}, },test:{great:'great',ky:'high'}});


  /* ------------------------------------------------------------------ 1-5 */
  /* The boss's state is shown by what they do, not by symbols:
     0–5.5 s on the phone (handset at the ear, nodding, talking) → 5.5–9 s typing at the PC
     (leaning in, lines filling the screen) → from 9 s done (stretches, says "phew", sits back). */
  const BOSS5_X = 286, PHONE5_X = 158, TABLE5_Y = 428;
  KY.defineStage({id:'1-5',chapter:1,title:{jp:'いま、{報告|ほうこく}しても いい？',en:'Is now a good time to report?'},intro:{jp:'{仕事|しごと}が おわりました。{上司|じょうし}に {報告|ほうこく}したい。でも {上司|じょうし}は {電話|でんわ}を して います。いつ {話|はな}しかける？',en:'You have finished your work. Your boss is on the phone. When should you speak?'},time:14500,mechanic:'action',
    setup(s){
      const P=KY.props,{el}=KY.svg;
      s.add('bg',P.backdrop({floor:470}));
      s.add('mid',P.officeChair({x:BOSS5_X,facing:-1}));
      s.add('mid',P.table({x:206,y:TABLE5_Y,w:136}));
      const monitor=P.monitor({x:212,y:TABLE5_Y-12,w:58,h:42});
      s.add('mid',monitor);
      s.add('mid',el('rect',{x:238,y:TABLE5_Y-5,width:30,height:5,rx:2,fill:'#e4e7ea',stroke:'#9a9a9a','stroke-width':1.5}));   /* keyboard */
      const phone=P.phone({x:PHONE5_X,y:TABLE5_Y});
      const cord=el('path',{fill:'none',stroke:'#6b6b6b','stroke-width':2,'stroke-linecap':'round'});
      s.add('fg',cord);s.add('fg',phone);
      const me=s.person({x:55,y:470,color:'player',player:true});
      const boss=s.person({x:BOSS5_X,y:470,pose:'sit',facing:-1,tag:{jp:'{上司|じょうし}',en:'Boss'}});
      KY.mini.hit(s,228,300,112,175,()=>{if(s._report)s._report();});
      return {me,boss,phone,monitor,cord};
    },
    params:{start(s,r){
      let done=false,typing=false,lines=0,lastTick=0;
      const btn=KY.mini.button(s,'{上司|じょうし}に {話|はな}しかける','Speak to boss',()=>s._report());
      /* on the phone: the handset is in the boss's hand at the ear */
      const holdPhone=()=>{
        const h=r.boss.hand();
        KY.svg.set(r.phone.handset,{transform:`translate(${(h.x-PHONE5_X-15).toFixed(1)} ${(h.y-TABLE5_Y+5.5).toFixed(1)}) rotate(70)`});
        const x0=PHONE5_X+16,y0=TABLE5_Y-6,x1=h.x,y1=h.y+14;
        KY.svg.set(r.cord,{d:`M${x0} ${y0} C${x0+30} ${y0+18} ${x1-26} ${y1+30} ${x1} ${y1}`});
      };
      r.boss.set({arms:{f:[112,78],b:[18,46]}});holdPhone();
      const talk=(at,jp,en,dur)=>s.at(at,()=>{if(!done)s.say(r.boss,{jp,en},{dur,lift:26});});
      talk(300,'はい、はい。','Yes, yes.',1400);
      talk(2000,'{明日|あした}の {会議|かいぎ}ですね。',"About tomorrow's meeting, right?",1600);
      talk(3900,'わかりました。では、しつれいします。','Understood. Goodbye.',1300);
      s.at(5300,()=>{if(done)return;r.boss.set({arms:null,nod:0});KY.svg.set(r.phone.handset,{transform:null});KY.svg.set(r.cord,{d:null});});
      /* at the PC: leans in and types; lines fill the screen */
      s.at(5500,()=>{if(!done){typing=true;r.boss.set({bow:9,nod:8});}});
      for(let i=0;i<5;i++)s.at(5700+i*650,()=>{if(done||lines>=5)return;const w=r.monitor.sw-6-((i*13)%20);const line=KY.svg.el('rect',{x:3,y:4+lines*6.5,width:0,height:3.2,rx:1.6,fill:'#8fa0b0'});r.monitor.screen.append(line);lines++;s.tween({dur:520,step:k=>KY.svg.set(line,{width:(w*k).toFixed(1)})});});
      /* done: stops typing, stretches, sits back */
      s.at(9000,()=>{typing=false;if(done)return;r.boss.set({bow:-8,nod:-4,arms:{f:[168,8],b:[160,8]}});s.say(r.boss,{jp:'ふう、おわった。',en:'Phew, done.'},{dur:1500,lift:26});});
      s.at(9900,()=>{if(!done)r.boss.set({bow:0,nod:0,arms:null});});
      s.every((dt,t)=>{
        if(done)return;
        if(t<5300)r.boss.set({nod:4+4*Math.sin(t/260)});   /* nods while listening */
        else if(typing){
          r.boss.set({arms:{f:[30,52+8*Math.sin(t/70)],b:[24,52+8*Math.sin(t/85+1.7)]}});
          if(t-lastTick>170){lastTick=t;KY.sfx.play('tick');}
        }
      });
      s._report=()=>{if(done)return;done=true;btn.remove();const k=s.t<5500?'call':s.t<9000?'busy':'great';s.walk(r.me,132,560,()=>{s.say(r.me,{jp:'{仕事|しごと}が おわりました。{報告|ほうこく}しても よろしいですか？',en:'I finished my work. May I report?'},{dur:1300,cls:'mine'});if(k==='call'){r.boss.mark('shock');s.say(r.boss,{jp:'えっ、{電話|でんわ}と {同時|どうじ}は むり！',en:'I cannot listen to two people at once!'},{dur:1100});}if(k==='busy')r.boss.mark('sweat');s.after(1250,()=>s.end(k));});};s.timer(s.def.time,()=>{if(!done){done=true;btn.remove();s.end('never');}});},simulate(s,r,v){s.at(v==='great'?10500:v==='busy'?7000:2200,()=>s._report());}},
    outcomes:{great:{grade:'great',line:{jp:'「うん、{報告|ほうこく}を {聞|き}くよ！」',en:'“Yes, tell me!”'}},call:{grade:'ky',line:{jp:'{電話|でんわ}の {声|こえ}と あなたの {声|こえ}が いっしょに！ {上司|じょうし}は {大混乱|だいこんらん}！',en:'Two voices at once! The boss is confused!'}},busy:{grade:'ok',line:{jp:'「あと すこし {待|ま}って！」',en:'“Please wait a little!”'}},never:{grade:'ky',line:{jp:'{報告|ほうこく}が できないまま {時間|じかん}が すぎた。',en:'You ran out of time without reporting.'}}},card:{badge: "must", name: {jp:"{話|はな}しかける タイミング",en:"When to speak to your boss"}, points:[{jp:"{上司|じょうし}が {電話|でんわ}や {仕事|しごと}を おわってから {話|はな}しかけよう。",en:"Wait until your boss has finished the call or the task, then speak."}], phrase:{jp:"いま、お{時間|じかん} よろしいですか？",ro:"ima, o-jikan yoroshii desu ka?",en:"Do you have a moment now?"}, },test:{great:'great',ok:'busy',ky:'call'}});


  /* ------------------------------------------------------------------ 1-6 */
  KY.defineStage({
    id: '1-6',
    chapter: 1,
    title: { jp: 'プルルル… {電話|でんわ}だ！', en: 'The Ringing Phone' },
    intro: { jp: '{仕事|しごと}を して いると、{電話|でんわ}が かかって きました。', en: 'While you are working, a phone call comes in.' },
    time: 11000,
    mechanic: 'timing',
    setup(scene) {
      const P = KY.props, { el, g, C } = KY.svg;
      scene.camera({ zoom: 1.2, x: 176, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 178, y: 214, w: 92, h: 70 }));
      scene.add('mid', P.officeChair({ x: 58, facing: 1 }));
      const player = scene.person({ x: 58, y: 470, pose: 'sit', facing: 1, color: 'player', player: true });
      scene.add('mid', P.table({ x: 168, y: 420, w: 152 }));
      scene.add('mid', P.monitor({ x: 208, y: 410, w: 40, h: 30 }));
      const phone = P.hitPad(P.phone({ x: 118, y: 420, red: true }), 84, 62);
      scene.add('fg', phone);
      /* ring waves around the phone */
      const wv = { stroke: C.npc2, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' };
      const waves = g({ transform: 'translate(118 420)', opacity: 0 }, [
        el('path', Object.assign({ d: 'M-26 -12 Q-31 -22 -26 -32' }, wv)), el('path', Object.assign({ d: 'M-33 -8 Q-41 -22 -33 -38' }, wv)),
        el('path', Object.assign({ d: 'M26 -12 Q31 -22 26 -32' }, wv)), el('path', Object.assign({ d: 'M33 -8 Q41 -22 33 -38' }, wv)),
      ]);
      scene.add('fg', waves);
      const senior = scene.person({ x: 292, y: 470, facing: -1, tag: WHO.senior });
      const ringLabel = scene.label(118, 360, { jp: '1コール', en: '1 ring' }, 'deadline');
      ringLabel.style.visibility = 'hidden';
      const setRing = n => {
        ringLabel.innerHTML = KY.text.html({ jp: n + 'コール', en: n + (n === 1 ? ' ring' : ' rings') }, { gloss: false });
        ringLabel.style.visibility = 'visible';
        scene.relayout();
      };
      return { player, phone, senior, setRing, hideRing: () => { ringLabel.style.visibility = 'hidden'; }, waves: on => KY.svg.set(waves, { opacity: on ? 1 : 0 }), answered: false };
    },
    params: {
      target: 'phone',
      label: 'The phone (tap to answer)',
      script: Array.from({ length: 9 }, (_, i) => [600 + i * 1200, (s, r) => {
        if (r.answered) return;
        const n = i + 1;
        s.flags.rings = n;
        r.phone.ring(true); r.waves(true); r.setRing(n);
        KY.sfx.play('ring');
        s.after(780, () => { if (!r.answered) { r.phone.ring(false); r.waves(false); } });
        if (n === 4) r.senior.mark('dots');
        if (n === 6) r.senior.mark('sweat2');
        if (n === 8) r.senior.mark('ex');
      }]),
      judge(tapAt, flags) {
        if (tapAt === null) return 'never';
        return (flags.rings || 0) <= 3 ? 'great' : 'late';
      },
      onTap(scene, r, key) {
        r.answered = true;
        r.phone.ring(false); r.waves(false); r.hideRing();
        r.senior.mark(null);
        r.player.set({ arms: { f: [112, 78], b: [18, 46] } });
        const h = r.player.hand();
        KY.svg.set(r.phone.handset, { transform: `translate(${(h.x - 118 + 15).toFixed(1)} ${(h.y - 420 + 5.5).toFixed(1)}) rotate(-70)` });
        const text = key === 'great'
          ? { jp: 'お{電話|でんわ} ありがとうございます。{株式会社|かぶしきがいしゃ}ABCシステムでございます。', en: 'Thank you for calling. ABC Systems, Inc.' }
          : { jp: 'お{待|ま}たせいたしました。{株式会社|かぶしきがいしゃ}ABCシステムでございます。', en: 'Sorry to keep you waiting. ABC Systems, Inc.' };
        scene.say(r.player, text, { dur: 2800, cls: 'mine' });
        return 2400;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.caller, line: { jp: '（{出|で}るのが{早|はや}い…いい{会社|かいしゃ}だな）', en: '(They picked up fast... a good company.)' } },
      late: { grade: 'ok', who: WHO.caller, line: { jp: 'いえいえ。（ちょっと{長|なが}かったな…）', en: "Not at all. (That took a while...)" } },
      never: { grade: 'ky', who: WHO.senior, line: { jp: '…（まだ{鳴|な}ってる…{誰|だれ}か{出|で}て…）', en: "...(It's still ringing... somebody pick up...)" },
        react(scene, r) { r.senior.mark('sweat2'); r.player.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: '{電話|でんわ}の {出|で}かた', en: 'Answering the office phone' },
      points: [
        { jp: '{会社|かいしゃ}の {電話|でんわ}は、3コールの {間|あいだ}に {出|で}るのが {目安|めやす}です。', en: 'A common guide is to answer within three rings.' },
        { jp: '{電話|でんわ}に {出|で}たら、「お{電話|でんわ} ありがとうございます」と {会社|かいしゃ}の {名前|なまえ}を {言|い}います。「もしもし」とは {言|い}いません。', en: 'Say "Thank you for calling" and your company name. Business calls do not start with "moshi moshi".' },
        { jp: '{長|なが}く {待|ま}たせた ときは、「お{待|ま}たせいたしました」と {言|い}います。', en: 'If you kept the caller waiting, say "Sorry to keep you waiting".' },
      ],
      phrase: { jp: 'お{電話|でんわ} ありがとうございます。{株式会社|かぶしきがいしゃ}ABCシステムでございます', ro: 'O-denwa arigatō gozaimasu. Kabushiki-gaisha ABC Shisutemu de gozaimasu.', en: 'Thank you for calling. This is ABC Systems, Inc.' },
      why: { jp: '{電話|でんわ}では、{顔|かお}が {見|み}えません。はじめの ひとことで どこの {会社|かいしゃ}か すぐ {分|わ}かると、{相手|あいて}は {安心|あんしん}します。', en: "On the phone nobody can see your face. If your first words tell them which company this is, the caller feels at ease." },
      dont: { jp: '「もしもし」から はじめない。', en: 'Don\'t open a business call with "moshi moshi".' },
      tip: { jp: '{会社|かいしゃ}に よって ちがいます。2コールまでの {会社|かいしゃ}も あります。{電話|でんわ}を あまり {使|つか}わない IT{会社|かいしゃ}も {多|おお}いです。{自分|じぶん}の {会社|かいしゃ}の やり{方|かた}を {聞|き}きましょう。', en: 'Companies differ: some want two rings, and many IT teams rarely use desk phones. Ask how your team does it.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        svg.append(el('path', { d: 'M18 74 L26 52 L62 52 L70 74 Z', fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        svg.append(el('path', { d: 'M16 46 Q44 34 72 46 L72 52 Q44 40 16 52 Z', fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        [1, 2, 3, 4].forEach((n, i) => D.seat(svg, 100 + i * 28, 56, n, { you: n === 3 }));
        svg.append(el('line', { x1: 90, y1: 80, x2: 164, y2: 80, stroke: C.red, 'stroke-width': 3, 'stroke-linecap': 'round' }));
        D.label(svg, 128, 98, 'ここまでに でる', { color: C.red, size: 10 });
        D.label(svg, 100, 130, 'かいしゃで ちがう', { color: '#8a8a8a', size: 9 });
      },
    },
    test: { great: { at: 2000 }, ok: { at: 6000 }, ky: null },
  });

  /* ------------------------------------------------------------------ 1-7 */
  const TOASTS = [
    { app: { jp: 'かぞく', en: 'Family' }, msg: { jp: '{今夜|こんや}の ごはん、{何|なに}に する？', en: 'What do you want for dinner tonight?' } },
    { app: { jp: 'ショッピング', en: 'Online shop' }, msg: { jp: 'ご{注文|ちゅうもん}の {商品|しょうひん}を {発送|はっそう}しました', en: 'Your order has been shipped.' } },
    { app: { jp: 'ゲーム', en: 'Game' }, msg: { jp: 'スタミナが {全回復|ぜんかいふく}しました！', en: 'Your stamina is fully restored!' } },
    { app: { jp: 'かぞく', en: 'Family' }, msg: { jp: '{傘|かさ}、{持|も}っていった？', en: 'Did you take an umbrella?' } },
  ];
  const SPAWN = [1500, 3700, 5900, 8100];
  const AVATAR_X = [59, 139, 219, 299];   /* scene x of the four meeting tiles */

  KY.defineStage({
    id: '1-7',
    chapter: 1,
    title: { jp: '{画面|がめん}{共有|きょうゆう}の わな', en: 'The Screen-Share Trap' },
    intro: { jp: 'オンライン{会議|かいぎ}で、{画面|がめん}を {共有|きょうゆう}して います。', en: 'You are sharing your screen in an online meeting.' },
    time: 14000,
    mechanic: 'action',
    setup(scene) {
      const P = KY.props, { el, g, C } = KY.svg;
      scene.add('bg', P.backdrop({ floor: 560 }));
      const mon = P.monitor({ x: 180, y: 450, w: 336, h: 330 });
      const S = mon.screen;
      /* top bar: the "sharing" sign is ink, not red */
      S.append(el('rect', { x: 0, y: 0, width: mon.sw, height: 24, fill: '#eceff3' }));
      S.append(g({}, [
        el('rect', { x: 8, y: 4, width: 122, height: 17, rx: 8.5, fill: C.ink }),
        el('circle', { cx: 19, cy: 12.5, r: 3.4, fill: '#fff' }),
        KY.svg.text(27, 16, 'きょうゆうちゅう', { 'font-size': 10, 'font-weight': 900, fill: '#fff' }),
      ]));
      S.append(el('rect', { x: 256, y: 4, width: 62, height: 17, rx: 8.5, fill: '#fff', stroke: '#c9c9c9', 'stroke-width': 1.5 }));
      S.append(KY.svg.text(287, 16, 'おわる', { 'font-size': 10, 'font-weight': 700, fill: '#8a8a8a', 'text-anchor': 'middle' }));
      /* the other people in the meeting */
      const tones = ['#8f8f8f', '#a8a8a8', '#7a7a7a', '#9a9a9a'];
      tones.forEach((col, i) => {
        const tx = 6 + i * 80, cx = tx + 37, cy = 66;
        S.append(el('rect', { x: tx, y: 30, width: 74, height: 62, rx: 6, fill: '#f3f3f0', stroke: '#dcdcd6', 'stroke-width': 1.5 }));
        S.append(el('circle', { cx, cy: cy - 9, r: 9, fill: col }));
        S.append(el('path', { d: `M${cx - 18} ${cy + 22} Q${cx - 18} ${cy + 3} ${cx} ${cy + 3} Q${cx + 18} ${cy + 3} ${cx + 18} ${cy + 22} Z`, fill: col }));
      });
      /* your shared screen: a document with a table and a chart */
      S.append(el('rect', { x: 6, y: 106, width: 316, height: 210, rx: 4, fill: '#fff', stroke: '#c9c9c9', 'stroke-width': 1.5 }));
      S.append(el('rect', { x: 6, y: 106, width: 316, height: 13, rx: 4, fill: '#e9edf2' }));
      S.append(el('rect', { x: 20, y: 132, width: 120, height: 8, rx: 4, fill: '#555' }));
      [150, 164, 178].forEach((y, i) => S.append(el('rect', { x: 20, y, width: 150 - i * 20, height: 5, rx: 2.5, fill: '#d5d5d5' })));
      [0, 1, 2, 3, 4].forEach(i => S.append(el('rect', { x: 196 + i * 22, y: 218 - [38, 62, 46, 80, 58][i], width: 14, height: [38, 62, 46, 80, 58][i], fill: '#a9bcd8' })));
      S.append(el('line', { x1: 188, y1: 218, x2: 310, y2: 218, stroke: '#9a9a9a', 'stroke-width': 1.5 }));
      [236, 250, 264, 278, 292].forEach(y => S.append(el('line', { x1: 20, y1: y, x2: 170, y2: y, stroke: '#ececec', 'stroke-width': 2 })));
      scene.add('mid', mon);
      scene.label(180, 98, { jp: 'オンライン{会議|かいぎ}', en: 'Online meeting' }, 'deadline');
      scene.label(180, 500, { jp: 'あなたの {画面|がめん}が、みんなに {見|み}えて います', en: 'Everyone can see your screen' });
      return {};
    },
    params: {
      start(scene, r) {
        const doc = root.document;
        const state = TOASTS.map(() => ({ node: null, shown: false, gone: false, slot: -1 }));
        const slots = [false, false, false];
        let missed = 0, resolved = 0, done = false;

        const finish = () => {
          if (done) return;
          done = true;
          scene.end(missed === 0 ? 'great' : missed === 1 ? 'ok' : 'ky');
        };
        const resolve = () => { resolved++; if (resolved >= TOASTS.length) scene.after(500, finish); };
        const drop = i => {
          const st = state[i];
          if (st.gone) return false;
          st.gone = true;
          if (st.slot >= 0) slots[st.slot] = false;
          return true;
        };

        function spawn(i) {
          const st = state[i], tt = TOASTS[i];
          st.slot = slots.findIndex(x => !x);
          if (st.slot < 0) st.slot = 0;
          slots[st.slot] = true;
          const n = doc.createElement('div');
          n.tabIndex = 0;
          n.setAttribute('role', 'button');
          n.setAttribute('aria-label', 'Private notification (tap to dismiss)');
          n.style.cssText = `right:7%;bottom:${(32.5 + st.slot * 11).toFixed(1)}%;width:66%;background:#fff;border:.7cqw solid var(--red);border-radius:2.6cqw;padding:1.4cqw 2.6cqw 1.6cqw;box-shadow:0 1cqw 0 var(--red-soft);pointer-events:auto;cursor:pointer;touch-action:none;font-size:3.6cqw;font-weight:700;line-height:1.35;opacity:0;`;
          n.innerHTML = `<div style="font-size:2.6cqw;color:var(--ink-3);font-weight:700">${KY.text.html(tt.app, { gloss: false, follow: true })}</div>${KY.text.html(tt.msg, { gloss: false, follow: true })}`;
          scene.overlay.append(n);
          st.node = n;
          KY.sfx.play('pop');
          const dismiss = e => {
            if (e) e.preventDefault();
            if (scene.locked || st.gone) return;
            const wasShown = st.shown;
            if (!drop(i)) return;
            KY.sfx.play('tap');
            if (st.cancel) st.cancel();
            n.remove();
            if (!wasShown) resolve();
          };
          st.dismiss = dismiss;
          n.addEventListener('pointerdown', dismiss);
          n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') dismiss(e); });
          /* slides in from the bottom-right; fully visible after 1.2 s */
          st.cancel = scene.tween({
            from: 0, to: 1, dur: 1200, ease: 'linear',
            step: v => { n.style.opacity = v.toFixed(3); n.style.transform = `translate(${((1 - v) * 38).toFixed(1)}%, ${((1 - v) * 22).toFixed(1)}%)`; },
            done: () => {
              st.shown = true;
              missed++;
              resolve();
              scene.after(1300, () => { if (drop(i)) n.remove(); });
            },
          });
        }

        SPAWN.forEach((ms, i) => scene.at(ms, () => spawn(i)));
        scene.timer(14000, finish);
        scene._share = { dismiss: i => { const st = state[i]; if (st && st.dismiss) st.dismiss(); } };
      },
      /* input: { missed: n } — the first n notifications are left alone, the rest are dismissed at once */
      simulate(scene, r, input) {
        const n = (input && input.missed) || 0;
        SPAWN.forEach((ms, i) => { if (i >= n) scene.at(ms + 400, () => scene._share.dismiss(i)); });
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.colleague, line: { jp: '（{通知|つうち}ゼロ…できる{人|ひと}だ…！）', en: '(Zero notifications... what a pro!)' },
        react(scene) { [1, 3].forEach(i => markAt(scene, 16 + AVATAR_X[i] - 43 + 43, 181, 'sparkle', 0.7)); } },
      ok: { grade: 'ok', who: WHO.colleague, line: { jp: '（…さっきの{通知|つうち}、{見|み}なかったことにしよう）', en: "(...Let's pretend I didn't see that notification.)" },
        react(scene) { markAt(scene, 16 + AVATAR_X[2], 181, 'q', 0.7); markAt(scene, 16 + AVATAR_X[0], 181, 'sweat', 0.7); } },
      ky: { grade: 'ky', who: WHO.colleague, line: { jp: '（{見|み}えちゃった…）', en: '(I saw that...)' },
        react(scene) { [0, 1, 2, 3].forEach(i => markAt(scene, 16 + AVATAR_X[i], 181, i % 2 ? 'sweat2' : 'shock', 0.7)); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{画面|がめん}{共有|きょうゆう}の まえに', en: 'Before you share your screen' },
      points: [
        { jp: '{共有|きょうゆう}する まえに、{通知|つうち}を オフに します。', en: 'Turn notifications off (Do Not Disturb) before you share.' },
        { jp: '{画面|がめん}ぜんぶでは なく、ひとつの ウィンドウだけ {共有|きょうゆう}すると あんぜんです。', en: 'Share one window, not the whole screen.' },
        { jp: 'ほかの アプリや メールは、{見|み}えない ように します。', en: 'Close private apps and mail so they cannot be seen.' },
      ],
      phrase: { jp: '{画面|がめん}、{見|み}えていますか？', ro: 'Gamen, miete imasu ka?', en: 'Can you see my screen?' },
      why: { jp: '{画面|がめん}の {通知|つうち}は、みんなに {見|み}えます。{会社|かいしゃ}の {人|ひと}や お{客様|きゃくさま}に、{家族|かぞく}の ことや {買|か}い{物|もの}が {見|み}えて しまいます。', en: 'Notifications show up for everyone. Colleagues and clients can end up seeing your family chats or shopping.' },
      dont: { jp: '{通知|つうち}を オンの まま {共有|きょうゆう}しない。', en: "Don't share your screen with notifications still on." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.rect(svg, 22, 14, 156, 94, { r: 6 });
        svg.append(el('rect', { x: 32, y: 22, width: 84, height: 15, rx: 7.5, fill: C.ink }));
        svg.append(el('circle', { cx: 42, cy: 29.5, r: 3, fill: '#fff' }));
        D.label(svg, 80, 33, 'きょうゆうちゅう', { size: 7.5, color: '#fff' });
        svg.append(el('path', { d: 'M100 118 Q100 98 118 98 Q136 98 136 118 L142 126 L94 126 Z', fill: '#fff', stroke: '#8a8a8a', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
        svg.append(el('circle', { cx: 118, cy: 132, r: 4, fill: '#8a8a8a' }));
        svg.append(el('line', { x1: 86, y1: 138, x2: 150, y2: 94, stroke: C.red, 'stroke-width': 4.5, 'stroke-linecap': 'round' }));
        D.label(svg, 168, 138, 'つうち オフ', { size: 10, color: C.red, anchor: 'middle' });
      },
    },
    test: { great: { missed: 0 }, ok: { missed: 1 }, ky: { missed: 2 } },
  });

  /* ------------------------------------------------------------------ 1-8 */
  /* Only the boss and the exit are clickable. Both targets show red outlines. */
  KY.defineStage({
    id: '1-8', chapter: 1,
    title: {jp:'18:00！ {帰|かえ}ろう',en:'6:00 p.m. Time to go home'},
    intro: {jp:'18:00。パソコンに「{作業完了|さぎょうかんりょう}！」と {出|で}ました。{赤|あか}い {人|ひと}は {新人|しんじん}です。「{上司|じょうし}」か「{出口|でぐち}」を クリックすると、そこへ {歩|ある}きます。{報告|ほうこく}してから {帰|かえ}ろう！',en:'6:00 p.m. Work is done! Click only the boss or the exit to walk there. Report your work before you leave.'},
    time: 20000, mechanic: 'action',
    setup(s) {
      const P=KY.props,{el}=KY.svg;
      s.add('bg',P.backdrop({floor:470}));
      s.add('bg',P.door({x:30,floor:470,w:55,h:145,open:.8}));
      s.add('mid',P.table({x:190,y:420,w:95}));
      const m=P.monitor({x:185,y:410,w:94,h:62});
      m.screen.append(el('rect',{x:0,y:0,width:m.sw,height:m.sh,fill:'#e0ffe9'}));
      s.add('mid',m);
      s.label(185,328,{jp:'{作業完了|さぎょうかんりょう}！',en:'WORK DONE!'});
      s.add('bg',P.clock({x:275,y:222,r:24,h:6,m:0}));
      s.label(275,183,{jp:'18:00',en:'18:00'});
      const boss=s.person({x:280,y:470,pose:'sit',facing:-1,tag:{jp:'{上司|じょうし}',en:'Boss'}});
      const me=s.person({x:130,y:470,color:'player',player:true});
      s.label(130,350,{jp:'{新人|しんじん}',en:'New hire'});
      // Short prompts above the two interactive areas.
      s.label(46,300,{jp:'② {出口|でぐち}へ',en:'② Exit'});
      s.label(290,300,{jp:'① {上司|じょうし}に {報告|ほうこく}',en:'① Talk to boss'});
      return {boss,me};
    },
    params: {
      start(s,r) {
        let reported=false,done=false,busy=false;
        const travel=(x,cb)=>s.walk(r.me,x,Math.max(300,Math.abs(r.me.o.x-x)*10),cb);
        const speak=()=>{
          if(done||busy||reported)return;
          busy=true;
          travel(224,()=>{
            busy=false;reported=true;
            bossTarget.setAttribute('stroke','#9b9b9b');bossTarget.setAttribute('stroke-dasharray','3 8');
            s.say(r.me,{jp:'{今日|きょう}の {仕事|しごと}は {全部|ぜんぶ} おわりました。お{先|さき}に {失礼|しつれい}します。',en:'All my work is done. Excuse me for leaving first.'},{dur:1700,cls:'mine'});
            s.after(900,()=>s.say(r.boss,{jp:'お{疲|つか}れさま！',en:'Good work!'},{dur:900}));
          });
        };
        const exit=()=>{
          if(done||busy)return;
          done=true;
          travel(36,()=>{
            r.me.set({hidden:true});
            if(!reported)s.say(r.boss,{jp:'あれ？ {新人|しんじん}くん、どこに いった？',en:'Huh? Where did our new hire go?'},{dur:1350});
            s.after(1500,()=>s.end(reported?'great':'sneak'));
          });
        };
        s._exit={speak,exit};
        const addTarget=(x,y,w,h,fn,name)=>{
          const box=KY.mini.hit(s,x,y,w,h,fn);
          box.setAttribute('rx','11');
          box.setAttribute('fill','#e60012');
          box.setAttribute('fill-opacity','0.06');
          box.setAttribute('stroke','#e60012');
          box.setAttribute('stroke-width','3.5');
          box.setAttribute('stroke-dasharray','8 5');
          box.classList.add('action-target');
          box.setAttribute('aria-label',name);
          return box;
        };
        const bossTarget=addTarget(244,332,100,151,speak,'上司に報告する');
        addTarget(5,329,65,155,exit,'出口へ行く');
        // No background click handler: only the two marked areas can move the character.
        s.timer(s.def.time,()=>{
          if(done)return;
          done=true;
          s.say(r.me,{jp:'あれ、みんな {帰|かえ}っちゃった！',en:'Oh no, everybody has gone!'},{dur:1300});
          s.end('alone');
        });
      },
      simulate(s,r,v) {
        s.at(450,()=>{if(v==='great')s._exit.speak();});
        s.at(v==='great'?3400:1400,()=>s._exit.exit());
      }
    },
    outcomes: {
      great:{grade:'great',line:{jp:'{報告|ほうこく}も あいさつも OK！',en:'You reported and said goodbye!'}},
      sneak:{grade:'ky',line:{jp:'「あれ、{新人|しんじん}くん どこに いった？」',en:'“Where did the new hire go?”'}},
      alone:{grade:'ky',line:{jp:'まわりを {気|き}にしていたら、{一人|ひとり}だけ のこっちゃった！',en:'Everyone left while you were waiting!'}}
    },
    card:{badge:'must',name:{jp:'仕事が終わったら報告',en:'Report before going home'},points:[{jp:'{仕事|しごと}が おわったら、{必要|ひつよう}な {報告|ほうこく}を してから {帰|かえ}りましょう。',en:'When the work is done, report what you finished before going home.'}],phrase:{jp:'{今日|きょう}の {仕事|しごと}は {全部|ぜんぶ} おわりました。お{先|さき}に {失礼|しつれい}します。',en:'All my work is done. Excuse me for leaving first.'}},
    test:{great:'great',ky:'sneak'}
  });

  /* ------------------------------------------------------------------ 1-9 */
  KY.defineStage({
    id:'1-9',chapter:1,
    title:{jp:'{電車|でんしゃ}が {止|と}まった！',en:'The train has stopped!'},
    intro:{jp:'いま 8:40。{会社|かいしゃ}は 9:00からです。でも、{駅|えき}で {電車|でんしゃ}が {止|と}まって います。{時間|じかん}が どんどん {進|すす}みます。どうする？',en:'It is 8:40. Work starts at 9:00, but the train is stopped at the station. Time keeps passing. What will you do?'},
    time:18000,mechanic:'action',
    setup(s) {
      const P=KY.props,{el}=KY.svg;
      s.add('bg',P.backdrop({floor:470,tint:'#eaf2f9'}));
      s.add('bg',el('rect',{x:15,y:205,width:320,height:216,rx:12,fill:'#f7f9fa',stroke:'#8da4b7','stroke-width':3}));
      s.add('bg',el('rect',{x:25,y:230,width:300,height:60,rx:4,fill:'#b5d8e9'}));
      s.add('bg',el('rect',{x:25,y:299,width:300,height:18,fill:'#517cb1'}));
      for(let x=35;x<290;x+=58)s.add('bg',el('rect',{x,y:333,width:38,height:47,rx:3,fill:'#d3e7fa',stroke:'#879eaa','stroke-width':2}));
      s.label(180,195,{jp:'{電車|でんしゃ}が {止|と}まっています',en:'Train stopped'});
      s.at(300,()=>s.bubble({x:185,y:136,tail:'down',who:{jp:'{駅|えき}の {放送|ほうそう}',en:'Station announcement'},text:{jp:'{電車|でんしゃ}は {止|と}まって います。しばらく お{待|ま}ち ください。',en:'The train has stopped. Please wait.'},dur:3200}));
      // Digital clock: 08:40 at the start, then one minute every 850 ms.
      const clockPlate=el('rect',{x:16,y:88,width:119,height:74,rx:10,fill:'#202c3e',stroke:'#607d96','stroke-width':3});
      s.add('top',clockPlate);
      const digital=el('text',{x:75,y:136,'text-anchor':'middle','font-size':32,'font-family':'monospace','font-weight':900,fill:'#f8fffd'});
      digital.textContent='08:40';s.add('top',digital);
      const clockCaption=el('text',{x:75,y:103,'text-anchor':'middle','font-size':10,'font-weight':800,fill:'#d6ecff'});
      clockCaption.textContent='いまの時間';s.add('top',clockCaption);
      let shown='08:40';
      s.every((dt,t)=>{
        const m=8*60+40+Math.min(23,Math.floor(t/850));
        const next=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
        if(shown!==next){shown=next;digital.textContent=next;digital.setAttribute('fill',m>=8*60+55?'#ff8585':'#f8fffd');}
      });
      const me=s.person({x:95,y:470,color:'player',player:true});
      const other=s.person({x:280,y:470,color:'npc2'});
      const phone=el('rect',{x:153,y:390,width:40,height:68,rx:6,fill:'#fff',stroke:'#e60012','stroke-width':5});
      phone.style.opacity='0';s.add('top',phone);
      return {me,other,phone,digital};
    },
    params:{
      start(s,r){
        let done=false,opened=false;
        const call=KY.mini.button(s,'{会社|かいしゃ}に {連絡|れんらく}','Contact the office',()=>{
          if(done||opened)return;
          opened=true;call.remove();r.phone.style.opacity='1';
          s.say(r.me,{jp:'どんな {連絡|れんらく}を する？',en:'What should you say?'},{dur:1300,cls:'mine'});
          const options=[
            {id:'short',jp:'{電車|でんしゃ}が {遅|おく}れています。',en:'The train is delayed.'},
            {id:'vague',jp:'{会社|かいしゃ}に {行|い}くのが {遅|おく}れます。',en:'I will arrive late to work.'},
            {id:'great',jp:'{電車|でんしゃ}が {止|と}まっています。9{時|じ}20{分|ぷん}ごろ {会社|かいしゃ}に {着|つ}きそうです。すみません。',en:'The train has stopped. I may arrive around 9:20. I am sorry.'}
          ];
          // Immediately show the message choices after the phone opens.
          KY.mini.choices(s,options,id=>{
            done=true;
            s.say(r.me,{jp:id==='great'?'{電車|でんしゃ}が {止|と}まっています。9{時|じ}20{分|ぷん}ごろ {着|つ}きそうです。':'{会社|かいしゃ}に {連絡|れんらく}しました。',en:'Message sent.'},{dur:1600,cls:'mine'});
            s.after(1500,()=>s.end(id));
          },0);
        });
        s.timer(s.def.time,()=>{if(!done&&!opened){done=true;call.remove();s.end('never');}});
        s._train={start:()=>call.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))};
      },
      simulate(s,r,v){
        if(!v)return;   /* ky: never contact the office */
        s.at(250,()=>s._train.start());
        s.at(900,()=>{
          const btn=[...s.overlay.querySelectorAll('.choice')].find(x=>x.innerHTML.includes(v==='great'?'20':'遅'));
          if(btn)btn.click();
        });
      }
    },
    outcomes:{
      great:{grade:'great',line:{jp:'{理由|りゆう}と {着|つ}く {時間|じかん}が わかって、{会社|かいしゃ}も {安心|あんしん}！',en:'They know the reason and your arrival time!'}},
      short:{grade:'ok',line:{jp:'「それで、{何時|なんじ}に {来|こ}られる？」',en:'“What time will you arrive?”'}},
      vague:{grade:'ok',line:{jp:'「どうして？ {何時|なんじ}に {来|く}る？」',en:'“Why? And when will you arrive?”'}},
      never:{grade:'ky',line:{jp:'{会社|かいしゃ}は あなたを {待|ま}っています。',en:'Your office is waiting for you.'}}
    },
    card:{badge:'must',name:{jp:'遅れるときは早く連絡',en:'Tell the office as soon as possible if late'},points:[{jp:'{電車|でんしゃ}が {止|と}まったら、{会社|かいしゃ}に {早|はや}く {連絡|れんらく}。{理由|りゆう}と {着|つ}く {時間|じかん}を {伝|つた}えよう。',en:'If the train stops, tell the office why you are late and when you will arrive.'}],phrase:{jp:'{電車|でんしゃ}が {止|と}まっています。9{時|じ}20{分|ぷん}ごろ {着|つ}きそうです。',en:'The train has stopped. I should arrive around 9:20.'}},
    test:{great:'great',ok:'short',ky:null}
  });

  /* ------------------------------------------------------------------ 1-10 */
  const MEET_MS = 12000;                                  /* 9:45 → 10:03 */
  const minsAfter9 = t => 45 + (t * 18) / MEET_MS;        /* minutes after 9:00 */
  const ROOM_MS = { great: 3600, early: 2500, tight: 2700, late: 2900 };

  /* switch to a view from above: the meeting room (top view), populated for each outcome */
  function meetingView(scene, r, mode, noPlayer) {
    const P = KY.props, { el } = KY.svg;
    scene.clear();
    scene.camera({ zoom: 1.08, x: 180, y: 290 });
    scene.add('bg', P.roomTop({ x: 30, y: 100, w: 300, h: 360, door: { wall: 'left', at: 30, w: 52 } }));
    scene.add('bg', P.tableTop({ x: 180, y: 270, w: 150, h: 120 }));
    [[145, 192, 'top'], [215, 192, 'top'], [145, 348, 'bottom'], [215, 348, 'bottom'], [272, 270, 'right'], [88, 270, 'left']]
      .forEach(([x, y, b]) => scene.add('bg', P.chairTop({ x, y, back: b })));
    const S = { top1: [145, 194, 180], top2: [215, 194, 180], bot1: [145, 346, 0], bot2: [215, 346, 0], right: [270, 270, 270], left: [90, 270, 90] };
    const seat = (k, color, hidden) => scene.person({ top: true, x: S[k][0], y: S[k][1], dir: S[k][2], color: color || 'npc', hidden: !!hidden });
    const ENTRY = { x: 36, y: 404 };
    const mkPlayer = () => scene.person({ top: true, x: ENTRY.x, y: ENTRY.y, dir: 90, color: 'player', player: true });
    const enter = (p, to, ms, dirEnd, words) => {
      scene.glide(p, to, ms, 'inout', () => p.set({ dir: dirEnd }));
      const b = scene.say(p, words, { dur: 1500, cls: 'mine' });
      follow(scene, b, p, 2);
    };
    const SAY_SHITSUREI = { jp: '{失礼|しつれい}します', en: 'Excuse me.' };
    const SAY_OMATASE = { jp: 'お{待|ま}たせしました', en: 'Sorry to keep you waiting.' };
    const papers = () => [[160, 262], [200, 286]].forEach(([x, y]) => scene.add('mid', el('rect', { x: x - 11, y: y - 7, width: 22, height: 14, rx: 2, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 1.8 })));

    if (mode === 'great') {
      const p = mkPlayer();
      scene.after(100, () => enter(p, { x: S.bot1[0], y: S.bot1[1] }, 1000, 0, SAY_SHITSUREI));
      scene.after(1200, () => scene.add('mid', el('rect', { x: 131, y: 316, width: 30, height: 19, rx: 3, fill: '#f4f6f8', stroke: '#3a3a3a', 'stroke-width': 2.2 })));
      [['bot2', 1300], ['top1', 1700], ['top2', 2100]].forEach(([k, ms]) => {
        const c = seat(k, 'npc', true);
        c.moveTo(ENTRY.x, ENTRY.y);
        scene.after(ms, () => { c.set({ hidden: false, dir: 90 }); scene.glide(c, { x: S[k][0], y: S[k][1] }, 800, 'inout', () => c.set({ dir: S[k][2] })); });
      });
      scene.after(2400, () => scene.caption({ jp: 'みんな そろって、10{時|じ}ちょうどに はじまりました。', en: 'Everyone is here, and the meeting starts at exactly 10:00.' }));
    } else if (mode === 'early') {
      ['top1', 'top2', 'right'].forEach(k => seat(k, 'npc2'));
      papers();
      const p = mkPlayer();
      scene.after(100, () => enter(p, { x: 78, y: 404 }, 600, 90, SAY_SHITSUREI));
      scene.after(800, () => p.mark('sweat'));
      scene.after(1000, () => scene.caption({ jp: 'まだ {前|まえ}の {会議|かいぎ}が つづいて います。', en: 'The previous meeting is still going on.' }));
    } else {
      const keys = mode === 'tight' ? ['top1', 'top2', 'right', 'bot2'] : ['top1', 'top2', 'right', 'left', 'bot2'];
      keys.forEach(k => seat(k, 'npc'));
      if (!noPlayer) {
        const p = mkPlayer();
        scene.after(100, () => enter(p, { x: S.bot1[0], y: S.bot1[1] }, mode === 'tight' ? 700 : 1100, 0, SAY_OMATASE));
        scene.after(900, () => p.mark('sweat2'));
      }
      scene.after(1300, () => scene.caption(mode === 'tight'
        ? { jp: 'ぎりぎり まにあいました。{準備|じゅんび}は これからです。', en: 'You made it just in time. Getting ready only starts now.' }
        : { jp: 'みんなが、あなたを {待|ま}って います。', en: 'Everyone is waiting for you.' }));
    }
  }

  KY.defineStage({
    id: '1-10',
    chapter: 1,
    title: { jp: '10{時|じ}から {会議|かいぎ}', en: 'The 10 O\'Clock Meeting' },
    intro: { jp: '10{時|じ}から {会議|かいぎ}が ある {日|ひ}、あなたは {席|せき}で {仕事|しごと}を して います。', en: 'A meeting starts at 10:00. You are working at your desk.' },
    time: MEET_MS,
    mechanic: 'timing',
    setup(scene) {
      const P = KY.props;
      scene.camera({ zoom: 1.2, x: 176, y: 430 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      const door = P.door({ x: 274, floor: 470, w: 44, h: 140 });
      scene.add('bg', door);
      scene.label(296, 310, { jp: '{会議室|かいぎしつ}', en: 'Meeting room' }, 'deadline');
      scene.label(160, 188, { jp: '{会議|かいぎ} 10:00', en: 'Meeting 10:00' }, 'deadline');
      const clock = P.clock({ x: 160, y: 292, r: 24, h: 9, m: 45 });
      scene.add('bg', clock);
      /* the big digital clock: centred with a CSS transform so its width does not matter */
      const tl = root.document.createElement('div');
      tl.className = 'label deadline';
      tl.style.cssText = 'left:44.7%;top:14%;transform:translate(-50%,-50%);font-size:7cqw;font-weight:900;';
      tl.textContent = '9:45';
      scene.overlay.append(tl);
      let last = -1;
      scene.every((dt, t) => {
        const m = Math.min(63, minsAfter9(t));
        clock.setTime(9 + Math.floor(m / 60), m % 60);
        const mm = Math.floor(m);
        if (mm !== last) { last = mm; tl.innerHTML = KY.text.html({ jp: `${9 + Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}` }, { gloss: false }); }
      });
      scene.add('mid', P.officeChair({ x: 62, facing: 1 }));
      const player = scene.person({ x: 62, y: 470, pose: 'sit', facing: 1, color: 'player', player: true });
      bigHit(player, 72, 132);
      scene.add('mid', P.table({ x: 146, y: 420, w: 100 }));
      scene.add('mid', P.monitor({ x: 132, y: 410, w: 34, h: 28 }));
      typing(scene, player, 0);
      return { player, door };
    },
    params: {
      target: 'player',
      label: 'You (tap to go to the meeting)',
      script: [],
      judge(tapAt) {
        if (tapAt === null) return 'late';
        const m = Math.floor(minsAfter9(tapAt));
        if (m < 53) return 'early';
        if (m <= 57) return 'great';
        if (m <= 60) return 'tight';
        return 'late';
      },
      onTap(scene, r, key) {
        r.player.set({ arms: null, pose: 'stand' });
        scene.walk(r.player, 256, 1400, () => scene.tween({ from: 0, to: 1, dur: 250, step: v => r.door.setOpen(v) }));
        scene.after(1700, () => meetingView(scene, r, key, false));
        return 1700 + ROOM_MS[key];
      },
      onTimeout(scene, r) {
        scene.after(300, () => meetingView(scene, r, 'late', true));
        return 300 + ROOM_MS.late;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.colleague, line: { jp: '{会議|かいぎ}も 5{分前|ふんまえ}{行動|こうどう}！', en: 'Be ready five minutes before the meeting!' } },
      early: { grade: 'ok', who: { jp: '{前|まえ}の{会議|かいぎ}の{人|ひと}', en: 'Previous meeting' }, line: { jp: 'あ、まだ{使|つか}ってます…', en: "Oh, we're still using it..." },
        react(scene) { scene.people.forEach(p => p.mark(p.player ? 'sweat' : 'q')); } },
      tight: { grade: 'ok', who: WHO.colleague, line: { jp: '…ぎりぎりだね。{資料|しりょう}は{開|ひら}いてある？', en: '...Cutting it close. Is the document open?' },
        react(scene) { scene.people.forEach(p => p.mark(p.player ? 'sweat2' : 'dots')); } },
      late: { grade: 'ky', who: WHO.colleague, line: { jp: '（…{全員|ぜんいん}の{時間|じかん}が、{止|と}まっている）', en: "(...Everyone's time is standing still.)" } },
    },
    card: {
      badge: 'must',
      name: { jp: '<<5{分前|ふんまえ}{行動|こうどう}>>', en: 'Be there five minutes early' },
      points: [
        { jp: '<<5{分前|ふんまえ}{行動|こうどう}>>は、5{分|ふん} {前|まえ}までに {場所|ばしょ}に {着|つ}いて、{準備|じゅんび}を して おく ことです。', en: '"Gofun-mae kōdō" means being in place five minutes early, with everything ready.' },
        { jp: '{日本|にほん}では とても よく ある ルールです。{外国|がいこく}の {人|ひと}は びっくり する ことが {多|おお}いです。', en: 'It is a very common rule in Japan, and many foreigners find it surprising.' },
        { jp: '{客先|きゃくさき}に {訪問|ほうもん}する ときは、{受付|うけつけ}へ {約束|やくそく}の 5{分|ふん} {前|まえ}ごろに {行|い}きます（2-1）。', en: 'For a client visit, go to reception about five minutes before the appointment (see 2-1).' },
      ],
      phrase: { jp: '<<{失礼|しつれい}します>>', ro: 'shitsurei shimasu', en: 'Excuse me. (said when you enter the room)' },
      why: { jp: '{日本|にほん}では、{時間|じかん}どおりに はじめる ために、みんなが {少|すこ}し {早|はや}く {集|あつ}まります。{一人|ひとり}が <<{遅|おく}れ>>ると、みんなの {時間|じかん}が {止|と}まって しまいます。', en: "In Japan everyone gathers a little early so that things start exactly on time. One late person stops everyone's time." },
      dont: { jp: 'ぎりぎりに {着|つ}かない。{部屋|へや}を まだ {使|つか}って いる ときは、{外|そと}で {待|ま}ちます。', en: "Don't arrive at the last second. If the room is still in use, wait outside." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        svg.append(el('circle', { cx: 56, cy: 62, r: 28, fill: '#fff', stroke: C.ink, 'stroke-width': 3 }));
        svg.append(el('path', { d: 'M56 62 L56 40 L42.5 43.5 Z', fill: C.redSoft, stroke: C.red, 'stroke-width': 2 }));
        svg.append(el('path', { d: 'M56 62 L56 40 M56 62 L68 70', stroke: C.ink, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }));
        svg.append(el('circle', { cx: 56, cy: 62, r: 2.5, fill: C.ink }));
        D.label(svg, 56, 108, 'ごふん まえ', { color: C.red, size: 10 });
        D.arrow(svg, 92, 62, 118, 62, { color: C.red });
        D.rect(svg, 122, 82, 62, 6, { r: 3 });
        D.person(svg, { x: 142, y: 112, s: 0.55, pose: 'sit', facing: 1, color: 'player' });
        D.label(svg, 150, 136, 'じゅんび OK', { color: C.red, size: 9 });
      },
    },
    test: { great: { at: 7000 }, ok: { at: 2000 }, ky: null },
  });
})(typeof window !== 'undefined' ? window : globalThis);
