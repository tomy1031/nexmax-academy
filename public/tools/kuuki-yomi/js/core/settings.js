/* Display settings → <html> classes (CSS hides rt / romaji / english). */
(function (root) {
  const KY = root.KY;

  const ITEMS = [
    { key: 'furigana', label: 'setFurigana', sub: 'setFuriganaSub' },
    { key: 'english', label: 'setEnglish', sub: 'setEnglishSub' },
    { key: 'romaji', label: 'setRomaji', sub: 'setRomajiSub' },
    { key: 'sound', label: 'setSound', sub: null },
  ];

  function apply(settings) {
    const el = root.document && root.document.documentElement;
    if (!el) return;
    el.classList.toggle('no-furigana', !settings.furigana);
    el.classList.toggle('no-romaji', !settings.romaji);
    el.classList.toggle('no-english', !settings.english);
    root.document.querySelectorAll('[data-en-toggle]').forEach(b => b.setAttribute('aria-pressed', settings.english ? 'true' : 'false'));
    if (KY.sfx) KY.sfx.enabled = !!settings.sound;
  }

  function current() { return KY.store.load().settings; }

  function set(key, value) {
    const s = KY.store.load();
    s.settings[key] = value;
    KY.store.save(s);
    apply(s.settings);
    return s.settings;
  }

  KY.settings = { ITEMS, apply, current, set };
})(typeof window !== 'undefined' ? window : globalThis);
