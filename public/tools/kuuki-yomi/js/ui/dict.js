/* Dictionary popup: tap a word with a dotted underline (.gl) to see its reading and an
   easy-Japanese meaning (English follows the EN switch). Pauses the stage while open. */
(function (root) {
  const KY = root.KY, UI = KY.ui;
  const doc = root.document;
  let pop = null, pausedScene = null;

  function close() {
    if (!pop) return;
    pop.remove();
    pop = null;
    if (pausedScene) { pausedScene.resume(); pausedScene = null; }
  }

  function open(key, anchor) {
    close();
    const e = KY.GLOSSARY[key];
    if (!e) return;
    const app = UI.$('#app');
    pop = UI.h('div', 'dict', `
      <div class="dict-word">${KY.text.ruby(e.head || KY.text.autoRuby(key, e.yomi), { gloss: false })}</div>
      <div class="dict-yomi">${KY.text.esc(e.yomi)}</div>
      <div class="dict-mean">${KY.text.ruby(e.jp, { gloss: false })}</div>
      <div class="dict-en">${KY.text.esc(e.en)}</div>
      <button class="dict-x" type="button" aria-label="close">×</button>`);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `${key} (${e.yomi})`);
    app.append(pop);
    const a = anchor.getBoundingClientRect(), b = app.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = a.left - b.left + a.width / 2 - w / 2;
    left = Math.max(10, Math.min(b.width - w - 10, left));
    let top = a.bottom - b.top + 8;
    if (top + h > b.height - 10) top = a.top - b.top - h - 8;
    pop.style.left = left + 'px';
    pop.style.top = Math.max(10, top) + 'px';
    pop.querySelector('.dict-x').onclick = close;
    const run = UI.play && UI.play.run;
    if (UI.current === 'scr-play' && run && run.scene.started && !run.scene.ended && !run.scene.paused) {
      run.scene.pause();
      pausedScene = run.scene;
    }
    KY.sfx.play('pop');
  }

  /* capture phase: a dictionary word never triggers the button / card it sits in */
  doc.addEventListener('click', e => {
    const g = e.target.closest && e.target.closest('.gl');
    if (g) {
      e.preventDefault();
      e.stopPropagation();
      open(g.dataset.g, g);
      return;
    }
    if (pop && !pop.contains(e.target)) close();
  }, true);
  doc.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('gl')) {
      e.preventDefault();
      e.stopPropagation();
      open(e.target.dataset.g, e.target);
    }
    if (e.key === 'Escape') close();
  }, true);

  UI.dict = { open, close };
})(window);
