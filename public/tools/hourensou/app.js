/* =====================================================
   ネクストメイク入社研修 - JavaScript
   ===================================================== */

// N4+ Vocabulary Data (words that N4 students might not know)
// N4+ Vocabulary Data (words that N4 students might not know)
const vocabularyData = {
    // ... existing words
    '目的': { reading: 'もくてき', meaning: 'Purpose' },
    '情報': { reading: 'じょうほう', meaning: 'Information' },
    'シェア': { reading: 'シェア', meaning: 'Share' },
    '辛い': { reading: 'つらい', meaning: 'Painful / Hard / Tough' },
    '焦っている': { reading: 'あせっている', meaning: 'Panicking / In a hurry' },
    '必要': { reading: 'ひつよう', meaning: 'Necessary' },
    '遅れ': { reading: 'おくれ', meaning: 'Delay' },
    '一生懸命': { reading: 'いっしょうけんめい', meaning: 'With all one\'s effort' },
    '困って': { reading: 'こまって', meaning: 'Troubled / In trouble' },
    '気持ち': { reading: 'きもち', meaning: 'Feeling / Emotion' },
    '助けられる': { reading: 'たすけられる', meaning: 'Can be saved / Can be helped' },
    '無理': { reading: 'むり', meaning: 'Impossible' },
    '発生': { reading: 'はっせい', meaning: 'Occur / Happen' },
    '奪わ': { reading: 'うばわ', meaning: 'Steal / Take away (time)' },
    '文章': { reading: 'ぶんしょう', meaning: 'Sentence / Text' },
    '通知': { reading: 'つうち', meaning: 'Notification' },
    '機能': { reading: 'きのう', meaning: 'Function' },
    '他': { reading: 'ほか', meaning: 'Other' },
    '部署': { reading: 'ぶしょ', meaning: 'Department' },
    'フォーマル': { reading: 'フォーマル', meaning: 'Formal' },
    '社外': { reading: 'しゃがい', meaning: 'Outside the company' },
    '活用': { reading: 'かつよう', meaning: 'Utilization / Practical use' },
    '本文': { reading: 'ほんぶん', meaning: 'Body text' },
    'スムーズ': { reading: 'スムーズ', meaning: 'Smooth' },
    '読みやすい': { reading: 'よみやすい', meaning: 'Easy to read' },
    'カッコ': { reading: 'カッコ', meaning: 'Brackets / Parentheses' },
    // ... existing words continue
    '昇格': { reading: 'しょうかく', meaning: 'promotion (to a higher position)' },
    '新入社員': { reading: 'しんにゅうしゃいん', meaning: 'new employee' },
    '入社': { reading: 'にゅうしゃ', meaning: 'join a company' },
    '研修': { reading: 'けんしゅう', meaning: 'training' },
    '講師': { reading: 'こうし', meaning: 'instructor / lecturer' },
    '知識': { reading: 'ちしき', meaning: 'knowledge' },
    '企業': { reading: 'きぎょう', meaning: 'company / enterprise' },
    '社員': { reading: 'しゃいん', meaning: 'employee' },
    '恥ずかしがらずに': { reading: 'はずかしがらずに', meaning: 'without being embarrassed' },
    '失敗': { reading: 'しっぱい', meaning: 'failure / mistake' },
    '準備': { reading: 'じゅんび', meaning: 'preparation' },
    '第一歩': { reading: 'だいいっぽ', meaning: 'first step' },
    '就業形態': { reading: 'しゅうぎょうけいたい', meaning: 'employment type / work style' },
    'プロジェクトマネージャー': { reading: 'プロジェクトマネージャー', meaning: 'project manager' },
    'プログラマー': { reading: 'プログラマー', meaning: 'programmer' },
    'エンジニア': { reading: 'エンジニア', meaning: 'engineer' },
    '報連相': { reading: 'ほうれんそう', meaning: 'Report, Contact, Consult' },
    '報告': { reading: 'ほうこく', meaning: 'Report' },
    '連絡': { reading: 'れんらく', meaning: 'Contact' },
    '相談': { reading: 'そうだん', meaning: 'Consult' },
    '上司': { reading: 'じょうし', meaning: 'Boss / Superior' },
    '指示': { reading: 'しじ', meaning: 'Instruction' },
    '事実': { reading: 'じじつ', meaning: 'Fact' },
    '予定': { reading: 'よてい', meaning: 'Schedule / Plan' },
    '意見': { reading: 'いけん', meaning: 'Opinion' },
    'チームワーク': { reading: 'チームワーク', meaning: 'Teamwork' },
    '許可': { reading: 'きょか', meaning: 'Permission' },
    '確認': { reading: 'かくにん', meaning: 'Check / Confirmation' },
    '完了': { reading: 'かんりょう', meaning: 'Completion' },
    'プログラミング': { reading: 'プログラミング', meaning: 'Programming' },
    '遅れる': { reading: 'おくれる', meaning: 'be late / be delayed' },
    '隠す': { reading: 'かくす', meaning: 'hide / conceal' },
    '怒られる': { reading: 'おこられる', meaning: 'get scolded' },
    '正直': { reading: 'しょうじき', meaning: 'honest' },
    '設定': { reading: 'せってい', meaning: 'setting / configuration' },
    '入力': { reading: 'にゅうりょく', meaning: 'input / entry' },
    '直す': { reading: 'なおす', meaning: 'fix / repair' },
    '取締役': { reading: 'とりしまりやく', meaning: 'Director / Board Member' },
    '文字': { reading: 'もじ', meaning: 'character / letter' },
    '謝る': { reading: 'あやまる', meaning: 'apologize' },
    '言い訳': { reading: 'いいわけ', meaning: 'excuse' },
    '解決': { reading: 'かいけつ', meaning: 'solution / resolution' },
    'アサイン': { reading: 'アサイン', meaning: 'Assign' },
    '経営': { reading: 'けいえい', meaning: 'Management / Administration' },
    '営業': { reading: 'えいぎょう', meaning: 'Sales / Business' },
    '直接': { reading: 'ちょくせつ', meaning: 'Direct / Directly' },
    '問題': { reading: 'もんだい', meaning: 'Problem / Issue' },
    '感情': { reading: 'かんじょう', meaning: 'Emotion / Feeling' },
    'エラー': { reading: 'エラー', meaning: 'Error' },
    '調査': { reading: 'ちょうさ', meaning: 'Investigation' },
    '原因': { reading: 'げんいん', meaning: 'Cause' },
    '見込み': { reading: 'みこみ', meaning: 'Prospect / Estimate' },
    '反応': { reading: 'はんのう', meaning: 'Reaction' },
    '慰める': { reading: 'なぐさめる', meaning: 'Comfort / Console' },
    '無視': { reading: 'むし', meaning: 'Ignore' },
    '不安': { reading: 'ふあん', meaning: 'Anxiety / Unease' },
    '同意': { reading: 'どうい', meaning: 'Agreement' },
    '感謝': { reading: 'かんしゃ', meaning: 'Gratitude' },
    '謝罪': { reading: 'しゃざい', meaning: 'Apology' },
    '目上': { reading: 'めうえ', meaning: 'Superior / Senior' },
    '無難': { reading: 'ぶなん', meaning: 'Safe / Acceptable' },
    '具体的': { reading: 'ぐたいてき', meaning: 'Concrete / Specific' },
    '結論': { reading: 'けつろん', meaning: 'Conclusion' },
    '修正': { reading: 'しゅうせい', meaning: 'Fix / Correction' },
    '期限': { reading: 'きげん', meaning: 'Deadline' },
    '共有': { reading: 'きょうゆう', meaning: 'Share' },
    '優先順位': { reading: 'ゆうせんじゅんい', meaning: 'Priority' },
    '対策': { reading: 'たいさく', meaning: 'Countermeasure' },
    '工夫': { reading: 'くふう', meaning: 'Ingenuity / Figuring out a better way' },
    '判断': { reading: 'はんだん', meaning: 'Judgment' },
    '状況': { reading: 'じょうきょう', meaning: 'Situation' },
    // Renraku Listening vocabulary
    '職場': { reading: 'しょくば', meaning: 'Workplace' },
    '音声': { reading: 'おんせい', meaning: 'Audio / Voice' },
    '受け取る': { reading: 'うけとる', meaning: 'Receive' },
    '大事': { reading: 'だいじ', meaning: 'Important' },
    '漢字': { reading: 'かんじ', meaning: 'Kanji (Chinese characters)' },
    '数字': { reading: 'すうじ', meaning: 'Number / Digit' },
    '半角': { reading: 'はんかく', meaning: 'Half-width (character)' },
    '関係': { reading: 'かんけい', meaning: 'Relation / Connection' },
    '判定': { reading: 'はんてい', meaning: 'Judgment / Decision' },
    '検証環境': { reading: 'けんしょうかんきょう', meaning: 'Test environment' },
    '検証': { reading: 'けんしょう', meaning: 'Verification / Testing' },
    '環境': { reading: 'かんきょう', meaning: 'Environment' },
    'メンテナンス': { reading: 'メンテナンス', meaning: 'Maintenance' },
    '復旧': { reading: 'ふっきゅう', meaning: 'Recovery / Restoration' },
    '絶対': { reading: 'ぜったい', meaning: 'Absolutely' },
    '伝える': { reading: 'つたえる', meaning: 'Convey / Communicate' },
    '穴埋め': { reading: 'あなうめ', meaning: 'Fill in the blank' },
    '内容': { reading: 'ないよう', meaning: 'Content / Details' },
    '全問正解': { reading: 'ぜんもんせいかい', meaning: 'All answers correct' },
    '処理': { reading: 'しょり', meaning: 'Processing' },
    '以降': { reading: 'いこう', meaning: 'After / From ... on' },
    '作業': { reading: 'さぎょう', meaning: 'Work / Task / Operation' },
    '保存': { reading: 'ほぞん', meaning: 'Save / Preserve' },
    // Contact exercise vocabulary
    '宛先': { reading: 'あてさき', meaning: 'Recipient / Address' },
    '件名': { reading: 'けんめい', meaning: 'Subject (of email)' },
    '依頼': { reading: 'いらい', meaning: 'Request' },
    '重要': { reading: 'じゅうよう', meaning: 'Important' },
    '発生': { reading: 'はっせい', meaning: 'Occurrence / Happening' },
    '対象': { reading: 'たいしょう', meaning: 'Target / Subject' },
    '変更': { reading: 'へんこう', meaning: 'Change / Modification' },
    '延期': { reading: 'えんき', meaning: 'Postponement' },
    '注意点': { reading: 'ちゅういてん', meaning: 'Point to note / Caution' },
    '提出': { reading: 'ていしゅつ', meaning: 'Submission' },
    '翻訳': { reading: 'ほんやく', meaning: 'Translation' },
    '決済': { reading: 'けっさい', meaning: 'Payment / Settlement' },
    '仕様書': { reading: 'しようしょ', meaning: 'Specification document' },
    'デプロイ': { reading: 'デプロイ', meaning: 'Deploy (release to server)' },
    '被害': { reading: 'ひがい', meaning: 'Damage / Harm' },
    '緊急': { reading: 'きんきゅう', meaning: 'Urgent / Emergency' },
    '応用': { reading: 'おうよう', meaning: 'Application / Advanced' },
    '初級': { reading: 'しょきゅう', meaning: 'Beginner level' },
    '上級': { reading: 'じょうきゅう', meaning: 'Advanced level' },
    '同僚': { reading: 'どうりょう', meaning: 'Colleague / Coworker' },
    '至急': { reading: 'しきゅう', meaning: 'Urgent / Immediate' },
    '品質管理': { reading: 'ひんしつかんり', meaning: 'Quality control (QA)' },
    '障害': { reading: 'しょうがい', meaning: 'Failure / Malfunction' },
    '想定': { reading: 'そうてい', meaning: 'Assumption / Scenario' },
    // Additional contact vocabulary requested
    '管理': { reading: 'かんり', meaning: 'Management' },
    'ログイン': { reading: 'ログイン', meaning: 'Login' },
    '原因': { reading: 'げんいん', meaning: 'Cause' },
    '予定': { reading: 'よてい', meaning: 'Plan / Schedule' },
    '会社': { reading: 'かいしゃ', meaning: 'Company' },
    '商品': { reading: 'しょうひん', meaning: 'Product' },
    '写真': { reading: 'しゃしん', meaning: 'Photograph' },
    '画像': { reading: 'がぞう', meaning: 'Image' },
    '社員': { reading: 'しゃいん', meaning: 'Employee' },
    '共有': { reading: 'きょうゆう', meaning: 'Sharing' },
    'ネットワーク': { reading: 'ネットワーク', meaning: 'Network' },
    '状態': { reading: 'じょうたい', meaning: 'State / Condition' },
    'マネージャー': { reading: 'マネージャー', meaning: 'Manager' },
    '会議': { reading: 'かいぎ', meaning: 'Meeting' },
    '長引く': { reading: 'ながびく', meaning: 'Prolong / Drag on' },
    '元々': { reading: 'もともと', meaning: 'Originally' },
    '開始': { reading: 'かいし', meaning: 'Start' },
    'インフラ': { reading: 'インフラ', meaning: 'Infrastructure' },
    '開発': { reading: 'かいはつ', meaning: 'Development' },
    'データベース': { reading: 'データベース', meaning: 'Database' },
    'テスト': { reading: 'テスト', meaning: 'Test' },
    '修正': { reading: 'しゅうせい', meaning: 'Correction / Amendment' },
    '確認': { reading: 'かくにん', meaning: 'Confirmation' },
    '画面': { reading: 'がめん', meaning: 'Screen' },
    '期限': { reading: 'きげん', meaning: 'Deadline' },
    '品質': { reading: 'ひんしつ', meaning: 'Quality' },
    '検索': { reading: 'けんさく', meaning: 'Search' },
    '機能': { reading: 'きのう', meaning: 'Function' },
    'ウェブサイト': { reading: 'ウェブサイト', meaning: 'Website' },
    '営業': { reading: 'えいぎょう', meaning: 'Sales' },
    'ユーザー': { reading: 'ユーザー', meaning: 'User' },
    '説明書': { reading: 'せつめいしょ', meaning: 'Manual / Instruction book' },
    '単語': { reading: 'たんご', meaning: 'Word / Vocabulary' },
    '質問': { reading: 'しつもん', meaning: 'Question' },
    '注意書き': { reading: 'ちゅういがき', meaning: 'Warning / Note' },
    '最終': { reading: 'さいしゅう', meaning: 'Final' },
    'エラー': { reading: 'エラー', meaning: 'Error' },
    '念押し': { reading: 'ねんおし', meaning: 'Reminder / Re-confirm' },
    '点検': { reading: 'てんけん', meaning: 'Inspection' },
    '古い': { reading: 'ふるい', meaning: 'Old' },
    'バージョン': { reading: 'バージョン', meaning: 'Version' },
    '被害': { reading: 'ひがい', meaning: 'Damage' },
    '防ぐ': { reading: 'ふせぐ', meaning: 'Prevent' },
    '申し訳ない': { reading: 'もうしわけない', meaning: 'Sorry / Apologetic' },
    'バックアップ': { reading: 'バックアップ', meaning: 'Backup' },
    '連絡先': { reading: 'れんらくさき', meaning: 'Contact information' },
    '報告': { reading: 'ほうこく', meaning: 'Report' },
    '相談': { reading: 'そうだん', meaning: 'Consultation' },
    '作成': { reading: 'さくせい', meaning: 'Creation / Making' },
    '環境': { reading: 'かんきょう', meaning: 'Environment' },
    'パソコン': { reading: 'パソコン', meaning: 'PC' },
    'アップロード': { reading: 'アップロード', meaning: 'Upload' },
    '技術': { reading: 'ぎじゅつ', meaning: 'Technology / Skill' },
    'カレンダー': { reading: 'カレンダー', meaning: 'Calendar' },
    'ライブラリ': { reading: 'ライブラリ', meaning: 'Library' },
    '小数': { reading: 'しょうすう', meaning: 'Decimal fraction' },
    '切り捨てる': { reading: 'きりすてる', meaning: 'Round down / Truncate' },
    '切り上げる': { reading: 'きりあげる', meaning: 'Round up' },
    '処理': { reading: 'しょり', meaning: 'Processing' },
    'コンフリクト': { reading: 'コンフリクト', meaning: 'Conflict' },
    '環境構築': { reading: 'かんきょうこうちく', meaning: 'Environment setup' },
    'ツール': { reading: 'ツール', meaning: 'Tool' },
    '設定': { reading: 'せってい', meaning: 'Setting / Configuration' },
    'デザイン': { reading: 'デザイン', meaning: 'Design' },
    'データ': { reading: 'データ', meaning: 'Data' },
    'ルール': { reading: 'ルール', meaning: 'Rule' },
    '本番': { reading: 'ほんばん', meaning: 'Production' },
    'セキュリティ': { reading: 'セキュリティ', meaning: 'Security' },
    '情報': { reading: 'じょうほう', meaning: 'Information' },
    '解決': { reading: 'かいけつ', meaning: 'Solve / Resolve' },
    '具体的': { reading: 'ぐたいてき', meaning: 'Concrete / Specific' },
    '意見': { reading: 'いけん', meaning: 'Opinion' },
    '変数': { reading: 'へんすう', meaning: 'Variable' },
    'データ型': { reading: 'データがた', meaning: 'Data type' },
    '検索結果': { reading: 'けんさくけっか', meaning: 'Search results' },
    'エンジニア': { reading: 'エンジニア', meaning: 'Engineer' },
    '考えます': { reading: 'かんがえます', meaning: 'Think / Consider' },
    '調べます': { reading: 'しらべます', meaning: 'Investigate / Look up' },
    'だけ': { reading: 'だけ', meaning: 'Only / Just' },
    'わからない': { reading: 'わからない', meaning: 'Do not understand / Don\'t know' },
    '行います': { reading: 'おこないます', meaning: 'Perform / Do' },
    '悩んで': { reading: 'なやんで', meaning: 'Worrying / Troubled' },
    '遅れて': { reading: 'おくれて', meaning: 'Delayed / Late' },
    '一緒に': { reading: 'いっしょに', meaning: 'Together' },
    '考える': { reading: 'かんがえる', meaning: 'To think' },
    '答え': { reading: 'こたえ', meaning: 'Answer' },
    '上手な': { reading: 'じょうずな', meaning: 'Skillful / Good at' },
    // Development Lecture vocabulary
    '要件定義': { reading: 'ようけんていぎ', meaning: 'Requirements Definition' },
    '見積もり': { reading: 'みつもり', meaning: 'Estimation' },
    '設計': { reading: 'せっけい', meaning: 'Design' },
    '保守運用': { reading: 'ほしゅうんよう', meaning: 'Maintenance and Operation' },
    'サーバー': { reading: 'サーバー', meaning: 'Server' },
    'バグ': { reading: 'バグ', meaning: 'Bug' },
    '監視': { reading: 'かんし', meaning: 'Monitoring' },
    '要求定義': { reading: 'ようきゅうていぎ', meaning: 'Requirement Definition (Business goals)' },
    '機能要件': { reading: 'きのうようけん', meaning: 'Functional Requirements' },
    '非機能要件': { reading: 'ひきのうようけん', meaning: 'Non-Functional Requirements' },
    '工数': { reading: 'こうすう', meaning: 'Man-hours / Workload' },
    'WBS': { reading: 'WBS', meaning: 'Work Breakdown Structure' },
    '基本設計': { reading: 'きほんせっけい', meaning: 'High-level Design / Basic Design' },
    'ワイヤーフレーム': { reading: 'ワイヤーフレーム', meaning: 'Wireframe' },
    '詳細設計': { reading: 'しょうさいせっけい', meaning: 'Low-level Design / Detailed Design' },
    'フローチャート': { reading: 'フローチャート', meaning: 'Flowchart' },
    'コーディング': { reading: 'コーディング', meaning: 'Coding' },
    '実装': { reading: 'じっそう', meaning: 'Implementation' },
    'バージョン管理': { reading: 'バージョンかんり', meaning: 'Version Control' },
    '進捗管理': { reading: 'しんちょくかんり', meaning: 'Progress Management' },
    '単体テスト': { reading: 'たんたいテスト', meaning: 'Unit Test' },
    '結合テスト': { reading: 'けつごうテスト', meaning: 'Integration Test' },
    'システムテスト': { reading: 'システムテスト', meaning: 'System Test' },
    '本番環境': { reading: 'ほんばんかんきょう', meaning: 'Production Environment' },
    'リリース': { reading: 'リリース', meaning: 'Release' },
    '障害対応': { reading: 'しょうがいたいおう', meaning: 'Troubleshooting / Incident Response' },
    'セキュリティパッチ': { reading: 'セキュリティパッチ', meaning: 'Security Patch' },
    'ウォーターフォール': { reading: 'ウォーターフォール', meaning: 'Waterfall' },
    'アジャイル': { reading: 'アジャイル', meaning: 'Agile' },
    'スプリント': { reading: 'スプリント', meaning: 'Sprint' },
    'フィードバック': { reading: 'フィードバック', meaning: 'Feedback' },
    '計画': { reading: 'けいかく', meaning: 'Plan' },
    '段階': { reading: 'だんかい', meaning: 'Stage / Phase' },
    '基本': { reading: 'きほん', meaning: 'Basics / Fundamentals' },
    '要望': { reading: 'ようぼう', meaning: 'Request / Demand' },
    '実現': { reading: 'じつげん', meaning: 'Implementation / Realization' },
    '明確': { reading: 'めいかく', meaning: 'Clear' },
    '課題': { reading: 'かだい', meaning: 'Task / Issue' },
    '処理速度': { reading: 'しょりそくど', meaning: 'Processing speed' },
    '定義': { reading: 'ていぎ', meaning: 'Definition' },
    '承認': { reading: 'しょうにん', meaning: 'Approval' },
    '構成': { reading: 'こうせい', meaning: 'Structure / Configuration' },
    '記述': { reading: 'きじゅつ', meaning: 'Description / Writing (code)' },
    '構築': { reading: 'こうちく', meaning: 'Construction / Building' },
    '履歴': { reading: 'りれき', meaning: 'History / Logs' },
    '不具合': { reading: 'ふぐあい', meaning: 'Bug / Defect' },
    '適用': { reading: 'てきよう', meaning: 'Application / Applying' },
    '手分け': { reading: 'てわけ', meaning: 'Division of labor' },
    '全体': { reading: 'ぜんたい', meaning: 'Whole / Entirety' }
};

// ... (previous initialization code) ...

// ===== Password Protection Logic =====

/**
 * Checks password, saves to localStorage, and reveals navigation
 * @param {string} inputId - ID of the password input field
 * @param {string} navId - ID of the navigation section to show
 * @param {string} storageKey - Key for localStorage (must be unique per password)
 * @param {string} correctPassword - The correct password
 * @param {string} errorId - ID of the error message element
 */
function checkPasswordAndRevealNav(inputId, navId, storageKey, correctPassword, errorId) {
    const input = document.getElementById(inputId);
    const nav = document.getElementById(navId);
    const error = document.getElementById(errorId);

    if (!input) return;

    if (input.value.trim() === correctPassword) {
        // Success
        localStorage.setItem(storageKey, 'unlocked');
        revealNav(nav, error);
    } else {
        // Error
        if (error) {
            error.style.display = 'block';
            error.textContent = 'パスワードが違います。';
        }
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 500);
    }
}

function revealNav(navElement, errorElement) {
    if (navElement) {
        navElement.classList.add('open');
        navElement.style.display = 'block';
        setTimeout(() => {
            navElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
    if (errorElement) errorElement.style.display = 'none';
}

/**
 * Check if password was previously entered
 * @param {string} storageKey - Key for localStorage
 * @param {string} navId - ID of the navigation section
 * @param {string} inputId - Optional: Input ID to fill/disable
 */
function checkUnlockedState(storageKey, navId, inputId) {
    if (localStorage.getItem(storageKey) === 'unlocked') {
        const nav = document.getElementById(navId);
        if (nav) {
            nav.style.display = 'block';
        }
        const input = document.getElementById(inputId);
        if (input) {
            input.value = '********';
            input.disabled = true;
            input.placeholder = '認証済み';
        }
    }
}

/**
 * Checks password and toggles a hidden section (Legacy/Simple)
 */
function checkPasswordAndToggle(inputId, targetId, password, errorId) {
    const input = document.getElementById(inputId);
    const target = document.getElementById(targetId);
    const error = document.getElementById(errorId);

    if (!input || !target) return;

    if (input.value.trim() === password) {
        target.classList.add('open');
        target.style.display = 'block';
        if (error) error.style.display = 'none';

        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        if (error) {
            error.style.display = 'block';
            error.textContent = 'パスワードが違います。';
        }
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 500);
    }
}

/**
 * Checks password and navigates to a URL (Legacy/Simple)
 */
function checkPasswordAndNavigate(inputId, url, password, errorId) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);

    if (!input) return;

    if (input.value.trim() === password) {
        window.location.href = url;
    } else {
        if (error) {
            error.style.display = 'block';
            error.textContent = 'パスワードが違います。';
        }
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 500);
    }
}

// Expose functions to global scope for HTML onclick availability
window.checkPasswordAndToggle = checkPasswordAndToggle;
window.checkPasswordAndNavigate = checkPasswordAndNavigate;
window.checkPasswordAndRevealNav = checkPasswordAndRevealNav;
window.checkUnlockedState = checkUnlockedState;


// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    initializeVocabularyPopups();
    initializeAudioPlayer();

    // Initialize accordion
    initializeAccordion();

    // Initialize quiz button
    const checkBtn = document.getElementById('checkQuizBtn');
    if (checkBtn) {
        checkBtn.addEventListener('click', checkQuiz);
    }
});

// ===== Vocabulary Popup System =====
function initializeVocabularyPopups() {
    const n4Words = document.querySelectorAll('.n4-word');

    n4Words.forEach(wordElement => {
        const word = wordElement.dataset.word;
        const vocab = vocabularyData[word];

        if (vocab) {
            // Create popup element
            const popup = document.createElement('div');
            popup.className = 'n4-popup';
            popup.innerHTML = `
                <div class="word-reading">${word}（${vocab.reading}）</div>
                <div class="word-meaning">${vocab.meaning}</div>
            `;
            wordElement.appendChild(popup);
        }
    });
}

// ===== Custom Audio Player =====
// ===== Custom Audio Player =====
let audioPlayer = null;
let isPlaying = false;
let currentSpeed = 1.0;

function initializeAudioPlayer() {
    // Standardize: Look for .audio-player which is used in Listening 1
    const audioContainer = document.querySelector('.audio-player');

    // If not found, try the container class used in early Listening 2 drafts
    const legacyContainer = document.querySelector('.audio-player-container');

    const targetContainer = audioContainer || legacyContainer;

    if (!targetContainer) return;

    // Check if audio element exists inside (Listening 2 style) or if we need to create it (Listening 1 style)
    let audioEl = targetContainer.querySelector('audio');

    if (!audioEl) {
        // Listening 1 style: create audio element from data-src
        const audioSrc = targetContainer.dataset.src;
        if (!audioSrc) return;
        audioPlayer = new Audio(audioSrc);
        // Use 'auto' for WAV files to ensure accurate duration
        audioPlayer.preload = 'auto';
    } else {
        // Listening 2 style: use existing audio element
        audioPlayer = audioEl;
        audioPlayer.preload = 'auto';
    }

    // Get control elements - generic selectors to work for both if classes match
    const playBtn = targetContainer.querySelector('.play-btn') || document.getElementById('play-pause-btn');
    const progressBar = targetContainer.querySelector('.progress-bar') || document.getElementById('progress-bar');
    const progressFill = targetContainer.querySelector('.progress-fill');
    const currentTimeEl = targetContainer.querySelector('.current-time') || document.getElementById('current-time');
    const durationEl = targetContainer.querySelector('.duration') || document.getElementById('duration');
    const speedBtns = targetContainer.querySelectorAll('.speed-btn');

    // Play/Pause
    if (playBtn) {
        // Remove old listeners to be safe (though this is fresh init)
        playBtn.removeEventListener('click', togglePlay);
        playBtn.addEventListener('click', togglePlay);
    }

    // Progress bar click - use .progress-bar rect for accurate seek
    const clickTarget = targetContainer.querySelector('.progress-container') || targetContainer.querySelector('.progress-bar-container') || progressBar;
    // The actual bar element for accurate rect measurement
    const barForRect = progressBar || clickTarget;

    if (clickTarget) {
        clickTarget.addEventListener('click', function (e) {
            // Use the progress-bar element's rect, not the container's
            const rect = barForRect.getBoundingClientRect();
            let percent = (e.clientX - rect.left) / rect.width;
            // Clamp to 0-1 range
            percent = Math.max(0, Math.min(1, percent));

            const dur = audioPlayer.duration;
            if (dur && isFinite(dur)) {
                audioPlayer.currentTime = percent * dur;
            }
        });
    }

    // Update progress
    audioPlayer.addEventListener('timeupdate', function () {
        const duration = audioPlayer.duration;
        if (!duration || !isFinite(duration)) return;

        const percent = (audioPlayer.currentTime / duration) * 100;

        // Update helper for Listening 1 (progress-fill width)
        if (progressFill) {
            progressFill.style.width = percent + '%';
        }

        // Update helper for Listening 2 (progress-bar used as fill in some versions, or needs explicit handling)
        // If there is no progress-fill, maybe progressBar itself is being used as value? 
        // Listening 1: .progress-bar > .progress-fill. 
        // Listening 2 draft: #progress-bar (which was the fill).
        if (!progressFill && progressBar) {
            progressBar.style.width = percent + '%';
        }

        if (currentTimeEl) {
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
        }
    });

    // Duration loaded - use both loadedmetadata and durationchange for WAV reliability
    function updateDuration() {
        if (durationEl && audioPlayer.duration && isFinite(audioPlayer.duration)) {
            durationEl.textContent = formatTime(audioPlayer.duration);
        }
    }
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    audioPlayer.addEventListener('durationchange', updateDuration);

    // Audio ended
    audioPlayer.addEventListener('ended', function () {
        isPlaying = false;
        updatePlayButton();
        if (progressFill) {
            progressFill.style.width = '0%';
        } else if (progressBar) { // Fallback for Listening 2 style if no fill child
            progressBar.style.width = '0%';
        }
    });

    // Speed buttons
    if (speedBtns.length > 0) {
        speedBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                const speed = parseFloat(this.dataset.speed);
                setPlaybackSpeed(speed);

                // Update active state
                speedBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }
}

function togglePlay() {
    if (!audioPlayer) return;

    if (isPlaying) {
        audioPlayer.pause();
    } else {
        audioPlayer.play();
    }
    isPlaying = !isPlaying;
    updatePlayButton();
}

function updatePlayButton() {
    // Need to find the button again in case of multiple players (though we only have one per page usually)
    const playBtn = document.querySelector('.play-btn') || document.getElementById('play-pause-btn');
    if (playBtn) {
        playBtn.textContent = isPlaying ? '⏸' : '▶';
    }
}

function setPlaybackSpeed(speed) {
    if (!audioPlayer) return;
    currentSpeed = speed;
    audioPlayer.playbackRate = speed;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ===== Drag and Drop Quiz Logic =====
let draggedItem = null;

function initializeDragAndDrop() {
    const draggables = document.querySelectorAll('.draggable-item');
    const dropzones = document.querySelectorAll('.dropzone');

    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', function () {
            draggedItem = this;
            setTimeout(() => this.classList.add('dragging'), 0);
        });

        draggable.addEventListener('dragend', function () {
            this.classList.remove('dragging');
            draggedItem = null;
        });

        // Touch support
        draggable.addEventListener('touchstart', function (e) {
            draggedItem = this;
            this.classList.add('dragging');
        }, { passive: true });

        draggable.addEventListener('touchend', function (e) {
            this.classList.remove('dragging');

            // Logic to find dropzone on touchend
            const touch = e.changedTouches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const dropzone = target.closest('.dropzone');

            if (dropzone && !dropzone.hasChildNodes()) {
                dropzone.appendChild(this);
                this.classList.add('dropped');
            } else if (!dropzone && target.closest('.word-bank')) {
                // Return to bank
                document.querySelector('.word-bank').appendChild(this);
                this.classList.remove('dropped');
            }

            draggedItem = null;
        });
    });

    dropzones.forEach(dropzone => {
        dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
        });

        dropzone.addEventListener('dragenter', function (e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', function () {
            this.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', function () {
            this.classList.remove('drag-over');
            if (draggedItem && !this.hasChildNodes()) {
                this.appendChild(draggedItem);
                draggedItem.classList.add('dropped');
            }
        });

        // Return to word bank on click if already dropped
        dropzone.addEventListener('click', function () {
            if (this.hasChildNodes()) {
                const item = this.firstElementChild;
                document.querySelector('.word-bank').appendChild(item);
                item.classList.remove('dropped');
            }
        });
    });
}


// ===== Smooth Scroll for Navigation =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===== Quiz Logic =====
function checkQuiz() {
    const inputs = document.querySelectorAll('.quiz-input');
    let allCorrect = true;
    let correctCount = 0;

    inputs.forEach(input => {
        const userAnswer = normalizeText(input.value);
        const validAnswers = input.dataset.answer.split(',').map(ans => normalizeText(ans));

        // Check if user answer matches any of the valid answers
        const isCorrect = validAnswers.some(ans => ans === userAnswer);

        // Remove previous status
        input.classList.remove('correct', 'incorrect');

        const feedback = input.nextElementSibling;

        if (isCorrect) {
            input.classList.add('correct');
            if (feedback && feedback.classList.contains('quiz-feedback')) {
                feedback.textContent = '正解！';
            }
            correctCount++;
        } else {
            input.classList.add('incorrect');
            if (feedback && feedback.classList.contains('quiz-feedback')) {
                feedback.textContent = '不正解...';
            }
            allCorrect = false;
        }
    });

    if (allCorrect) {
        showConfetti();
        const transcriptContainer = document.getElementById('transcriptContainer');
        if (transcriptContainer) {
            transcriptContainer.classList.add('visible');
            // Auto open the transcript if it's the first time
            const body = transcriptContainer.querySelector('.transcript-body');
            const icon = transcriptContainer.querySelector('.toggle-icon');
            if (body && !body.classList.contains('open')) {
                setTimeout(() => {
                    body.classList.add('open');
                    if (icon) icon.style.transform = 'rotate(180deg)';
                }, 1000);
            }
        }

        // Scroll to transcript after a delay
        setTimeout(() => {
            const target = document.getElementById('transcriptContainer');
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 1500);
    }
}

function normalizeText(text) {
    if (!text) return '';
    return text.trim()
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        .toLowerCase();
}

function showConfetti() {
    const colors = ['#f5a623', '#1e5799', '#4a90d9', '#e74c3c', '#27ae60'];

    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        confetti.style.opacity = Math.random();
        document.body.appendChild(confetti);

        // Remove after animation
        setTimeout(() => {
            confetti.remove();
        }, 5000);
    }
}

// ===== Accordion / Collapse Logic =====
function initializeAccordion() {
    const headers = document.querySelectorAll('.transcript-header');

    headers.forEach(header => {
        header.addEventListener('click', function () {
            const body = this.nextElementSibling;
            const icon = this.querySelector('.toggle-icon');

            body.classList.toggle('open');

            if (icon) {
                if (body.classList.contains('open')) {
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        });
    });
}

// ===== Drag and Drop / Typing Quiz Checking Logic =====
function checkDragDropQuiz() {
    const dropzones = document.querySelectorAll('.dropzone');
    let correctCount = 0;
    const total = dropzones.length;
    const isTypingMode = document.body.classList.contains('typing-mode');

    dropzones.forEach(zone => {
        zone.classList.remove('correct', 'incorrect');
        let isCorrect = false;

        if (isTypingMode) {
            // TYPING MODE CHECK
            // Support both input elements and contenteditable divs
            const val = zone.tagName === 'INPUT' ? zone.value : zone.textContent;
            const userText = normalizeText(val);

            // Get expected answers from data-answer attribute
            // If data-answer is missing, we try to map from data-correct (fallback) or use data-correct as value
            let answers = [];
            if (zone.dataset.answer) {
                answers = zone.dataset.answer.split(',');
            } else {
                // Fallback: This might fail if data-correct is a key like 'houkoku' but user types '報告'
                // Ideally all dropzones should have data-answer.
                // For now, let's assume if no data-answer, we skip or strict check data-correct (unlikely to match)
                answers = [zone.dataset.correct];
            }

            if (answers.length > 0) {
                const validAnswers = answers.map(a => normalizeText(a));
                isCorrect = validAnswers.some(ans => ans === userText);
            }

        } else {
            // DRAG MODE CHECK
            const correctValue = zone.dataset.correct;
            const child = zone.firstElementChild;

            if (child && child.classList.contains('draggable-item')) {
                const userValue = child.dataset.value;
                if (userValue === correctValue) {
                    isCorrect = true;
                }
            }
        }

        if (isCorrect) {
            zone.classList.add('correct');
            correctCount++;
        } else {
            zone.classList.add('incorrect');
        }
    });

    // Show Result
    const resultContainer = document.getElementById('quiz-result');
    if (resultContainer) {
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = `
            <h3>結果: ${correctCount} / ${total}</h3>
            ${correctCount === total ? '<p class="perfect-score">全問正解！素晴らしいですね！</p>' : '<p>もう一度聞いてみましょう。</p>'}
        `;

        if (correctCount === total) {
            // Save success state
            localStorage.setItem('houkoku_quiz_passed', 'true');

            const nextLink = document.getElementById('quiz-section');
            if (nextLink) {
                nextLink.style.display = 'block';
                setTimeout(() => {
                    nextLink.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 500);
            }

            // Show Confetti
            if (typeof showConfetti === 'function') {
                showConfetti();
            }
        }
    }
}

// ===== Shared Header/Footer Components =====

/**
 * Renders the global navigation header
 * @param {string} basePath - Relative path to the root directory (e.g., "./", "../../")
 * @param {string} currentId - ID of the current page to highlight active links
 */
function renderHeader(basePath, currentId) {
    // Define active states for main nav items
    const isTopActive = currentId === 'top';
    const isAboutActive = currentId === 'about';
    const isLectureActive = currentId.startsWith('lecture');
    const isListeningActive = currentId.startsWith('listening');

    // Define active states for dropdown items
    const isLectureHoukokuActive = currentId === 'lecture-houkoku';
    const isLectureRenrakuActive = currentId === 'lecture-renraku';
    const isLectureSoudanActive = currentId === 'lecture-soudan';
    const isLectureDevelopmentActive = currentId === 'lecture-development';
    const isLectureYoukenActive = currentId === 'lecture-youken';
    const isListeningEmploymentActive = currentId === 'listening-employment';
    const isListeningHoukokuActive = currentId === 'listening-houkoku';
    const isListeningRenrakuActive = currentId === 'listening-renraku';
    const isListeningSoudanActive = currentId === 'listening-soudan';

    const headerHTML = `
    <nav class="navbar">
        <div class="nav-container">
            <a href="${basePath}index.html" class="nav-logo">
                <img src="${basePath}assets/img/favicon.ico" alt="" class="title-icon">
                <span>NEXT MAKE
                    <ruby>研修<rt>けんしゅう</rt></ruby>
                </span>
            </a>
            <ul class="nav-menu">
                <li><a href="${basePath}index.html" class="${isTopActive ? 'active' : ''}">トップ</a></li>
                <li><a href="${basePath}about.html" class="${isAboutActive ? 'active' : ''}">About</a></li>
                <li class="nav-dropdown">
                    <a href="#" class="${isLectureActive ? 'active' : ''}">レクチャー ▼</a>
                    <div class="nav-dropdown-content">
                        <span class="nav-dropdown-category">報連相</span>
                        <a href="${basePath}lecture/houkoku/index.html" class="${isLectureHoukokuActive ? 'active' : ''}">
                            <ruby>報告<rt>ほうこく</rt></ruby>
                        </a>
                        <a href="${basePath}lecture/renraku/index.html" class="${isLectureRenrakuActive ? 'active' : ''}">
                            <ruby>連絡<rt>れんらく</rt></ruby>
                        </a>
                        <a href="${basePath}lecture/soudan/index.html" class="${isLectureSoudanActive ? 'active' : ''}">
                            <ruby>相談<rt>そうだん</rt></ruby>
                        </a>
                        <span class="nav-dropdown-category" style="margin-top: 8px;">システム開発</span>
                        <a href="${basePath}lecture/development/index.html" class="${isLectureDevelopmentActive ? 'active' : ''}">
                            <ruby>開発<rt>かいはつ</rt></ruby>の<ruby>流<rt>なが</rt></ruby>れ
                        </a>
                        <a href="${basePath}lecture/youken_teigi/index.html" class="${isLectureYoukenActive ? 'active' : ''}">
                            <ruby>要件定義<rt>ようけんていぎ</rt></ruby>
                        </a>
                    </div>
                </li>
                <li class="nav-dropdown">
                    <a href="#" class="${isListeningActive ? 'active' : ''}">リスニング ▼</a>
                    <div class="nav-dropdown-content">
                        <span class="nav-dropdown-category">就業形態</span>
                        <a href="${basePath}listening/employment_type/index.html" class="${isListeningEmploymentActive ? 'active' : ''}">
                            <ruby>就業形態<rt>しゅうぎょうけいたい</rt></ruby>
                        </a>
                        <span class="nav-dropdown-category" style="margin-top: 8px;">報連相</span>
                        <a href="${basePath}listening/houkoku/index.html" class="${isListeningHoukokuActive ? 'active' : ''}">
                            <ruby>報告<rt>ほうこく</rt></ruby>
                        </a>
                        <a href="${basePath}listening/renraku/index.html" class="${isListeningRenrakuActive ? 'active' : ''}">
                            <ruby>連絡<rt>れんらく</rt></ruby>
                        </a>
                        <a href="${basePath}listening/soudan/index.html" class="${isListeningSoudanActive ? 'active' : ''}">
                            <ruby>相談<rt>そうだん</rt></ruby>
                        </a>
                    </div>
                </li>
            </ul>
        </div>
    </nav>
    `;

    // Insert at the beginning of body
    document.body.insertAdjacentHTML('afterbegin', headerHTML);
}

/**
 * Renders the global footer
 */
function renderFooter() {
    const footerHTML = `
    <footer class="footer">
        <p>© 2026 NEXT MAKE - <ruby>新入社員<rt>しんにゅうしゃいん</rt></ruby><ruby>研修<rt>けんしゅう</rt></ruby></p>
    </footer>
    `;

    // Insert at the end of body
    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

/**
 * Renders a reusable audio player component into a target container.
 * After calling this, call initializeAudioPlayer() to wire up controls.
 * @param {string} containerId - The id of the div to inject the player into
 * @param {string} audioSrc - Path to the audio file
 * @param {string} title - Title displayed above the player
 */
function renderAudioPlayer(containerId, audioSrc, title) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
    <div class="audio-player" data-src="${audioSrc}">
        <div class="audio-player-title">${title}</div>
        <div class="audio-controls">
            <button class="play-btn" aria-label="再生">▶</button>
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="time-display">
                    <span class="current-time">0:00</span> / <span class="duration">0:00</span>
                </div>
            </div>
        </div>
        <div class="speed-control" style="margin-top: 20px;">
            <label><ruby>速度<rt>そくど</rt></ruby>：</label>
            <button class="speed-btn" data-speed="0.5">0.5x</button>
            <button class="speed-btn" data-speed="0.75">0.75x</button>
            <button class="speed-btn active" data-speed="1">1x</button>
            <button class="speed-btn" data-speed="1.25">1.25x</button>
            <button class="speed-btn" data-speed="1.5">1.5x</button>
        </div>
    </div>
    `;

    // Re-initialize the audio player for the newly injected DOM
    initializeAudioPlayer();
}

/**
 * Initializes sticky mini-mode for the audio player.
 * Uses scroll position to toggle .is-stuck class.
 * @param {string} audioSectionId - The id of the sticky audio section container
 * @param {string} sentinelId - The id of the sentinel element placed above the sticky section
 * @param {string} [stickyInputBarId] - Optional id of a sticky input bar to reposition below audio
 */
function initStickyAudioPlayer(audioSectionId, sentinelId, stickyInputBarId) {
    const audioSection = document.getElementById(audioSectionId);
    const sentinel = document.getElementById(sentinelId);
    if (!audioSection || !sentinel) return;

    const inputBar = stickyInputBarId ? document.getElementById(stickyInputBarId) : null;

    // Get navbar height for offset
    const navbar = document.querySelector('.navbar');
    const navHeight = navbar ? navbar.offsetHeight : 0;

    // Set the sticky top to below navbar
    audioSection.style.top = navHeight + 'px';

    function updateSticky() {
        const sentinelRect = sentinel.getBoundingClientRect();
        const isStuck = sentinelRect.bottom <= navHeight;

        if (isStuck) {
            audioSection.classList.add('is-stuck');
        } else {
            audioSection.classList.remove('is-stuck');
        }

        // Update input bar position if present
        if (inputBar) {
            inputBar.style.top = (navHeight + audioSection.offsetHeight) + 'px';
        }
    }

    window.addEventListener('scroll', updateSticky, { passive: true });
    // Initial check
    setTimeout(updateSticky, 100);
}

/**
 * Strips ruby/rt/rp HTML tags from a string, returning only the base text (kanji).
 * e.g. "<ruby>難<rt>むずか</rt></ruby>しい" -> "難しい"
 */
function stripRubyTags(html) {
    if (!html) return '';
    // Remove <rt>...</rt> and <rp>...</rp> content entirely
    let result = html.replace(/<rt[^>]*>.*?<\/rt>/gi, '');
    result = result.replace(/<rp[^>]*>.*?<\/rp>/gi, '');
    // Remove remaining <ruby> and </ruby> tags
    result = result.replace(/<\/?ruby[^>]*>/gi, '');
    // Remove any other HTML tags
    result = result.replace(/<[^>]+>/g, '');
    return result.trim();
}
