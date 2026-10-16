/* Chapter 2 — Visiting a Client (客先訪問) */
(function (root) {
  const KY = root.KY;
  const P = KY.props;

  const WHO = {
    staff: { jp: '{先方|せんぽう}', en: 'Client staff' },
    client: { jp: '{先方|せんぽう}', en: 'Client' },
    manager: { jp: '{課長|かちょう}', en: 'Your manager' },
    reception: { jp: '{受付|うけつけ}', en: 'Receptionist' },
    customer: { jp: 'お{客様|きゃくさま}', en: 'Client' },
  };

  /* dictionary words used by this chapter's explanation texts */
  KY.addGlossary({
    '受付': { yomi: 'うけつけ', jp: '{会社|かいしゃ}の {入口|いりぐち}に ある、{来|き}た {人|ひと}が まず {行|い}く ところ。ここで {名前|なまえ}を {言|い}う。', en: 'reception desk' },
    '営業部': { yomi: 'えいぎょうぶ', jp: '{会社|かいしゃ}の {商品|しょうひん}を {売|う}る {仕事|しごと}の グループ。', en: 'sales department' },
    '案内': { yomi: 'あんない', jp: '{場所|ばしょ}や {行|い}き{方|かた}を {教|おし}えて、いっしょに {行|い}くこと。', en: 'guiding someone / showing the way' },
    '迷惑': { yomi: 'めいわく', jp: '{相手|あいて}が いやな {思|おも}いを したり、{仕事|しごと}が できなく なったりすること。', en: 'trouble / inconvenience' },
    '遅刻': { yomi: 'ちこく', jp: '{決|き}まった {時間|じかん}より あとに {来|く}ること。', en: 'being late' },
    '花粉': { yomi: 'かふん', jp: '{花|はな}から でる、とても {小|ちい}さい つぶ。{春|はる}に {多|おお}い。', en: 'pollen' },
    '脱': { yomi: 'ぬぐ', head: '{脱|ぬ}ぐ', jp: '{服|ふく}や コートを、{体|からだ}から とること。', en: 'to take off (clothes)' },
    '押': { yomi: 'おす', head: '{押|お}す', jp: '{手|て}で ボタンなどに {力|ちから}を かけること。', en: 'to press' },
    '閉': { yomi: 'しまる', head: '{閉|し}まる', jp: 'ドアが {動|うご}いて、{開|あ}いて いる ところが なくなること。', en: 'to close (a door)' },
    '迎': { yomi: 'むかえる', head: '{迎|むか}える', jp: '{来|き}た {人|ひと}に {会|あ}って、あいさつを すること。', en: 'to welcome / to greet' },
  });

  /* ---- small helpers used only by this chapter's stages ---- */

  /* a figure is thin: give a whole person an invisible, bigger tap area */
  function pad(p, w = 64, h = 128) {
    const { el } = KY.svg;
    p.el.insertBefore(el('rect', { x: -w / 2, y: -h, width: w, height: h + 6, fill: 'transparent' }), p.el.firstChild);
    return p;
  }

  /* reception counter (side view, floor y = 470). Add it AFTER the person who stands behind it. */
  function counter(scene, x, w) {
    const { el, g, C } = KY.svg;
    return scene.add('mid', g({ transform: `translate(${x} 470)` }, [
      el('rect', { x: 0, y: -62, width: w, height: 62, rx: 3, fill: '#f6f6f2', stroke: C.line, 'stroke-width': 2.5 }),
      el('line', { x1: 10, y1: -42, x2: w - 10, y2: -42, stroke: '#e0e0da', 'stroke-width': 2 }),
      el('rect', { x: -5, y: -69, width: w + 10, height: 8, rx: 3, fill: C.paper, stroke: C.line, 'stroke-width': 2.5 }),
    ]));
  }

  /* move something through several points one after another */
  function route(scene, obj, pts, ms, done) {
    const per = ms / pts.length;
    let i = 0;
    const next = () => { if (i >= pts.length) { if (done) done(); return; } scene.glide(obj, pts[i++], per, 'inout', next); };
    next();
  }

  /* wall clock + big digital time. m = minutes after 13:00 (may have decimals). */
  const clockMin = t => 30 + Math.min(t, 14000) / 400;
  function clockFace(scene, x, y, r, labelY) {
    const { el, C } = KY.svg;
    const clock = P.clock({ x, y, r, h: 13, m: 30 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * Math.PI, big = i % 3 === 0, r1 = r - (big ? 8 : 5);
      clock.el.append(el('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * (r - 2), y2: -Math.cos(a) * (r - 2), stroke: C.line, 'stroke-width': big ? 2.8 : 1.6, 'stroke-linecap': 'round' }));
    }
    scene.add('bg', clock);
    /* the digital time is placed with percentages (not measured), so it stays centred whatever the font does */
    const V = scene.view;
    const lab = root.document.createElement('div');
    lab.className = 'label deadline';
    lab.style.cssText = `left:${((x - V.x) / V.w) * 100}%;top:${((labelY - V.y) / V.h) * 100}%;transform:translate(-50%,-50%);font-size:6.6cqw;font-weight:900;letter-spacing:.04em;font-variant-numeric:tabular-nums`;
    lab.innerHTML = KY.text.html({ jp: '13:30', en: '' });
    scene.overlay.append(lab);
    const jp = lab.querySelector('.jp');
    let last = '';
    return {
      set(m) {
        const late = m >= 60, H = late ? 14 : 13, M = late ? m - 60 : m;
        clock.setTime(H, M);
        const s = H + ':' + String(Math.floor(M)).padStart(2, '0');
        if (s !== last) { last = s; jp.textContent = s; }
      },
    };
  }

  /* ------------------------------------------------------------------ 2-1 */
  /* arrive at the building → tap to go to the reception desk. The tap decides everything. */
  function enterLobby(scene, r) {
    const stopMin = clockMin(Math.min(scene.t, scene.flags.stop ?? Infinity));
    scene.tween({ from: 0, to: 1, dur: 350, step: v => r.door.setOpen(v) });
    scene.walk(r.player, 250, 1000, () => {
      /* cut to the lobby: the clock keeps the time of your tap */
      scene.clear();
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      clockFace(scene, 108, 232, 40, 300).set(stopMin);
      r.recep = scene.person({ x: 268, y: 470, facing: -1, color: 'npc2', tag: WHO.reception });
      counter(scene, 218, 112);
      r.player = scene.person({ x: 20, y: 470, facing: 1, color: 'player', player: true });
      scene.walk(r.player, 150, 900);
    });
    return 1000 + 900 + 600;
  }

  KY.defineStage({
    id: '2-1',
    chapter: 2,
    title: { jp: '{受付|うけつけ}は {何分前|なんぷんまえ}？', en: 'When to Check In' },
    intro: { jp: 'お{客様|きゃくさま}の ビルの {前|まえ}に {着|つ}きました。14{時|じ}の お{約束|やくそく}です。', en: "You are standing in front of the client's building. Your appointment is at 14:00." },
    time: 15000,
    mechanic: 'timing',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', el('rect', { x: 188, y: 150, width: 230, height: 320, fill: '#f7f7f4', stroke: '#d4d4d0', 'stroke-width': 3 }));
      const door = scene.add('bg', P.door({ x: 214, floor: 470, w: 72, h: 150 }));
      scene.add('bg', P.plant({ x: 166 }));
      const face = clockFace(scene, 250, 232, 40, 298);
      scene.label(250, 172, { jp: 'サクラ{商事|しょうじ}', en: 'Sakura Trading' });
      scene.label(112, 214, { jp: '14{時|じ}の お{約束|やくそく}', en: 'Appointment: 14:00' }, 'deadline');
      scene.add('mid', P.bag({ x: 58 }));
      const player = pad(scene.person({ x: 100, y: 470, facing: 1, color: 'player', player: true }));
      return { player, door, face };
    },
    params: {
      target: 'player',
      label: 'You (tap to go to the reception desk)',
      script: [
        [0, (s, r) => s.every((dt, t) => r.face.set(clockMin(Math.min(t, s.flags.stop ?? Infinity))))],
      ],
      /* the clock runs 13:30 → 14:05 in 14 s (1 s = 2.5 min) */
      judge(tapAt, flags) {
        if (tapAt === null) return 'late';
        flags.stop = tapAt;
        const m = Math.floor(clockMin(tapAt));
        if (m >= 60) return 'late';
        if (m >= 59) return 'tight';
        if (m >= 53) return 'great';
        if (m >= 44) return 'bit';
        return 'far';
      },
      onTap(scene, r) { return enterLobby(scene, r); },
      onTimeout(scene, r) { return enterLobby(scene, r); },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.reception, line: { jp: 'お{待|ま}ちしておりました。（ぴったり！こちらも {落|お}ち{着|つ}いて{迎|むか}えられる）', en: 'We have been expecting you. (Perfect timing! I can welcome you calmly.)' },
        react(scene, r) { r.recep.mark('sparkle'); } },
      tight: { grade: 'ok', who: WHO.reception, line: { jp: 'ぎりぎりですね…！{田中|たなか}が {待|ま}っております。すぐ ご{案内|あんない}します！', en: 'Cutting it close! Tanaka is waiting. I will take you up right away!' },
        react(scene, r) { r.recep.mark('sweat'); } },
      bit: { grade: 'ok', who: WHO.reception, line: { jp: 'あ、お{早|はや}いですね。{田中|たなか}は {今|いま} {資料|しりょう}を{印刷|いんさつ}{中|ちゅう}で…{少|すこ}しお{待|ま}ちください！', en: 'Oh, you are early! Tanaka is printing the materials right now. Please wait a moment!' },
        react(scene, r) { r.recep.mark('sweat2'); } },
      far: { grade: 'ky', who: WHO.reception, line: { jp: 'えっ、もうお{見|み}えですか？{田中|たなか}は まだ{昼食|ちゅうしょく}{中|ちゅう}で…', en: 'Oh, you are here already? Tanaka is still at lunch...' },
        react(scene, r) { r.recep.mark('q'); } },
      late: { grade: 'ky', who: WHO.reception, line: { jp: '…{田中|たなか}は {先|さき}ほどから {待|ま}っております。', en: '...Tanaka has been waiting for a while now.' },
        react(scene, r) { r.recep.mark('anger'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{受付|うけつけ}に {行|い}く {時間|じかん}', en: 'When to check in at reception' },
      points: [
        { jp: '{約束|やくそく}の 10{分前|ぷんまえ}に、ビルの {前|まえ}に {着|つ}きます。ここで {準備|じゅんび}を します。', en: 'Arrive at the building about 10 minutes before the appointment and get ready outside.' },
        { jp: '{受付|うけつけ}には、{約束|やくそく}の 5{分前|ふんまえ}に {行|い}きます。', en: 'Go to the reception desk about 5 minutes before.' },
        { jp: '{早|はや}すぎるのも よくありません。{相手|あいて}の {迷惑|めいわく}に なります。', en: 'Being too early is not good either. It troubles your host.' },
      ],
      phrase: { jp: 'お{約束|やくそく}の {時間|じかん}より {少|すこ}し {早|はや}いのですが、よろしいでしょうか', ro: 'oyakusoku no jikan yori sukoshi hayai no desu ga, yoroshii deshō ka', en: 'I am a little earlier than my appointment time. Is that all right?' },
      why: { jp: '{日本|にほん}では「5{分前|ふんまえ}{行動|こうどう}」が {大切|たいせつ}です。{早|はや}すぎると、{相手|あいて}は {急|いそ}いで {準備|じゅんび}を します。{遅刻|ちこく}すると、{相手|あいて}を {待|ま}たせて しまいます。', en: 'In Japan "act 5 minutes early" is the rule. If you are too early, your host has to rush to get ready; if you are late, you keep them waiting.' },
      dont: { jp: '30{分前|ぷんまえ}に {受付|うけつけ}へ {行|い}かない。{時間|じかん}ぎりぎりにも {行|い}かない。', en: "Don't go to reception 30 minutes early — and don't cut it fine at the last minute either." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.label(svg, 100, 26, '5ふんまえ こうどう', { color: C.ink, size: 11 });
        svg.append(el('line', { x1: 24, y1: 82, x2: 176, y2: 82, stroke: '#d4d4d0', 'stroke-width': 5, 'stroke-linecap': 'round' }));
        [[34, 'ビルに つく', '10ふんまえ', C.ink], [102, 'うけつけ', '5ふんまえ', C.red], [168, 'やくそく', '14:00', C.ink]].forEach(([x, top, bottom, col]) => {
          svg.append(el('circle', { cx: x, cy: 82, r: 9, fill: col }));
          D.label(svg, x, 58, top, { color: col, size: 10 });
          D.label(svg, x, 112, bottom, { color: col, size: 10 });
        });
      },
    },
    test: { great: { at: 10000 }, ok: { at: 7200 }, ky: { at: 2000 } },
  });

  /* ------------------------------------------------------------------ 2-2 */
  const CARRY = { f: [15, 75], b: [8, 70] };
  const COAT = { x0: 56, end: 222, door: 148, desk: 210, walk: 6500 };   // start / end of the walk, the entrance, the reception zone

  /* a simple winter coat drawn over a side-view person (the thing you tap), plus its folded version */
  function wearCoat(p) {
    const { el, g, C } = KY.svg;
    const sleeve = d => [
      el('path', { d, stroke: C.red, 'stroke-width': 15, fill: 'none', 'stroke-linecap': 'round' }),
      el('path', { d, stroke: C.redSoft, 'stroke-width': 9, fill: 'none', 'stroke-linecap': 'round' }),
    ];
    const worn = g({}, [
      ...sleeve('M-13 -80 L-22 -47'), ...sleeve('M13 -80 L22 -47'),
      el('path', { d: 'M-14 -86 Q0 -93 14 -86 L21 -31 Q0 -25 -21 -31 Z', fill: C.redSoft, stroke: C.red, 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      el('path', { d: 'M0 -83 L0 -29', stroke: C.red, 'stroke-width': 2, fill: 'none' }),
      el('path', { d: 'M-9 -88 L0 -76 L9 -88', stroke: C.red, 'stroke-width': 2.5, fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      el('circle', { cx: 6, cy: -66, r: 2, fill: C.red }), el('circle', { cx: 6, cy: -52, r: 2, fill: C.red }), el('circle', { cx: 6, cy: -39, r: 2, fill: C.red }),
      el('circle', { cx: -22, cy: -42, r: 4.5, fill: C.red }), el('circle', { cx: 22, cy: -42, r: 4.5, fill: C.red }),
    ]);
    const folded = g({ opacity: 0 }, [
      el('rect', { x: -14, y: -6, width: 28, height: 12, rx: 4, fill: C.redSoft, stroke: C.red, 'stroke-width': 2.5 }),
      el('path', { d: 'M-4 -6 L-4 6 M5 -6 L5 6', stroke: C.red, 'stroke-width': 1.5, fill: 'none' }),
    ]);
    p.el.insertBefore(worn, p.over);
    p.el.insertBefore(folded, p.over);
    return { worn, folded };
  }

  /* take the coat off, fold it and carry it over the arm */
  function coatOff(scene, r) {
    const { set } = KY.svg;
    let armed = false;
    scene.tween({
      from: 0, to: 1, dur: 480, ease: 'out',
      step: k => {
        set(r.coat.worn, { opacity: 1 - k, transform: `translate(0 -60) scale(${1 - 0.55 * k}) translate(0 60)` });
        set(r.coat.folded, { opacity: Math.min(1, k * 2), transform: `translate(13 ${-64 - 16 * (1 - k)}) scale(${0.6 + 0.4 * k})` });
        if (!armed && k > 0.25) { armed = true; r.player.set({ arms: CARRY }); }
      },
    });
  }

  KY.defineStage({
    id: '2-2',
    chapter: 2,
    title: { jp: 'コートは どこで {脱|ぬ}ぐ？', en: 'Where Do You Take Your Coat Off?' },
    intro: { jp: 'さむい {冬|ふゆ}の {日|ひ}。コートを {着|き}て、お{客様|きゃくさま}の ビルに {来|き}ました。', en: "A cold winter day. You have come to the client's building in your coat." },
    time: 10500,
    mechanic: 'timing',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      /* the building: street on the left, lobby on the right */
      scene.add('bg', el('rect', { x: 146, y: 170, width: 270, height: 300, fill: '#f7f7f4', stroke: '#d4d4d0', 'stroke-width': 3 }));
      scene.add('bg', el('rect', { x: 142, y: 330, width: 18, height: 140, fill: '#f7f7f4' }));
      scene.add('bg', el('line', { x1: 146, y1: 330, x2: 160, y2: 330, stroke: '#bdbdbd', 'stroke-width': 4, 'stroke-linecap': 'round' }));
      scene.add('bg', el('rect', { x: 130, y: 466, width: 42, height: 4, rx: 2, fill: '#e2e2dd' }));
      scene.add('bg', P.plant({ x: 178 }));
      /* snow outside */
      [[44, 250], [78, 300], [112, 262], [60, 350], [98, 380], [132, 330], [38, 420], [84, 440], [120, 410], [66, 214], [124, 222]].forEach(([x, y]) =>
        scene.add('bg', el('circle', { cx: x, cy: y, r: 2.6, fill: '#dde6ee' })));
      /* zones of the walk */
      [COAT.door, COAT.desk].forEach(x => scene.add('bg', el('line', { x1: x, y1: 478, x2: x, y2: 526, stroke: '#cfcfca', 'stroke-width': 2, 'stroke-dasharray': '4 4' })));
      scene.label(102, 504, { jp: '{外|そと}', en: 'outside' }, 'slot-label');
      scene.label(179, 504, { jp: 'ロビー', en: 'lobby' }, 'slot-label');
      scene.label(262, 504, { jp: '{受付|うけつけ}', en: 'reception' }, 'slot-label');
      const recep = scene.person({ x: 286, y: 470, facing: -1, color: 'npc2', tag: WHO.reception });
      counter(scene, 252, 62);
      const player = pad(scene.person({ x: COAT.x0, y: 470, facing: 1, color: 'player', player: true }));
      return { player, recep, coat: wearCoat(player) };
    },
    params: {
      target: 'player',
      label: 'You in your coat (tap to take it off)',
      script: [
        [0, (s, r) => { r.cancelWalk = s.walk(r.player, COAT.end, COAT.walk); }],
        [0, (s, r) => {
          let zone = 0;
          s.every(() => {
            const x = r.player.o.x;
            s.flags.px = x;
            if (r.off) return;
            /* the longer you keep the coat on indoors, the hotter you get */
            const z = x >= COAT.desk ? 2 : x >= COAT.door + 8 ? 1 : 0;
            if (z !== zone) { zone = z; r.player.mark(z === 2 ? 'sweat2' : z === 1 ? 'sweat' : null); }
          });
        }],
        [300, (s, r) => s.say(r.player, { jp: '{寒|さむ}い…！', en: 'Brr, it is cold...' }, { kind: 'think', dur: 1700, cls: 'mine' })],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'never';
        const x = flags.px ?? COAT.x0;
        return x < COAT.door ? 'great' : x < COAT.desk ? 'lobby' : 'late';
      },
      onTap(scene, r) {
        r.off = true;
        r.player.mark(null);
        if (r.cancelWalk) r.cancelWalk();
        coatOff(scene, r);
        const left = Math.max(0, COAT.end - r.player.o.x);
        const ms = left > 2 ? Math.max(500, left / 0.13) : 0;
        if (ms) scene.walk(r.player, COAT.end, ms);
        return Math.max(900, ms + 300);
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.reception, line: { jp: 'いらっしゃいませ。（コートが きれいに たたんである…できる{人|ひと}だ）', en: 'Welcome. (The coat is neatly folded... this one is capable.)' },
        react(scene, r) { r.recep.mark('sparkle'); } },
      lobby: { grade: 'ok', who: WHO.reception, line: { jp: 'いらっしゃいませ。（コートの{雪|ゆき}が ロビーに…{後|あと}で {拭|ふ}かなきゃ）', en: 'Welcome. (Snow from the coat on the lobby floor... I will have to wipe it later.)' },
        react(scene, r) { r.recep.mark('sweat'); } },
      late: { grade: 'ky', who: WHO.reception, line: { jp: 'きゃっ、コートの{雪|ゆき}が カウンターに！', en: 'Eek, snow from your coat is landing on the counter!' },
        react(scene, r) { r.recep.mark('shock'); } },
      never: { grade: 'ky', who: WHO.reception, line: { jp: '…あの、{暑|あつ}くないですか？{顔|かお}が {真|ま}っ{赤|か}ですよ。', en: "...Um, aren't you hot? Your face is bright red." },
        react(scene, r) { r.recep.mark('q'); r.player.mark('sweat2'); } },
    },
    card: {
      badge: 'must',
      name: { jp: 'コートは {建物|たてもの}の {外|そと}で {脱|ぬ}ぐ', en: 'Take your coat off outside' },
      points: [
        { jp: 'ビルに {入|はい}る {前|まえ}に、{外|そと}で コートを {脱|ぬ}ぎます。', en: 'Take your coat off outside, before you enter the building.' },
        { jp: 'ほこりが ついた ほうを {中|なか}に して、たたみます。', en: 'Fold it with the dusty outer side on the inside.' },
        { jp: 'たたんだ コートは、うでに かけて {持|も}ちます。', en: 'Carry the folded coat over your arm.' },
      ],
      phrase: { jp: 'コートを お{預|あず}けしても よろしいですか', ro: 'kōto o oazukeshite mo yoroshii desu ka', en: 'May I leave my coat with you?' },
      why: { jp: 'コートには、{外|そと}の ほこりや {花粉|かふん}が ついています。それを {会社|かいしゃ}の {中|なか}に {持|も}って {入|はい}らない ための マナーです。', en: "A coat carries dust and pollen from outside. This manner keeps them out of the client's office." },
      dont: { jp: 'コートを {着|き}たまま {受付|うけつけ}まで {行|い}かない。', en: "Don't walk up to reception still wearing your coat." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.floor(svg, 128);
        svg.append(el('rect', { x: 110, y: 24, width: 8, height: 58, fill: '#d9d9d5' }));
        svg.append(el('line', { x1: 106, y1: 82, x2: 122, y2: 82, stroke: '#bdbdbd', 'stroke-width': 3, 'stroke-linecap': 'round' }));
        D.person(svg, { x: 56, y: 128, s: 0.8, color: 'player', arms: CARRY });
        D.rect(svg, 54, 72, 24, 11, { r: 3, fill: '#ffe3e5', stroke: C.red });
        D.arrow(svg, 56, 24, 56, 34, { color: C.red });
        D.label(svg, 56, 18, 'ここで ぬぐ', { color: C.red, size: 10 });
        D.label(svg, 60, 146, 'そと');
        D.label(svg, 162, 146, 'ロビー');
      },
    },
    test: { great: { at: 1800 }, ok: { at: 4800 }, ky: { at: 7000 } },
  });

  /* ------------------------------------------------------------------ 2-3 */
  KY.defineStage({
    id: '2-3',
    chapter: 2,
    title: { jp: '{受付|うけつけ}で {何|なん}と {言|い}う？', en: 'At Reception' },
    intro: { jp: 'お{客様|きゃくさま}の {会社|かいしゃ}の {受付|うけつけ}です。14{時|じ}に、{営業部|えいぎょうぶ}の {田中|たなか}さんと {会|あ}う {約束|やくそく}です。', en: 'You are at the reception desk. You have a 14:00 appointment with Mr. Tanaka of the Sales Department.' },
    time: 12000,
    mechanic: 'choice',
    setup(scene) {
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 50, y: 160, w: 80, h: 62 }));
      scene.add('bg', P.clock({ x: 260, y: 190, r: 20, h: 1, m: 55 }));
      const recep = scene.person({ x: 258, y: 470, facing: -1, color: 'npc2', tag: WHO.reception });
      counter(scene, 206, 104);
      const player = scene.person({ x: 92, y: 470, facing: 1, color: 'player', player: true });
      return { player, recep };
    },
    params: {
      script: [
        [300, (s, r) => s.say(r.recep, { jp: 'いらっしゃいませ。', en: 'Welcome.' }, { dur: 2400 })],
      ],
      showAt: 1800,
      options: [
        { id: 'full', text: { jp: 'ABCシステムの{山田|やまだ}と<<{申|もう}します>>。14{時|じ}に {営業部|えいぎょうぶ}の{田中様|たなかさま}と お{約束|やくそく}を いただいております', en: 'I am Yamada from ABC Systems. I have a 2 p.m. appointment with Mr. Tanaka of the Sales Department.' }, outcome: 'great' },
        { id: 'visit', text: { jp: '{田中様|たなかさま}に {会|あ}いに {来|き}ました', en: 'I came to see Mr. Tanaka.' }, outcome: 'vague' },
        { id: 'casual', text: { jp: '{田中|たなか}さん、いますか？', en: 'Is Tanaka-san in?' }, outcome: 'casual' },
      ],
      onChoose(scene, r, opt) {
        scene.say(r.player, opt.text, { dur: opt.id === 'full' ? 4200 : 2400, cls: 'mine' });
        return opt.id === 'full' ? 3800 : 2600;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.reception, line: { jp: '（{会社|かいしゃ}も{名前|なまえ}も{時間|じかん}も…{全部|ぜんぶ} {言|い}ってくれた。{助|たす}かる！）{田中|たなか}ですね。ご{案内|あんない}します。', en: '(Company, name, time... they told me everything. What a help!) Tanaka? I will show you the way.' },
        react(scene, r) { r.recep.mark('sparkle'); } },
      vague: { grade: 'ok', who: WHO.reception, line: { jp: 'あの、{失礼|しつれい}ですが…どちらの{田中|たなか}でしょうか？{三人|さんにん}おりまして…', en: 'Excuse me, but which Tanaka? We have three...' },
        react(scene, r) { r.recep.mark('q'); } },
      casual: { grade: 'ky', who: WHO.reception, line: { jp: '（…{友|とも}だち？）あの、{失礼|しつれい}ですが、どちら{様|さま}でしょうか。', en: '(...A friend?) Excuse me, who may I say is calling?' },
        react(scene, r) { r.recep.mark('dots'); } },
      silent: { grade: 'ky', who: WHO.reception, line: { jp: '…あの、ご{用件|ようけん}は…？', en: '...Um, how may I help you?' },
        react(scene, r) { r.recep.mark('q'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{受付|うけつけ}で {伝|つた}える こと', en: 'What to say at reception' },
      points: [
        { jp: '「ABCシステムの {山田|やまだ}です」のように、{会社|かいしゃ}の {名前|なまえ}と {自分|じぶん}の {名前|なまえ}を {言|い}います。', en: 'Say your company and your name: "I am Yamada from ABC Systems."' },
        { jp: '{約束|やくそく}の {時間|じかん}と、{会|あ}う {人|ひと}の {名前|なまえ}を {言|い}います。{営業部|えいぎょうぶ}など、グループの {名前|なまえ}も {言|い}うと いいです。', en: 'Say the appointment time and who you are meeting. Adding their department helps.' },
        { jp: '{会|あ}う {人|ひと}には「{様|さま}」を つけます。「{田中様|たなかさま}」は「{田中|たなか}さん」より {丁寧|ていねい}です。', en: 'Add "-sama" to the person you are meeting. "Tanaka-sama" is more polite than "Tanaka-san".' },
      ],
      phrase: { jp: 'ABCシステムの{山田|やまだ}と<<{申|もう}します>>。14{時|じ}に {営業部|えいぎょうぶ}の{田中様|たなかさま}と お{約束|やくそく}を いただいております', ro: 'ABC Shisutemu no Yamada to mōshimasu. Jūyoji ni eigyōbu no Tanaka-sama to oyakusoku o itadaite orimasu', en: 'I am Yamada from ABC Systems. I have a 2 p.m. appointment with Mr. Tanaka of the Sales Department.' },
      why: { jp: '{受付|うけつけ}の {人|ひと}は、たくさんの お{客様|きゃくさま}に {会|あ}います。{会社|かいしゃ}・{名前|なまえ}・{時間|じかん}・{会|あ}う {人|ひと}を {先|さき}に {言|い}うと、{受付|うけつけ}の {人|ひと}は すぐ {分|わ}かります。', en: 'Receptionists meet many visitors. If you give the company, your name, the time and the host up front, they know what to do right away.' },
      dont: { jp: '{会|あ}う {人|ひと}の {名前|なまえ}だけ {言|い}わない。「{田中|たなか}さん、いますか？」は {友|とも}だちへの {言|い}い{方|かた}です。', en: "Don't just ask for a name. \"Is Tanaka-san in?\" is how you would ask about a friend." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        [['かいしゃの なまえ', C.ink], ['じぶんの なまえ', C.ink], ['やくそくの じかん', C.ink], ['あいての なまえ + さま', C.red]].forEach(([t, col], i) => {
          D.seat(svg, 30, 30 + i * 30, i + 1, { top: true });
          D.label(svg, 48, 34 + i * 30, t, { anchor: 'start', color: col, size: 11 });
        });
      },
    },
    test: { great: 'full', ok: 'visit', ky: 'casual' },
  });

  /* ------------------------------------------------------------------ 2-4 */
  const ELV = { bl: { x: 121, y: 216 }, br: { x: 239, y: 216 }, fl: { x: 121, y: 324 }, fr: { x: 239, y: 324 } };   // the four spots in the car (car centre 180, 270)

  /* Big labelled picture of the elevator car (card.figure, viewBox 0 0 320 244), drawn like the stage:
     doors in the bottom wall, the button panel on the left wall next to the doors, the back at the top.
     1 = back right (best, the client), 2 = back left (the boss), 3 = front right (others), 4 = in front of the buttons (you) */
  function figElevator(svg) {
    const D = KY.diag, { el, C } = KY.svg;
    const X = 52, Y = 6, W = 256, H = 178, B = Y + H, CX = X + W / 2;
    svg.append(el('rect', { x: X, y: Y, width: W, height: H, fill: '#fff', stroke: '#c4c4c4', 'stroke-width': 4 }));
    /* doors: a gap in the bottom wall with a post on each side, and an arrow coming in */
    svg.append(
      el('line', { x1: CX - 64, y1: B, x2: CX + 64, y2: B, stroke: '#fff', 'stroke-width': 6 }),
      el('path', { d: `M${CX - 64} ${B}v12M${CX + 64} ${B}v12`, fill: 'none', stroke: '#9a9a9a', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    );
    D.arrow(svg, CX, 238, CX, B + 10);
    D.label(svg, CX + 12, 222, 'ドア', { size: 10, color: C.ink, weight: 900, anchor: 'start' });
    /* button panel on the left wall, next to the doors */
    svg.append(el('rect', { x: X + 6, y: 123, width: 14, height: 40, rx: 3, fill: '#c9c9c9' }));
    [130, 138, 146, 154].forEach(y => svg.append(el('circle', { cx: X + 13, cy: y, r: 2.4, fill: '#8a8a8a' })));
    D.label(svg, 26, 146, 'ボタン', { size: 10, color: C.ink, weight: 900 });
    D.label(svg, CX, 26, 'うしろ', { size: 10 });

    const spots = { 1: [249, 47, 'おきゃくさま'], 2: [111, 47, 'じょうし'], 3: [249, 143, 'ほかの ひと'], 4: [111, 143, 'あなた'] };
    for (const n of [1, 2, 3, 4]) {
      const [x, y, who] = spots[n], you = n === 4;
      D.seat(svg, x, y, n, { you, top: n === 1 });
      D.label(svg, x, y + 21, who, { size: 9, color: you ? C.red : '#555', weight: 900 });
    }
  }

  KY.defineStage({
    id: '2-4',
    chapter: 2,
    title: { jp: 'エレベーターでは どこに {立|た}つ？', en: 'Where Do You Stand in the Elevator?' },
    intro: { jp: 'お{客様|きゃくさま}と {上司|じょうし}を、エレベーターに {案内|あんない}します。', en: 'You are showing a client and your boss to the elevator.' },
    time: 14000,
    mechanic: 'place',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.08, x: 180, y: 350 });
      scene.add('bg', el('rect', { x: 40, y: 376, width: 280, height: 190, rx: 6, fill: '#f4f4f1' }));
      scene.add('bg', P.elevatorTop({ x: 180, y: 270, w: 220, h: 200, panel: 'left' }));
      scene.add('bg', el('line', { x1: 110, y1: 192, x2: 250, y2: 192, stroke: '#cfcfcb', 'stroke-width': 5, 'stroke-linecap': 'round' }));   // hand rail
      [312, 320, 328, 336].forEach(y => scene.add('bg', el('circle', { cx: 80, cy: y, r: 2.4, fill: '#8a8a8a' })));
      scene.label(42, 324, { jp: 'ボタン', en: 'buttons' });
      scene.label(270, 390, { jp: 'ドア', en: 'door' });
      const client = scene.person({ top: true, x: 148, y: 474, dir: 0, tag: WHO.customer });
      const manager = scene.person({ top: true, x: 214, y: 474, dir: 0, tag: WHO.manager });
      const player = scene.person({ top: true, x: 180, y: 420, dir: 0, color: 'player', player: true });
      return { client, manager, player, talks: [] };
    },
    params: {
      item: 'player',
      script: [
        [400, (s, r) => r.talks.push(s.say(r.client, { jp: '{会議室|かいぎしつ}は {上|うえ}の {階|かい}ですね。', en: 'The meeting room is on an upper floor, right?' }, { dur: 2600 }))],
        [3200, (s, r) => r.talks.push(s.say(r.manager, { jp: 'お、エレベーターが {来|き}たね。', en: 'Oh, the elevator has arrived.' }, { dur: 2400 }))],
      ],
      zones: [
        { id: 'panel', x: ELV.fl.x, y: ELV.fl.y, outcome: 'great' },
        { id: 'front-right', x: ELV.fr.x, y: ELV.fr.y, outcome: 'far' },
        { id: 'back-left', x: ELV.bl.x, y: ELV.bl.y, outcome: 'back' },
        { id: 'back-right', x: ELV.br.x, y: ELV.br.y, outcome: 'back' },
      ],
      onPlace(scene, r, zone) {
        r.talks.forEach(n => { if (n.isConnected) scene.removeOverlay(n); });
        r.player.set({ dir: zone.id === 'panel' ? 270 : 180 });
        /* the guests follow: the best spot is the back corner farthest from the buttons */
        let c, m;
        if (zone.id === 'panel') { c = ELV.br; m = ELV.bl; }
        else if (zone.id === 'front-right') { c = ELV.br; m = ELV.fl; }
        else { c = ELV.fr; m = ELV.fl; }
        route(scene, r.client, [{ x: 150, y: 394 }, c], 800, () => r.client.set({ dir: 180 }));
        scene.after(300, () => route(scene, r.manager, [{ x: 210, y: 394 }, m], 800, () => r.manager.set({ dir: 180 })));
        return 1700;
      },
      timeout: 'stay',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.manager, line: { jp: '（{新人|しんじん}が ボタン{係|がかり}を…{成長|せいちょう}したな）', en: '(The newbie took the button duty... you have grown.)' },
        react(scene, r) { r.manager.mark('sparkle'); r.client.mark('heart'); } },
      far: { grade: 'ok', who: WHO.manager, line: { jp: '…ボタン、{私|わたし}が {押|お}そうか？', en: '...Shall I press the buttons myself?' },
        react(scene, r) { r.manager.mark('sweat'); } },
      back: { grade: 'ky', who: WHO.customer, line: { jp: '（{案内|あんない}の{人|ひと}が いちばん{奥|おく}…？{私|わたし}たちが {扉|とびら}の{前|まえ}…？）', en: '(The guide is in the best corner...? And we are by the door...?)' },
        react(scene, r) { r.client.mark('q'); r.manager.mark('sweat2'); } },
      stay: { grade: 'ky', who: WHO.manager, line: { jp: '{山田|やまだ}くん、{乗|の}らないの？{閉|し}まるよ！', en: "Yamada, aren't you getting in? The doors are closing!" },
        react(scene, r) { r.manager.mark('ex'); r.client.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: 'エレベーターで {立|た}つ {場所|ばしょ}', en: 'Where to stand in an elevator' },
      points: [
        { jp: 'ボタンの {前|まえ}は、{案内|あんない}する {人|ひと}の {場所|ばしょ}です。{行|い}き{先|さき}の ボタンを {押|お}します。', en: 'The spot in front of the buttons is for the guide, who presses the floor buttons.' },
        { jp: 'お{客様|きゃくさま}と {上司|じょうし}には、{後|うし}ろに {立|た}って もらいます。', en: 'Guests and your boss stand at the back.' },
        { jp: 'いちばん {後|うし}ろの、ボタンから はなれた {角|かど}が {上座|かみざ}です。', en: 'The back corner farthest from the buttons is the top seat (kamiza).' },
      ],
      phrase: { jp: '{何階|なんがい}ですか？', ro: 'nangai desu ka?', en: 'Which floor, please?' },
      why: { jp: 'ボタンの {前|まえ}に {立|た}てば、{階|かい}を {選|えら}んだり、ドアを {開|あ}けたり できます。お{客様|きゃくさま}は {何|なに}も しなくて いいです。{後|うし}ろは いちばん {安全|あんぜん}で しずかな {場所|ばしょ}なので、お{客様|きゃくさま}に {立|た}って もらいます。', en: 'At the buttons you can choose the floor and hold the door, so guests need to do nothing. The back is the calmest, safest spot, so guests stand there.' },
      dont: { jp: '{後|うし}ろの {角|かど}に {先|さき}に {立|た}たない。お{客様|きゃくさま}に ボタンを {押|お}して もらわない。', en: "Don't take the back corner yourself, and don't make a guest press the buttons." },
      tip: { jp: 'どの {角|かど}が {上座|かみざ}か、{本|ほん}や {会社|かいしゃ}で ちがいます。わからない ときは、ボタンの {前|まえ}に {立|た}って「{何階|なんがい}ですか？」と {聞|き}けば、いつでも {大丈夫|だいじょうぶ}です。', en: 'Which back corner is the top seat differs by guide book and company. If unsure, stand at the buttons and ask "Which floor?" — that is always safe.' },
      diagram(svg) {
        const D = KY.diag;
        D.room(svg, { x: 44, y: 10, w: 120, h: 118, door: 'b' });
        D.rect(svg, 41, 84, 7, 28, { r: 2, fill: '#c9c9c9' });
        D.label(svg, 22, 102, 'ボタン', { size: 8 });
        D.seat(svg, 140, 36, 1, { top: true });
        D.seat(svg, 68, 36, 2);
        D.seat(svg, 140, 96, 3);
        D.seat(svg, 68, 96, 4, { you: true });
      },
      figure: {
        draw: figElevator,
        rule: { jp: 'ボタンを {押|お}す あなたは ボタンの {前|まえ}、お{客様|きゃくさま}と {上司|じょうし}は {後|うし}ろに {立|た}ちます。', en: 'You press the buttons, so you stand in front of them; the client and your boss stand at the back.' },
        legend: [
          { n: 1, top: true, jp: '{上座|かみざ}。いちばん {後|うし}ろの {角|かど}です。お{客様|きゃくさま}が {立|た}ちます。', en: 'Kamiza, the best spot: the far back corner. The client stands here.' },
          { n: 2, jp: '{後|うし}ろの もう ひとつの {角|かど}です。{上司|じょうし}が {立|た}ちます。', en: 'The other back corner. Your boss stands here.' },
          { n: 3, jp: 'ドアに {近|ちか}い {場所|ばしょ}です。ほかの {人|ひと}が {立|た}ちます。', en: 'Near the doors. Other people stand here.' },
          { n: 4, you: true, jp: 'あなたの {場所|ばしょ}。ボタンの {前|まえ}で、{下座|しもざ}です。', en: 'Your spot: in front of the buttons, the lowest position (shimoza).' },
        ],
      },
    },
    test: { great: 'panel', ok: 'front-right', ky: 'back-right' },
  });

  /* ------------------------------------------------------------------ 2-5 */
  const ELEV = { x: 200, w: 170, h: 220, half: 85 };
  const REACH = { f: [10, 0], b: [75, 15] };   // the guide's left arm reaches the button

  /* the world of 2-5: doors, the guests walking out one by one, and you (the guide) stepping out last */
  function runElevator(scene, r) {
    const OPEN_T = 700, AUTO_T = 2400, RATE = 1 / 600, EX = 1100, GAP = 250;
    const mk = (p, x0, to) => ({ p, x0, to, state: 'in', prog: 0, t0: 0 });
    const guests = [mk(r.client, 192, { x: 138, y: 546 }), mk(r.boss, 240, { x: 266, y: 550 })];
    const guide = mk(r.player, 138, { x: 202, y: 558 });
    const ease = KY.EASE.inout;
    let open = 0, released = false, said = false, lastOut = -1e9, reaching = false;
    const place = (o, e, k) => o.p.set({ x: o.x0 + (o.to.x - o.x0) * e, y: 470 + (o.to.y - 470) * e - Math.abs(Math.sin(k * Math.PI * 4)) * 3, s: 1 + 0.1 * e });
    const go = (o, t) => { o.state = 'go'; o.t0 = t; scene.layer.mid.append(o.p.el); if (o === guide) o.p.set({ arms: null }); };

    scene.at(OPEN_T, () => { KY.sfx.play('pop'); scene.pop(ELEV.x, 190, { jp: 'ポーン', en: 'ding!' }); });
    scene.every((dt, t) => {
      const a = scene._adjust, info = a && a.info;
      const held = !!(info && info.held);
      if (info && info.touched && !held) released = true;
      r.button.press(held);
      if (held && !said) { said = true; scene.say(r.player, { jp: 'どうぞ', en: 'After you.' }, { dur: 1500, cls: 'mine' }); }

      /* guests walk out one by one, only while the door is held open */
      if (!released && held && open >= 0.98) {
        const next = guests.find(o => o.state === 'in');
        if (next && !guests.some(o => o.state === 'go') && t - lastOut >= GAP) go(next, t);
      }
      const allOut = guests.every(o => o.state === 'out');
      if (released && allOut && guide.state === 'in') go(guide, t);
      for (const o of [...guests, guide]) {
        if (o.state !== 'go' || (released && o !== guide)) continue;
        o.prog = Math.min(1, (t - o.t0) / (o === guide ? 900 : EX));
        place(o, ease(o.prog), o.prog);
        if (o.prog >= 1) {
          o.state = 'out';
          if (o !== guide) {
            lastOut = t;
            const a = o.p.anchor();   // the thanks sits beside the head so it never covers the button
            scene.bubble({ x: a.x + (o === guests[0] ? 38 : -10), y: a.y - 4, text: { jp: 'ありがとう', en: 'Thanks.' }, dur: 1300 });
          }
        }
      }

      /* the guide reaches for the button while the doors are open */
      const reach = open > 0.3 && guide.state === 'in';
      if (reach !== reaching) { reaching = reach; r.player.set({ arms: reach ? REACH : null }); }

      /* the door */
      let target = 0;
      if (t >= OPEN_T) {
        if (!released) target = held || t < AUTO_T ? 1 : 0;
        else if (allOut) target = guide.state === 'out' ? 0 : 1;
        else {
          const b = guests.find(o => o.state === 'go' && o.prog < 0.4);   // someone in the doorway blocks it
          target = b ? Math.min(1, (Math.abs(b.p.o.x - ELEV.x) + 21) / (ELEV.half * 0.92)) : 0;
        }
      }
      const d = target - open;
      if (d !== 0) { const m = RATE * dt; open += Math.max(-m, Math.min(m, d)); r.elev.setOpen(open); }
      for (const o of guests) o.p.tagEl.style.opacity = o.state === 'in' ? String(Math.min(1, open * 3)) : '1';

      scene.flags.out = guests.filter(o => o.state === 'out').length;
      if (!(info && info.touched) && t > AUTO_T && open <= 0.001) scene.flags.autoClosed = true;
    });
  }

  KY.defineStage({
    id: '2-5',
    chapter: 2,
    title: { jp: 'エレベーターを おりる とき', en: 'Getting Off the Elevator' },
    intro: { jp: '{行|い}き{先|さき}の {階|かい}に {着|つ}きました。エレベーターの {中|なか}には、お{客様|きゃくさま}と {上司|じょうし}が います。', en: 'The elevator reaches your floor. The client and your boss are inside with you.' },
    time: 12000,
    mechanic: 'adjust',
    setup(scene) {
      const { el, g } = KY.svg;
      scene.camera({ zoom: 1.3, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      /* the operation panel on the wall next to the doors */
      scene.add('bg', el('rect', { x: 58, y: 346, width: 42, height: 106, rx: 6, fill: '#efefeb', stroke: '#c9c9c5', 'stroke-width': 2.5 }));
      [364, 376].forEach(y => scene.add('bg', el('circle', { cx: 79, cy: y, r: 4, fill: '#c9c9c5' })));
      const elev = scene.add('bg', P.elevatorFront({ x: ELEV.x, floor: 470, w: ELEV.w, h: ELEV.h, floorLabel: '5F' }));
      elev.inside.append(
        el('rect', { x: -62, y: -192, width: 124, height: 100, rx: 3, fill: '#fbfbfa', stroke: '#e6e6e2', 'stroke-width': 2 }),
        el('line', { x1: -78, y1: -96, x2: 78, y2: -96, stroke: '#d6d6d2', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      );
      /* people inside the car are drawn behind the door leaves (they hop out in front when they step out) */
      const wrap = g({ transform: `translate(${-ELEV.x} -470)`, 'clip-path': 'url(#ky25-clip)' });
      wrap.append(el('clipPath', { id: 'ky25-clip' }, [el('rect', { x: -300, y: -400, width: 900, height: 870.5 })]));   // keep feet above the floor line
      elev.inside.append(wrap);
      const mk = (x, o) => { const p = scene.person(Object.assign({ x, y: 470, view: 'front' }, o)); wrap.append(p.el); return p; };
      const player = mk(138, { color: 'player', player: true });
      const client = mk(192, { tag: WHO.customer });
      const boss = mk(240, { tag: WHO.manager });
      client.tagEl.style.opacity = '0';
      boss.tagEl.style.opacity = '0';
      const button = P.hitPad(P.button({ x: 80, y: 404, r: 17, label: 'ひらく', fontSize: 10 }), 76, 76);
      scene.add('fg', button);
      return { elev, player, client, boss, button };
    },
    params: {
      target: 'button',
      label: 'The open-door button (hold it)',
      input: 'hold',
      min: 0, max: 100, start: 0, speed: 0,
      commit: 'release',
      settle: 900,
      script: [[0, (s, r) => runElevator(s, r)]],
      apply(scene, r) { const a = scene._adjust; r.button.press(!!(a && a.info.held)); },
      check(v, info, scene) { return scene.flags.autoClosed ? 'closed' : null; },
      judge(v, info) {
        if (!info.touched) return 'closed';
        return info.flags.out >= 2 ? 'great' : 'pinched';
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: 'ありがとうございます。（ドアが {閉|し}まる{気配|けはい}が ゼロだ…{安心|あんしん}…）', en: 'Thank you. (Not the slightest sign of the doors closing... what a relief.)' },
        react(scene, r) { r.client.mark('sparkle'); r.boss.mark('heart'); } },
      pinched: { grade: 'ky', who: WHO.manager, line: { jp: '（ドアが…！）…{私|わたし}、まだ {降|お}りてないんだけど。', en: "(The door...!) ...I haven't gotten off yet, you know." },
        react(scene, r) { r.client.mark('shock'); r.boss.mark('sweat2'); } },
      closed: { grade: 'ky', who: WHO.manager, line: { jp: '…{山田|やまだ}くん、{降|お}りる{階|かい}、{過|す}ぎたよ。', en: '...Yamada, we have passed our floor.' },
        react(scene, r) {
          r.boss.mark('dots');
          scene.after(500, () => r.elev.setLabel('4F'));
          scene.after(1000, () => r.elev.setLabel('3F'));
        } },
    },
    card: {
      badge: 'must',
      name: { jp: 'エレベーターを {出|で}る {順番|じゅんばん}', en: 'Who gets off the elevator first' },
      points: [
        { jp: 'お{客様|きゃくさま}が いちばん {先|さき}に {出|で}ます。{次|つぎ}は {上司|じょうし}です。', en: 'The client gets off first, then your boss.' },
        { jp: '{案内|あんない}する {人|ひと}は、「{開|ひら}く」ボタンを ずっと {押|お}して います。', en: 'The guide keeps the "open" button pressed the whole time.' },
        { jp: '{案内|あんない}する {人|ひと}は、さいごに {出|で}ます。{出|で}る とき「どうぞ」と {言|い}います。', en: 'The guide gets off last and says "dōzo" (please go ahead).' },
      ],
      phrase: { jp: 'お{先|さき}に どうぞ', ro: 'osaki ni dōzo', en: 'After you, please.' },
      why: { jp: '{先|さき}に {出|で}る {人|ひと}が いるのに ドアが {閉|し}まると、{体|からだ}に あたって あぶないです。だから {案内|あんない}する {人|ひと}が ボタンを {押|お}して、お{客様|きゃくさま}を まもります。{先|さき}に {出|で}て {道|みち}を {見|み}せる、という {考|かんが}え{方|かた}も あります。', en: 'If the doors close while someone is stepping out, it is dangerous. So the guide holds the button and protects the guests. Some guides say the guide may step out first to show the way.' },
      dont: { jp: 'お{客様|きゃくさま}より {先|さき}に {出|で}ない。ボタンから {早|はや}く {手|て}を はなさない。', en: "Don't get off before the guests, and don't take your hand off the button too soon." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 112);
        [[40, 1, 'おきゃくさま', 'npc'], [100, 2, 'じょうし', 'npc'], [160, 3, 'あなた', 'player']].forEach(([x, n, t, col]) => {
          D.person(svg, { x, y: 112, s: 0.62, view: 'front', color: col });
          D.seat(svg, x, 128, n, { you: col === 'player' });
          D.label(svg, x, 150, t, { size: 9, color: col === 'player' ? C.red : '#666' });
        });
        D.label(svg, 100, 16, 'でる じゅん', { color: C.ink, size: 10 });
        D.arrow(svg, 50, 28, 150, 28);
      },
    },
    test: { great: { value: 5, releaseAt: 6500 }, ky: { value: 1, releaseAt: 1500 } },
  });

  /* ------------------------------------------------------------------ 2-6 */
  KY.defineStage({
    id: '2-6',
    chapter: 2,
    title: { jp: '{応接室|おうせつしつ}では どこに {座|すわ}る？', en: 'Where Do You Sit?' },
    intro: { jp: '{上司|じょうし}と いっしょに、お{客様|きゃくさま}の {会社|かいしゃ}の {応接室|おうせつしつ}に {入|はい}りました。', en: "You and your manager are shown into the client's reception room." },
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
      /* names of the furniture (removed once you sit) */
      const names = [
        scene.label(200, 166, { jp: 'ソファ', en: 'Sofa' }, 'name'), scene.label(200, 258, { jp: 'テーブル', en: 'Table' }, 'name'),
        scene.label(160, 362, { jp: 'いす', en: 'Chair' }, 'name'), scene.label(240, 362, { jp: 'いす', en: 'Chair' }, 'name'),
      ];
      const staff = scene.person({ top: true, x: 74, y: 400, dir: 90, tag: WHO.staff });
      const manager = scene.person({ top: true, x: 108, y: 316, dir: 0, tag: WHO.manager });
      const player = scene.person({ top: true, x: 140, y: 414, dir: 0, color: 'player', player: true });
      return { staff, manager, player, names };
    },
    params: {
      item: 'player',
      script: [
        [300, (s, r) => s.say(r.staff, { jp: 'こちらのソファにおかけになって、お{待|ま}ちください。', en: 'Please have a seat on the sofa and wait.' }, { dur: 3200 })],
        [3800, (s, r) => r.staff.set({ dir: 270 })],
      ],
      zones: [
        { id: 'sofa-near', x: 160, y: 158, outcome: 'great' },
        { id: 'sofa-far', x: 240, y: 158, outcome: 'far' },
        { id: 'chair-left', x: 160, y: 362, outcome: 'client' },
        { id: 'chair-right', x: 240, y: 362, outcome: 'client' },
      ],
      onPlace(scene, refs, zone) {
        refs.names.forEach(n => scene.removeOverlay(n));
        refs.player.set({ dir: zone.y < 250 ? 180 : 0 });
        if (zone.id === 'sofa-far') {
          scene.glide(refs.manager, { x: 200, y: 214 }, 700);
          return 900;
        }
        scene.glide(refs.manager, { x: 240, y: 158 }, 700, 'inout', () => refs.manager.set({ dir: 180 }));
        return 1000;
      },
      timeout: 'stand',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.manager, line: { jp: 'うん、そこでいい。', en: "Yes, that's the right spot." } },
      far: { grade: 'ky', who: WHO.manager, line: { jp: '…そこ、{私|わたし}の{席|せき}じゃないかな？', en: "...Isn't that MY seat?" },
        react(scene, r) { r.manager.mark('sweat2'); r.staff.mark('dots'); } },
      client: { grade: 'ky', who: WHO.staff, line: { jp: 'あ、そちらは{弊社|へいしゃ}の{者|もの}が{座|すわ}る{席|せき}でして…', en: "Ah, that's where our people sit..." },
        react(scene, r) { r.staff.mark('q'); r.manager.mark('sweat'); } },
      stand: { grade: 'ok', who: WHO.manager, line: { jp: '{座|すわ}っていいんだよ？', en: 'You can sit down, you know.' } },
    },
    card: {
      badge: 'depends',
      name: { jp: '{応接室|おうせつしつ}の {上座|かみざ}', en: 'The best seat in a reception room' },
      points: [
        { jp: '{入口|いりぐち}から いちばん はなれた {席|せき}が {上座|かみざ}です。{長|なが}い ソファは お{客様|きゃくさま}の {席|せき}です。', en: 'The seat farthest from the door is the top seat (kamiza). The long sofa is for guests.' },
        { jp: '「どうぞ」と {言|い}われてから、{言|い}われた ところに {座|すわ}ります。', en: 'Sit only after you are invited, where you are invited.' },
        { jp: '{上司|じょうし}が {入口|いりぐち}から はなれた ほう、あなたは {入口|いりぐち}に {近|ちか}い ほうに {座|すわ}ります。', en: 'Your boss sits farther in; you take the end nearest the door.' },
      ],
      phrase: { jp: '<<{失礼|しつれい}いたします>>', ro: 'shitsurei itashimasu', en: 'Excuse me. (said as you enter or sit down)' },
      why: { jp: '{上座|かみざ}は いちばん しずかで {安全|あんぜん}な {席|せき}です。だから いちばん {大切|たいせつ}な {人|ひと}が {座|すわ}ります。{会社|かいしゃ}に {来|き}た {人|ひと}は お{客様|きゃくさま}なので、ソファに {座|すわ}ります。', en: 'Kamiza is the calmest, safest seat, so the most important person sits there. Visitors are guests, so they get the sofa.' },
      dont: { jp: '{上司|じょうし}より いい {席|せき}に {座|すわ}らない。{相手|あいて}の {会社|かいしゃ}の {人|ひと}の {席|せき}（{一人|ひとり}がけの いす）にも {座|すわ}らない。', en: "Don't take a better seat than your boss, and don't sit in the host's armchairs." },
      tip: { jp: '{本|ほん}や {先生|せんせい}によって {言|い}うことが ちがいます。{相手|あいて}が すすめた {席|せき}に {座|すわ}れば {大丈夫|だいじょうぶ}です。{何|なに}も {言|い}われなかったら、{入口|いりぐち}に {近|ちか}い ほうで {待|ま}ちましょう。', en: 'Guides disagree on where a visitor should sit first. Follow what the host offers; if nothing is said, wait near the door end.' },
      diagram(svg) {
        const D = KY.diag;
        D.room(svg, { x: 30, y: 8, w: 140, h: 128, door: 'bl' });
        D.rect(svg, 62, 18, 92, 26, { r: 8 });
        D.rect(svg, 70, 56, 76, 38, { r: 4, fill: '#fbfaf7' });
        D.rect(svg, 66, 104, 30, 24, { r: 6 });
        D.rect(svg, 120, 104, 30, 24, { r: 6 });
        D.seat(svg, 132, 31, 1, { top: true });
        D.seat(svg, 84, 31, 2, { you: true });
        D.seat(svg, 135, 116, 3);
        D.seat(svg, 81, 116, 4);
        D.label(svg, 108, 80, 'テーブル');
      },
      figure: {
        draw(svg) {
          KY.diag.reception(svg, {
            seats: { 1: { who: 'じょうし' }, 2: { who: 'あなた', you: true }, 3: { who: 'あいて' }, 4: { who: 'あいて' } },
            sofaNote: 'ソファ ・ おきゃくさまの せき', chairNote: 'ひとりがけの いす ・ あいての かいしゃの せき',
          });
        },
        rule: { jp: '{長|なが}い ソファが お{客様|きゃくさま}の {席|せき}です。おなじ いすでは、{入口|いりぐち}から はなれた ほうが {上|うえ}です。', en: 'The long sofa is for the guests. On the same kind of seat, the one farther from the door ranks higher.' },
        legend: [
          { n: 1, top: true, jp: '{上座|かみざ}。いちばん いい {席|せき}です。{上司|じょうし}が {座|すわ}ります。', en: 'Kamiza, the best seat. Your boss sits here.' },
          { n: 2, you: true, jp: 'あなたの {席|せき}。ソファの {入口|いりぐち}に {近|ちか}い ほうです。', en: 'Your seat: the end of the sofa nearer the door.' },
          { n: 3, jp: '{相手|あいて}の {会社|かいしゃ}の {人|ひと}が {座|すわ}ります。', en: 'For the people of the company you are visiting.' },
          { n: 4, jp: '{下座|しもざ}。{入口|いりぐち}に いちばん {近|ちか}い {席|せき}です。', en: 'Shimoza, the seat nearest the door.' },
        ],
      },
    },
    test: { great: 'sofa-near', ky: 'sofa-far', ok: null },
  });

  /* ------------------------------------------------------------------ 2-7 */
  KY.defineStage({
    id: '2-7',
    chapter: 2,
    title: { jp: 'お{客様|きゃくさま}が {来|き}た！', en: 'Here Comes the Client' },
    intro: { jp: 'お{客様|きゃくさま}の {会社|かいしゃ}の {応接室|おうせつしつ}で、ソファに {座|すわ}って {待|ま}っています。', en: "You are sitting on the sofa in the client's reception room, waiting." },
    time: 11000,
    mechanic: 'timing',
    setup(scene) {
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 128, y: 212, w: 92, h: 70 }));
      scene.add('bg', P.clock({ x: 58, y: 236, r: 17, h: 2, m: 0 }));
      const door = scene.add('bg', P.door({ x: 252, floor: 470, w: 60, h: 140 }));
      scene.add('mid', P.seat({ x: 80, w: 70, back: 'left' }));
      const player = pad(scene.person({ x: 90, y: 470, pose: 'sit', facing: 1, color: 'player', player: true }));
      scene.add('mid', P.table({ x: 176, y: 438, w: 54 }));
      const client = scene.person({ x: 282, y: 470, facing: -1, hidden: true });
      return { player, client, door };
    },
    params: {
      target: 'player',
      label: 'You (tap to stand up)',
      script: [
        [3400, s => s.bubble({ x: 282, y: 330, tail: 'down', kind: 'think', text: { jp: 'コツ… コツ…', en: '(footsteps)' }, dur: 1500 })],
        [4200, (s, r) => {
          s.flag('cue');
          KY.sfx.play('pop');
          s.tween({ from: 0, to: 1, dur: 350, step: v => r.door.setOpen(v) });
          r.client.set({ hidden: false });
          r.client.tagEl = s.tag(r.client, WHO.client);
          s.walk(r.client, 228, 1300);
        }],
        [5100, (s, r) => { r.talk = s.say(r.client, { jp: 'お{待|ま}たせいたしました。', en: 'Sorry to keep you waiting.' }, { dur: 2200 }); }],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'seated';
        if (flags.cue === undefined) return 'early';
        return tapAt - flags.cue <= 1500 ? 'great' : 'slow';
      },
      onTap(scene, r, key) {
        const p = r.player;
        if (r.talk && r.talk.isConnected) scene.removeOverlay(r.talk);
        p.mark(null);
        p.set({ pose: 'stand' });
        scene.tween({ from: p.o.x, to: 134, dur: 260, step: v => p.set({ x: v }) });
        if (key === 'early') return 1000;
        scene.tween({ from: 0, to: 20, dur: 260, step: v => p.set({ bow: v }) });
        scene.after(1000, () => p.set({ bow: 0 }));
        scene.say(p, { jp: '{本日|ほんじつ}は よろしく お{願|ねが}いいたします。', en: 'Thank you for having me today.' }, { dur: 2200, cls: 'mine' });
        return 2000;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.client, line: { jp: 'お{待|ま}たせいたしました。（お、すぐ {立|た}ってくれた。{礼儀|れいぎ}{正|ただ}しい{人|ひと}だな）', en: 'Sorry to keep you waiting. (Oh, they stood up right away. A well-mannered person.)' },
        react(scene, r) { r.client.mark('sparkle'); } },
      slow: { grade: 'ok', who: WHO.client, line: { jp: '（…{立|た}ち{上|あ}がるのを {待|ま}ってました）', en: '(...I was waiting for you to stand up.)' },
        react(scene, r) { r.client.mark('sweat'); } },
      early: { grade: 'ok', who: null, line: { jp: '（…まだ {誰|だれ}も {来|き}ません。{空振|からぶ}り！）', en: '(...Nobody is here yet. A false start!)' },
        react(scene, r) { r.player.mark('sweat'); } },
      seated: { grade: 'ky', who: WHO.client, line: { jp: '（あ、ソファの{居心地|いごこち}、いいんだ…）', en: "(Oh, the sofa must be very comfortable...)" },
        react(scene, r) { r.client.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{立|た}って {迎|むか}える', en: 'Stand up to greet someone' },
      points: [
        { jp: '{相手|あいて}が {部屋|へや}に {入|はい}って きたら、すぐに {立|た}ちます。', en: 'Stand up as soon as your host comes into the room.' },
        { jp: '{立|た}ったら、{相手|あいて}の {方|ほう}を {見|み}て、あいさつを します。', en: 'Face them and say your greeting.' },
        { jp: '{名刺交換|めいしこうかん}も、{立|た}ったまま します。', en: 'Exchange business cards standing up, too.' },
      ],
      phrase: { jp: '{本日|ほんじつ}は よろしく お{願|ねが}いいたします', ro: 'honjitsu wa yoroshiku onegai itashimasu', en: 'Thank you for having me today.' },
      why: { jp: '{座|すわ}ったままだと、{相手|あいて}より {上|うえ}に いる ように {見|み}えます。{立|た}つのは「あなたを {大切|たいせつ}に します」という {気持|きも}ちです。{早|はや}く {立|た}つほど、{気持|きも}ちが {伝|つた}わります。', en: 'Staying seated can look as if you are above them. Standing says "I respect you" — and the sooner you stand, the more clearly that comes across.' },
      dont: { jp: '{座|すわ}ったまま {相手|あいて}に あいさつ しない。{名刺|めいし}も {座|すわ}ったまま わたさない。', en: "Don't greet your host while sitting, and don't hand over your business card sitting down." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 128);
        D.person(svg, { x: 40, y: 128, s: 0.75, pose: 'sit', color: 'ghost' });
        D.arrow(svg, 62, 74, 96, 74, { color: C.red });
        D.label(svg, 80, 62, 'すぐ たつ', { color: C.red, size: 10 });
        D.person(svg, { x: 122, y: 128, s: 0.75, color: 'player' });
        D.person(svg, { x: 176, y: 128, s: 0.75, facing: -1 });
        D.label(svg, 100, 146, 'あいてが きたら');
      },
    },
    test: { great: { at: 4800 }, ok: { at: 1500 }, ky: null },
  });

  /* ------------------------------------------------------------------ 2-8 */
  const HOLD = { f: [80, 16], b: [72, 22] };

  KY.defineStage({
    id: '2-8',
    chapter: 2,
    title: { jp: '{名刺交換|めいしこうかん}', en: 'Exchanging Business Cards' },
    intro: { jp: 'お{客様|きゃくさま}と はじめて {会|あ}いました。{名刺|めいし}を わたしあいます。', en: 'You meet the client for the first time. Time to exchange business cards.' },
    time: 18000,
    mechanic: 'action',
    setup(scene) {
      scene.camera({ zoom: 1.2, x: 170, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 196, y: 196, w: 92, h: 70 }));
      const player = scene.person({ x: 118, y: 470, facing: 1, color: 'player', player: true, arms: HOLD });
      const client = scene.person({ x: 248, y: 470, facing: -1, arms: HOLD, tag: WHO.client });
      const ph = player.hand(), ch = client.hand();
      const myCard = P.hitPad(P.card({ x: ph.x + 10, y: ph.y - 4, red: true }));
      const theirCard = P.card({ x: ch.x - 10, y: ch.y - 4 });
      scene.add('fg', myCard);
      scene.add('fg', theirCard);
      return { player, client, myCard, theirCard, my: { x: ph.x + 10, y: ph.y - 4 }, their: { x: ch.x - 10, y: ch.y - 4 } };
    },
    params: {
      start(scene, r) {
        let phase = 1, done = false, first = null;
        const end = key => { if (done) return; done = true; scene.end(key); };

        scene.at(300, () => scene.say(r.player, { jp: 'はじめまして。ABCシステムの{山田|やまだ}と<<{申|もう}します>>。', en: "Nice to meet you. I'm Yamada from ABC Systems." }, { dur: 2600, cls: 'mine' }));
        scene.at(3100, () => scene.say(r.client, { jp: 'サクラ{商事|しょうじ}の{田中|たなか}です。', en: "I'm Tanaka from Sakura Trading." }, { dur: 2400 }));

        /* phase 1: offer your card (drag the red card to the client) */
        const card = r.myCard;
        let pos = { x: r.my.x, y: r.my.y };
        let off = null;
        scene.onDrag(card.el, {
          start(p) { if (phase !== 1) return; off = { x: p.x - pos.x, y: p.y - pos.y }; KY.sfx.play('pick'); },
          move(p) {
            if (phase !== 1 || !off) return;
            pos = { x: Math.max(100, Math.min(236, p.x - off.x)), y: Math.max(r.their.y - 60, Math.min(r.their.y + 60, p.y - off.y)) };
            card.moveTo(pos.x, pos.y);
          },
          end() {
            if (phase !== 1 || !off) return;
            off = null;
            if (pos.x >= 192) offer(pos.y - r.their.y);
            else scene.glide({ moveTo: (x, y) => { pos = { x, y }; card.moveTo(x, y); }, x: pos.x, y: pos.y }, r.my, 220);
          },
        }, 'Your business card (drag to the client)');

        function offer(dy) {
          if (phase !== 1) return;
          phase = 1.5;
          first = dy > 5 ? 'low' : dy < -5 ? 'high' : 'same';
          KY.sfx.play('drop');
          const meet = { x: 200, y: r.their.y + (first === 'low' ? 10 : first === 'high' ? -12 : 0) };
          card.moveTo(meet.x, meet.y);
          scene.glide({ moveTo: (x, y) => r.theirCard.moveTo(x, y), x: r.their.x, y: r.their.y }, { x: r.my.x, y: r.my.y + 2 }, 500);
          scene.glide({ moveTo: (x, y) => card.moveTo(x, y), x: meet.x, y: meet.y }, { x: r.their.x + 4, y: r.their.y }, 500);
          scene.after(550, () => scene.say(r.player, { jp: '<<{頂戴|ちょうだい}いたします>>。', en: 'Thank you. (I humbly receive it.)' }, { dur: 1500, cls: 'mine' }));
          if (first === 'high') scene.after(700, () => r.client.mark('q'));
          scene.after(2100, startPhase2);
        }

        /* phase 2: where does their card go? */
        let theirs = null, zones = [], p2Timer = null;
        function startPhase2() {
          if (done) return;
          phase = 2;
          /* switch to a view from above the table */
          scene.clear();
          const { el } = KY.svg;
          scene.camera({ zoom: 1.12, x: 180, y: 300 });
          scene.add('bg', P.tableTop({ x: 180, y: 290, w: 260, h: 116 }));
          scene.add('bg', P.chairTop({ x: 180, y: 392, back: 'bottom' }));
          scene.add('bg', P.chairTop({ x: 180, y: 190, back: 'top' }));
          scene.person({ top: true, x: 180, y: 196, dir: 180, tag: WHO.client });
          scene.person({ top: true, x: 180, y: 388, dir: 0, color: 'player', player: true });
          const myCase = { x: 118, y: 318 }, cup = { x: 250, y: 316 }, bag = { x: 96, y: 408 };
          scene.add('mid', el('rect', { x: myCase.x - 24, y: myCase.y - 13, width: 48, height: 26, rx: 4, fill: '#efe7d6', stroke: '#3a3a3a', 'stroke-width': 2.5 }));
          scene.add('mid', el('rect', { x: 166, y: 304, width: 52, height: 38, rx: 3, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 2 }));
          scene.add('mid', el('circle', { cx: cup.x, cy: cup.y, r: 13, fill: '#fff', stroke: '#3a3a3a', 'stroke-width': 2.5 }));
          scene.add('mid', el('circle', { cx: cup.x, cy: cup.y, r: 8, fill: '#cfe3b5' }));
          scene.add('mid', el('rect', { x: bag.x - 22, y: bag.y - 15, width: 44, height: 30, rx: 5, fill: '#eeeeee', stroke: '#3a3a3a', 'stroke-width': 2.5 }));
          scene.label(myCase.x, myCase.y + 26, { jp: '<<{名刺入|めいしい}れ>>', en: 'card case' });
          scene.label(cup.x, cup.y + 26, { jp: 'お{茶|ちゃ}', en: 'tea' });
          scene.label(bag.x, bag.y + 28, { jp: 'かばん', en: 'bag' });
          theirs = KY.props.movable(P.hitPad(P.card({ x: 0, y: 0, red: true })), 180, 356);
          scene.add('fg', theirs);
          zones = [
            { id: 'case', x: myCase.x, y: myCase.y, r: 28 },
            { id: 'tea', x: cup.x, y: cup.y, r: 22 },
            { id: 'bag', x: bag.x, y: bag.y, r: 26 },
          ];
          scene.caption({ jp: '{席|せき}に {座|すわ}りました。もらった {名刺|めいし}を どこに {置|お}く？', en: 'You sat down. Where do you put the card you received?' });
          const home = theirs.pos();
          let off2 = null;
          scene.onDrag(theirs.el, {
            start(p) { const q = theirs.pos(); off2 = { x: p.x - q.x, y: p.y - q.y }; KY.sfx.play('pick'); },
            move(p) { if (off2) theirs.moveTo(p.x - off2.x, p.y - off2.y); },
            end() {
              if (!off2) return;
              off2 = null;
              const q = theirs.pos();
              const z = zones.find(zz => Math.hypot(q.x - zz.x, q.y - zz.y) < zz.r * 1.5);
              if (z) put(z.id); else scene.glide(theirs, home, 220);
            },
          }, "The client's card (drag it somewhere)");
          p2Timer = scene.after(7500, () => { if (phase === 2) end('hold'); });
        }

        function put(id) {
          if (phase !== 2) return;
          phase = 3;
          if (p2Timer) p2Timer();
          const z = zones.find(zz => zz.id === id);
          KY.sfx.play('drop');
          scene.glide(theirs, { x: z.x, y: z.y }, 200, 'out', () => {
            if (id === 'bag') theirs.el.style.opacity = '0';
          });
          const key = id === 'tea' ? 'coaster' : id === 'bag' ? 'stash' : first === 'high' ? 'high' : 'great';
          scene.after(700, () => end(key));
        }

        scene.timer(18000, () => end(phase === 1 ? 'frozen' : 'hold'));
        scene.at(9000, () => { if (phase === 1) end('frozen'); });
        scene._card = { offer, put, phase: () => phase };
      },
      /* input: { give: 'low' | 'same' | 'high', put: 'case' | 'bag' | 'tea' } */
      simulate(scene, r, input) {
        scene.at(3600, () => scene._card.offer(input.give === 'low' ? 12 : input.give === 'high' ? -12 : 0));
        if (input.put) scene.at(6600, () => scene._card.put(input.put));
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.client, line: { jp: '（{丁寧|ていねい}な{方|かた}だな…）', en: '(What a polite person...)' } },
      high: { grade: 'ok', who: WHO.client, line: { jp: '（{上|うえ}から{来|き}たね…。まあ、いいけど）', en: '(Coming in from above, huh... Well, fine.)' } },
      stash: { grade: 'ok', who: WHO.client, line: { jp: '（もうしまうの？{打|う}ち{合|あ}わせはこれからだよ）', en: "(Putting it away already? The meeting hasn't started.)" } },
      coaster: { grade: 'ky', who: WHO.client, line: { jp: '（{私|わたし}の{名刺|めいし}…コースターじゃないんだけど…）', en: "(My business card... isn't a coaster...)" },
        react(scene) { scene.people.filter(p => !p.player).forEach(p => p.mark('shock')); } },
      hold: { grade: 'ok', who: WHO.client, line: { jp: '{名刺|めいし}、テーブルに{置|お}いてくださいね。', en: 'Please feel free to put the card on the table.' } },
      frozen: { grade: 'ky', who: WHO.client, line: { jp: '…あの、{名刺|めいし}は？', en: '...Um, your business card?' } },
    },
    card: {
      badge: 'must',
      name: { jp: '{名刺交換|めいしこうかん}', en: 'Exchanging business cards' },
      points: [
        { jp: '{会社|かいしゃ}に {来|き}た {人|ひと}（{立場|たちば}が {下|した}の {人|ひと}）が、{先|さき}に {名前|なまえ}を {言|い}って わたします。', en: 'The visitor (or the junior) says their name and offers a card first.' },
        { jp: '{名刺|めいし}は {相手|あいて}が {読|よ}める {向|む}きで わたします。{相手|あいて}より {少|すこ}し {下|した}で わたす、という {本|ほん}も あります。', en: 'Hold your card so they can read it. Many guides add: a little lower than theirs.' },
        { jp: 'もらった {名刺|めいし}は、{話|はな}している {間|あいだ}、テーブルの <<{名刺入|めいしい}れ>>の {上|うえ}に {置|お}きます。', en: 'Keep their card on your card case on the table until the meeting ends.' },
      ],
      phrase: { jp: '<<{頂戴|ちょうだい}いたします>>', ro: 'chōdai itashimasu', en: 'Thank you. I humbly receive it.' },
      why: { jp: '{日本|にほん}では、{名刺|めいし}は その {人|ひと}の {顔|かお}と おなじくらい {大切|たいせつ}です。テーブルに {置|お}いておくと、{名前|なまえ}を まちがえずに {話|はな}せます。', en: 'A business card is treated as part of the person. Keeping it on the table shows respect and helps you remember names during the meeting.' },
      dont: { jp: 'もらった {名刺|めいし}を、すぐ かばんに {入|い}れない。お{茶|ちゃ}の {下|した}にも {置|お}かない。', en: "Don't put their card straight into your bag, and never under a cup." },
      diagram(svg) {
        const D = KY.diag;
        D.floor(svg, 140);
        D.person(svg, { x: 62, y: 140, s: 0.95, color: 'player', arms: HOLD });
        D.person(svg, { x: 138, y: 140, s: 0.95, facing: -1, arms: HOLD });
        D.rect(svg, 96, 70, 22, 13, { r: 2, stroke: KY.svg.C.red });
        D.rect(svg, 84, 56, 22, 13, { r: 2 });
        D.arrow(svg, 100, 96, 100, 86, { color: KY.svg.C.red });
        D.label(svg, 100, 108, 'すこし した', { color: KY.svg.C.red });
      },
    },
    test: { great: { give: 'low', put: 'case' }, ok: { give: 'same', put: 'bag' }, ky: { give: 'same', put: 'tea' } },
  });
})(typeof window !== 'undefined' ? window : globalThis);
