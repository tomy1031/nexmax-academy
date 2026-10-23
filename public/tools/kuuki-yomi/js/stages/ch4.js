/* Chapter 4 — On the Dev Floor (開発現場あるある) */
(function (root) {
  const KY = root.KY;
  const P = KY.props;

  /* ---- dictionary words used in this chapter (easy-Japanese explanations, furigana on every kanji) ---- */
  KY.addGlossary({
    '有給休暇':{yomi:'ゆうきゅうきゅうか',jp:'お{金|かね}を もらいながら {休|やす}む ことが できる {日|ひ}。',en:'paid leave'},'お土産':{yomi:'おみやげ',jp:'{旅行|りょこう}の {場所|ばしょ}で {買|か}って {人|ひと}に わたす プレゼント。',en:'souvenir'},
    '承知しました': { yomi: 'しょうちしました', jp: '「わかりました」の とても {丁寧|ていねい}な {言|い}い{方|かた}。{上司|じょうし}や お{客様|きゃくさま}に {使|つか}う。', en: 'Understood (polite)' },
    '了解': { yomi: 'りょうかい', jp: '「わかりました」と いう {意味|いみ}の ことば。おなじ チームの {人|ひと}には よく {使|つか}います。{上|うえ}の {人|ひと}や お{客様|きゃくさま}には「<<{承知|しょうち}しました>>」の ほうが {丁寧|ていねい}です。', en: 'ryōkai: "got it" (fine among teammates; some find it rude to seniors)' },
    'いい感じに': { yomi: 'いいかんじに', jp: 'どう したら いいか、はっきり {言|い}わない {言|い}い{方|かた}。{意味|いみ}は {人|ひと}に よって ちがいます。', en: 'vague "make it nice"; the meaning depends on the speaker' },
    'たたき台': { yomi: 'たたきだい', jp: '{話|はな}しあいの ために、はじめに {作|つく}る かんたんな {見本|みほん}。{直|なお}す ところが あっても いいです。', en: 'a rough draft to start the discussion' },
    'お忙しいところ すみません': { yomi: 'おいそがしいところ すみません', jp: 'いそがしい {人|ひと}に {話|はな}しかける ときの {丁寧|ていねい}な ひとこと。', en: 'Sorry to bother you when you are busy' },
    'ホウレンソウ': { yomi: 'ほうれんそう', jp: '{報告|ほうこく}・{連絡|れんらく}・{相談|そうだん}の ことです。やさいの ほうれんそうと {同|おな}じ {音|おと}です。', en: 'hō-ren-sō: report, contact, consult (a pun on spinach)' },
    '同僚': { yomi: 'どうりょう', jp: '{同|おな}じ {会社|かいしゃ}で いっしょに {働|はたら}く {人|ひと}。', en: 'colleague' },
    '結構': { yomi: 'けっこう', jp: 'ていねいに {断|ことわ}る ときに {使|つか}う ことば。「いりません」の {意味|いみ}。いい、という {意味|いみ}でも {使|つか}う。', en: 'kekkō: "no thank you" (polite) — or "that is fine"' },
    '本番': { yomi: 'ほんばん', jp: 'お{客様|きゃくさま}が {今|いま} {使|つか}って いる システム。', en: 'production (the live system)' },
    'ロールバック': { yomi: 'ロールバック', jp: 'リリースを やめて、ひとつ {前|まえ}の バージョンに {変|か}えること。', en: 'rollback (going back to the previous version)' },
    'オンコール': { yomi: 'オンコール', jp: 'もんだいが {起|お}きたとき、{夜|よる}や {休|やす}みの {日|ひ}でも すぐ {直|なお}す {人|ひと}を {決|き}めておく やり{方|かた}。', en: 'on-call duty' },
    '稟議': { yomi: 'りんぎ', jp: '{書|か}いた {紙|かみ}を {上|うえ}の {人|ひと}に {順番|じゅんばん}に {見|み}せて、「いいですよ」と {言|い}って もらう やり{方|かた}。{会社|かいしゃ}で {大|おお}きな ことを {決|き}める ときに {使|つか}う。', en: 'ringi: approval by passing a written request up the chain' },
    '稟議書': { yomi: 'りんぎしょ', jp: '{稟議|りんぎ}で {回|まわ}す {紙|かみ}（または データ）。', en: 'ringi document (approval request)' },
    'ハンコ': { yomi: 'ハンコ', jp: '{名前|なまえ}が {入|はい}っている スタンプ。「{見|み}ました。いいです」の しるしに、{赤|あか}い インクで {紙|かみ}に おす。', en: 'hanko: a personal name seal' },
    '方眼紙': { yomi: 'ほうがんし', jp: '{小|ちい}さい マスが たくさん ならんだ {紙|かみ}。Excelの マスを {小|ちい}さい {四角|しかく}に そろえて、{紙|かみ}のように {使|つか}う {会社|かいしゃ}が {多|おお}いです。', en: 'graph paper; "Excel graph paper" = a sheet of tiny square cells used like a layout page' },
    '設計書': { yomi: 'せっけいしょ', jp: 'システムを どう {作|つく}るかを {書|か}いた {紙|かみ}（ファイル）。', en: 'design document' },
    '有給': { yomi: 'ゆうきゅう', jp: 'お{金|かね}を もらったまま {休|やす}める {日|ひ}。{会社|かいしゃ}で {働|はたら}く {人|ひと}は、1{年|ねん}に なんにちか {取|と}れます。', en: 'paid leave' },
    '就業規則': { yomi: 'しゅうぎょうきそく', jp: '{会社|かいしゃ}の {働|はたら}き{方|かた}の ルールを {書|か}いた もの。{休|やす}みの とり{方|かた}も {書|か}いて あります。', en: 'work rules (the company rulebook)' },
    '私用': { yomi: 'しよう', jp: '{仕事|しごと}では なくて、{自分|じぶん}の ことの ため。', en: 'personal matters' },
    '申請': { yomi: 'しんせい', jp: '{会社|かいしゃ}に、{決|き}まった やり{方|かた}で「{休|やす}みたいです」などと おねがいすること。', en: 'applying (a formal request)' },
    '引き継ぎ': { yomi: 'ひきつぎ', jp: '{休|やす}む {前|まえ}に、{自分|じぶん}の {仕事|しごと}を ほかの {人|ひと}に {伝|つた}えて おくこと。', en: 'handover of your work' },
  });

  const WHO = {
    boss: { jp: '{上司|じょうし}', en: 'Boss' },
    mate: { jp: '{同僚|どうりょう}', en: 'Teammate' },
    colleague: { jp: '{同僚|どうりょう}', en: 'Colleague' },
    client: { jp: 'お{客様|きゃくさま}', en: 'Client' },
    senior: { jp: '{先輩|せんぱい}', en: 'Senior colleague' },
    kacho: { jp: '{課長|かちょう}', en: 'Section Manager' },
    bucho: { jp: '{部長|ぶちょう}', en: 'Dept. Manager' },
  };

  const INK = '#2b2b2b';
  const BLUE = '#3b6fd8';
  const POINT = { f: [128, 0], b: [-6, 0] };        /* arm raised toward a screen */
  const TYPE = [{ f: [26, 62], b: [30, 52] }, { f: [34, 52], b: [22, 66] }];   /* seated typing */

  /* ------------------------------------------------------------ stage-local helpers */

  /* arrow with a head, sized for scenes (the diagram arrow is too thin there) */
  function arrow(parent, x1, y1, x2, y2, { color = '#9a9a9a', w = 3.4, head = 9 } = {}) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const h = k => `M${x2} ${y2}L${x2 - head * Math.cos(a + k)} ${y2 - head * Math.sin(a + k)}`;
    parent.append(KY.svg.el('path', { d: `M${x1} ${y1}L${x2} ${y2}${h(-0.5)}${h(0.5)}`, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }));
  }

  /* seated people type: arms alternate until `.on` is switched off */
  function typing(scene, people) {
    const st = { on: true, k: -1 };
    scene.every((dt, t) => {
      if (!st.on) return;
      const k = Math.floor(t / 130) % 2;
      if (k === st.k) return;
      st.k = k;
      people.forEach((p, i) => p.set({ arms: TYPE[(k + i) % 2] }));
    });
    st.stop = () => { st.on = false; people.forEach(p => p.set({ arms: null })); };
    return st;
  }

  /* a mug of coffee on a table; steam(on) */
  function mug({ x, y, steam = false }) {
    const { el, g } = KY.svg;
    const s = g({ opacity: steam ? 1 : 0 }, [
      el('path', { d: 'M-3 -22 q-4 -6 0 -11 q4 -5 0 -10', fill: 'none', stroke: '#c9c9c9', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      el('path', { d: 'M5 -22 q-4 -5 0 -9', fill: 'none', stroke: '#d9d9d9', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    ]);
    s.setAttribute('class', 'steam');
    const n = g({ transform: `translate(${x} ${y})` }, [
      s,
      el('path', { d: 'M9 -14 q10 0 9 7 q-1 6 -10 5', fill: 'none', stroke: '#3a3a3a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
      el('path', { d: 'M-10 0 L-9 -18 L10 -18 L9 0 Z', fill: '#fff', stroke: '#3a3a3a', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      el('rect', { x: -7, y: -15, width: 14, height: 5, rx: 2, fill: steam ? '#8a6a4a' : '#ececec' }),
    ]);
    return { el: n, steam: on => KY.svg.set(s, { opacity: on ? 1 : 0 }) };
  }

  /* wall calendar with no text; one day circled */
  function calendar(x, y) {
    const { el, g } = KY.svg;
    const kids = [
      el('rect', { x: 0, y: 0, width: 66, height: 56, rx: 3, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': 2.5 }),
      el('rect', { x: 0, y: 0, width: 66, height: 12, rx: 3, fill: '#bdbdbd' }),
    ];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) kids.push(el('rect', { x: 5 + c * 9.5, y: 17 + r * 9.5, width: 7, height: 7, rx: 1.5, fill: '#e6e6e6' }));
    kids.push(el('circle', { cx: 5 + 3 * 9.5 + 3.5, cy: 17 + 2 * 9.5 + 3.5, r: 7.5, fill: 'none', stroke: INK, 'stroke-width': 2 }));
    return g({ transform: `translate(${x} ${y})` }, kids);
  }

  /* ------------------------------------------------------------------ 4-1 */
  KY.defineStage({id:'4-1',chapter:4,title:{jp:'リリース 5{分前|ふんまえ}！ バグ！',en:'A bug five minutes before release!'},intro:{jp:'ECサイトは 17:00に リリースの {予定|よてい}。いま 16:55。{最後|さいご}の テストで {決済|けっさい}エラーを {見|み}つけました。',en:'An EC site is due to go live at 17:00. At 16:55, you find a payment error in the final test.'},time:16000,mechanic:'choice',
    setup(s){const P=KY.props,{el}=KY.svg;s.add('bg',P.backdrop({floor:470}));const mon=P.monitor({x:177,y:328,w:155,h:120});s.add('mid',mon);mon.screen.append(el('rect',{x:0,y:0,width:mon.sw,height:mon.sh,fill:'#fff5f5'}));s.label(177,315,{jp:'{決済|けっさい}エラー！',en:'Payment ERROR!'});s.add('bg',P.clock({x:284,y:217,r:20,h:4,m:55}));s.label(284,184,{jp:'16:55',en:'16:55'});const me=s.person({x:80,y:470,color:'player',player:true});const boss=s.person({x:279,y:470,facing:-1,tag:{jp:'{上司|じょうし}',en:'Boss'}});s.say(boss,{jp:'もうすぐ リリースだね！',en:'We are almost ready to release!'},{dur:3400,lift:24});me.mark('sweat');return {me,boss};},
    params:{showAt:1300,shuffle:false,options:[{id:'release',text:{jp:'🚀 A：そのまま リリースする',en:'A: Release anyway'},outcome:'wrong'},{id:'hide',text:{jp:'🙈 B：エラーを {隠|かく}す',en:'B: Hide the error'},outcome:'wrong'},{id:'report',text:{jp:'📣 C：{上司|じょうし}に {報告|ほうこく}する',en:'C: Report to boss'},outcome:'great'}],onChoose(s,r,opt){s.say(r.me,opt.text,{dur:1300,cls:'mine'});if(opt.outcome==='wrong'){s.after(500,()=>{s.label(180,155,'🎆 リリース！ 🎆','#c11',19);for(let i=0;i<10;i++)s.after(90*i,()=>s.label(40+(i%3)*125,200+Math.floor(i/3)*57,'⚠ 注文エラー','#c11',15));r.me.mark('sweat2');});return 1900;}r.boss.mark('q');return 1400;},timeout:'wrong'},
    outcomes:{great:{grade:'great',line:{jp:'「{教|おし}えてくれて ありがとう。リリースを {止|と}めるか {決|き}めよう。」',en:'“Thanks for reporting. Let us decide whether to stop the release.”'}},wrong:{grade:'ky',line:{jp:'リリース{直後|ちょくご}に {注文|ちゅうもん}エラーが いっぱい！',en:'Order errors everywhere right after release!'}}},card:{badge: "must", name: {jp:"重大なエラーはすぐに報告",en:"重大なエラーはすぐに報告"}, points:[{jp:"{決済|けっさい}で エラーを {見|み}つけたら、すぐに {上司|じょうし}に {報告|ほうこく}しよう。リリースを {止|と}める {必要|ひつよう}が あるか {相談|そうだん}しよう。",en:"{決済|けっさい}で エラーを {見|み}つけたら、すぐに {上司|じょうし}に {報告|ほうこく}しよう。リリースを {止|と}める {必要|ひつよう}が あるか {相談|そうだん}しよう。"}], phrase:{jp:"{決済|けっさい}で エラーが {出|で}ています。{確認|かくにん}を お{願|ねが}いします。",en:"{決済|けっさい}で エラーが {出|で}ています。{確認|かくにん}を お{願|ねが}いします。"}, },test:{great:'report',ky:'hide'}});


  /* ------------------------------------------------------------------ 4-2 */
  KY.defineStage({
    id: '4-2',
    chapter: 4,
    title: { jp: '「<<いい{感|かん}じに>>」しといて', en: '"Just Make It Nice"' },
    intro: { jp: '{上司|じょうし}が、{新|あたら}しい {画面|がめん}の {仕事|しごと}を {持|も}って きました。', en: 'Your boss comes to you with a new screen to work on.' },
    time: 14000,
    mechanic: 'choice',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      const mon = P.monitor({ x: 180, y: 282, w: 184, h: 120 });
      const L = '#d6d6d6';
      mon.screen.append(
        el('rect', { x: 0, y: 0, width: mon.sw, height: 12, fill: '#dfe5ec' }),
        el('rect', { x: 10, y: 22, width: 64, height: 46, rx: 3, fill: '#f0f0f0', stroke: '#c9c9c9', 'stroke-width': 1.5 }),
        el('path', { d: 'M10 22 L74 68 M74 22 L10 68', stroke: '#d4d4d4', 'stroke-width': 1.5 }),
        el('rect', { x: 86, y: 24, width: 74, height: 6, rx: 3, fill: L }),
        el('rect', { x: 86, y: 37, width: 58, height: 6, rx: 3, fill: '#e3e3e3' }),
        el('rect', { x: 86, y: 50, width: 68, height: 6, rx: 3, fill: '#e3e3e3' }),
        el('rect', { x: 86, y: 61, width: 36, height: 10, rx: 5, fill: '#c3d0ea' }),
        ...[0, 1, 2].map(i => el('rect', { x: 10 + i * 54, y: 80, width: 48, height: 22, rx: 3, fill: '#f6f6f6', stroke: '#dadada', 'stroke-width': 1.5 })),
      );
      scene.add('bg', mon);
      const player = scene.person({ x: 90, y: 470, facing: 1, color: 'player', player: true });
      const boss = scene.person({ x: 276, y: 470, facing: -1, tag: WHO.boss });
      return { player, boss, mon };
    },
    params: {
      script: [
        [300, (s, r) => r.boss.set({ arms: POINT })],
        [400, (s, r) => s.say(r.boss, { jp: 'この{画面|がめん}、いい{感|かん}じにしといて', en: 'Just make this screen look nice, okay?' }, { dur: 4200 })],
        [1700, (s, r) => r.player.mark('sweat')],
      ],
      showAt: 2400,
      options: [
        { id: 'ask', text: { jp: 'いい{感|かん}じとは、どういう{意味|いみ}ですか？', en: 'What do you mean by "nice"?' }, outcome: 'ask' },
        { id: 'yes', text: { jp: 'はい！', en: 'Yes!' }, outcome: 'yes' },
        { id: 'propose', text: { jp: '<<{承知|しょうち}しました>>。たとえば、ボタンを {大|おお}きくして、{色|いろ}を そろえる {感|かん}じで いいですか？', en: 'Understood. For example, bigger buttons and matching colors — is that the idea?' }, outcome: 'great' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        r.boss.set({ arms: null });
        scene.say(r.player, opt.text, { dur: 3000, cls: 'mine' });
        return 3100;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.boss, line: { jp: 'そうそう、そんな {感|かん}じ！ あと、{文字|もじ}も {少|すこ}し {大|おお}きく して', en: 'Yes, exactly! And make the text a bit bigger, too.' } },
      ask: { grade: 'ok', who: WHO.boss, line: { jp: 'どういう{意味|いみ}って…いい{感|かん}じは、いい{感|かん}じだよ（{察|さっ}してよ…）', en: 'What do I mean...? Nice is nice. (Read my mind...)' },
        react(scene, r) { r.boss.mark('dots'); r.player.mark('sweat'); } },
      yes: { grade: 'ky', who: WHO.boss, line: { jp: 'うーん、なんか{違|ちが}うなあ。やり{直|なお}し！（これで{三回目|さんかいめ}）', en: "Hmm, something's off. Redo it! (That's the third time.)" },
        react(scene, r) {
          scene.pop(180, 190, { jp: 'やり{直|なお}し ×3', en: 'Redo x3' });
          r.boss.mark('q');
          r.player.mark('sweat2');
        } },
      silent: { grade: 'ky', who: WHO.boss, line: { jp: '…{聞|き}いてる？', en: '...Are you listening?' },
        react(scene, r) { r.boss.mark('q'); r.player.mark('sweat'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '「<<いい{感|かん}じに>>」は その {場|ば}で {確認|かくにん}', en: 'Check vague requests on the spot' },
      points: [
        { jp: 'その {場|ば}で「たとえば、〇〇で いいですか？」と、{自分|じぶん}の {考|かんが}えを {言|い}って {確認|かくにん}します。', en: 'Right then, check by giving your own idea: "For example, would X be okay?"' },
        { jp: 'いつまでに、どこまで すれば おわりかも {聞|き}きます。', en: 'Also ask by when, and what counts as "done".' },
        { jp: '「どういう {意味|いみ}ですか？」だけだと、{上司|じょうし}も {答|こた}えにくいです。たとえを {出|だ}すと、{答|こた}えやすく なります。', en: 'A bare "What do you mean?" is hard to answer. An example makes it easy.' },
      ],
      phrase: { jp: 'たとえば、こんな {感|かん}じで いいですか？', ro: 'Tatoeba, konna kanji de ii desu ka?', en: 'For example, would something like this work?' },
      why: { jp: '「いい{感|かん}じ」は、{人|ひと}に よって ちがいます。{上司|じょうし}の {頭|あたま}の {中|なか}には イメージが あっても、{言|い}わない ことが あります。こちらから たとえを {出|だ}すと、{上司|じょうし}も「そう、それ」「ちがう、こう」と {言|い}いやすく なります。{一人|ひとり}で {長|なが}く {作|つく}ると、あとで ぜんぶ やり{直|なお}しに なる ことも あります。', en: '"Nice" means different things to different people. Your boss may have a picture in mind and not say it. If you offer an example, they can easily say "yes, that" or "no, like this". Working alone for a long time can mean redoing everything.' },
      dont: { jp: '{何|なに}も {聞|き}かないで、{長|なが}い {時間|じかん} {一人|ひとり}で {作|つく}りつづけない。「どういう {意味|いみ}ですか」だけも、{上司|じょうし}を こまらせます。', en: 'Don\'t work alone for hours without asking. A bare "What do you mean?" also leaves your boss stuck.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        /* your example, said on the spot */
        svg.append(el('rect', { x: 12, y: 40, width: 80, height: 46, rx: 12, fill: '#fff', stroke: C.red, 'stroke-width': 2.5 }));
        svg.append(el('path', { d: 'M30 86 L26 98 L42 86', fill: '#fff', stroke: C.red, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        D.label(svg, 52, 59, 'たとえば', { color: C.red, size: 10 });
        D.label(svg, 52, 75, '〇〇で いい？', { color: C.red, size: 10 });
        D.label(svg, 52, 114, 'あなた', { size: 10 });
        svg.append(el('circle', { cx: 152, cy: 60, r: 13, fill: C.npc }));
        svg.append(el('rect', { x: 134, y: 76, width: 36, height: 22, rx: 10, fill: C.npc }));
        D.label(svg, 152, 114, 'じょうし', { size: 10 });
        D.arrow(svg, 92, 68, 126, 68, { color: C.red });
        D.label(svg, 109, 56, 'その ばで', { color: C.red, size: 10 });
        D.label(svg, 109, 90, 'たしかめる', { color: C.red, size: 10 });
      },
    },
    test: { great: 'propose', ky: 'yes', ok: 'ask' },
  });

  /* ------------------------------------------------------------------ 4-3 */
  const ERR = [[1300, 1], [2600, 4], [4200, 17], [6000, 63], [8200, 214]];

  KY.defineStage({
    id: '4-3',
    chapter: 4,
    title: { jp: '{本番|ほんばん}で エラー！', en: 'An Error in Production!' },
    intro: { jp: '<<{本番|ほんばん}>>の システムに エラーが {出|で}ましたが、{上司|じょうし}は いそがしそうです。', en: 'An error appears in the live system, but your boss looks busy.' },
    time: 13000,
    mechanic: 'timing',
    setup(scene) {
      const { el, g, set } = KY.svg;
      scene.camera({ zoom: 1.3, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 128, y: 190, w: 104, h: 66 }));
      scene.add('mid', P.officeChair({ x: 72, facing: 1 }));
      scene.add('mid', P.officeChair({ x: 288, facing: -1 }));
      scene.add('mid', P.table({ x: 180, y: 422, w: 172 }));

      /* your monitor: code at first, then an error (gray icon + a count that keeps growing) */
      const mine = P.monitor({ x: 148, y: 412, w: 64, h: 56 });
      const code = g({}, [0, 1, 2, 3, 4].map(i => el('rect', { x: 4 + (i % 2) * 6, y: 5 + i * 8.5, width: 22 + ((i * 11) % 20), height: 4, rx: 2, fill: i % 2 ? '#d8dde4' : '#c3cbd6' })));
      const alert = g({ opacity: 0 }, [
        el('rect', { x: 0, y: 0, width: mine.sw, height: mine.sh, fill: '#e6e6e6' }),
        el('path', { d: `M${mine.sw / 2} 8 L${mine.sw - 8} 38 L8 38 Z`, fill: '#fff', stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round' }),
        KY.svg.text(mine.sw / 2, 33, '!', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 900, fill: INK }),
      ]);
      const count = KY.svg.text(mine.sw / 2, 47, 'x0', { 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: INK });
      alert.append(count);
      mine.screen.append(code, alert);
      scene.add('mid', mine);

      const theirs = P.monitor({ x: 212, y: 412, w: 64, h: 56 });
      theirs.screen.append(...[0, 1, 2, 3, 4].map(i => el('rect', { x: 5 + (i % 3) * 5, y: 5 + i * 8.5, width: 18 + ((i * 13) % 24), height: 4, rx: 2, fill: '#d3d8df' })));
      scene.add('mid', theirs);

      const player = scene.person({ x: 72, y: 470, pose: 'sit', facing: 1, color: 'player', player: true });
      const boss = scene.person({ x: 288, y: 470, pose: 'sit', facing: -1, tag: WHO.boss });
      const type = typing(scene, [player, boss]);
      const refs = { player, boss, type, early: false };
      refs.showError = n => {
        if (refs.early) return;                      /* you spoke up before anything happened */
        set(code, { opacity: 0 });
        set(alert, { opacity: 1 });
        count.textContent = 'x' + n;
      };
      return refs;
    },
    params: {
      target: 'player',
      label: 'You (tap to go and report)',
      script: [
        ...ERR.map(([ms, n], i) => [ms, (s, r) => {
          r.showError(n);
          if (r.early) return;
          if (i === 0) { s.flag('cue'); r.player.mark('ex'); KY.sfx.play('ring'); }
          if (i === 2) r.player.mark('sweat');
          if (i === 3) r.player.mark('sweat2');
        }]),
      ],
      judge(tapAt, flags) {
        if (tapAt === null) return 'hide';
        if (flags.cue === undefined) return 'early';
        return tapAt - flags.cue <= 2500 ? 'great' : 'late';
      },
      onTap(scene, r, key) {
        const line = key === 'great'
          ? { jp: 'お{忙|いそが}しいところ、すみません。{至急|しきゅう}、ご{報告|ほうこく}があります', en: 'Sorry to interrupt. I have something urgent to report.' }
          : key === 'late'
            ? { jp: 'あの…{実|じつ}は、さっきから{障害|しょうがい}が…', en: "Um... actually, there's been an outage for a while..." }
            : { jp: 'あの…（{何|なに}もないです）', en: 'Um... (nothing, actually)' };
        if (key === 'early') r.early = true;
        r.type.stop();
        r.player.mark(null);
        r.player.set({ pose: 'stand' });
        scene.layer.fg.append(r.player.el);          /* walk round in front of the desk */
        scene.walk(r.player, 232, 800, () => scene.say(r.player, line, { dur: 2600, cls: 'mine' }));
        return 3500;
      },
      onTimeout(scene, r) {
        scene.say(r.player, { jp: '（{自分|じぶん}で{直|なお}せば、バレない…）', en: "(If I fix it myself, nobody will know...)" }, { kind: 'think', dur: 2200, cls: 'mine' });
        r.player.mark('sweat2');
        return 2300;
      },
    },
    outcomes: {
      great: { grade: 'great', who: WHO.boss, line: { jp: 'わかった、すぐ{状況|じょうきょう}を{見|み}よう。{知|し}らせてくれて ありがとう', en: "Got it, let's look at it right away. Thanks for telling me." } },
      late: { grade: 'ky', who: WHO.boss, line: { jp: 'えっ、いつから！？なんでもっと{早|はや}く{言|い}わなかったの！', en: "What, since when?! Why didn't you say so sooner!" },
        react(scene, r) { r.boss.mark('anger'); r.player.mark('sweat2'); } },
      hide: { grade: 'ky', who: WHO.boss, line: { jp: '…{本番|ほんばん}が{止|と}まってる！？いつから！？', en: '...Production is down?! Since when?!' },
        react(scene, r) { r.type.stop(); r.boss.mark('shock'); r.player.mark('sweat2'); } },
      early: { grade: 'ok', who: WHO.boss, line: { jp: 'ん？{何|なに}もないみたいだけど…どうしたの？', en: "Hm? Nothing seems wrong... What's up?" },
        react(scene, r) { r.boss.mark('q'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '{報告|ほうこく}は {早|はや}く', en: 'Report bad news first, and fast' },
      points: [
        { jp: '{問題|もんだい}を {見|み}つけたら、すぐ {上司|じょうし}に {報告|ほうこく}します。{自分|じぶん}で {直|なお}してから {言|い}うのは、おそいです。', en: 'When you find a problem, report it to your boss right away — not after fixing it yourself.' },
        { jp: 'はじめに、いちばん {大事|だいじ}な こと（{何|なに}が どう なったか）を {言|い}います。{説明|せつめい}は そのあとです。', en: 'Start with the main point — what happened. Details come after.' },
        { jp: '<<お{忙|いそが}しいところ すみません>>と {言|い}えば、{上司|じょうし}が いそがしい ときも {話|はな}しかけて {大丈夫|だいじょうぶ}です。', en: 'Saying "sorry to bother you" lets you speak up even when your boss is busy.' },
      ],
      phrase: { jp: 'お{忙|いそが}しいところ、すみません。{至急|しきゅう}、ご{報告|ほうこく}があります', ro: 'Oisogashii tokoro, sumimasen. Shikyū, go-hōkoku ga arimasu.', en: 'Sorry to interrupt. I have something urgent to report.' },
      why: { jp: '{悪|わる}い ニュースは、{時間|じかん}が たつほど {大|おお}きく なります。{早|はや}く {伝|つた}えれば、{上司|じょうし}や チームが {手伝|てつだ}えます。{日本|にほん}では <<ホウレンソウ>>（{報告|ほうこく}・{連絡|れんらく}・{相談|そうだん}）を {大切|たいせつ}に します。', en: 'Bad news grows the longer you wait. If you tell people early, your boss and team can help. Japanese workplaces value "hō-ren-sō": report, contact, consult.' },
      dont: { jp: '{一人|ひとり}で {直|なお}してから {言|い}おうと して、だまって いない。', en: "Don't stay silent while you try to fix it alone." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        D.arrow(svg, 14, 112, 186, 112, { color: '#bdbdbd' });
        [[44, 7, '#dcdcdc', 'すぐ'], [100, 13, '#a3a3a3', 'すこし あと'], [158, 21, C.ink, 'ずっと あと']].forEach(([x, r, fill, lab]) => {
          svg.append(el('circle', { cx: x, cy: 109 - r, r, fill }));
          D.label(svg, x, 129, lab, { size: 9 });
        });
        D.arrow(svg, 44, 50, 44, 92, { color: C.red });
        D.label(svg, 44, 42, 'ここで！', { color: C.red, size: 11 });
      },
    },
    test: { great: { at: 2400 }, ky: null, ok: { at: 400 } },
  });

  /* ------------------------------------------------------------------ 4-4 */
  const RELAY = [
    { id: 'kakaricho', text: { jp: '{係長|かかりちょう}', en: 'Assistant Manager' } },
    { id: 'kacho', text: { jp: '{課長|かちょう}', en: 'Section Manager' } },
    { id: 'bucho', text: { jp: '{部長|ぶちょう}', en: 'Dept. Manager' } },
    { id: 'shacho', text: { jp: '{社長|しゃちょう}', en: 'President' } },
  ];
  const STEPS = [[90, 360], [150, 297], [210, 234], [270, 171]];

  KY.defineStage({id:'4-4',chapter:4,title:{jp:'ハンコを {順番|じゅんばん}に！',en:'The stamp relay'},intro:{jp:'{稟議書|りんぎしょ}を {持|も}って、4{人|にん}から ハンコを もらおう。{係長|かかりちょう}・{課長|かちょう}・{部長|ぶちょう}・{社長|しゃちょう}の つくえを {順番|じゅんばん}に クリック！',en:'Get four stamps on your approval form. Click each desk in the correct order, starting with the lower rank.'},time:23000,mechanic:'action',
    setup(s){const P=KY.props,{el}=KY.svg;s.add('bg',P.backdrop({floor:470}));const desks=[{id:'shacho',name:'社長',x:180,y:195},{id:'bucho',name:'部長',x:65,y:337},{id:'kacho',name:'課長',x:180,y:337},{id:'kakaricho',name:'係長',x:295,y:337}];
      desks.forEach(d=>{s.add('mid',el('rect',{x:d.x-49,y:d.y-25,width:98,height:54,rx:8,fill:'#e1ded6',stroke:'#96918b','stroke-width':2}));if(KY.roleHeads && KY.roleHeads[d.id]){s.add('top',el('image',{x:d.x-27,y:d.y-95,width:54,height:55,href:KY.roleHeads[d.id],preserveAspectRatio:'xMidYMid meet'}));}else{s.add('top',el('circle',{cx:d.x,cy:d.y-69,r:23,fill:'#fff',stroke:'#777','stroke-width':3}));}s.label(d.x,d.y-1,{jp:'{'+d.name+'|'+({社長:'しゃちょう',部長:'ぶちょう',課長:'かちょう',係長:'かかりちょう'}[d.name])+'}',en:d.name});});
      const me=s.person({x:65,y:470,color:'player',player:true});s.add('mid',el('rect',{x:94,y:490,width:172,height:98,rx:5,fill:'#fff',stroke:'#666','stroke-width':2}));s.label(180,514,{jp:'{稟議書|りんぎしょ}',en:'Approval document'});const stamps=[];for(let i=0;i<4;i++){const n=el('rect',{x:106+i*39,y:534,width:32,height:32,fill:'white',stroke:'#b9b9b9','stroke-width':1.5});s.add('top',n);stamps.push(n);}return {desks,me,stamps};},
    params:{start(s,r){let seq=[],done=false;const expected=['kakaricho','kacho','bucho','shacho'];const click=id=>{if(done||seq.includes(id))return;seq.push(id);const n=r.stamps[seq.length-1];n.setAttribute('fill','#ffe3e3');const x=Number(n.getAttribute('x'))+16;const y=Number(n.getAttribute('y'))+21;KY.mini.label(s,x,y,'印','#c3162d',14);r.me.mark('sparkle');if(seq.length===4){done=true;s.after(350,()=>s.end(seq.every((x,i)=>x===expected[i])?'great':'wrong'));}};r.desks.forEach(d=>KY.mini.hit(s,d.x-55,d.y-35,110,75,()=>click(d.id)));s.timer(s.def.time,()=>{if(!done)s.end('wrong');});s._stamps={click};},simulate(s,r,v){const a=v==='great'?['kakaricho','kacho','bucho','shacho']:['shacho','bucho','kacho','kakaricho'];a.forEach((x,i)=>s.at(350+i*380,()=>s._stamps.click(x)));}},
    outcomes:{great:{grade:'great',line:{jp:'4{人|にん}の ハンコが {集|あつ}まった！',en:'All four stamps collected!'}},wrong:{grade:'ky',line:{jp:'「あれ？ ハンコの {順番|じゅんばん}が ちがうよ！」',en:'“Wait! These stamps are in the wrong order!”'}}},card:{badge: "depends", name: {jp:"ハンコをもらう順番",en:"ハンコをもらう順番"}, points:[{jp:"この ゲームは {係長|かかりちょう} → {課長|かちょう} → {部長|ぶちょう} → {社長|しゃちょう}の {順番|じゅんばん}です。{会社|かいしゃ}で ルールは ちがいます。",en:"この ゲームは {係長|かかりちょう} → {課長|かちょう} → {部長|ぶちょう} → {社長|しゃちょう}の {順番|じゅんばん}です。{会社|かいしゃ}で ルールは ちがいます。"}], phrase:{jp:"{稟議書|りんぎしょ}の {確認|かくにん}を お{願|ねが}いします。",en:"{稟議書|りんぎしょ}の {確認|かくにん}を お{願|ねが}いします。"}, },test:{great:'great',ky:'wrong'}});


  /* ------------------------------------------------------------------ 4-5 */
  const MSG = { jp: '{明日|あした}の {会議|かいぎ}、10{時|じ}からに {変|か}わりました。', en: "Tomorrow's meeting has moved to 10:00." };

  /* a chat bubble inside the monitor's chat window (the screen spans x 111..289, y 192..408).
     side 'left' = the manager's message, 'right' = your reply */
  function chatBubble(scene, { text, side, y, cls = '' }) {
    const node = scene.bubble({ x: side === 'left' ? 111 : 289, y, text, tail: side, cls });
    /* no transition, so "reduce motion" browsers measure the new size at once */
    node.style.setProperty('transition', 'none', 'important');
    node.style.maxWidth = '51%';
    node.style.fontSize = '3.5cqw';
    scene.relayout();   /* the size changed, so place it again */
    return node;
  }

  KY.defineStage({
    id: '4-5',
    chapter: 4,
    title: { jp: '{部長|ぶちょう}からの チャット', en: 'A Chat from the Manager' },
    intro: { jp: '{部長|ぶちょう}から チャットが {来|き}ました。{返事|へんじ}を {書|か}きます。', en: 'Your department manager sent you a chat message. Write a reply.' },
    time: 14000,
    mechanic: 'choice',
    setup(scene) {
      const { el, C } = KY.svg;
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('mid', P.officeChair({ x: 60, facing: 1 }));
      scene.add('mid', P.table({ x: 200, y: 422, w: 190 }));
      /* the chat window: header with the manager's avatar and name pill, input bar at the bottom */
      const mon = P.monitor({ x: 200, y: 412, w: 186, h: 224 });
      const W = mon.sw;
      mon.screen.append(
        el('rect', { x: 0, y: 0, width: W, height: 28, fill: '#dfe5ec' }),
        el('circle', { cx: 15, cy: 14, r: 8, fill: '#8f8f8f' }),
        el('rect', { x: 28, y: 3, width: 74, height: 22, rx: 11, fill: '#fff', stroke: '#c9d0d8', 'stroke-width': 1.2 }),
        el('circle', { cx: 112, cy: 14, r: 3, fill: C.tea }),
        el('rect', { x: 6, y: 192, width: 134, height: 18, rx: 9, fill: '#fff', stroke: '#c9c9c9', 'stroke-width': 1.5 }),
        el('circle', { cx: 158, cy: 201, r: 10, fill: BLUE }),
        el('path', { d: 'M153 201 L163 201 M159 197 L163 201 L159 205', fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      );
      scene.add('mid', mon);
      scene.label(176, 206, WHO.bucho);
      const player = scene.person({ x: 60, y: 470, pose: 'sit', facing: 1, color: 'player', player: true, arms: TYPE[0] });
      return { player, mon };
    },
    params: {
      script: [
        [300, () => KY.sfx.play('pop')],
        [300, s => s.pop(200, 164, { jp: 'ピコン！', en: 'Ping!' })],
        [800, s => chatBubble(s, { text: MSG, side: 'left', y: 268 })],
        [1500, (s, r) => r.player.mark('dots')],
      ],
      showAt: 2400,
      options: [
        { id: 'ryo', text: { jp: 'りょ', en: '"K."' }, outcome: 'ryo' },
        { id: 'ryokai', text: { jp: '{了解|りょうかい}です！', en: 'Roger that!' }, outcome: 'ryokai' },
        { id: 'shochi', text: { jp: '<<{承知|しょうち}しました>>。ご{連絡|れんらく} ありがとうございます。', en: 'Understood. Thank you for letting me know.' }, outcome: 'great' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        chatBubble(scene, { text: opt.text, side: 'right', y: 346, cls: 'mine' });
        return 2000;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.bucho, line: { jp: '（よし、{伝|つた}わったな）', en: '(Good, they got it.)' },
        react(scene, r) { r.player.mark('sparkle'); } },
      ryokai: { grade: 'ok', who: WHO.bucho, line: { jp: '（「{了解|りょうかい}」か…。まあ、いいけど）', en: '("Roger," huh... well, fine.)' },
        react(scene, r) { r.player.mark('sweat'); } },
      ryo: { grade: 'ky', who: WHO.bucho, line: { jp: '…「りょ」？ {何|なん}の {暗号|あんごう}？', en: '..."K"? Is that some kind of code?' },
        react(scene, r) { scene.pop(200, 164, { jp: '？', en: '?' }); r.player.mark('sweat2'); } },
      silent: { grade: 'ky', who: WHO.bucho, line: { jp: '（{既読|きどく}は ついてる のに、{返事|へんじ}が ない…）', en: "(It says 'read', but no reply...)" },
        react(scene, r) { scene.pop(200, 164, { jp: '{既読|きどく}', en: 'Read' }); r.player.mark('dots'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: '「<<{了解|りょうかい}>>」と「<<{承知|しょうち}しました>>」', en: '"Ryōkai" vs "shōchi shimashita"' },
      points: [
        { jp: '{上|うえ}の {人|ひと}や お{客様|きゃくさま}には「<<{承知|しょうち}しました>>」と {返事|へんじ}します。', en: 'To seniors and clients, reply "shōchi shimashita".' },
        { jp: '「{了解|りょうかい}です」を {失礼|しつれい}だと {思|おも}う {人|ひと}も います。おなじ チームの {人|ひと}には、よく {使|つか}われます。', en: 'Some people find "ryōkai desu" rude to seniors; it is common among teammates.' },
        { jp: 'チャットを {読|よ}んだら、みじかくても はやめに {返事|へんじ}を します。', en: 'Once you read a chat, reply early, even briefly.' },
      ],
      phrase: { jp: '<<{承知|しょうち}しました>>', ro: 'shōchi shimashita', en: 'Understood. (polite)' },
      why: { jp: '「{了解|りょうかい}」は、{上|うえ}の {人|ひと}が {下|した}の {人|ひと}に {使|つか}う ことば だと {感|かん}じる {人|ひと}が います。「<<{承知|しょうち}しました>>」なら、だれに {使|つか}っても {失礼|しつれい}に なりません。', en: 'Some feel "ryōkai" is what a boss says to a junior. "Shōchi shimashita" is polite to anyone.' },
      dont: { jp: '「りょ」「OK」など、みじかすぎる ことばを {上|うえ}の {人|ひと}に {送|おく}らない。{読|よ}んだのに {返事|へんじ}を しない ことも しない。', en: 'Don\'t send "ryo" or "OK" to seniors, and don\'t leave a message read without replying.' },
      tip: { jp: '「{了解|りょうかい}です」で {大丈夫|だいじょうぶ}な {会社|かいしゃ}や チームも あります。まわりの {人|ひと}の {書|か}き{方|かた}を {見|み}て まねしましょう。', en: 'If unsure: some teams are fine with "ryōkai desu". Watch how others write and follow them.' },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        /* the manager's message */
        svg.append(el('circle', { cx: 14, cy: 27, r: 8, fill: '#8f8f8f' }));
        svg.append(el('rect', { x: 28, y: 12, width: 100, height: 30, rx: 10, fill: '#eef0f3', stroke: '#cfd4da', 'stroke-width': 2 }));
        D.label(svg, 78, 31, 'あした 10じから', { size: 10, color: C.ink });
        /* the good reply */
        svg.append(el('rect', { x: 52, y: 54, width: 140, height: 34, rx: 11, fill: '#fff', stroke: C.red, 'stroke-width': 2.5 }));
        D.label(svg, 122, 75, 'しょうちしました', { size: 12, color: C.red, weight: 900 });
        /* the too-short reply, crossed out */
        svg.append(el('rect', { x: 124, y: 102, width: 68, height: 28, rx: 10, fill: '#f4f4f4', stroke: '#cfcfcf', 'stroke-width': 2 }));
        D.label(svg, 158, 121, 'りょ', { size: 12, color: '#8a8a8a' });
        svg.append(el('path', { d: 'M92 108 l18 18 M110 108 l-18 18', stroke: '#8a8a8a', 'stroke-width': 4.5, 'stroke-linecap': 'round', fill: 'none' }));
      },
    },
    test: { great: 'shochi', ok: 'ryokai', ky: 'ryo' },
  });

  /* ------------------------------------------------------------------ 4-6 */
  KY.defineStage({
    id: '4-6',
    chapter: 4,
    title: { jp: 'Excel{方眼紙|ほうがんし}', en: 'Excel Graph Paper' },
    intro: { jp: 'お{客様|きゃくさま}が、{設計書|せっけいしょ}の ファイルを {送|おく}って きました。', en: 'The client has sent you a design-document file.' },
    time: 14000,
    mechanic: 'choice',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.2, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      const mon = P.monitor({ x: 180, y: 290, w: 196, h: 128 });
      const W = mon.sw, H = mon.sh;
      let d = '';
      for (let x = 0; x <= W; x += 6) d += `M${x} 11V${H}`;
      for (let y = 11; y <= H; y += 6) d += `M0 ${y}H${W}`;
      const box = (x, y, w, h, fill = '#fff') => el('rect', { x, y, width: w, height: h, fill, stroke: INK, 'stroke-width': 1.3 });
      const bar = (x, y, w) => el('rect', { x, y, width: w, height: 3, rx: 1.5, fill: '#b9b9b9' });
      mon.screen.append(
        el('rect', { x: 0, y: 0, width: W, height: 11, fill: '#dbe7db' }),
        el('path', { d, stroke: '#c7d3c7', 'stroke-width': 0.7, fill: 'none' }),
        box(12, 18, 112, 12), bar(18, 22.5, 60),
        box(132, 18, 44, 28), bar(138, 30, 30),
        box(12, 36, 112, 40), el('path', { d: 'M12 49 H124 M12 62 H124 M44 36 V76', stroke: INK, 'stroke-width': 1, fill: 'none' }),
        bar(18, 41, 18), bar(50, 41, 50), bar(18, 54, 18), bar(50, 54, 40), bar(18, 67, 18), bar(50, 67, 56),
        box(12, 84, 164, 30), el('path', { d: 'M12 94 H176 M12 104 H176', stroke: INK, 'stroke-width': 1, fill: 'none' }),
        bar(18, 87, 70), bar(18, 97, 100), bar(18, 107, 52),
      );
      scene.add('bg', mon);
      scene.label(180, 146, { jp: '{設計書|せっけいしょ}.xlsx', en: 'design-doc.xlsx' }, 'deadline');
      const player = scene.person({ x: 84, y: 470, facing: 1, color: 'player', player: true });
      const client = scene.person({ x: 292, y: 470, facing: -1, tag: WHO.client });
      return { player, client };
    },
    params: {
      script: [
        [300, (s, r) => r.client.set({ arms: POINT })],
        [400, (s, r) => s.say(r.client, { jp: '{設計書|せっけいしょ}は、この{形|かたち}でお{願|ねが}いします', en: 'Please make the design document in this format.' }, { dur: 4200 })],
        [1800, (s, r) => r.player.mark('sweat')],
      ],
      showAt: 2400,
      options: [
        { id: 'own', text: { jp: '（{勝手|かって}に{別|べつ}の{形|かたち}で{出|だ}す）', en: '(Quietly hand in a different format)' }, outcome: 'own' },
        { id: 'object', text: { jp: 'この{形|かたち}は{作|つく}りにくいので、ほかの{形|かたち}にしませんか？', en: "This format is hard to work with — shall we use another one?" }, outcome: 'object' },
        { id: 'consult', text: { jp: '<<{承知|しょうち}しました>>。この{形|かたち}で{作|つく}ります。{作|つく}りにくい ところが あったら、ご{相談|そうだん}しても よろしいでしょうか？', en: "Understood, I'll use this format. If some parts are hard to work with, may I consult you?" }, outcome: 'great' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        r.client.set({ arms: null });
        scene.say(r.player, opt.text, opt.id === 'own' ? { kind: 'think', dur: 2800, cls: 'mine' } : { dur: 2800, cls: 'mine' });
        return 2900;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.client, line: { jp: 'もちろんです。{社内|しゃない}の {決|き}まりで この{形|かたち}なんですが、{気|き}に なる ところは {言|い}って くださいね', en: "Of course. We use this format because of an internal rule, but please tell us anything that bothers you." } },
      object: { grade: 'ok', who: WHO.client, line: { jp: '…うーん、{他|ほか}のお{客様|きゃくさま}も{全部|ぜんぶ}この{形|かたち}なんですよ', en: '...Hmm, all our other clients use this format too.' },
        react(scene, r) { r.client.mark('q'); r.player.mark('sweat'); } },
      own: { grade: 'ky', who: WHO.client, line: { jp: '{形|かたち}が{違|ちが}いますよ。{社内|しゃない}で{通|とお}せません…', en: "The format is different. I can't get this through internally..." },
        react(scene, r) { r.client.mark('anger'); r.player.mark('sweat2'); } },
      silent: { grade: 'ky', who: WHO.client, line: { jp: '…あの、{聞|き}こえてます？', en: '...Um, can you hear me?' },
        react(scene, r) { r.client.mark('q'); r.player.mark('sweat'); } },
    },
    card: {
      badge: 'depends',
      name: { jp: 'お{客様|きゃくさま}の フォーマット', en: "Use the client's format first" },
      points: [
        { jp: 'お{客様|きゃくさま}が {決|き}めた フォーマットが ある ときは、まず それで {作|つく}ります。', en: 'When the client has a fixed format, use it first.' },
        { jp: '{使|つか}いにくい ところは、「ご{相談|そうだん}しても いいですか？」と はじめに {伝|つた}えて おきます。', en: 'Say early on that you may want to consult about parts that are hard to use.' },
        { jp: 'いい {考|かんが}えが あったら、{理由|りゆう}と いっしょに {話|はな}します。だまって がまんしなくて いいです。', en: 'If you have a better idea, share it with your reasons. You do not have to put up with it in silence.' },
      ],
      phrase: { jp: '{作|つく}りにくい ところが あったら、ご{相談|そうだん}しても よろしいでしょうか？', ro: 'Tsukurinikui tokoro ga attara, go-sōdan shite mo yoroshii deshō ka?', en: 'If some parts are hard to work with, may I consult you?' },
      why: { jp: 'お{客様|きゃくさま}の {会社|かいしゃ}には、その フォーマットで {確認|かくにん}する {決|き}まった やり{方|かた}が あります。{形|かたち}を {勝手|かって}に {変|か}えると、お{客様|きゃくさま}の {仕事|しごと}が {増|ふ}えます。ただ、Excel {方眼紙|ほうがんし}は {直|なお}しにくい、という {声|こえ}も {多|おお}いです。こまった ところは、{理由|りゆう}と いっしょに {相談|そうだん}しましょう。', en: "The client has a set way of reviewing documents in that format, and changing it on your own creates work for them. Still, many people say Excel graph-paper sheets are hard to edit, so raise real problems together with your reasons." },
      dont: { jp: '{勝手|かって}に ちがう {形|かたち}で {出|だ}さない。{理由|りゆう}を {聞|き}かずに「ほかの {形|かたち}に しましょう」とも {言|い}わない。', en: "Never hand in a different format on your own, and don't push for another format before asking why." },
      tip: { jp: 'まず お{客様|きゃくさま}の {形|かたち}で {作|つく}ります。{仕事|しごと}が うまく いった {後|あと}で、{理由|りゆう}と いっしょに アイデアを {伝|つた}えましょう。', en: "Build it in the client's format first. After the work goes well, share your idea together with your reasons." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        let d = '';
        for (let i = 0; i <= 10; i++) d += `M${18 + i * 8} 26V90`;
        for (let j = 0; j <= 8; j++) d += `M18 ${26 + j * 8}H98`;
        svg.append(el('path', { d, stroke: '#cfd9cf', 'stroke-width': 1, fill: 'none' }));
        svg.append(el('rect', { x: 26, y: 34, width: 48, height: 16, fill: '#fff', stroke: C.ink, 'stroke-width': 1.6 }));
        svg.append(el('rect', { x: 26, y: 58, width: 64, height: 24, fill: '#fff', stroke: C.ink, 'stroke-width': 1.6 }));
        D.arrow(svg, 104, 58, 128, 58, { color: C.ink });
        svg.append(el('rect', { x: 134, y: 36, width: 50, height: 44, rx: 8, fill: '#fff', stroke: C.ink, 'stroke-width': 2.5 }));
        D.label(svg, 159, 66, 'OK', { color: C.ink, size: 18, weight: 900 });
        D.label(svg, 58, 108, 'まず この かたちで', { size: 10, color: '#555' });
        D.label(svg, 148, 108, 'あとで そうだん', { size: 10, color: C.ink });
      },
    },
    test: { great: 'consult', ky: 'own', ok: 'object' },
  });

  /* ------------------------------------------------------------------ 4-7 */
  KY.defineStage({
    id: '4-7',
    chapter: 4,
    title: { jp: '「{大丈夫|だいじょうぶ}です」の {意味|いみ}', en: 'What "Daijōbu" Means' },
    intro: { jp: 'コーヒーを {買|か}いに {行|い}く ところです。{同僚|どうりょう}は {仕事|しごと}を して います。', en: 'You are about to go and buy a coffee. Your colleague is hard at work.' },
    time: 15000,
    mechanic: 'choice',
    setup(scene) {
      const { el } = KY.svg;
      scene.camera({ zoom: 1.25, x: 180, y: 400 });
      scene.add('bg', P.backdrop({ floor: 470 }));
      scene.add('bg', P.window({ x: 56, y: 206, w: 84, h: 64 }));
      scene.add('mid', P.officeChair({ x: 285, facing: -1 }));
      scene.add('mid', P.table({ x: 205, y: 422, w: 100 }));
      const mon = P.monitor({ x: 232, y: 412, w: 58, h: 42 });
      mon.screen.append(...[0, 1, 2].map(i => el('rect', { x: 4, y: 5 + i * 9, width: 24 + i * 6, height: 4, rx: 2, fill: '#d3d8df' })));
      scene.add('mid', mon);
      const empty = mug({ x: 166, y: 422 });
      scene.add('mid', empty);
      const player = scene.person({ x: 96, y: 470, facing: 1, color: 'player', player: true });
      const mate = scene.person({ x: 285, y: 470, pose: 'sit', facing: -1, arms: TYPE[0], tag: WHO.colleague });
      return { player, mate };
    },
    params: {
      script: [
        [300, (s, r) => s.say(r.player, { jp: 'コーヒー、{買|か}ってきましょうか？', en: 'Shall I go and get you a coffee?' }, { dur: 2400, cls: 'mine' })],
        [2900, (s, r) => { r.mate.set({ arms: null }); s.say(r.mate, { jp: 'あ、{大丈夫|だいじょうぶ}です。さっき{飲|の}んだので', en: "Oh, I'm fine. I just had one." }, { dur: 3400 }); }],
        [4200, (s, r) => r.player.mark('q')],
      ],
      showAt: 4800,
      options: [
        { id: 'yes', text: { jp: 'ほしい、という{意味|いみ}だ！{買|か}ってこよう', en: 'It means "I want one"! I\'ll go buy it.' }, outcome: 'yes' },
        { id: 'health', text: { jp: '{体|からだ}の{調子|ちょうし}が{大丈夫|だいじょうぶ}、という{意味|いみ}かな', en: 'Maybe it means "I\'m feeling fine"?' }, outcome: 'health' },
        { id: 'no', text: { jp: 'いらない、という{意味|いみ}だ', en: 'It means "I don\'t want one".' }, outcome: 'great' },
      ],
      onChoose(scene, r, opt) {
        r.player.mark(null);
        scene.say(r.player, opt.text, { kind: 'think', dur: 3000, cls: 'mine' });
        return 3100;
      },
      timeout: 'silent',
    },
    outcomes: {
      great: { grade: 'great', who: WHO.colleague, line: { jp: '{気|き}を{使|つか}わせてすみません。{今度|こんど}、お{願|ねが}いします', en: 'Sorry to make you go out of your way. Next time, please.' } },
      health: { grade: 'ok', who: WHO.colleague, line: { jp: '…？はい、{元気|げんき}ですよ。（なんの{話|はなし}だろう）', en: "...? Yes, I'm fine. (What's this about?)" },
        react(scene, r) { r.mate.mark('q'); r.player.mark('sweat'); } },
      yes: { grade: 'ky', who: WHO.colleague, line: { jp: 'えっ、{買|か}ってきたの？…さっき{飲|の}んだって{言|い}ったのに…（{二杯目|にはいめ}）', en: 'Oh, you bought one? ...I said I just had one... (Cup number two.)' },
        react(scene, r) {
          const c = mug({ x: 202, y: 422, steam: true });
          scene.add('mid', c);
          r.mate.mark('sweat2');
          r.player.mark('sweat');
        } },
      silent: { grade: 'ok', who: WHO.colleague, line: { jp: '…あの、{何|なに}か？', en: '...Um, can I help you?' },
        react(scene, r) { r.mate.mark('q'); } },
    },
    card: {
      badge: 'must',
      name: { jp: '「{大丈夫|だいじょうぶ}です」の {意味|いみ}', en: 'What "daijōbu desu" really means' },
      points: [
        { jp: '「{大丈夫|だいじょうぶ}です」は、「いりません」「はい、おねがいします」「げんきです」の {三|みっ}つの {意味|いみ}で {使|つか}えます。', en: '"Daijōbu desu" can mean "no thanks", "yes, that is fine", or "I am okay".' },
        { jp: '{意味|いみ}は {場面|ばめん}と {顔|かお}や {声|こえ}で {分|わ}かります。{断|ことわ}る ときの「{大丈夫|だいじょうぶ}です」が とても {多|おお}いです。', en: 'Read the situation, the face and the voice. A refusal is the most common meaning.' },
        { jp: 'わからない ときは、もう {一度|いちど} ていねいに {聞|き}きます。{自分|じぶん}では「はい、おねがいします」「いえ、{結構|けっこう}です」と はっきり {言|い}えます。', en: 'If unsure, ask again politely. You can say "Yes, please" or "No, thank you" clearly yourself.' },
      ],
      phrase: { jp: 'はい、お{願|ねが}いします／いえ、{結構|けっこう}です', ro: 'Hai, onegai shimasu / Ie, kekkō desu', en: 'Yes, please. / No, thank you.' },
      why: { jp: 'はっきり「いりません」と {言|い}うと、{強|つよ}い {感|かん}じが します。だから やわらかい「{大丈夫|だいじょうぶ}です」を {使|つか}う {人|ひと}が {多|おお}いです。', en: 'A flat "I do not want it" can sound harsh, so many people soften it with "daijōbu desu".' },
      dont: { jp: '「{大丈夫|だいじょうぶ}です」を ひとつの {意味|いみ}だけで {決|き}めない。{何|なに}も {聞|き}かずに コーヒーを {買|か}いに {行|い}かない。', en: "Don't decide on one meaning for \"daijōbu desu\", and don't rush off to buy the coffee without checking." },
      diagram(svg) {
        const D = KY.diag, C = KY.svg.C, { el } = KY.svg;
        svg.append(el('rect', { x: 46, y: 12, width: 108, height: 30, rx: 12, fill: '#fff', stroke: C.ink, 'stroke-width': 2.5 }));
        D.label(svg, 100, 33, 'だいじょうぶ', { color: C.ink, size: 14, weight: 900 });
        [[14, 'いらない'], [72, 'おねがい'], [130, 'げんき']].forEach(([x, lab], i) => {
          svg.append(el('rect', { x, y: 88, width: 56, height: 32, rx: 7, fill: i === 0 ? C.ink : '#fff', stroke: i === 0 ? C.ink : '#9a9a9a', 'stroke-width': 2.2 }));
          D.label(svg, x + 28, 108, lab, { color: i === 0 ? '#fff' : '#555', size: 10.5 });
          D.arrow(svg, 100, 46, x + 28, 84, { color: i === 0 ? C.ink : '#bdbdbd' });
        });
        D.label(svg, 100, 140, 'よく ある いみ ↑', { size: 9 });
      },
    },
    test: { great: 'no', ky: 'yes', ok: 'health' },
  });

  /* ------------------------------------------------------------------ 4-8 */
  /* 4-8 figure: a bad way and a good way to take a day off, side by side (kana only inside the SVG) */
  function figLeave(svg) {
    const D = KY.diag, { el, C } = KY.svg;
    const G = '#9a9a9a';
    const cal = (cx, cy, good) => {
      svg.append(
        el('rect', { x: cx - 16, y: cy - 14, width: 32, height: 28, rx: 3, fill: '#fff', stroke: G, 'stroke-width': 2 }),
        el('rect', { x: cx - 16, y: cy - 14, width: 32, height: 7, rx: 2, fill: '#bdbdbd' }),
      );
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) svg.append(el('rect', { x: cx - 12 + c * 7, y: cy - 3 + r * 7, width: 4.5, height: 4.5, rx: 1, fill: '#e3e3e3' }));
      if (good) svg.append(el('circle', { cx: cx + 9.5, cy: cy + 6, r: 5.5, fill: 'none', stroke: C.red, 'stroke-width': 2 }));
      else svg.append(el('path', { d: `M${cx - 9} ${cy - 2}l12 12M${cx + 3} ${cy - 2}l-12 12`, stroke: '#555', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
    };
    const papers = (cx, cy) => {
      [[-8, -2], [-4, -6], [0, -10]].forEach(([dx, dy]) => svg.append(el('rect', { x: cx + dx - 10, y: cy + dy, width: 22, height: 26, rx: 2, fill: '#fff', stroke: G, 'stroke-width': 2 })));
      D.label(svg, cx + 17, cy - 2, '!', { size: 16, color: '#555', weight: 900 });
    };
    const done = (cx, cy) => {
      svg.append(el('rect', { x: cx - 11, y: cy - 14, width: 22, height: 28, rx: 2, fill: '#fff', stroke: G, 'stroke-width': 2 }));
      svg.append(el('path', { d: `M${cx - 6} ${cy + 1}l4 5l9 -11`, fill: 'none', stroke: C.red, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    };
    const worried = (cx, cy) => {
      [[-8, 0], [9, 2]].forEach(([dx, dy]) => svg.append(
        el('circle', { cx: cx + dx, cy: cy + dy - 6, r: 6.5, fill: C.npc2 }),
        el('rect', { x: cx + dx - 7, y: cy + dy + 2, width: 14, height: 10, rx: 5, fill: C.npc2 }),
      ));
      svg.append(el('path', { d: `M${cx + 19} ${cy - 16}q-3 5 0 7q3 -2 0 -7z`, fill: '#7fb2e5' }));
    };
    const handover = (cx, cy) => {
      svg.append(el('rect', { x: cx - 18, y: cy - 10, width: 14, height: 18, rx: 2, fill: '#fff', stroke: C.red, 'stroke-width': 2 }));
      D.arrow(svg, cx - 1, cy - 1, cx + 7, cy - 1, { color: C.red });
      svg.append(el('circle', { cx: cx + 15, cy: cy - 7, r: 6, fill: C.npc2 }), el('rect', { x: cx + 8, y: cy + 1, width: 14, height: 10, rx: 5, fill: C.npc2 }));
    };
    const panel = (x, good) => {
      svg.append(el('rect', { x, y: 6, width: 150, height: 232, rx: 12, fill: good ? '#fff7f8' : '#f6f6f4', stroke: good ? C.red : G, 'stroke-width': good ? 3 : 2 }));
      D.label(svg, x + 75, 34, good ? 'いい れい' : 'だめな れい', { size: 13, color: good ? C.red : '#555', weight: 900 });
      svg.append(el('line', { x1: x + 14, y1: 46, x2: x + 136, y2: 46, stroke: good ? '#f4c3c8' : '#dedede', 'stroke-width': 2 }));
    };
    const text = (x, y, l1, l2, good) => {
      D.label(svg, x, y - 3, l1, { size: 11, anchor: 'start', color: good ? C.ink : '#555', weight: 900 });
      D.label(svg, x, y + 12, l2, { size: 11, anchor: 'start', color: good ? C.ink : '#555', weight: 900 });
    };
    panel(6, false); panel(164, true);
    const ROWS = [80, 142, 204];
    cal(40, ROWS[0], false); text(66, ROWS[0], 'まえの ひに', 'きゅうに やすむ', false);
    papers(40, ROWS[1]); text(66, ROWS[1], 'しごとが', 'のこった まま', false);
    worried(40, ROWS[2]); text(66, ROWS[2], 'まわりが', 'こまる', false);
    cal(198, ROWS[0], true); text(224, ROWS[0], 'はやめに', 'つたえる', true);
    done(198, ROWS[1]); text(224, ROWS[1], 'しごとを', 'おわらせる', true);
    handover(196, ROWS[2]); text(224, ROWS[2], 'ひきつぎを', 'する', true);
  }

  KY.defineStage({id:'4-8',chapter:4,title:{jp:'{旅行|りょこう}の {次|つぎ}の {日|ひ}',en:'Back from vacation'},intro:{jp:'{昨日|きのう}は {有給休暇|ゆうきゅうきゅうか}で {旅行|りょこう}に {行|い}きました。{今日|きょう}は {出勤|しゅっきん}。{同僚|どうりょう}は {昨日|きのう}、あなたの {仕事|しごと}も {手伝|てつだ}って くれました。',en:'You took paid leave yesterday for a trip. Your colleague helped with some work. You are back today.'},time:15000,mechanic:'choice',
    setup(s){const P=KY.props,{el}=KY.svg;s.add('bg',P.backdrop({floor:470}));s.add('bg',P.window({x:138,y:205,w:90,h:80}));s.add('mid',P.table({x:235,y:424,w:165}));const me=s.person({x:85,y:470,color:'player',player:true});const colleague=s.person({x:270,y:470,pose:'sit',facing:-1,tag:{jp:'{同僚|どうりょう}',en:'Colleague'}});s.say(me,{jp:'（{昨日|きのう}は {楽|たの}しかったな〜！）',en:'(Yesterday was so fun!)'},{kind:'think',dur:3300});return {me,colleague};},
    params:{showAt:1400,shuffle:false,options:[{id:'thanks',text:{jp:'🎁 A：お{土産|みやげ}を わたして、お{礼|れい}を {言|い}う',en:'A: Gift and thanks'},outcome:'great'},{id:'bow',text:{jp:'🙇 B：お{土産|みやげ}を {頭|あたま}に のせて {土下座|どげざ}',en:'B: Dramatic bow with gift on head'},outcome:'shock'},{id:'none',text:{jp:'🕶️ C：{何|なに}も {言|い}わず、{席|せき}に すわる',en:'C: Say nothing; sit down'},outcome:'cold'}],onChoose(s,r,opt){if(opt.id==='thanks'){s.say(r.me,{jp:'{昨日|きのう}は ありがとうございました！ {旅行|りょこう}の お{土産|みやげ}です。よかったら どうぞ！',en:'Thanks for yesterday! A little gift from my trip!'},{dur:2600,cls:'mine'});s.after(1100,()=>s.say(r.colleague,{jp:'ありがとう！ {旅行|りょこう}、{楽|たの}しかった？',en:'Thank you! How was your trip?'},{dur:1300}));return 3200;}r.colleague.mark(opt.id==='bow'?'shock':'q');return 2100;},timeout:'cold'},
    outcomes:{great:{grade:'great',line:{jp:'「ありがとう！ {旅行|りょこう}、{楽|たの}しかった？」ふたりとも {笑顔|えがお}！',en:'“Thank you! Did you enjoy your trip?” Both smile!'}},shock:{grade:'ky',line:{jp:'「えっ！？ どうしたの！？」 {同僚|どうりょう}も びっくり。',en:'“What!? What happened?” The colleague is shocked!'}},cold:{grade:'ky',line:{jp:'「あれ？ {昨日|きのう}の {仕事|しごと}、{手伝|てつだ}ったのに…」',en:'“I helped with the work yesterday, though...”'}}},card:{badge: "depends", name: {jp:"手伝ってくれた人にお礼",en:"手伝ってくれた人にお礼"}, points:[{jp:"{有給休暇|ゆうきゅうきゅうか}は、お{金|かね}を もらいながら {休|やす}める {日|ひ}です。{手伝|てつだ}って くれた {人|ひと}に お{礼|れい}を {言|い}おう。<<お{土産|みやげ}>>は、{旅行|りょこう}で {買|か}った プレゼントです。",en:"{有給休暇|ゆうきゅうきゅうか}は、お{金|かね}を もらいながら {休|やす}める {日|ひ}です。{手伝|てつだ}って くれた {人|ひと}に お{礼|れい}を {言|い}おう。<<お{土産|みやげ}>>は、{旅行|りょこう}で {買|か}った プレゼントです。"}], phrase:{jp:"{昨日|きのう}は ありがとうございました！ よかったら どうぞ。",en:"{昨日|きのう}は ありがとうございました！ よかったら どうぞ。"}, },test:{great:'thanks',ky:'bow'}});

})(typeof window !== 'undefined' ? window : globalThis);
