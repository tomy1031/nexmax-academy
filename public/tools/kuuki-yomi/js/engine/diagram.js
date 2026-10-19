/* Tiny drawing kit for manner-card diagrams (viewBox 0 0 200 150).
   Seat numbers: 1 = top seat. `you: true` marks the player's correct seat in red. */
(function (root) {
  const KY = root.KY;
  const { el, C } = KY.svg;

  const D = {
    /* room outline; door = 'bl' | 'br' | 'tl' | 'tr' | 'b' (bottom centre) */
    room(svg, { x = 30, y = 10, w = 140, h = 124, door = 'bl' } = {}) {
      svg.append(el('rect', { x, y, width: w, height: h, fill: '#fff', stroke: '#c4c4c4', 'stroke-width': 3 }));
      const dw = 30;
      const pos = {
        bl: [x + 10, y + h], br: [x + w - 10 - dw, y + h], b: [x + w / 2 - dw / 2, y + h],
        tl: [x + 10, y], tr: [x + w - 10 - dw, y],
      }[door];
      if (pos) {
        svg.append(el('line', { x1: pos[0], y1: pos[1], x2: pos[0] + dw, y2: pos[1], stroke: '#fff', 'stroke-width': 5 }));
        D.label(svg, pos[0] + dw / 2, pos[1] + (pos[1] === y ? -5 : 12), 'いりぐち');
      }
    },
    seat(svg, x, y, n, { you = false, top = false } = {}) {
      const fill = you ? C.red : top ? C.ink : '#a9a9a9';
      svg.append(el('circle', { cx: x, cy: y, r: 10, fill }));
      const t = el('text', { x, y: y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 900, fill: '#fff' });
      t.textContent = n;
      svg.append(t);
    },
    label(svg, x, y, str, { size = 9, color = '#8a8a8a', anchor = 'middle', weight = 700 } = {}) {
      const t = el('text', { x, y, 'text-anchor': anchor, 'font-size': size, 'font-weight': weight, fill: color });
      t.textContent = str;
      svg.append(t);
      return t;
    },
    rect(svg, x, y, w, h, { r = 6, fill = '#fff', stroke = '#9a9a9a' } = {}) {
      svg.append(el('rect', { x, y, width: w, height: h, rx: r, fill, stroke, 'stroke-width': 2.5 }));
    },
    person(svg, opts) {
      const p = new KY.Person(opts);
      svg.append(p.el);
      return p;
    },
    arrow(svg, x1, y1, x2, y2, { color = C.ink } = {}) {
      const a = Math.atan2(y2 - y1, x2 - x1), L = 6;
      svg.append(el('path', {
        d: `M${x1} ${y1}L${x2} ${y2}M${x2} ${y2}L${x2 - L * Math.cos(a - 0.5)} ${y2 - L * Math.sin(a - 0.5)}M${x2} ${y2}L${x2 - L * Math.cos(a + 0.5)} ${y2 - L * Math.sin(a + 0.5)}`,
        fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linecap': 'round',
      }));
    },
    floor(svg, y = 140) {
      svg.append(el('line', { x1: 10, y1: y, x2: 190, y2: y, stroke: '#dddddd', 'stroke-width': 2 }));
    },

    /* Big labelled picture of a reception room (card.figure, viewBox 0 0 320 244), drawn like the stage:
       door low on the left wall, long sofa at the back, two armchairs by the door side.
       seats: { 1..4: { who, you } }  (1 = sofa far end, 2 = sofa near end, 3 = far armchair, 4 = near armchair)
       sofaNote / chairNote: kana captions under the sofa and the armchairs */
    reception(svg, { seats = {}, sofaNote = '', chairNote = '' } = {}) {
      svg.append(el('rect', { x: 40, y: 6, width: 264, height: 226, fill: '#fff', stroke: '#c4c4c4', 'stroke-width': 4 }));
      /* door: gap in the left wall, swing arc, and an arrow coming in */
      svg.append(
        el('line', { x1: 40, y1: 186, x2: 40, y2: 226, stroke: '#fff', 'stroke-width': 6 }),
        el('path', { d: 'M40 186A40 40 0 0 1 80 226M40 226H80', fill: 'none', stroke: '#c4c4c4', 'stroke-width': 2, 'stroke-dasharray': '4 4' }),
      );
      D.arrow(svg, 4, 210, 32, 210);
      D.label(svg, 20, 199, 'いりぐち', { size: 9, color: C.ink, weight: 900 });

      const box = (x, y, w, h, r) => svg.append(el('rect', { x, y, width: w, height: h, rx: r, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 3 }));
      const back = (x, y, w, h) => svg.append(el('rect', { x, y, width: w, height: h, rx: 4, fill: '#efefef' }));
      /* sofa (backrest at the top) */
      box(110, 16, 180, 58, 12);
      back(114, 20, 172, 10);
      svg.append(el('line', { x1: 200, y1: 36, x2: 200, y2: 68, stroke: '#dadada', 'stroke-width': 2 }));
      D.label(svg, 200, 90, sofaNote, { size: 9.5 });
      /* table */
      svg.append(el('rect', { x: 130, y: 100, width: 140, height: 44, rx: 4, fill: '#fbfaf7', stroke: '#9a9a9a', 'stroke-width': 2.5 }));
      D.label(svg, 200, 126, 'テーブル', { size: 9.5 });
      /* armchairs (backrest at the bottom) */
      [155, 245].forEach(cx => { box(cx - 25, 157, 50, 46, 10); back(cx - 21, 191, 42, 8); });
      D.label(svg, 200, 222, chairNote, { size: 9.5 });

      const pos = { 1: [245, 46], 2: [155, 46], 3: [245, 174], 4: [155, 174] };
      for (const n of [1, 2, 3, 4]) {
        const s = seats[n] || {};
        const [x, y] = pos[n];
        D.seat(svg, x, y, n, { you: !!s.you, top: n === 1 });
        if (s.who) D.label(svg, x, y + 21, s.who, { size: 9, color: s.you ? C.red : '#555', weight: 900 });
      }
    },
  };

  KY.diag = D;
})(typeof window !== 'undefined' ? window : globalThis);
