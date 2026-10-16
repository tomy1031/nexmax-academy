/* Furniture & items in the same minimal line style.
   Every factory returns a controller { el, ... }. `red: true` marks something the player operates.
   Side-view props stand on a floor line (y = floor). Top-view props are named *Top. */
(function (root) {
  const KY = root.KY;
  const { el, g, set, C } = KY.svg;

  const LINE = { stroke: C.line, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  const stroke = (red, extra) => Object.assign({}, LINE, { stroke: red ? C.red : C.line }, extra || {});
  const fill = red => (red ? C.redSoft : C.paper);
  const at = (x, y, kids, cls) => g({ transform: `translate(${x} ${y})`, class: cls || null }, kids);
  const ctl = (node, extra) => Object.assign({ el: node }, extra || {});

  const P = {};

  /* ------------------------------ side view ------------------------------ */

  P.floor = ({ y = 470, x1 = 0, x2 = 360 } = {}) =>
    ctl(el('line', { x1, y1: y, x2, y2: y, stroke: '#cfcfcf', 'stroke-width': 2 }));

  /* side-view room: tinted floor below the floor line + skirting line. Use in every side-view scene. */
  P.backdrop = ({ floor = 470, tint = '#f4f4f1' } = {}) =>
    ctl(g({}, [
      el('rect', { x: -400, y: floor, width: 1160, height: 900, fill: tint }),
      el('line', { x1: -400, y1: floor, x2: 760, y2: floor, stroke: '#d4d4d0', 'stroke-width': 2 }),
      el('line', { x1: -400, y1: floor - 9, x2: 760, y2: floor - 9, stroke: '#ececea', 'stroke-width': 2 }),
    ]));

  P.wallLine = ({ y = 120, x1 = 0, x2 = 360 } = {}) =>
    ctl(el('line', { x1, y1: y, x2, y2: y, stroke: C.faint, 'stroke-width': 2 }));

  /* table / desk: top surface at y, legs to floor */
  P.table = ({ x, y, w = 120, floor = 470, thick = 7, legs = true }) => {
    const n = at(x, y, [
      legs && el('line', Object.assign({ x1: -w / 2 + 10, y1: thick, x2: -w / 2 + 10, y2: floor - y }, LINE)),
      legs && el('line', Object.assign({ x1: w / 2 - 10, y1: thick, x2: w / 2 - 10, y2: floor - y }, LINE)),
      el('rect', Object.assign({ x: -w / 2, y: 0, width: w, height: thick, rx: 3, fill: C.paper }, LINE)),
    ]);
    return ctl(n, { top: y });
  };

  /* simple sofa / chair seen from the side; back = side of the backrest */
  P.seat = ({ x, floor = 470, w = 54, seatH = 25, backH = 34, back = 'left', red = false }) => {
    const bx = back === 'left' ? -w / 2 : w / 2 - 9;
    const n = at(x, floor, [
      el('rect', Object.assign({ x: bx, y: -seatH - backH, width: 9, height: backH + seatH, rx: 4, fill: fill(red) }, stroke(red))),
      el('rect', Object.assign({ x: -w / 2, y: -seatH, width: w, height: seatH - 4, rx: 5, fill: fill(red) }, stroke(red))),
      el('line', Object.assign({ x1: -w / 2 + 6, y1: -4, x2: -w / 2 + 6, y2: 0 }, stroke(red))),
      el('line', Object.assign({ x1: w / 2 - 6, y1: -4, x2: w / 2 - 6, y2: 0 }, stroke(red))),
    ]);
    return ctl(n, { seatY: floor - seatH });
  };

  /* office chair (side) */
  P.officeChair = ({ x, floor = 470, facing = 1, red = false }) => {
    const n = at(x, floor, [
      el('path', Object.assign({ d: `M${-14 * facing} -26 L${-14 * facing} -64`, fill: 'none' }, stroke(red, { 'stroke-width': 5 }))),
      el('rect', Object.assign({ x: -16, y: -30, width: 32, height: 6, rx: 3, fill: fill(red) }, stroke(red))),
      el('line', Object.assign({ x1: 0, y1: -24, x2: 0, y2: -6 }, stroke(red))),
      el('path', Object.assign({ d: 'M-14 0 L14 0 M0 -6 L-14 0 M0 -6 L14 0', fill: 'none' }, stroke(red))),
    ]);
    return ctl(n);
  };

  /* Japanese tea cup (yunomi) on a saucer (chataku) */
  P.teaCup = ({ x, y, red = false, steam = true }) => {
    const steamG = g({ class: 'steam' }, [
      el('path', { d: 'M-4 -22 q-4 -6 0 -12 q4 -6 0 -12', fill: 'none', stroke: '#c9c9c9', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      el('path', { d: 'M4 -24 q-4 -6 0 -12', fill: 'none', stroke: '#d9d9d9', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    ]);
    const cup = g({}, [
      el('ellipse', Object.assign({ cx: 0, cy: 0, rx: 13, ry: 3, fill: fill(red) }, stroke(red))),
      el('path', Object.assign({ d: 'M-8 -2 L-9 -18 L9 -18 L8 -2 Z', fill: fill(red) }, stroke(red))),
    ]);
    const n = at(x, y, [steam ? steamG : null, cup]);
    return ctl(n, {
      cup,
      steam: on => set(steamG, { opacity: on ? 1 : 0 }),
      lift: (dx, dy, a = 0) => set(cup, { transform: `translate(${dx} ${dy}) rotate(${a})` }),
    });
  };

  /* beer glass with level 0..1 and foam 0..1 (fraction of the filled part) */
  P.glass = ({ x, y, h = 34, w = 18, level = 0.85, foam = 0.25, red = false }) => {
    const liquid = el('rect', { x: -w / 2 + 2, width: w - 4, fill: C.beer });
    const froth = el('rect', { x: -w / 2 + 2, width: w - 4, fill: C.foam });
    const body = el('path', Object.assign({ d: `M${-w / 2} ${-h} L${-w / 2 + 2} 0 L${w / 2 - 2} 0 L${w / 2} ${-h}`, fill: 'none' }, stroke(red)));
    const n = at(x, y, [liquid, froth, body]);
    const c = ctl(n, {
      level, foam,
      setLevel(lv, fm = c.foam) {
        c.level = Math.max(0, Math.min(1.15, lv)); c.foam = Math.max(0, Math.min(1, fm));
        const full = Math.min(1, c.level) * (h - 2);
        const fH = full * c.foam;
        set(liquid, { y: -full, height: Math.max(0, full - fH) });
        set(froth, { y: -full, height: fH });
      },
    });
    c.setLevel(level, foam);
    return c;
  };

  /* beer bottle (label faces viewer) */
  P.bottle = ({ x, y, red = false, tilt = 0 }) => {
    const b = g({ transform: `rotate(${tilt})` }, [
      el('path', Object.assign({ d: 'M-10 0 L-10 -44 Q-10 -52 -4 -56 L-4 -70 L4 -70 L4 -56 Q10 -52 10 -44 L10 0 Z', fill: red ? C.redSoft : '#f6efe0' }, stroke(red))),
      el('rect', { x: -8, y: -36, width: 16, height: 16, rx: 2, fill: red ? C.red : C.npc2 }),
    ]);
    const n = at(x, y, [b]);
    return ctl(n, { body: b, tilt: a => set(b, { transform: `rotate(${a})` }) });
  };

  /* business card (meishi), centered on x,y */
  P.card = ({ x, y, w = 34, h = 20, red = false, a = 0 }) => {
    const n = at(x, y, [
      el('rect', Object.assign({ x: -w / 2, y: -h / 2, width: w, height: h, rx: 2, fill: C.paper }, stroke(red, { 'stroke-width': 2 }))),
      el('line', { x1: -w / 2 + 5, y1: -h / 2 + 6, x2: -w / 2 + 14, y2: -h / 2 + 6, stroke: red ? C.red : C.soft, 'stroke-width': 2 }),
      el('line', { x1: -w / 2 + 5, y1: 2, x2: w / 2 - 6, y2: 2, stroke: red ? C.red : C.line, 'stroke-width': 2.5 }),
      el('line', { x1: -w / 2 + 5, y1: 6.5, x2: w / 2 - 12, y2: 6.5, stroke: red ? C.red : C.soft, 'stroke-width': 1.5 }),
    ]);
    set(n, { transform: `translate(${x} ${y}) rotate(${a})` });
    return ctl(n, { moveTo(nx, ny, na = a) { set(n, { transform: `translate(${nx} ${ny}) rotate(${na})` }); } });
  };

  P.cardCase = ({ x, y, red = false }) =>
    ctl(at(x, y, [el('rect', Object.assign({ x: -20, y: -4, width: 40, height: 8, rx: 2, fill: red ? C.redSoft : '#efe7d6' }, stroke(red)))]));

  P.window = ({ x, y, w = 90, h = 70 }) =>
    ctl(at(x, y, [
      el('rect', { x: 0, y: 0, width: w, height: h, rx: 2, fill: '#f6f9fc', stroke: C.soft, 'stroke-width': 2 }),
      el('line', { x1: w / 2, y1: 0, x2: w / 2, y2: h, stroke: C.soft, 'stroke-width': 2 }),
    ]));

  /* door on the back wall (front view). open 0..1 */
  P.door = ({ x, floor = 470, w = 64, h = 150, open = 0 }) => {
    const leaf = el('rect', { x: 0, y: -h, width: w, height: h, fill: C.paper, stroke: C.line, 'stroke-width': 2.5 });
    const knob = el('circle', { cx: w - 10, cy: -h / 2, r: 3, fill: C.line });
    const n = at(x, floor, [
      el('rect', { x: 0, y: -h, width: w, height: h, fill: '#ececec' }),
      leaf, knob,
      el('rect', { x: -4, y: -h - 4, width: w + 8, height: h + 4, fill: 'none', stroke: C.soft, 'stroke-width': 2 }),
    ]);
    const c = ctl(n, {
      setOpen(v) { const sw = w * (1 - 0.82 * v); set(leaf, { width: sw }); set(knob, { cx: sw - 10, opacity: v > 0.2 ? 0 : 1 }); },
    });
    c.setOpen(open);
    return c;
  };

  P.plant = ({ x, floor = 470 }) =>
    ctl(at(x, floor, [
      el('path', { d: 'M-12 0 L-14 -24 L14 -24 L12 0 Z', fill: C.paper, stroke: C.line, 'stroke-width': 2.5 }),
      el('path', { d: 'M0 -24 C-18 -40 -20 -60 -6 -70 M0 -24 C14 -42 20 -58 8 -72 M0 -24 C0 -44 2 -60 0 -78', fill: 'none', stroke: C.npc2, 'stroke-width': 3, 'stroke-linecap': 'round' }),
    ]));

  P.clock = ({ x, y, r = 18, h = 9, m = 0 }) => {
    const hh = el('line', { x1: 0, y1: 0, stroke: C.ink, 'stroke-width': 3, 'stroke-linecap': 'round' });
    const mm = el('line', { x1: 0, y1: 0, stroke: C.ink, 'stroke-width': 2, 'stroke-linecap': 'round' });
    const n = at(x, y, [el('circle', { r, fill: C.paper, stroke: C.line, 'stroke-width': 2.5 }), hh, mm, el('circle', { r: 2, fill: C.ink })]);
    const c = ctl(n, {
      setTime(H, M) {
        const ma = (M / 60) * 2 * Math.PI, ha = (((H % 12) + M / 60) / 12) * 2 * Math.PI;
        set(mm, { x2: Math.sin(ma) * r * 0.75, y2: -Math.cos(ma) * r * 0.75 });
        set(hh, { x2: Math.sin(ha) * r * 0.5, y2: -Math.cos(ha) * r * 0.5 });
      },
    });
    c.setTime(h, m);
    return c;
  };

  /* desk monitor; screen content can be appended to .screen */
  P.monitor = ({ x, y, w = 70, h = 46, red = false }) => {
    const screen = g({ transform: `translate(${-w / 2 + 4} ${-h + 4})` });
    const n = at(x, y, [
      el('line', Object.assign({ x1: 0, y1: 0, x2: 0, y2: 10 }, LINE)),
      el('line', Object.assign({ x1: -12, y1: 10, x2: 12, y2: 10 }, LINE)),
      el('rect', Object.assign({ x: -w / 2, y: -h, width: w, height: h, rx: 3, fill: '#f4f6f8' }, stroke(red))),
      screen,
    ]);
    return ctl(n, { screen, sw: w - 8, sh: h - 8 });
  };

  /* desk phone; ring(on) wiggles the handset */
  P.phone = ({ x, y, red = false }) => {
    const hand = el('path', Object.assign({ d: 'M-16 -14 Q0 -22 16 -14 L16 -10 Q0 -16 -16 -10 Z', fill: fill(red) }, stroke(red)));
    const n = at(x, y, [
      el('path', Object.assign({ d: 'M-18 0 L-14 -12 L14 -12 L18 0 Z', fill: fill(red) }, stroke(red))),
      el('g', { class: 'handset' }, [hand]),
    ]);
    return ctl(n, { ring: on => n.classList.toggle('ringing', !!on), handset: hand });
  };

  /* big round push button, label is plain text (e.g. '開', 'DEPLOY') */
  P.button = ({ x, y, r = 26, label = '', red = true, fontSize = 18 }) => {
    const cap = el('circle', { r, fill: red ? C.red : C.paper, stroke: red ? '#9e000c' : C.line, 'stroke-width': 3 });
    const t = el('text', { y: fontSize * 0.36, 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 900, fill: red ? '#fff' : C.ink });
    t.textContent = label;
    const n = at(x, y, [el('circle', { r: r + 6, fill: '#efefef', stroke: C.soft, 'stroke-width': 2 }), cap, t]);
    return ctl(n, { press: on => set(cap, { transform: on ? 'scale(0.92)' : null }) });
  };

  /* elevator seen from the hall (front view). open 0..1 */
  P.elevatorFront = ({ x, floor = 470, w = 150, h = 210, open = 0, floorLabel = '' }) => {
    const half = w / 2;
    const L = el('rect', { y: -h, height: h, fill: '#e9ecef', stroke: C.line, 'stroke-width': 2.5 });
    const R = el('rect', { y: -h, height: h, fill: '#e9ecef', stroke: C.line, 'stroke-width': 2.5 });
    const lbl = el('text', { x: 0, y: -h - 18, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: C.ink });
    lbl.textContent = floorLabel;
    const inside = el('rect', { x: -half, y: -h, width: w, height: h, fill: '#f7f7f5' });
    const n = at(x, floor, [
      inside,
      g({ class: 'elev-inside' }),
      L, R,
      el('rect', { x: -half - 10, y: -h - 10, width: w + 20, height: h + 10, fill: 'none', stroke: C.soft, 'stroke-width': 4 }),
      el('rect', { x: -22, y: -h - 34, width: 44, height: 22, rx: 3, fill: C.paper, stroke: C.soft, 'stroke-width': 2 }),
      lbl,
    ]);
    const c = ctl(n, {
      inside: n.querySelector('.elev-inside'),
      setOpen(v) {
        c.open = v;
        const dw = half * (1 - 0.92 * v);
        set(L, { x: -half, width: dw });
        set(R, { x: half - dw, width: dw });
      },
      setLabel(s) { lbl.textContent = s; },
    });
    c.setOpen(open);
    return c;
  };

  /* hanko stamp impression (red circle with a name) — `red` is the player's */
  P.stampMark = ({ x, y, name = '田中', r = 13, a = 0, red = true, ink }) => {
    const col = ink || (red ? C.red : '#c0392b');
    const t = el('text', { y: 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 900, fill: col, 'writing-mode': 'horizontal-tb' });
    t.textContent = name;
    const n = g({ transform: `translate(${x} ${y}) rotate(${a})` }, [el('circle', { r, fill: 'none', stroke: col, 'stroke-width': 2.2 }), t]);
    return ctl(n, { rotate(na) { set(n, { transform: `translate(${x} ${y}) rotate(${na})` }); } });
  };

  /* small paper document (A4-ish) */
  P.paper = ({ x, y, w = 120, h = 160, lines = 6 }) => {
    const kids = [el('rect', { x: 0, y: 0, width: w, height: h, rx: 2, fill: C.paper, stroke: C.line, 'stroke-width': 2 })];
    for (let i = 0; i < lines; i++) kids.push(el('line', { x1: 12, y1: 22 + i * 14, x2: w - 12 - (i % 3) * 14, y2: 22 + i * 14, stroke: C.faint, 'stroke-width': 3 }));
    return ctl(at(x, y, kids));
  };

  /* plate with n round karaage pieces */
  P.plate = ({ x, y, pieces = 1, red = false }) => {
    const food = g();
    const n = at(x, y, [el('ellipse', { cx: 0, cy: 0, rx: 40, ry: 9, fill: C.paper, stroke: C.line, 'stroke-width': 2.5 }), food]);
    const c = ctl(n, {
      setPieces(k) {
        food.textContent = '';
        for (let i = 0; i < k; i++) {
          food.append(el('path', Object.assign({ d: `M${-8 + (i % 3) * 14 - 7} -4 q2 -12 9 -11 q8 -2 9 6 q2 7 -6 8 q-10 2 -12 -3z`, fill: red ? C.redSoft : '#d9a35b' }, stroke(red, { 'stroke-width': 2 }))));
        }
      },
    });
    c.setPieces(pieces);
    return c;
  };

  P.bag = ({ x, floor = 470, red = false }) =>
    ctl(at(x, floor, [
      el('path', Object.assign({ d: 'M-10 -30 Q-10 -38 0 -38 Q10 -38 10 -30', fill: 'none' }, stroke(red))),
      el('rect', Object.assign({ x: -20, y: -30, width: 40, height: 30, rx: 4, fill: red ? C.redSoft : '#eeeeee' }, stroke(red))),
    ]));

  /* ------------------------------- top view ------------------------------- */

  /* room outline with one door gap and its swing arc */
  P.roomTop = ({ x = 30, y = 90, w = 300, h = 380, door = { wall: 'bottom', at: 30, w: 52 } }) => {
    const W = { stroke: '#bdbdbd', 'stroke-width': 6, 'stroke-linecap': 'square', fill: 'none' };
    const kids = [];
    const segs = {
      top: [[0, 0], [w, 0]], right: [[w, 0], [w, h]], bottom: [[w, h], [0, h]], left: [[0, h], [0, 0]],
    };
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const [a, b] = segs[side];
      if (door && door.wall === side) {
        const horiz = a[1] === b[1];
        const dir = horiz ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
        const len = horiz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
        const s1 = door.at, s2 = door.at + door.w;
        const p = t => (horiz ? [a[0] + dir * t, a[1]] : [a[0], a[1] + dir * t]);
        const [p0, p1, p2, p3] = [p(0), p(s1), p(s2), p(len)];
        kids.push(el('path', Object.assign({ d: `M${p0} L${p1} M${p2} L${p3}` }, W)));
        // swing arc into the room
        const inward = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[side];
        const hinge = p1, tip = [hinge[0] + inward[0] * door.w, hinge[1] + inward[1] * door.w];
        kids.push(el('path', { d: `M${hinge} L${tip} A${door.w} ${door.w} 0 0 ${side === 'bottom' || side === 'left' ? 1 : 0} ${p2}`, fill: 'none', stroke: '#cfcfcf', 'stroke-width': 2, 'stroke-dasharray': '4 4' }));
      } else {
        kids.push(el('path', Object.assign({ d: `M${a} L${b}` }, W)));
      }
    }
    const n = at(x, y, kids);
    return ctl(n);
  };

  /* sofa from above; back = which edge has the backrest */
  P.sofaTop = ({ x, y, w = 150, h = 50, seats = 2, back = 'top' }) => {
    const kids = [el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 12, fill: C.paper, stroke: '#9a9a9a', 'stroke-width': 3 })];
    const bw = 10;
    const backRect = {
      top: { x: -w / 2 + 4, y: -h / 2 + 4, width: w - 8, height: bw },
      bottom: { x: -w / 2 + 4, y: h / 2 - 4 - bw, width: w - 8, height: bw },
      left: { x: -w / 2 + 4, y: -h / 2 + 4, width: bw, height: h - 8 },
      right: { x: w / 2 - 4 - bw, y: -h / 2 + 4, width: bw, height: h - 8 },
    }[back];
    kids.push(el('rect', Object.assign({ rx: 5, fill: '#efefef' }, backRect)));
    const horiz = back === 'top' || back === 'bottom';
    for (let i = 1; i < seats; i++) {
      const t = -0.5 + i / seats;
      kids.push(horiz
        ? el('line', { x1: t * w, y1: -h / 2 + 16, x2: t * w, y2: h / 2 - 6, stroke: '#dadada', 'stroke-width': 2 })
        : el('line', { x1: -w / 2 + 16, y1: t * h, x2: w / 2 - 6, y2: t * h, stroke: '#dadada', 'stroke-width': 2 }));
    }
    const seatPos = [];
    for (let i = 0; i < seats; i++) {
      const t = -0.5 + (i + 0.5) / seats;
      seatPos.push(horiz ? { x: x + t * w, y: y + (back === 'top' ? 4 : -4) } : { x: x + (back === 'left' ? 4 : -4), y: y + t * h });
    }
    return ctl(at(x, y, kids), { seats: seatPos });
  };

  P.armchairTop = ({ x, y, w = 52, h = 50, back = 'bottom' }) => {
    const kids = [el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 10, fill: C.paper, stroke: '#9a9a9a', 'stroke-width': 3 })];
    const bw = 9;
    const r = {
      top: { x: -w / 2 + 4, y: -h / 2 + 4, width: w - 8, height: bw }, bottom: { x: -w / 2 + 4, y: h / 2 - 4 - bw, width: w - 8, height: bw },
      left: { x: -w / 2 + 4, y: -h / 2 + 4, width: bw, height: h - 8 }, right: { x: w / 2 - 4 - bw, y: -h / 2 + 4, width: bw, height: h - 8 },
    }[back];
    kids.push(el('rect', Object.assign({ rx: 4, fill: '#efefef' }, r)));
    if (back === 'top' || back === 'bottom') {
      kids.push(el('rect', { x: -w / 2 + 3, y: -h / 2 + 8, width: 7, height: h - 16, rx: 3, fill: '#efefef' }));
      kids.push(el('rect', { x: w / 2 - 10, y: -h / 2 + 8, width: 7, height: h - 16, rx: 3, fill: '#efefef' }));
    }
    return ctl(at(x, y, kids), { seat: { x, y } });
  };

  P.tableTop = ({ x, y, w = 140, h = 80, r = 6 }) =>
    ctl(at(x, y, [el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: r, fill: '#fbfaf7', stroke: '#9a9a9a', 'stroke-width': 3 })]));

  P.roundTableTop = ({ x, y, r = 60 }) =>
    ctl(at(x, y, [el('circle', { r, fill: '#fbfaf7', stroke: '#9a9a9a', 'stroke-width': 3 })]));

  P.chairTop = ({ x, y, back = 'top', s = 1 }) => {
    const w = 34 * s, h = 32 * s, bw = 7 * s;
    const r = {
      top: { x: -w / 2, y: -h / 2 - bw, width: w, height: bw }, bottom: { x: -w / 2, y: h / 2, width: w, height: bw },
      left: { x: -w / 2 - bw, y: -h / 2, width: bw, height: h }, right: { x: w / 2, y: -h / 2, width: bw, height: h },
    }[back];
    return ctl(at(x, y, [
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 6, fill: C.paper, stroke: '#a6a6a6', 'stroke-width': 2.5 }),
      el('rect', Object.assign({ rx: 3, fill: '#e6e6e6', stroke: '#a6a6a6', 'stroke-width': 2 }, r)),
    ]), { seat: { x, y } });
  };

  /* floor cushion for tatami rooms */
  P.zabuton = ({ x, y }) =>
    ctl(at(x, y, [el('rect', { x: -19, y: -19, width: 38, height: 38, rx: 8, fill: '#f3efe6', stroke: '#b5a98f', 'stroke-width': 2.5 })]), { seat: { x, y } });

  /* tokonoma alcove with a hanging scroll, drawn along the top wall */
  P.tokonomaTop = ({ x, y, w = 110, d = 34 }) =>
    ctl(at(x, y, [
      el('rect', { x: -w / 2, y: 0, width: w, height: d, fill: '#f5f1e8', stroke: '#b5a98f', 'stroke-width': 2.5 }),
      el('rect', { x: -9, y: 4, width: 18, height: 6, fill: '#b5a98f' }),
      el('circle', { cx: w / 2 - 18, cy: d / 2 + 2, r: 7, fill: '#d6e3c7', stroke: '#9fb48a', 'stroke-width': 2 }),
    ]));

  P.tatamiTop = ({ x, y, w = 260, h = 300 }) => {
    const kids = [el('rect', { x: 0, y: 0, width: w, height: h, fill: '#f4f1e4' })];
    const cols = 2, rows = 3;
    for (let i = 1; i < cols; i++) kids.push(el('line', { x1: (w / cols) * i, y1: 0, x2: (w / cols) * i, y2: h, stroke: '#ddd6bf', 'stroke-width': 2 }));
    for (let j = 1; j < rows; j++) kids.push(el('line', { x1: 0, y1: (h / rows) * j, x2: w, y2: (h / rows) * j, stroke: '#ddd6bf', 'stroke-width': 2 }));
    return ctl(at(x, y, kids));
  };

  /* car from above, front facing up. seats: driver (front-right, Japan), passenger (front-left), rear-left, rear-middle, rear-right */
  P.carTop = ({ x, y, w = 150, h = 280 }) => {
    const kids = [
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 46, fill: C.paper, stroke: '#8a8a8a', 'stroke-width': 3.5 }),
      el('path', { d: `M${-w / 2 + 16} ${-h / 2 + 64} Q0 ${-h / 2 + 46} ${w / 2 - 16} ${-h / 2 + 64}`, fill: 'none', stroke: '#c9c9c9', 'stroke-width': 3 }),
      el('path', { d: `M${-w / 2 + 16} ${h / 2 - 40} Q0 ${h / 2 - 28} ${w / 2 - 16} ${h / 2 - 40}`, fill: 'none', stroke: '#c9c9c9', 'stroke-width': 3 }),
    ];
    const sx = w / 2 - 38;
    const seats = {
      driver: { x: x + sx, y: y - 30 }, passenger: { x: x - sx, y: y - 30 },
      rearRight: { x: x + sx, y: y + 52 }, rearMiddle: { x, y: y + 56 }, rearLeft: { x: x - sx, y: y + 52 },
    };
    for (const k of ['driver', 'passenger', 'rearRight', 'rearLeft']) {
      const s = seats[k];
      kids.push(el('rect', { x: s.x - x - 22, y: s.y - y - 20, width: 44, height: 44, rx: 9, fill: '#f6f6f6', stroke: '#b3b3b3', 'stroke-width': 2.5 }));
    }
    kids.push(el('rect', { x: -16, y: 36, width: 32, height: 40, rx: 7, fill: '#f6f6f6', stroke: '#cdcdcd', 'stroke-width': 2 }));
    kids.push(el('circle', { cx: sx, cy: -64, r: 15, fill: 'none', stroke: '#8a8a8a', 'stroke-width': 3.5 }));
    return ctl(at(x, y, kids), { seats });
  };

  /* train seats from above. kind 'row3' (A window, B middle, C aisle) or 'box4' (facing) */
  P.trainTop = ({ x, y, kind = 'row3', forward = 'up' }) => {
    const kids = [];
    const seats = {};
    const seatRect = (sx, sy, facingUp) => {
      kids.push(el('rect', { x: sx - 22, y: sy - 20, width: 44, height: 40, rx: 8, fill: '#f6f6f6', stroke: '#b3b3b3', 'stroke-width': 2.5 }));
      kids.push(el('rect', { x: sx - 22, y: facingUp ? sy + 14 : sy - 20, width: 44, height: 7, rx: 3, fill: '#dedede' }));
    };
    if (kind === 'row3') {
      ['A', 'B', 'C'].forEach((k, i) => { const sx = -50 + i * 50; seatRect(sx, 0, forward === 'up'); seats[k] = { x: x + sx, y }; });
    } else {
      const pos = { winFwd: [-26, -30, true], aisleFwd: [26, -30, true], winBack: [-26, 30, false], aisleBack: [26, 30, false] };
      if (forward === 'up') { pos.winFwd[1] = -30; pos.winBack[1] = 30; }
      for (const k in pos) { const [sx, sy, up] = pos[k]; seatRect(sx, sy * -1, !up); seats[k] = { x: x + sx, y: y + sy * -1 }; }
      kids.push(el('rect', { x: -60, y: -8, width: 10, height: 16, rx: 2, fill: '#e9e9e9', stroke: '#c9c9c9', 'stroke-width': 1.5 }));
    }
    return ctl(at(x, y, kids), { seats });
  };

  /* elevator car from above: door at the bottom, control panel on one side near the door */
  P.elevatorTop = ({ x, y, w = 200, h = 200, panel = 'left' }) => {
    const kids = [
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: '#f8f8f6', stroke: '#9a9a9a', 'stroke-width': 4 }),
      el('rect', { x: -w / 4, y: h / 2 - 3, width: w / 2, height: 6, fill: '#ffffff' }),
      el('path', { d: `M${-w / 4} ${h / 2} L${-w / 4} ${h / 2 + 10} M${w / 4} ${h / 2} L${w / 4} ${h / 2 + 10}`, stroke: '#9a9a9a', 'stroke-width': 3 }),
    ];
    const px = panel === 'left' ? -w / 2 + 6 : w / 2 - 14;
    kids.push(el('rect', { x: px, y: h / 2 - 66, width: 8, height: 40, rx: 2, fill: '#c9c9c9' }));
    const q = 0.27;
    const spots = {
      backLeft: { x: x - w * q, y: y - h * q }, backRight: { x: x + w * q, y: y - h * q },
      frontLeft: { x: x - w * q, y: y + h * q }, frontRight: { x: x + w * q, y: y + h * q },
    };
    return ctl(at(x, y, kids), { spots, panelSide: panel });
  };

  /* invisible, larger touch target for small things (cards, cups...) */
  P.hitPad = (c, w = 64, h = 52) => {
    const node = c.el || c;
    node.insertBefore(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: 'transparent' }), node.firstChild);
    return c;
  };

  KY.props = P;
})(typeof window !== 'undefined' ? window : globalThis);
