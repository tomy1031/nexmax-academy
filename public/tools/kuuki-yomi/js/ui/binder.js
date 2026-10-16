/* Card File (名刺ファイル): every manner card you have earned, as little business cards.
   Played stages = white card with the badge stripe + grade stamp. Not played = face-down "？". */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;

  const FILTERS = [
    { id: 'all', label: S.fAll },
    { id: 'must', label: S.badge.must.label },
    { id: 'depends', label: S.badge.depends.label },
    { id: 'myth', label: S.badge.myth.label },
  ];
  /* remembered while you jump into a card and come back */
  const keep = { filter: 'all', scroll: 0, from: 'scr-map' };

  function playedCard(def, grade) {
    const badge = UI.BADGE[def.card.badge] || UI.BADGE.must;
    const label = `${def.id} ${KY.text.plain(def.card.name.jp)} (${badge.label.en})`;
    return `<button type="button" class="bd-card ${def.card.badge}" data-id="${def.id}" aria-label="${KY.text.esc(label)}">
      <span class="bd-no">${def.id}</span>
      <span class="bd-name">${UI.L(def.card.name, 'bd-t')}</span>
      <span class="bd-fig" data-fig="${def.id}" aria-hidden="true"></span>
      ${UI.stampSVG(grade, 'mini-stamp')}
    </button>`;
  }

  /* the card's own little picture (same as on the manner card), drawn small */
  function drawFigures(scope) {
    scope.querySelectorAll('.bd-fig[data-fig]').forEach(slot => {
      const def = KY.stage(slot.dataset.fig);
      if (!def || !def.card.diagram) { slot.remove(); return; }
      const svg = KY.svg.el('svg', { viewBox: '0 0 200 150', 'aria-hidden': 'true' });
      try { def.card.diagram(svg); slot.append(svg); } catch (e) { console.error(e); slot.remove(); }
    });
  }

  const hiddenCard = def => `<div class="bd-card back" role="img" aria-label="${def.id} · ${KY.text.esc(S.notPlayed.en)}">
      <span class="bd-no">${def.id}</span><span class="bd-q" aria-hidden="true">?</span>
    </div>`;

  UI.binder = {
    open() {
      const scr = UI.$('#scr-binder');
      const fresh = UI.current !== 'scr-card';
      if (fresh) { keep.filter = 'all'; keep.scroll = 0; keep.from = UI.current === 'scr-title' ? 'scr-title' : 'scr-map'; }
      const best = KY.store.load().best;
      const total = KY.stages.length;
      const have = KY.stages.filter(s => best[s.id]).length;

      const render = () => {
        const f = keep.filter;
        const sections = KY.CHAPTERS.map(ch => {
          const list = KY.stagesOf(ch.n);
          if (!list.length) return '';
          const got = list.filter(s => best[s.id]).length;
          /* a badge filter shows only cards you already own (face-down cards must not give away the type) */
          const shown = list.filter(s => f === 'all' ? true : (best[s.id] && s.card.badge === f));
          if (!shown.length) return '';
          return `<section class="bd-ch" aria-label="${KY.text.esc(ch.title.en)}">
            <h2 class="bd-ch-h"><span class="inl">${UI.L(S.chapter)} ${ch.n}</span><b>${UI.L(ch.title)}</b><em>${got} / ${list.length}</em></h2>
            <div class="bd-grid">${shown.map(s => best[s.id] ? playedCard(s, best[s.id]) : hiddenCard(s)).join('')}</div>
          </section>`;
        }).join('');
        UI.$('#bd-list').innerHTML = sections || `<p class="bd-none">${UI.T(S.binderNone)}</p>`;
        drawFigures(UI.$('#bd-list'));
        scr.querySelectorAll('.bd-chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.f === f)));
        scr.querySelectorAll('button.bd-card').forEach(b => {
          b.onclick = () => {
            keep.scroll = scr.scrollTop;
            KY.sfx.play('tap');
            UI.card.open(b.dataset.id, { fromBinder: true });
          };
        });
      };

      scr.innerHTML = `
        <div class="bd-head">
          <div class="topbar">
            ${UI.backBtn('b-back')}
            <h1>${UI.T(S.binder)}</h1>
            <div class="bd-count" aria-label="${have} / ${total}"><b>${have}</b> / ${total}</div>
            ${UI.enBtn()}
          </div>
          <div class="bd-filters" role="group" aria-label="Filter">
            ${FILTERS.map(x => `<button type="button" class="bd-chip ${x.id}" data-f="${x.id}" aria-pressed="false">${UI.L(x.label)}</button>`).join('')}
          </div>
        </div>
        <div class="bd-body">
          <p class="bd-hint">${UI.T(S.binderHint)}</p>
          <div id="bd-list"></div>
        </div>`;
      UI.show('scr-binder');
      render();

      scr.querySelectorAll('.bd-chip').forEach(c => {
        c.onclick = () => { keep.filter = c.dataset.f; KY.sfx.play('tap'); render(); scr.scrollTop = 0; };
      });
      UI.$('#b-back').onclick = () => (keep.from === 'scr-title' ? UI.title.open() : UI.map.open());
      if (!fresh) scr.scrollTop = keep.scroll;
    },
  };
})(window);
