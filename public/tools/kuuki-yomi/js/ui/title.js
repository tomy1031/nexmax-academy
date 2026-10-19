/* Title screen with a little looping pictogram skit: everyone bows, the red one is late.
   First start shows the guide (これは何？ / どう進める？ / わからない ことばは？). */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;
  let raf = null;

  function art(host) {
    const { el } = KY.svg;
    const svg = el('svg', { viewBox: '0 0 360 230', 'aria-hidden': 'true' });
    svg.append(el('line', { x1: 10, y1: 206, x2: 350, y2: 206, stroke: '#d6d6d6', 'stroke-width': 2 }));
    const xs = [52, 116, 180, 244, 308];
    const people = xs.map((x, i) => new KY.Person({ x, y: 204, s: 1.25, facing: i < 2 ? 1 : -1, color: i === 3 ? 'player' : 'npc' }));
    people.forEach(p => svg.append(p.el));
    host.append(svg);

    const red = people[3];
    const t0 = performance.now();
    const cycle = 4200;
    const curve = (t, a, b) => (t < a ? 0 : t > b ? 1 : (t - a) / (b - a));
    if (raf) root.cancelAnimationFrame(raf);
    function frame(now) {
      if (UI.current !== 'scr-title') { raf = null; return; }
      const t = (now - t0) % cycle;
      const crowd = curve(t, 600, 900) - curve(t, 1900, 2200);
      people.forEach((p, i) => { if (i !== 3) p.set({ bow: 30 * KY.EASE.out(Math.max(0, crowd)) }); });
      const late = curve(t, 1500, 1750) - curve(t, 2700, 3000);
      red.set({ bow: 48 * KY.EASE.out(Math.max(0, late)), nod: t > 2200 && t < 2700 ? 10 : 0 });
      red.mark(t > 1900 && t < 3200 ? 'sweat2' : null);
      raf = root.requestAnimationFrame(frame);
    }
    raf = root.requestAnimationFrame(frame);
  }

  function guide(then) {
    const m = UI.modal(`
      <h2>${UI.T(S.guideTitle)}</h2>
      <div class="guide">
        <section><h3>${UI.T(S.guideWhat)}</h3><p>${UI.T(S.guideWhatBody)}</p></section>
        <section><h3>${UI.T(S.guideHow)}</h3><p>${UI.T(S.guideHowBody)}</p><div class="red-rule"><i></i>${UI.L(S.redRule)}</div></section>
        <section><h3>${UI.T(S.guideWords)}</h3><p>${UI.T(S.guideWordsBody)}</p>
          <p class="guide-try">${UI.L(S.guideExample)} ${KY.text.ruby('{名刺|めいし}')}</p></section>
      </div>
      <button class="btn primary wide" type="button" data-a="ok">${UI.L(S.guideOk)}</button>`, { cls: 'guide-sheet' });
    m.el.querySelector('[data-a=ok]').onclick = () => { KY.store.setFlag('guide'); m.close(); if (then) then(); };
  }

  UI.title = {
    open() {
      const scr = UI.$('#scr-title');
      const pr = UI.progress();
      scr.innerHTML = `
        <div class="title-top">${UI.enBtn()}</div>
        <div class="title-eyebrow">KUUKI YOMI · IT EDITION</div>
        <h1 class="logo" aria-label="空気読み〜IT業界編〜"><span class="big"><ruby>空気<rt>くうき</rt></ruby><ruby>読<rt>よ</rt></ruby>み</span><span class="sub">〜IT<ruby>業界<rt>ぎょうかい</rt></ruby><ruby>編<rt>へん</rt></ruby>〜</span></h1>
        <div class="logo-ro">${UI.T(S.titleSub)}</div>
        <div class="title-art" id="title-art"></div>
        <div class="title-actions">
          <button class="btn primary wide" id="t-start" type="button">${UI.L(pr.played ? S.cont : S.start)} <span aria-hidden="true">▶</span></button>
          ${pr.played === pr.ids.length ? `<button class="btn wide t-cert" id="t-cert" type="button">${UI.stampSVG('great', 'mini-stamp')}${UI.L(S.makeCert)}</button>` : ''}
          <div class="row">
            <button class="btn small" id="t-binder" type="button">${UI.L(S.binder)}</button>
            <button class="btn small" id="t-howto" type="button">${UI.L(S.howto)}</button>
            <button class="btn small" id="t-settings" type="button">${UI.L(S.settings)}</button>
          </div>
        </div>
        <div class="red-rule"><i></i>${UI.L(S.redRule)}</div>
        <div class="title-progress">${pr.played ? `${pr.played} / ${pr.ids.length} · ${KY.text.ruby(S.score.jp, { gloss: false })} ${pr.pct}%` : UI.L(S.titleFoot)}</div>
      `;
      UI.show('scr-title');
      art(UI.$('#title-art'));
      UI.$('#t-start').onclick = () => {
        KY.sfx.play('tap');
        if (KY.store.load().flags.guide) UI.map.open();
        else guide(() => UI.map.open());
      };
      UI.$('#t-binder').onclick = () => UI.binder.open();
      if (UI.$('#t-cert')) UI.$('#t-cert').onclick = () => { KY.sfx.play('tap'); UI.cert.open({ from: 'title' }); };
      UI.$('#t-howto').onclick = () => guide();
      UI.$('#t-settings').onclick = () => UI.settings.open();
    },
    guide,
  };
})(window);
