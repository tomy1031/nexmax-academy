/* Scene runtime: one SVG (360×640 logical) + an HTML overlay for text.
   Owns the clock (pause-aware, can be stepped manually for tests), a scheduler,
   tweens, pointer input on SVG nodes, speech bubbles, tags and the end of a stage. */
(function (root) {
  const KY = root.KY;
  const { el, g, set } = KY.svg;
  const W = 360, H = 640;

  const EASE = {
    linear: t => t,
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    inout: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };

  const div = (cls, html) => { const d = root.document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; return d; };

  class Scene {
    constructor(host, opts = {}) {
      this.host = host;
      this.timeScale = opts.timeScale || 1;
      this.manual = !!opts.manual;
      this.t = 0;
      this.started = false; this.paused = false; this.ended = false; this.destroyed = false;
      this.locked = true;
      this.jobs = []; this.frames = new Set(); this.ev = {}; this.flags = {};
      this.people = []; this.overlays = [];
      this.view = { x: 0, y: 0, w: W, h: H };

      host.textContent = '';
      this.root = div('scene');
      this.svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'scene-svg', preserveAspectRatio: 'xMidYMid meet' });
      this.layer = { bg: g({ class: 'l-bg' }), mid: g({ class: 'l-mid' }), fg: g({ class: 'l-fg' }), top: g({ class: 'l-top' }) };
      this.svg.append(this.layer.bg, this.layer.mid, this.layer.fg, this.layer.top);
      this.overlay = div('scene-overlay');
      this.root.append(this.svg, this.overlay);
      host.append(this.root);

      this._loop = this._loop.bind(this);
      if (root.ResizeObserver) {
        this._ro = new root.ResizeObserver(() => this.relayout());
        this._ro.observe(this.overlay);
      }
    }

    /* ---------------- events ---------------- */
    on(name, fn) { (this.ev[name] || (this.ev[name] = [])).push(fn); return this; }
    emit(name, ...a) { for (const fn of this.ev[name] || []) { try { fn(...a); } catch (e) { console.error(e); } } }

    /* ---------------- clock ---------------- */
    start() {
      if (this.started) return;
      this.started = true;
      this.locked = false;
      if (!this.manual) { this._last = null; this._raf = root.requestAnimationFrame(this._loop); }
    }
    _loop(now) {
      if (this.destroyed) return;
      if (this._last == null) this._last = now;
      const raw = Math.min(64, now - this._last);
      this._last = now;
      if (!this.paused) this.step(raw * this.timeScale);
      this._raf = root.requestAnimationFrame(this._loop);
    }
    step(dt) {
      this.t += dt;
      while (this.jobs.length && this.jobs[0].at <= this.t) {
        const j = this.jobs.shift();
        try { j.fn(); } catch (e) { console.error(e); }
      }
      for (const f of Array.from(this.frames)) {
        try { f(dt, this.t); } catch (e) { console.error(e); this.frames.delete(f); }
      }
      this.emit('tick', this.t);
    }
    /* manual stepping (tests): advance `ms` of scene time in small steps */
    advance(ms, stepMs = 16) {
      let left = ms;
      while (left > 0 && !this.destroyed) { const d = Math.min(stepMs, left); this.step(d); left -= d; }
    }
    pause() { this.paused = true; this.locked = true; }
    resume() { this.paused = false; this.locked = this.ended || !this.started; this._last = null; }

    at(ms, fn) {
      const job = { at: ms, fn };
      let i = this.jobs.length;
      while (i > 0 && this.jobs[i - 1].at > ms) i--;
      this.jobs.splice(i, 0, job);
      return () => { const k = this.jobs.indexOf(job); if (k >= 0) this.jobs.splice(k, 1); };
    }
    after(ms, fn) { return this.at(this.t + ms, fn); }
    every(fn) { this.frames.add(fn); return () => this.frames.delete(fn); }

    tween({ from = 0, to = 1, dur = 300, ease = 'out', step, done }) {
      const t0 = this.t, E = typeof ease === 'function' ? ease : EASE[ease] || EASE.out;
      step(from);
      const f = (dt, t) => {
        const k = dur <= 0 ? 1 : Math.min(1, (t - t0) / dur);
        step(from + (to - from) * E(k));
        if (k >= 1) { this.frames.delete(f); if (done) done(); }
      };
      this.frames.add(f);
      return () => this.frames.delete(f);
    }

    flag(name) { if (this.flags[name] === undefined) this.flags[name] = this.t; return this.flags[name]; }

    timer(ms, onTimeout) {
      const t0 = this.t;
      this.timeLimit = ms;
      const f = (dt, t) => {
        if (this.ended) { this.frames.delete(f); return; }
        const k = Math.min(1, (t - t0) / ms);
        this.emit('timer', k);
        if (k >= 1) { this.frames.delete(f); onTimeout(); }
      };
      this.frames.add(f);
      return () => this.frames.delete(f);
    }

    end(key) {
      if (this.ended) return false;
      this.ended = true;
      this.locked = true;
      this.endKey = key;
      this.emit('outcome', key);
      this.after(this.reactMs || 1100, () => this.emit('end', key));
      return true;
    }

    destroy() {
      this.destroyed = true;
      if (this._raf) root.cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      this.frames.clear(); this.jobs = []; this.ev = {};
      this.host.textContent = '';
    }

    /* ---------------- camera ----------------
       camera({ zoom: 1.25, x: 180, y: 400 }) shows the scene zoomed in, centred on (x, y).
       All coordinates stay in scene units; bubbles and tags follow automatically. */
    camera({ zoom = 1, x = W / 2, y = H / 2 } = {}) {
      const w = W / zoom, h = H / zoom;
      this.view = { x: x - w / 2, y: y - h / 2, w, h };
      set(this.svg, { viewBox: `${this.view.x} ${this.view.y} ${w} ${h}` });
      this.relayout();
      return this;
    }

    /* remove every drawing, person, bubble and tag (e.g. to switch to another view mid-stage) */
    clear() {
      for (const k in this.layer) this.layer[k].textContent = '';
      for (const it of this.overlays.slice()) this.removeOverlay(it.node);
      this.overlay.textContent = '';
      this.people = [];
      this.camera();
      return this;
    }

    /* ---------------- drawing helpers ---------------- */
    add(layer, node) { this.layer[layer || 'mid'].append(node.el || node); return node; }

    person(opts = {}) {
      const p = opts.top ? new KY.TopPerson(opts) : new KY.Person(opts);
      p.player = !!opts.player;
      this.add(opts.layer || 'mid', p.el);
      this.people.push(p);
      if (opts.tag) p.tagEl = this.tag(p, opts.tag, { player: p.player });
      return p;
    }

    /* walk a side-view person to x over dur ms */
    walk(p, toX, dur = 1200, done) {
      const from = p.o.x;
      if (toX !== from) p.set({ facing: toX > from ? 1 : -1 });
      p.set({ pose: 'walk' });
      return this.tween({
        from, to: toX, dur, ease: 'linear',
        step: v => p.set({ x: v, walk: (v - from) / 9 }),
        done: () => { p.set({ pose: 'stand', walk: 0 }); if (done) done(); },
      });
    }

    /* move any controller with moveTo(x,y) along a straight line */
    glide(obj, to, dur = 500, ease = 'inout', done) {
      const fx = obj.o ? obj.o.x : obj.x, fy = obj.o ? obj.o.y : obj.y;
      return this.tween({ from: 0, to: 1, dur, ease, step: k => obj.moveTo(fx + (to.x - fx) * k, fy + (to.y - fy) * k), done });
    }

    /* ---------------- input ---------------- */
    toPoint(cx, cy) {
      const m = this.svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const p = this.svg.createSVGPoint();
      p.x = cx; p.y = cy;
      const q = p.matrixTransform(m.inverse());
      return { x: q.x, y: q.y };
    }

    _hit(node, label) {
      const n = node.el || node;
      n.classList.add('hit');
      set(n, { tabindex: 0, role: 'button', 'aria-label': label || 'red object' });
      n.style.touchAction = 'none';
      return n;
    }

    onTap(node, fn, label) {
      const n = this._hit(node, label);
      n.addEventListener('pointerdown', e => {
        if (this.locked) return;
        e.preventDefault();
        fn(e);
      });
      n.addEventListener('keydown', e => {
        if (this.locked || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        fn(e);
      });
      return n;
    }

    onHold(node, h, label) {
      const n = this._hit(node, label);
      let down = false;
      const release = () => { if (!down) return; down = false; n.classList.remove('pressed'); if (h.up) h.up(); };
      n.addEventListener('pointerdown', e => {
        if (this.locked || down) return;
        e.preventDefault();
        try { n.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        down = true; n.classList.add('pressed');
        if (h.down) h.down();
      });
      n.addEventListener('pointerup', release);
      n.addEventListener('pointercancel', release);
      n.addEventListener('lostpointercapture', release);
      n.addEventListener('keydown', e => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (this.locked || down || e.repeat) return;
        down = true; n.classList.add('pressed');
        if (h.down) h.down();
      });
      n.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') release(); });
      return n;
    }

    onDrag(node, h, label) {
      const n = this._hit(node, label);
      let active = false;
      n.addEventListener('pointerdown', e => {
        if (this.locked) return;
        e.preventDefault();
        try { n.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        active = true; n.classList.add('dragging');
        if (h.start) h.start(this.toPoint(e.clientX, e.clientY));
      });
      n.addEventListener('pointermove', e => {
        if (!active) return;
        if (this.locked) { active = false; n.classList.remove('dragging'); return; }
        if (h.move) h.move(this.toPoint(e.clientX, e.clientY));
      });
      const up = e => {
        if (!active) return;
        active = false; n.classList.remove('dragging');
        if (!this.locked && h.end) h.end(this.toPoint(e.clientX, e.clientY));
      };
      n.addEventListener('pointerup', up);
      n.addEventListener('pointercancel', up);
      return n;
    }

    /* ---------------- HTML overlay: bubbles, tags, labels ---------------- */
    _layoutItem(item) {
      const { node, x, y, mode } = item;
      const ow = this.overlay.clientWidth, oh = this.overlay.clientHeight;
      if (!ow) return;
      const V = this.view;
      const px = ((x - V.x) / V.w) * ow, py = ((y - V.y) / V.h) * oh;
      const w = node.offsetWidth, h = node.offsetHeight;
      const pad = ow * 0.02;
      let left = px - w / 2, top;
      if (mode === 'left') left = px + ow * 0.03;
      if (mode === 'right') left = px - w - ow * 0.03;
      left = Math.max(pad, Math.min(ow - w - pad, left));
      if (mode === 'up') top = py + oh * 0.018;
      else if (mode === 'center' || mode === 'left' || mode === 'right') top = py - h / 2;
      else top = py - h - oh * 0.018;
      top = Math.max(pad, Math.min(oh - h - pad, top));
      node.style.left = left + 'px';
      node.style.top = top + 'px';
      node.style.setProperty('--tx', (px - left) + 'px');
    }

    _track(node, x, y, mode, follow) {
      const item = { node, x, y, mode, follow };
      this.overlays.push(item);
      this.overlay.append(node);
      this._layoutItem(item);
      if (follow) {
        item.stop = this.every(() => {
          const a = follow();
          if (a.x !== item.x || a.y !== item.y) { item.x = a.x; item.y = a.y; this._layoutItem(item); }
        });
      }
      return item;
    }

    relayout() { for (const it of this.overlays) if (it.node.isConnected) this._layoutItem(it); }

    removeOverlay(node) {
      const i = this.overlays.findIndex(o => o.node === node);
      if (i >= 0) { const it = this.overlays[i]; if (it.stop) it.stop(); this.overlays.splice(i, 1); }
      node.remove();
    }

    /* speech bubble. x,y = point the tail touches (scene coords) */
    bubble({ x, y, text, who = null, kind = 'say', tail = 'down', dur = 0, cls = '' }) {
      const node = div(`bubble ${kind} tail-${tail} ${cls}`.trim());
      node.innerHTML = (who ? `<div class="who">${KY.text.html(who, { gloss: false, follow: true })}</div>` : '') +
        `<div class="body">${KY.text.html(text, { gloss: false, follow: true })}</div><i class="tail"></i>`;
      const mode = tail === 'up' ? 'up' : tail === 'left' ? 'left' : tail === 'right' ? 'right' : tail === 'none' ? 'center' : 'down';
      this._track(node, x, y, mode);
      node.classList.add('in');
      if (dur) this.after(dur, () => this.removeOverlay(node));
      return node;
    }

    /* a person speaks: bubble above their head */
    say(person, text, opts = {}) {
      const a = person.anchor();
      return this.bubble(Object.assign({ x: a.x, y: a.y - (opts.lift || 4), text }, opts));
    }

    /* role tag that follows a person, e.g. {jp:'{部長|ぶちょう}', en:'Director'} */
    tag(person, text, opts = {}) {
      const node = div('tag' + (opts.player ? ' player' : ''));
      node.innerHTML = KY.text.html(text, { gloss: false, follow: 'below' });
      const a = person.anchor();
      const it = this._track(node, a.x, a.y - 2, 'down', () => { const b = person.anchor(); return { x: b.x, y: b.y - 2 }; });
      return it.node;
    }

    /* small static label (e.g. "入口 / Door") */
    label(x, y, text, cls = '') {
      const node = div('label ' + cls);
      node.innerHTML = KY.text.html(text, { gloss: false, follow: 'below' });
      this._track(node, x, y, 'center');
      return node;
    }

    /* narration strip at the bottom */
    caption(text) {
      const node = div('caption');
      node.innerHTML = KY.text.html(text, { gloss: false, follow: true });
      this.overlay.append(node);
      return node;
    }

    /* show a big stamp-like popup in the scene (e.g. "乾杯！") */
    pop(x, y, text, cls = '') {
      const node = div('pop ' + cls);
      node.innerHTML = KY.text.html(text, { gloss: false, follow: 'below' });
      this._track(node, x, y, 'center');
      this.after(1400, () => this.removeOverlay(node));
      return node;
    }
  }

  function defaultReact(scene, grade) {
    const mark = grade === 'great' ? 'sparkle' : grade === 'ok' ? 'sweat' : 'dots';
    for (const p of scene.people) if (!p.player) p.mark(mark);
  }

  /* Build a playable run of a stage definition. */
  KY.run = function (def, host, opts = {}) {
    const scene = new Scene(host, opts);
    scene.def = def;
    const refs = def.setup(scene) || {};
    scene.refs = refs;
    const mech = def.mechanic === 'action'
      ? { start: (s, d, r) => d.params.start(s, r), simulate: (s, d, r, i) => d.params.simulate(s, r, i) }
      : KY.mech[def.mechanic];
    if (!mech) throw new Error('Unknown mechanic ' + def.mechanic);
    scene.on('outcome', key => {
      const o = def.outcomes[key];
      if (!o) { console.error('Unknown outcome', key, 'in', def.id); return; }
      try { if (o.react) o.react(scene, refs); else defaultReact(scene, o.grade); } catch (e) { console.error(e); }
    });
    return {
      scene, refs, def,
      begin() { scene.start(); mech.start(scene, def, refs); },
      simulate(input) { mech.simulate(scene, def, refs, input); },
      destroy() { scene.destroy(); },
    };
  };

  KY.Scene = Scene;
  KY.EASE = EASE;
  KY.SCENE_W = W; KY.SCENE_H = H;
})(typeof window !== 'undefined' ? window : globalThis);
