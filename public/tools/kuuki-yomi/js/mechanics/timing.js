/* TIMING — the world follows a script; the player taps the red thing at the right moment (or never). */
(function (root) {
  const KY = root.KY;

  KY.mech.timing = {
    start(scene, def, refs) {
      const P = def.params;
      const target = refs[P.target];
      if (!target) throw new Error(`${def.id}: params.target "${P.target}" not in refs`);
      for (const [ms, fn] of P.script || []) scene.at(ms, () => fn(scene, refs));
      let done = false;

      const fire = () => {
        if (done) return;
        done = true;
        const key = P.judge(scene.t, scene.flags);
        KY.sfx.play('tap');
        const d = P.onTap ? (P.onTap(scene, refs, key) ?? 400) : 400;
        scene.after(d, () => scene.end(key));
      };

      scene.onTap(target.el || target, fire, P.label || 'red object');
      scene.timer(def.time, () => {
        if (done) return;
        done = true;
        const key = P.judge(null, scene.flags);
        const d = P.onTimeout ? (P.onTimeout(scene, refs, key) ?? 0) : 0;
        scene.after(d, () => scene.end(key));
      });
      scene._timing = { fire };
    },

    simulate(scene, def, refs, input) {
      if (input && typeof input.at === 'number') scene.at(input.at, () => scene._timing.fire());
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
