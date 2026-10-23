/* Chapter 3 — Meetings (会議) */
(function (root) {
  const KY = root.KY;
  const P = KY.props;

  /* dictionary words used in this chapter (easy-Japanese explanations) */
  KY.addGlossary({
    '切らした':{yomi:'きらした',jp:'{名刺|めいし}などが もう ない こと。',en:'ran out of'},'謝って':{yomi:'あやまって',jp:'「すみません」と {伝|つた}える こと。',en:'apologize'},'謝る':{yomi:'あやまる',jp:'{相手|あいて}に「すみません」と {言|い}う こと。',en:'apologize'},'からから':{yomi:'からから',jp:'のどが とても かわいて いる こと。',en:'very thirsty'},'打ち合わせ':{yomi:'うちあわせ',jp:'{仕事|しごと}に ついて {人|ひと}と {話|はな}す こと。',en:'work meeting'},
    '切らしております': { yomi: 'きらしております', jp: '「{名刺|めいし}が ありません」を {丁寧|ていねい}に {言|い}う ことば。{持|も}って いた ものを ぜんぶ {使|つか}った ときに {言|い}う。', en: '"we have run out" (polite)' },
    '切らしておりまして': { yomi: 'きらしておりまして', jp: '「{切|き}らしております」の {形|かたち}。あとの ことばを {言|い}わずに、{気持|きも}ちを {伝|つた}えます。', en: '"we have run out, so..." (polite, trailing off)' },
    '検討します': { yomi: 'けんとうします', jp: '「{考|かんが}えて みます」の ビジネスの {言|い}い{方|かた}。「{決|き}まりました」と いう {意味|いみ}では ありません。', en: '"we will consider it" (business phrase; not a promise)' },
    '返事': { yomi: 'へんじ', jp: '{聞|き}かれた ことに、{答|こた}える こと。', en: 'reply / answer' },
    '契約': { yomi: 'けいやく', jp: '{会社|かいしゃ}と {会社|かいしゃ}が、{仕事|しごと}と お{金|かね}の {約束|やくそく}を {紙|かみ}に {書|か}いて {決|き}める こと。', en: 'contract' },
    '退出': { yomi: 'たいしゅつ', jp: '{会議|かいぎ}や {部屋|へや}から {出|で}る こと。', en: 'leaving (a call or a room)' },
    'ホスト': { yomi: 'ホスト', jp: '{会議|かいぎ}を {開|ひら}いた {人|ひと}。{会議|かいぎ}を {始|はじ}めたり、おわらせたり する {人|ひと}。', en: 'host (the person who runs the meeting)' },
    'あいづち': { yomi: 'あいづち', jp: '{話|はなし}を {聞|き}いて いる ときに「はい」「なるほど」と {言|い}う ことば。', en: 'small responses while listening (aizuchi)' },
  });

  const WHO = {
    client: { jp: '{先方|せんぽう}', en: 'Client' },
    customer: { jp: 'お{客様|きゃくさま}', en: 'Client' },
    narrator: null,
    bucho: { jp: '{部長|ぶちょう}', en: 'Your Dept. Manager' },
    kacho: { jp: '{課長|かちょう}', en: 'Your Section Manager' },
    suzuki: { jp: '{鈴木|すずき}{部長|ぶちょう}', en: 'Mr. Suzuki (client)' },
    sato: { jp: '{佐藤|さとう}{課長|かちょう}', en: 'Mr. Sato (client)' },
    takahashi: { jp: '{高橋|たかはし}', en: 'Mr. Takahashi (client)' },
  };

  /* ---------------------------------------------------------------- helpers
     Small drawing / animation helpers used by the stages below.
     (They only touch KY.svg / KY.props inside functions, so Node can load this file.) */

  const HOLD = { f: [80, 16], b: [72, 22] };   // both arms held out, as when exchanging cards

  /* time in ms to walk `pts` (a list of {x,y}) from `from` at `speed` px/s */
  function pathMs(from, pts, speed) {
    let d = 0, p = from;
    for (const q of pts) { d += Math.hypot(q.x - p.x, q.y - p.y); p = q; }
    return (d / speed) * 1000;
  }

  /* a top-view person walks along waypoints, turning towards each leg */
  function walkPath(scene, person, pts, speed, done) {
    let i = 0;
    const next = () => {
      if (i >= pts.length) { if (done) done(); return; }
      const to = pts[i++];
      const dx = to.x - person.o.x, dy = to.y - person.o.y, d = Math.hypot(dx, dy);
      if (d < 1) { next(); return; }
      person.set({ dir: (Math.atan2(dx, -dy) * 180) / Math.PI });
      scene.glide(person, to, (d / speed) * 1000, 'linear', next);
    };
    next();
  }

  /* a quick nod of a front-view person */
  function nod(scene, person, amount = 40) {
    scene.tween({
      from: 0, to: 1, dur: 160, ease: 'out', step: v => person.set({ nod: v * amount }),
      done: () => scene.tween({ from: 1, to: 0, dur: 240, ease: 'inout', step: v => person.set({ nod: v * amount }) }),
    });
  }

  /* an expanding ring (tap feedback) */
  function ripple(scene, x, y, color) {
    const c = KY.svg.el('circle', { cx: x, cy: y, r: 20, fill: 'none', stroke: color, 'stroke-width': 4, opacity: 0.9 });
    scene.add('fg', c);
    scene.tween({
      from: 0, to: 1, dur: 420, ease: 'out',
      step: v => { c.setAttribute('r', (20 + v * 40).toFixed(1)); c.setAttribute('opacity', (0.9 * (1 - v)).toFixed(2)); },
      done: () => c.remove(),
    });
  }

  /* an HTML name pill (like the tags on people) at scene point x,y */
  function pill(scene, x, y, T, player) {
    const node = root.document.createElement('div');
    node.className = 'tag' + (player ? ' player' : '');
    node.innerHTML = KY.text.html(T, { gloss: false, follow: 'below' });
    scene._track(node, x, y, 'center');
    return node;
  }

  /* open card case (seen from the front); empty unless `full` */
  function openCase({ x, y, full = false }) {
    const { el, g } = KY.svg;
    const kids = [
      el('rect', { x: -26, y: -17, width: 52, height: 34, rx: 5, fill: '#efe7d6', stroke: '#3a3a3a', 'stroke-width': 2.5 }),
      el('rect', { x: -20, y: -11, width: 40, height: 22, rx: 2, fill: '#fbf7ee', stroke: '#cfc7b4', 'stroke-width': 1.5 }),
    ];
    if (full) kids.push(KY.props.card({ x: 0, y: 0 }).el);
    return { el: g({ transform: `translate(${x} ${y})` }, kids) };
  }

  /* a paper napkin with a smudged scribble */
  function napkin(x, y) {
    const { el, g, set } = KY.svg;
    const n = g({ transform: `translate(${x} ${y}) rotate(-8)`, opacity: 0 }, [
      el('rect', { x: -18, y: -13, width: 36, height: 26, rx: 3, fill: '#fff', stroke: '#3a3a3a', 'stroke-width': 2 }),
      el('path', { d: 'M-12 -4 q4 -5 7 0 t7 0 t7 0 M-12 5 h22', fill: 'none', stroke: '#8a8a8a', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    ]);
    return { el: n, moveTo(nx, ny) { set(n, { transform: `translate(${nx} ${ny}) rotate(-8)` }); }, show(v) { set(n, { opacity: v ? 1 : 0 }); } };
  }

  /* a small smile drawn on a side-view person's head (the client in 3-6) */
  function smile(person) {
    const { el } = KY.svg;
    const [hx, hy] = person._local.head;
    person.p.up.append(
      el('path', { d: `M${hx + 1} ${hy + 3} Q${hx + 6} ${hy + 9} ${hx + 11} ${hy + 3}`, fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      el('circle', { cx: hx + 5, cy: hy - 3, r: 1.5, fill: '#fff' }),
      el('circle', { cx: hx + 10, cy: hy - 3, r: 1.5, fill: '#fff' }),
    );
  }

  /* ---- video-call window (3-5, 3-8): frame + 2x2 tiles ---- */
  const GRID = { x: [16, 184], y: [174, 340], w: 160, h: 158 };

  function barIcon(kind, x, y) {
    const { el, g } = KY.svg;
    const s = { fill: 'none', stroke: '#7a8088', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const k = [el('circle', { r: 17, fill: '#eceff2', stroke: '#c9ccd1', 'stroke-width': 2 })];
    if (kind === 'mic') k.push(el('rect', Object.assign({ x: -3.5, y: -9, width: 7, height: 12, rx: 3.5 }, s)), el('path', Object.assign({ d: 'M-7 -1 Q-7 7 0 7 Q7 7 7 -1 M0 7 V11' }, s)));
    if (kind === 'cam') k.push(el('rect', Object.assign({ x: -9, y: -5.5, width: 12, height: 11, rx: 2 }, s)), el('path', Object.assign({ d: 'M3 -1 L9 -5 V5 L3 1' }, s)));
    if (kind === 'chat') k.push(el('path', Object.assign({ d: 'M-9 -7 H9 V3 H1 L-4 8 V3 H-9 Z' }, s)));
    if (kind === 'people') k.push(el('circle', Object.assign({ cx: 0, cy: -4, r: 3.5 }, s)), el('path', Object.assign({ d: 'M-8 8 Q-8 1 0 1 Q8 1 8 8' }, s)));
    if (kind === 'end') k.push(el('path', Object.assign({ d: 'M-6 -6 L6 6 M6 -6 L-6 6' }, s)));
    return g({ transform: `translate(${x} ${y})` }, k);
  }

  function callWindow(scene, icons) {
    const { el } = KY.svg;
    scene.add('bg', el('rect', { x: 8, y: 140, width: 344, height: 440, rx: 14, fill: '#fff', stroke: '#c9ccd1', 'stroke-width': 3 }));
    scene.add('bg', el('path', { d: 'M8 166 V154 Q8 140 22 140 H338 Q352 140 352 154 V166 Z', fill: '#eceff2' }));
    [24, 38, 52].forEach(x => scene.add('bg', el('circle', { cx: x, cy: 153, r: 4, fill: '#c9ccd1' })));
    const t = el('text', { x: 190, y: 157, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#8a9097' });
    t.textContent = 'オンライン かいぎ';
    scene.add('bg', t);
    for (const [kind, x] of icons) scene.add('bg', barIcon(kind, x, 539));
  }

  function tileDeco(inner, kind, x, y, w, h) {
    const { el } = KY.svg;
    const S = { fill: '#f9fbfd', stroke: '#d3d9df', 'stroke-width': 2 };
    if (kind === 'window') {
      inner.append(el('rect', Object.assign({ x: x + w - 62, y: y + 14, width: 46, height: 40, rx: 2 }, S)),
        el('path', { d: `M${x + w - 39} ${y + 14} V${y + 54} M${x + w - 62} ${y + 34} H${x + w - 16}`, stroke: '#d3d9df', 'stroke-width': 2 }));
    } else if (kind === 'plant') {
      inner.append(el('path', { d: `M${x + 18} ${y + h - 40} L${x + 20} ${y + h - 64} L${x + 44} ${y + h - 64} L${x + 46} ${y + h - 40} Z`, fill: '#fff', stroke: '#d3d9df', 'stroke-width': 2 }),
        el('path', { d: `M${x + 32} ${y + h - 64} C${x + 18} ${y + h - 82} ${x + 16} ${y + h - 96} ${x + 26} ${y + h - 104} M${x + 32} ${y + h - 64} C${x + 44} ${y + h - 80} ${x + 50} ${y + h - 94} ${x + 42} ${y + h - 106}`, fill: 'none', stroke: '#c6d0c0', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    } else if (kind === 'shelf') {
      inner.append(el('line', { x1: x + w - 66, y1: y + 36, x2: x + w - 10, y2: y + 36, stroke: '#d3d9df', 'stroke-width': 3 }),
        el('line', { x1: x + w - 66, y1: y + 70, x2: x + w - 10, y2: y + 70, stroke: '#d3d9df', 'stroke-width': 3 }),
        el('rect', { x: x + w - 62, y: y + 18, width: 8, height: 18, fill: '#e1e6eb' }), el('rect', { x: x + w - 52, y: y + 22, width: 8, height: 14, fill: '#d3d9df' }),
        el('rect', { x: x + w - 42, y: y + 16, width: 8, height: 20, fill: '#e1e6eb' }),
        el('rect', { x: x + w - 60, y: y + 52, width: 10, height: 18, fill: '#d3d9df' }), el('rect', { x: x + w - 48, y: y + 56, width: 8, height: 14, fill: '#e1e6eb' }));
    } else if (kind === 'blind') {
      for (let i = 0; i < 4; i++) inner.append(el('line', { x1: x + w - 60, y1: y + 18 + i * 9, x2: x + w - 14, y2: y + 18 + i * 9, stroke: '#dde2e7', 'stroke-width': 3 }));
    }
  }

  /* one video tile. spec: { id, col, row, T, deco, color, player, ghost }
     → { outer, person, pill, x, y, w, h, cx, cy } */
  function videoTile(scene, spec) {
    const { el, g } = KY.svg;
    const x = GRID.x[spec.col], y = GRID.y[spec.row], w = GRID.w, h = GRID.h;
    const cid = 'kyclip-' + spec.id;
    if (spec.ghost) {
      const tx = el('text', { x: x + w / 2, y: y + h / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#a3a9b0' });
      tx.textContent = 'たいしゅつ しました';
      scene.add('bg', el('g', {}, [el('rect', { x, y, width: w, height: h, rx: 10, fill: '#f7f8fa', stroke: '#d3d7dc', 'stroke-width': 2, 'stroke-dasharray': '6 5' }), tx]));
    }
    const inner = g({ 'clip-path': `url(#${cid})` });
    inner.append(el('rect', { x, y, width: w, height: h, fill: '#eef1f4' }));
    tileDeco(inner, spec.deco, x, y, w, h);
    const outer = g({}, [el('clipPath', { id: cid }, [el('rect', { x, y, width: w, height: h, rx: 10 })]), inner]);
    scene.add('mid', outer);
    const s = 1.4, cx = x + w / 2;
    const person = scene.person({ view: 'front', pose: 'sit', x: cx, y: y + 58 + 81.5 * s, s, color: spec.player ? 'player' : spec.color, player: !!spec.player });
    inner.append(person.el);
    inner.append(el('rect', { x, y: y + h - 36, width: w, height: 36, fill: '#dde2e8' }), el('line', { x1: x, y1: y + h - 36, x2: x + w, y2: y + h - 36, stroke: '#c9d0d7', 'stroke-width': 2 }));
    outer.append(el('rect', { x, y, width: w, height: h, rx: 10, fill: 'none', stroke: spec.player ? KY.svg.C.red : '#c3c8ce', 'stroke-width': spec.player ? 4 : 2 }));
    const tag = pill(scene, cx, y + h - 17, spec.T, spec.player);
    return { outer, person, pill: tag, x, y, w, h, cx, cy: y + h / 2 };
  }

  /* a tile leaves the call */
  function dropTile(scene, tile) {
    scene.tween({ from: 1, to: 0, dur: 320, ease: 'linear', step: v => tile.outer.setAttribute('opacity', v.toFixed(2)) });
    scene.removeOverlay(tile.pill);
  }

  /* ------------------------------------------------------------------ 3-1 */
  KY.defineStage({
    id: '3-1',
    chapter: 3,
    title: { jp: '{名刺|めいし}を テーブルに おく', en: 'Lining Up the Cards' },
    intro: { jp: '<<{打|う}ち{合|あ}わせ>>が はじまります。{先方|せんぽう}の {3人|さんにん}から {名刺|めいし}を もらいました。', en: 'The meeting is about to start. You have received business cards from the three people across the table.' },
    time: 20000,
    mechanic: 'order',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.08, x: 180, y: 320 });
      scene.add('bg', P.tableTop({ x: 180, y: 300, w: 312, h: 190 }));
      [74, 180, 286].forEach(x => {
        scene.add('bg', P.chairTop({ x, y: 186, back: 'top' }));
        scene.add('bg', el('line', { x1: x, y1: 216, x2: x, y2: 270, stroke: '#e6e6e2', 'stroke-width': 2, 'stroke-dasharray': '3 5' }));
        scene.add('bg', el('circle', { cx: x + 34, cy: 238, r: 9, fill: '#fff', stroke: '#b9b9b9', 'stroke-width': 2 }));
        scene.add('bg', el('circle', { cx: x + 34, cy: 238, r: 5, fill: '#d8e6c6' }));
      });
      scene.add('bg', P.chairTop({ x: 180, y: 418, back: 'bottom' }));
      const takahashi = scene.person({ top: true, x: 74, y: 190, dir: 180, tag: { jp: '{高橋|たかはし}', en: 'Takahashi (staff)' } });
      const suzuki = scene.person({ top: true, x: 180, y: 190, dir: 180, tag: { jp: '{鈴木|すずき}{部長|ぶちょう}', en: 'Suzuki (Dept. Manager)' } });
      const sato = scene.person({ top: true, x: 286, y: 190, dir: 180, tag: { jp: '{佐藤|さとう}{課長|かちょう}', en: 'Sato (Section Manager)' } });
      const player = scene.person({ top: true, x: 180, y: 416, dir: 0, color: 'player', player: true });
      /* your card case lies where the middle slot will be */
      scene.add('fg', el('g', { transform: 'translate(180 300)' }, [
        el('rect', { x: -57, y: -32, width: 114, height: 64, rx: 8, fill: '#efe7d6', stroke: '#3a3a3a', 'stroke-width': 2.5 }),
        el('rect', { x: -9, y: -35, width: 18, height: 7, rx: 2, fill: '#c9bda3', stroke: '#3a3a3a', 'stroke-width': 1.5 }),
        el('rect', { x: -46, y: -23, width: 92, height: 46, rx: 8, class: 'slot', style: 'fill:none' }),
      ]));
      scene.label(180, 346, { jp: '<<{名刺入|めいしい}れ>>', en: 'card case' });
      scene.label(180, 474, { jp: 'もらった {名刺|めいし}', en: 'cards you received' }, 'slot-label');
      return { takahashi, suzuki, sato, player };
    },
    params: {
      script: [
        [400, (s, r) => s.say(r.suzuki, { jp: 'では、<<{打|う}ち{合|あ}わせ>>を {始|はじ}めましょうか。', en: 'Shall we begin the meeting, then?' }, { dur: 2800, lift: 26 })],
      ],
      cards: [
        { id: 'takahashi', text: { jp: '{担当|たんとう} {高橋|たかはし}', en: 'Takahashi (staff)' } },
        { id: 'suzuki', text: { jp: '{部長|ぶちょう} {鈴木|すずき}', en: 'Suzuki (Dept. Manager)' } },
        { id: 'sato', text: { jp: '{課長|かちょう} {佐藤|さとう}', en: 'Sato (Section Manager)' } },
      ],
      slots: [
        { x: 74, y: 300, w: 92, h: 46 },
        { x: 180, y: 300, w: 92, h: 46 },
        { x: 286, y: 300, w: 92, h: 46 },
      ],
      tray: { y: 530 },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.suzuki, line: { jp: '（{私|わたし}の {名刺|めいし}が いちばん いい {場所|ばしょ}に…。{分|わ}かってる{人|ひと}だな）', en: "(My card is in the best spot... This one knows what they're doing.)" },
        react(scene, r) { r.suzuki.mark('sparkle'); } },
      ky: { grade: 'ky', who: WHO.sato, line: { jp: '（{私|わたし}、{高橋|たかはし}じゃなくて {佐藤|さとう}です…）', en: "(I'm not Takahashi, I'm Sato...)" },
        react(scene, r) { r.sato.mark('sweat2'); r.takahashi.mark('q'); r.suzuki.mark('dots'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{名刺|めいし}を {置|お}く {場所|ばしょ}', en: 'Where to put the cards you received' },
      points: [
        { jp: '{先方|せんぽう}の {名刺|めいし}は、{相手|あいて}が {座|すわ}って いる {順番|じゅんばん}に テーブルに おきます。', en: 'Lay the cards on the table in the same order as the people sit.' },
        { jp: 'いちばん {上|うえ}の {人|ひと}の {名刺|めいし}は、<<{名刺入|めいしい}れ>>の {上|うえ}に おきます。', en: "The highest-ranked person's card goes on top of your card case." },
        { jp: '{会議|かいぎ}が おわるまで、{名刺|めいし}は テーブルに おいて おきます。{名前|なまえ}を まちがえずに {話|はな}せます。', en: 'Keep the cards out until the meeting ends. It helps you use the right names.' },
      ],
      phrase: { jp: '{鈴木|すずき}{部長|ぶちょう}、{本日|ほんじつ}は よろしく お{願|ねが}いいたします', ro: 'Suzuki buchō, honjitsu wa yoroshiku onegai itashimasu', en: 'Mr. Suzuki, I look forward to working with you today.' },
      why: { jp: '{名刺|めいし}を {見|み}ながら {話|はな}すと、{名前|なまえ}と {役職|やくしょく}を まちがえません。いちばん {上|うえ}の {人|ひと}の {名刺|めいし}を {大切|たいせつ}な {場所|ばしょ}に おくのは、その {人|ひと}を {大切|たいせつ}に する {気持|きも}ちです。', en: "Looking at the cards while you talk keeps names and titles straight. Putting the most senior person's card in the best spot shows respect for them." },
      dont: { jp: '{名刺|めいし}に メモを {書|か}かない。おったり、{手|て}で いじったり しない。', en: "Don't write notes on the cards, fold them, or fiddle with them." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.rect(svg, 12, 36, 176, 82, { r: 6, fill: '#fbfaf7' });
        [[40, '#a9a9a9'], [100, C.ink], [160, '#a9a9a9']].forEach(([x, fill]) => svg.append(el('circle', { cx: x, cy: 20, r: 9, fill })));
        D.rect(svg, 76, 46, 48, 28, { r: 3, fill: '#efe7d6' });
        [27, 87, 147].forEach(x => D.rect(svg, x, x === 87 ? 52 : 50, 26, 16, { r: 2, stroke: C.red }));
        D.label(svg, 40, 86, 'たんとう', { color: '#666' });
        D.label(svg, 100, 86, 'ぶちょう', { color: C.ink });
        D.label(svg, 160, 86, 'かちょう', { color: '#666' });
        D.label(svg, 100, 106, 'めいしいれ', { color: '#8a8a8a' });
        svg.append(el('circle', { cx: 100, cy: 134, r: 9, fill: C.red }));
      },
    },
    test: { great: ['takahashi', 'suzuki', 'sato'], ky: ['sato', 'takahashi', 'suzuki'] },
  });

  /* ------------------------------------------------------------------ 3-2 */
  KY.defineStage({
    id: '3-2',
    chapter: 3,
    title: { jp: '{名刺|めいし}を <<{切|き}らした>>！', en: 'Out of Cards' },
    intro: { jp: '<<{名刺交換|めいしこうかん}>>の とき、<<{名刺入|めいしい}れ>>を {開|あ}けました。{中|なか}は {空|から}っぽです。', en: 'During a card exchange, you open your card case. It is empty.' },
    time: 14000,
    mechanic: 'choice',
    setup(scene) {
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 196, y: 196, w: 92, h: 70 }));
      const player = scene.person({ x: 116, y: 470, facing: 1, color: 'player', player: true, arms: HOLD });
      const client = scene.person({ x: 250, y: 470, facing: -1, arms: HOLD, tag: WHO.customer });
      const ph = player.hand(), ch = client.hand();
      const hand = { x: ph.x + 8, y: ph.y - 6 };
      const theirCard = P.card({ x: ch.x - 10, y: ch.y - 4 });
      const myCase = openCase(hand);
      const paper = napkin(hand.x, hand.y);
      scene.add('fg', theirCard);
      scene.add('fg', myCase);
      scene.add('fg', paper);
      /* a close-up of the empty case, so the player sees it at a glance */
      const { el, g } = KY.svg;
      scene.add('bg', el('path', { d: `M${hand.x - 6} ${hand.y - 22} L${hand.x - 34} ${232 + 34}`, stroke: '#cfcfcf', 'stroke-width': 2, 'stroke-dasharray': '4 5', fill: 'none' }));
      scene.add('bg', g({ transform: 'translate(104 228)' }, [
        el('circle', { r: 44, fill: '#fff', stroke: '#bdbdbd', 'stroke-width': 3 }),
        el('rect', { x: -31, y: -21, width: 62, height: 42, rx: 6, fill: '#efe7d6', stroke: '#3a3a3a', 'stroke-width': 2.5 }),
        el('rect', { x: -26, y: -16, width: 24, height: 32, rx: 3, fill: '#fbf7ee', stroke: '#cfc7b4', 'stroke-width': 1.5 }),
        el('rect', { x: 2, y: -16, width: 24, height: 32, rx: 3, fill: '#fbf7ee', stroke: '#cfc7b4', 'stroke-width': 1.5 }),
      ]));
      scene.label(104, 172, { jp: '{空|から}っぽ！', en: 'Empty!' });
      return { player, client, myCase, paper, hand, ch };
    },
    params: {
      script: [
        [300, (s, r) => s.say(r.client, { jp: 'サクラ{商事|しょうじ}の {田中|たなか}と <<{申|もう}します>>。', en: "I'm Tanaka from Sakura Trading." }, { dur: 2700 })],
        [3100, (s, r) => { r.player.mark('sweat2'); r.thought = s.say(r.player, { jp: '（あれ？ {名刺|めいし}が ない！）', en: "(Huh? I've got no cards!)" }, { kind: 'think' }); }],
      ],
      showAt: 3700,
      options: [
        { id: 'polite', text: { jp: '{申|もう}し{訳|わけ}ございません。ただいま {名刺|めいし}を <<{切|き}らしておりまして>>…', en: "I'm very sorry. I've run out of business cards at the moment..." }, outcome: 'great' },
        { id: 'forgot', text: { jp: 'すみません、{名刺|めいし}を {忘|わす}れました！', en: "Sorry, I forgot my business cards!" }, outcome: 'ok' },
        { id: 'napkin', text: { jp: '（ナプキンに {名前|なまえ}を {書|か}いて わたす）', en: '(Write your name on a napkin and hand it over.)' }, outcome: 'napkin' },
      ],
      onChoose(scene, r, opt) {
        if (r.thought) scene.removeOverlay(r.thought);
        r.player.mark(null);
        if (opt.id === 'napkin') {
          r.myCase.el.setAttribute('opacity', 0);
          r.paper.show(true);
          scene.glide({ x: r.hand.x, y: r.hand.y, moveTo: (x, y) => r.paper.moveTo(x, y) }, { x: r.hand.x + 34, y: r.hand.y }, 700);
        }
        if (opt.id === 'polite') r.player.set({ bow: 24 });
        scene.say(r.player, opt.text, { dur: 3000, cls: 'mine' });
        return 3100;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: '（{名刺|めいし}が なくても、{信用|しんよう}できそうな {人|ひと}だな）', en: '(No card, but this person seems trustworthy.)' } },
      ok: { grade: 'ok', who: WHO.customer, line: { jp: 'あ、{忘|わす}れちゃったんですね…。（{準備|じゅんび}、{大丈夫|だいじょうぶ}かな）', en: 'Oh, you forgot them... (Are they well prepared?)' } },
      napkin: { grade: 'ky', who: WHO.customer, line: { jp: '（ナプキン…？ しかも {名前|なまえ}が にじんで {読|よ}めない…）', en: "(A napkin...? And the ink has run, so I can't read the name...)" },
        react(scene, r) { r.client.mark('q'); } },
      silent: { grade: 'ky', who: WHO.customer, line: { jp: '…あの、{名刺|めいし}は？', en: '...Um, your business card?' } },
    },
    card: {
      badge: 'must',
      name: { jp: '{名刺|めいし}が ない とき', en: 'When you have no business cards' },
      points: [
        { jp: 'あとで {連絡先|れんらくさき}を メールで {送|おく}ろう。', en: 'Email your contact details afterward.' },
        { jp: '{名刺|めいし}が ない ときは、はじめに <<{謝|あやま}って>>、「<<{切|き}らしております>>」と {言|い}います。', en: 'Apologize first, then say "kirashite orimasu" (we have run out).' },
        { jp: '{会社|かいしゃ}の {名前|なまえ}と {自分|じぶん}の {名前|なまえ}を、はっきり {口|くち}で {言|い}います。', en: 'Say your company name and your own name clearly, out loud.' },
        { jp: 'その {日|ひ}の うちに、メールで {名前|なまえ}と {連絡|れんらく}{先|さき}を {送|おく}ります。', en: 'Email your name and contact details the same day.' },
      ],
      phrase: { jp: '{申|もう}し{訳|わけ}ございません。ただいま {名刺|めいし}を <<{切|き}らしておりまして>>', ro: 'mōshiwake gozaimasen. tadaima meishi o kirashite orimashite', en: 'I am very sorry. I have run out of business cards at the moment.' },
      why: { jp: '「<<{切|き}らしております>>」は、「{名刺|めいし}を ぜんぶ {使|つか}いました」と いう {意味|いみ}です。「{持|も}って こなかった」と {言|い}うより、{準備|じゅんび}が たりない {感|かん}じが しません。そのあと メールで {連絡|れんらく}すれば、{大丈夫|だいじょうぶ}です。', en: '"Kirashite orimasu" means "I have used them all up", which sounds much less careless than "I didn\'t bring any". A follow-up email then gives them your details.' },
      dont: { jp: '{紙|かみ}や ナプキンに {名前|なまえ}を {書|か}いて わたさない。', en: "Don't hand over your name scribbled on a napkin or scrap paper." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.rect(svg, 14, 40, 70, 46, { r: 6, fill: '#efe7d6' });
        D.rect(svg, 22, 48, 54, 30, { r: 3, fill: '#fbf7ee', stroke: '#c9c2b0' });
        D.label(svg, 49, 68, '0', { size: 16, color: '#b0a894' });
        D.label(svg, 49, 104, 'からっぽ', { color: '#666', size: 10 });
        D.arrow(svg, 94, 63, 116, 63, { color: C.red });
        D.rect(svg, 122, 44, 64, 40, { r: 4 });
        svg.append(el('path', { d: 'M124 48 L154 70 L184 48', fill: 'none', stroke: '#9a9a9a', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        D.label(svg, 154, 104, 'メール', { color: C.red, size: 10 });
        D.label(svg, 100, 134, 'おなじ ひのうちに', { color: '#666', size: 10 });
      },
    },
    test: { great: 'polite', ok: 'forgot', ky: 'napkin' },
  });

  /* ------------------------------------------------------------------ 3-3 */
  const SIP = { f: [30, 130], b: [18, 46] };

  KY.defineStage({
    id: '3-3',
    chapter: 3,
    title: { jp: 'お{茶|ちゃ}は いつ {飲|の}む？', en: 'When Do You Drink the Tea?' },
    intro: { jp: 'お{客様|きゃくさま}の {会社|かいしゃ}で、お{茶|ちゃ}が {出|で}ました。のどが <<からから>>です。', en: "You've been served tea at the client's office. You are very thirsty." },
    time: 12000,
    mechanic: 'timing',
    setup(scene) {
      scene.camera({ zoom: 1.25, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 64, y: 210, w: 92, h: 70 }));
      scene.add('bg', P.plant({ x: 306, floor: 470 }));
      const staff = scene.person({ x: 186, y: 470, facing: 1, layer: 'bg', color: 'npc2' });
      scene.add('mid', P.seat({ x: 76, back: 'left' }));
      scene.add('mid', P.seat({ x: 286, back: 'right' }));
      const player = scene.person({ x: 82, y: 470, pose: 'sit', facing: 1, color: 'player', player: true });
      const client = scene.person({ x: 280, y: 470, pose: 'sit', facing: -1, tag: WHO.client });
      scene.add('mid', P.table({ x: 182, y: 420, w: 132 }));
      const myCup = P.hitPad(P.teaCup({ x: 142, y: 420, red: true }));
      const theirCup = P.teaCup({ x: 222, y: 420 });
      scene.add('fg', myCup);
      scene.add('fg', theirCup);
      return { staff, player, client, myCup, theirCup };
    },
    params: {
      target: 'myCup',
      label: 'Your tea cup',
      script: [
        [0, (s, r) => s.walk(r.staff, 420, 1600)],
        [700, (s, r) => s.say(r.client, { jp: '{本日|ほんじつ}はお{越|こ}しいただき、ありがとうございます。', en: 'Thank you for coming all the way here today.' }, { dur: 2600 })],
        [1400, (s, r) => r.player.mark('sweat2')],
        [3700, (s, r) => s.say(r.client, { jp: '{今日|きょう}は{暑|あつ}いですね。{駅|えき}から{遠|とお}かったでしょう。', en: "It's hot today. The station was quite far, wasn't it?" }, { dur: 2300 })],
        [6300, (s, r) => { s.flag('cue'); s.say(r.client, { jp: 'どうぞ、お{茶|ちゃ}を。', en: 'Please, have some tea.' }, { dur: 2000 }); }],
        [7200, (s, r) => {
          s.flag('sipped');
          r.client.set({ arms: SIP });
          const h = r.client.hand();
          r.theirCup.lift(h.x - 222 - 4, h.y - 420 + 10, 0);
          r.theirCup.steam(false);
        }],
        [8400, (s, r) => { r.client.set({ arms: null }); r.theirCup.lift(0, 0, 0); }],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'never';
        return flags.cue === undefined ? 'early' : 'great';
      },
      onTap(scene, r, key) {
        r.player.mark(null);
        r.player.set({ arms: SIP });
        const h = r.player.hand();
        r.myCup.lift(h.x - 142 + 4, h.y - 420 + 10, 0);
        r.myCup.steam(false);
        scene.say(r.player, key === 'great'
          ? { jp: 'いただきます。', en: 'Thank you, I will.' }
          : { jp: '（ゴクゴク…）', en: '(gulp, gulp...)' }, { dur: 1400, cls: 'mine' });
        return 1100;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.client, line: { jp: 'お{口|くち}に{合|あ}うといいのですが。', en: 'I hope you like it.' } },
      early: { grade: 'ky', who: WHO.client, line: { jp: '（まだ「どうぞ」って{言|い}ってないけど…）', en: '(I haven\'t said "please" yet...)' },
        react(scene, r) { r.client.mark('q'); } },
      never: { grade: 'ok', who: WHO.client, line: { jp: 'お{茶|ちゃ}、{冷|さ}めてしまいますよ。', en: 'Your tea is getting cold.' } },
    },
    card: {
      badge: 'must',
      name: { jp: 'お{茶|ちゃ}を {飲|の}む タイミング', en: 'When to drink the tea you are served' },
      points: [
        { jp: '{相手|あいて}が「どうぞ」と {言|い}ってから、または {相手|あいて}が {飲|の}んでから {飲|の}みます。', en: 'Wait until the host says "dōzo" (please), or until they drink first.' },
        { jp: '「いただきます」と {言|い}って、ひと{口|くち} {飲|の}みます。{全部|ぜんぶ} {飲|の}まなくても {大丈夫|だいじょうぶ}。', en: 'Say "itadakimasu" and take a sip. You do not have to finish it.' },
        { jp: 'あやまりに {行|い}った ときは、{飲|の}まない ほうが いいです。', en: 'When you visit to apologize, it is safer not to drink.' },
      ],
      phrase: { jp: 'いただきます', ro: 'itadakimasu', en: 'Thank you, I will have some.' },
      why: { jp: 'お{茶|ちゃ}は「ようこそ」という {気持|きも}ちです。すすめられる {前|まえ}に {飲|の}むと、{自分|じぶん}の {家|いえ}のように {見|み}えます。でも まったく {飲|の}まないのも、さびしい {感|かん}じに なります。', en: 'Tea is a sign of welcome. Drinking before you are invited looks like you are making yourself at home — but leaving it untouched can feel cold.' },
      dont: { jp: '{出|で}された すぐあとに、{全部|ぜんぶ} {飲|の}まない。', en: "Don't gulp the whole cup the moment it is served." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        D.floor(svg, 128);
        D.rect(svg, 30, 98, 140, 8, { r: 3 });
        D.person(svg, { x: 152, y: 128, s: 0.62, pose: 'sit', facing: -1, arms: SIP });
        D.person(svg, { x: 48, y: 128, s: 0.62, pose: 'sit', color: 'player' });
        D.label(svg, 150, 26, '① どうぞ', { color: C.ink, size: 10 });
        D.label(svg, 54, 26, '② いただきます', { color: C.red, size: 10 });
        D.arrow(svg, 112, 22, 100, 22);
      },
    },
    test: { great: { at: 7600 }, ok: null, ky: { at: 2500 } },
  });

  /* ------------------------------------------------------------------ 3-4 */
  /* six chairs, ranked from the best seat (farthest from the door) to the lowest (nearest the door) */
  /* no chair at the door end of the table: the seat beside the door must be clearly the nearest one */
  const MEET_SEATS = [
    { id: 'seat-head', x: 200, y: 200, back: 'top', dir: 180, outcome: 'head' },
    { id: 'seat-right-top', x: 264, y: 266, back: 'right', dir: 270, outcome: 'second' },
    { id: 'seat-left-top', x: 136, y: 266, back: 'left', dir: 90, outcome: 'ok' },
    { id: 'seat-right-bottom', x: 264, y: 364, back: 'right', dir: 270, outcome: 'ok' },
    { id: 'seat-door', x: 136, y: 364, back: 'left', dir: 90, outcome: 'great' },
  ];
  const MEET_DOOR = { x: 46, y: 404 };

  /* how a person walks from the door to a seat (around the table) */
  function meetRoute(seat) {
    const AISLE = 74, UP = 128, DOWN = 438, RIGHT = 308;
    const end = { x: seat.x, y: seat.y };
    if (seat.id === 'seat-head') return [{ x: AISLE, y: 300 }, { x: AISLE, y: UP }, { x: seat.x, y: UP }, end];
    if (seat.x < 200) return [{ x: AISLE, y: seat.y }, end];
    return [{ x: AISLE, y: DOWN }, { x: RIGHT, y: DOWN }, { x: RIGHT, y: seat.y }, end];
  }

  /* Big labelled picture of the meeting room (card.figure, viewBox 0 0 320 244), drawn like the stage:
     door low on the left wall, a long table with its head at the top, five chairs (none at the door end).
     1 = head (best, the department manager), 2 = right-top (the section manager), 3 = left-top, 4 = right-bottom (others),
     5 = left-bottom next to the door (you, the lowest seat) */
  function figMeeting(svg) {
    const D = KY.diag, { el, C } = KY.svg;
    svg.append(el('rect', { x: 40, y: 6, width: 264, height: 226, fill: '#fff', stroke: '#c4c4c4', 'stroke-width': 4 }));
    /* door: gap in the left wall, swing arc, and an arrow coming in */
    svg.append(
      el('line', { x1: 40, y1: 186, x2: 40, y2: 226, stroke: '#fff', 'stroke-width': 6 }),
      el('path', { d: 'M40 186A40 40 0 0 1 80 226M40 226H80', fill: 'none', stroke: '#c4c4c4', 'stroke-width': 2, 'stroke-dasharray': '4 4' }),
    );
    D.arrow(svg, 4, 210, 32, 210);
    D.label(svg, 20, 199, 'いりぐち', { size: 9, color: C.ink, weight: 900 });

    svg.append(el('rect', { x: 160, y: 58, width: 60, height: 146, rx: 4, fill: '#fbfaf7', stroke: '#9a9a9a', 'stroke-width': 2.5 }));
    D.label(svg, 190, 134, 'テーブル', { size: 9.5 });
    /* chairs: backrest on the outer side (top for the head chair) */
    const chair = (x, y, w, h, back) => {
      svg.append(el('rect', { x, y, width: w, height: h, rx: 8, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 3 }));
      const r = { top: [x + 4, y + 4, w - 8, 7], left: [x + 4, y + 4, 6, h - 8], right: [x + w - 10, y + 4, 6, h - 8] }[back];
      svg.append(el('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: 3, fill: '#efefef' }));
    };
    chair(160, 11, 60, 40, 'top');
    chair(90, 72, 64, 48, 'left'); chair(90, 136, 64, 48, 'left');
    chair(226, 72, 64, 48, 'right'); chair(226, 136, 64, 48, 'right');

    const seats = { 1: [190, 26, 'ぶちょう'], 2: [255, 90, 'かちょう'], 3: [127, 90, 'ほかの ひと'], 4: [255, 154, 'ほかの ひと'], 5: [127, 154, 'あなた'] };
    for (const n of [1, 2, 3, 4, 5]) {
      const [x, y, who] = seats[n], you = n === 5;
      D.seat(svg, x, y, n, { you, top: n === 1 });
      D.label(svg, x, y + 21, who, { size: 9, color: you ? C.red : '#555', weight: 900 });
    }
    D.label(svg, 230, 32, 'かみざ', { size: 9.5, color: '#666', anchor: 'start' });
    D.label(svg, 122, 199, 'しもざ', { size: 9.5, color: '#666' });
  }

  KY.defineStage({
    id: '3-4',
    chapter: 3,
    title: { jp: '{会議|かいぎ}{室|しつ}の {席|せき}', en: 'Meeting Room Seats' },
    intro: { jp: '{自分|じぶん}の {会社|かいしゃ}の {会議|かいぎ}です。{会議|かいぎ}{室|しつ}に いちばん {先|さき}に {来|き}ました。{部長|ぶちょう}と {課長|かちょう}は、あとから {来|き}ます。', en: "It is a meeting inside your own company. You are the first to arrive in the meeting room. Your department manager and section manager will come later." },
    time: 12000,
    mechanic: 'place',
    setup(scene) {
      scene.camera({ zoom: 1.08, x: 180, y: 290 });
      scene.add('bg', P.roomTop({ x: 30, y: 100, w: 300, h: 360, door: { wall: 'left', at: 30, w: 52 } }));
      scene.add('bg', P.tableTop({ x: 200, y: 314, w: 84, h: 196 }));
      for (const s of MEET_SEATS) scene.add('bg', P.chairTop({ x: s.x, y: s.y, back: s.back }));
      scene.label(56, 452, { jp: '{入口|いりぐち}', en: 'Door' });
      const player = scene.person({ top: true, x: 68, y: 408, dir: 90, color: 'player', player: true });
      return { player };
    },
    params: {
      item: 'player',
      zones: MEET_SEATS.map(s => ({ id: s.id, x: s.x, y: s.y, outcome: s.outcome, dir: s.dir })),
      onPlace(scene, r, zone) {
        r.player.set({ dir: zone.dir });
        /* the two managers take the best seats that are still free */
        const free = MEET_SEATS.filter(s => s.id !== zone.id);
        const sb = free[0], sk = free[1];
        r.bucho = scene.person({ top: true, x: MEET_DOOR.x, y: MEET_DOOR.y, dir: 90, tag: WHO.bucho });
        const rb = meetRoute(sb), rk = meetRoute(sk);
        walkPath(scene, r.bucho, rb, 330, () => r.bucho.set({ dir: sb.dir }));
        scene.after(450, () => {
          r.kacho = scene.person({ top: true, x: MEET_DOOR.x, y: MEET_DOOR.y, dir: 90, tag: WHO.kacho });
          walkPath(scene, r.kacho, rk, 330, () => r.kacho.set({ dir: sk.dir }));
        });
        return Math.max(pathMs(MEET_DOOR, rb, 330), 450 + pathMs(MEET_DOOR, rk, 330)) + 300;
      },
      timeout: 'stand',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: '（おっ、<<{下座|しもざ}>>に {座|すわ}って くれたか。{分|わ}かってるな）', en: '(Oh, you took the lowest seat by the door. You know your stuff.)' },
        react(scene, r) { r.bucho.mark('sparkle'); } },
      ok: { grade: 'ok', who: WHO.kacho, line: { jp: '（そこか。まあ、{悪|わる}くは ないけど…）', en: "(That seat? Well, it's not bad, but...)" },
        react(scene, r) { r.kacho.mark('dots'); } },
      head: { grade: 'ky', who: WHO.bucho, line: { jp: '（{私|わたし}の {席|せき}…。まあ、{会社|かいしゃ}の {中|なか}の {会議|かいぎ}だし、いいか…）', en: "(That's my seat... Well, it's just an internal meeting, so fine...)" },
        react(scene, r) { r.bucho.mark('sweat2'); r.kacho.mark('dots'); } },
      second: { grade: 'ky', who: WHO.kacho, line: { jp: 'あ…そこ、{私|わたし}が {座|すわ}る つもりだったんだけど…', en: "Ah... I was about to sit there..." },
        react(scene, r) { r.kacho.mark('q'); r.bucho.mark('dots'); } },
      stand: { grade: 'ok', who: WHO.bucho, line: { jp: '{立|た}ったまま {待|ま}って いたの？ {先|さき}に {座|すわ}って いいんだよ。', en: 'You were waiting on your feet? You can sit down first, you know.' } },
    },
    card: {
      badge: 'depends',
      name: { jp: '{会議|かいぎ}{室|しつ}の <<{上座|かみざ}>>と <<{下座|しもざ}>>', en: 'Best and lowest seats in a meeting room' },
      points: [
        { jp: '{入口|いりぐち}から いちばん はなれた {席|せき}が {上座|かみざ}、{入口|いりぐち}に いちばん {近|ちか}い {席|せき}が {下座|しもざ}です。', en: 'The seat farthest from the door is the best seat (kamiza); the seat nearest the door is the lowest (shimoza).' },
        { jp: '{先|さき}に {部屋|へや}に {入|はい}った ときは、{下座|しもざ}に {座|すわ}って {上司|じょうし}を {待|ま}ちます。', en: 'If you arrive first, sit in the lowest seat and wait for your boss.' },
        { jp: '{上司|じょうし}が {来|き}たら、「こちらへ どうぞ」と {言|い}って {上座|かみざ}を すすめます。', en: 'When your boss arrives, say "kochira e dōzo" and offer the best seat.' },
      ],
      phrase: { jp: 'こちらへ どうぞ', ro: 'kochira e dōzo', en: 'Please, this way. (offering a seat)' },
      why: { jp: '{上座|かみざ}は {入口|いりぐち}から とおくて、しずかな {席|せき}です。{入口|いりぐち}に {近|ちか}い {席|せき}は、ドアを あけたり {飲|の}み{物|もの}を {出|だ}したり しやすい {席|せき}です。だから あたらしい {人|ひと}が {座|すわ}ります。', en: 'The best seat is far from the door, so it is calm. The seat near the door is easy for opening the door and serving drinks, so the newest person sits there.' },
      dont: { jp: '{上司|じょうし}より {先|さき}に、{入口|いりぐち}から いちばん はなれた {席|せき}に {座|すわ}らない。', en: "Don't take the seat farthest from the door before your boss arrives." },
      tip: { jp: '{小|ちい}さい {会議|かいぎ}や おなじ チームの {会議|かいぎ}では、{席|せき}を {気|き}に しない {会社|かいしゃ}も {多|おお}いです。{迷|まよ}ったら {上司|じょうし}の {言|い}う とおりに しましょう。お{客様|きゃくさま}が いる ときは、{席|せき}が {大切|たいせつ}です。', en: 'If unsure: follow your boss. In small internal meetings many teams do not care about seats, but when clients are present, seating matters.' },
      diagram(svg) {
        const D = KY.diag;
        D.room(svg, { x: 30, y: 8, w: 140, h: 128, door: 'bl' });
        D.rect(svg, 82, 34, 36, 78, { r: 5, fill: '#fbfaf7' });
        D.seat(svg, 100, 22, 1, { top: true });
        D.seat(svg, 138, 52, 2);
        D.seat(svg, 62, 52, 3);
        D.seat(svg, 138, 92, 4);
        D.seat(svg, 62, 102, 5, { you: true });
        D.label(svg, 136, 21, 'かみざ', { anchor: 'start', color: '#666' });
      },
      figure: {
        draw: figMeeting,
        rule: { jp: '{入口|いりぐち}から はなれた {席|せき}ほど {上|うえ}なので、{先|さき}に {来|き}たら {入口|いりぐち}に いちばん {近|ちか}い {席|せき}に {座|すわ}ります。', en: 'The farther a seat is from the door, the higher it ranks, so if you arrive first you take the seat nearest the door.' },
        legend: [
          { n: 1, top: true, jp: '{上座|かみざ}。{入口|いりぐち}から いちばん はなれた {席|せき}です。{部長|ぶちょう}が {座|すわ}ります。', en: 'Kamiza, the best seat: farthest from the door. The department manager sits here.' },
          { n: 2, jp: '{次|つぎ}に いい {席|せき}です。{課長|かちょう}が {座|すわ}ります。', en: 'The next best seat. The section manager sits here.' },
          { n: 3, jp: 'ほかの {人|ひと}が {座|すわ}ります。', en: 'Other people sit here.' },
          { n: 4, jp: 'ほかの {人|ひと}が {座|すわ}ります。', en: 'Other people sit here.' },
          { n: 5, you: true, jp: 'あなたの {席|せき}。{入口|いりぐち}に いちばん {近|ちか}い {下座|しもざ}です。', en: 'Your seat: nearest the door, the lowest seat (shimoza).' },
        ],
      },
    },
    test: { great: 'seat-door', ok: 'seat-right-bottom', ky: 'seat-head' },
  });

  /* ------------------------------------------------------------------ 3-5 */
  const NOD_BEATS = [2500, 4750, 7100, 9550, 12100, 14500];   // when the others nod
  const NOD_WINDOW = 560;                                                  // a tap within ±350 ms of a beat is a hit
  /* what the manager says, and the aizuchi that fit each sentence (said in turn as you nod) */
  const LINES = [
    {at:300,text:{jp:'{今月|こんげつ}の {仕事|しごと}について {話|はな}します。まず、{売上|うりあげ}の {話|はなし}です。',en:'Let us talk about this month. First, sales.'},aizuchi:[{jp:'はい',en:'Yes'}]},
    {at:3200,text:{jp:'{先月|せんげつ}より {注文|ちゅうもん}が {増|ふ}えました。{新|あたら}しい お{客様|きゃくさま}も {来|き}ています。',en:'We have more orders than last month, and new customers.'},aizuchi:[{jp:'そうなんですね',en:'I see'}]},
    {at:5900,text:{jp:'でも、{今週|こんしゅう}は {決済|けっさい}で すこし {問題|もんだい}が ありました。',en:'But this week, we had a few payment problems.'},aizuchi:[{jp:'はい',en:'Yes'}]},
    {at:8700,text:{jp:'{原因|げんいん}を {調|しら}べて、{昨日|きのう}の {夜|よる}に {直|なお}しました。',en:'We found the cause and fixed it last night.'},aizuchi:[{jp:'なるほど',en:'I understand'}]},
    {at:11700,text:{jp:'{来月|らいげつ}は テストを もっと しっかり して いきましょう。',en:'Next month, let us test more carefully.'},aizuchi:[{jp:'はい、わかりました',en:'Yes, understood'}]},
  ];

  KY.defineStage({
    id: '3-5',
    chapter: 3,
    title: { jp: 'うなずき オンライン', en: 'Nod Along' },
    intro: { jp: 'オンライン{会議|かいぎ}です。{部長|ぶちょう}が {話|はな}して います。あなたの カメラは オンです。', en: 'You are in an online meeting. Your manager is talking. Your camera is on.' },
    time: 16500,
    mechanic: 'action',
    setup(scene) {
      callWindow(scene, [['mic', 96], ['cam', 136], ['end', 180], ['chat', 224], ['people', 264]]);
      const boss = videoTile(scene, { id: 'boss', col: 0, row: 0, T: WHO.bucho, deco: 'window', color: 'npc' });
      const a = videoTile(scene, { id: 'a', col: 1, row: 0, T: { jp: '{田中|たなか}', en: 'Tanaka' }, deco: 'plant', color: 'npc2' });
      const b = videoTile(scene, { id: 'b', col: 0, row: 1, T: { jp: '{山本|やまもと}', en: 'Yamamoto' }, deco: 'shelf', color: 'npc2' });
      const me = videoTile(scene, { id: 'me', col: 1, row: 1, T: { jp: '{自分|じぶん}', en: 'You' }, deco: 'blind', player: true });
      return { boss: boss.person, a: a.person, b: b.person, player: me.person, tiles: { boss, a, b, me } };
    },
    params: {
      start(scene, r) {
        let hits = 0, extra = 0, taps = 0, done = false;
        const hit = new Set();
        const finish = () => {
          if (done) return;
          done = true;
          scene.end(taps > 14 ? 'headbang' : hits >= 5 && extra <= 3 ? 'great' : hits >= 3 ? 'ok' : 'frozen');
        };
        LINES.forEach(l => { l.n = 0; scene.at(l.at, () => scene.bubble({ x: r.tiles.boss.cx, y: r.tiles.boss.y, text: l.text, tail: 'down', dur: 2300 })); });
        /* when you nod you also say the aizuchi that fits what the manager is saying now */
        let said = null;
        const aizuchi = t => {
          const l = LINES.filter(x => t >= x.at).pop() || LINES[0];
          if (said) scene.removeOverlay(said);
          said = scene.bubble({ x: r.tiles.me.cx, y: r.tiles.me.y + 6, text: l.aizuchi[l.n++ % l.aizuchi.length], tail: 'down', dur: 850, cls: 'mine' });
        };
        NOD_BEATS.forEach((b, i) => {
          scene.at(b, () => nod(scene, r.a));
          scene.at(b + (i % 2 ? 90 : 40), () => nod(scene, r.b));
        });
        const tap = () => {
          if (done) return;
          taps++;
          const t = scene.t;
          const k = NOD_BEATS.findIndex(b => Math.abs(t - b) <= NOD_WINDOW);
          nod(scene, r.player);
          aizuchi(t);
          KY.sfx.play('tap');
          if (k >= 0 && !hit.has(k)) { hit.add(k); hits++; ripple(scene, r.tiles.me.cx, r.tiles.me.cy, KY.svg.C.red); } else { extra++; ripple(scene, r.tiles.me.cx, r.tiles.me.cy, '#b9b9b9'); }
          if (taps > 14) finish();
        };
        const btn=KY.mini.button(scene,'うなずく！','Nod now!',tap,'nod-button'); btn.style.display='none';
        NOD_BEATS.forEach(b=>{scene.at(b-510,()=>{btn.style.display='block';});scene.at(b+510,()=>{btn.style.display='none';});});
        scene.onTap(r.tiles.me.outer,()=>{ /* user nods using the visible button only */ }, 'Your tile');
        scene.timer(scene.def.time, finish);
        scene._nod = { tap, stats: () => ({ hits, extra, taps }) };
      },
      /* input: { hits: n taps on the beat, extra: m taps off the beat } */
      simulate(scene, r, input) {
        input = input || {};
        for (let i = 0; i < (input.hits || 0); i++) scene.at(NOD_BEATS[i] + (i % 2 ? 60 : -40), () => scene._nod.tap());
        for (let j = 0; j < (input.extra || 0); j++) scene.at(NOD_BEATS[j % 6] + [450, 400, 500][Math.floor(j / 8) % 3], () => scene._nod.tap());
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: '（ちゃんと {聞|き}いて くれて いる。{話|はな}しやすいな）', en: "(They're really listening. Easy to talk to.)" },
        react(scene, r) { r.boss.mark('sparkle'); } },
      ok: { grade: 'ok', who: WHO.bucho, line: { jp: '（{聞|き}いて いる…の かな？ ちょっと タイミングが ずれてる…）', en: "(Are they listening...? Their timing is a bit off...)" },
        react(scene, r) { r.boss.mark('sweat'); } },
      headbang: { grade: 'ok', who: WHO.bucho, line: { jp: '（うなずきすぎ…）', en: '(So much nodding...)' },
        react(scene, r) { r.boss.mark('sweat2'); r.a.mark('dots'); r.b.mark('dots'); } },
      frozen: { grade: 'ky', who: WHO.bucho, line: { jp: '（{固|かた}まってる…？ {回線|かいせん}{落|お}ちた？）', en: '(Frozen...? Did the connection drop?)' },
        react(scene, r) { r.boss.mark('q'); r.a.mark('q'); r.b.mark('q'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: 'うなずきと <<あいづち>>', en: 'Nodding and responding online' },
      points: [
        { jp: 'カメラが オンの ときは、{話|はなし}の {区切|くぎ}りで、いつもより {少|すこ}し {大|おお}きく うなずきます。', en: 'With your camera on, nod at natural pauses, a little bigger than usual.' },
        { jp: '{話|はなし}に あった <<あいづち>>を {言|い}います。{始|はじ}まりは「おねがいします」、{新|あたら}しい {話|はなし}には「そうなんですね」、「〜ですね」には「はい、そうですね」。', en: 'Use the response that fits: "onegai shimasu" when it starts, "sō nan desu ne" for news, "hai, sō desu ne" for "...desu ne".' },
        { jp: '「なるほど」は、えらそうに {聞|き}こえると {思|おも}う {人|ひと}も います。{上|うえ}の {人|ひと}には「はい」が いちばん {安心|あんしん}です。', en: 'Some people feel "naruhodo" sounds like you are judging them. With seniors, "hai" is the safest.' },
      ],
      phrase: { jp: 'はい、そうなんですね', ro: 'hai, sō nan desu ne', en: 'Yes, I see.' },
      why: { jp: 'オンラインでは、{相手|あいて}の {顔|かお}が {小|ちい}さく、{気持|きも}ちが わかりにくいです。{何|なに}も しないと、{話|はな}して いる {人|ひと}は「{聞|き}いて いる のかな？」と {思|おも}います。', en: 'On a small screen it is hard to read faces. If you do nothing, the speaker wonders whether you are listening.' },
      dont: { jp: 'ずっと {動|うご}かないで いる ことも、はやく たくさん うなずく ことも しない。', en: "Don't freeze like a photo, and don't nod fast and often." },
      tip: { jp: 'カメラを オフに して いる ときは、チャットや {声|こえ}で <<あいづち>>を しましょう。', en: 'If unsure: with your camera off, respond in the chat or by voice instead.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        const tile = (x, y, red) => {
          D.rect(svg, x, y, 74, 52, { r: 6, fill: '#f4f6f8', stroke: red ? C.red : '#9a9a9a' });
          svg.append(el('circle', { cx: x + 37, cy: y + 22, r: 8, fill: red ? C.red : '#8f8f8f' }), el('rect', { x: x + 24, y: y + 33, width: 26, height: 19, rx: 8, fill: red ? C.red : '#8f8f8f' }));
          D.arrow(svg, x + 58, y + 12, x + 58, y + 24, { color: red ? C.red : '#8a8a8a' });
        };
        tile(18, 10); tile(108, 10); tile(18, 70); tile(108, 70, true);
        D.label(svg, 100, 142, 'はい ・ そうなんですね', { color: C.red, size: 11 });
      },
    },
    test: { great: { hits: 6, extra: 0 }, ok: { hits: 3, extra: 1 }, ky: { hits: 0, extra: 0 } },
  });

  /* ------------------------------------------------------------------ 3-6 */
  KY.defineStage({
    id: '3-6',
    chapter: 3,
    title: { jp: '「{前向|まえむ}きに <<{検討|けんとう}します>>」', en: '"We\'ll Consider It"' },
    intro: { jp: '{新|あたら}しい サービスを {説明|せつめい}しました。お{客様|きゃくさま}は にこにこ して います。', en: 'You have just presented a new service. The client is smiling.' },
    time: 24000,
    mechanic: 'choice',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.03, x: 180, y: 495 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', el('g', { transform: 'translate(50 196)' }, [
        el('rect', { x: 0, y: 0, width: 120, height: 78, rx: 3, fill: '#fff', stroke: '#bdbdbd', 'stroke-width': 2.5 }),
        el('rect', { x: 18, y: 42, width: 14, height: 24, fill: '#e1e1e1' }), el('rect', { x: 42, y: 30, width: 14, height: 36, fill: '#d2d2d2' }),
        el('rect', { x: 66, y: 18, width: 14, height: 48, fill: '#c2c2c2' }), el('rect', { x: 90, y: 24, width: 14, height: 42, fill: '#d2d2d2' }),
      ]));
      scene.add('mid', P.seat({ x: 76, back: 'left' }));
      scene.add('mid', P.seat({ x: 286, back: 'right' }));
      const player = scene.person({ x: 82, y: 470, pose: 'sit', facing: 1, color: 'player', player: true });
      const client = scene.person({ x: 280, y: 470, pose: 'sit', facing: -1, tag: WHO.customer });
      smile(client);
      scene.add('bg', P.window({ x: 204, y: 200, w: 84, h: 66 }));
      scene.add('mid', P.table({ x: 182, y: 420, w: 132 }));
      const mon = P.monitor({ x: 182, y: 410, w: 64, h: 40 });
      [[6, 8], [18, 14], [30, 20], [42, 26]].forEach(([x, h]) => mon.screen.append(el('rect', { x, y: 29 - h, width: 8, height: h, fill: '#c9d4e2' })));
      scene.add('fg', mon);
      return { player, client };
    },
    params: {
      script: [
        [400, (s, r) => s.say(r.client, { jp: '{前向|まえむ}きに <<{検討|けんとう}します>>。', en: "We'll consider it positively." }, { dur: 2800 })],
        [3200, (s, r) => { r.player.mark('q'); r.ponder = s.say(r.player, { jp: '（これって、どういう {意味|いみ}…？）', en: '(What does this really mean...?)' }, { kind: 'think' }); }],
      ],
      showAt: 3900,
      shuffle: false,
      options: [
        { id: 'jump', image: 'data:image/webp;base64,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', text: { jp: 'やった！ もう {決|き}まった！', en: 'Yes! The deal is done!' }, outcome: 'jump' },
        { id: 'bow', image: 'data:image/webp;base64,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', text: { jp: 'ありがとうございます。また {来週|らいしゅう} お{話|はな}し できますか？', en: 'Thank you. Could we talk again next week?' }, outcome: 'great' },
        { id: 'sad', image: 'data:image/webp;base64,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', text: { jp: 'ああ… ダメだった…。', en: 'Oh no… It was a no…' }, outcome: 'sad' },
        { id: 'contract', image: 'data:image/webp;base64,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', text: { jp: 'では、{契約|けいやく}して ください！', en: 'Then please sign the contract!' }, outcome: 'deal' },
      ],
      onChoose(scene, r, opt) {
        if (r.ponder) scene.removeOverlay(r.ponder);
        r.player.mark(null);
        if (opt.id === 'jump') { r.player.mark('sparkle'); r.client.mark('q'); }
        if (opt.id === 'bow') { nod(scene, r.player, 36); r.client.mark('sparkle'); }
        if (opt.id === 'sad') { r.player.mark('dots'); r.client.mark('q'); }
        if (opt.id === 'contract') { r.client.mark('sweat2'); }
        scene.say(r.player, opt.text, { dur: 2400, cls: 'mine', lift: 26 });
        return 2600;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: 'はい！ {来週|らいしゅう}の {水曜日|すいようび}は どうですか？', en: 'Sure! How about next Wednesday?' } },
      jump: { grade: 'ky', who: WHO.customer, line: { jp: 'えっ！？ まだ {決|き}まって いませんよ！', en: "Huh!? We haven't decided yet!" }, react(scene,r) { r.client.mark('sweat2'); } },
      sad: { grade: 'ky', who: WHO.customer, line: { jp: 'あの… {断|ことわ}った わけでは ありませんが…。', en: "Um… I didn't say no…" }, react(scene,r) { r.client.mark('q'); } },
      ok: { grade: 'ok', who: WHO.narrator, line: { jp: '（{三日|みっか}たっても、{返事|へんじ}は {来|こ}ない…）', en: '(Three days later, still no reply...)' },
        react(scene, r) { r.player.mark('dots'); } },
      deal: { grade: 'ky', who: WHO.customer, line: { jp: 'ちょっと {待|ま}って ください。まだ {契約|けいやく}は できません！', en: 'Please wait. We cannot sign a contract yet!' },
        react(scene, r) { r.player.mark('sweat2'); r.client.mark('dots'); } },
      silent: { grade: 'ky', who: WHO.customer, line: { jp: 'では、{検討|けんとう}いたしますので…。（{会話|かいわ}、これで {終|お}わり？）', en: "Then we'll consider it... (Is that the end of the conversation?)" },
        react(scene, r) { r.client.mark('q'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: '「{前向|まえむ}きに <<{検討|けんとう}します>>」の {意味|いみ}', en: 'What "we will consider it positively" means' },
      points: [
        { jp: '「<<{検討|けんとう}します>>」は「これから {考|かんが}えます」と いう {意味|いみ}です。まだ {決|き}まって いません。', en: '"Kentō shimasu" means "we will think about it". Nothing is decided yet.' },
        { jp: '{断|ことわ}る とき、はっきり {言|い}わずに、この ことばを {使|つか}う {人|ひと}も います。', en: 'Some people use it to say no without saying "no" directly.' },
        { jp: '{返事|へんじ}を {待|ま}つ だけに しないで、つぎに {話|はな}す {日|ひ}と {時間|じかん}を {聞|き}きましょう。', en: "Don't just wait: ask for a day and time to talk again." },
      ],
      phrase: { jp: 'ありがとうございます。{来週|らいしゅう}、また お{話|はな}し できますか？', ro: 'arigatō gozaimasu. raishū mata ohanashi dekimasu ka?', en: 'Thank you. Could we talk again next week?' },
      why: { jp: '{日本|にほん}の ビジネスでは、「NO」と はっきり {言|い}わない ことが あります。「<<{検討|けんとう}します>>」は、{本当|ほんとう}に {考|かんが}える ときも、{断|ことわ}る ときも あります。{顔|かお}が {笑|わら}って いても、{決|き}まった わけでは ありません。', en: 'In Japanese business, a flat "no" is often avoided. "Kentō shimasu" is sometimes a real review and sometimes a polite no. A smile does not mean it is decided.' },
      dont: { jp: '{決|き}まった と {思|おも}って、すぐ {上司|じょうし}に「<<{契約|けいやく}>>です」と {言|い}わない。', en: "Don't assume it is decided and announce a deal to your boss right away." },
      tip: { jp: '{意味|いみ}が わからない ときは、{丁寧|ていねい}に {聞|き}きましょう。「いつごろ お{返事|へんじ}を いただけますか？」と {聞|き}けば、<<{失礼|しつれい}>>に なりません。', en: 'If unsure: ask politely when you can expect a reply. Asking is not rude.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        svg.append(el('circle', { cx: 36, cy: 32, r: 17, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 2.5 }),
          el('circle', { cx: 30, cy: 28, r: 2, fill: C.ink }), el('circle', { cx: 42, cy: 28, r: 2, fill: C.ink }),
          el('path', { d: 'M27 36 Q36 45 45 36', fill: 'none', stroke: C.ink, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
        D.rect(svg, 62, 14, 124, 36, { r: 12 });
        D.label(svg, 124, 36, 'けんとうします', { color: C.ink, size: 11 });
        D.arrow(svg, 100, 56, 100, 68, { color: '#9a9a9a' });
        D.rect(svg, 22, 70, 156, 24, { r: 8, fill: '#f6f6f4' });
        D.label(svg, 100, 86, 'まだ きまって いない', { color: '#666' });
        D.rect(svg, 22, 100, 156, 24, { r: 8, fill: '#f6f6f4' });
        D.label(svg, 100, 116, 'ことわりの ことも ある', { color: '#666' });
        D.label(svg, 100, 144, 'いつごろ ですか？', { color: C.red, size: 10 });
      },
    },
    test: { great: 'bow', ky: 'contract' },
  });

  /* ------------------------------------------------------------------ 3-7 */
  KY.defineStage({
    id: '3-7',
    chapter: 3,
    title: { jp: '<<リリース>>{前日|ぜんじつ}の {仕様変更|しようへんこう}', en: 'The Last-Minute Change' },
    intro: { jp: '{明日|あした}は システムの <<リリース>>の {日|ひ}です。お{客様|きゃくさま}と さいごの {確認|かくにん}を しています。', en: 'The system goes live tomorrow. This is the final check with the client.' },
    time: 15000,
    mechanic: 'choice',
    setup(scene) {
      scene.camera({ zoom: 1.15, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      const mon = P.monitor({ x: 180, y: 270, w: 176, h: 112 });
      const { el } = KY.svg;
      mon.screen.append(
        el('rect', { x: 0, y: 0, width: mon.sw, height: 14, fill: '#dfe5ec' }),
        el('rect', { x: 12, y: 26, width: 90, height: 6, rx: 3, fill: '#d8d8d8' }),
        el('rect', { x: 12, y: 40, width: 120, height: 6, rx: 3, fill: '#e3e3e3' }),
        el('rect', { x: 44, y: 62, width: 80, height: 26, rx: 13, fill: '#3b6fd8' }),
      );
      scene.add('bg', mon);
      scene.label(180, 140, { jp: 'リリースは{明日|あした}', en: 'Release: tomorrow' }, 'deadline');
      const player = scene.person({ x: 92, y: 470, facing: 1, color: 'player', player: true });
      const client = scene.person({ x: 276, y: 470, facing: -1, tag: WHO.customer });
      return { player, client };
    },
    params: {
      script: [
        [300, (s, r) => r.client.set({ arms: { f: [128, 0], b: [-6, 0] } })],
        [400, (s, r) => s.say(r.client, { jp: 'このボタン、やっぱり{緑|みどり}に できます？', en: 'Could we make this button green after all?' }, { dur: 4200 })],
        [1700, (s, r) => r.player.mark('sweat')],
      ],
      showAt: 2300,
      options: [
        { id: 'no', text: { jp: '{無理|むり}です。', en: "That's impossible." }, outcome: 'no' },
        { id: 'yes', text: { jp: 'はい、すぐやります！', en: "Sure, I'll do it right away!" }, outcome: 'yes' },
        { id: 'consult', text: { jp: '{可能|かのう}です。ただ、テストのためリリースが1{日|にち}{延|の}びますが、いかがですか？', en: "We can. But testing would push the release back one day. How would you like to proceed?" }, outcome: 'great' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        r.client.set({ arms: null });
        scene.say(r.player, opt.text, { dur: 2600, cls: 'mine' });
        return 2700;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: 'なるほど…。じゃあ{今回|こんかい}は{今|いま}のままで{行|い}きましょう。', en: "I see... Then let's keep it as it is this time." } },
      no: { grade: 'ky', who: WHO.customer, line: { jp: '…{他|ほか}の{会社|かいしゃ}にお{願|ねが}いしようかな。', en: '...Maybe we should ask another company.' },
        react(scene, r) { r.client.mark('anger'); } },
      yes: { grade: 'ky', who: null, line: { jp: '（その{夜|よる}、チームは {無理|むり}な {残業|ざんぎょう}を することに…）', en: '(That night, the whole team had to work overtime to make it...)' },
        react(scene, r) { r.player.mark('sweat2'); } },
      silent: { grade: 'ky', who: WHO.customer, line: { jp: '…あの、{聞|き}こえてます？', en: '...Um, can you hear me?' } },
    },
    card: {
      badge: 'must',
      name: { jp: '「できません」と {言|い}わずに {相談|そうだん}する', en: 'Don\'t just say "no" — explain the impact' },
      points: [
        { jp: 'お{客様|きゃくさま}に「{無理|むり}です」とだけ {言|い}わない。', en: 'Avoid a flat "muri desu" (impossible) to a client.' },
        { jp: '{時間|じかん}・お{金|かね}・{品質|ひんしつ}への {影響|えいきょう}を {伝|つた}えて、お{客様|きゃくさま}に {決|き}めて もらう。', en: 'Explain the impact on time, cost and quality, and let the client decide.' },
        { jp: 'チームに {聞|き}く {前|まえ}に、「すぐ やります」と {約束|やくそく}しない。', en: 'Do not promise a last-minute change before checking with your team.' },
      ],
      phrase: { jp: '{可能|かのう}ですが、ひとつ ご{相談|そうだん}が ございます', ro: 'kanō desu ga, hitotsu go-sōdan ga gozaimasu', en: 'It is possible, but there is one thing I would like to discuss.' },
      why: { jp: '{日本|にほん}の ビジネスでは、はっきり「NO」と {言|い}うと {関係|かんけい}が わるく なりやすいです。でも なんでも「YES」と {言|い}うと、{品質|ひんしつ}が {下|さ}がって チームも つかれます。だから えらべる {形|かたち}で {相談|そうだん}します。', en: 'A blunt "no" can hurt the relationship, but saying yes to everything hurts quality and the team. Offer a choice instead.' },
      dont: { jp: 'その {場|ば}の {空気|くうき}を よくする ためだけに、すぐ「やります」と {言|い}わない。', en: "Don't accept a change on the spot just to escape an awkward moment." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C;
        const { el } = KY.svg;
        svg.append(el('path', { d: 'M100 30 L100 112 M70 112 L130 112 M40 52 L160 52', stroke: C.ink, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }));
        svg.append(el('path', { d: 'M40 52 L24 86 L56 86 Z M160 52 L144 86 L176 86 Z', stroke: C.ink, 'stroke-width': 2, fill: '#fff' }));
        D.label(svg, 40, 102, 'へんこう', { color: C.ink, size: 10 });
        D.label(svg, 160, 102, '+1にち', { color: C.ink, size: 10 });
        D.label(svg, 100, 138, 'おきゃくさまが えらぶ', { color: C.red, size: 10 });
      },
    },
    test: { great: 'consult', ky: 'no' },
  });

  /* ------------------------------------------------------------------ 3-8 */
  const LEAVE_AT = { greet: 2000, c1: 4000, c2: 5500 };   // end of the greeting; the two clients leave

  KY.defineStage({
    id: '3-8',
    chapter: 3,
    title: { jp: 'オンライン{会議|かいぎ}の <<{退出|たいしゅつ}>>', en: 'Leaving the Call' },
    intro: { jp: 'お{客様|きゃくさま}との オンライン{会議|かいぎ}が おわります。みんなが あいさつを して います。', en: 'The client call is ending. Everyone is saying their goodbyes.' },
    time: 12000,
    mechanic: 'timing',
    setup(scene) {
      const { el, g, C } = KY.svg;
      callWindow(scene, [['mic', 40], ['cam', 80], ['chat', 280], ['people', 320]]);
      const c1 = videoTile(scene, { id: 'c1', col: 0, row: 0, T: { jp: 'サクラ{商事|しょうじ}：{山田|やまだ}{様|さま}', en: 'Sakura Trading: Mr. Yamada' }, deco: 'window', color: 'npc', ghost: true });
      const c2 = videoTile(scene, { id: 'c2', col: 1, row: 0, T: { jp: 'サクラ{商事|しょうじ}：{佐藤|さとう}{様|さま}', en: 'Sakura Trading: Ms. Sato' }, deco: 'plant', color: 'npc2', ghost: true });
      const host = videoTile(scene, { id: 'host', col: 0, row: 1, T: { jp: 'ネクストメイク：{藤木|ふじき}', en: 'NEXTMAKE: Fujiki' }, deco: 'shelf', color: 'npc' });
      const me = videoTile(scene, { id: 'me', col: 1, row: 1, T: { jp: 'ネクストメイク：あなた', en: 'NEXTMAKE: You' }, deco: 'blind', player: true, ghost: true });
      const label = el('text', { y: 6, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 900, fill: '#fff' });
      label.textContent = 'たいしゅつ';
      const exitBtn = P.hitPad({ el: g({ transform: 'translate(180 539)' }, [
        el('rect', { x: -62, y: -21, width: 124, height: 42, rx: 14, fill: C.red, stroke: '#9e000c', 'stroke-width': 3 }), label,
      ]) }, 140, 56);
      scene.add('fg', exitBtn);
      return { exitBtn, c1, c2, host, me, persons: { c1: c1.person, c2: c2.person, host: host.person, me: me.person } };
    },
    params: {
      target: 'exitBtn',
      label: 'Leave button',
      script: [
        [300, (s, r) => {
          s.bubble({ x: 180, y: 148, tail: 'down', who: { jp: 'みんな', en: 'Everyone' }, text: { jp: '{本日|ほんじつ}は ありがとうございました', en: 'Thank you for your time today.' }, dur: 1650 });
          [r.c1, r.c2, r.host].forEach(t => nod(s, t.person));
        }],
        [LEAVE_AT.greet, s => s.flag('greetEnd')],
        [3300, (s, r) => s.bubble({ x: r.c1.cx, y: r.c1.y, tail: 'down', text: { jp: '<<{失礼|しつれい}いたします>>', en: 'Excuse me. (Signing off.)' }, dur: 800 })],
        [LEAVE_AT.c1, (s, r) => { dropTile(s, r.c1); s.flag('c1gone'); }],
        [4800, (s, r) => s.bubble({ x: r.c2.cx, y: r.c2.y, tail: 'down', text: { jp: '<<{失礼|しつれい}いたします>>', en: 'Excuse me. (Signing off.)' }, dur: 800 })],
        [LEAVE_AT.c2, (s, r) => { dropTile(s, r.c2); s.flag('c2gone'); }],
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'stay';
        if (tapAt < LEAVE_AT.greet) return 'greeting';
        return flags.c2gone === undefined ? 'early' : 'great';
      },
      onTap(scene, r, key) {
        if (key === 'greeting') { dropTile(scene, r.me); return 900; }
        scene.bubble({ x: r.me.cx, y: r.me.y, tail: 'down', text: { jp: '<<{失礼|しつれい}いたします>>', en: 'Excuse me. (Signing off.)' }, cls: 'mine', dur: 900 });
        scene.after(700, () => dropTile(scene, r.me));
        return 1500;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: '（お{客様|きゃくさま}が {出|で}てから {退出|たいしゅつ}…。ちゃんと してるな）', en: '(Left after the clients did... Nicely done.)' },
        react(scene, r) { r.persons.host.mark('sparkle'); } },
      early: { grade: 'ok', who: WHO.customer, line: { jp: '（あ、もう {退出|たいしゅつ}…？ まあ、いいんですけどね）', en: "(Oh, leaving already...? Well, that's fine, I suppose.)" },
        react(scene, r) { r.persons.c1.mark('sweat'); r.persons.c2.mark('sweat'); } },
      greeting: { grade: 'ky', who: WHO.customer, line: { jp: '（…あれ？ あいさつの {途中|とちゅう}で {消|き}えた…）', en: '(...Huh? They vanished in the middle of the greeting...)' },
        react(scene, r) { r.persons.c1.mark('q'); r.persons.c2.mark('shock'); r.persons.host.mark('sweat2'); } },
      stay: { grade: 'ok', who: WHO.bucho, line: { jp: '（まだ いる…。{仕方|しかた}ない、{私|わたし}が {会議|かいぎ}を {終|お}わらせよう）', en: "(Still here... Oh well, I'll end the meeting myself.)" },
        react(scene, r) { r.persons.host.mark('sweat'); r.persons.me.mark('zzz'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: 'オンライン{会議|かいぎ}の <<{退出|たいしゅつ}>>', en: 'Leaving an online meeting' },
      points: [
        { jp: 'おわりの あいさつの あとで、{退出|たいしゅつ}します。あいさつの {間|あいだ}は {待|ま}ちます。', en: 'Leave after the closing greetings. Wait while they are being said.' },
        { jp: 'お{客様|きゃくさま}が {先|さき}に {退出|たいしゅつ}して から、「<<{失礼|しつれい}いたします>>」と {言|い}って {自分|じぶん}も {退出|たいしゅつ}します。', en: 'Let the client leave first, then say "shitsurei itashimasu" and leave yourself.' },
        { jp: '<<ホスト>>が いちばん あとに {出|で}ます。ホストなら、みんなが {出|で}るまで {待|ま}ちます。', en: 'The host leaves last. If you are the host, wait until everyone has left.' },
      ],
      phrase: { jp: '<<{失礼|しつれい}いたします>>', ro: 'shitsurei itashimasu', en: 'Excuse me. (I will take my leave now.)' },
      why: { jp: 'お{客様|きゃくさま}との {会議|かいぎ}では、お{客様|きゃくさま}が {先|さき}に {出|で}る ほうが {安心|あんしん}です。{相手|あいて}を {大切|たいせつ}に して いる ことが {伝|つた}わります。{先|さき}に いなく なると、{急|いそ}いで いる ように {見|み}えます。', en: 'In a meeting with clients, letting them leave first is the safer choice and shows respect. Disappearing first can look like you are in a hurry.' },
      dont: { jp: 'あいさつを して いる {間|あいだ}に {退出|たいしゅつ}しない。', en: "Don't leave while the greetings are still going on." },
      tip: { jp: '{自分|じぶん}の {会社|かいしゃ}の {中|なか}の {会議|かいぎ}では、{順番|じゅんばん}を {気|き}に しない ことが {多|おお}いです。<<ホスト>>が いちばん あとに {出|で}ます。{迷|まよ}ったら、まわりの {人|ひと}を {見|み}ましょう。', en: 'If unsure: in meetings inside your own company, the order usually does not matter, and the host leaves last. Watch what the people around you do.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        const tile = (x, y, kind) => {
          const dashed = kind === 'gone';
          svg.append(el('rect', { x, y, width: 74, height: 40, rx: 6, fill: dashed ? '#fafafa' : '#f4f6f8', stroke: kind === 'you' ? C.red : '#9a9a9a', 'stroke-width': kind === 'you' ? 3 : 2.5, 'stroke-dasharray': dashed ? '5 4' : null }));
          if (!dashed) svg.append(el('circle', { cx: x + 37, cy: y + 17, r: 7, fill: kind === 'you' ? C.red : '#8f8f8f' }), el('rect', { x: x + 25, y: y + 26, width: 24, height: 14, rx: 7, fill: kind === 'you' ? C.red : '#8f8f8f' }));
        };
        tile(18, 8, 'gone'); tile(108, 8, 'gone'); tile(18, 70, 'host'); tile(108, 70, 'you');
        D.seat(svg, 100, 30, 1);
        D.seat(svg, 100, 92, 2, { you: true });
        D.label(svg, 100, 64, 'おきゃくさまが さき', { color: '#666', size: 10 });
        D.label(svg, 100, 134, 'じぶんは そのあと', { color: C.red, size: 10 });
      },
    },
    test: { great: { at: 7000 }, ok: { at: 3000 }, ky: { at: 1000 } },
  });
})(typeof window !== 'undefined' ? window : globalThis);
