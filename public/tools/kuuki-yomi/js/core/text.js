/* Text markup used everywhere the player reads Japanese.
     {漢字|かんじ}        furigana
     <<…>>              a dictionary word/phrase (key = its plain text); single ruby groups whose
                        base is a glossary key are linked automatically
   A text object (T) is { jp, en, ro? }. */
(function (root) {
  const KY = root.KY;
  const RUBY = /\{([^{}|]+)\|([^{}|]+)\}/g;
  const KANJI = /[㐀-䶿一-鿿豈-﫿々〆]/g;

  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const plain = jp => String(jp).replace(/<<|>>/g, '').replace(RUBY, '$1');
  const kana = jp => String(jp).replace(/<<|>>/g, '').replace(RUBY, '$2');

  const link = (key, inner) => `<span class="gl" data-g="${esc(key)}" tabindex="0" role="button">${inner}</span>`;

  /* text outside ruby: katakana words that are dictionary keys (リリース, チャット…) are linked too */
  const KATA = /[ァ-ヺー]{2,}/g;
  function plainText(t, glossary, gloss, seen) {
    if (!gloss || !glossary) return esc(t);
    let out = '';
    let last = 0;
    t.replace(KATA, (w, idx) => {
      if (glossary[w] && !seen.has(w)) { seen.add(w); out += esc(t.slice(last, idx)) + link(w, esc(w)); last = idx + w.length; }
      return w;
    });
    return out + esc(t.slice(last));
  }

  /* ruby groups only (no << >>). `seen`: a word is linked only the first time it appears in one text,
     so a long text does not turn into a row of dotted underlines */
  function rubyOnly(s, glossary, gloss, seen = new Set()) {
    let out = '';
    let last = 0;
    s.replace(RUBY, (m, base, reading, idx) => {
      const r = '<ruby>' + esc(base) + '<rt>' + esc(reading) + '</rt></ruby>';
      const on = gloss && glossary && glossary[base] && !seen.has(base);
      if (on) seen.add(base);
      out += plainText(s.slice(last, idx), glossary, gloss, seen) + (on ? link(base, r) : r);
      last = idx + m.length;
      return m;
    });
    return out + plainText(s.slice(last), glossary, gloss, seen);
  }

  /* English after business / IT words (table: KY.FOLLOW, js/core/follow.js).
     Returns the markup with a mark n right after each word that gets English, and the
     English for each mark. Rules:
       - longer words first (名刺交換 before 名刺), and a word inside a longer one is not found again
       - only the first time a word appears in one text
       - a word starts and ends on furigana-group edges (係 inside {関係|かんけい} is not the word 係)
       - a word ending in kanji right before another kanji is part of a longer word (画面共有) and gets
         none (礼儀正しい人 is fine: the word ends in kana)
       - entry.not: the text right after shows the word is part of a verb there (遅れて)
       - a word that ends inside << >> gets its English after the >> */
  const KANJI1 = /^[㐀-䶿一-鿿豈-﫿々〆]/;
  function followEntries(table) {
    return table
      .map(([w, en, not]) => ({ words: [].concat(w), en, not }))
      .sort((a, b) => Math.max(...b.words.map(x => x.length)) - Math.max(...a.words.map(x => x.length)));
  }
  let followCache = null;
  function followMarks(jp, table = KY.FOLLOW) {
    const s = String(jp);
    if (!table || !table.length) return { s, en: [] };
    if (!followCache || followCache.table !== table) followCache = { table, entries: followEntries(table) };
    /* one cell per UTF-16 unit of the plain text: can a word start here? where does a mark go after it? */
    const cells = [];
    let close = -1;
    for (let i = 0; i < s.length;) {
      if (s.startsWith('<<', i)) { const j = s.indexOf('>>', i + 2); close = j < 0 ? -1 : j + 2; i += 2; continue; }
      if (s.startsWith('>>', i)) { close = -1; i += 2; continue; }
      const m = s[i] === '{' && /^\{([^{}|]+)\|([^{}|]+)\}/.exec(s.slice(i));
      if (m) {
        const after = i + m[0].length;
        for (let k = 0; k < m[1].length; k++) {
          cells.push({ ch: m[1][k], start: k === 0, mark: k === m[1].length - 1 ? (close >= 0 ? close : after) : -1 });
        }
        i = after;
        continue;
      }
      cells.push({ ch: s[i], start: true, mark: close >= 0 ? close : i + 1 });
      i += 1;
    }
    const plainText = cells.map(c => c.ch).join('');
    const taken = new Array(cells.length).fill(false);
    const marks = [];
    for (const e of followCache.entries) {
      let first = true;
      for (const w of e.words) {
        for (let at = plainText.indexOf(w); at >= 0; at = plainText.indexOf(w, at + 1)) {
          const last = at + w.length - 1;
          if (!cells[at].start || cells[last].mark < 0) continue;
          if (taken.slice(at, last + 1).some(Boolean)) continue;
          const rest = plainText.slice(last + 1);
          if ((KANJI1.test(w.slice(-1)) && KANJI1.test(rest)) || (e.not && e.not.test(rest))) continue;
          for (let k = at; k <= last; k++) taken[k] = true;
          if (first) { marks.push({ pos: cells[last].mark, en: e.en }); first = false; }
        }
      }
    }
    if (!marks.length) return { s, en: [] };
    marks.sort((a, b) => b.pos - a.pos);
    let out = s;
    const en = [];
    marks.forEach((mk, n) => { en[n] = mk.en; out = out.slice(0, mk.pos) + '' + n + '' + out.slice(mk.pos); });
    return { s: out, en };
  }
  const followHtml = en => `<span class="enf">（${esc(en)}）</span>`;

  /* opts: { glossary = KY.GLOSSARY, gloss = true, follow = false } */
  function ruby(jp, opts = {}) {
    if (opts.follow) {
      const f = followMarks(jp);
      const h = ruby(f.s, Object.assign({}, opts, { follow: false }));
      return f.en.length ? h.replace(/(\d+)/g, (m, n) => followHtml(f.en[n])) : h;
    }
    const glossary = opts.glossary !== undefined ? opts.glossary : KY.GLOSSARY;
    const gloss = opts.gloss !== false;
    const s = String(jp);
    const seen = new Set();
    let out = '';
    let last = 0;
    const re = /<<([\s\S]*?)>>/g;
    let m;
    while ((m = re.exec(s))) {
      out += rubyOnly(s.slice(last, m.index), glossary, gloss, seen);
      const inner = rubyOnly(m[1], glossary, false);
      const key = plain(m[1]);
      out += gloss && !seen.has(key) ? link(key, inner) : inner;
      seen.add(key);
      last = m.index + m[0].length;
    }
    return out + rubyOnly(s.slice(last), glossary, gloss, seen);
  }

  function check(jp) {
    const errors = [];
    const s = String(jp);
    let depth = 0;
    for (const ch of s.replace(/<<|>>/g, '')) {
      if (ch === '{') { depth++; if (depth > 1) errors.push('nested "{"'); }
      else if (ch === '}') { depth--; if (depth < 0) { errors.push('stray "}"'); depth = 0; } }
      else if (ch === '|' && depth === 0) errors.push('"|" outside braces');
    }
    if (depth > 0) errors.push('unclosed "{"');
    const groups = s.match(/\{[^{}]*\}/g) || [];
    for (const g of groups) {
      const parts = g.slice(1, -1).split('|');
      if (parts.length !== 2) errors.push('group needs exactly one "|": ' + g);
      else if (!parts[0].trim()) errors.push('empty base: ' + g);
      else if (!parts[1].trim()) errors.push('empty reading: ' + g);
    }
    let open = 0;
    for (const tok of s.match(/<<|>>/g) || []) {
      if (tok === '<<') { open++; if (open > 1) errors.push('nested "<<"'); }
      else { open--; if (open < 0) { errors.push('stray ">>"'); open = 0; } }
    }
    if (open > 0) errors.push('unclosed "<<"');
    return errors;
  }

  const bareKanji = jp => (String(jp).replace(/<<|>>/g, '').replace(RUBY, '').match(KANJI) || []);

  /* dictionary keys used in a text: explicit << >> first, then automatic single-group links */
  function glossKeys(jp, glossary = KY.GLOSSARY || {}) {
    const keys = [];
    const s = String(jp);
    for (const m of s.matchAll(/<<([\s\S]*?)>>/g)) keys.push(plain(m[1]));
    const rest = s.replace(/<<[\s\S]*?>>/g, '');
    for (const m of rest.matchAll(RUBY)) if (glossary[m[1]] && !keys.includes(m[1])) keys.push(m[1]);
    for (const m of rest.replace(RUBY, ' ').matchAll(KATA)) if (glossary[m[0]] && !keys.includes(m[0])) keys.push(m[0]);
    return keys;
  }

  /* furigana markup for a whole word: ("お疲れ様です", "おつかれさまです") → "お{疲|つか}れ{様|さま}です".
     The kana in the word anchor the split; if they cannot, the whole word gets one reading. */
  const KANA_RUN = /[\u3040-\u30ffー\s]+|[^\u3040-\u30ffー\s]+/g;
  function autoRuby(word, yomi) {
    word = String(word);
    const parts = word.match(KANA_RUN) || [];
    const needs = p => !/^[\u3040-\u30ffー\s]/.test(p);
    if (!parts.some(needs)) return word;
    const hira = x => String(x).replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
    const lit = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = hira(yomi).match(new RegExp('^' + parts.map(p => (needs(p) ? '(.+?)' : lit(hira(p)))).join('') + '$'));
    if (!m) return '{' + word + '|' + yomi + '}';
    let i = 1;
    return parts.map(p => (needs(p) ? '{' + p + '|' + m[i++] + '}' : p)).join('');
  }

  /* opts: { cls, gloss, follow }
     follow: true = English right after each word; 'below' = all of it on one small line under the
     text (small things in the scene — cards, name tags, labels — where a wider text would overlap) */
  function html(t, opts = {}) {
    if (!t) return '';
    const cls = opts.cls ? 't ' + opts.cls : 't';
    const below = opts.follow === 'below';
    let h = '<span class="' + cls + '"><span class="jp">' + ruby(t.jp || '', { gloss: opts.gloss, follow: !below && opts.follow }) + '</span>';
    if (below) {
      const en = followMarks(t.jp || '').en.slice().reverse();   /* marks are numbered from the end */
      if (en.length) h += '<span class="enf enb">' + esc(en.join(' · ')) + '</span>';
    }
    if (t.ro) h += '<span class="ro">' + esc(t.ro) + '</span>';
    if (t.en) h += '<span class="en">' + esc(t.en) + '</span>';
    return h + '</span>';
  }

  KY.text = { ruby, plain, kana, check, bareKanji, glossKeys, html, esc, autoRuby, followMarks };
})(typeof window !== 'undefined' ? window : globalThis);
