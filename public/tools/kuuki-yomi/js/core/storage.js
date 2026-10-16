/* Progress + settings in localStorage. Never throws; falls back to memory. */
(function (root) {
  const KY = root.KY;
  const KEY = 'kuukiyomi-it.v2';
  const POINTS = { great: 2, ok: 1, ky: 0 };
  let memory = null;

  const defaults = () => ({
    v: 2,
    settings: { furigana: true, romaji: false, english: false, sound: true },
    best: {},
    name: '',
    flags: {},
  });

  function normalize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    return {
      v: 2,
      settings: Object.assign(d.settings, raw.settings || {}),
      best: Object.assign({}, raw.best || {}),
      name: typeof raw.name === 'string' ? raw.name : '',
      flags: Object.assign({}, raw.flags || {}),
    };
  }

  const storage = () => { try { return root.localStorage || null; } catch (e) { return null; } };

  function load() {
    if (memory) return normalize(JSON.parse(JSON.stringify(memory)));
    try {
      const ls = storage();
      const txt = ls && ls.getItem(KEY);
      return normalize(txt ? JSON.parse(txt) : null);
    } catch (e) {
      return defaults();
    }
  }

  function save(state) {
    const s = normalize(state);
    try {
      const ls = storage();
      if (!ls) throw new Error('no storage');
      ls.setItem(KEY, JSON.stringify(s));
      memory = null;
      return true;
    } catch (e) {
      memory = s;
      return false;
    }
  }

  function recordBest(stageId, grade) {
    const s = load();
    const prev = s.best[stageId];
    if (prev === undefined || POINTS[grade] > POINTS[prev]) s.best[stageId] = grade;
    save(s);
    return s;
  }

  function setFlag(name, value = true) {
    const s = load();
    s.flags[name] = value;
    save(s);
    return s;
  }

  function reset() {
    const s = load();
    const fresh = defaults();
    fresh.settings = s.settings;
    save(fresh);
    return fresh;
  }

  KY.store = { load, save, recordBest, setFlag, reset, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
