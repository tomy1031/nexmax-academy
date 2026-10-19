/* 空気読み〜IT業界編〜 — global namespace + stage registry.
   Classic scripts (no modules) so the game also runs from file://. */
(function (root) {
  const KY = root.KY || (root.KY = {});
  KY.version = '2.0.0';
  KY.mech = KY.mech || {};
  KY.ui = KY.ui || {};
  KY.stages = KY.stages || [];

  KY.CHAPTERS = [
    { n: 1, time: '09:00', title: { jp: '{朝|あさ}のオフィス', en: 'Morning at the Office' } },
    { n: 2, time: '11:00', title: { jp: '{客先|きゃくさき}{訪問|ほうもん}', en: 'Visiting a Client' } },
    { n: 3, time: '14:00', title: { jp: '{会議|かいぎ}', en: 'Meetings' } },
    { n: 4, time: '16:00', title: { jp: '{開発|かいはつ}{現場|げんば}あるある', en: 'On the Dev Floor' } },
    { n: 5, time: '19:00', title: { jp: '{飲|の}み{会|かい}', en: 'After-Work Drinks' } },
    { n: 6, time: '+1 day', title: { jp: '{出張|しゅっちょう}と {特別|とくべつ}な {場面|ばめん}', en: 'Business Trips & Special Occasions' } },
  ];

  KY.defineStage = function (def) {
    if (KY.stages.some(s => s.id === def.id)) throw new Error('Duplicate stage id ' + def.id);
    KY.stages.push(def);
    KY.stages.sort((a, b) => {
      const [ac, an] = a.id.split('-').map(Number);
      const [bc, bn] = b.id.split('-').map(Number);
      return ac - bc || an - bn;
    });
    return def;
  };

  KY.stage = id => KY.stages.find(s => s.id === id) || null;
  KY.stagesOf = chapter => KY.stages.filter(s => s.chapter === chapter);
})(typeof window !== 'undefined' ? window : globalThis);
