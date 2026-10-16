/* Grades, 空気読み度 (percent) and the rank ladder used for the final diagnosis. */
(function (root) {
  const KY = root.KY;
  const POINTS = { great: 2, ok: 1, ky: 0 };

  const RANKS = [
    { min: 0, id: 'trainee', title: { jp: '{見習|みなら}い', en: 'Trainee' }, line: { jp: '{空気|くうき}、どこ？', en: '"Air? What air?"' } },
    { min: 20, id: 'newhire', title: { jp: '{新入社員|しんにゅうしゃいん}', en: 'New Hire' }, line: { jp: 'これから どんどん {強|つよ}くなる！', en: 'You will only get stronger from here!' } },
    { min: 40, id: 'chief', title: { jp: '{主任|しゅにん}', en: 'Chief' }, line: { jp: '{現場|げんば}が{回|まわ}り{始|はじ}めた。', en: 'The team starts to rely on you.' } },
    { min: 55, id: 'kakaricho', title: { jp: '{係長|かかりちょう}', en: 'Assistant Manager' }, line: { jp: 'みんなが {相談|そうだん}に くる {先輩|せんぱい}。', en: 'A senior everyone comes to for advice.' } },
    { min: 70, id: 'kacho', title: { jp: '{課長|かちょう}', en: 'Section Manager' }, line: { jp: '{会議|かいぎ}の {空気|くうき}を {作|つく}る {人|ひと}に なった。', en: 'You now set the mood of meetings.' } },
    { min: 80, id: 'bucho', title: { jp: '{部長|ぶちょう}', en: 'Department Manager' }, line: { jp: 'あなたが{動|うご}くと{空気|くうき}が{動|うご}く。', en: 'When you move, the air moves.' } },
    { min: 90, id: 'shacho', title: { jp: '{社長|しゃちょう}', en: 'President' }, line: { jp: '{空気|くうき}を {思|おも}いどおりに {動|うご}かせる {人|ひと}。', en: 'You can move the air as you like.' } },
    { min: 97, id: 'kaicho', title: { jp: '{会長|かいちょう}', en: 'Chairman' }, line: { jp: 'もはや、あなたが{空気|くうき}です。', en: 'At this point, you ARE the air.' } },
  ];

  function percent(best, ids) {
    if (!ids || !ids.length) return 0;
    const sum = ids.reduce((a, id) => a + (POINTS[best && best[id]] || 0), 0);
    return Math.round((100 * sum) / (2 * ids.length));
  }

  function rank(pct) {
    let r = RANKS[0];
    for (const x of RANKS) if (pct >= x.min) r = x;
    return r;
  }

  const better = (a, b) => ((POINTS[a] ?? -1) >= (POINTS[b] ?? -1) ? a : b);

  KY.scoring = { POINTS, RANKS, percent, rank, better };
})(typeof window !== 'undefined' ? window : globalThis);
