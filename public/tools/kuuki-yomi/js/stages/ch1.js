/* Chapter 1 — Morning at the Office (朝のオフィス) */
(function (root) {
  const KY = root.KY;

  /* dictionary words used in this chapter (popup 辞書) */
  KY.addGlossary({
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
        const b = scene.say(r.player, { jp: 'おはようございます！', en: 'Good morning!' }, { dur: 2300, cls: 'mine' });
        follow(scene, b, r.player);
        if (key === 'great') scene.after(700, () => scene.say(r.c1, { jp: 'おはようございます！', en: 'Good morning!' }, { dur: 1500, lift: 30 }));
        return key === 'great' ? 1800 : 1300;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.senior, line: { jp: 'おはようございます！{朝|あさ}の{空気|くうき}が、ちょっと{明|あか}るくなったね。', en: 'Good morning! The morning air just got a little brighter.' } },
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
        { jp: '{席|せき}に {座|すわ}って から では なく、{歩|ある}きながら、{会|あ}った {人|ひと}に {言|い}います。', en: 'Say it as you walk in and meet people, not after you sit down.' },
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
    test: { great: { at: 2500 }, ok: { at: 7000 }, ky: null },
  });

  /* ------------------------------------------------------------------ 1-2 */
  /* both of you walk down the hallway toward each other; tap yourself to greet at the right distance */
  const NEAR = 130, PASSING = 30;   // gap in scene units: about 2–3 m before passing = the right moment

  KY.defineStage({
    id: '1-2',
    chapter: 1,
    title: { jp: '{廊下|ろうか}で {社長|しゃちょう}', en: 'The CEO in the Hallway' },
    intro: { jp: '{廊下|ろうか}を {歩|ある}いて います。むこうから {社長|しゃちょう}が {歩|ある}いて きます。', en: 'You are walking down the hallway. The company president is walking toward you.' },
    time: 9500,
    mechanic: 'timing',
    setup(scene) {
      const P = KY.props;
      scene.camera({ zoom: 1.3, x: 180, y: 470 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.door({ x: 56, floor: 470, w: 48, h: 142 }));
      scene.add('bg', P.door({ x: 256, floor: 470, w: 48, h: 142 }));
      scene.add('bg', P.clock({ x: 180, y: 300, r: 19, h: 3, m: 40 }));
      const ceo = scene.person({ x: 350, y: 536, facing: -1, tag: WHO.ceo });
      const player = scene.person({ x: 44, y: 552, facing: 1, color: 'player', player: true });
      bigHit(player, 72, 132);
      return { player, ceo };
    },
    params: {
      target: 'player',
      label: 'You (tap to greet)',
      script: [
        [0, (s, r) => {
          r.cancelWalk = s.walk(r.player, 300, 11000);
          r.cancelCeo = s.walk(r.ceo, -60, 8600);
          s.every(() => {
            const gap = r.ceo.o.x - r.player.o.x;
            if (gap <= NEAR && s.flags.near === undefined) s.flag('near');
            if (gap <= PASSING && s.flags.passing === undefined) s.flag('passing');
          });
        }],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'pass';
        if (flags.near === undefined) return 'early';
        return flags.passing === undefined ? 'great' : 'late';
      },
      onTap(scene, r, key) {
        /* a light greeting while passing: a short stop, "otsukaresama desu" and a 15° nod — no stepping aside */
        if (r.cancelWalk) r.cancelWalk();
        r.player.set({ pose: 'stand', walk: 0 });
        const b = scene.say(r.player, { jp: 'お{疲|つか}れ{様|さま}です', en: 'Thank you for your hard work.' }, { dur: 1800, cls: 'mine' });
        follow(scene, b, r.player);
        scene.tween({ from: 0, to: 15, dur: 260, ease: 'out', step: v => r.player.set({ bow: v }) });
        scene.after(700, () => scene.tween({ from: 15, to: 0, dur: 300, ease: 'inout', step: v => r.player.set({ bow: v }) }));
        if (key === 'great') {
          /* the president nods back (his words come in the result) */
          scene.after(120, () => { if (r.cancelCeo) r.cancelCeo(); r.ceo.set({ pose: 'stand', walk: 0 }); });
          scene.after(420, () => scene.tween({ from: 0, to: 10, dur: 260, ease: 'out', step: v => r.ceo.set({ bow: v }) }));
        }
        return 1500;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.ceo, line: { jp: 'お{疲|つか}れ{様|さま}。（さわやかな あいさつだな）', en: 'Good work. (What a fresh, pleasant greeting.)' },
        react(scene, r) { r.ceo.set({ bow: 0 }); r.ceo.mark('sparkle'); } },
      early: { grade: 'ok', who: WHO.ceo, line: { jp: '（…{遠|とお}くで {何|なに}か {言|い}った？）', en: '(...Did someone say something, far away?)' },
        react(scene, r) { r.ceo.mark('q'); } },
      late: { grade: 'ok', who: WHO.ceo, line: { jp: '（…{今|いま}、{後|うし}ろで {何|なに}か {言|い}った？）', en: '(...Did someone just say something behind me?)' },
        react(scene, r) { r.ceo.mark('q'); } },
      pass: { grade: 'ky', who: WHO.ceo, line: { jp: '…（{今|いま}、{目|め}が{合|あ}った{気|き}が…）', en: '...(I think our eyes just met...)' },
        react(scene, r) { if (r.cancelCeo) r.cancelCeo(); r.ceo.set({ pose: 'stand', walk: 0, facing: 1 }); r.ceo.mark('q'); r.player.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: '{廊下|ろうか}で {会釈|えしゃく}', en: 'Greeting the president in the hallway' },
      points: [
        { jp: 'すれちがう {少|すこ}し {前|まえ}に、{自分|じぶん}から「<<お{疲|つか}れ{様|さま}です>>」と {言|い}います。', en: 'Just before you pass each other, greet first: "otsukaresama desu".' },
        { jp: '{頭|あたま}は 15°ぐらい {下|さ}げます（<<{会釈|えしゃく}>>）。{深|ふか}い おじぎは いりません。', en: 'Bow about 15° (eshaku). A deep bow is not needed.' },
        { jp: '{社内|しゃない}の {廊下|ろうか}なら、{道|みち}を あけたり、ずっと {止|と}まったり しなくて {大丈夫|だいじょうぶ}です。', en: 'In your own office hallway, you do not need to step aside or stand still for long.' },
      ],
      phrase: { jp: '<<お{疲|つか}れ{様|さま}です>>', ro: 'otsukaresama desu', en: 'Thank you for your hard work. (a common greeting between colleagues)' },
      why: { jp: '{廊下|ろうか}で {会|あ}う たびに {大|おお}きな あいさつを すると、おたがいに {大変|たいへん}です。かるい {会釈|えしゃく}と ひとことで、{気持|きも}ちは {伝|つた}わります。', en: 'Big greetings every time you meet in the hallway are tiring for both sides. A light nod and a word are enough.' },
      dont: { jp: '{何|なに}も {言|い}わずに {通|とお}りすぎない。{深|ふか}すぎる おじぎも しない。', en: "Don't walk past without a word, and don't bow too deeply." },
      tip: { jp: '{会社|かいしゃ}に よっては、{社長|しゃちょう}や お{客様|きゃくさま}には {立|た}ち{止|と}まって あいさつする ところも あります。まわりの {人|ひと}を {見|み}て まねしましょう。', en: 'Some companies expect you to stop and greet the president or guests. Watch your colleagues and follow them.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 132);
        D.person(svg, { x: 64, y: 132, s: 0.72, bow: 15, color: 'player' });
        D.person(svg, { x: 150, y: 132, s: 0.72, facing: -1, pose: 'walk', walk: 0.8 });
        D.label(svg, 76, 50, '15°', { color: C.red, size: 14 });
        D.label(svg, 150, 34, 'しゃちょう', { color: '#666', size: 10 });
        dBubble(svg, 12, 8, 112, 24, 'おつかれさまです', C.red, 10);
        D.arrow(svg, 128, 112, 110, 112, { color: '#9a9a9a' });
      },
    },
    test: { great: { at: 3300 }, ok: { at: 800 }, ky: null },
  });

  /* ------------------------------------------------------------------ 1-3 */
  KY.defineStage({
    id: '1-3',
    chapter: 1,
    title: { jp: '{役職|やくしょく}ピラミッド', en: "Who's the Boss?" },
    intro: { jp: '{会社|かいしゃ}に {入|はい}って {初|はじ}めての {日|ひ}。{先輩|せんぱい}が、よくある {日本|にほん}の {会社|かいしゃ}の {役職|やくしょく}を {教|おし}えてくれます。', en: 'Your first day. A senior colleague explains the job titles at a typical Japanese company.' },
    time: 25000,
    mechanic: 'order',
    setup(scene) {
      const { el, C } = KY.svg;
      scene.add('bg', el('rect', { x: 34, y: 104, width: 292, height: 330, rx: 10, fill: '#fbfbfa', stroke: '#cfcfcf', 'stroke-width': 3 }));
      scene.add('bg', el('path', { d: 'M180 120 L304 420 L56 420 Z', fill: '#f2f2f0', stroke: '#e2e2e2', 'stroke-width': 2 }));
      scene.add('bg', el('line', { x1: 34, y1: 470, x2: 326, y2: 470, stroke: C.faint, 'stroke-width': 2 }));
      scene.label(62, 150, { jp: '{上|うえ}', en: 'top' });
      scene.label(62, 390, { jp: '{下|した}', en: 'bottom' });
      return {};
    },
    params: {
      script: [
        [200, s => s.bubble({ x: 180, y: 70, tail: 'none', who: WHO.senior, text: { jp: '{役職|やくしょく}を {上|うえ}から {並|なら}べてみて。', en: 'Try putting the job titles in order, from the top.' } })],
      ],
      cards: [
        { id: 'shacho', text: { jp: '{社長|しゃちょう}', en: 'President' } },
        { id: 'bucho', text: { jp: '{部長|ぶちょう}', en: 'Dept. Manager' } },
        { id: 'kacho', text: { jp: '{課長|かちょう}', en: 'Section Manager' } },
        { id: 'kakaricho', text: { jp: '{係長|かかりちょう}', en: 'Assistant Manager' } },
        { id: 'shunin', text: { jp: '{主任|しゅにん}', en: 'Chief' } },
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
    id: '1-4',
    chapter: 1,
    title: { jp: '{朝礼|ちょうれい}の「{順調|じゅんちょう}です」', en: '"All Good" at the Morning Meeting' },
    intro: { jp: '{朝礼|ちょうれい}の {時間|じかん}です。あなたの タスクは {予定|よてい}より <<{遅|おく}れ>>て います。', en: 'The morning meeting is starting. Your task is behind schedule.' },
    time: 15000,
    mechanic: 'choice',
    setup(scene) {
      const P = KY.props, { el, g, C } = KY.svg;
      scene.camera({ zoom: 1.15, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      /* your monitor: the task bar is shorter than where "today" is, and there is a warning sign */
      const mon = P.monitor({ x: 180, y: 292, w: 204, h: 126 });
      mon.screen.append(
        el('rect', { x: 0, y: 0, width: mon.sw, height: 14, fill: '#dfe5ec' }),
        el('rect', { x: 10, y: 28, width: 30, height: 6, rx: 3, fill: '#c9c9c9' }),
        el('rect', { x: 50, y: 25, width: 110, height: 12, rx: 6, fill: '#e6e6e6' }),
        el('rect', { x: 50, y: 25, width: 44, height: 12, rx: 6, fill: '#8f8f8f' }),
        el('rect', { x: 10, y: 52, width: 24, height: 6, rx: 3, fill: '#d6d6d6' }),
        el('rect', { x: 50, y: 49, width: 90, height: 12, rx: 6, fill: '#e6e6e6' }),
        el('rect', { x: 50, y: 49, width: 74, height: 12, rx: 6, fill: '#b9c5d8' }),
        el('line', { x1: 118, y1: 18, x2: 118, y2: 76, stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '4 3' }),
        g({ transform: 'translate(150 82)' }, [
          el('path', { d: 'M0 -22 L22 16 L-22 16 Z', fill: '#fff', stroke: C.ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
          el('line', { x1: 0, y1: -8, x2: 0, y2: 4, stroke: C.ink, 'stroke-width': 4, 'stroke-linecap': 'round' }),
          el('circle', { cx: 0, cy: 10, r: 2.4, fill: C.ink }),
        ]),
      );
      scene.add('bg', mon);
      scene.label(180, 142, { jp: 'あなたの タスク', en: 'Your task' }, 'deadline');
      const player = scene.person({ x: 80, y: 470, facing: 1, color: 'player', player: true });
      const t1 = scene.person({ x: 142, y: 470, facing: 1, color: 'npc2' });
      const t2 = scene.person({ x: 222, y: 470, facing: -1, color: 'npc2' });
      const leader = scene.person({ x: 288, y: 470, facing: -1, tag: WHO.leader });
      return { player, t1, t2, leader, mon };
    },
    params: {
      script: [
        [300, (s, r) => s.say(r.leader, { jp: '{進捗|しんちょく}は どう？', en: "How's your progress?" }, { dur: 3200, lift: 24 })],
        [1500, (s, r) => r.player.mark('sweat')],
      ],
      showAt: 2000,
      options: [
        { id: 'honest', text: { jp: '{実|じつ}は{遅|おく}れています。{理由|りゆう}と{対策|たいさく}をご{相談|そうだん}させてください', en: "Actually, I'm behind. May I discuss the reason and a plan with you?" }, outcome: 'great' },
        { id: 'fine', text: { jp: '{順調|じゅんちょう}です！', en: "It's going well!" }, outcome: 'fire' },
        { id: 'maybe', text: { jp: 'たぶん{大丈夫|だいじょうぶ}だと{思|おも}います…', en: "I think it'll probably be fine..." }, outcome: 'vague' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        scene.say(r.player, opt.text, { dur: 3000, cls: 'mine' });
        return opt.id === 'honest' ? 3100 : 2100;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.leader, line: { jp: 'ありがとう！それが、いちばん{助|たす}かる{報告|ほうこく}だよ。', en: "Thanks! That's the most helpful kind of report." } },
      fire: { grade: 'ky', who: null, line: { jp: '（{翌週|よくしゅう}、すべてが{燃|も}えていた…）', en: '(The next week, everything was on fire...)' },
        react(scene, r) {
          [[104, 182, 0.95], [180, 176, 0.5], [256, 182, 1.0]].forEach(([x, y, s], i) => {
            const f = flame(x, y, 0.01);
            scene.add('fg', f);
            scene.after(i * 140, () => scene.tween({ from: 0.01, to: s, dur: 520, ease: 'back', step: k => KY.svg.set(f, { transform: `translate(${x} ${y}) scale(${k})` }) }));
          });
          r.player.mark('sweat2'); r.t1.mark('shock'); r.t2.mark('shock'); r.leader.mark('anger');
        } },
      vague: { grade: 'ok', who: WHO.leader, line: { jp: 'たぶん…？{具体的|ぐたいてき}には、いつ{終|お}わりそう？', en: 'Probably...? When exactly do you think it will be done?' },
        react(scene, r) { r.leader.mark('q'); r.player.mark('sweat2'); } },
      silent: { grade: 'ky', who: WHO.leader, line: { jp: '…あの、{進捗|しんちょく}は？', en: "...Um, how's your progress?" },
        react(scene, r) { r.leader.mark('q'); r.t1.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{悪|わる}い {知|し}らせは {早|はや}く {伝|つた}える', en: 'Share bad news early' },
      points: [
        { jp: '{報連相|ほうれんそう}は {仕事|しごと}の {基本|きほん}です。{報告|ほうこく}・{連絡|れんらく}・{相談|そうだん}を {早|はや}めに します。', en: 'Hō-ren-sō (report, inform, consult) is the basis of work. Do it early.' },
        { jp: '<<{遅|おく}れ>>や {問題|もんだい}は、{早|はや}く {言|い}います。{後|あと}で {言|い}うほど、{直|なお}すのが たいへんです。', en: 'Say so early when you are behind or have a problem. The later you say it, the harder it is to fix.' },
        { jp: '{理由|りゆう}、これからの {見通|みとお}し、{対策|たいさく}を いっしょに {話|はな}します。', en: 'Give the reason, the outlook and a plan together.' },
      ],
      phrase: { jp: '{実|じつ}は{遅|おく}れています。ご{相談|そうだん}させてください', ro: 'Jitsu wa okurete imasu. Go-sōdan sasete kudasai.', en: "Actually, I'm behind. May I ask your advice?" },
      why: { jp: '{仕事|しごと}は チームで します。あなたの <<{遅|おく}れ>>は、ほかの {人|ひと}の {予定|よてい}にも {関係|かんけい}します。{早|はや}く {知|し}れば、みんなで {手伝|てつだ}えます。', en: "Work is a team effort. Your delay affects other people's plans too. If they know early, everyone can help." },
      dont: { jp: '{本当|ほんとう}は <<{遅|おく}れ>>て いるのに、「{順調|じゅんちょう}です」と {言|い}わない。', en: "Don't say \"it's going well\" when you are really behind." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.label(svg, 100, 18, 'もんだいの おおきさ', { color: C.ink, size: 10 });
        svg.append(el('circle', { cx: 56, cy: 86, r: 13, fill: '#d7d7d7', stroke: C.ink, 'stroke-width': 2.5 }));
        svg.append(el('circle', { cx: 146, cy: 76, r: 34, fill: '#3a3a3a' }));
        D.arrow(svg, 80, 86, 106, 86, { color: '#9a9a9a' });
        D.label(svg, 56, 124, 'はやく いう', { color: C.red, size: 10 });
        D.label(svg, 146, 124, 'あとで いう', { color: '#666', size: 10 });
        D.label(svg, 56, 144, 'ちいさい', { color: C.red, size: 9 });
        D.label(svg, 146, 144, 'おおきい', { color: '#666', size: 9 });
      },
    },
    test: { great: 'honest', ok: 'maybe', ky: 'fine' },
  });

  /* ------------------------------------------------------------------ 1-5 */
  KY.defineStage({
    id: '1-5',
    chapter: 1,
    title: { jp: 'チャットの {書|か}き{出|だ}し', en: 'Chat Openers' },
    intro: { jp: '{会社|かいしゃ}の チャットで、{上司|じょうし}に {相談|そうだん}したい ことが あります。', en: 'You want to consult your boss on the company chat.' },
    time: 15000,
    mechanic: 'choice',
    setup(scene) {
      const P = KY.props, { el, C } = KY.svg;
      scene.camera({ zoom: 1.3, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('mid', P.officeChair({ x: 72, facing: 1 }));
      const player = scene.person({ x: 72, y: 470, pose: 'sit', facing: 1, color: 'player', player: true });
      scene.add('mid', P.table({ x: 206, y: 420, w: 200 }));
      /* the chat window on the monitor (drawn at 156x114, scaled up to fill the screen) */
      const mon = P.monitor({ x: 212, y: 410, w: 184, h: 140 });
      const chat = KY.svg.g({ transform: `scale(${(mon.sw / 156).toFixed(3)})` });
      mon.screen.append(chat);
      chat.append(
        el('rect', { x: 0, y: 0, width: 156, height: 16, fill: '#dfe5ec' }),
        el('circle', { cx: 11, cy: 8, r: 5, fill: '#8f8f8f' }),
        el('rect', { x: 20, y: 5, width: 38, height: 6, rx: 3, fill: '#b9c2cc' }),
        el('circle', { cx: 66, cy: 8, r: 2.6, fill: C.tea }),
        el('circle', { cx: 12, cy: 34, r: 6, fill: '#8f8f8f' }),
        el('rect', { x: 22, y: 26, width: 66, height: 17, rx: 8, fill: '#eef0f3' }),
        el('rect', { x: 29, y: 31, width: 40, height: 4, rx: 2, fill: '#cfd4da' }),
        el('rect', { x: 29, y: 37, width: 28, height: 4, rx: 2, fill: '#cfd4da' }),
        el('rect', { x: 6, y: 92, width: 116, height: 16, rx: 8, fill: '#fff', stroke: '#c9c9c9', 'stroke-width': 1.5 }),
        el('circle', { cx: 136, cy: 100, r: 8, fill: '#3b6fd8' }),
        el('path', { d: 'M132 100 L140 100 M137 96 L141 100 L137 104', fill: 'none', stroke: '#fff', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      );
      scene.add('mid', mon);
      return { player, mon, chat };
    },
    params: {
      showAt: 1400,
      options: [
        { id: 'full', text: { jp: 'お{疲|つか}れ{様|さま}です。〇〇の{件|けん}で ご{相談|そうだん}が あります。{明日|あした}、{少|すこ}し お{時間|じかん} いただけますか？', en: 'Good work. I would like to consult you about ○○. Could I have a little of your time tomorrow?' }, outcome: 'great' },
        { id: 'greet', text: { jp: 'お{疲|つか}れ{様|さま}です。', en: 'Good work.' }, outcome: 'greetOnly' },
        { id: 'chotto', text: { jp: 'ちょっといいですか？', en: 'Do you have a moment?' }, outcome: 'chotto' },
      ],
      onChoose(scene, r, opt) {
        const { el } = KY.svg;
        const long = opt.id === 'full';
        scene.bubble({ x: 212, y: 262, text: opt.text, tail: 'down', cls: 'mine', dur: long ? 4400 : 2800 });
        /* the message appears in the chat window */
        r.chat.append(
          el('rect', { x: long ? 44 : 84, y: 50, width: long ? 106 : 66, height: long ? 34 : 15, rx: 8, fill: '#d6e2fb' }),
          el('rect', { x: long ? 52 : 92, y: 56, width: long ? 90 : 46, height: 4, rx: 2, fill: '#9db4d8' }),
          long ? el('rect', { x: 52, y: 64, width: 78, height: 4, rx: 2, fill: '#9db4d8' }) : null,
          long ? el('rect', { x: 52, y: 72, width: 60, height: 4, rx: 2, fill: '#9db4d8' }) : null,
        );
        if (opt.id === 'greet') scene.after(1300, () => scene.bubble({ x: 212, y: 346, tail: 'none', who: WHO.boss, text: { jp: '…で？', en: '...And?' }, dur: 1600 }));
        else if (opt.id === 'chotto') scene.after(1300, () => scene.bubble({ x: 212, y: 346, tail: 'none', who: WHO.boss, text: { jp: 'うん、{何|なん}の{件|けん}？', en: 'Sure. About what?' }, dur: 1600 }));
        else scene.after(1500, () => scene.bubble({ x: 212, y: 346, tail: 'none', who: WHO.boss, text: { jp: 'いいよ。{明日|あした}の 10{時|じ}は どう？', en: 'Sure. How about 10 tomorrow?' }, dur: 1500 }));
        return opt.id === 'full' ? 3300 : 2900;
      },
      timeout: 'typing',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.boss, line: { jp: '（{1通|いっつう}で{全部|ぜんぶ}{分|わ}かる…ありがたい！）', en: '(One message and I know everything... bless you!)' },
        react(scene, r) { r.player.mark('sparkle'); } },
      greetOnly: { grade: 'ky', who: WHO.boss, line: { jp: '…で？', en: '...And?' },
        react(scene, r) { r.player.mark('dots'); } },
      chotto: { grade: 'ok', who: WHO.boss, line: { jp: 'うん、{何|なん}の{件|けん}？…{先|さき}に{書|か}いてくれると{助|たす}かるな。', en: "Sure, about what? ...It'd help if you wrote it up front." },
        react(scene, r) { r.player.mark('sweat'); } },
      typing: { grade: 'ky', who: null, line: { jp: '（{入力中|にゅうりょくちゅう}の まま、{時間|じかん}だけが{過|す}ぎた…）', en: '(Still "typing..." while the time just went by.)' },
        react(scene, r) { r.player.mark('zzz'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: 'チャットの {書|か}き{出|だ}し', en: 'How to open a work chat' },
      points: [
        { jp: '「<<お{疲|つか}れ{様|さま}です>>」だけを {送|おく}らないで、{何|なに}の ことかも いっしょに {書|か}きます。', en: 'Don\'t send only "otsukaresama desu". Say what it is about in the same message.' },
        { jp: '「ちょっと いいですか？」だけだと、{相手|あいて}は {何|なに}の {話|はなし}か わかりません。', en: 'With only "Do you have a moment?", the other person cannot tell what it is about.' },
        { jp: 'いつ {話|はな}したいかも {書|か}くと、{相手|あいて}が {予定|よてい}を {決|き}めやすいです。', en: 'Also say when you would like to talk; it makes it easy for them to plan.' },
      ],
      phrase: { jp: '〇〇の{件|けん}で ご{相談|そうだん}が あります。{明日|あした}、お{時間|じかん} いただけますか？', ro: '○○ no ken de go-sōdan ga arimasu. Ashita, o-jikan itadakemasu ka?', en: 'I would like to consult you about ○○. Could I have some of your time tomorrow?' },
      why: { jp: 'チャットでは、{相手|あいて}の {顔|かお}が {見|み}えません。ひとつの メッセージに {用事|ようじ}を {入|い}れると、{相手|あいて}は すぐ {答|こた}えられます。', en: "In chat you can't see the other person's face. If one message holds the whole request, they can answer right away." },
      dont: { jp: 'あいさつだけ {送|おく}って、{相手|あいて}が {聞|き}いて くれるのを {待|ま}たない。', en: "Don't send just a greeting and wait for the other person to ask." },
      tip: { jp: '{会社|かいしゃ}や チームに よって ちがいます。チャットでは「<<お{疲|つか}れ{様|さま}です>>」を {書|か}かない チームも あります。まわりの {人|ひと}の {書|か}き{方|かた}を {見|み}て、おなじように しましょう。', en: 'Teams differ. Some teams skip "otsukaresama desu" in chat. Watch how others write and do the same — but never send only a greeting.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.rect(svg, 8, 12, 88, 118, { r: 6 });
        D.rect(svg, 104, 12, 88, 118, { r: 6 });
        svg.append(el('rect', { x: 8, y: 12, width: 88, height: 14, rx: 6, fill: '#dfe5ec' }), el('rect', { x: 104, y: 12, width: 88, height: 14, rx: 6, fill: '#dfe5ec' }));
        svg.append(el('rect', { x: 18, y: 40, width: 68, height: 18, rx: 8, fill: '#d6e2fb' }));
        D.label(svg, 52, 53, 'おつかれさまです', { size: 7.5, color: C.ink });
        D.label(svg, 30, 82, '…で？', { size: 10, color: '#8a8a8a' });
        svg.append(el('rect', { x: 112, y: 36, width: 72, height: 44, rx: 8, fill: '#d6e2fb' }));
        [46, 56, 66].forEach((y, i) => svg.append(el('rect', { x: 120, y, width: 56 - i * 10, height: 4, rx: 2, fill: '#9db4d8' })));
        svg.append(el('path', { d: 'M46 106 l14 14 M60 106 l-14 14', stroke: '#8a8a8a', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }));
        svg.append(el('circle', { cx: 148, cy: 112, r: 11, fill: 'none', stroke: C.red, 'stroke-width': 4 }));
      },
    },
    test: { great: 'full', ok: 'chotto', ky: 'greet' },
  });

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
          n.innerHTML = `<div style="font-size:2.6cqw;color:var(--ink-3);font-weight:700">${KY.text.html(tt.app, { gloss: false })}</div>${KY.text.html(tt.msg, { gloss: false })}`;
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
  KY.defineStage({
    id: '1-8',
    chapter: 1,
    title: { jp: '{帰|かえ}る {時間|じかん}', en: 'Time to Go Home' },
    intro: { jp: '{午後|ごご}6{時|じ}です。あなたの {仕事|しごと}は できました。まだ {働|はたら}いて いる {人|ひと}も います。', en: "It's 6:00 p.m. Your work is done. Some people are still working." },
    time: 14000,
    mechanic: 'choice',
    setup(scene) {
      const P = KY.props;
      scene.camera({ zoom: 1.15, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.door({ x: 28, floor: 470, w: 46, h: 140 }));
      scene.add('bg', P.clock({ x: 166, y: 240, r: 20, h: 6, m: 0 }));
      scene.label(166, 202, { jp: '{午後|ごご}6{時|じ}', en: '6:00 p.m.' }, 'deadline');
      scene.add('mid', P.officeChair({ x: 170, facing: 1 }));
      scene.add('mid', P.officeChair({ x: 304, facing: -1 }));
      const c1 = scene.person({ x: 170, y: 470, pose: 'sit', facing: 1, tag: WHO.senior });
      const boss = scene.person({ x: 304, y: 470, pose: 'sit', facing: -1, color: 'npc2', tag: WHO.kacho });
      scene.add('mid', P.table({ x: 237, y: 420, w: 66 }));
      scene.add('mid', P.monitor({ x: 224, y: 410, w: 24, h: 28 }));
      scene.add('mid', P.monitor({ x: 252, y: 410, w: 24, h: 28 }));
      const player = scene.person({ x: 110, y: 470, facing: 1, color: 'player', player: true });
      typing(scene, c1, 0);
      typing(scene, boss, 2.1);
      return { player, c1, boss };
    },
    params: {
      script: [
        [600, (s, r) => r.player.mark('sparkle')],
      ],
      showAt: 1600,
      options: [
        { id: 'osaki', text: { jp: 'お{先|さき}に<<{失礼|しつれい}します>>', en: 'Excuse me for leaving first.' }, outcome: 'great' },
        { id: 'quiet', text: { jp: '（{何|なに}も{言|い}わずに{帰|かえ}る）', en: '(Leave without saying anything.)' }, outcome: 'sneak' },
        { id: 'gokuro', text: { jp: 'ご{苦労|くろう}{様|さま}でした！', en: 'Thank you for your hard work! (said to your boss)' }, outcome: 'gokuro' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        if (opt.id === 'quiet') {
          scene.walk(r.player, 44, 1100, () => r.player.set({ hidden: true }));
          return 1500;
        }
        scene.say(r.player, opt.text, { dur: opt.id === 'osaki' ? 1500 : 2200, cls: 'mine' });
        if (opt.id === 'osaki') {
          scene.after(1500, () => scene.say(r.c1, { jp: 'お{疲|つか}れ{様|さま}です！', en: 'Good work!' }, { dur: 1100, lift: 30 }));
          scene.after(2600, () => scene.say(r.boss, { jp: 'お{疲|つか}れ{様|さま}。', en: 'Good work.' }, { dur: 1100, lift: 30 }));
          return 3700;
        }
        scene.after(900, () => scene.say(r.boss, { jp: '…ご{苦労|くろう}{様|さま}？', en: '...Gokurō-sama?' }, { dur: 1500, lift: 30 }));
        return 2500;
      },
      onSilence(scene, r) {
        r.player.mark(null);
        scene.walk(r.player, 44, 1100, () => r.player.set({ hidden: true }));
        return 1500;
      },
      timeout: 'sneak',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.colleague, line: { jp: 'お{疲|つか}れ{様|さま}です！（スマートな{帰|かえ}り{方|かた}だ…）', en: '(What a smooth exit...) Good work!' } },
      sneak: { grade: 'ky', who: WHO.colleague, line: { jp: '…あれ？もう{帰|かえ}ったの？（いつの{間|ま}に…{忍者|にんじゃ}みたい）', en: "...Huh? Already gone? (When did... like a ninja.)" },
        react(scene, r) { r.c1.mark('q'); r.boss.mark('dots'); } },
      gokuro: { grade: 'ky', who: WHO.kacho, line: { jp: '…ご{苦労|くろう}{様|さま}？', en: '...Gokurō-sama?' },
        react(scene, r) { r.boss.mark('dots'); r.c1.mark('shock'); } },
    },
    card: {
      badge: 'must',
      name: { jp: 'お{先|さき}に <<{失礼|しつれい}します>>', en: 'Saying goodbye when you leave first' },
      points: [
        { jp: '{先|さき}に {帰|かえ}る ときは、「お{先|さき}に <<{失礼|しつれい}します>>」と {言|い}います。', en: 'When you leave before others, say "osaki ni shitsurei shimasu".' },
        { jp: '「<<お{疲|つか}れ{様|さま}です>>」と {言|い}われたら、「<<お{疲|つか}れ{様|さま}です>>」と {答|こた}えます。', en: 'If they answer "otsukaresama desu", say it back.' },
        { jp: '<<ご{苦労|くろう}{様|さま}>>は、{上|うえ}の {人|ひと}が {使|つか}う ことばだと {思|おも}う {人|ひと}が {多|おお}いです。{上司|じょうし}には {使|つか}いません。', en: 'Many people feel "gokurō-sama" is for seniors to say to juniors. Don\'t use it to your boss.' },
      ],
      phrase: { jp: 'お{先|さき}に<<{失礼|しつれい}します>>', ro: 'Osaki ni shitsurei shimasu', en: 'Excuse me for leaving first.' },
      why: { jp: '{時間|じかん}どおりに {帰|かえ}るのは、わるい ことでは ありません。ひとこと あいさつを すると、のこる {人|ひと}も いい {気持|きも}ちです。', en: 'Leaving on time is perfectly fine. A quick word of goodbye also makes the people who stay feel respected.' },
      dont: { jp: '{何|なに}も {言|い}わずに {帰|かえ}らない。{上司|じょうし}に「<<ご{苦労|くろう}{様|さま}>>」と {言|い}わない。', en: "Don't leave without a word, and don't say \"gokurō-sama\" to your boss." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 130);
        D.person(svg, { x: 44, y: 130, s: 0.8, color: 'player' });
        D.person(svg, { x: 158, y: 130, s: 0.62, pose: 'sit', facing: -1 });
        D.rect(svg, 112, 102, 52, 6, { r: 3 });
        dBubble(svg, 10, 8, 76, 24, 'おさきに', C.red, 10);
        dBubble(svg, 96, 44, 98, 24, 'おつかれさまです', '#8a8a8a', 8.5);
      },
    },
    test: { great: 'osaki', ky: 'gokuro' },
  });
  /* ------------------------------------------------------------------ 1-9 */
  KY.defineStage({
    id: '1-9',
    chapter: 1,
    title: { jp: '{遅刻|ちこく}の {連絡|れんらく}', en: 'Running Late' },
    intro: { jp: '{朝|あさ}8{時|じ}40{分|ぷん}。{電車|でんしゃ}が {止|と}まりました。{会社|かいしゃ}は 9{時|じ}からです。', en: "It's 8:40 a.m. Your train has stopped. Work starts at 9:00." },
    time: 12000,
    mechanic: 'choice',
    setup(scene) {
      const P = KY.props, { el, g, C } = KY.svg;
      scene.camera({ zoom: 1.15, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      /* inside the train: windows, a rail with straps, a speaker in the ceiling */
      scene.add('bg', P.window({ x: 40, y: 284, w: 96, h: 64 }));
      scene.add('bg', P.window({ x: 224, y: 284, w: 96, h: 64 }));
      scene.add('bg', P.door({ x: 22, floor: 470, w: 40, h: 128 }));
      scene.add('bg', el('line', { x1: -400, y1: 252, x2: 760, y2: 252, stroke: '#d4d4d0', 'stroke-width': 4 }));
      [110, 258].forEach(x => scene.add('bg', g({ transform: `translate(${x} 252)` }, [
        el('line', { x1: 0, y1: 0, x2: 0, y2: 14, stroke: C.soft, 'stroke-width': 2 }),
        el('circle', { cx: 0, cy: 24, r: 10, fill: 'none', stroke: C.line, 'stroke-width': 2.5 }),
      ])));
      scene.add('bg', g({ transform: 'translate(180 226)' }, [
        el('rect', { x: -12, y: -8, width: 24, height: 16, rx: 4, fill: '#ececec', stroke: C.line, 'stroke-width': 2.2 }),
        el('path', { d: 'M-6 -3 h12 M-6 1 h12 M-6 5 h12', stroke: C.soft, 'stroke-width': 1.6, fill: 'none' }),
      ]));
      /* the clock keeps ticking toward 9:00 (one minute every 0.6 s) */
      const clock = P.clock({ x: 180, y: 316, r: 17, h: 8, m: 40 });
      scene.add('bg', clock);
      const tl = scene.label(180, 280, { jp: '8:40' }, 'deadline');
      let last = -1;
      scene.every((dt, t) => {
        const m = Math.min(60, 40 + t / 600), mm = Math.floor(m);
        clock.setTime(m >= 60 ? 9 : 8, m >= 60 ? 0 : m);
        if (mm !== last) { last = mm; tl.innerHTML = KY.text.html({ jp: mm >= 60 ? '9:00' : `8:${String(mm).padStart(2, '0')}` }, { gloss: false }); }
      });
      /* people */
      scene.add('mid', P.seat({ x: 300, back: 'right' }));
      const rider = scene.person({ x: 300, y: 470, pose: 'sit', facing: -1, color: 'npc2' });
      const rider2 = scene.person({ x: 244, y: 470, facing: -1, color: 'npc2' });
      const player = scene.person({ x: 170, y: 470, facing: 1, color: 'player', player: true, arms: { f: [40, 70], b: [-6, 0] } });
      /* your phone (red) */
      const phone = g({}, [
        el('rect', { x: -7, y: -13, width: 14, height: 26, rx: 3.5, fill: C.redSoft, stroke: C.red, 'stroke-width': 2.4 }),
        el('line', { x1: -3, y1: 8, x2: 3, y2: 8, stroke: C.red, 'stroke-width': 1.8, 'stroke-linecap': 'round' }),
      ]);
      scene.add('fg', phone);
      const placePhone = () => { const h = player.hand(); KY.svg.set(phone, { transform: `translate(${(h.x + 3).toFixed(1)} ${(h.y - 9).toFixed(1)}) rotate(10)` }); };
      placePhone();
      return { player, rider, rider2, placePhone };
    },
    params: {
      script: [
        [300, s => s.bubble({ x: 180, y: 214, tail: 'down', who: { jp: '{車内放送|しゃないほうそう}', en: 'Announcement' }, text: { jp: 'ただいま{車両点検|しゃりょうてんけん}のため、{停車|ていしゃ}しております', en: 'We are currently stopped for a vehicle inspection.' }, dur: 5200 })],
        [1200, (s, r) => r.player.mark('sweat')],
      ],
      showAt: 1800,
      options: [
        { id: 'call', text: { jp: 'おはようございます、{山田|やまだ}です。{電車|でんしゃ}が{止|と}まっていて、9{時|じ}20{分|ぷん}ごろ{着|つ}きそうです。{申|もう}し{訳|わけ}ありません', en: "Good morning, this is Yamada. My train has stopped; I expect to arrive around 9:20. I'm sorry." }, outcome: 'great' },
        { id: 'late', text: { jp: '{電車|でんしゃ}が おくれています。', en: 'The train is delayed.' }, outcome: 'vague' },
        { id: 'later', text: { jp: '（{着|つ}いてから あやまれば いいや）', en: "(I'll just apologize once I get there.)" }, outcome: 'after' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        if (opt.id === 'later') {
          scene.say(r.player, opt.text, { kind: 'think', cls: 'mine', dur: 2400 });
          return 2500;
        }
        /* step away from the crowd, phone to the ear */
        scene.walk(r.player, 100, 600, () => {
          r.player.set({ arms: { f: [112, 78], b: [-6, 0] } });
          r.placePhone();
          scene.say(r.player, opt.text, { dur: 3600, cls: 'mine' });
        });
        return opt.id === 'call' ? 4700 : 3500;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.boss, line: { jp: '{連絡|れんらく}ありがとう。{慌|あわ}てずに、{気|き}をつけて{来|き}てね。', en: "Thanks for letting me know. Don't rush; take care getting here." } },
      vague: { grade: 'ok', who: WHO.boss, line: { jp: '…{何時|なんじ}ごろ{着|つ}くの？', en: '...What time will you get here?' },
        react(scene, r) { r.player.mark('sweat'); r.rider.mark('q'); } },
      after: { grade: 'ky', who: WHO.boss, line: { jp: '（{来|き}てから{言|い}われても…{先|さき}に{連絡|れんらく}が{欲|ほ}しかった）', en: '(Telling me after you arrive... I wanted to hear before.)' },
        react(scene, r) { r.player.mark('sweat2'); r.rider.mark('dots'); } },
      silent: { grade: 'ky', who: WHO.boss, line: { jp: '（9{時|じ}を{過|す}ぎた…{連絡|れんらく}もない…{無断欠勤|むだんけっきん}？）', en: '(Past nine... no word... is this an unexcused absence?)' },
        react(scene, r) { r.player.mark('sweat2'); r.rider.mark('dots'); r.rider2.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{遅刻|ちこく}の {連絡|れんらく}', en: 'Contacting work when you will be late' },
      points: [
        { jp: '{仕事|しごと}が はじまる {前|まえ}に、わかった ときすぐ、{上司|じょうし}に {連絡|れんらく}します。', en: 'Contact your boss before work starts, as soon as you know.' },
        { jp: '{理由|りゆう}と、{何時|なんじ}ごろ {着|つ}くかを {伝|つた}えて、あやまります。', en: 'Give the reason and your expected arrival time, and apologize.' },
        { jp: '{連絡|れんらく}は、{会社|かいしゃ}の ルールどおりに します（{電話|でんわ}、チャット、メール）。', en: "Follow your company's rule for how to contact them (phone, chat or email)." },
      ],
      phrase: { jp: '{電車|でんしゃ}が{止|と}まっていて、9{時|じ}20{分|ぷん}ごろ{着|つ}きそうです。{申|もう}し{訳|わけ}ありません', ro: 'Densha ga tomatte ite, ku-ji nijuppun goro tsukisō desu. Mōshiwake arimasen.', en: 'My train has stopped, and I expect to arrive around 9:20. I am sorry.' },
      why: { jp: '{連絡|れんらく}が ないと、まわりの {人|ひと}は「どうしたのかな？」と {気|き}に なります。{先|さき}に {知|し}らせると、{上司|じょうし}は {予定|よてい}を {変|か}えられます。{駅|えき}で もらえる {遅延証明書|ちえんしょうめいしょ}を {出|だ}す {会社|かいしゃ}も あります。', en: 'Without word, people wonder what happened. If you tell them first, your boss can change the plans. Some companies also ask for a delay certificate from the station.' },
      dont: { jp: '{着|つ}いてから あやまれば いい、と {思|おも}わない。{先|さき}に {連絡|れんらく}します。', en: "Don't plan to just apologize after you arrive. Contact them first." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        svg.append(el('circle', { cx: 46, cy: 62, r: 26, fill: '#fff', stroke: C.ink, 'stroke-width': 3 }));
        svg.append(el('path', { d: 'M46 62 L30 62 M46 62 L46 42', stroke: C.ink, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }));
        svg.append(el('circle', { cx: 46, cy: 62, r: 2.5, fill: C.ink }));
        D.label(svg, 46, 108, '9じ まえに', { color: C.red, size: 10 });
        D.arrow(svg, 80, 62, 108, 62, { color: C.red });
        svg.append(el('rect', { x: 118, y: 34, width: 32, height: 56, rx: 7, fill: C.redSoft, stroke: C.red, 'stroke-width': 3 }));
        svg.append(el('rect', { x: 124, y: 42, width: 20, height: 4, rx: 2, fill: C.red }), el('rect', { x: 124, y: 52, width: 14, height: 4, rx: 2, fill: C.red }));
        D.label(svg, 134, 108, 'れんらく', { color: C.red, size: 10 });
        D.label(svg, 100, 136, 'りゆう と ついた じかん', { color: '#666', size: 9 });
      },
    },
    test: { great: 'call', ok: 'late', ky: 'later' },
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
      great: { grade: 'great', who: WHO.colleague, line: { jp: '{早|はや}いですね！…あ、もう{資料|しりょう}を{開|ひら}いてる', en: "You're early! ...Oh, you already have the document open." } },
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
