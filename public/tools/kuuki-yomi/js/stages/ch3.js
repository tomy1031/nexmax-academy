/* Chapter 3 — Meetings (会議) */
(function (root) {
  const KY = root.KY;
  const P = KY.props;

  /* dictionary words used in this chapter (easy-Japanese explanations) */
  KY.addGlossary({
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
    node.innerHTML = KY.text.html(T, { gloss: false });
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
    title: { jp: '{名刺|めいし}を {切|き}らした！', en: 'Out of Cards' },
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
        { jp: '{名刺|めいし}が ない ときは、はじめに あやまって、「<<{切|き}らしております>>」と {言|い}います。', en: 'Apologize first, then say "kirashite orimasu" (we have run out).' },
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
    intro: { jp: 'お{客様|きゃくさま}の {会社|かいしゃ}で、お{茶|ちゃ}が {出|で}ました。のどが からからです。', en: "You've been served tea at the client's office. You are very thirsty." },
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
  const NOD_BEATS = Array.from({ length: 8 }, (_, i) => 1400 + i * 900);   // when the others nod
  const NOD_WINDOW = 350;                                                  // a tap within ±350 ms of a beat is a hit
  /* what the manager says, and the aizuchi that fit each sentence (said in turn as you nod) */
  const LINES = [
    { at: 300, text: { jp: 'それでは、{今月|こんげつ}の {報告|ほうこく}を {始|はじ}めます。', en: "Now, let's start this month's report." },
      aizuchi: [{ jp: 'お{願|ねが}いします', en: 'Please go ahead.' }, { jp: 'はい', en: 'Yes.' }] },
    { at: 3000, text: { jp: '{売上|うりあげ}は、{先月|せんげつ}より {少|すこ}し {増|ふ}えました。', en: 'Sales went up a little compared to last month.' },
      aizuchi: [{ jp: 'そうなんですね', en: 'Oh, I see.' }, { jp: 'はい', en: 'Yes.' }] },
    { at: 5700, text: { jp: '{来月|らいげつ}も、この {調子|ちょうし}で いきたいですね。', en: "Let's keep this pace next month, too." },
      aizuchi: [{ jp: 'はい、そうですね', en: 'Yes, indeed.' }, { jp: 'はい', en: 'Yes.' }] },
  ];

  KY.defineStage({
    id: '3-5',
    chapter: 3,
    title: { jp: 'うなずき オンライン', en: 'Nod Along' },
    intro: { jp: 'オンライン{会議|かいぎ}です。{部長|ぶちょう}が {話|はな}して います。あなたの カメラは オンです。', en: 'You are in an online meeting. Your manager is talking. Your camera is on.' },
    time: 9000,
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
          scene.end(taps > 14 ? 'headbang' : hits >= 5 && extra <= 3 ? 'great' : hits >= 2 ? 'ok' : 'frozen');
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
        scene.onTap(r.tiles.me.outer, tap, 'You (tap to nod)');
        scene.timer(scene.def.time, finish);
        scene._nod = { tap, stats: () => ({ hits, extra, taps }) };
      },
      /* input: { hits: n taps on the beat, extra: m taps off the beat } */
      simulate(scene, r, input) {
        input = input || {};
        for (let i = 0; i < (input.hits || 0); i++) scene.at(NOD_BEATS[i] + (i % 2 ? 60 : -40), () => scene._nod.tap());
        for (let j = 0; j < (input.extra || 0); j++) scene.at(NOD_BEATS[j % 8] + [450, 400, 500][Math.floor(j / 8) % 3], () => scene._nod.tap());
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
    time: 15000,
    mechanic: 'choice',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
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
      options: [
        { id: 'ask', text: { jp: 'では、{来週|らいしゅう}の {水曜日|すいようび}に、15{分|ふん}だけ お{時間|じかん}を いただけますか？', en: 'Then could I have just 15 minutes of your time next Wednesday?' }, outcome: 'great' },
        { id: 'tomorrow', text: { jp: 'ありがとうございます！ お{返事|へんじ}を お{待|ま}ちして います。', en: "Thank you! I'll wait for your reply." }, outcome: 'ok' },
        { id: 'deal', text: { jp: 'ありがとうございます！ では、<<{契約|けいやく}>>の {準備|じゅんび}を します！', en: "Thank you! Then I'll get the contract ready!" }, outcome: 'deal' },
      ],
      onChoose(scene, r, opt) {
        if (r.ponder) scene.removeOverlay(r.ponder);
        r.player.mark(null);
        scene.say(r.player, opt.text, { dur: 2600, cls: 'mine', lift: 26 });
        return 2800;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.customer, line: { jp: 'はい。では、{水曜日|すいようび}の 10{時|じ}は いかがですか？', en: 'Sure. How about Wednesday at 10?' } },
      ok: { grade: 'ok', who: WHO.narrator, line: { jp: '（{三日|みっか}たっても、{返事|へんじ}は {来|こ}ない…）', en: '(Three days later, still no reply...)' },
        react(scene, r) { r.player.mark('dots'); } },
      deal: { grade: 'ky', who: WHO.bucho, line: { jp: '{決|き}まったと {言|い}ったよね？ …で、{断|ことわ}りの メールが {来|き}てるけど？', en: '"You said it was decided, right? ...So why is there a rejection email?"' },
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
      phrase: { jp: '{来週|らいしゅう}、15{分|ふん}だけ お{時間|じかん}を いただけますか？', ro: 'raishū, jūgo-fun dake o-jikan o itadakemasu ka?', en: 'Could I have just 15 minutes of your time next week?' },
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
    test: { great: 'ask', ok: 'tomorrow', ky: 'deal' },
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
      const c1 = videoTile(scene, { id: 'c1', col: 0, row: 0, T: { jp: '{田中|たなか}', en: 'Tanaka (client)' }, deco: 'window', color: 'npc', ghost: true });
      const c2 = videoTile(scene, { id: 'c2', col: 1, row: 0, T: { jp: '{佐藤|さとう}', en: 'Sato (client)' }, deco: 'plant', color: 'npc2', ghost: true });
      const host = videoTile(scene, { id: 'host', col: 0, row: 1, T: WHO.bucho, deco: 'shelf', color: 'npc' });
      const me = videoTile(scene, { id: 'me', col: 1, row: 1, T: { jp: '{自分|じぶん}', en: 'You' }, deco: 'blind', player: true, ghost: true });
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
