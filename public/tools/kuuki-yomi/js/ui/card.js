/* Manner card (マナー名刺): the learning screen after each stage, also opened from the Card File.
   Card texts are T objects in easy Japanese; dictionary words open the popup. */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;
  const { el } = KY.svg;

  function defaultDiagram(svg) {
    const p = new KY.Person({ x: 100, y: 140, s: 1.05, color: 'npc', bow: 30 });
    svg.append(el('line', { x1: 40, y1: 141, x2: 160, y2: 141, stroke: '#ddd', 'stroke-width': 2 }), p.el);
  }

  /* card.figure: a big labelled picture (kana only inside the SVG) + a numbered legend in easy Japanese */
  function figureHTML(f) {
    const n = it => `<span class="fig-n${it.you ? ' you' : it.top ? ' top' : ''}">${KY.text.esc(String(it.n))}</span>`;
    return `<section class="sec fig"><h3>${UI.L(S.figure)}</h3>
      <div class="fig-svg" id="c-figure"></div>
      ${f.rule ? `<p class="fig-rule">${UI.T(f.rule)}</p>` : ''}
      <ol class="fig-legend">${(f.legend || []).map(it => `<li>${n(it)}<div>${UI.T(it)}</div></li>`).join('')}</ol>
    </section>`;
  }

  /* model answer: the stage replays by itself with its correct input (def.test.great); watch only */
  function openDemo(def) {
    let run = null;
    const m = UI.modal(`
      <div class="demo-head"><h2>${UI.L(S.demoTitle)}</h2><button class="icon-btn" type="button" id="demo-x" aria-label="${KY.text.esc(S.close.en)}">×</button></div>
      <div class="demo-host" id="demo-host"></div>
      <div class="demo-actions"><button class="btn" type="button" id="demo-again">↻ ${UI.L(S.demoAgain)}</button></div>`,
    { cls: 'demo-sheet', onClose: () => { if (run) run.destroy(); run = null; } });
    const host = m.el.querySelector('#demo-host');
    const play = () => {
      if (run) run.destroy();
      try {
        run = KY.run(def, host, {});
        run.scene.demo = true;
        /* the other person's reaction (shown in the verdict when you play) appears as a caption */
        run.scene.on('outcome', key => {
          const o = def.outcomes[key];
          if (o && o.line) run.scene.caption(o.who ? { jp: `${o.who.jp}「${o.line.jp}」`, en: o.line.en } : o.line);
        });
        run.scene.on('end', () => {
          const done = UI.h('div', 'demo-done', `${UI.stampSVG('great', 'mini-stamp')}`);
          host.append(done);
        });
        run.begin();
        run.simulate(def.test.great);
      } catch (e) { console.error(e); }
    };
    m.el.querySelector('#demo-x').onclick = () => m.close();
    m.el.querySelector('#demo-again').onclick = () => { KY.sfx.play('tap'); play(); };
    play();
  }

  UI.card = {
    /* opts: { grade, key, fromPlay, fromBinder } */
    open(id, opts = {}) {
      const def = KY.stage(id);
      if (!def) { UI.map.open(); return; }
      const c = def.card;
      const ch = UI.chapter(def.chapter);
      const B = UI.BADGE[c.badge] || UI.BADGE.must;
      const scr = UI.$('#scr-card');
      const G = opts.grade ? UI.GRADE[opts.grade] : null;
      const nextId = UI.nextStageId(id);
      const last = UI.isLastOfChapter(id);

      scr.innerHTML = `
        <div class="card-top">
          ${G ? `<div class="card-result">${UI.stampSVG(opts.grade, 'mini-stamp')}<span>${UI.L(G.head)}</span></div>` : '<div></div>'}
          ${UI.enBtn()}
        </div>
        <div class="card-wrap">
          <article class="meishi" aria-label="${KY.text.esc(S.mannerCard.en)}">
            <div class="m-left">
              <div class="m-co">${UI.L(S.chapter)} ${def.chapter} ${UI.L(ch.title)}<br>No. ${def.id}</div>
              <div class="m-name">${UI.T(c.name)}</div>
              <div class="m-foot">${UI.L(S.mannerCard)}</div>
            </div>
            <div class="m-right">
              <span class="badge ${c.badge}">${UI.L(B.label)}</span>
              <div class="badge-note">${UI.L(B.note)}</div>
              <div class="m-diagram" id="m-diagram"></div>
            </div>
          </article>
        </div>
        <div class="card-body">
          ${def.test ? `<button class="btn demo-btn" type="button" id="c-demo"><span class="demo-play" aria-hidden="true">▶</span>${UI.L(S.demo)}</button>` : ''}
          <section class="sec"><h3>${UI.L(S.points)}</h3><ul>${c.points.map(p => `<li>${UI.T(p)}</li>`).join('')}</ul></section>
          ${c.figure ? figureHTML(c.figure) : ''}
          <section class="sec"><h3>${UI.L(S.phrase)}</h3>
            <div class="phrase">${UI.T(c.phrase)}<button class="icon-btn speak" type="button" id="c-speak" aria-label="${KY.text.esc(S.listen.en)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8h3l4-3v10l-4-3H4z" fill="currentColor"/><path d="M14 7.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>
          </section>
          <section class="sec"><h3>${UI.L(S.why)}</h3><p>${UI.T(c.why)}</p></section>
          <section class="sec dont"><h3>${UI.L(S.dont)}</h3><p>${UI.T(c.dont)}</p></section>
          ${c.tip ? `<section class="sec tip"><h3>${UI.L(S.tip)}</h3><p>${UI.T(c.tip)}</p></section>` : ''}
        </div>
        <div class="card-actions">
          ${opts.fromBinder
            ? `<button class="btn" type="button" id="c-play">${UI.L(S.play)} ${def.id}</button><button class="btn primary" type="button" id="c-close">${UI.L(S.close)}</button>`
            : `<button class="btn" type="button" id="c-retry">↻ ${UI.L(S.retry)}</button><button class="btn primary" type="button" id="c-next">${UI.L(last ? S.chapterEnd : S.next)} ▶</button>`}
        </div>`;

      const svg = el('svg', { viewBox: '0 0 200 150', 'aria-hidden': 'true' });
      try { (c.diagram || defaultDiagram)(svg); } catch (e) { console.error(e); }
      UI.$('#m-diagram').append(svg);
      if (c.figure) {
        const big = el('svg', { viewBox: c.figure.viewBox || '0 0 320 244', role: 'img', 'aria-label': c.figure.rule ? c.figure.rule.en : '' });
        try { c.figure.draw(big); } catch (e) { console.error(e); }
        UI.$('#c-figure').append(big);
      }
      UI.show('scr-card');

      if (UI.$('#c-demo')) UI.$('#c-demo').onclick = () => openDemo(def);
      UI.$('#c-speak').onclick = () => { if (!KY.sfx.speak(KY.text.kana(c.phrase.jp))) UI.$('#c-speak').disabled = true; };
      if (opts.fromBinder) {
        UI.$('#c-close').onclick = () => UI.binder.open();
        UI.$('#c-play').onclick = () => UI.play.open(def.id);
      } else {
        UI.$('#c-retry').onclick = () => UI.play.open(def.id);
        UI.$('#c-next').onclick = () => {
          UI.play.cleanup();
          if (last) UI.result.open(def.chapter);
          else if (nextId) UI.play.open(nextId);
          else UI.map.open();
        };
      }
    },
  };
})(window);
