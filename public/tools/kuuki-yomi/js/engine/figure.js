/* Pictogram people.
   KY.Person — side or front view, feet at (x, y). Drawn facing right, mirrored by `facing`.
   KY.TopPerson — seen from above (seat maps). */
(function (root) {
  const KY = root.KY;
  const { el, g, set, C, deg } = KY.svg;

  const COLORS = { npc: C.npc, npc2: C.npc2, player: C.red, ghost: '#d6d6d6' };
  const colorOf = c => COLORS[c] || c;

  const THIGH = 23, SHIN = 23, UPPER = 18, FORE = 17;
  const HEAD_R = 11.5;

  const POSES = {
    stand: { hip: -46, legs: { f: [4, 0], b: [-4, 0] }, arms: { f: [8, 0], b: [-6, 0] } },
    sit: { hip: -25, legs: { f: [88, -88], b: [84, -84] }, arms: { f: [24, 46], b: [18, 46] } },
    /* 土下座: kneeling, use with bow ≈ 88 */
    dogeza: { hip: -15, hx: -8, legs: { f: [64, -154], b: [60, -150] }, arms: { f: [125, 53], b: [120, 55] } },
    walk: { hip: -46 },
  };

  const pt = (p, a, len) => [p[0] + Math.sin(deg(a)) * len, p[1] + Math.cos(deg(a)) * len];
  const rot = (p, c, a) => {
    const r = deg(a), dx = p[0] - c[0], dy = p[1] - c[1];
    return [c[0] + dx * Math.cos(r) - dy * Math.sin(r), c[1] + dx * Math.sin(r) + dy * Math.cos(r)];
  };
  const d3 = (a, b, c) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}L${c[0].toFixed(1)} ${c[1].toFixed(1)}`;

  /* ---------- marks (emotion symbols), drawn around a point above the head ---------- */
  function drawMark(name) {
    const m = g({ class: 'mark mark-' + name });
    if (name === 'sweat') {
      m.append(el('path', { d: 'M16 -6 q5 8 0 11 q-5 -3 0 -11z', fill: C.water }));
    } else if (name === 'sweat2') {
      m.append(el('path', { d: 'M16 -8 q5 8 0 11 q-5 -3 0 -11z', fill: C.water }),
        el('path', { d: 'M-17 -2 q4 6 0 9 q-4 -3 0 -9z', fill: C.water }));
    } else if (name === 'anger') {
      const s = { fill: 'none', stroke: C.ink, 'stroke-width': 2.4, 'stroke-linecap': 'round' };
      m.append(el('path', Object.assign({ d: 'M14 -20 q4 4 0 8 M24 -20 q-4 4 0 8 M13 -9 q5 -4 10 0 M13 -23 q5 4 10 0' }, s)));
    } else if (name === 'sparkle') {
      const star = (x, y, r) => el('path', { d: `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z`, fill: C.gold });
      m.append(star(-18, -10, 6), star(18, -16, 8), star(6, -30, 5));
    } else if (name === 'dots') {
      for (let i = 0; i < 3; i++) m.append(el('circle', { cx: -8 + i * 8, cy: -14, r: 2.2, fill: C.ink }));
    } else if (name === 'q' || name === 'ex') {
      const t = el('text', { x: 16, y: -8, 'font-size': 20, 'font-weight': 900, fill: C.ink, 'text-anchor': 'middle', 'font-family': 'inherit' });
      t.textContent = name === 'q' ? '?' : '!';
      m.append(t);
    } else if (name === 'shock') {
      const s = { stroke: C.ink, 'stroke-width': 2.2, 'stroke-linecap': 'round' };
      m.append(el('path', Object.assign({ d: 'M-16 -6 l-6 -6 M0 -14 v-9 M16 -6 l6 -6' }, s)));
    } else if (name === 'heart') {
      m.append(el('path', { d: 'M18 -6 c-6 -5 -9 -9 -6 -12 c2 -2 5 -1 6 1 c1 -2 4 -3 6 -1 c3 3 0 7 -6 12z', fill: '#ef8aa0' }));
    } else if (name === 'zzz') {
      const t = el('text', { x: 14, y: -10, 'font-size': 13, 'font-weight': 700, fill: C.npc2 });
      t.textContent = 'z z';
      m.append(t);
    }
    return m;
  }

  /* ======================= side / front view person ======================= */
  class Person {
    constructor(opts) {
      this.o = Object.assign({
        x: 0, y: 0, s: 1, facing: 1, color: 'npc', pose: 'stand', view: 'side',
        bow: 0, nod: 0, walk: 0, arms: null, legs: null, mark: null, hidden: false,
      }, opts);
      this.el = g({ class: 'person' });
      this.body = g();
      this.over = g({ class: 'person-over' });
      this.el.append(this.body, this.over);
      const limb = cls => el('path', { class: cls, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      this.p = {
        armB: limb('armB'), legB: limb('legB'), legFo: limb('legFo'), legF: limb('legF'),
        up: g(), torso: el('line', { 'stroke-linecap': 'round' }),
        head: el('ellipse'), armFo: limb('armFo'), armF: limb('armF'),
      };
      const p = this.p;
      p.up.append(p.armB, p.torso, p.head, p.armFo, p.armF);
      this.body.append(p.legB, p.legFo, p.legF, p.up);
      this.render();
    }

    get color() { return colorOf(this.o.color); }

    set(patch) { Object.assign(this.o, patch); this.render(); return this; }
    moveTo(x, y) { this.o.x = x; if (y !== undefined) this.o.y = y; this.render(); return this; }

    pose() {
      const o = this.o;
      const base = POSES[o.pose] || POSES.stand;
      let legs = base.legs, arms = base.arms;
      if (o.pose === 'walk') {
        const w = Math.sin(o.walk);
        legs = { f: [26 * w, w < 0 ? 26 * -w : 4], b: [-26 * w, w > 0 ? 26 * w : 4] };
        arms = { f: [-20 * w, 10], b: [20 * w, 10] };
      }
      return { hip: base.hip, hx: base.hx || 0, legs: o.legs || legs, arms: o.arms || arms };
    }

    render() {
      const o = this.o, p = this.p, col = this.color;
      set(this.el, { transform: `translate(${o.x} ${o.y})`, opacity: o.hidden ? 0 : null });
      set(this.body, { transform: `scale(${o.s * o.facing} ${o.s})` });
      if (o.view === 'front') this.renderFront(col); else this.renderSide(col);
      const outline = { stroke: '#fff' };
      for (const k of ['armB', 'legB', 'legF', 'armF']) set(p[k], { stroke: col });
      set(p.armFo, Object.assign({ 'stroke-width': 13 }, outline));
      set(p.legFo, Object.assign({ 'stroke-width': 14 }, outline));
      set(p.armB, { 'stroke-width': 8 }); set(p.armF, { 'stroke-width': 8 });
      set(p.legB, { 'stroke-width': 10 }); set(p.legF, { 'stroke-width': 10 });
      set(p.head, { fill: col });
      set(p.torso, { stroke: col });
      this.renderOver();
    }

    renderSide() {
      const p = this.p, ps = this.pose(), hip = ps.hip, hx = ps.hx, H = [hx, hip];
      const kF = pt(H, ps.legs.f[0], THIGH), fF = pt(kF, ps.legs.f[0] + ps.legs.f[1], SHIN);
      const kB = pt(H, ps.legs.b[0], THIGH), fB = pt(kB, ps.legs.b[0] + ps.legs.b[1], SHIN);
      set(p.legF, { d: d3(H, kF, fF) }); set(p.legFo, { d: d3(pt(H, ps.legs.f[0], 9), kF, fF) });
      set(p.legB, { d: d3(H, kB, fB) });
      set(p.up, { transform: `rotate(${this.o.bow} ${hx} ${hip})` });
      set(p.torso, { x1: hx, y1: hip - 4, x2: hx, y2: hip - 30, 'stroke-width': 22 });
      const neck = [hx, hip - 44];
      const hc = rot([hx, hip - 56.5], neck, this.o.nod);
      set(p.head, { cx: hc[0], cy: hc[1], rx: HEAD_R, ry: HEAD_R });
      const S = [hx, hip - 34];
      const eF = pt(S, ps.arms.f[0], UPPER), hF = pt(eF, ps.arms.f[0] + ps.arms.f[1], FORE);
      const eB = pt(S, ps.arms.b[0], UPPER), hB = pt(eB, ps.arms.b[0] + ps.arms.b[1], FORE);
      set(p.armF, { d: d3(S, eF, hF) }); set(p.armFo, { d: d3(pt(S, ps.arms.f[0], 7), eF, hF) });
      set(p.armB, { d: d3(S, eB, hB) });
      this._local = { hip, hx, head: hc, handF: hF, handB: hB };
    }

    renderFront() {
      const p = this.p, o = this.o;
      const hip = o.pose === 'sit' ? -25 : -46;
      const spread = o.pose === 'sit' ? 12 : 8;
      set(p.legF, { d: d3([4, hip], [6, hip / 2], [spread, 0]) });
      set(p.legB, { d: d3([-4, hip], [-6, hip / 2], [-spread, 0]) });
      set(p.legFo, { d: '' });
      const c = Math.cos(deg(o.bow));
      set(p.up, { transform: `translate(0 ${hip}) scale(1 ${c.toFixed(3)}) translate(0 ${-hip})` });
      set(p.torso, { x1: 0, y1: hip - 4, x2: 0, y2: hip - 30, 'stroke-width': 24 });
      const a = o.arms || { f: [12, 0], b: [12, 0] };
      const SR = [10, hip - 32], SL = [-10, hip - 32];
      const side = (S, ang, dir) => {
        const e = [S[0] + dir * Math.sin(deg(ang[0])) * UPPER, S[1] + Math.cos(deg(ang[0])) * UPPER];
        const h = [e[0] + dir * Math.sin(deg(ang[0] + ang[1])) * FORE, e[1] + Math.cos(deg(ang[0] + ang[1])) * FORE];
        return [e, h];
      };
      const [eR, hR] = side(SR, a.f, 1), [eL, hL] = side(SL, a.b, -1);
      set(p.armF, { d: d3(SR, eR, hR) }); set(p.armB, { d: d3(SL, eL, hL) });
      set(p.armFo, { d: d3([SR[0] + 2, SR[1] + 6], eR, hR) });
      const nodDrop = o.nod * 0.16;
      const headY = hip - 56.5 * 1 + nodDrop;
      set(p.head, { cx: 0, cy: headY, rx: HEAD_R, ry: HEAD_R * (1 - o.nod * 0.004) });
      this._local = { hip, head: [0, headY], handF: hR, handB: hL, frontScale: c };
    }

    /* local → world (applies bow rotation for upper-body points) */
    world(local, upper = true) {
      const o = this.o, L = this._local;
      let q = local;
      if (upper && o.view !== 'front') q = rot(local, [L.hx || 0, L.hip], o.bow);
      if (upper && o.view === 'front') q = [local[0], L.hip + (local[1] - L.hip) * L.frontScale];
      return { x: o.x + q[0] * o.s * o.facing, y: o.y + q[1] * o.s };
    }

    head() { return this.world(this._local.head); }
    hand(which = 'f') { return this.world(which === 'f' ? this._local.handF : this._local.handB); }
    /* point just above the head, used for tags, marks and speech bubbles */
    anchor() { const h = this.head(); return { x: h.x, y: h.y - (HEAD_R + 6) * this.o.s }; }

    mark(name) { this.o.mark = name; this.renderOver(); return this; }

    renderOver() {
      const o = this.o;
      if (this._markName !== o.mark) {
        this.over.textContent = '';
        if (o.mark) this.over.append(drawMark(o.mark));
        this._markName = o.mark;
      }
      if (!this._local) return;
      const h = this.head();
      set(this.over, { transform: `translate(${h.x - o.x} ${h.y - o.y}) scale(${o.s})` });
    }
  }

  /* ======================= top-down person (seat maps) ======================= */
  class TopPerson {
    constructor(opts) {
      this.o = Object.assign({ x: 0, y: 0, s: 1, dir: 180, color: 'npc', mark: null, hidden: false }, opts);
      this.el = g({ class: 'person top' });
      this.body = g();
      this.over = g({ class: 'person-over' });
      this.shoulders = el('rect', { x: -18, y: -7.5, width: 36, height: 15, rx: 7.5 });
      this.headEl = el('circle', { r: 10.5, stroke: '#fff', 'stroke-width': 2.5 });
      this.body.append(this.shoulders, this.headEl);
      this.el.append(this.body, this.over);
      this.render();
    }
    get color() { return colorOf(this.o.color); }
    set(patch) { Object.assign(this.o, patch); this.render(); return this; }
    moveTo(x, y) { this.o.x = x; this.o.y = y; this.render(); return this; }
    render() {
      const o = this.o, col = this.color;
      set(this.el, { transform: `translate(${o.x} ${o.y})`, opacity: o.hidden ? 0 : null });
      set(this.body, { transform: `scale(${o.s}) rotate(${o.dir})` });
      set(this.shoulders, { fill: col });
      set(this.headEl, { fill: col, cx: 0, cy: -2.5 });
      if (this._markName !== o.mark) {
        this.over.textContent = '';
        if (o.mark) this.over.append(drawMark(o.mark));
        this._markName = o.mark;
      }
      set(this.over, { transform: `translate(0 ${-14 * o.s}) scale(${o.s * 0.9})` });
    }
    head() { return { x: this.o.x, y: this.o.y }; }
    anchor() { return { x: this.o.x, y: this.o.y - 18 * this.o.s }; }
    mark(name) { this.o.mark = name; this.render(); return this; }
  }

  KY.Person = Person;
  KY.TopPerson = TopPerson;
  KY.drawMark = drawMark;
  KY.figColor = colorOf;
})(typeof window !== 'undefined' ? window : globalThis);
