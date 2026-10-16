/* CHOICE — three red speech bubbles; tap the one you would say. Silence is an answer too. */
(function (root) {
  const KY = root.KY;
  const firstKy = def => Object.keys(def.outcomes).find(k => def.outcomes[k].grade === 'ky');

  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }

  KY.mech.choice = {
    start(scene, def, refs) {
      const P = def.params;
      for (const [ms, fn] of P.script || []) scene.at(ms, () => fn(scene, refs));
      let done = false;

      const panel = root.document.createElement('div');
      panel.className = 'choices';
      const list = P.shuffle === false ? P.options : shuffle(P.options);
      for (const opt of list) {
        const b = root.document.createElement('button');
        b.className = 'choice';
        b.type = 'button';
        b.dataset.id = opt.id;
        b.innerHTML = KY.text.html(opt.text);   /* dictionary words open the popup instead of choosing */
        b.addEventListener('click', () => { if (!scene.locked) pick(opt, b); });
        panel.append(b);
      }

      function pick(opt, btn) {
        if (done) return;
        done = true;
        KY.sfx.play('tap');
        panel.classList.add('picked');
        if (btn) btn.classList.add('chosen');
        scene.after(260, () => {
          panel.remove();
          let d;
          if (P.onChoose) d = P.onChoose(scene, refs, opt);
          else if (refs.player) { scene.say(refs.player, opt.text, { dur: 1800, cls: 'mine' }); d = 1900; }
          scene.after(d ?? 900, () => scene.end(opt.outcome));
        });
      }

      scene.at(P.showAt ?? 1600, () => {
        if (done) return;
        scene.overlay.append(panel);
        KY.sfx.play('pop');
        requestAnimationFrame(() => panel.classList.add('in'));
      });

      scene.timer(def.time, () => {
        if (done) return;
        done = true;
        panel.remove();
        const key = P.timeout || firstKy(def);
        const d = P.onSilence ? (P.onSilence(scene, refs) ?? 0) : 0;
        scene.after(d, () => scene.end(key));
      });
      scene._choice = { pick, button: id => panel.querySelector(`[data-id="${id}"]`) };
    },

    /* in the model-answer replay (scene.demo) the viewer gets time to read the options first */
    simulate(scene, def, refs, id) {
      scene.at((def.params.showAt ?? 1600) + (scene.demo ? 2200 : 300), () => {
        const opt = def.params.options.find(o => o.id === id);
        if (!opt) throw new Error(`${def.id}: no option "${id}"`);
        scene._choice.pick(opt, scene._choice.button(id));
      });
    },
  };

  const requestAnimationFrame = fn => (root.requestAnimationFrame ? root.requestAnimationFrame(fn) : setTimeout(fn, 0));
})(typeof window !== 'undefined' ? window : globalThis);
