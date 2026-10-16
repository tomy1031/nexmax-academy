/* In-browser auto-runner: index.html?test (all) or ?test=2-6 (one stage).
   Plays every test case of every stage with a manual clock and checks the resulting grade. */
(function (root) {
  const KY = root.KY, UI = KY.ui;

  function runCase(def, caseName, input, host) {
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); origErr.apply(console, a); };
    let key = null, ended = false, crash = null;
    try {
      const run = KY.run(def, host, { manual: true });
      run.scene.on('end', k => { key = k; ended = true; });
      run.begin();
      run.simulate(input);
      const limit = (def.time || 15000) + 8000;
      while (!ended && run.scene.t < limit) run.scene.advance(100);
      run.destroy();
    } catch (e) {
      crash = e;
    } finally {
      console.error = origErr;
    }
    const got = key && def.outcomes[key] ? def.outcomes[key].grade : null;
    const pass = !crash && ended && got === caseName && errors.length === 0;
    return { id: def.id, caseName, key, got, pass, detail: crash ? String(crash) : errors.join(' | ') || (ended ? '' : 'did not end') };
  }

  UI.testrunner = {
    run(only) {
      const scr = UI.$('#scr-test');
      UI.show('scr-test');
      scr.innerHTML = '<div class="map-body"><h1>Test runner</h1><p id="tr-sum">running…</p><div id="tr-host" style="position:relative;width:360px;height:640px;opacity:.02;pointer-events:none"></div><table id="tr-table" style="font-size:12px;border-collapse:collapse;width:100%"></table></div>';
      const host = UI.$('#tr-host');
      const stages = KY.stages.filter(s => !only || s.id === only);
      const results = [];
      for (const def of stages) {
        for (const caseName of ['great', 'ok', 'ky']) {
          if (!def.test || !(caseName in def.test)) continue;
          results.push(runCase(def, caseName, def.test[caseName], host));
        }
      }
      host.remove();
      const fails = results.filter(r => !r.pass);
      UI.$('#tr-sum').textContent = `${results.length - fails.length} / ${results.length} passed · ${stages.length} stages`;
      UI.$('#tr-table').innerHTML = '<tr><th align=left>stage</th><th align=left>case</th><th align=left>outcome</th><th align=left>grade</th><th align=left>result</th></tr>' +
        results.map(r => `<tr style="border-top:1px solid #eee;${r.pass ? '' : 'background:#ffe9eb'}"><td>${r.id}</td><td>${r.caseName}</td><td>${r.key || '-'}</td><td>${r.got || '-'}</td><td>${r.pass ? 'PASS' : 'FAIL ' + KY.text.esc(r.detail)}</td></tr>`).join('');
      root.KY_TEST_RESULT = { total: results.length, failed: fails.length, fails };
      return root.KY_TEST_RESULT;
    },
  };
})(window);
