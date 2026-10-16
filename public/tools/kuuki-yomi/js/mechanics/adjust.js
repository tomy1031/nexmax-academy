/* ADJUST — hold or drag the red thing to set an angle / height / amount. */
(function (root) {
  const KY = root.KY;

  KY.mech.adjust = {
    start(scene, def, refs) {
      const P = def.params;
      const target = refs[P.target];
      if (!target) throw new Error(`${def.id}: params.target "${P.target}" not in refs`);
      const min = P.min ?? 0, max = P.max ?? 90;
      const clamp = x => Math.max(min, Math.min(max, x));
      let v = clamp(P.start ?? min);
      let done = false;
      const info = { held: false, touched: false, pressedAt: null, releasedAt: null, flags: scene.flags, sim: false };
      const apply = () => P.apply(scene, refs, v);
      apply();
      for (const [ms, fn] of P.script || []) scene.at(ms, () => fn(scene, refs));

      const finish = key => {
        if (done) return;
        done = true;
        scene.after(P.settle ?? 700, () => scene.end(key));
      };
      const commit = () => finish(P.judge(v, info));
      const press = () => {
        info.held = true; info.touched = true;
        if (info.pressedAt === null) info.pressedAt = scene.t;
        KY.sfx.play('tap');
      };
      const release = () => {
        if (!info.held) return;
        info.held = false;
        info.releasedAt = scene.t;
        if (P.commit === 'release' && !done) commit();
      };

      const node = target.el || target;
      if (P.input === 'hold') {
        scene.onHold(node, { down: press, up: release }, P.label || 'red object (hold)');
      } else {
        let v0 = v, p0 = null, a0 = 0;
        const angle = p => (Math.atan2(p.y - P.pivot.y, p.x - P.pivot.x) * 180) / Math.PI;
        scene.onDrag(node, {
          start(p) { press(); v0 = v; p0 = p; if (P.input === 'drag-angle') a0 = angle(p); },
          move(p) {
            if (done) return;
            if (P.input === 'drag-y') v = clamp(v0 + (p.y - p0.y) * (P.ratio ?? 1));
            else if (P.input === 'drag-x') v = clamp(v0 + (p.x - p0.x) * (P.ratio ?? 1));
            else if (P.input === 'drag-angle') { let d = angle(p) - a0; if (d > 180) d -= 360; if (d < -180) d += 360; v = clamp(v0 + d); }
            apply();
          },
          end: release,
        }, P.label || 'red object (drag)');
      }

      scene.every(dt => {
        if (done && P.commit !== 'timeout') return;
        if (P.input === 'hold' && !info.sim) {
          if (info.held) v = clamp(v + ((P.speed ?? 60) * dt) / 1000);
          else if (P.fall) v = clamp(v - (P.fall * dt) / 1000);
          apply();
        }
        if (!done && P.check) {
          const k = P.check(v, info, scene);
          if (k) finish(k);
        }
      });

      scene.timer(def.time, () => { if (!done) commit(); });
      scene._adjust = {
        info, commit, press, release,
        set(nv) { v = clamp(nv); apply(); },
        get value() { return v; },
      };
    },

    /* input: { value, releaseAt? } — press, jump to value, release (now or at releaseAt) */
    simulate(scene, def, refs, input) {
      const a = () => scene._adjust;
      scene.after(200, () => {
        a().info.sim = true;
        a().press();
        a().set(input.value);
        if (input.releaseAt == null) a().release();
      });
      if (input.releaseAt != null) scene.at(input.releaseAt, () => a().release());
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
