/* Chapter result (after the last stage of a chapter) and the final rank ("あなたの役職は…"). */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;
  let finalTimer = null;

  /* ---------- hanko-style red ring behind the rank ---------- */
  let ringN = 0;
  function ringSVG() {
    const id = 'ring' + (++ringN);
    return `<svg class="fn-ring" viewBox="0 0 200 200" aria-hidden="true">
      <defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feComponentTransfer in="n" result="m"><feFuncA type="discrete" tableValues="1 1 1 .4 1 1 1 1 .65 1"/></feComponentTransfer>
        <feComposite in="d" in2="m" operator="in"/>
      </filter></defs>
      <g filter="url(#${id})" fill="none" stroke="#d7261e">
        <circle cx="100" cy="100" r="92" stroke-width="9"/>
        <circle cx="100" cy="100" r="78" stroke-width="3"/>
      </g>
    </svg>`;
  }

  /* first chapter after `n` that already has stages (chapters are added one by one) */
  const nextChapterWithStages = n => KY.CHAPTERS.map(c => c.n).find(k => k > n && KY.stagesOf(k).length) || null;

  /* ---------------------------------------------------------------- chapter result */
  UI.result = {
    open(chapter) {
      const list = KY.stagesOf(chapter);
      const ch = UI.chapter(chapter);
      if (!list.length || !ch) { UI.map.open(); return; }
      const best = KY.store.load().best;
      const pct = KY.scoring.percent(best, list.map(s => s.id));
      const nextCh = nextChapterWithStages(chapter);
      const msg = pct >= 80 ? S.resultHigh : pct >= 50 ? S.resultMid : S.resultLow;
      const tier = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';

      /* stamps per row: one row up to 8 stages, otherwise balanced rows (10 stages = 2 rows of 5) */
      const per = list.length <= 8 ? 8 : Math.ceil(list.length / Math.ceil(list.length / 8));
      const cells = list.map((s, i) => `<li class="rs-cell" style="--i:${i}" title="${s.id}">
        ${best[s.id] ? UI.stampSVG(best[s.id], 'mini-stamp') : '<i class="rs-empty" aria-hidden="true"></i>'}
        <span>${s.id}</span></li>`).join('');

      const scr = UI.$('#scr-result');
      scr.innerHTML = `
        <div class="topbar">
          ${UI.backBtn('r-back')}
          <h1>${UI.T(S.resultHead)}</h1>
          ${UI.enBtn()}
        </div>
        <div class="rs-body">
          <div class="rs-ch">
            <div class="rs-ch-no inl">${UI.L(S.chapter)} ${chapter} · ${ch.time}</div>
            <h2 class="rs-ch-title">${UI.TE(ch.title)}</h2>
          </div>
          <ol class="rs-stamps" style="--per:${per}">${cells}</ol>
          <div class="rs-score">
            <span class="rs-pct" aria-label="${pct}%"><b>${pct}</b>%</span>
            <span class="rs-pct-l">${UI.L(S.score)}</span>
          </div>
          <p class="rs-comment ${tier}">${UI.T(msg)}</p>
        </div>
        <div class="rs-actions">
          ${nextCh
            ? `<button class="btn primary wide" type="button" id="r-next">${UI.L(S.nextChapter)} <span aria-hidden="true">▶</span></button>`
            : `<button class="btn primary wide" type="button" id="r-rank">${UI.L(S.seeRank)} <span aria-hidden="true">▶</span></button>`}
          <div class="row">
            <button class="btn small" type="button" id="r-again">${UI.L(S.retry)}</button>
            <button class="btn small" type="button" id="r-map">${UI.L(S.toChapters)}</button>
          </div>
        </div>`;
      UI.show('scr-result');
      KY.sfx.play(pct >= 50 ? 'great' : 'ok');

      UI.$('#r-back').onclick = () => UI.map.open(chapter);
      UI.$('#r-again').onclick = () => UI.play.open(list[0].id);
      UI.$('#r-map').onclick = () => UI.map.open(chapter);
      const next = UI.$('#r-next');
      if (next) next.onclick = () => { KY.sfx.play('tap'); UI.play.open(KY.stagesOf(nextCh)[0].id); };
      const rank = UI.$('#r-rank');
      if (rank) rank.onclick = () => { KY.sfx.play('tap'); UI.final.open(); };
    },
  };

  /* ---------------------------------------------------------------- final rank */
  UI.final = {
    open() {
      const pr = UI.progress();
      const { s, ids, played, pct, rank } = pr;
      const counts = { great: 0, ok: 0, ky: 0 };
      ids.forEach(id => { if (counts[s.best[id]] !== undefined) counts[s.best[id]]++; });
      const partial = played < ids.length;
      const titleLen = KY.text.plain(rank.title.jp).length;

      const cnt = (g, label) => `<li class="fn-cnt ${g}">${UI.stampSVG(g, 'mini-stamp')}<b>${counts[g]}</b><span>${UI.L(label)}</span></li>`;
      const bars = KY.CHAPTERS.map(ch => {
        const list = KY.stagesOf(ch.n);
        const cp = list.length ? KY.scoring.percent(s.best, list.map(x => x.id)) : 0;
        return `<li class="fn-ch ${list.length ? '' : 'empty'}">
          <div class="fn-ch-top"><span class="fn-ch-no">${ch.n}</span><span class="fn-ch-name">${UI.L(ch.title)}</span>
            <b>${list.length ? cp + '%' : UI.L(S.soon)}</b></div>
          <div class="fn-bar" role="img" aria-label="${cp}%"><i style="width:${cp}%"></i></div>
        </li>`;
      }).join('');

      const scr = UI.$('#scr-final');
      scr.innerHTML = `
        <div class="topbar">
          ${UI.backBtn('f-back')}
          <h1>${UI.L(S.myRank, 'lbl')}</h1>
          <div class="bd-count" aria-label="${played} / ${ids.length}"><b>${played}</b> / ${ids.length}</div>
          ${UI.enBtn()}
        </div>
        <div class="fn-body">
          <p class="fn-lead">${UI.T(S.finalHead)}</p>
          <div class="fn-seal" data-n="${titleLen}">
            ${ringSVG()}
            <div class="fn-rank">${KY.text.html(rank.title, { gloss: false })}</div>
          </div>
          <p class="fn-line">${UI.T(rank.line)}</p>
          <div class="fn-score">
            <span class="rs-pct" aria-label="${pct}%"><b>${pct}</b>%</span>
            <span class="rs-pct-l">${UI.L(S.score)}</span>
          </div>
          ${partial ? `<p class="fn-prov">${UI.T(S.finalProvisional)}</p>` : ''}
          <ul class="fn-counts">${cnt('great', S.cntGreat)}${cnt('ok', S.cntOk)}${cnt('ky', S.cntKy)}</ul>
          <section class="sec fn-chapters"><h3>${UI.L(S.finalByChapter)}</h3><ul>${bars}</ul></section>
        </div>
        <div class="fn-actions">
          <button class="btn primary wide" type="button" id="f-cert">${UI.L(S.makeCert)} <span aria-hidden="true">▶</span></button>
          <div class="row">
            <button class="btn small" type="button" id="f-binder">${UI.L(S.binder)}</button>
            <button class="btn small" type="button" id="f-map">${UI.L(S.toChapters)}</button>
          </div>
        </div>`;
      UI.show('scr-final');

      clearTimeout(finalTimer);
      finalTimer = setTimeout(() => { if (UI.current === 'scr-final') KY.sfx.play('stamp'); }, 1050);

      UI.$('#f-back').onclick = () => UI.map.open();
      UI.$('#f-map').onclick = () => UI.map.open();
      UI.$('#f-binder').onclick = () => UI.binder.open();
      UI.$('#f-cert').onclick = () => { KY.sfx.play('tap'); UI.cert.open(); };
    },
  };
})(window);
