/* Chapter 6 — On the Move & Special Occasions (移動と特別な場面) */
(function (root) {
  const KY = root.KY;
  const P = KY.props;

  /* dictionary words used in this chapter (first definition wins, see glossary.js) */
  KY.addGlossary({
    '敬礼':{yomi:'けいれい',jp:'30{度|ど}ぐらい {頭|あたま}を {下|さ}げる あいさつ。',en:'30-degree bow'},'最敬礼':{yomi:'さいけいれい',jp:'45{度|ど}ぐらい {頭|あたま}を {下|さ}げる あいさつ。',en:'deep 45-degree bow'},'土下座':{yomi:'どげざ',jp:'{床|ゆか}に {手|て}や {頭|あたま}を {下|さ}げる こと。{会社|かいしゃ}では ふつう しません。',en:'kneeling apology; not normal workplace behavior'},
    '助手席': { yomi: 'じょしゅせき', jp: '{運転手|うんてんしゅ}の となりの {席|せき}。', en: 'front passenger seat' },
    '円卓': { yomi: 'えんたく', jp: 'まるい テーブル。{中国|ちゅうごく}{料理|りょうり}の おみせで よく {見|み}る。', en: 'round table' },
    'おかけください': { yomi: 'おかけください', jp: '「{座|すわ}って ください」の とても {丁寧|ていねい}な {言|い}い{方|かた}。', en: 'please have a seat (polite)' },
    '手土産': { yomi: 'てみやげ', jp: '{会社|かいしゃ}を {訪|たず}ねる とき、{相手|あいて}に もって いく おみやげ。', en: 'a small gift you bring on a visit' },
    '心ばかりですが': { yomi: 'こころばかりですが', jp: 'プレゼントを わたす ときの ことば。「ほんの {気持|きも}ちです」と いう {意味|いみ}。', en: '"just a small token" (humble phrase when giving a gift)' },
    'お見送り': { yomi: 'おみおくり', jp: '{帰|かえ}る {人|ひと}を、{見|み}えなく なる まで {送|おく}る こと。', en: 'seeing a visitor off' },
    '途中': { yomi: 'とちゅう', jp: '{始|はじ}まって から、まだ おわって いない ところ。', en: 'in the middle of (something)' },
    '原因': { yomi: 'げんいん', jp: '{問題|もんだい}が {起|お}きた わけ。', en: 'cause' },
  });

  const WHO = {
    customer: { jp: 'お{客様|きゃくさま}', en: 'Client' },
    boss: { jp: '{上司|じょうし}', en: 'Your boss' },
    driver: { jp: '{運転手|うんてんしゅ}', en: 'Driver' },
    me: { jp: '{自分|じぶん}', en: 'You (host)' },
    you: { jp: 'あなた', en: 'You' },
  };

  /* ------------------------------------------------------------------ helpers */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* walk a top-view person along waypoints (speed in scene units per ms); turns to face the way it walks */
  function follow(scene, p, pts, speed, done) {
    let i = 0;
    const next = () => {
      if (i >= pts.length) { if (done) done(); return; }
      const to = pts[i++];
      const dx = to.x - p.o.x, dy = to.y - p.o.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) p.set({ dir: (Math.atan2(dx, -dy) * 180) / Math.PI });
      scene.glide(p, to, Math.max(60, d / speed), 'linear', next);
    };
    next();
  }

  /* ---- car seats (same numbers as P.carTop; Japan: the driver sits front-right) ---- */
  const CAR = { x: 180, y: 300, w: 150, h: 280 };
  const CSX = CAR.w / 2 - 38;
  const SEAT = {
    driver: { x: CAR.x + CSX, y: CAR.y - 30 },
    passenger: { x: CAR.x - CSX, y: CAR.y - 30 },
    rearRight: { x: CAR.x + CSX, y: CAR.y + 52 },
    rearMiddle: { x: CAR.x, y: CAR.y + 56 },
    rearLeft: { x: CAR.x - CSX, y: CAR.y + 52 },
  };

  /* a car seen from above with a pavement (taxi) or a parking bay (company car) */
  function drawCar(scene, kind) {
    const { el, g } = KY.svg;
    scene.camera({ zoom: 1.12, x: 170, y: 300 });
    if (kind === 'taxi') {
      scene.add('bg', el('rect', { x: -300, y: -200, width: 396, height: 1000, fill: '#f4f4f1' }));
      scene.add('bg', el('line', { x1: 96, y1: -200, x2: 96, y2: 800, stroke: '#cfcfca', 'stroke-width': 4 }));
      scene.add('bg', el('line', { x1: 306, y1: -200, x2: 306, y2: 800, stroke: '#dcdcd8', 'stroke-width': 3, 'stroke-dasharray': '18 14' }));
    } else {
      scene.add('bg', el('path', { d: 'M92 472 L92 134 L268 134 L268 472', fill: 'none', stroke: '#d6d6d2', 'stroke-width': 4, 'stroke-linejoin': 'round' }));
    }
    const car = P.carTop(CAR);
    scene.add('bg', car);
    if (kind === 'taxi') {
      scene.add('bg', g({ transform: `translate(${CAR.x} ${CAR.y - 38})` }, [
        el('rect', { x: -16, y: -8, width: 32, height: 16, rx: 4, fill: '#fff', stroke: '#8a8a8a', 'stroke-width': 2.5 }),
        (() => { const t = el('text', { x: 0, y: 3.5, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 900, fill: '#777' }); t.textContent = 'TAXI'; return t; })(),
      ]));
    }
    scene.label(CAR.x, 148, { jp: '{前|まえ}', en: 'front' });
    return car;
  }

  /* diagram: car seen from above (viewBox 200×150). items: [seatKey, number, { you, top }] */
  const CAR_DIAG = { passenger: [74, 46], driver: [126, 46], rearLeft: [74, 102], rearMiddle: [100, 110], rearRight: [126, 102] };
  function carDiagram(svg, items, driverLabel) {
    const D = KY.diag, { el } = KY.svg;
    svg.append(el('rect', { x: 55, y: 8, width: 90, height: 134, rx: 26, fill: '#fff', stroke: '#c4c4c4', 'stroke-width': 3 }));
    svg.append(el('circle', { cx: CAR_DIAG.driver[0], cy: CAR_DIAG.driver[1], r: 10, fill: '#e6e6e6' }));
    D.label(svg, CAR_DIAG.driver[0], 68, driverLabel, { size: 8 });
    for (const [k, n, o] of items) D.seat(svg, CAR_DIAG[k][0], CAR_DIAG[k][1], n, o || {});
    D.arrow(svg, 170, 84, 170, 42);
    D.label(svg, 170, 98, 'まえ');
  }

  /* ---- big labelled picture of a car seen from above (card.figure, viewBox FIG_CAR_VB) ----
     The front is up. Japan drives on the left, so the driver sits front-RIGHT (same as the play scene).
     seats: { driver | passenger | rearLeft | rearMiddle | rearRight: { n, you, top, who, faint } }
     who: a kana string, or an array of kana lines (no kanji inside the SVG) */
  const FIG_CAR_VB = '0 0 320 258';
  const FIG_CAR_AT = { passenger: [111, 84], driver: [249, 84], rearLeft: [111, 162], rearMiddle: [180, 162], rearRight: [249, 162] };
  function figCar(svg, { seats = {} } = {}) {
    const D = KY.diag, { el, C } = KY.svg;
    const BX = 74, BW = 212, SW = 64, SH = 56;
    /* tyres first, so the body outline sits on top of them */
    [[34, 'l'], [34, 'r'], [176, 'l'], [176, 'r']].forEach(([y, side]) => {
      svg.append(el('rect', { x: side === 'l' ? BX - 6 : BX + BW - 3, y, width: 9, height: 36, rx: 3, fill: '#d6d6d6' }));
    });
    svg.append(
      el('rect', { x: BX, y: 8, width: BW, height: 242, rx: 44, fill: '#fff', stroke: '#c4c4c4', 'stroke-width': 4 }),
      el('path', { d: `M${BX + 26} 54Q${BX + BW / 2} 44 ${BX + BW - 26} 54`, fill: 'none', stroke: '#dadada', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      el('path', { d: `M${BX + 26} 232Q${BX + BW / 2} 240 ${BX + BW - 26} 232`, fill: 'none', stroke: '#dadada', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    );
    /* seats */
    for (const [key, [cx, y]] of Object.entries(FIG_CAR_AT)) {
      const s = seats[key];
      if (!s) continue;
      const x = cx - SW / 2;
      const edge = s.faint ? '#d6d6d6' : '#9a9a9a';
      svg.append(
        el('rect', { x, y, width: SW, height: SH, rx: 10, fill: key === 'driver' ? '#f4f4f4' : '#fff', stroke: edge, 'stroke-width': 3 }),
        el('rect', { x: x + 6, y: y + SH - 11, width: SW - 12, height: 6, rx: 3, fill: s.faint ? '#f6f6f6' : '#efefef' }),
      );
      const lines = [].concat(s.who || []);
      if (s.n) {
        D.seat(svg, cx, y + 18, s.n, { you: s.you, top: s.top });
        lines.forEach((t, i) => D.label(svg, cx, y + 41 + i * 11, t, { size: 9, weight: 900, color: s.you ? C.red : '#555' }));
      } else {
        const y0 = y + (SH - 11) / 2 + 3 - (lines.length - 1) * 6;
        lines.forEach((t, i) => D.label(svg, cx, y0 + i * 12, t, { size: 9, weight: 900, color: '#555' }));
      }
    }
    /* steering wheel, in front of the driver's seat */
    svg.append(
      el('circle', { cx: 249, cy: 68, r: 10, fill: 'none', stroke: '#9a9a9a', 'stroke-width': 3 }),
      el('path', { d: 'M239 68H259M249 68V78', fill: 'none', stroke: '#9a9a9a', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    );
    D.label(svg, 233, 72, 'ハンドル', { size: 8.5, anchor: 'end' });
    /* which way is the front */
    D.arrow(svg, 38, 144, 38, 52);
    D.label(svg, 38, 166, 'まえ', { size: 13, weight: 900, color: C.ink });
  }

  /* ------------------------------------------------------------------ 6-1 */
  KY.defineStage({
    id: '6-1',
    chapter: 6,
    title: { jp: 'タクシーでは どこに {座|すわ}る？', en: 'Where to Sit in a Taxi' },
    intro: { jp: 'お{客様|きゃくさま}と {上司|じょうし}と 3{人|にん}で タクシーに のります。{行|い}く {場所|ばしょ}は、あなただけが {知|し}って います。{運転手|うんてんしゅ}に {道|みち}を {教|おし}えます。', en: 'You, your boss and a client are about to ride in a taxi together.' },
    time: 12000,
    mechanic: 'place',
    setup(scene) {
      drawCar(scene, 'taxi');
      const driver = scene.person({ top: true, x: SEAT.driver.x, y: SEAT.driver.y, dir: 0, tag: WHO.driver });
      const client = scene.person({ top: true, x: 60, y: 236, dir: 90, tag: WHO.customer });
      const boss = scene.person({ top: true, x: 60, y: 290, dir: 90, tag: WHO.boss });
      const player = scene.person({ top: true, x: 60, y: 344, dir: 90, color: 'player', player: true });
      return { driver, client, boss, player };
    },
    params: {
      item: 'player',
      script: [
        [300, (s, r) => s.say(r.client, { jp: '{駅|えき}まで、タクシーで {行|い}きましょうか。', en: 'Shall we take a taxi to the station?' }, { dur: 2800 })],
        [3400, (s, r) => s.say(r.driver, { jp: 'どうぞ、お{乗|の}りください。', en: 'Please, get in.' }, { dur: 2200 })],
      ],
      zones: [
        { id: 'front', x: SEAT.passenger.x, y: SEAT.passenger.y, r: 21, outcome: 'great' },
        { id: 'middle', x: SEAT.rearMiddle.x, y: SEAT.rearMiddle.y, r: 21, outcome: 'middle' },
        { id: 'behind-driver', x: SEAT.rearRight.x, y: SEAT.rearRight.y, r: 21, outcome: 'best' },
        { id: 'behind-passenger', x: SEAT.rearLeft.x, y: SEAT.rearLeft.y, r: 21, outcome: 'boss' },
      ],
      onPlace(scene, r, zone) {
        r.player.set({ dir: 0 });
        const plan = {
          front: [['client', 'rearRight'], ['boss', 'rearLeft']],
          middle: [['client', 'rearRight'], ['boss', 'rearLeft']],
          'behind-driver': [['client', 'rearLeft'], ['boss', 'passenger']],
          'behind-passenger': [['client', 'rearRight'], ['boss', 'rearMiddle']],
        }[zone.id];
        plan.forEach(([who, seat], i) => scene.after(i * 650, () => {
          const to = SEAT[seat];
          const door = seat === 'passenger' ? 270 : 352;
          const route = seat === 'passenger'
            ? [{ x: 104, y: door }, to]
            : [{ x: 104, y: door }, { x: 128, y: 396 }, { x: to.x, y: 396 }, to];
          follow(scene, r[who], route, 0.4, () => r[who].set({ dir: 0 }));
        }));
        return 650 + 900;
      },
      timeout: 'stand',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.boss, line: { jp: 'おっ、{助手席|じょしゅせき}か。{道|みち}の{案内|あんない}、{頼|たの}むよ。', en: "Oh, the front seat. I'll leave the directions to you." } },
      middle: { grade: 'ok', who: WHO.boss, line: { jp: '…{真|ま}ん{中|なか}、{狭|せま}くない？ {前|まえ}が{空|あ}いてるよ。', en: "...Isn't the middle cramped? The front seat is free." },
        react(scene, r) { r.boss.mark('sweat'); } },
      best: { grade: 'ky', who: WHO.boss, line: { jp: '（{私|わたし}が{助手席|じょしゅせき}で、{君|きみ}が{奥|おく}…？）', en: "(So I'm up front, and you get the best seat...?)" },
        react(scene, r) { r.boss.mark('sweat2'); r.client.mark('q'); } },
      boss: { grade: 'ky', who: WHO.boss, line: { jp: '（{私|わたし}の{席|せき}が…{真|ま}ん{中|なか}に…）', en: '(My seat... and now I am in the middle...)' },
        react(scene, r) { r.boss.mark('sweat2'); r.client.mark('dots'); } },
      stand: { grade: 'ky', who: WHO.boss, line: { jp: '{乗|の}らないの？ {運転手|うんてんしゅ}さん、{待|ま}ってるよ。', en: "Aren't you getting in? The driver is waiting." } },
    },
    card: {
      badge: 'must',
      name: { jp: 'タクシーの {席|せき}の {順番|じゅんばん}', en: 'Taxi seat order' },
      points: [
        { jp: '{順番|じゅんばん}は、1 {運転手|うんてんしゅ}の {後|うし}ろ、2 {助手席|じょしゅせき}の {後|うし}ろ、3 {真|ま}ん{中|なか}、4 {助手席|じょしゅせき}です。', en: 'Order: 1 behind the driver, 2 behind the front passenger seat, 3 middle, 4 front passenger seat.' },
        { jp: 'あなたは いちばん {下|した}の {席|せき}、{助手席|じょしゅせき}に {座|すわ}ります。', en: 'You take the lowest seat: the front passenger seat.' },
        { jp: '{行|い}き{先|さき}を {運転手|うんてんしゅ}に {伝|つた}えたり、お{金|かね}を はらったり します。', en: 'You tell the driver the destination and take care of the payment.' },
      ],
      phrase: { jp: 'どうぞ、{奥|おく}の {席|せき}へ', ro: 'dōzo, oku no seki e', en: 'Please, take the seat further in.' },
      why: { jp: 'これは {決|き}まりでは なく、{日本|にほん}の ビジネスの {習慣|しゅうかん}です。{運転手|うんてんしゅ}の {後|うし}ろが いちばん {上|うえ}の {席|せき}、{助手席|じょしゅせき}が いちばん {下|した}の {席|せき}と {考|かんが}えます。', en: 'This is a business custom, not a rule. The seat behind the driver counts as the top seat and the front passenger seat as the lowest.' },
      dont: { jp: '{自分|じぶん}から {運転手|うんてんしゅ}の {後|うし}ろに {座|すわ}らない。', en: "Don't take the seat behind the driver yourself." },
      tip: { jp: 'お{客様|きゃくさま}が「ここに {座|すわ}ります」と {言|い}ったら、その とおりに します。', en: 'If the client says where they want to sit, follow that.' },
      diagram(svg) {
        carDiagram(svg, [['rearRight', 1, { top: true }], ['rearLeft', 2], ['rearMiddle', 3], ['passenger', 4, { you: true }]], 'うんてん');
      },
      figure: {
        viewBox: FIG_CAR_VB,
        draw(svg) {
          figCar(svg, { seats: {
            rearRight: { n: 1, top: true, who: 'おきゃくさま' },
            rearLeft: { n: 2, who: 'じょうし' },
            rearMiddle: { n: 3, who: 'ほかの ひと' },
            passenger: { n: 4, you: true, who: 'あなた' },
            driver: { who: 'うんてんしゅ' },
          } });
        },
        rule: { jp: '{運転手|うんてんしゅ}の うしろが いちばん {上|うえ}の {席|せき}、{助手席|じょしゅせき}が いちばん {下|した}の {席|せき}です。', en: 'The seat behind the driver is the top seat; the front passenger seat is the lowest.' },
        legend: [
          { n: 1, top: true, jp: '{上座|かみざ}。{運転手|うんてんしゅ}の うしろです。お{客様|きゃくさま}が {座|すわ}ります。', en: 'Kamiza, the top seat: behind the driver. The client sits here.' },
          { n: 2, jp: '{助手席|じょしゅせき}の うしろです。{上司|じょうし}が {座|すわ}ります。', en: 'Behind the front passenger seat. Your boss sits here.' },
          { n: 3, jp: '{真|ま}ん{中|なか}の {席|せき}です。', en: 'The middle seat.' },
          { n: 4, you: true, jp: '{下座|しもざ}。{助手席|じょしゅせき}です。あなたが {座|すわ}ります。', en: 'Shimoza, the lowest seat: the front passenger seat. You sit here.' },
        ],
      },
    },
    test: { great: 'front', ok: 'middle', ky: 'behind-driver' },
  });

  /* ------------------------------------------------------------------ 6-2 */
  KY.defineStage({
    id: '6-2',
    chapter: 6,
    title: { jp: '{上司|じょうし}の {車|くるま}では どこに {座|すわ}る？', en: "Where to Sit in Your Boss's Car" },
    intro: { jp: '{上司|じょうし}が {運転|うんてん}する {車|くるま}に、あなたも のります。', en: 'Your boss is driving, and you are riding along.' },
    time: 10000,
    mechanic: 'place',
    setup(scene) {
      drawCar(scene, 'lot');
      const boss = scene.person({ top: true, x: SEAT.driver.x, y: SEAT.driver.y, dir: 0, tag: WHO.boss });
      const player = scene.person({ top: true, x: 52, y: 330, dir: 90, color: 'player', player: true });
      return { boss, player };
    },
    params: {
      item: 'player',
      script: [
        [300, (s, r) => s.say(r.boss, { jp: 'じゃあ、{行|い}こうか。', en: "Well, shall we go?" }, { dur: 2400 })],
      ],
      zones: [
        { id: 'front', x: SEAT.passenger.x, y: SEAT.passenger.y, r: 24, outcome: 'great' },
        { id: 'behind-passenger', x: SEAT.rearLeft.x, y: SEAT.rearLeft.y, r: 21, outcome: 'back' },
        { id: 'behind-driver', x: SEAT.rearRight.x, y: SEAT.rearRight.y, r: 21, outcome: 'taxi' },
      ],
      onPlace(scene, r) { r.player.set({ dir: 0 }); return 700; },
      timeout: 'stand',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.boss, line: { jp: 'お、{隣|となり}に{座|すわ}ってくれたか。{話|はな}しやすいな。', en: "Oh, you're sitting next to me. That makes it easier to talk." } },
      back: { grade: 'ok', who: WHO.boss, line: { jp: '{後|うし}ろか。{話|はな}しにくいけど…まあ、いいか。', en: 'In the back, huh. Harder to talk, but... fine.' },
        react(scene, r) { r.boss.mark('dots'); } },
      taxi: { grade: 'ky', who: WHO.boss, line: { jp: '…あの、これ、タクシーじゃないよ？', en: "...Um, this isn't a taxi, you know?" },
        react(scene, r) { r.boss.mark('sweat2'); } },
      stand: { grade: 'ky', who: WHO.boss, line: { jp: '…{乗|の}らないの？ {置|お}いていくよ。', en: "...Not getting in? I'll leave without you." },
        react(scene, r) { r.boss.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: '{上司|じょうし}の {車|くるま}の {席|せき}', en: "Seats in your boss's car" },
      points: [
        { jp: '{上司|じょうし}が {運転|うんてん}する ときは、{助手席|じょしゅせき}が いちばん {上|うえ}の {席|せき}です。', en: "When your boss drives, the front passenger seat is the top seat." },
        { jp: '{運転手|うんてんしゅ}の {後|うし}ろに ひとりで {座|すわ}ると、タクシーの ように なります。', en: 'Sitting alone behind the driver makes it feel like a taxi.' },
        { jp: '{助手席|じょしゅせき}では ねむらない ように します。{運転|うんてん}して いる {人|ひと}と {話|はな}します。', en: 'In the front seat, stay awake and keep the driver company.' },
      ],
      phrase: { jp: '{前|まえ}に<<{失礼|しつれい}いたします>>', ro: 'mae ni shitsurei itashimasu', en: 'Excuse me, I will sit in front.' },
      why: { jp: '{友|とも}だちの {車|くるま}では となりに {座|すわ}ります。{仕事|しごと}でも おなじです。{後|うし}ろに {座|すわ}ると、{上司|じょうし}が {運転手|うんてんしゅ}、あなたが お{客様|きゃくさま}の ように なって しまいます。', en: 'With friends you sit beside the driver, and work is the same. Sitting behind turns your boss into your chauffeur.' },
      dont: { jp: '{上司|じょうし}に {聞|き}かずに、{後|うし}ろの {席|せき}に {座|すわ}らない。', en: "Don't sit in the back without asking your boss first." },
      tip: { jp: '{会社|かいしゃ}や {人|ひと}で ちがいます。{上司|じょうし}が「{後|うし}ろで いいよ」と {言|い}ったら、その とおりに します。', en: 'It differs by company and person. If your boss says "the back is fine", follow that.' },
      diagram(svg) {
        carDiagram(svg, [['passenger', 1, { you: true }], ['rearLeft', 2], ['rearRight', 3]], 'じょうし');
      },
      figure: {
        viewBox: FIG_CAR_VB,
        draw(svg) {
          figCar(svg, { seats: {
            passenger: { n: 1, you: true, who: 'あなた' },
            driver: { who: ['じょうし', '（うんてん）'] },
            rearLeft: { n: 2 },
            rearRight: { n: 3 },
            rearMiddle: { faint: true },
          } });
        },
        rule: { jp: '{上司|じょうし}が {運転|うんてん}する ときは、となりの {助手席|じょしゅせき}が いちばん {上|うえ}の {席|せき}です。', en: "When your boss drives, the seat next to the driver is the top seat." },
        legend: [
          { n: 1, you: true, jp: '{助手席|じょしゅせき}。いちばん {上|うえ}の {席|せき}です。あなたが {座|すわ}ります。', en: 'The front passenger seat, the top seat. You sit here.' },
          { n: 2, jp: '{助手席|じょしゅせき}の うしろです。{後|うし}ろに {座|すわ}る ときは ここです。', en: 'Behind the front passenger seat. If you must sit in the back, sit here.' },
          { n: 3, jp: '{運転|うんてん}する {人|ひと}の うしろです。ひとりで {座|すわ}ると タクシーの ように なります。', en: 'Behind the driver. Sitting here alone makes it feel like a taxi.' },
        ],
      },
    },
    test: { great: 'front', ok: 'behind-passenger', ky: 'behind-driver' },
  });

  /* ------------------------------------------------------------------ 6-3 */
  /* round table: seat k sits at k × 60° clockwise from the top (0 = farthest from the door, 3 = nearest) */
  const TB = { x: 180, y: 290, r: 82, R: 106 };
  const seatAt = k => { const a = (k * 60 * Math.PI) / 180; return { x: TB.x + TB.R * Math.sin(a), y: TB.y - TB.R * Math.cos(a) }; };
  const SEAT6 = [0, 1, 2, 3, 4, 5].map(seatAt);
  const ringPt = deg => { const a = (deg * Math.PI) / 180; return { x: TB.x + 132 * Math.sin(a), y: TB.y - 150 * Math.cos(a) }; };
  /* walk from the door to seat k around the outside of the chairs */
  function roundRoute(k) {
    const right = k <= 2;
    const target = right ? k * 60 : (k === 0 ? 360 : k * 60);
    const step = right ? -30 : 30;
    const pts = [];
    for (let f = 180 + step; right ? f >= target : f <= target; f += step) pts.push(ringPt(f));
    pts.push(SEAT6[k]);
    return pts;
  }

  /* ---- big labelled picture of the round table (card.figure, viewBox FIG_ROUND_VB) ----
     Same layout as the play scene: the entrance is at the bottom, the farthest chair is at the top.
     seats: { 1..6: { you, who } }  (numbers as in card.diagram: 1 = top, 6 = nearest the entrance) */
  const FIG_ROUND_VB = '0 0 320 304';
  const FIG_ROUND_DEG = { 1: 0, 2: 60, 3: 300, 4: 120, 5: 240, 6: 180 };
  function figRound(svg, { seats = {} } = {}) {
    const D = KY.diag, { el, C } = KY.svg;
    const CX = 160, CY = 124, R = 74, H = 16;
    /* room: the entrance is a gap in the bottom wall, with its swing and an arrow coming in */
    svg.append(
      el('rect', { x: 5, y: 6, width: 310, height: 262, fill: '#fff', stroke: '#c4c4c4', 'stroke-width': 4 }),
      el('line', { x1: 140, y1: 268, x2: 180, y2: 268, stroke: '#fff', 'stroke-width': 6 }),
      el('path', { d: 'M140 228A40 40 0 0 1 180 268M140 268H180', fill: 'none', stroke: '#c4c4c4', 'stroke-width': 2, 'stroke-dasharray': '4 4' }),
    );
    D.arrow(svg, 160, 300, 160, 274);
    D.label(svg, 172, 293, 'いりぐち', { size: 9, color: C.ink, weight: 900, anchor: 'start' });
    /* table */
    svg.append(el('circle', { cx: CX, cy: CY, r: 48, fill: '#fbfaf7', stroke: '#9a9a9a', 'stroke-width': 2.5 }));
    D.label(svg, CX, CY + 4, 'えんたく', { size: 10 });
    /* chairs */
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const a = (FIG_ROUND_DEG[n] * Math.PI) / 180;
      const x = CX + R * Math.sin(a), y = CY - R * Math.cos(a);
      const s = seats[n] || {};
      svg.append(el('rect', { x: x - H, y: y - H, width: 2 * H, height: 2 * H, rx: 8, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 3 }));
      D.seat(svg, x, y, n, { you: !!s.you, top: n === 1 });
      if (!s.who) continue;
      const o = { size: 9, weight: 900, color: s.you ? C.red : '#555' };
      if (n === 1) D.label(svg, x, y - H - 4, s.who, o);
      else if (FIG_ROUND_DEG[n] > 180) D.label(svg, x - H - 4, y + 3.5, s.who, Object.assign({ anchor: 'end' }, o));
      else D.label(svg, x + H + 4, y + 3.5, s.who, Object.assign({ anchor: 'start' }, o));
    }
  }

  KY.defineStage({
    id: '6-3',
    chapter: 6,
    title: { jp: '{円卓|えんたく}では どこに {座|すわ}る？', en: 'Where to Sit at a Round Table' },
    intro: { jp: '{中国|ちゅうごく}{料理|りょうり}の おみせで、お{客様|きゃくさま}たちと {上司|じょうし}と {食事|しょくじ}を します。', en: 'You are having a business dinner with clients and your boss at a Chinese restaurant.' },
    time: 14000,
    mechanic: 'place',
    setup(scene) {
      const { el, g } = KY.svg;
      scene.camera({ zoom: 1.05, x: 180, y: 300 });
      scene.add('bg', P.roomTop({ x: 20, y: 90, w: 320, h: 420, door: { wall: 'bottom', at: 134, w: 52 } }));
      scene.add('bg', P.roundTableTop({ x: TB.x, y: TB.y, r: TB.r }));
      scene.add('bg', el('circle', { cx: TB.x, cy: TB.y, r: 38, fill: 'none', stroke: '#dcdcdc', 'stroke-width': 3 }));
      scene.add('bg', el('circle', { cx: TB.x, cy: TB.y, r: 5, fill: '#dcdcdc' }));
      SEAT6.forEach((s, k) => {
        const chair = P.chairTop({ x: s.x, y: s.y, back: 'top' });
        scene.add('bg', g({ transform: `rotate(${k * 60} ${s.x} ${s.y})` }, [chair.el]));
      });
      scene.label(180, 532, { jp: '{入口|いりぐち}', en: 'Door' });
      const boss = scene.person({ top: true, x: 116, y: 484, dir: 0, tag: WHO.boss });
      const client = scene.person({ top: true, x: 244, y: 484, dir: 0, tag: WHO.customer });
      const client2 = scene.person({ top: true, x: 292, y: 474, dir: 0, tag: WHO.customer });
      const player = scene.person({ top: true, x: 66, y: 476, dir: 0, color: 'player', player: true });
      return { boss, client, client2, player };
    },
    params: {
      item: 'player',
      script: [
        [300, (s, r) => s.say(r.client, { jp: '{中華|ちゅうか}、{楽|たの}しみです！', en: "Chinese food — I'm looking forward to it!" }, { dur: 3000 })],
        [3600, (s, r) => s.say(r.client2, { jp: 'おなかが ぺこぺこです。', en: "I'm starving." }, { dur: 2200 })],
      ],
      zones: [
        { id: 'far', x: SEAT6[0].x, y: SEAT6[0].y, r: 28, outcome: 'top' },
        { id: 'right-top', x: SEAT6[1].x, y: SEAT6[1].y, r: 28, outcome: 'side' },
        { id: 'right-bottom', x: SEAT6[2].x, y: SEAT6[2].y, r: 28, outcome: 'side' },
        { id: 'near', x: SEAT6[3].x, y: SEAT6[3].y, r: 28, outcome: 'great' },
        { id: 'left-bottom', x: SEAT6[4].x, y: SEAT6[4].y, r: 28, outcome: 'side' },
        { id: 'left-top', x: SEAT6[5].x, y: SEAT6[5].y, r: 28, outcome: 'side' },
      ],
      onPlace(scene, r, zone) {
        const mine = { far: 0, 'right-top': 1, 'right-bottom': 2, near: 3, 'left-bottom': 4, 'left-top': 5 }[zone.id];
        r.player.set({ dir: (mine * 60 + 180) % 360 });
        let plan;
        if (mine === 3) plan = { client: 0, client2: 1, boss: 5 };
        else if (mine === 0) plan = { client: 1, client2: 2, boss: 5 };
        else plan = { client: 0, client2: [1, 5, 2, 4].filter(k => k !== mine)[0], boss: 3 };
        ['client', 'client2', 'boss'].forEach((who, i) => scene.after(i * 260, () => {
          const k = plan[who];
          follow(scene, r[who], roundRoute(k), 0.5, () => r[who].set({ dir: (k * 60 + 180) % 360 }));
        }));
        return 2300;
      },
      timeout: 'stand',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.boss, line: { jp: '{入口|いりぐち}の{席|せき}か。{注文|ちゅうもん}は{任|まか}せた！', en: "The seat by the door. I'll leave the ordering to you!" } },
      side: { grade: 'ok', who: WHO.boss, line: { jp: '（…{入口|いりぐち}の{席|せき}は{私|わたし}か。{注文|ちゅうもん}も{私|わたし}か…）', en: '(...So I get the seat by the door? And I do the ordering too...?)' },
        react(scene, r) { r.boss.mark('sweat2'); } },
      top: { grade: 'ky', who: WHO.boss, line: { jp: 'そこは お{客様|きゃくさま}の {席|せき}だよ！', en: "That's the client's seat!" },
        react(scene, r) { r.boss.mark('shock'); r.client.mark('q'); r.client2.mark('dots'); } },
      stand: { grade: 'ky', who: WHO.boss, line: { jp: '{早|はや}く{座|すわ}って。{料理|りょうり}が{来|き}ちゃうよ。', en: 'Sit down already. The food is coming!' } },
    },
    card: {
      badge: 'must',
      name: { jp: '{円卓|えんたく}の {上座|かみざ}', en: 'The top seat at a round table' },
      points: [
        { jp: '{入口|いりぐち}から いちばん はなれた {席|せき}が {上座|かみざ}です。お{客様|きゃくさま}の いちばん {上|うえ}の {人|ひと}が {座|すわ}ります。', en: 'The seat farthest from the entrance is the top seat. The guests\' most senior person sits there.' },
        { jp: 'ほかの お{客様|きゃくさま}は、{上座|かみざ}の {右|みぎ}と {左|ひだり}に、{立場|たちば}が {上|うえ}の {人|ひと}から じゅんに {座|すわ}ります。', en: 'The other guests sit on both sides of the top seat, in order of rank.' },
        { jp: 'いちばん {下|した}の {人|ひと}は {入口|いりぐち}の {近|ちか}くに {座|すわ}って、{注文|ちゅうもん}や {店|みせ}の {人|ひと}との やりとりを します。', en: 'The most junior host sits near the entrance and handles the orders and the staff.' },
      ],
      phrase: { jp: '{注文|ちゅうもん}は {私|わたし}が いたします', ro: 'chūmon wa watashi ga itashimasu', en: 'I will take care of the order.' },
      why: { jp: '{円卓|えんたく}では、{入口|いりぐち}から いちばん はなれた {席|せき}が {上座|かみざ}です。{入口|いりぐち}の ちかくは {人|ひと}が {通|とお}るので、{下座|しもざ}に なります。{国|くに}に よっては お{金|かね}を はらう {人|ひと}が {上座|かみざ}に {座|すわ}りますが、{日本|にほん}の ビジネスでは お{客様|きゃくさま}に すすめます。', en: 'At a round table the seat farthest from the door is the top seat; near the door, people keep passing, so it is the lowest. In some countries the person who pays takes the top seat, but in Japanese business you offer it to the guest.' },
      dont: { jp: '{入口|いりぐち}から いちばん はなれた {席|せき}に、{自分|じぶん}から {座|すわ}らない。', en: "Don't take the seat farthest from the entrance yourself." },
      diagram(svg) {
        const D = KY.diag, { el } = KY.svg;
        D.room(svg, { x: 30, y: 6, w: 140, h: 128, door: 'b' });
        svg.append(el('circle', { cx: 100, cy: 66, r: 34, fill: '#fbfaf7', stroke: '#9a9a9a', 'stroke-width': 2.5 }));
        [[1, 0, { top: true }], [2, 60], [4, 120], [6, 180, { you: true }], [5, 240], [3, 300]].forEach(([n, a, o]) => {
          const t = (a * Math.PI) / 180;
          D.seat(svg, 100 + 48 * Math.sin(t), 66 - 48 * Math.cos(t), n, o || {});
        });
      },
      figure: {
        viewBox: FIG_ROUND_VB,
        draw(svg) {
          figRound(svg, { seats: {
            /* the people of this stage: two guests, your boss, you */
            1: { who: 'おきゃくさま' }, 2: { who: 'おきゃくさま' }, 3: { who: 'じょうし' },
            4: {}, 5: {}, 6: { you: true, who: 'あなた' },
          } });
        },
        rule: { jp: '{入口|いりぐち}から いちばん はなれた {席|せき}が {上座|かみざ}、いちばん {近|ちか}い {席|せき}が {下座|しもざ}です。', en: 'The seat farthest from the entrance is the top seat; the seat nearest the entrance is the lowest.' },
        legend: [
          { n: 1, top: true, jp: '{上座|かみざ}。{入口|いりぐち}から いちばん はなれた {席|せき}です。お{客様|きゃくさま}の いちばん {上|うえ}の {人|ひと}が {座|すわ}ります。', en: 'Kamiza, the top seat: farthest from the entrance. The most senior guest sits here.' },
          { n: 2, jp: '{上座|かみざ}の となりです。つぎに {上|うえ}の お{客様|きゃくさま}が {座|すわ}ります。', en: 'Next to the top seat. The next most senior guest sits here.' },
          { n: 3, jp: '{上座|かみざ}の はんたいがわの となりです。お{客様|きゃくさま}が {二人|ふたり}なので、{上司|じょうし}が {座|すわ}ります。', en: 'Next to the top seat, on the other side. With two guests, your boss sits here.' },
          { n: 4, jp: '{入口|いりぐち}に {近|ちか}い {席|せき}です。{人|ひと}が {多|おお}い ときに {使|つか}います。', en: 'Closer to the entrance. Used when there are more people.' },
          { n: 5, jp: '4と おなじです。', en: 'Same as 4.' },
          { n: 6, you: true, jp: '{下座|しもざ}。{入口|いりぐち}に いちばん {近|ちか}い {席|せき}です。あなたが {座|すわ}って、{注文|ちゅうもん}を します。', en: 'Shimoza, the lowest seat: nearest the entrance. You sit here and handle the order.' },
        ],
      },
    },
    test: { great: 'near', ok: 'right-top', ky: 'far' },
  });

  /* ------------------------------------------------------------------ 6-4 */
  /* the mirror image of 2-6: now the client visits YOUR company, and you guide them (the red thing is the client) */
  KY.defineStage({
    id: '6-4',
    chapter: 6,
    title: { jp: 'お{客様|きゃくさま}の {席|せき}は どこ？', en: 'Where to Seat Your Guest' },
    intro: { jp: 'あなたの {会社|かいしゃ}に お{客様|きゃくさま}が {来|き}て、{応接室|おうせつしつ}に つれて いきます。', en: 'A client has come to your office, and you are taking them to the reception room.' },
    time: 12000,
    mechanic: 'place',
    setup(scene) {
      scene.camera({ zoom: 1.08, x: 180, y: 290 });
      scene.add('bg', P.roomTop({ x: 30, y: 100, w: 300, h: 360, door: { wall: 'left', at: 30, w: 52 } }));
      scene.add('bg', P.sofaTop({ x: 200, y: 152, w: 160, h: 52, seats: 2, back: 'top' }));
      scene.add('bg', P.tableTop({ x: 200, y: 258, w: 150, h: 80 }));
      scene.add('bg', P.armchairTop({ x: 160, y: 366, back: 'bottom' }));
      scene.add('bg', P.armchairTop({ x: 240, y: 366, back: 'bottom' }));
      scene.label(56, 452, { jp: '{入口|いりぐち}', en: 'Door' });
      /* names of the furniture (removed once the guest sits) */
      const names = [
        scene.label(200, 166, { jp: 'ソファ', en: 'Sofa' }, 'name'), scene.label(200, 258, { jp: 'テーブル', en: 'Table' }, 'name'),
        scene.label(160, 362, { jp: 'いす', en: 'Chair' }, 'name'), scene.label(240, 362, { jp: 'いす', en: 'Chair' }, 'name'),
      ];
      const host = scene.person({ top: true, x: 76, y: 362, dir: 90, tag: WHO.me });
      const client = scene.person({ top: true, x: 114, y: 430, dir: 0, color: 'player', player: true, tag: WHO.customer });
      return { host, client, names };
    },
    params: {
      item: 'client',
      zones: [
        { id: 'sofa-far', x: 240, y: 158, outcome: 'great' },
        { id: 'sofa-near', x: 160, y: 158, outcome: 'near' },
        { id: 'chair-left', x: 160, y: 362, outcome: 'chair' },
        { id: 'chair-right', x: 240, y: 362, outcome: 'chair' },
      ],
      onPlace(scene, r, zone) {
        r.names.forEach(n => scene.removeOverlay(n));
        const guestSeat={x:zone.x,y:zone.y};
        /* 1. After dropping, invite the guest. 2. Guest moves. 3. Host sits. */
        scene.say(r.host,{jp:'こちら どうぞ。',en:'Please sit here.'},{dur:1300,cls:'mine'});
        r.client.moveTo(120,430);
        scene.after(1200,()=>scene.glide(r.client,guestSeat,800,'inout',()=>r.client.set({dir:zone.y<250?180:0})));
        const seat=zone.id==='chair-left'?{x:240,y:362}:{x:160,y:362};
        scene.after(2200,()=>follow(scene,r.host,[seat],0.45,()=>r.host.set({dir:0})));
        return 2900;
      },
      timeout: 'stand',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: '（{上座|かみざ}に{案内|あんない}してもらえた…{大切|たいせつ}にされてるな）', en: '(He guided me to the best seat... I feel valued.)' } },
      near: { grade: 'ok', who: WHO.customer, line: { jp: '（{入口|いりぐち}に{近|ちか}い{方|ほう}か…まあ、{座|すわ}れればいいか）', en: '(The seat nearer the door... well, as long as I can sit.)' },
        react(scene, r) { r.client.mark('sweat'); } },
      chair: { grade: 'ky', who: WHO.customer, line: { jp: '（え、こっち？）', en: '(Huh, this one?)' },
        react(scene, r) { r.client.mark('q'); r.host.mark('sweat2'); } },
      stand: { grade: 'ky', who: WHO.customer, line: { jp: '…あの、{座|すわ}ってもいいですか？', en: '...Um, may I sit down?' },
        react(scene, r) { r.client.mark('dots'); r.host.mark('sweat'); } },
    },
    card: {
      badge: 'must',
      name: { jp: 'お{客様|きゃくさま}を {上座|かみざ}へ', en: 'Guiding a guest to the top seat' },
      points: [
        { jp: '{入口|いりぐち}から いちばん はなれた {席|せき}に、お{客様|きゃくさま}を つれて いきます。', en: 'Take the guest to the seat farthest from the door.' },
        { jp: '{長|なが}い ソファは お{客様|きゃくさま}の {席|せき}です。{一人|ひとり}がけの いすは、{自分|じぶん}の {会社|かいしゃ}の {人|ひと}の {席|せき}です。', en: 'The long sofa is for guests; the single armchairs are for your own side.' },
        { jp: 'お{客様|きゃくさま}が {座|すわ}るまで、{自分|じぶん}たちは {立|た}って {待|ま}ちます。', en: 'You stay standing until the guest has sat down.' },
      ],
      phrase: { jp: 'どうぞ、こちらに <<おかけください>>', ro: 'dōzo, kochira ni okake kudasai', en: 'Please, have a seat here.' },
      why: { jp: '2-6の ぎゃくの {場面|ばめん}です。こんどは {自分|じぶん}の {会社|かいしゃ}に お{客様|きゃくさま}が {来|き}ます。{入口|いりぐち}から いちばん はなれた {席|せき}は、いつも {大切|たいせつ}な {人|ひと}の {席|せき}です。', en: 'This is the mirror image of 2-6: now the guest comes to your office. The seat farthest from the door always belongs to the most important person.' },
      dont: { jp: 'お{客様|きゃくさま}に、{一人|ひとり}がけの いすを すすめない。', en: "Don't offer a single armchair to your guest." },
      diagram(svg) {
        const D = KY.diag;
        D.room(svg, { x: 30, y: 8, w: 140, h: 128, door: 'bl' });
        D.rect(svg, 62, 18, 92, 26, { r: 8 });
        D.rect(svg, 70, 56, 76, 38, { r: 4, fill: '#fbfaf7' });
        D.rect(svg, 66, 104, 30, 24, { r: 6 });
        D.rect(svg, 120, 104, 30, 24, { r: 6 });
        D.seat(svg, 132, 31, 1, { you: true });
        D.seat(svg, 84, 31, 2);
        D.seat(svg, 135, 116, 3);
        D.seat(svg, 81, 116, 4);
        D.label(svg, 108, 80, 'テーブル');
      },
      figure: {
        draw(svg) {
          KY.diag.reception(svg, {
            seats: { 1: { who: 'おきゃくさま', you: true }, 2: { who: 'おきゃくさま' }, 3: { who: 'じょうし' }, 4: { who: 'あなた' } },
            sofaNote: 'ソファ ・ おきゃくさまの せき', chairNote: 'ひとりがけの いす ・ じぶんの かいしゃの せき',
          });
        },
        rule: { jp: '{長|なが}い ソファが お{客様|きゃくさま}の {席|せき}です。おなじ いすでは、{入口|いりぐち}から はなれた ほうが {上|うえ}です。', en: 'The long sofa is for the guests. On the same kind of seat, the one farther from the door ranks higher.' },
        legend: [
          { n: 1, you: true, jp: '{上座|かみざ}。いちばん いい {席|せき}です。お{客様|きゃくさま}を ここへ つれて いきます。', en: 'Kamiza, the best seat. Take your guest here.' },
          { n: 2, jp: 'お{客様|きゃくさま}が {二人|ふたり}の ときの、もう {一人|ひとり}の {席|せき}です。', en: 'For a second guest, if there are two.' },
          { n: 3, jp: '{自分|じぶん}の {会社|かいしゃ}の {上司|じょうし}が {座|すわ}ります。', en: 'For your own boss.' },
          { n: 4, jp: '{下座|しもざ}。{入口|いりぐち}に いちばん {近|ちか}い {席|せき}です。あなたが {座|すわ}ります。', en: 'Shimoza, the seat nearest the door. You sit here.' },
        ],
      },
    },
    test: { great: 'sofa-far', ok: 'sofa-near', ky: 'chair-left' },
  });

  /* ------------------------------------------------------------------ 6-5 */
  const HOLD = { f: [80, 16], b: [72, 22] };

  /* a paper bag (side view); red while it is the thing the player operates */
  function giftBag({ x, y }) {
    const { el, g, set, C } = KY.svg;
    const handle = el('path', { d: 'M-11 -52 Q-11 -70 0 -70 Q11 -70 11 -52', fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
    const body = el('rect', { x: -23, y: -52, width: 46, height: 52, rx: 3, 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
    const fold = el('line', { x1: -23, y1: -41, x2: 23, y2: -41, 'stroke-width': 2 });
    const logo = el('circle', { cx: 0, cy: -22, r: 7, fill: 'none', 'stroke-width': 2.5 });
    const hit = el('rect', { x: -34, y: -84, width: 68, height: 90, fill: 'transparent' });
    const wrap = g({ transform: `translate(${x} ${y})` }, [hit, handle, body, fold, logo]);
    const c = { el: wrap, x, y };
    c.pos = () => ({ x: c.x, y: c.y });
    c.moveTo = (nx, ny) => { c.x = nx; c.y = ny; set(wrap, { transform: `translate(${nx} ${ny})` }); if (c.carry) c.carry.moveTo(nx, ny - 62); };
    c.setRed = on => {
      const s = on ? C.red : C.line;
      set(body, { stroke: s, fill: on ? C.redSoft : '#eeeeee' });
      set(handle, { stroke: s });
      set(fold, { stroke: on ? C.red : C.soft });
      set(logo, { stroke: on ? C.red : C.soft });
    };
    c.setRed(true);
    return c;
  }

  /* the gift box peeking out of the bag (a quiet prop; it moves together with the bag) */
  function giftBox({ x, y }) {
    const { el, g, set } = KY.svg;
    const body = el('rect', { x: -19, y: -13, width: 38, height: 26, rx: 2, fill: '#fafafa', stroke: '#a9a9a9', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
    const band = el('line', { x1: 5, y1: -13, x2: 5, y2: 13, stroke: '#d2d2d2', 'stroke-width': 3 });
    const seal = el('circle', { cx: -9, cy: 0, r: 5, fill: 'none', stroke: '#a9a9a9', 'stroke-width': 2.2 });
    const wrap = g({ transform: `translate(${x} ${y})` }, [body, band, seal]);
    const c = { el: wrap, x, y };
    c.moveTo = (nx, ny) => { c.x = nx; c.y = ny; set(wrap, { transform: `translate(${nx} ${ny})` }); };
    return c;
  }

  /* where the two of them sit down at 10.5 s (same spots as the chairs in 6-7) */
  const GIFT_SIT = { player: 82, client: 280 };
  const GIVE_GAP = 84;   // how close you stand to the client when you hand the gift over
  const GIVE_LINE = { jp: '<<{出張|しゅっちょう}>>に {行|い}った ときの お{土産|みやげ}です。よろしければ {皆様|みなさま}で どうぞ <<お{召|め}し{上|あ}がりください>>。', en: "It's a souvenir from my business trip. Please enjoy it with everyone." };

  KY.defineStage({
    id: '6-5',
    chapter: 6,
    title: { jp: 'お{土産|みやげ}は いつ わたす？', en: 'When to Hand Over a Souvenir' },
    intro: { jp: 'お{客様|きゃくさま}の {応接室|おうせつしつ}に {入|はい}りました。<<{出張|しゅっちょう}>>の お{土産|みやげ}を {持|も}って います。', en: "You have entered the client's reception room, carrying a souvenir from your business trip." },
    time: 16000,
    mechanic: 'action',
    setup(scene) {
      scene.camera({ zoom: 1.2, x: 170, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 196, y: 196, w: 92, h: 70 }));
      scene.add('mid', P.seat({ x: 76, back: 'left' }));
      scene.add('mid', P.seat({ x: 286, back: 'right' }));
      const player = scene.person({ x: 112, y: 470, facing: 1, color: 'player', player: true });
      const client = scene.person({ x: 248, y: 470, facing: -1, tag: WHO.customer });
      /* where the client's held-out hand is, standing and sitting (the bag goes there) */
      const handOf = (p, patch) => {
        const keep = { x: p.o.x, pose: p.o.pose };
        p.set(Object.assign({ arms: HOLD }, patch));
        const h = p.hand();
        p.set({ x: keep.x, pose: keep.pose, arms: null });
        return h;
      };
      const ch = handOf(client), chSit = handOf(client, { pose: 'sit', x: GIFT_SIT.client });
      const box = giftBox({ x: 146, y: 408 });
      scene.add('mid', box);
      const bag = giftBag({ x: 146, y: 470 });
      bag.carry = box;
      scene.add('mid', bag);
      return { player, client, bag, box, their: { x: ch.x - 16, y: ch.y - 2 }, theirSit: { x: chSit.x - 16, y: chSit.y - 2 } };
    },
    params: {
      start(scene, r) {
        let done = false, handed = false, greeted = false, started = false, seated = false;
        const HOME = { x: 146, y: 470 };
        const end = key => { if (done) return; done = true; scene.end(key); };

        /* every bubble is remembered, so the hand-over can clear the room of old speech */
        const bubs = [];
        const say = (p, t, o) => { const b = scene.say(p, t, o); bubs.push(b); return b; };
        const clearBubs = () => { bubs.forEach(b => { if (b.isConnected) scene.removeOverlay(b); }); bubs.length = 0; };

        /* the meeting: greeting (to 3.2 s) → small talk → "please sit" → both sit (10.5 s) → "let's start" (12.5 s: the business talk begins) */
        scene.at(400, () => say(r.client, { jp: '{本日|ほんじつ}は、わざわざ ありがとうございます。', en: 'Thank you for coming all this way today.' }, { dur: 2800, lift: 26 }));
        scene.at(3200, () => { greeted = true; });
        scene.at(3400, () => { if (!handed) say(r.player, { jp: 'こちらこそ、お{時間|じかん}を いただき ありがとうございます。', en: 'Thank you for making time for me.' }, { dur: 2400, cls: 'mine', lift: 24 }); });
        scene.at(9500, () => { if (!handed) say(r.client, { jp: 'では、どうぞ お{掛|か}けください。', en: 'Well then, please have a seat.' }, { dur: 2400, lift: 26 }); });
        scene.at(10500, () => {
          if (handed) return;
          seated = true;
          [[r.player, GIFT_SIT.player, 1], [r.client, GIFT_SIT.client, -1]].forEach(([p, x, f]) =>
            scene.walk(p, x, 480, () => p.set({ pose: 'sit', x, facing: f, walk: 0 })));
        });
        scene.at(12500, () => { started = true; if (!handed) say(r.client, { jp: 'さっそくですが…', en: "Let's get right to it..." }, { dur: 2400, lift: 26 }); });

        /* the red bag: tap it, or drag it toward the client — the gift is handed over */
        function give() {
          if (handed || done) return;
          handed = true;
          /* great = after the greeting, before the business talk starts (sitting down in between does not matter) */
          const key = started ? 'late' : greeted ? 'great' : 'interrupt';
          clearBubs();
          KY.sfx.play('drop');
          r.bag.setRed(false);
          r.bag.el.classList.remove('hit', 'dragging');
          r.bag.el.style.pointerEvents = 'none';
          /* hand it over, never toss it: take the box in both hands, walk up to the client, then hand to hand */
          r.bag.carry = null;
          if (r.bag.x !== HOME.x || r.bag.y !== HOME.y) scene.glide(r.bag, HOME, 300, 'out');
          r.player.el.parentNode.insertBefore(r.bag.el, r.player.el);   // the bag stays on the floor behind you
          if (seated) r.player.set({ pose: 'stand' });
          r.player.set({ arms: HOLD, facing: 1 });
          const held = () => { const h = r.player.hand(); return { x: h.x + 8, y: h.y - 4 }; };
          scene.glide(r.box, held(), 260, 'out');
          scene.after(280, () => {
            const stick = scene.every(() => { const h = held(); r.box.moveTo(h.x, h.y); });
            scene.walk(r.player, (seated ? GIFT_SIT.client : r.client.o.x) - GIVE_GAP, 760, () => {
              stick();
              r.player.set({ arms: HOLD, facing: 1 });
              r.client.set({ arms: HOLD });
              say(r.player, GIVE_LINE, { dur: 3000, cls: 'mine' });
              const to = seated ? r.theirSit : r.their;
              scene.after(500, () => scene.glide(r.box, { x: to.x - 4, y: to.y }, 360, 'inout'));
            });
          });
          scene.after(2700, () => end(key));
        }

        let off = null, p0 = null, moved = 0;
        scene.onDrag(r.bag.el, {
          start(p) { if (handed) return; p0 = p; moved = 0; off = { x: p.x - r.bag.x, y: p.y - r.bag.y }; },
          move(p) {
            if (handed || !off) return;
            moved = Math.max(moved, Math.hypot(p.x - p0.x, p.y - p0.y));
            if (moved < 9) return;
            r.bag.moveTo(clamp(p.x - off.x, 100, 240), clamp(p.y - off.y, r.their.y + 24, 470));
          },
          end() {
            if (handed || !off) return;
            off = null;
            if (moved < 9 || r.bag.x >= 190) give();
            else scene.glide(r.bag, HOME, 220, 'out');
          },
        }, 'Paper bag with the gift (tap it, or drag it to the client)');
        r.bag.el.addEventListener('keydown', e => {
          if (scene.locked || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault();
          give();
        });

        /* a hand-over that has already started always finishes with its own outcome */
        scene.timer(scene.def.time, () => { if (!handed) end('forgot'); });
        scene._gift = { give };
      },
      /* input: { at: ms } hands the bag over at that time | null does nothing */
      simulate(scene, r, input) {
        if (input && typeof input.at === 'number') scene.at(input.at, () => scene._gift.give());
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: 'ありがとうございます。みなで いただきます。', en: 'Thank you. We will all enjoy it together.' },
        react(scene, r) { r.client.mark('sparkle'); } },
      interrupt: { grade: 'ok', who: WHO.customer, line: { jp: '（まだ あいさつの {途中|とちゅう}だったのに…）', en: '(I was still in the middle of greeting him...)' },
        react(scene, r) { r.client.mark('sweat'); r.player.mark('sweat2'); } },
      late: { grade: 'ok', who: WHO.customer, line: { jp: '（{話|はなし}の {途中|とちゅう}で…{止|と}まっちゃったな）', en: '(Right in the middle of the talk... that stopped the flow.)' },
        react(scene, r) { r.client.mark('dots'); r.player.mark('sweat'); } },
      forgot: { grade: 'ky', who: WHO.you, line: { jp: '（{持|も}って{帰|かえ}っちゃった…）', en: '(I took it home with me...)' },
        react(scene, r) { r.player.mark('sweat2'); r.client.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: 'お{土産|みやげ}を わたす タイミング', en: 'When to hand over a souvenir' },
      points: [
        { jp: 'あいさつが おわったら、{仕事|しごと}の {話|はなし}が はじまる {前|まえ}に わたします。', en: 'Hand it over once the greetings are done, before the business talk starts.' },
        { jp: '{会|あ}って すぐ、あいさつの {前|まえ}や {途中|とちゅう}には わたしません。', en: "Don't hand it over right when you meet, before or in the middle of the greetings." },
        { jp: 'わたす ときは、「<<{出張|しゅっちょう}>>の お{土産|みやげ}です」などと、ひとこと {言|い}います。', en: 'Say a word as you hand it over, e.g. "a souvenir from my business trip".' },
      ],
      phrase: { jp: GIVE_LINE.jp.replace(/。$/, ''), ro: 'Shucchō ni itta toki no omiyage desu. Yoroshikereba minasama de dōzo omeshiagari kudasai.', en: GIVE_LINE.en },
      why: { jp: '{仕事|しごと}の {話|はなし}が はじまると、わたす タイミングが なくなります。{帰|かえ}る ときまで {持|も}って いると、わすれる ことも あります。', en: 'Once the business talk begins, the moment to give it is gone. If you hold on to it until you leave, you may forget.' },
      dont: { jp: 'わたすのを わすれない。{相手|あいて}の あいさつの {途中|とちゅう}に わたさない。', en: "Don't forget to hand it over. Don't hand it over while the other person is still greeting you." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        [[34, 1, ['あいさつ']], [100, 2, ['わたす']], [166, 3, ['しごとの', 'はなし']]].forEach(([cx, n, t], i) => {
          const you = i === 1;
          D.seat(svg, cx, 28, n, you ? { you: true } : {});
          D.rect(svg, cx - 27, 46, 54, 36, { r: 10, stroke: you ? C.red : '#9a9a9a', fill: you ? C.redSoft : '#fff' });
          t.forEach((line, k) => D.label(svg, cx, (t.length > 1 ? 61 : 68) + k * 12, line, { size: t.length > 1 ? 10 : 11, weight: 900, color: you ? C.red : C.ink }));
        });
        D.arrow(svg, 62, 64, 72, 64);
        D.arrow(svg, 128, 64, 138, 64);
        D.arrow(svg, 100, 102, 100, 88, { color: C.red });
        D.label(svg, 100, 118, 'ここで わたす', { color: C.red, size: 11, weight: 900 });
      },
    },
    test: { great: { at: 6000 }, ok: { at: 1500 }, ky: null },
  });

  /* ------------------------------------------------------------------ 6-6 */
  KY.defineStage({
    id: '6-6',
    chapter: 6,
    title: { jp: '{謝罪|しゃざい}の <<お{辞儀|じぎ}>>', en: 'The Apology Bow' },
    intro: { jp: 'システムの {障害|しょうがい}で、お{客様|きゃくさま}に めいわくを かけました。あやまりに {来|き}ました。', en: "Your system went down and caused the client trouble. You have come to apologize." },
    time: 10000,
    mechanic: 'adjust',
    setup(scene) {
      scene.camera({ zoom: 1.3, x: 180, y: 410 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.door({ x: 46, floor: 470, w: 54, h: 140 }));
      const player = scene.person({ x: 120, y: 470, facing: 1, color: 'player', player: true });
      const c1 = scene.person({ x: 232, y: 470, facing: -1, tag: WHO.customer, mark: 'anger' });
      const c2 = scene.person({ x: 286, y: 470, facing: -1, mark: 'anger' });
      return { player, c1, c2 };
    },
    params: {
      target: 'player',
      label: 'You (hold to bow)',
      input: 'hold',
      min: 0, max: 100, start: 0,
      speed: 38,
      commit: 'release',
      settle: 1500,
      script: [
        [200, (s, r) => s.say(r.player, { jp: 'この{度|たび}は、{大変|たいへん}<<{申|もう}し{訳|わけ}ございませんでした>>。', en: 'We are truly sorry for what happened.' }, { dur: 2800, cls: 'mine' })],
      ],
      /* hold to the very end → 土下座 (dogeza) */
      apply(scene, r, v) {
        if (v >= 97) r.player.set({ pose: 'dogeza', bow: 88 });
        else r.player.set({ pose: 'stand', bow: Math.min(v, 90) });
      },
      check(v) { return v >= 99 ? 'dogeza' : null; },
      judge(v, info) {
        if (!info.touched) return 'none';
        if (v < 20) return 'shallow';
        if (v < 38) return 'polite';
        if (v <= 62) return 'great';
        return 'deep';
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: '…{頭|あたま}を{上|あ}げてください。{今後|こんご}の{対策|たいさく}を{聞|き}かせてください。', en: '...Please raise your head. Tell us how you will prevent this.' },
        react(scene, r) { r.c1.mark(null); r.c2.mark('dots'); } },
      polite: { grade: 'ok', who: WHO.customer, line: { jp: 'それ、いつもの{挨拶|あいさつ}の{角度|かくど}ですよね？', en: "Isn't that your everyday greeting bow?" } },
      shallow: { grade: 'ky', who: WHO.customer, line: { jp: '…{本当|ほんとう}に{悪|わる}いと{思|おも}っていますか？', en: '...Do you really think you did something wrong?' } },
      dogeza: { grade: 'ky', who: WHO.customer, line: { jp: 'ちょっ…{立|た}ってください！かえって{困|こま}ります！', en: 'W-wait, please stand up! That only makes things awkward!' },
        react(scene, r) { r.c1.mark('shock'); r.c2.mark('sweat2'); } },
      deep: { grade: 'ok', who: WHO.customer, line: { jp: 'そ、そこまで{深|ふか}く{下|さ}げなくても…。', en: "Y-you don't have to bow THAT deeply..." },
        react(scene, r) { r.c1.mark('sweat2'); r.c2.mark('sweat'); } },
      none: { grade: 'ky', who: WHO.customer, line: { jp: '…{何|なに}をしに{来|き}たんですか？', en: '...Why exactly did you come here?' } },
    },
    card: {
      badge: 'must',
      name: { jp: '<<お{辞儀|じぎ}>>の {角度|かくど}', en: 'Bow angles: 15°, 30°, 45°' },
      points: [
        { jp: '15°ぐらい：すれちがう とき、かるい あいさつ。', en: 'About 15°: passing someone, light greetings.' },
        { jp: '30°ぐらい：お{客様|きゃくさま}や {上|うえ}の {人|ひと}への あいさつ。', en: 'About 30°: greeting clients and seniors.' },
        { jp: '45°ぐらい：{深|ふか}い お{礼|れい}と、あやまる とき。（よび{方|かた}は {本|ほん}によって ちがいます）', en: 'About 45°: deep thanks and apologies. (Guides use different names for it.)' },
      ],
      phrase: { jp: '{大変|たいへん}<<{申|もう}し{訳|わけ}ございませんでした>>', ro: 'taihen mōshiwake gozaimasen deshita', en: 'I am terribly sorry.' },
      why: { jp: '<<お{辞儀|じぎ}>>の {深|ふか}さは、{気持|きも}ちの {強|つよ}さを {見|み}せます。あやまる ときは、{先|さき}に ことばを {言|い}って、それから {深|ふか}く {頭|あたま}を {下|さ}げて、{少|すこ}し {止|と}まります。', en: 'The depth of a bow shows how serious you are. Say the words first, then bow deeply, pause, and rise slowly.' },
      dont: { jp: '{話|はな}しながら <<お{辞儀|じぎ}>>しない。すぐに {頭|あたま}を {上|あ}げない。{土下座|どげざ}は やりすぎです。{人|ひと}に {土下座|どげざ}を させるのは ハラスメントです。', en: "Don't bow while talking or pop back up. Dogeza is far too much — and making someone do it is harassment." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 128);
        [[40, 15, '15°'], [100, 30, '30°'], [160, 45, '45°']].forEach(([x, b, t], i) => {
          D.person(svg, { x, y: 128, s: 0.7, bow: b, color: i === 2 ? 'player' : 'npc' });
          D.label(svg, x, 146, t, { color: i === 2 ? C.red : '#666', size: 10 });
        });
      },
    },
    test: { great: { value: 45 }, ok: { value: 30 }, ky: { value: 100, releaseAt: 6000 } },
  });

  /* ------------------------------------------------------------------ 6-7 */
  KY.defineStage({
    id: '6-7',
    chapter: 6,
    title: { jp: 'あやまりに {行|い}く', en: 'Going to Apologize' },
    intro: { jp: 'システムの トラブルで、お{客様|きゃくさま}に {迷惑|めいわく}を かけました。お{客様|きゃくさま}の {会社|かいしゃ}に {来|き}ました。', en: "A system problem caused trouble for the client. You have come to the client's office." },
    time: 12000,
    mechanic: 'choice',
    setup(scene) {
      scene.camera({ zoom: 1.25, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.clock({ x: 190, y: 228, r: 22, h: 3, m: 0 }));   /* a little high, so the long apology bubble clears it */
      scene.add('mid', P.seat({ x: 76, back: 'left' }));
      scene.add('mid', P.seat({ x: 286, back: 'right' }));
      const player = scene.person({ x: 82, y: 470, pose: 'sit', facing: 1, color: 'player', player: true });
      const client = scene.person({ x: 280, y: 470, pose: 'sit', facing: -1, tag: WHO.customer, mark: 'anger' });
      scene.add('mid', P.table({ x: 182, y: 420, w: 132 }));
      /* the tea was served before you came: plain props, nothing to operate */
      scene.add('fg', P.teaCup({ x: 142, y: 420 }));
      scene.add('fg', P.teaCup({ x: 222, y: 420 }));
      return { player, client, ask: null };
    },
    params: {
      script: [
        [400, (s, r) => { r.ask = s.say(r.client, { jp: '{今回|こんかい}の {件|けん}、どういう ことですか？', en: 'About this incident... what is going on?' }, { lift: 26 }); }],
      ],
      showAt: 2400,
      options: [
        { id: 'sorry', text: { jp: 'この{度|たび}は、{大変|たいへん} <<{申|もう}し{訳|わけ}ございませんでした>>。{原因|げんいん}と、これからの {対策|たいさく}を ご{説明|せつめい}いたします。', en: 'We are truly sorry for this. Let me explain the cause and what we will do from now on.' }, outcome: 'great' },
        { id: 'but', text: { jp: '{申|もう}し{訳|わけ}ありません。でも、{実|じつ}は {古|ふる}い システムの {仕様|しよう}が {原因|げんいん}でして…', en: "I'm sorry. But actually, the old system's specification was the cause..." }, outcome: 'but' },
        { id: 'blame', text: { jp: '{担当|たんとう}の {者|もの}が、{確認|かくにん}を {忘|わす}れて いまして…', en: 'The person in charge forgot to check...' }, outcome: 'blame' },
      ],
      onChoose(scene, r, opt) {
        if (r.ask && r.ask.isConnected) scene.removeOverlay(r.ask);
        scene.say(r.player, opt.text, { dur: 3200, cls: 'mine', lift: 24 });   /* lifted: clear of the client's tag */
        /* the real apology comes with a bow (sitting) */
        if (opt.id === 'sorry') {
          scene.tween({ from: 0, to: 24, dur: 450, step: v => r.player.set({ bow: v }) });
          scene.after(2800, () => scene.tween({ from: 24, to: 0, dur: 450, step: v => r.player.set({ bow: v }) }));
        }
        return 3400;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: '…わかりました。{聞|き}かせて ください。', en: '...I see. Please tell me.' },
        react(scene, r) { r.client.mark(null); } },
      but: { grade: 'ok', who: WHO.customer, line: { jp: '（あやまって すぐ「でも」か…）', en: '(He apologizes, and then right away says "but"...)' },
        react(scene, r) { r.client.mark('dots'); r.player.mark('sweat'); } },
      blame: { grade: 'ky', who: WHO.customer, line: { jp: '…{人|ひと}の せい ですか？', en: '...Are you blaming a person?' },
        react(scene, r) { r.client.mark('anger'); r.player.mark('sweat2'); } },
      silent: { grade: 'ky', who: WHO.customer, line: { jp: '…{何|なに}か おっしゃって ください。', en: '...Please say something.' },
        react(scene, r) { r.client.mark('anger'); r.player.mark('sweat2'); } },
    },
    card: {
      badge: 'must',
      name: { jp: 'まず あやまる', en: 'Apologize first' },
      points: [
        { jp: 'はじめに「<<{申|もう}し{訳|わけ}ございませんでした>>」と あやまります。', en: 'First, apologize with "mōshiwake gozaimasen deshita".' },
        { jp: 'その あとで、{原因|げんいん}と、これからの <<{対策|たいさく}>>を {話|はな}します。', en: 'After that, explain the cause and what you will do from now on.' },
        { jp: 'あやまって すぐ「でも」と {言|い}わない。だれかの せいに しない。', en: 'Do not say "but" right after the apology. Do not blame someone else.' },
      ],
      phrase: { jp: 'この{度|たび}は、{大変|たいへん} <<{申|もう}し{訳|わけ}ございませんでした>>', ro: 'kono tabi wa, taihen mōshiwake gozaimasen deshita', en: 'We are truly sorry for this.' },
      why: { jp: 'あやまる {前|まえ}に {理由|りゆう}を {話|はな}すと、「いいわけ」に {聞|き}こえます。{先|さき}に あやまると、{相手|あいて}も {話|はなし}を {聞|き}きやすく なります。', en: 'If you give reasons before apologizing, it sounds like an excuse. If you apologize first, the other person finds it easier to listen.' },
      dont: { jp: 'あやまる {前|まえ}に {理由|りゆう}を {話|はな}さない。ほかの {人|ひと}の せいに しない。', en: "Don't give the reason before apologizing. Don't blame other people." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        [[1, 'あやまる'], [2, 'げんいん'], [3, 'たいさく']].forEach(([n, t], i) => {
          const y = 8 + i * 46, you = i === 0;
          D.rect(svg, 28, y, 144, 32, { r: 10, stroke: you ? C.red : '#9a9a9a', fill: you ? C.redSoft : '#fff' });
          D.seat(svg, 48, y + 16, n, you ? { you: true } : {});
          D.label(svg, 112, y + 21, t, { size: 12, weight: 900, color: you ? C.red : C.ink });
          if (i < 2) D.arrow(svg, 100, y + 34, 100, y + 44, { color: i === 0 ? C.red : C.ink });
        });
      },
    },
    test: { great: 'sorry', ok: 'but', ky: 'blame' },
  });

  /* ------------------------------------------------------------------ 6-8 */
  KY.defineStage({
    id: '6-8',
    chapter: 6,
    title: { jp: 'お{客様|きゃくさま}の <<お{見送|みおく}り>>', en: 'Seeing Off the Client' },
    intro: { jp: '<<{打|う}ち{合|あ}わせ>>が おわって、お{客様|きゃくさま}が エレベーターで {帰|かえ}ります。', en: 'The meeting is over, and the client leaves by elevator.' },
    time: 10000,
    mechanic: 'adjust',
    setup(scene) {
      const { el } = KY.svg;
      const EX = 226;
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', el('rect', { x: EX - 75, y: 260, width: 150, height: 210, fill: '#eeeeea' }));
      /* the client stands inside the cabin (drawn behind the doors) */
      const client = scene.person({ x: EX, y: 465, view: 'front', layer: 'bg', tag: WHO.customer });
      const elev = P.elevatorFront({ x: EX, floor: 470, w: 150, h: 210, open: 1, floorLabel: '3' });
      elev.el.firstChild.setAttribute('fill', 'none');
      scene.add('mid', elev);
      const player = scene.person({ x: 96, y: 470, facing: 1, color: 'player', player: true });
      player.el.insertBefore(el('rect', { x: -30, y: -124, width: 60, height: 128, fill: 'transparent' }), player.el.firstChild);
      /* the doors start closing at 2.5 s and are shut at 6 s */
      scene.every((dt, t) => elev.setOpen(1 - KY.EASE.inout(clamp((t - 2500) / 3500, 0, 1))));
      return { player, client, elev };
    },
    params: {
      target: 'player',
      label: 'You (hold to bow)',
      input: 'hold',
      min: 0, max: 40, start: 0,
      speed: 20,
      fall: 90,
      commit: 'timeout',
      settle: 900,
      script: [
        [300, (s, r) => s.say(r.player, { jp: '{本日|ほんじつ}は ありがとうございました。', en: 'Thank you very much for today.' }, { dur: 2000, cls: 'mine' })],
        [2300, (s, r) => s.say(r.client, { jp: 'では、{失礼|しつれい}します。', en: 'Well then, goodbye.' }, { dur: 1800 })],
        [6000, (s, r) => { s.flag('closed'); if (r.client.tagEl) s.removeOverlay(r.client.tagEl); }],
      ],
      apply(scene, r, v) { if (!scene.ended) r.player.set({ bow: v }); },
      check(v, info) {
        const closed = info.flags.closed !== undefined;
        if (!closed) return info.touched && !info.held ? 'early' : null;
        if (!info.touched) return 'never';
        return info.held && v >= 15 ? 'great' : 'early';
      },
      judge(v, info) { return info.touched ? 'early' : 'never'; },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: '（{扉|とびら}が{閉|し}まるまで…{丁寧|ていねい}な{人|ひと}だ）', en: '(He kept bowing until the doors closed... what a courteous person.)' },
        react(scene, r) { scene.tween({ from: r.player.o.bow, to: 0, dur: 800, step: v => r.player.set({ bow: v }) }); r.player.mark('sparkle'); } },
      early: { grade: 'ky', who: WHO.customer, line: { jp: '（あ、{目|め}が{合|あ}った…）', en: '(Oh, our eyes met...)' },
        react(scene, r) { r.player.set({ bow: 0 }); r.player.mark('sweat'); r.client.mark('sweat2'); } },
      never: { grade: 'ky', who: WHO.customer, line: { jp: '（…{見送|みおく}りは、なしか）', en: '(...No send-off at all, huh.)' },
        react(scene, r) { r.client.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: 'エレベーターの <<お{見送|みおく}り>>', en: 'Seeing a guest off at the elevator' },
      points: [
        { jp: 'お{客様|きゃくさま}を エレベーターまで {送|おく}り、ドアが しまる まで <<お{辞儀|じぎ}>>を します。', en: 'See the guest to the elevator and bow until the doors close.' },
        { jp: '「{謎|なぞ}マナー」と {言|い}う {人|ひと}も います。でも、お{客様|きゃくさま}には、まだ {多|おお}くの {会社|かいしゃ}で します。', en: 'Some people call it a "mystery manner", but with clients it is still widely done.' },
        { jp: 'エレベーターが こんで いる ときは、かるい <<お{辞儀|じぎ}>>で {大丈夫|だいじょうぶ}です。', en: 'If the elevator is crowded, a light bow is enough.' },
      ],
      phrase: { jp: '{本日|ほんじつ}は ありがとうございました', ro: 'honjitsu wa arigatō gozaimashita', en: 'Thank you very much for today.' },
      why: { jp: 'お{客様|きゃくさま}の {顔|かお}が {見|み}えなく なる まで、「ありがとう」の {気持|きも}ちを {見|み}せます。さいごの ようすは、{相手|あいて}の {心|こころ}に のこります。', en: 'You show your thanks until the guest is out of sight. The last impression stays in their mind.' },
      dont: { jp: 'ドアが しまる {前|まえ}に {頭|あたま}を {上|あ}げない。{目|め}が あうと {変|へん}な {空気|くうき}に なります。', en: "Don't raise your head before the doors close — meeting eyes makes it awkward." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 128);
        D.person(svg, { x: 52, y: 128, s: 0.85, color: 'player', bow: 35 });
        D.rect(svg, 108, 30, 70, 98, { r: 2 });
        D.rect(svg, 108, 30, 35, 98, { r: 0, fill: '#eceff2' });
        D.rect(svg, 143, 30, 35, 98, { r: 0, fill: '#eceff2' });
        D.label(svg, 143, 20, '3', { size: 11, color: C.ink });
        D.label(svg, 80, 146, 'しまるまで', { color: C.red, size: 10 });
      },
    },
    test: { great: { value: 40, releaseAt: 9000 }, ky: { value: 30, releaseAt: 4000 } },
  });
})(typeof window !== 'undefined' ? window : globalThis);
