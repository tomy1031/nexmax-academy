/* Chapter map: "a day at a Japanese IT company". */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;

  UI.map = {
    open(openChapter) {
      const scr = UI.$('#scr-map');
      const pr = UI.progress();
      const best = pr.s.best;
      const items = KY.CHAPTERS.map(ch => {
        const list = KY.stagesOf(ch.n);
        const ids = list.map(s => s.id);
        const played = ids.filter(id => best[id]).length;
        const pct = KY.scoring.percent(best, ids);
        const dots = list.map(s => `<i class="${best[s.id] || ''}" title="${s.id}"></i>`).join('');
        const chips = list.map(s => `<button type="button" class="st-chip ${best[s.id] || ''}" data-id="${s.id}">${s.id}<small>${KY.text.ruby(s.title.jp, { gloss: false })}</small></button>`).join('');
        const done = list.length && played === list.length;
        const right = list.length ? (played ? pct + '%' : `${list.length} ${KY.text.ruby(S.stages.jp, { gloss: false })}`) : UI.L(S.soon);
        return `<li class="chapter ${done ? 'done' : ''} ${openChapter === ch.n ? 'open' : ''}" data-ch="${ch.n}">
          <button type="button" class="ch-card" data-ch="${ch.n}">
            <span class="ch-time">${UI.L(S.chapter)} ${ch.n} · ${ch.time}</span>
            <span class="ch-pct">${right}</span>
            <span class="ch-title">${UI.L(ch.title)}</span>
            <span class="dots">${dots}</span>
          </button>
          <div class="ch-stages">${chips}</div>
        </li>`;
      }).join('');

      scr.innerHTML = `
        <div class="topbar">
          ${UI.backBtn('m-back')}
          <h1>${UI.T(S.mapTitle)}</h1>
          <div class="score-pill">${UI.L(S.score)}<b>${pr.pct}%</b>${UI.T(pr.rank.title)}</div>
          ${UI.enBtn()}
        </div>
        <div class="map-body">
          <p class="map-intro">${UI.T(S.mapIntro)}</p>
          <ol class="chapters">${items}</ol>
        </div>
        <div class="map-foot">
          <button class="btn small" id="m-binder" type="button">${UI.L(S.binder)}</button>
          <button class="btn small" id="m-final" type="button" ${pr.played ? '' : 'disabled'}>${UI.L(S.myRank)}</button>
          <button class="btn small" id="m-settings" type="button">${UI.L(S.settings)}</button>
        </div>`;
      UI.show('scr-map');

      scr.querySelectorAll('.ch-card').forEach(b => {
        b.onclick = () => {
          const li = b.parentElement;
          const was = li.classList.contains('open');
          scr.querySelectorAll('.chapter.open').forEach(x => x.classList.remove('open'));
          if (!was) li.classList.add('open');
          KY.sfx.play('tap');
        };
      });
      scr.querySelectorAll('.st-chip').forEach(b => { b.onclick = () => UI.play.open(b.dataset.id); });
      UI.$('#m-back').onclick = () => UI.title.open();
      UI.$('#m-binder').onclick = () => UI.binder.open();
      UI.$('#m-final').onclick = () => UI.final.open();
      UI.$('#m-settings').onclick = () => UI.settings.open();
    },
  };
})(window);
