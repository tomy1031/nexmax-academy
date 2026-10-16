/* Boot. URL params: ?stage=2-6 jumps to a stage, ?test or ?test=2-6 runs the auto-runner. */
(function (root) {
  const KY = root.KY, UI = KY.ui;

  function boot() {
    KY.settings.apply(KY.settings.current());
    const q = new URLSearchParams(root.location.search);
    if (q.has('test')) { UI.testrunner.run(q.get('test') || null); return; }
    if (q.get('stage')) { UI.play.open(q.get('stage')); return; }
    if (q.get('shot')) { shot(q); return; }
    UI.title.open();
  }

  /* Dev screenshots: ?shot=2-6[&case=great][&t=3000][&intro][&card]
     Plays the stage on a manual clock, applies the test input for `case`, advances `t` ms. */
  function shot(q) {
    const id = q.get('shot'), c = q.get('case'), t = Number(q.get('t') || 0);
    const def = KY.stage(id);
    if (!def) { UI.map.open(); return; }
    if (q.has('card')) { UI.card.open(id, { grade: c || 'great', fromPlay: true }); return; }
    UI.play.open(id, { manual: true });
    if (q.has('intro')) return;
    UI.play.startNow();
    if (c && def.test && c in def.test) UI.play.run.simulate(def.test[c]);
    UI.play.run.scene.advance(t);
  }

  /* Pause automatically when the tab is hidden during play. */
  root.document.addEventListener('visibilitychange', () => {
    if (root.document.hidden && UI.current === 'scr-play' && UI.play.run && UI.play.run.scene.started && !UI.play.run.scene.ended && !UI.play.run.scene.paused) UI.play.pause();
  });

  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
