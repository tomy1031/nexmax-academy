/* Chapter 5 — After-Work Drinks (飲み会)
   Drinking is never pushed here: the player's own drink is a soft drink, and every card says soft drinks are fine. */
(function (root) {
  const KY = root.KY;
  const P = KY.props;
  /* KY.svg is not loaded when Node validates the stage data, so reach it lazily */
  const el = (...a) => KY.svg.el(...a);
  const g = (...a) => KY.svg.g(...a);
  const set = (...a) => KY.svg.set(...a);
  const C = new Proxy({}, { get: (_, k) => KY.svg.C[k] });

  KY.addGlossary({
    '座敷': { yomi: 'ざしき', jp: 'たたみの {部屋|へや}。くつを ぬいで {上|あ}がって、クッションに {座|すわ}ります。', en: 'tatami-floor room (zashiki)' },
    '床の間': { yomi: 'とこのま', jp: '{座敷|ざしき}に ある、かざりの {場所|ばしょ}。いちばん {大切|たいせつ}な {人|ひと}が その まえに {座|すわ}ります。', en: 'tokonoma: the decorative alcove in a tatami room' },
    '居酒屋': { yomi: 'いざかや', jp: 'お{酒|さけ}と {料理|りょうり}を {楽|たの}しむ {店|みせ}。', en: 'izakaya (Japanese-style pub)' },
    '酒': { yomi: 'さけ', jp: 'ビールや ワインなど、アルコールの {入|はい}った {飲|の}み{物|もの}。', en: 'alcohol / sake' },
    '飲み会': { yomi: 'のみかい', jp: '{会社|かいしゃ}の {人|ひと}などが {集|あつ}まって、{食|た}べたり {飲|の}んだり しながら {話|はな}す {会|かい}。', en: 'drinking party / get-together' },
    '乾杯': { yomi: 'かんぱい', jp: 'みんなで グラスを あげて「かんぱい」と {言|い}い、いっしょに {飲|の}みはじめる こと。', en: 'cheers / toast' },
    '酌': { yomi: 'しゃく', jp: '{相手|あいて}の グラスに {飲|の}み{物|もの}を {入|い}れて あげる こと。', en: 'pouring a drink for someone (shaku)' },
    'アルハラ': { yomi: 'アルハラ', jp: 'お{酒|さけ}を {飲|の}みたくない {人|ひと}に、{無理|むり}に すすめたり {飲|の}ませたり する こと。してはいけません。', en: 'alcohol harassment: pressuring someone to drink' },
    '二次会': { yomi: 'にじかい', jp: '{飲|の}み{会|かい}の あとに、ほかの {店|みせ}へ {行|い}って もういちど {集|あつ}まる こと。', en: 'second party / after-party' },
    '最後': { yomi: 'さいご', jp: 'いちばん あと。そのあとは もう ない こと。', en: 'last / final' },
    '遠慮': { yomi: 'えんりょ', jp: 'まわりの {人|ひと}を {考|かんが}えて、{自分|じぶん}が したい ことを やめる こと。', en: 'holding back out of consideration (enryo)' },
    '遠慮のかたまり': { yomi: 'えんりょのかたまり', jp: 'みんなで {食|た}べる おさらに、だれも {取|と}らないで {残|のこ}った {最後|さいご}の ひとつ。{関西|かんさい}で よく {使|つか}います。', en: 'the "lump of reserve": the last piece on a shared plate that nobody takes (a Kansai expression)' },
  });

  const WHO = {
    bucho: { jp: '{部長|ぶちょう}', en: 'Dept. Manager' },
    senior: { jp: '{先輩|せんぱい}', en: 'Senior colleague' },
  };

  /* ====================================================================
     stage-local helpers (candidates to promote into the engine)
     ==================================================================== */
  const FLOOR = 470;
  const SIT_Y = FLOOR + 14;                    // low-table sitting: the person's feet baseline sits below the floor line
  const TABLE_TOP = 446;                       // top surface of the low table
  const LEGS_OUT = { f: [88, 0], b: [84, 0] };  // legs stretched under the low table (hidden by it)
  const TEA = '#b98a5a';                       // oolong tea (neutral drink colour)
  const SIP = { f: [30, 130], b: [18, 46] };   // glass at the mouth
  const TOAST = { f: [112, 8], b: [18, 46] };  // glass held out to toast

  const hitArea = (c, x, y, w, h) => {
    c.el.insertBefore(el('rect', { x, y, width: w, height: h, fill: 'transparent' }), c.el.firstChild);
    return c;
  };

  /* P.glass in a neutral drink colour; remembers its position (px, py) */
  function glassOf({ x, y, level = 0.85, foam = 0, red = false, drink = null, h = 40, w = 22 }) {
    const c = P.glass({ x, y, h, w, level, foam, red });
    if (drink) c.el.firstChild.setAttribute('fill', drink);   // first child = the liquid rect
    c.px = x; c.py = y;
    return c;
  }
  function putAt(c, x, y) {
    c.px = x; c.py = y;
    set(c.el, { transform: `translate(${x} ${y})${c.sc ? ` scale(${c.sc})` : ''}` });
  }
  function slide(scene, c, to, ms, ease, done) {
    return scene.glide({ x: c.px, y: c.py, moveTo: (x, y) => putAt(c, x, y) }, to, ms, ease, done);
  }
  /* keep a glass in somebody's hand */
  function holdGlass(person, c, dx = 3, dy = 10) {
    const h = person.hand();
    putAt(c, h.x + dx * person.o.facing, h.y + dy);
  }

  /* a floor cushion seen from the side */
  const cushion = x => g({ transform: `translate(${x} ${FLOOR})` }, [
    el('rect', { x: -25, y: -9, width: 50, height: 9, rx: 4, fill: '#f3efe6', stroke: '#b5a98f', 'stroke-width': 2.5 }),
  ]);
  /* a person sitting on the floor (on a cushion) behind a low table */
  function sitter(scene, o) {
    scene.add('mid', cushion(o.x));
    return scene.person(Object.assign({ y: SIT_Y, pose: 'sit', legs: LEGS_OUT }, o));
  }
  const lowTable = (x, w) => {
    const t = P.table({ x, y: TABLE_TOP, w, thick: FLOOR - TABLE_TOP, floor: FLOOR, legs: false });
    t.el.querySelector('rect').setAttribute('fill', '#f8f3e6');
    return t;
  };

  /* izakaya wall: noren curtain + paper lantern (grey: red is only for what the player operates) */
  function izakayaWall(scene, { board = false } = {}) {
    scene.add('bg', P.backdrop({ floor: FLOOR, tint: '#f3f0e2' }));
    const noren = g({ transform: 'translate(90 218)' }, [
      el('line', { x1: 0, y1: 0, x2: 112, y2: 0, stroke: C.line, 'stroke-width': 3, 'stroke-linecap': 'round' }),
      ...[6, 42, 78].map(x => el('path', { d: `M${x} 2 L${x + 28} 2 L${x + 28} 54 L${x + 14} 48 L${x} 54Z`, fill: '#eceae6', stroke: '#cfcfcf', 'stroke-width': 2, 'stroke-linejoin': 'round' })),
    ]);
    const lantern = g({ transform: 'translate(258 262)' }, [
      el('line', { x1: 0, y1: -46, x2: 0, y2: -22, stroke: C.soft, 'stroke-width': 2 }),
      el('ellipse', { cx: 0, cy: 0, rx: 17, ry: 22, fill: '#f6f3ec', stroke: '#bdbdbd', 'stroke-width': 2.5 }),
      el('path', { d: 'M-15 -9 Q0 -4 15 -9 M-17 0 Q0 5 17 0 M-15 10 Q0 15 15 10', fill: 'none', stroke: '#d9d6cf', 'stroke-width': 2 }),
      el('rect', { x: -8, y: -25, width: 16, height: 5, rx: 2, fill: '#bdbdbd' }),
      el('rect', { x: -8, y: 20, width: 16, height: 5, rx: 2, fill: '#bdbdbd' }),
    ]);
    scene.add('bg', noren);
    if (!board) scene.add('bg', lantern);
    if (board) {
      const t = el('text', { x: 28, y: 22, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#9a9a9a' });
      t.textContent = 'メニュー';
      scene.add('bg', g({ transform: 'translate(206 226)' }, [
        el('rect', { x: 0, y: 0, width: 56, height: 80, rx: 3, fill: '#fbfbfa', stroke: '#cfcfcf', 'stroke-width': 2.5 }),
        t,
        ...[38, 50, 62].map(y => el('line', { x1: 10, y1: y, x2: 46, y2: y, stroke: '#e3e3e3', 'stroke-width': 3, 'stroke-linecap': 'round' })),
      ]));
    }
  }

  /* ---- manner-card diagram helpers (no kanji: svg text is kana only) ---- */
  function dGlass(svg, x, y, { w = 18, h = 28, level = 0.7, color = '#f2b632', red = false } = {}) {
    const inner = (h - 3) * level;
    svg.append(el('rect', { x: x - w / 2 + 2, y: y - 1 - inner, width: w - 4, height: inner, fill: color }));
    svg.append(el('path', { d: `M${x - w / 2} ${y - h} L${x - w / 2 + 2} ${y} L${x + w / 2 - 2} ${y} L${x + w / 2} ${y - h}`, fill: 'none', stroke: red ? C.red : '#3a3a3a', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }
  function dBubble(svg, x, y, w, h, str, { red = false, size = 9 } = {}) {
    svg.append(el('rect', { x, y, width: w, height: h, rx: 8, fill: '#fff', stroke: red ? C.red : '#3a3a3a', 'stroke-width': 2.2 }));
    KY.diag.label(svg, x + w / 2, y + h / 2 + size * 0.36, str, { size, color: red ? C.red : KY.svg.C.ink });
  }

  /* walk a top-view person along waypoints; `done` runs at the last one */
  const SPEED = 0.2;   // scene units per ms
  const heading = (dx, dy) => Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  function routeMs(person, pts) {
    let ms = 0, x = person.o.x, y = person.o.y;
    for (const p of pts) { ms += Math.hypot(p.x - x, p.y - y) / SPEED; x = p.x; y = p.y; }
    return ms;
  }
  function walkRoute(scene, person, pts, delay, done) {
    let i = 0;
    const next = () => {
      if (i >= pts.length) { if (done) done(); return; }
      const to = pts[i++], dx = to.x - person.o.x, dy = to.y - person.o.y, d = Math.hypot(dx, dy);
      if (d < 1) { next(); return; }
      person.set({ dir: heading(dx, dy) });
      scene.glide(person, to, d / SPEED, 'linear', next);
    };
    scene.after(delay, next);
  }

  /* ------------------------------------------------------------------ 5-1 */
  /* top view of a tatami room: tokonoma at the top wall, sliding door at the bottom */
  function zashikiWalls() {
    const W = { stroke: '#bdbdbd', 'stroke-width': 6, 'stroke-linecap': 'square', fill: 'none' };
    const leaf = x => el('rect', { x, y: 463, width: 32, height: 5, rx: 1, fill: '#fbfbfa', stroke: '#bdbdbd', 'stroke-width': 2 });
    return g({}, [
      el('path', Object.assign({ d: 'M30 100 L125 100 M235 100 L330 100 M330 100 L330 460 M330 460 L210 460 M150 460 L30 460 M30 460 L30 100' }, W)),
      leaf(116), leaf(212),
    ]);
  }
  const SEAT = {
    tokonoma: { x: 180, y: 160, dir: 180 },
    left: { x: 84, y: 276, dir: 90 },
    right: { x: 276, y: 276, dir: 270 },
    door: { x: 180, y: 384, dir: 0 },
  };
  const ENTRY = { x: 180, y: 438 };
  /* where the manager and the senior sit, depending on where you sat */
  const PLAN = {
    door: { bucho: 'tokonoma', senior: 'left' },
    'side-l': { bucho: 'tokonoma', senior: 'door' },
    'side-r': { bucho: 'tokonoma', senior: 'door' },
    tokonoma: { bucho: 'left', senior: 'door' },
  };
  function seatRoute(seat, playerZone) {
    const sx = playerZone === 'side-l' ? 308 : 52;   // walk round the table on the free side
    if (seat === 'door') return [ENTRY, SEAT.door];
    if (seat === 'left') return [ENTRY, { x: 52, y: 410 }, SEAT.left];
    if (seat === 'right') return [ENTRY, { x: 308, y: 410 }, SEAT.right];
    return [ENTRY, { x: sx, y: 410 }, { x: sx, y: SEAT.tokonoma.y }, SEAT.tokonoma];
  }

  /* Big labelled picture of the tatami room (card.figure, viewBox 0 0 320 244), drawn like the stage:
     tokonoma at the top wall, sliding door at the bottom, low table with four zabuton.
     1 = in front of the tokonoma (top seat), 2 / 3 = beside the table, 4 = nearest the door (you) */
  function figZashiki(svg) {
    const D = KY.diag;
    const EDGE = '#c4c4c4', GRAY = '#9a9a9a', MAT = '#fcfbf6';
    /* tokonoma alcove (outside the top wall) */
    svg.append(el('rect', { x: 108, y: 6, width: 104, height: 26, rx: 2, fill: '#f5f1e8', stroke: '#b5a98f', 'stroke-width': 3 }));
    D.label(svg, 160, 24, 'とこのま', { size: 10, weight: 900, color: '#7a6f55' });
    /* room, with the alcove opening in the top wall and the door gap in the bottom wall */
    svg.append(el('rect', { x: 14, y: 32, width: 292, height: 190, fill: MAT, stroke: EDGE, 'stroke-width': 4 }));
    svg.append(el('line', { x1: 109.5, y1: 32, x2: 210.5, y2: 32, stroke: MAT, 'stroke-width': 6 }));
    svg.append(el('line', { x1: 136, y1: 222, x2: 184, y2: 222, stroke: '#fff', 'stroke-width': 5 }));
    /* sliding door leaves, slid across the wall on each side of the gap */
    [[112, 136], [184, 208]].forEach(([a, b]) => svg.append(el('rect', { x: a, y: 224, width: b - a, height: 4, rx: 1, fill: '#fbfbfa', stroke: GRAY, 'stroke-width': 1.5 })));
    D.arrow(svg, 160, 243, 160, 227);
    D.label(svg, 172, 240, 'いりぐち', { size: 10, color: C.ink, weight: 900, anchor: 'start' });
    /* low table */
    svg.append(el('rect', { x: 98, y: 98, width: 124, height: 58, rx: 4, fill: '#fbfaf7', stroke: GRAY, 'stroke-width': 2.5 }));
    D.label(svg, 160, 131, 'テーブル', { size: 10 });
    /* zabuton, badge and who-label inside each one */
    const seats = [
      { n: 1, x: 160, y: 64, who: 'ぶちょう', top: true },
      { n: 2, x: 53, y: 127, who: 'せんぱい' },
      { n: 3, x: 267, y: 127, who: 'ほかのひと' },
      { n: 4, x: 160, y: 190, who: 'あなた', you: true },
    ];
    for (const s of seats) {
      svg.append(el('rect', { x: s.x - 31, y: s.y - 24, width: 62, height: 48, rx: 9, fill: '#fff', stroke: GRAY, 'stroke-width': 3 }));
      D.seat(svg, s.x, s.y - 8, s.n, { you: !!s.you, top: !!s.top });
      D.label(svg, s.x, s.y + 16, s.who, { size: 9, color: s.you ? C.red : '#555', weight: 900 });
    }
    /* rank captions in the free corners */
    D.label(svg, 200, 68, 'かみざ', { size: 10, color: C.ink, weight: 900, anchor: 'start' });
    D.label(svg, 200, 194, 'しもざ', { size: 10, color: C.red, weight: 900, anchor: 'start' });
  }

  KY.defineStage({
    id: '5-1',
    chapter: 5,
    title: { jp: '{座敷|ざしき}では どこに {座|すわ}る？', en: 'Seats in the Tatami Room' },
    intro: { jp: '<<{飲|の}み{会|かい}>>の {座敷|ざしき}に、{部長|ぶちょう}と {先輩|せんぱい}より {先|さき}に {着|つ}きました。', en: "You reach the party's tatami room before your manager and senior colleague." },
    time: 12000,
    mechanic: 'place',
    setup(scene) {
      scene.camera({ zoom: 1.08, x: 180, y: 300 });
      scene.add('bg', P.tatamiTop({ x: 33, y: 103, w: 294, h: 354 }));
      scene.add('bg', P.tokonomaTop({ x: 180, y: 64, w: 110, d: 36 }));
      scene.add('bg', zashikiWalls());
      scene.add('bg', P.tableTop({ x: 180, y: 272, w: 108, h: 150 }));
      for (const k of ['tokonoma', 'left', 'right', 'door']) scene.add('bg', P.zabuton({ x: SEAT[k].x, y: SEAT[k].y }));
      scene.label(180, 46, { jp: '{床|とこ}の{間|ま}', en: 'alcove' });
      scene.label(266, 484, { jp: '{入口|いりぐち}', en: 'Door' });
      const bucho = scene.person({ top: true, x: 212, y: 548, dir: 0, tag: WHO.bucho });
      const senior = scene.person({ top: true, x: 150, y: 548, dir: 0, color: 'npc2', tag: WHO.senior });
      const player = scene.person({ top: true, x: ENTRY.x, y: 450, dir: 0, color: 'player', player: true });
      return { bucho, senior, player };
    },
    params: {
      item: 'player',
      script: [
        [300, (s, r) => s.say(r.senior, { jp: 'お{先|さき}に どうぞ！', en: 'After you!' }, { dur: 2600, lift: -2 })],
      ],
      zones: [
        { id: 'door', x: SEAT.door.x, y: SEAT.door.y, dir: SEAT.door.dir, outcome: 'great' },
        { id: 'side-l', x: SEAT.left.x, y: SEAT.left.y, dir: SEAT.left.dir, outcome: 'middle' },
        { id: 'side-r', x: SEAT.right.x, y: SEAT.right.y, dir: SEAT.right.dir, outcome: 'middle' },
        { id: 'tokonoma', x: SEAT.tokonoma.x, y: SEAT.tokonoma.y, dir: SEAT.tokonoma.dir, outcome: 'top' },
      ],
      onPlace(scene, r, zone) {
        r.player.set({ dir: zone.dir });
        const plan = PLAN[zone.id];
        let total = 0;
        [['bucho', 0], ['senior', 600]].forEach(([who, delay]) => {
          const seat = plan[who], pts = seatRoute(seat, zone.id);
          total = Math.max(total, delay + routeMs(r[who], pts));
          walkRoute(scene, r[who], pts, delay, () => r[who].set({ dir: SEAT[seat].dir }));
        });
        return total + 250;
      },
      timeout: 'stand',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: 'おっ、{気|き}が{利|き}くね。{注文|ちゅうもん}は {任|まか}せたよ！', en: "Oh, good thinking. I'll leave the ordering to you!" } },
      middle: { grade: 'ok', who: WHO.senior, line: { jp: '（やっぱり、{私|わたし}が {入口|いりぐち}{側|がわ}か…）', en: '(So I get the door seat after all...)' },
        react(scene, r) { r.senior.mark('sweat'); r.bucho.mark(null); } },
      top: { grade: 'ky', who: WHO.bucho, line: { jp: 'ほう…。いい{席|せき}に {座|すわ}ってるねぇ。', en: "Well, well... that's a nice seat you've got." },
        react(scene, r) { r.bucho.mark('dots'); r.senior.mark('sweat2'); } },
      stand: { grade: 'ok', who: WHO.senior, line: { jp: 'どうしたの？ {座|すわ}って いいんだよ。', en: 'What is it? You can sit down, you know.' },
        react(scene, r) { r.senior.mark('q'); r.bucho.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: '{座敷|ざしき}の {上座|かみざ}', en: 'The top seat in a tatami room' },
      points: [
        { jp: '<<{床|とこ}の{間|ま}>>の まえが {上座|かみざ}です。{入口|いりぐち}に いちばん {近|ちか}い {席|せき}は {下座|しもざ}です。', en: 'The seat in front of the tokonoma is the top seat (kamiza). The seat nearest the door is the lowest seat (shimoza).' },
        { jp: '{下座|しもざ}の {人|ひと}は、{注文|ちゅうもん}を したり、{料理|りょうり}を {回|まわ}したり します。', en: 'The person in the lowest seat usually places orders and passes the dishes around.' },
        { jp: '「どうぞ こちらへ」と {言|い}われたら、その {席|せき}に {座|すわ}ります。', en: 'If someone says "dōzo, kochira e" (please, over here), sit where you are shown.' },
      ],
      phrase: { jp: 'こちらで よろしいでしょうか？', ro: 'kochira de yoroshii deshō ka?', en: 'Is this seat all right?' },
      why: { jp: '{座敷|ざしき}では、<<{床|とこ}の{間|ま}>>の まえが いちばん いい {席|せき}で、{大切|たいせつ}な {人|ひと}が {座|すわ}ります。{入口|いりぐち}に {近|ちか}い {席|せき}は、{店|みせ}の {人|ひと}と {話|はな}したり、{注文|ちゅうもん}したり しやすい {席|せき}です。', en: 'In a tatami room the seat in front of the tokonoma is the best one, kept for the most important person. The seat by the door makes it easy to talk to the staff and place orders.' },
      dont: { jp: '{上司|じょうし}や {先輩|せんぱい}より さきに、<<{床|とこ}の{間|ま}>>の まえに {座|すわ}らない。', en: "Don't sit in front of the tokonoma before your boss or seniors do." },
      tip: { jp: '<<{床|とこ}の{間|ま}>>が ない {部屋|へや}では、{入口|いりぐち}から いちばん はなれた {席|せき}が {上座|かみざ}です。{居酒屋|いざかや}は あまり {気|き}に しない {店|みせ}も {多|おお}いです。{先輩|せんぱい}が すすめた {席|せき}に {座|すわ}れば {大丈夫|だいじょうぶ}です。', en: 'In a room without a tokonoma, the seat farthest from the door is the top seat. Casual izakaya are often relaxed about it. If you sit where your seniors suggest, you will be fine.' },
      diagram(svg) {
        const D = KY.diag;
        D.room(svg, { x: 30, y: 10, w: 140, h: 120, door: 'b' });
        D.rect(svg, 72, 14, 56, 14, { r: 2, fill: '#f5f1e8', stroke: '#b5a98f' });
        D.label(svg, 100, 24.5, 'とこのま', { size: 8 });
        D.rect(svg, 80, 58, 40, 42, { r: 4, fill: '#fbfaf7' });
        D.seat(svg, 100, 42, 1, { top: true });
        D.seat(svg, 58, 80, 2);
        D.seat(svg, 142, 80, 3);
        D.seat(svg, 100, 116, 4, { you: true });
        D.label(svg, 114, 45, 'かみざ', { anchor: 'start' });
        D.label(svg, 114, 119.5, 'しもざ', { anchor: 'start', color: KY.svg.C.red });
      },
      figure: {
        draw: figZashiki,
        rule: { jp: '<<{床|とこ}の{間|ま}>>に {近|ちか}く、{入口|いりぐち}から はなれた {席|せき}ほど {上|うえ}です。', en: 'The closer to the tokonoma and the farther from the door, the higher the seat.' },
        legend: [
          { n: 1, top: true, jp: '{上座|かみざ}。<<{床|とこ}の{間|ま}>>の まえ。{部長|ぶちょう}の {席|せき}。', en: 'Kamiza: in front of the tokonoma. The manager sits here.' },
          { n: 2, jp: '{先輩|せんぱい}の {席|せき}。{真|ま}ん{中|なか}です。', en: 'A middle seat, for your senior.' },
          { n: 3, jp: 'ほかの {人|ひと}の {席|せき}。{真|ま}ん{中|なか}です。', en: 'A middle seat, for the other people.' },
          { n: 4, you: true, jp: 'あなたの {席|せき}。{入口|いりぐち}に {近|ちか}い {下座|しもざ}です。', en: 'Your seat: shimoza, the one nearest the door.' },
        ],
      },
    },
    test: { great: 'door', ky: 'tokonoma', ok: 'side-l' },
  });

  /* ------------------------------------------------------------------ 5-2 */
  KY.defineStage({
    id: '5-2',
    chapter: 5,
    title: { jp: '{長|なが}い あいさつ', en: 'The Long Speech' },
    intro: { jp: '{飲|の}み{物|もの}が {来|き}ました。{部長|ぶちょう}が あいさつを {始|はじ}めます。', en: 'The drinks have arrived. Your manager starts a speech.' },
    time: 11000,
    mechanic: 'timing',
    setup(scene) {
      scene.camera({ zoom: 1.7, x: 180, y: 388 });
      izakayaWall(scene);
      const player = sitter(scene, { x: 130, facing: 1, color: 'player', player: true });
      const bucho = sitter(scene, { x: 230, facing: -1, tag: WHO.bucho });
      scene.add('mid', lowTable(180, 120));
      const myGlass = hitArea(glassOf({ x: 152, y: TABLE_TOP, level: 0.8, red: true, drink: TEA }), -30, -58, 60, 72);
      const bossGlass = glassOf({ x: 208, y: TABLE_TOP, level: 0.88, foam: 0.22 });
      scene.add('fg', bossGlass);
      scene.add('fg', myGlass);
      return { player, bucho, myGlass, bossGlass };
    },
    params: {
      target: 'myGlass',
      label: 'Your glass',
      script: [
        [300, (s, r) => s.say(r.bucho, { jp: 'えー、{皆|みな}さん、{今日|きょう}は おつかれさまです。', en: "Er, everyone, thank you for your hard work today." }, { dur: 2100 })],
        [1400, (s, r) => r.player.mark('sweat')],
        [2700, (s, r) => s.say(r.bucho, { jp: '{今期|こんき}は いろいろ ありましたが、みんなの おかげで…', en: 'This term had its ups and downs, but thanks to all of you...' }, { dur: 2100 })],
        [5000, (s, r) => s.say(r.bucho, { jp: '{来期|らいき}も よろしく お{願|ねが}いします。えー、それでは…', en: 'Please keep it up next term, too. Er, so then...' }, { dur: 1900 })],
        [7000, (s, r) => {
          s.flag('cue');
          r.player.mark(null);
          r.bucho.set({ arms: TOAST });
          holdGlass(r.bucho, r.bossGlass);
          s.say(r.bucho, { jp: 'それでは、<<{乾杯|かんぱい}>>！', en: "Now then, cheers!" }, { dur: 1800, kind: 'shout' });
        }],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'never';
        return flags.cue === undefined ? 'early' : 'great';
      },
      onTap(scene, r, key) {
        r.player.mark(null);
        if (key === 'early') {
          r.player.set({ arms: SIP });
          holdGlass(r.player, r.myGlass, 4, 14);
          scene.say(r.player, { jp: '（ゴクゴク…）', en: '(gulp, gulp...)' }, { dur: 1400, cls: 'mine', lift: 62 });
          return 1100;
        }
        r.player.set({ arms: TOAST });
        holdGlass(r.player, r.myGlass);
        scene.say(r.player, { jp: '{乾杯|かんぱい}！', en: 'Cheers!' }, { dur: 1400, cls: 'mine', lift: 62 });
        scene.after(300, () => {
          slide(scene, r.myGlass, { x: r.myGlass.px + 7, y: r.myGlass.py }, 140, 'out');
          slide(scene, r.bossGlass, { x: r.bossGlass.px - 5, y: r.bossGlass.py }, 140, 'out');
          scene.pop(180, 326, { jp: 'カチン！', en: 'clink!' });
        });
        return 1100;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: 'ウーロン{茶|ちゃ}でも、{乾杯|かんぱい}は {乾杯|かんぱい}。いいね！', en: "A toast is a toast, even with oolong tea. Nice!" } },
      early: { grade: 'ky', who: WHO.bucho, line: { jp: '…まだ {乾杯|かんぱい}、してないんだけどね。', en: "...We haven't done the toast yet, you know." },
        react(scene, r) { r.bucho.mark('dots'); r.player.mark('sweat2'); } },
      never: { grade: 'ok', who: WHO.bucho, line: { jp: '（{腕|うで}が プルプルしてきた…）', en: '(My arm is starting to shake...)' },
        react(scene, r) { r.bucho.mark('sweat'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{乾杯|かんぱい}まで {待|ま}つ', en: 'Wait for the toast' },
      points: [
        { jp: '{乾杯|かんぱい}の まえに、{飲|の}まないで {待|ま}ちます。みんなで いっしょに {始|はじ}めます。', en: 'Wait before you drink. Everyone starts together after the toast.' },
        { jp: 'ジュースや ウーロン{茶|ちゃ}でも {乾杯|かんぱい}できます。お{酒|さけ}じゃなくて {大丈夫|だいじょうぶ}です。', en: 'You can toast with juice or oolong tea. It does not have to be alcohol.' },
        { jp: 'グラスを {口|くち}に つけるだけでも いいです。{全部|ぜんぶ} {飲|の}まなくて {大丈夫|だいじょうぶ}です。', en: 'Just touching the glass to your lips is fine. You do not have to finish it.' },
      ],
      phrase: { jp: '{乾杯|かんぱい}！', ro: 'kanpai!', en: 'Cheers!' },
      why: { jp: '<<{飲|の}み{会|かい}>>は、みんなで いっしょに {始|はじ}める ものです。{部長|ぶちょう}の あいさつの あと、「{乾杯|かんぱい}」の {声|こえ}で {始|はじ}まります。{先|さき}に {飲|の}むと、あいさつを {聞|き}いて いない ように {見|み}えます。', en: "A drinking party starts for everyone at once. After the manager's speech, the toast kicks it off. Drinking early looks as if you were not listening." },
      dont: { jp: '{乾杯|かんぱい}の まえに、ひとりで {飲|の}み{始|はじ}めない。', en: "Don't start drinking by yourself before the toast." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 126);
        [[34, 1, '①'], [100, 2, '②'], [166, 3, '③']].forEach(([x, n]) => D.seat(svg, x, 22, n, n === 2 ? { you: true } : {}));
        dGlass(svg, 34, 112, { level: 0.8, color: TEA });
        dGlass(svg, 100, 78, { level: 0.8, color: TEA, red: true });
        svg.append(el('g', { transform: 'translate(166 112) rotate(-24)' }, [
          el('rect', { x: -7, y: -26, width: 14, height: 12, fill: TEA }),
          el('path', { d: 'M-9 -28 L-7 0 L7 0 L9 -28', fill: 'none', stroke: '#3a3a3a', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
        ]));
        D.label(svg, 34, 140, 'まつ', { size: 10 });
        D.label(svg, 100, 140, 'かんぱい！', { size: 10, color: C.red });
        D.label(svg, 166, 140, 'のむ', { size: 10 });
        D.arrow(svg, 52, 22, 80, 22);
        D.arrow(svg, 118, 22, 146, 22);
      },
    },
    test: { great: { at: 7600 }, ok: null, ky: { at: 3000 } },
  });

  /* ------------------------------------------------------------------ 5-3 */
  /* the player drags the glass (value v = height of the hand, scene y); the manager's glass is held at BOSS_HAND */
  const SHOULDER_Y = SIT_Y - 59, ARM = 35, BOSS_HAND = 416;
  const armAngle = v => (Math.acos(Math.max(-1, Math.min(1, (v - SHOULDER_Y) / ARM))) * 180) / Math.PI;
  let cur53 = null;

  KY.defineStage({
    id: '5-3',
    chapter: 5,
    title: { jp: 'グラスの {高|たか}さ', en: 'Glass Height' },
    intro: { jp: '{部長|ぶちょう}が グラスを {持|も}って、{乾杯|かんぱい}の {声|こえ}を かけました。', en: 'Your manager holds out a glass and calls for a toast.' },
    time: 11000,
    mechanic: 'adjust',
    setup(scene) {
      scene.camera({ zoom: 1.7, x: 180, y: 388 });
      izakayaWall(scene);
      const player = sitter(scene, { x: 130, facing: 1, color: 'player', player: true });
      const bucho = sitter(scene, { x: 230, facing: -1, tag: WHO.bucho });
      scene.add('mid', lowTable(180, 120));
      const myGlass = hitArea(glassOf({ x: 150, y: 400, level: 0.8, red: true, drink: TEA }), -30, -58, 60, 72);
      const bossGlass = glassOf({ x: 210, y: 400, level: 0.88, foam: 0.22 });
      const hint = g({ opacity: 0.9 }, [el('path', { d: 'M0 -13 L-5 -6 M0 -13 L5 -6 M0 -13 L0 13 M0 13 L-5 6 M0 13 L5 6', fill: 'none', stroke: C.red, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })]);
      scene.add('fg', bossGlass);
      scene.add('fg', myGlass);
      scene.add('fg', hint);
      bucho.set({ arms: { f: [armAngle(BOSS_HAND), 0], b: [18, 46] } });
      holdGlass(bucho, bossGlass);
      return { player, bucho, myGlass, bossGlass, hint };
    },
    params: {
      target: 'myGlass',
      label: 'Your glass (drag up or down)',
      input: 'drag-y',
      min: 396, max: 440, start: BOSS_HAND,
      commit: 'release',
      settle: 1500,
      script: [
        [400, (s, r) => s.say(r.bucho, { jp: 'それじゃ、{乾杯|かんぱい}〜！', en: "All right, cheers~!" }, { dur: 2600 })],
        [6500, (s, r) => s.say(r.bucho, { jp: 'おーい、{乾杯|かんぱい}〜…？', en: 'Hey, cheers~...?' }, { dur: 2400 })],
      ],
      apply(scene, r, v) {
        cur53 = { scene, r };
        r.player.set({ arms: { f: [armAngle(v), 0], b: [18, 46] } });
        holdGlass(r.player, r.myGlass);
        set(r.hint, { transform: `translate(${r.myGlass.px - 2} ${r.myGlass.py - 64})` });
      },
      judge(v, info) {
        if (info.releasedAt == null) return 'none';      // held it until time ran out: no clink
        if (cur53) {
          const { scene, r } = cur53;
          set(r.hint, { opacity: 0 });
          slide(scene, r.myGlass, { x: r.myGlass.px + 8, y: r.myGlass.py }, 150, 'out');
          slide(scene, r.bossGlass, { x: r.bossGlass.px - 5, y: r.bossGlass.py }, 150, 'out');
          scene.say(r.player, { jp: '{乾杯|かんぱい}！', en: 'Cheers!' }, { dur: 1500, cls: 'mine', lift: 62 });
          scene.after(180, () => scene.pop(180, 326, { jp: 'カチン！', en: 'clink!' }));
        }
        const d = v - BOSS_HAND;       // > 0: your hand (and rim) is lower than the manager's
        return d > 4 ? 'low' : d >= -4 ? 'same' : 'high';
      },
    },
    outcomes: {
      low: { grade: 'great', who: WHO.bucho, line: { jp: 'おっ、{低|ひく}く {持|も}って くれたんだね。ありがとう！', en: 'Oh, you held yours lower. Thank you!' } },
      same: { grade: 'ok', who: WHO.bucho, line: { jp: '{乾杯|かんぱい}！ おつかれさま！', en: 'Cheers! Good work today!' } },
      high: { grade: 'ok', who: WHO.bucho, line: { jp: '（{上|うえ}から {来|き}たね…{気|き}にしない、{気|き}にしない）', en: "(Coming in from above, huh... don't mind, don't mind.)" },
        react(scene, r) { r.bucho.mark('sweat'); } },
      none: { grade: 'ky', who: WHO.bucho, line: { jp: '{乾杯|かんぱい}、しないの？', en: "You're not going to toast?" },
        react(scene, r) { r.bucho.mark('q'); r.player.mark('sweat2'); } },
    },
    card: {
      badge: 'myth',
      name: { jp: 'グラスの {高|たか}さ', en: 'The height of your glass' },
      points: [
        { jp: '{乾杯|かんぱい}の とき、{上|うえ}の {人|ひと}より グラスを {低|ひく}く する {人|ひと}も います。', en: "Some people hold their glass lower than their boss's glass when toasting." },
        { jp: 'この ことを {知|し}らない {人|ひと}も、{気|き}に しない {人|ひと}も たくさん います。', en: 'Many people have never heard of it, and many do not care.' },
        { jp: 'グラスを ぶつけなくても {大丈夫|だいじょうぶ}です。{目|め}を {見|み}て、{軽|かる}く あげるだけでも いいです。', en: 'You do not have to clink. Looking at the person and raising your glass a little is fine.' },
      ],
      phrase: { jp: 'おつかれさまです。{乾杯|かんぱい}！', ro: 'otsukaresama desu. kanpai!', en: 'Thank you for your hard work. Cheers!' },
      why: { jp: '「{上|うえ}の {人|ひと}より グラスを {低|ひく}く」は、{相手|あいて}を {大切|たいせつ}に する {気持|きも}ちを {見|み}せる {形|かたち}だと {言|い}う {人|ひと}が います。でも、{本|ほん}に よって {言|い}う ことが ちがい、{決|き}まった ルールでは ありません。', en: 'Some say holding your glass lower shows respect for the other person. But guides disagree, and it is not a fixed rule.' },
      dont: { jp: 'グラスの {高|たか}さで、だれかを {注意|ちゅうい}しない。', en: "Don't correct anyone about the height of their glass." },
      tip: { jp: '{若|わか}い {人|ひと}の なかには、これを「{謎|なぞ}マナー」と {言|い}う {人|ひと}も います。きちんとした パーティーでは、グラスを ぶつけない ことも あります。やっても やらなくても {大丈夫|だいじょうぶ}です。グラスの {中|なか}は ジュースや ウーロン{茶|ちゃ}でも {大丈夫|だいじょうぶ}です。', en: 'Many young Japanese people call this a "mystery manner". At formal parties people often do not clink at all. Doing it or not are both fine. Juice or oolong tea in the glass is fine, too.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        dGlass(svg, 66, 100, { w: 22, h: 34, level: 0.8, color: TEA, red: true });
        dGlass(svg, 134, 86, { w: 22, h: 34, level: 0.85 });
        svg.append(el('line', { x1: 80, y1: 66, x2: 148, y2: 66, stroke: '#bdbdbd', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
        svg.append(el('line', { x1: 52, y1: 66, x2: 80, y2: 66, stroke: C.red, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
        D.arrow(svg, 100, 40, 100, 60, { color: C.red });
        D.label(svg, 100, 30, 'すこし ひくく', { size: 10, color: C.red });
        D.label(svg, 66, 120, 'あなた', { size: 9, color: C.red });
        D.label(svg, 134, 120, 'じょうし', { size: 9 });
      },
    },
    test: { great: { value: 434 }, ok: { value: 418 }, ky: { value: 416, releaseAt: 60000 } },
  });

  /* ------------------------------------------------------------------ 5-4 */
  /* the manager's glass level over time (piecewise linear: sips) */
  const LEVEL_KEYS = [[0, 0.9], [1400, 0.9], [1900, 0.78], [3000, 0.78], [3500, 0.64], [4600, 0.64], [5100, 0.5], [6200, 0.5], [6700, 0.34], [7800, 0.34], [8300, 0.18], [9400, 0.18], [9900, 0]];
  function levelAt(t) {
    if (t <= 0) return LEVEL_KEYS[0][1];
    for (let i = 1; i < LEVEL_KEYS.length; i++) {
      const [t1, l1] = LEVEL_KEYS[i], [t0, l0] = LEVEL_KEYS[i - 1];
      if (t <= t1) return l0 + ((l1 - l0) * (t - t0)) / (t1 - t0);
    }
    return 0;
  }
  const BEER_X = 204, BOTTLE_REST = { x: 160, y: TABLE_TOP }, BOTTLE_POUR = { x: 156, y: 385 }, BOTTLE_SCALE = 0.72, GLASS_H = 40;
  const surfaceY = lv => TABLE_TOP - Math.min(1, lv) * (GLASS_H - 2);   // liquid surface in the manager's glass

  KY.defineStage({
    id: '5-4',
    chapter: 5,
    title: { jp: 'お{酌|しゃく}の タイミング', en: 'Pouring for Your Boss' },
    intro: { jp: '{部長|ぶちょう}は ビールを ゆっくり {飲|の}んでいます。', en: 'Your manager is slowly drinking a beer.' },
    time: 12500,
    mechanic: 'timing',
    setup(scene) {
      scene.camera({ zoom: 1.7, x: 180, y: 388 });
      izakayaWall(scene);
      const player = sitter(scene, { x: 125, facing: 1, color: 'player', player: true });
      const bucho = sitter(scene, { x: 235, facing: -1, tag: WHO.bucho });
      scene.add('mid', lowTable(180, 120));
      const myTea = glassOf({ x: 136, y: TABLE_TOP, level: 0.8, drink: TEA });
      const glass = glassOf({ x: BEER_X, y: TABLE_TOP, level: 0.9, foam: 0.22 });
      const bottle = hitArea(P.bottle({ x: BOTTLE_REST.x, y: BOTTLE_REST.y, red: true }), -28, -80, 56, 88);
      bottle.sc = BOTTLE_SCALE;
      putAt(bottle, BOTTLE_REST.x, BOTTLE_REST.y);
      const stream = el('rect', { x: BEER_X + 1, y: 394, width: 3.5, height: 30, rx: 1.5, fill: C.beer, opacity: 0 });
      scene.add('fg', myTea);
      scene.add('fg', glass);
      scene.add('fg', stream);
      scene.add('fg', bottle);
      const state = { pouring: false };
      return { player, bucho, glass, bottle, stream, myTea, state };
    },
    params: {
      target: 'bottle',
      label: 'Your bottle',
      script: [
        /* the manager's glass follows LEVEL_KEYS; he lifts it for each sip */
        [0, (s, r) => s.every(() => { if (!r.state.pouring) r.glass.setLevel(levelAt(s.t), 0.22 * Math.min(1, levelAt(s.t) * 2)); })],
        ...[1400, 3000, 4600, 6200, 7800, 9400].map(t => [t, (s, r) => {
          if (r.state.pouring) return;
          r.bucho.set({ arms: SIP });
          holdGlass(r.bucho, r.glass, 3, 12);
          s.after(560, () => { if (r.state.pouring) return; r.bucho.set({ arms: null }); putAt(r.glass, BEER_X, TABLE_TOP); });
        }]),
      ],
      judge(tapAt) {
        if (tapAt === null) return 'never';
        const lv = levelAt(tapAt);
        return lv > 0.8 ? 'full' : lv > 0.5 ? 'soon' : 'great';
      },
      onTap(scene, r, key) {
        const st = r.state;
        st.pouring = true;
        r.bucho.set({ arms: null });
        putAt(r.glass, BEER_X, TABLE_TOP);
        const target = key === 'full' ? 1 : 0.88;
        const start = key === 'great' ? 900 : 0;
        if (key === 'great') scene.say(r.player, { jp: 'お{注|つ}ぎしましょうか？', en: 'Shall I pour for you?' }, { dur: 1600, cls: 'mine' });
        scene.after(start, () => {
          r.player.set({ arms: { f: [135, 0], b: [18, 46] }, bow: 6 });
          scene.tween({
            dur: 420, ease: 'out',
            step: k => { putAt(r.bottle, BOTTLE_REST.x + (BOTTLE_POUR.x - BOTTLE_REST.x) * k, BOTTLE_REST.y + (BOTTLE_POUR.y - BOTTLE_REST.y) * k); r.bottle.tilt(100 * k); },
            done: () => {
              set(r.stream, { opacity: 1 });
              const l0 = r.glass.level;
              scene.tween({
                from: l0, to: target, dur: 800, ease: 'linear',
                step: v => { r.glass.setLevel(v, 0.24); set(r.stream, { height: Math.max(4, surfaceY(v) - 394) }); },
                done: () => {
                  set(r.stream, { opacity: 0 });
                  if (key === 'full') {   // it overflows
                    scene.add('fg', g({}, [
                      el('ellipse', { cx: BEER_X + 2, cy: TABLE_TOP + 2, rx: 24, ry: 3.5, fill: C.beer, opacity: 0.75 }),
                      el('path', { d: `M${BEER_X - 12} ${TABLE_TOP - 38} q-5 14 -2 36 M${BEER_X + 12} ${TABLE_TOP - 38} q5 16 2 36`, fill: 'none', stroke: C.foam, 'stroke-width': 5, 'stroke-linecap': 'round' }),
                    ]));
                  }
                },
              });
            },
          });
        });
        return start + 1500;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: 'ありがとう。じゃあ、{少|すこ}しだけ もらおうか。', en: "Thanks. Then just a little, please." } },
      soon: { grade: 'ok', who: WHO.bucho, line: { jp: 'おっ、ありがとう。まだ {半分|はんぶん} あったけどね。', en: 'Oh, thanks. There was still half left, though.' } },
      full: { grade: 'ky', who: WHO.bucho, line: { jp: 'まだ いっぱいだよ！', en: "It's still full!" },
        react(scene, r) { r.bucho.mark('shock'); r.player.mark('sweat2'); } },
      never: { grade: 'ok', who: WHO.bucho, line: { jp: 'いいよ、{自分|じぶん}で やるから。', en: "It's fine, I'll do it myself." },
        react(scene, r) { r.bucho.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: 'お{酌|しゃく}を する とき', en: 'When to pour for someone' },
      points: [
        { jp: '{相手|あいて}の グラスが {半分|はんぶん}より {少|すく}なく なったら、「お{注|つ}ぎしましょうか？」と {聞|き}きます。', en: 'When their glass is under half full, ask "Shall I pour for you?"' },
        { jp: '{先|さき}に {聞|き}いてから、ボトルを {持|も}って、{少|すこ}しだけ {入|い}れます。', en: 'Ask first, then pour just a little.' },
        { jp: '{相手|あいて}が「いりません」と {言|い}ったら、{無理|むり}に {入|い}れません。', en: 'If they say "no, thank you", do not pour.' },
      ],
      phrase: { jp: 'お{注|つ}ぎしましょうか？', ro: 'otsugi shimashō ka?', en: 'Shall I pour for you?' },
      why: { jp: '{日本|にほん}では、{相手|あいて}の グラスを {見|み}て {気|き}づく ことが やさしさだと {考|かんが}える {人|ひと}が います。{先|さき}に {聞|き}くと、{相手|あいて}も「もう いいです」と {言|い}い やすく なります。', en: "Some people in Japan see noticing the other person's glass as kindness. Asking first lets them easily say \"no more, thanks\"." },
      dont: { jp: '{聞|き}かないで いきなり {入|い}れない。いらない {人|ひと}に {入|い}れない。', en: "Don't pour without asking, and don't pour for someone who does not want more." },
      tip: { jp: 'いつも {先|さき}に {聞|き}きましょう。いまは お{酌|しゃく}を しない {会社|かいしゃ}も {多|おお}いです。あなたの {飲|の}み{物|もの}は ジュースや ウーロン{茶|ちゃ}で {大丈夫|だいじょうぶ}です。', en: 'Always ask first. Many workplaces no longer care about this custom. Your own drink can be juice or oolong tea.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        dGlass(svg, 56, 122, { w: 34, h: 66, level: 0.45 });
        svg.append(el('line', { x1: 26, y1: 90, x2: 86, y2: 90, stroke: C.ink, 'stroke-width': 1.6, 'stroke-dasharray': '4 3' }));
        D.label(svg, 56, 138, 'はんぶん', { size: 10 });
        D.arrow(svg, 98, 96, 90, 96);
        dBubble(svg, 94, 14, 100, 30, 'おつぎしましょうか？', { red: true, size: 8.5 });
        D.label(svg, 146, 76, 'きいてから', { size: 10 });
        D.label(svg, 146, 92, 'すこし だけ', { size: 10 });
      },
    },
    test: { great: { at: 7000 }, ok: { at: 4000 }, ky: { at: 700 } },
  });

  /* ------------------------------------------------------------------ 5-5 */
  KY.defineStage({
    id: '5-5',
    chapter: 5,
    title: { jp: 'お{酒|さけ}が {飲|の}めない とき', en: "When You Don't Drink" },
    intro: { jp: '{先輩|せんぱい}が {飲|の}み{物|もの}の {注文|ちゅうもん}を {聞|き}いています。あなたは お{酒|さけ}を {飲|の}みません。', en: "Your senior is taking drink orders. You don't drink alcohol." },
    time: 15000,
    mechanic: 'choice',
    setup(scene) {
      scene.camera({ zoom: 1.5, x: 180, y: 420 });
      izakayaWall(scene, { board: true });
      const player = sitter(scene, { x: 125, facing: 1, color: 'player', player: true });
      const senior = sitter(scene, { x: 235, facing: -1, tag: WHO.senior });
      scene.add('mid', lowTable(180, 120));
      return { player, senior };
    },
    params: {
      script: [
        [300, (s, r) => { r.ask = s.say(r.senior, { jp: 'とりあえず ビールで いい？', en: 'Beer for now, okay?' }); }],
        [1500, (s, r) => r.player.mark('sweat')],
      ],
      showAt: 2200,
      options: [
        { id: 'oolong', text: { jp: 'すみません、お{酒|さけ}は {飲|の}めないので、ウーロン{茶|ちゃ}で お{願|ねが}いします', en: "Sorry, I don't drink alcohol, so oolong tea please." }, outcome: 'great' },
        { id: 'accept', text: { jp: '…はい', en: '...Yes.' }, outcome: 'ok' },
        { id: 'chug', text: { jp: '（{無理|むり}して {一気|いっき}に {飲|の}む）', en: '(Force yourself to chug it)' }, outcome: 'chug' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        if (r.ask) scene.removeOverlay(r.ask);
        const drink = opt.id === 'oolong' ? { level: 0.82, drink: TEA } : { level: 0.88, foam: 0.22 };
        const glass = glassOf(Object.assign({ x: 148, y: TABLE_TOP }, drink));
        scene.add('fg', glass);
        if (opt.id === 'oolong') {
          scene.say(r.player, opt.text, { dur: 2800, cls: 'mine' });
          return 2900;
        }
        if (opt.id === 'accept') {
          scene.say(r.player, opt.text, { dur: 2200, cls: 'mine' });
          return 2300;
        }
        r.player.set({ arms: SIP });
        holdGlass(r.player, glass, 4, 14);
        scene.tween({ from: 0.88, to: 0, dur: 900, ease: 'linear', step: v => glass.setLevel(v, 0.22 * Math.min(1, v * 2)) });
        scene.say(r.player, { jp: '（ゴクゴクゴク…！）', en: '(gulp gulp gulp...!)' }, { dur: 2000, cls: 'mine' });
        return 2200;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.senior, line: { jp: 'そっか、ごめんごめん！ ウーロン{茶|ちゃ}ね。{一緒|いっしょ}に {乾杯|かんぱい}しよう！', en: "Oh, sorry, sorry! Oolong tea it is. Let's toast together!" } },
      ok: { grade: 'ok', who: WHO.senior, line: { jp: '（あの ビール、{泡|あわ}が {消|き}えたのに {減|へ}ってない…）', en: "(That beer's foam is long gone, but the level hasn't dropped...)" },
        react(scene, r) { r.senior.mark('dots'); r.player.mark('sweat'); } },
      chug: { grade: 'ky', who: WHO.senior, line: { jp: 'えっ、{大丈夫|だいじょうぶ}!? {無理|むり}しないで！', en: "Whoa, are you okay?! Don't push yourself!" },
        react(scene, r) { r.senior.mark('ex'); r.player.mark('sweat2'); } },
      silent: { grade: 'ky', who: WHO.senior, line: { jp: 'あれ？ {聞|き}こえてる？ じゃあ ビールで いいね！', en: "Huh? Can you hear me? Beer it is, then!" },
        react(scene, r) { r.senior.mark('q'); } },
    },
    card: {
      badge: 'must',
      name: { jp: 'お{酒|さけ}を {飲|の}まない とき', en: 'When you do not drink alcohol' },
      points: [
        { jp: 'お{酒|さけ}を {飲|の}まなくても、{失礼|しつれい}では ありません。{理由|りゆう}と「ありがとう」を いっしょに {言|い}います。', en: 'Not drinking alcohol is not rude. Say your reason together with a thank-you.' },
        { jp: 'ウーロン{茶|ちゃ}や ジュースでも {乾杯|かんぱい}できます。みんなと {同|おな}じ ものを {飲|の}まなくて {大丈夫|だいじょうぶ}です。', en: 'You can toast with oolong tea or juice. You do not have to drink the same thing as everyone.' },
        { jp: '{無理|むり}に {飲|の}ませる ことは <<アルハラ>>です。あなたも {人|ひと}に すすめては いけません。', en: 'Forcing someone to drink is "aruhara" (alcohol harassment). Do not push others to drink either.' },
      ],
      phrase: { jp: 'すみません、お{酒|さけ}は {飲|の}めないので、ウーロン{茶|ちゃ}で お{願|ねが}いします', ro: 'sumimasen, osake wa nomenai node, ūroncha de onegai shimasu', en: "Sorry, I don't drink alcohol, so I'll have oolong tea, please." },
      why: { jp: 'お{酒|さけ}が {飲|の}めない {理由|りゆう}は いろいろです。お{酒|さけ}に よわい {人|ひと}も、きらいな {人|ひと}も います。いまは ソフトドリンクを {選|えら}ぶ {人|ひと}が {増|ふ}えています。', en: 'There are many reasons for not drinking: some people react badly to alcohol, some just dislike it. More and more people now choose soft drinks.' },
      dont: { jp: '{無理|むり}に {一気|いっき}に {飲|の}まない。{人|ひと}にも {無理|むり}に すすめない。', en: "Don't force yourself to chug, and don't push drinks on others." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        [[40, TEA, 'ウーロンちゃ'], [100, '#f0a24a', 'ジュース'], [160, '#bcd9f0', 'みず']].forEach(([x, col, name]) => {
          dGlass(svg, x, 76, { w: 24, h: 38, level: 0.8, color: col });
          D.label(svg, x, 94, name, { size: 8.5 });
          svg.append(el('path', { d: `M${x - 6} 108 L${x - 1} 114 L${x + 7} 103`, fill: 'none', stroke: '#2e7d4f', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        });
        D.label(svg, 100, 24, 'どれでも OK', { size: 13, color: C.ink, weight: 900 });
        D.label(svg, 100, 136, 'ありがとう、と いっしょに', { size: 8.5 });
      },
    },
    test: { great: 'oolong', ok: 'accept', ky: 'chug' },
  });

  /* ------------------------------------------------------------------ 5-6 */
  const REACH = { f: [36, 0], b: [28, 8] };   // leaning over the table to the plate

  KY.defineStage({
    id: '5-6',
    chapter: 5,
    title: { jp: '{最後|さいご}の からあげ', en: 'The Last Karaage' },
    intro: { jp: 'みんなで {食|た}べる おさらに、からあげが ひとつ {残|のこ}っています。', en: 'One piece of karaage is left on the shared plate.' },
    time: 10000,
    mechanic: 'timing',
    setup(scene) {
      scene.camera({ zoom: 1.7, x: 186, y: 388 });
      izakayaWall(scene);
      const player = sitter(scene, { x: 128, facing: 1, color: 'player', player: true });
      const bucho = sitter(scene, { x: 250, facing: -1, tag: WHO.bucho });
      scene.add('mid', cushion(198));
      const senior = scene.person({ x: 198, y: SIT_Y, pose: 'sit', view: 'front', color: 'npc2' });
      senior.p.legF.style.display = 'none';       // the front view's legs would stick out under the table
      senior.p.legB.style.display = 'none';
      scene.add('mid', lowTable(186, 140));
      const plate = hitArea(P.plate({ x: 0, y: 0, pieces: 1, red: true }), -46, -34, 92, 48);
      plate.sc = 0.85;
      putAt(plate, 170, TABLE_TOP - 3);
      scene.add('fg', plate);
      return { player, bucho, senior, plate };
    },
    params: {
      target: 'plate',
      label: 'The last karaage',
      script: [
        [1200, (s, r) => { r.bucho.mark('dots'); r.senior.mark('dots'); r.player.mark('sweat'); }],
        [7800, (s, r) => { r.bucho.mark('dots'); r.senior.mark('dots'); r.player.mark('sweat'); }],
        [5000, (s, r) => {
          s.flag('cue');
          r.bucho.mark(null); r.senior.mark(null); r.player.mark(null);
          s.say(r.bucho, { jp: '{誰|だれ}か {食|た}べなよ', en: "Somebody eat it." }, { dur: 2400 });
        }],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'never';
        return flags.cue === undefined ? 'early' : 'great';
      },
      onTap(scene, r, key) {
        r.player.mark(null);
        r.player.set({ arms: REACH, bow: 28 });
        scene.after(380, () => { r.plate.setPieces(0); });
        if (key === 'great') {
          scene.say(r.player, { jp: 'いただきます！', en: 'Thank you, I will!' }, { dur: 1600, cls: 'mine' });
          scene.after(700, () => r.player.set({ arms: null, bow: 0 }));
        } else {
          scene.say(r.player, { jp: '（ヒョイ…）', en: '(snatch...)' }, { dur: 1400, cls: 'mine' });
        }
        return 1200;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: 'お、ナイス！ みんな、ずっと {見|み}てたんだよ。', en: "Oh, nice! Everyone's been staring at it this whole time." } },
      early: { grade: 'ky', who: WHO.senior, line: { jp: '（あっ、{取|と}られた…！ {狙|ねら}ってたのに…）', en: '(Ah, it got taken...! I was eyeing that...)' },
        react(scene, r) { r.senior.mark('shock'); r.bucho.mark('dots'); } },
      never: { grade: 'ok', who: WHO.senior, line: { jp: '<<{遠慮|えんりょ}のかたまり>>、{今夜|こんや}も {残|のこ}ったね。', en: 'The "lump of reserve" survives another night.' },
        react(scene, r) { r.senior.mark('dots'); r.bucho.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: '{最後|さいご}の ひとつ', en: 'The last piece on the plate' },
      points: [
        { jp: 'みんなで {食|た}べる おさらの {最後|さいご}の ひとつは、みんな {遠慮|えんりょ}して {取|と}りません。', en: 'Nobody wants to take the last piece from a shared plate; everyone holds back (enryo).' },
        { jp: '{上|うえ}の {人|ひと}に「どうぞ」と {言|い}われてから、「いただきます」と {言|い}って {取|と}ります。', en: 'Take it after a senior says "dōzo", and say "itadakimasu".' },
        { jp: '{自分|じぶん}から「どなたか どうぞ」と {言|い}って、みんなに すすめても いいです。', en: 'You can also offer it to everyone yourself: "donataka dōzo".' },
      ],
      phrase: { jp: 'どなたか、いかがですか？', ro: 'donataka, ikaga desu ka?', en: 'Would anyone like it?' },
      why: { jp: '{日本|にほん}では、{自分|じぶん}だけ たくさん {食|た}べるのは よくないと {思|おも}われる ことが あります。だから みんな {遠慮|えんりょ}して、{最後|さいご}の ひとつが {残|のこ}ります。', en: 'In Japan, eating more than your share can look selfish. So everyone holds back and the last piece stays on the plate.' },
      dont: { jp: '{何|なに}も {言|い}わずに {取|と}らない。', en: "Don't take it without saying anything." },
      tip: { jp: '{会社|かいしゃ}や {人|ひと}に よって ちがいます。なかよしの チームなら、{気|き}に しない ことも あります。{迷|まよ}ったら、{自分|じぶん}から「どなたか どうぞ」と {言|い}って みましょう。', en: 'It depends on the company and the people. Close teams often do not care. If unsure, offer it yourself: "donataka dōzo".' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        svg.append(el('ellipse', { cx: 100, cy: 112, rx: 46, ry: 11, fill: '#fff', stroke: '#3a3a3a', 'stroke-width': 2.5 }));
        svg.append(el('path', { d: 'M92 108 q2 -14 10 -13 q10 -2 11 7 q2 8 -7 9 q-12 2 -14 -3z', fill: '#d9a35b', stroke: '#3a3a3a', 'stroke-width': 2.2 }));
        dBubble(svg, 12, 14, 76, 28, '① どうぞ', { size: 10 });
        dBubble(svg, 108, 44, 84, 28, '② いただきます', { red: true, size: 9 });
        D.arrow(svg, 50, 46, 66, 72);
        D.label(svg, 100, 138, 'まず ①、つぎに ②', { size: 9, color: C.ink });
      },
    },
    test: { great: { at: 5800 }, ok: null, ky: { at: 2800 } },
  });

  /* ------------------------------------------------------------------ 5-7 */
  KY.defineStage({
    id: '5-7',
    chapter: 5,
    title: { jp: '{二次会|にじかい}に {行|い}かない とき', en: 'Skipping Round Two' },
    intro: { jp: 'お{店|みせ}の {外|そと}で、{先輩|せんぱい}が {二次会|にじかい}に {行|い}く {人|ひと}を {聞|き}いています。', en: 'Outside the restaurant, your senior asks who is coming to the second party.' },
    time: 15000,
    mechanic: 'choice',
    setup(scene) {
      scene.camera({ zoom: 1.15, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: FLOOR, tint: '#eceaf1' }));
      scene.add('bg', g({}, [
        el('circle', { cx: 232, cy: 196, r: 24, fill: '#fbf6e4', stroke: '#e0d9b8', 'stroke-width': 2 }),
        el('line', { x1: 312, y1: FLOOR, x2: 312, y2: 250, stroke: '#bdbdbd', 'stroke-width': 4 }),
        el('rect', { x: 300, y: 238, width: 24, height: 16, rx: 4, fill: '#fbf6e4', stroke: '#bdbdbd', 'stroke-width': 2.5 }),
      ]));
      scene.add('bg', P.door({ x: 40, floor: FLOOR, w: 54, h: 140 }));
      scene.add('bg', g({ transform: 'translate(30 296)' }, [
        el('line', { x1: 0, y1: 0, x2: 74, y2: 0, stroke: C.line, 'stroke-width': 3, 'stroke-linecap': 'round' }),
        ...[3, 28, 53].map(x => el('path', { d: `M${x} 2 L${x + 19} 2 L${x + 19} 30 L${x + 9} 26 L${x} 30Z`, fill: '#eceae6', stroke: '#cfcfcf', 'stroke-width': 2, 'stroke-linejoin': 'round' })),
      ]));
      const player = scene.person({ x: 140, y: FLOOR, facing: 1, color: 'player', player: true });
      const senior = scene.person({ x: 226, y: FLOOR, facing: -1, tag: WHO.senior });
      const mate = scene.person({ x: 292, y: FLOOR, facing: -1, color: 'npc2' });
      return { player, senior, mate };
    },
    params: {
      script: [
        [300, (s, r) => r.senior.set({ arms: { f: [150, 0], b: [-6, 0] } })],
        [400, (s, r) => { r.ask = s.say(r.senior, { jp: '{二次会|にじかい} {行|い}く {人|ひと}〜？', en: 'Who is coming to the second party~?' }, { kind: 'shout' }); }],
        [1700, (s, r) => r.player.mark('sweat')],
      ],
      showAt: 2400,
      options: [
        { id: 'polite', text: { jp: 'すみません、{明日|あした} {早|はや}いので、{今日|きょう}は これで {失礼|しつれい}します。ありがとうございました！', en: "Sorry, I have an early start tomorrow, so I'll head home now. Thank you for everything!" }, outcome: 'great' },
        { id: 'maybe', text: { jp: '{行|い}けたら {行|い}きます', en: "I'll go if I can." }, outcome: 'maybe' },
        { id: 'blunt', text: { jp: '{行|い}きません。', en: "I'm not going." }, outcome: 'blunt' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        if (r.ask) scene.removeOverlay(r.ask);
        r.senior.set({ arms: null });
        if (opt.id === 'polite') r.player.set({ bow: 28 });
        scene.say(r.player, opt.text, { dur: 2800, cls: 'mine' });
        return 2900;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.senior, line: { jp: 'そっか、おつかれさま！ また {今度|こんど} {行|い}こうね。', en: "I see, good work today! Let's go together another time." },
        react(scene, r) { r.senior.mark('sparkle'); r.mate.mark('sparkle'); r.player.set({ bow: 0 }); } },
      maybe: { grade: 'ok', who: WHO.senior, line: { jp: '（{行|い}けたら…って、{行|い}くの？ {行|い}かないの？ {待|ま}つべき？）', en: '("If I can"... so is that a yes or a no? Should we wait?)' },
        react(scene, r) { r.senior.mark('q'); r.mate.mark('q'); } },
      blunt: { grade: 'ky', who: WHO.senior, line: { jp: '…そ、そうですか。（{空気|くうき}が ひんやり…）', en: '...I-I see. (The air just went chilly...)' },
        react(scene, r) { r.senior.mark('sweat2'); r.mate.mark('shock'); } },
      silent: { grade: 'ky', who: WHO.senior, line: { jp: 'おーい、{聞|き}こえてる〜？', en: 'Hellooo, can you hear me~?' },
        react(scene, r) { r.senior.mark('q'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{二次会|にじかい}を {休|やす}む とき', en: 'When you skip the second party' },
      points: [
        { jp: '{行|い}かない ときは、{理由|りゆう}を ひとこと {言|い}って、「ありがとうございました」と {言|い}います。', en: 'If you are not going, give a short reason and say thank you.' },
        { jp: '「また {今度|こんど}」と {言|い}うと、やさしく {聞|き}こえます。', en: 'Adding "mata kondo" (next time) sounds kind.' },
        { jp: '「{行|い}けたら {行|い}きます」は、{相手|あいて}を {待|ま}たせて しまいます。はっきり {言|い}いましょう。', en: '"I\'ll go if I can" makes people wait. Be clear instead.' },
      ],
      phrase: { jp: '{今日|きょう}は これで {失礼|しつれい}します。ありがとうございました', ro: 'kyō wa kore de shitsurei shimasu. arigatō gozaimashita', en: "I'll head home for today. Thank you very much." },
      why: { jp: '{早|はや}く {帰|かえ}る ことは、わるい ことでは ありません。{理由|りゆう}を {言|い}って お{礼|れい}を {言|い}えば、みんな わかって くれます。', en: 'Going home early is not bad. If you give a reason and thank them, people will understand.' },
      dont: { jp: '「{行|い}けたら {行|い}きます」と だけ {言|い}わない。{場所|ばしょ}や {人|ひと}に よっては、「{行|い}きません」と おなじ {意味|いみ}です。', en: 'Do not just say "ikeraiku" (I\'ll go if I can). In some places it simply means no.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        [[1, 'りゆう', 34], [2, 'ありがとう', 70], [3, 'また こんど', 106]].forEach(([n, str, y]) => {
          D.seat(svg, 40, y, n, n === 2 ? { you: true } : {});
          D.label(svg, 62, y + 4, str, { anchor: 'start', size: 12, color: n === 2 ? C.red : C.ink });
        });
        D.label(svg, 100, 138, 'みじかく はっきり', { size: 9 });
      },
    },
    test: { great: 'polite', ok: 'maybe', ky: 'blunt' },
  });

  /* ------------------------------------------------------------------ 5-8 */
  const BOSS_START = 370, BOSS_END = 112, BOSS_MS = 4300, PLAYER_X = 190, STOP_X = 118;   // the manager walks in from the right at 60 units/s

  KY.defineStage({
    id: '5-8',
    chapter: 5,
    title: { jp: '{次|つぎ}の {朝|あさ}の お{礼|れい}', en: 'Thanks the Next Morning' },
    intro: { jp: '{部長|ぶちょう}が ごちそうして くれた {次|つぎ}の {朝|あさ}、{会社|かいしゃ}で あなたは {席|せき}に {座|すわ}っています。', en: 'The morning after your manager treated you, you are at your desk.' },
    time: 9000,
    mechanic: 'timing',
    setup(scene) {
      scene.camera({ zoom: 1.5, x: 190, y: 402 });
      scene.add('bg', P.backdrop({ floor: FLOOR }));
      scene.add('bg', P.window({ x: 96, y: 236, w: 92, h: 70 }));
      scene.add('bg', P.clock({ x: 252, y: 232, h: 9, m: 0 }));
      const bucho = scene.person({ x: BOSS_START, y: FLOOR, facing: -1, layer: 'bg' });
      scene.add('mid', P.officeChair({ x: PLAYER_X - 6, facing: 1 }));
      const player = scene.person({ x: PLAYER_X, y: FLOOR, pose: 'sit', facing: 1, color: 'player', player: true });
      player.el.insertBefore(el('rect', { x: -34, y: -108, width: 68, height: 116, fill: 'transparent' }), player.el.firstChild);
      scene.add('mid', P.table({ x: 258, y: 420, w: 92, floor: FLOOR }));
      scene.add('mid', P.monitor({ x: 262, y: 410, w: 62, h: 42 }));
      return { player, bucho };
    },
    params: {
      target: 'player',
      label: 'You (say thanks)',
      script: [
        [0, (s, r) => { r.cancelWalk = s.walk(r.bucho, BOSS_END, BOSS_MS); }],
        [1000, (s, r) => { r.bucho.tagEl = s.tag(r.bucho, WHO.bucho); }],
        [1500, (s) => s.flag('near')],
        [4500, (s) => s.flag('gone')],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'never';
        if (flags.gone !== undefined) return 'late';
        return flags.near !== undefined ? 'great' : 'early';
      },
      onTap(scene, r, key) {
        r.player.mark(null);
        if (key === 'late' || key === 'great') {
          /* the manager stops, comes back to you and turns around; you turn to him and bow */
          if (r.cancelWalk) r.cancelWalk();
          const bx = r.bucho.o.x;
          if (bx > STOP_X + 4) scene.walk(r.bucho, STOP_X, ((bx - STOP_X) / 0.11), () => r.bucho.set({ facing: 1 }));
          else r.bucho.set({ pose: 'stand', walk: 0, facing: 1 });
          r.player.set({ pose: 'stand', bow: 28, facing: -1 });
        } else {
          r.player.set({ pose: 'stand', bow: 28, facing: 1 });
        }
        scene.say(r.player, { jp: '{昨日|きのう}は ごちそうさまでした！', en: 'Thank you for treating us last night!' }, { dur: 2200, cls: 'mine', lift: 4 });
        return 1500;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: 'おっ、{律儀|りちぎ}だなあ。また {食|た}べに {行|い}こう！', en: "Oh, how thoughtful of you. Let's go eat again!" },
        react(scene, r) { r.player.set({ bow: 0 }); r.bucho.mark('heart'); } },
      late: { grade: 'ok', who: WHO.bucho, line: { jp: 'ん？ ああ、{昨日|きのう}の！ いいよ、いいよ。', en: "Hm? Oh, last night! It's nothing, it's nothing." },
        react(scene, r) { r.player.set({ bow: 0 }); r.bucho.mark('q'); } },
      early: { grade: 'ok', who: null, line: { jp: '（{部長|ぶちょう}は まだ {来|き}ていない。ひとりごとに なった…）', en: '(Your manager has not arrived yet. You just talked to yourself...)' },
        react(scene, r) { r.player.set({ bow: 0 }); r.player.mark('sweat'); } },
      never: { grade: 'ky', who: WHO.bucho, line: { jp: '（…{昨日|きのう}の {会計|かいけい}、{私|わたし}だったんだけどな…）', en: "(I paid the bill last night, you know...)" },
        react(scene, r) { r.bucho.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{次|つぎ}の {朝|あさ}の お{礼|れい}', en: 'Thanks the next morning' },
      points: [
        { jp: '{飲|の}み{会|かい}の {次|つぎ}の {日|ひ}にも、「ごちそうさまでした」と もう いちど お{礼|れい}を {言|い}います。', en: 'The next day, say thanks once more: "gochisōsama deshita".' },
        { jp: '{会|あ}った ときに {言|い}います。チャットや メールで {送|おく}っても いいです。', en: 'Say it when you meet. A chat message or email works too.' },
        { jp: '「{楽|たの}しかったです」と ひとこと {言|い}うと、もっと いいです。', en: 'Adding "it was fun" makes it even better.' },
      ],
      phrase: { jp: '{昨日|きのう}は ごちそうさまでした！', ro: 'kinō wa gochisōsama deshita!', en: 'Thank you for treating us last night.' },
      why: { jp: '{日本|にほん}では、ごちそうして もらった ときは、その {夜|よる}と {次|つぎ}の {日|ひ}に、{二回|にかい}お{礼|れい}を {言|い}うのが ふつうです。{次|つぎ}の {日|ひ}の お{礼|れい}は、とても ありがたいと {思|おも}っている {気持|きも}ちを {見|み}せます。', en: 'In Japan, when someone treats you it is normal to thank them twice: that night and the next day. The second thank-you shows how grateful you really are.' },
      dont: { jp: '{会|あ}った とき、{何|なに}も {言|い}わないで {通|とお}りすぎない。', en: "Don't walk past without saying anything." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        svg.append(el('path', { d: 'M62 40 a20 20 0 1 0 14 34 a16 16 0 1 1 -14 -34z', fill: '#e9e6dc', stroke: '#9a9a9a', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        svg.append(el('circle', { cx: 146, cy: 62, r: 15, fill: '#fbe9a8', stroke: C.red, 'stroke-width': 2.5 }));
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          svg.append(el('line', { x1: 146 + Math.cos(a) * 21, y1: 62 + Math.sin(a) * 21, x2: 146 + Math.cos(a) * 28, y2: 62 + Math.sin(a) * 28, stroke: C.red, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
        }
        D.label(svg, 66, 108, 'よる', { size: 11 });
        D.label(svg, 66, 124, 'ごちそうさま！', { size: 9 });
        D.label(svg, 146, 108, 'あさ', { size: 11, color: C.red });
        D.label(svg, 146, 124, 'ごちそうさま！', { size: 9, color: C.red });
        D.label(svg, 100, 24, '2かい いう', { size: 12, color: C.ink, weight: 900 });
      },
    },
    test: { great: { at: 3000 }, ok: { at: 6500 }, ky: null },
  });
})(typeof window !== 'undefined' ? window : globalThis);
