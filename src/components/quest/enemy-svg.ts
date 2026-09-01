/**
 * 敵の 絵（SVG）— 旧アプリ `lecture/development/waterfall_quest.html` からの **逐語移植**
 *
 * ## なぜ 逐語で 持ってくるのか
 * ゲーム風UIが この 教材の 売り（2026-09-01 の 指定）。敵の 見た目は 遊びの 手ざわりの
 * 中心なので、**描き直さずに 元の 絵を そのまま 運ぶ**。絶対規律7 が 禁じて いるのは
 * **ネクマックスの キャラ絵を 自分で 描き起こす** ことで、旧アプリに すでに ある
 * ゲームの 絵を 移植する ことでは ない。
 *
 * ## 直さない
 * 中身は 旧アプリの まま（インデントと 型注釈だけ 足した）。ここを 手で 直すと、
 * 元と 見た目が ずれても 誰も 気づけない。絵を 変えたい ときは 差しかえの タスクに する。
 */

/* eslint-disable */

const defsAngel = `
    <defs>
        <clipPath id="bodyClip">
            <ellipse cx="400" cy="450" rx="240" ry="260" />
        </clipPath>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
    </defs>
`;

// ==========================================
// 👼 神社長 (天使) のSVG生成ロジック
// ==========================================
function getAngelSVG(caseId: number, isAnimate = true): string {
  const svgClass = isAnimate
    ? "w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] animate-[bounce_2s_infinite]"
    : "w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]";
  let transformBase = "translate(0, -50)";
  let background = "";
  let backEffects = "";
  let frontEffects = "";

  let leftItem = `
        <g transform="translate(-10, 150) rotate(-55)">
            <rect x="-60" y="-80" width="120" height="160" rx="10" fill="#263238" />
            <rect x="-50" y="-70" width="100" height="140" rx="4" fill="#E3F2FD" />
            <rect x="-40" y="-50" width="80" height="10" rx="5" fill="#90CAF9" />
            <rect x="-40" y="-30" width="50" height="8" rx="4" fill="#90CAF9" />
            <rect x="-40" y="-10" width="70" height="8" rx="4" fill="#90CAF9" />
            <circle cx="0" cy="45" r="15" fill="#BBDEFB" />
        </g>`;
  let rightItem = `
        <g transform="translate(20, 120) rotate(20)">
            <rect x="-10" y="-60" width="20" height="140" rx="10" fill="#ECEFF1" stroke="#CFD8DC" stroke-width="2"/>
            <polygon points="-10,80 10,80 0,110" fill="#B0BEC5" />
            <polygon points="-3,100 3,100 0,110" fill="#37474F" />
        </g>`;
  let cheeks = "";

  let eyes = `<circle cx="300" cy="340" r="12" fill="#111" /><circle cx="500" cy="340" r="12" fill="#111" />`;
  let eyebrows = "";
  let nose = `<rect x="375" y="350" width="50" height="22" rx="5" fill="#111" />`;
  let mouth = `
        <line x1="400" y1="370" x2="400" y2="410" stroke="#111" stroke-width="10" stroke-linecap="round" />
        <path d="M 360 390 Q 380 420 400 410" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />
        <path d="M 440 390 Q 420 420 400 410" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />
    `;

  switch (caseId) {
    case 1:
      break;
    case 4: // せっかち
      eyebrows = `<path d="M 260 310 L 320 330 M 540 310 L 480 330" stroke="#111" stroke-width="12" stroke-linecap="round" />`;
      mouth = `<path d="M 360 410 Q 400 380 440 410" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />`;
      frontEffects = `
                <g transform="translate(560, 220)">
                    <path d="M -20 -20 L 20 20 M 20 -20 L -20 20" stroke="#F44336" stroke-width="10" stroke-linecap="round" />
                    <path d="M -25 0 L 25 0 M 0 -25 L 0 25" stroke="#F44336" stroke-width="10" stroke-linecap="round" />
                </g>`;
      break;
    case 5: // おサイフ
      eyes = `
                <text x="300" y="360" font-size="55" fill="#333" font-weight="bold" text-anchor="middle">￥</text>
                <text x="500" y="360" font-size="55" fill="#333" font-weight="bold" text-anchor="middle">￥</text>`;
      mouth = `<path d="M 360 410 Q 400 430 440 410" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />`;
      frontEffects = `
                <circle cx="650" cy="250" r="35" fill="#FFC107" stroke="#333" stroke-width="4" />
                <text x="650" y="265" font-size="40" fill="#333" font-weight="bold" text-anchor="middle">￥</text>`;
      break;
    case 6: // かえりたそう
      eyes = `<path d="M 270 340 L 330 340 M 470 340 L 530 340" stroke="#111" stroke-width="12" stroke-linecap="round" />`;
      frontEffects = `
                <path d="M 550 250 Q 650 150 750 200 Q 820 280 750 350 Q 650 400 600 280 Z" fill="#FFF" stroke="#CCC" stroke-width="8" />
                <text x="680" y="280" font-size="40" fill="#999">ﾊｧ…</text>`;
      break;
    case 7: // よくばり
      eyes = `<path d="M 270 350 Q 300 320 330 350 M 470 350 Q 500 320 530 350" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round" />`;
      mouth = `<path d="M 350 390 Q 400 450 450 390 Z" fill="#F44336" stroke="#111" stroke-width="8" stroke-linejoin="round" />`;
      break;
    case 8: // ふんわり
      background = `<path d="M 50 100 Q 200 0 400 100 T 750 100 T 750 400 T 400 700 T 50 400 Z" fill="none" stroke="#E0E0E0" stroke-width="8" stroke-dasharray="20 20" />`;
      eyes = `<circle cx="300" cy="340" r="8" fill="#333" /><circle cx="500" cy="340" r="8" fill="#333" />`;
      mouth = `<circle cx="400" cy="400" r="15" fill="#333" />`;
      cheeks = `
                <ellipse cx="230" cy="380" rx="35" ry="20" fill="#FF8A80" opacity="0.6" />
                <ellipse cx="570" cy="380" rx="35" ry="20" fill="#FF8A80" opacity="0.6" />`;
      break;
    case 9: // ミーハー
      eyes = `
                <text x="300" y="360" font-size="60" fill="#FFEB3B" stroke="#F57F17" stroke-width="2" text-anchor="middle">★</text>
                <text x="500" y="360" font-size="60" fill="#FFEB3B" stroke="#F57F17" stroke-width="2" text-anchor="middle">★</text>`;
      mouth = `<path d="M 360 390 Q 400 430 440 390 Z" fill="#111" />`;
      cheeks = `
                <ellipse cx="230" cy="380" rx="35" ry="20" fill="#FF8A80" opacity="0.6" />
                <ellipse cx="570" cy="380" rx="35" ry="20" fill="#FF8A80" opacity="0.6" />`;
      break;
    case 10: // わがまま
      transformBase = "translate(0, -50) rotate(-6, 400, 450)";
      eyes = `<circle cx="280" cy="340" r="12" fill="#111" /><circle cx="480" cy="340" r="12" fill="#111" />`;
      mouth = `<path d="M 330 400 Q 360 380 390 400" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />`;
      break;
    case 12: // ハンコ
      eyes = `
                <path d="M 270 340 L 330 340 M 470 340 L 530 340" stroke="#111" stroke-width="10" stroke-linecap="round" />
                <path d="M 270 340 Q 300 315 330 340 M 470 340 Q 500 315 530 340" fill="#111" />`;
      rightItem = `
                <g transform="translate(20, 130) rotate(15)">
                    <rect x="-25" y="-60" width="50" height="100" rx="5" fill="#F44336" stroke="#B71C1C" stroke-width="4"/>
                    <circle cx="0" cy="40" r="25" fill="#D32F2F" stroke="#B71C1C" stroke-width="4"/>
                    <text x="0" y="48" font-size="20" fill="#FFF" font-weight="bold" text-anchor="middle">承認</text>
                </g>`;
      break;
    case 15: // ねぎってくる
      eyes = `
                <path d="M 270 340 L 330 340 M 270 340 Q 300 320 330 340" fill="#111" />
                <circle cx="500" cy="340" r="12" fill="#111" />`;
      mouth = `<path d="M 360 400 Q 400 380 440 400" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />`;
      leftItem = `
                <g transform="translate(-10, 150) rotate(-55)">
                    <rect x="-60" y="-80" width="120" height="160" rx="10" fill="#90A4AE" />
                    <rect x="-50" y="-70" width="100" height="40" rx="4" fill="#CFD8DC" />
                    <rect x="-50" y="-20" width="25" height="25" rx="4" fill="#607D8B" />
                    <rect x="-15" y="-20" width="25" height="25" rx="4" fill="#607D8B" />
                    <rect x="20" y="-20" width="30" height="60" rx="4" fill="#009688" />
                    <rect x="-50" y="15" width="25" height="25" rx="4" fill="#607D8B" />
                    <rect x="-15" y="15" width="25" height="25" rx="4" fill="#607D8B" />
                    <rect x="-50" y="50" width="60" height="25" rx="4" fill="#607D8B" />
                </g>`;
      break;
    case 16: // そうぞうできない
      eyes = `
                <path d="M 300 340 C 340 340, 340 300, 300 300 C 260 300, 260 380, 300 380 C 350 380, 350 280, 300 280" fill="none" stroke="#111" stroke-width="8" />
                <path d="M 500 340 C 540 340, 540 300, 500 300 C 460 300, 460 380, 500 380 C 550 380, 550 280, 500 280" fill="none" stroke="#111" stroke-width="8" />`;
      frontEffects = `<text x="600" y="250" font-size="120" fill="#9E9E9E" font-weight="bold">?</text>`;
      break;
    case 17: // なやめる
      eyebrows = `<path d="M 260 310 L 320 290 M 540 310 L 480 290" stroke="#111" stroke-width="12" stroke-linecap="round" />`;
      mouth = `<path d="M 350 400 Q 375 380 400 400 T 450 400" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />`;
      break;
    case 19: // しんぱいげ
      eyebrows = `<path d="M 260 310 L 320 290 M 540 310 L 480 290" stroke="#111" stroke-width="12" stroke-linecap="round" />`;
      eyes = `<circle cx="300" cy="340" r="10" fill="#111" /><circle cx="500" cy="340" r="10" fill="#111" />`;
      frontEffects = `<path d="M 580 220 Q 620 270 580 300 Q 540 270 580 220" fill="#81D4FA" stroke="#03A9F4" stroke-width="4" />`;
      break;
    case 22: // おもいつき
      eyes = `<circle cx="300" cy="340" r="18" fill="#111" /><circle cx="500" cy="340" r="18" fill="#111" />`;
      mouth = `<circle cx="400" cy="400" r="15" fill="#111" />`;
      frontEffects = `
                <g transform="translate(600, 150)">
                    <circle cx="0" cy="0" r="40" fill="#FFEB3B" stroke="#F57F17" stroke-width="6" />
                    <rect x="-15" y="40" width="30" height="20" fill="#BDBDBD" />
                    <path d="M -30 -30 L -50 -50 M 30 -30 L 50 -50 M 0 -45 L 0 -70" stroke="#FFEB3B" stroke-width="8" stroke-linecap="round"/>
                </g>`;
      break;
    case 25: // わくわく
      eyes = `<circle cx="300" cy="340" r="15" fill="#111" /><circle cx="500" cy="340" r="15" fill="#111" />`;
      mouth = `<path d="M 350 390 Q 400 450 450 390 Z" fill="#F44336" stroke="#111" stroke-width="8" stroke-linejoin="round" />`;
      background = `
                <path d="M 150 150 L 180 200 M 180 150 L 150 200 M 650 150 L 680 200 M 680 150 L 650 200" stroke="#FFC107" stroke-width="8" stroke-linecap="round" />
                <circle cx="120" cy="300" r="10" fill="#FFEB3B" />
                <circle cx="700" cy="350" r="15" fill="#FFEB3B" />`;
      break;
    case 28: // とまどう
      eyebrows = `<path d="M 260 310 L 320 290 M 540 310 L 480 290" stroke="#111" stroke-width="12" stroke-linecap="round" />`;
      mouth = `<path d="M 350 400 Q 375 380 400 400 T 450 400" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" />`;
      frontEffects = `
                <path d="M 580 200 Q 620 250 580 280 Q 540 250 580 200" fill="#81D4FA" stroke="#03A9F4" stroke-width="4" />
                <path d="M 650 250 Q 680 290 650 320 Q 620 290 650 250" fill="#81D4FA" stroke="#03A9F4" stroke-width="4" />`;
      break;
    case 30: // だいまんぞく
      eyes = `<path d="M 270 350 Q 300 320 330 350 M 470 350 Q 500 320 530 350" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round" />`;
      mouth = `<path d="M 360 400 Q 400 440 440 400 Z" fill="#F44336" stroke="#111" stroke-width="8" />`;
      backEffects = `
                <circle cx="400" cy="350" r="350" fill="#FFF59D" opacity="0.6" />
                <circle cx="400" cy="350" r="300" fill="none" stroke="#F44336" stroke-width="10" stroke-dasharray="30 20" />
                <circle cx="400" cy="350" r="250" fill="none" stroke="#4CAF50" stroke-width="10" stroke-dasharray="30 20" />
                <g stroke="#ECEFF1" stroke-width="60" stroke-linecap="round">
                    <path d="M 400 450 L 80 250" /><path d="M 400 450 L 30 500" /><path d="M 400 450 L 100 700" />
                    <path d="M 400 450 L 720 250" /><path d="M 400 450 L 770 500" /><path d="M 400 450 L 700 700" />
                </g>`;
      break;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" >
        ${defsAngel}
        <g transform="translate(3, 0) scale(0.1176)">
            ${background}
            <ellipse cx="400" cy="820" rx="120" ry="15" fill="rgba(0,0,0,0.08)" /> <!-- 影 -->
            <g transform="${transformBase}">
                ${backEffects}
                <!-- 羽 -->
                <g transform="translate(220, 480) rotate(-20)"><path d="M0,0 C-120,-60 -180,-200 -50,-240 C0,-160 30,-60 0,0 Z" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="4" /><path d="M-10,-20 C-90,-60 -130,-150 -40,-180 C0,-120 20,-50 -10,-20 Z" fill="#F5F5F5" /></g>
                <g transform="translate(580, 480) rotate(20)"><path d="M0,0 C120,-60 180,-200 50,-240 C0,-160 -30,-60 0,0 Z" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="4" /><path d="M10,-20 C90,-60 130,-150 40,-180 C0,-120 -20,-50 10,-20 Z" fill="#F5F5F5" /></g>
                <!-- 耳・足 -->
                <g transform="translate(300, 150) rotate(-10)"><ellipse cx="0" cy="0" rx="35" ry="80" fill="#FFF" stroke="#E0E0E0" stroke-width="3" /><rect x="-35" y="30" width="70" height="30" fill="#FF8A65" /></g>
                <g transform="translate(500, 150) rotate(10)"><ellipse cx="0" cy="0" rx="35" ry="80" fill="#FFF" stroke="#E0E0E0" stroke-width="3" /><rect x="-35" y="30" width="70" height="30" fill="#FF8A65" /></g>
                <g transform="translate(330, 640) rotate(15)"><rect x="-30" y="0" width="60" height="110" rx="30" fill="#81D4FA" stroke="#4FC3F7" stroke-width="5" /></g>
                <g transform="translate(470, 640) rotate(-15)"><rect x="-30" y="0" width="60" height="110" rx="30" fill="#81D4FA" stroke="#4FC3F7" stroke-width="5" /></g>
                
                <g transform="translate(200, 550) rotate(45)"><rect x="-35" y="0" width="70" height="140" rx="35" fill="#311B92" /><circle cx="0" cy="140" r="35" fill="#81D4FA" />${leftItem}</g>
                <g transform="translate(600, 550) rotate(-45)"><rect x="-35" y="0" width="70" height="140" rx="35" fill="#311B92" /><circle cx="0" cy="140" r="35" fill="#81D4FA" />${rightItem}</g>

                <ellipse cx="400" cy="450" rx="240" ry="260" fill="#81D4FA" />
                <g clip-path="url(#bodyClip)">
                    <path d="M 0 310 Q 150 250 210 280 L 240 200 L 270 270 Q 550 240 800 310 L 800 0 L 0 0 Z" fill="#37474F" />
                    <polygon points="210,380 240,300 270,350" fill="#81D4FA" />
                    <rect x="0" y="520" width="800" height="400" fill="#311B92" />
                    <polygon points="400,700 200,520 600,520" fill="#FFF" />
                    <polygon points="260,520 390,580 340,520" fill="#F0F0F0" stroke="#DDD" stroke-width="2" />
                    <polygon points="540,520 410,580 460,520" fill="#F0F0F0" stroke="#DDD" stroke-width="2" />
                    <polygon points="390,580 410,580 415,600 385,600" fill="#FFCA28" />
                    <path d="M 385 600 L 415 600 L 425 720 C 425 740, 400 750, 400 750 C 400 750, 375 740, 375 720 Z" fill="#FFD54F" />
                    <path d="M 200 520 L 400 700 L 290 520 Z" fill="#4527A0" />
                    <path d="M 600 520 L 400 700 L 510 520 Z" fill="#4527A0" />
                    <circle cx="400" cy="710" r="12" fill="#1A237E" />
                    <circle cx="400" cy="710" r="8" fill="#283593" />
                    <g transform="translate(520, 580)"><circle cx="0" cy="0" r="16" fill="#00BCD4" /><circle cx="0" cy="0" r="12" fill="#0097A7" /><text x="0" y="4" fill="#FFF" font-family="sans-serif" font-size="12" text-anchor="middle">☆</text></g>
                    <text x="240" y="630" fill="#FFF" font-family="sans-serif" font-weight="bold" font-size="65" transform="rotate(-8 240 630)">神</text>
                </g>
                ${eyebrows}${eyes}${cheeks}${nose}${mouth}
                <!-- 天使の輪 -->
                <g filter="url(#glow)"><ellipse cx="400" cy="80" rx="140" ry="35" fill="none" stroke="#FFD700" stroke-width="16" /><ellipse cx="400" cy="80" rx="140" ry="35" fill="none" stroke="#FFF7B0" stroke-width="6" /><g transform="translate(280, 50) scale(0.8)"><path d="M 0 -15 L 3 -4 L 14 0 L 3 4 L 0 15 L -3 4 L -14 0 L -3 -4 Z" fill="#FFF" /></g><g transform="translate(520, 100) scale(0.6)"><path d="M 0 -15 L 3 -4 L 14 0 L 3 4 L 0 15 L -3 4 L -14 0 L -3 -4 Z" fill="#FFF" /></g></g>
                ${frontEffects}
            </g>
        </g>
    </svg>`;
}

// ==========================================
// 💼 山田先輩 のSVG生成ロジック
// ==========================================
function getYamadaSVG(caseId: number, isAnimate = true): string {
  const svgClass = isAnimate
    ? "w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] animate-[bounce_2s_infinite]"
    : "w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]";
  let transformBase = "translate(0, 0)";
  let eyebrows = "";
  let eyes = "";
  let mouth = "";
  let effects = "";

  switch (caseId) {
    case 1: // たのもしい
      eyebrows = `<path d="M 340 210 L 380 220 M 460 210 L 420 220" stroke="#111" stroke-width="8" stroke-linecap="round" />`;
      eyes = `
                <circle cx="360" cy="240" r="8" fill="#111" />
                <circle cx="440" cy="240" r="8" fill="#111" />
                <!-- キリッとさせるための上まぶた -->
                <path d="M 345 235 L 375 240 M 455 235 L 425 240" stroke="#111" stroke-width="4" />`;
      mouth = `<path d="M 370 270 Q 400 290 430 270" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" />`;
      break;
    case 2: // しりたがり
      eyebrows = `<path d="M 340 210 Q 360 190 380 210 M 460 210 Q 440 190 420 210" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" />`;
      eyes = `<circle cx="360" cy="240" r="6" fill="#111" /><circle cx="440" cy="240" r="6" fill="#111" />`;
      mouth = `<circle cx="400" cy="275" r="10" fill="#111" />`;
      effects = `<text x="560" y="150" font-size="160" fill="#F44336" font-weight="bold">?</text>`;
      break;
    case 3: // しんぱいしょう
      eyebrows = `<path d="M 340 220 L 380 210 M 460 220 L 420 210" stroke="#111" stroke-width="8" stroke-linecap="round" />`;
      eyes = `<circle cx="360" cy="240" r="6" fill="#111" /><circle cx="440" cy="240" r="6" fill="#111" />`;
      mouth = `<path d="M 370 280 Q 385 270 400 280 T 430 280" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" />`;
      effects = `<path d="M 480 150 Q 520 200 480 230 Q 440 200 480 150" fill="#81D4FA" stroke="#03A9F4" stroke-width="4" />`;
      break;
    case 11: // みまもる
      transformBase = "translate(40, 40) scale(0.9)"; // 少し奥に配置
      eyebrows = `<path d="M 340 210 Q 360 200 380 210 M 460 210 Q 440 200 420 210" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" />`;
      eyes = `<!-- 笑ったアーチ目 -->
                    <path d="M 345 240 Q 360 230 375 240 M 425 240 Q 440 230 455 240" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" />`;
      mouth = `<path d="M 370 270 Q 400 290 430 270" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" />`;
      break;
  }

  const yamadaBaseBody = `
        <!-- 後ろ髪・耳 -->
        <circle cx="340" cy="240" r="15" fill="#fed7aa" />
        <circle cx="460" cy="240" r="15" fill="#fed7aa" />
        
        <!-- 首 -->
        <rect x="380" y="300" width="40" height="50" fill="#fed7aa" />
        
        <!-- 足 -->
        <rect x="350" y="550" width="35" height="200" fill="#1e293b" />
        <rect x="415" y="550" width="35" height="200" fill="#1e293b" />
        <!-- 靴 -->
        <path d="M 330 780 L 390 780 L 385 750 L 350 750 Z" fill="#5D4037" />
        <path d="M 470 780 L 410 780 L 415 750 L 450 750 Z" fill="#5D4037" />
        
        <!-- 体（スーツ） -->
        <path d="M 330 360 C 380 340 420 340 470 360 L 460 550 L 340 550 Z" fill="#1e293b" />
        
        <!-- 白いシャツ (Vゾーン) -->
        <polygon points="360,350 440,350 400,480" fill="#FFF" />
        <!-- シャツの襟 -->
        <polygon points="360,350 400,380 380,350" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1" />
        <polygon points="440,350 400,380 420,350" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1" />
        
        <!-- ネクタイ -->
        <polygon points="392,375 408,375 404,390 396,390" fill="#991b1b" /> <!-- 結び目 -->
        <polygon points="396,390 404,390 410,480 400,500 390,480" fill="#991b1b" /> <!-- 本体 -->
        <path d="M 392,410 L 408 400 M 390 440 L 410 430 M 390 470 L 410 460" stroke="#1e293b" stroke-width="3" /> <!-- ストライプ -->
        
        <!-- スーツのラペル（襟元） -->
        <polygon points="330,360 370,350 400,480" fill="#0f172a" />
        <polygon points="470,360 430,350 400,480" fill="#0f172a" />
        
        <!-- ネームプレート & 社章 -->
        <rect x="430" y="420" width="30" height="12" fill="#f8fafc" rx="2"/>
        <circle cx="445" cy="390" r="4" fill="#fbbf24" />

        <!-- 左腕（カバン持ち）向かって右 -->
        <path d="M 450 370 L 490 530" fill="none" stroke="#1e293b" stroke-width="35" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx="490" cy="540" r="15" fill="#fed7aa" />
        <!-- カバン -->
        <rect x="450" y="550" width="80" height="70" rx="5" fill="#795548" stroke="#5D4037" stroke-width="2"/>
        <rect x="475" y="535" width="30" height="15" fill="none" stroke="#5D4037" stroke-width="5" rx="3" />
        <rect x="485" y="570" width="10" height="10" fill="#FFC107" rx="2" />

        <!-- 右腕（スマホ持ち）向かって左 -->
        <path d="M 350 370 L 290 450 L 290 350" fill="none" stroke="#1e293b" stroke-width="35" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx="290" cy="330" r="15" fill="#fed7aa" />
        <!-- スマホ -->
        <g transform="translate(290, 330) rotate(-20)">
            <rect x="-20" y="-40" width="40" height="70" rx="5" fill="#334155" />
            <rect x="-15" y="-35" width="30" height="60" rx="3" fill="#bae6fd" />
            <rect x="-10" y="-25" width="20" height="20" rx="2" fill="#fef08a" />
        </g>

        <!-- 顔・頭部ベース -->
        <path d="M 340 220 Q 340 320 400 320 Q 460 320 460 220 Q 460 160 400 160 Q 340 160 340 220 Z" fill="#fed7aa" />
        
        <!-- 髪の毛 (トップともみあげを削除しスッキリさせました) -->
        <!-- 前髪のボリュームと流れ -->
        <path d="M 340 200 Q 360 140 410 160 Q 380 180 340 200 Z" fill="#1e293b" />
        <path d="M 460 200 Q 440 140 390 160 Q 420 180 460 200 Z" fill="#1e293b" />
    `;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" >
        <g transform="translate(3, 0) scale(0.1176)">
            <ellipse cx="400" cy="780" rx="100" ry="12" fill="rgba(0,0,0,0.1)" /> <!-- 足元の影 -->
            <g transform="${transformBase}">
                ${yamadaBaseBody}
                <!-- 表情パーツ -->
                ${eyebrows}
                ${eyes}
                ${mouth}
                ${effects}
            </g>
        </g>
    </svg>`;
}

// ==========================================
// 💻 エンジニア のSVG生成ロジック
// ==========================================
function getEngineerSVG(caseId: number, isAnimate = true): string {
  const svgClass = isAnimate
    ? "w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] animate-[bounce_2s_infinite]"
    : "w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]";
  // 共通パーツ: 背景のPCデスク
  const pcDesk = `
        <!-- デスク -->
        <rect x="5" y="70" width="90" height="30" fill="#CFD8DC" />
        <rect x="5" y="70" width="90" height="4" fill="#B0BEC5" />
        <!-- ノートPC (背面) -->
        <rect x="30" y="50" width="40" height="25" fill="#E0E0E0" rx="2" />
        <rect x="30" y="50" width="40" height="25" fill="none" stroke="#9E9E9E" stroke-width="1.5" rx="2" />
        <circle cx="50" cy="62" r="3" fill="#BDBDBD" />
    `;

  // 共通パーツ: エンジニアのベース（体・顔・マスク・メガネなど）
  const engineerBase = `
        <!-- 脚 -->
        <rect x="41" y="70" width="6" height="20" fill="#0D47A1" />
        <rect x="53" y="70" width="6" height="20" fill="#0D47A1" />
        <!-- 靴 (茶色) -->
        <rect x="38" y="90" width="9" height="5" fill="#5D4037" rx="1" />
        <rect x="53" y="90" width="9" height="5" fill="#5D4037" rx="1" />
        
        <!-- 胴体 (紺スーツ) -->
        <rect x="35" y="42" width="30" height="28" fill="#0D47A1" rx="2" />
        <!-- 腕 -->
        <rect x="29" y="44" width="6" height="24" fill="#0D47A1" rx="2" />
        <rect x="65" y="44" width="6" height="24" fill="#0D47A1" rx="2" />
        <!-- 手 -->
        <circle cx="32" cy="68" r="3" fill="#fed7aa" />
        <circle cx="68" cy="68" r="3" fill="#fed7aa" />
        <!-- スマートウォッチ (左腕に装着) -->
        <rect x="65" y="63" width="7" height="4" fill="#424242" />
        <circle cx="68.5" cy="65" r="2.5" fill="#212121" />
        <circle cx="68.5" cy="65" r="1.5" fill="#FF9800" /> <!-- オレンジのアクセント -->

        <!-- Vゾーン (ワイシャツ) -->
        <polygon points="43,42 57,42 50,55" fill="#FFF" />
        <!-- ネクタイ (紫) -->
        <polygon points="48,44 52,44 50,53" fill="#5E35B1" />
        <!-- スーツの襟 -->
        <polygon points="35,42 43,42 50,58" fill="#1565C0" />
        <polygon points="65,42 57,42 50,58" fill="#1565C0" />
        <!-- ネームタグ -->
        <rect x="44" y="56" width="10" height="7" fill="#ECEFF1" rx="1" stroke="#90A4AE" stroke-width="0.5" />
        <rect x="45" y="58" width="3" height="3" fill="#1976D2" />
        <rect x="49" y="58" width="4" height="1.5" fill="#B0BEC5" />
        <rect x="49" y="60.5" width="4" height="1.5" fill="#B0BEC5" />
        
        <!-- 頭部 (肌) -->
        <rect x="34" y="14" width="32" height="26" fill="#fed7aa" rx="6" />
        
        <!-- 黒縁メガネ -->
        <rect x="37" y="24" width="11" height="7" fill="#FFF" stroke="#212121" stroke-width="2" rx="0.5" />
        <rect x="52" y="24" width="11" height="7" fill="#FFF" stroke="#212121" stroke-width="2" rx="0.5" />
        <line x1="48" y1="27.5" x2="52" y2="27.5" stroke="#212121" stroke-width="2" />
        <line x1="34" y1="27.5" x2="37" y2="27.5" stroke="#212121" stroke-width="2" />
        <line x1="63" y1="27.5" x2="66" y2="27.5" stroke="#212121" stroke-width="2" />

        <!-- 髪 (黒〜ダークグレー) -->
        <path d="M 33 20 C 33 5 67 5 67 20 C 67 12 50 8 33 20 Z" fill="#333" />
        <polygon points="32,22 36,12 45,8 55,8 64,12 68,22 65,16 60,10 40,10 35,16" fill="#333" />
    `;

  let innerSVG = "";

  // ご提示いただいたケース番号に応じたSVGの組み上げ
  switch (caseId) {
    case 13: // 電卓をはじく エンジニア
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <circle cx="44" cy="27" r="1.5" fill="#333" /><circle cx="56" cy="27" r="1.5" fill="#333" />
                <path d="M47,33 L53,33" fill="none" stroke="#333" stroke-width="1.5" />
                <!-- 手前の電卓 -->
                <rect x="25" y="60" width="25" height="10" fill="#795548" stroke="#333" stroke-width="1.5" />
                <line x1="25" y1="63" x2="50" y2="63" stroke="#333" stroke-width="1" />
                <circle cx="30" cy="65" r="1" fill="#333" /><circle cx="35" cy="65" r="1" fill="#333" />
            `;
      break;
    case 14: // よぼうせんをはる エンジニア
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <circle cx="44" cy="27" r="1.5" fill="#333" /><circle cx="56" cy="27" r="1.5" fill="#333" />
                <path d="M47,34 Q50,32 53,34" fill="none" stroke="#333" stroke-width="1.5" />
                <!-- バリアーのようなエフェクト -->
                <path d="M20,40 Q50,30 80,40 L70,80 Q50,95 30,80 Z" fill="#00BCD4" opacity="0.4" stroke="#0097A7" stroke-width="2" />
            `;
      break;
    case 18: // こまかすぎる エンジニア
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <circle cx="44" cy="27" r="1.5" fill="#333" /><circle cx="56" cy="27" r="1.5" fill="#333" />
                <path d="M47,34 Q50,36 53,34" fill="none" stroke="#333" stroke-width="1.5" />
                <!-- 虫眼鏡のようなエフェクト -->
                <circle cx="45" cy="55" r="6" fill="#E1F5FE" stroke="#333" stroke-width="1.5" opacity="0.8" />
                <line x1="40" y1="60" x2="35" y2="65" stroke="#333" stroke-width="2" />
            `;
      break;
    case 20: // ごきげんな エンジニア
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <path d="M42,27 Q44,25 46,27 M54,27 Q56,25 58,27" fill="none" stroke="#333" stroke-width="1.5" />
                <path d="M46,34 Q50,38 54,34" fill="none" stroke="#333" stroke-width="1.5" />
                <text x="25" y="30" font-size="16" fill="#E91E63">♪</text>
                <text x="70" y="20" font-size="12" fill="#E91E63">♪</text>
            `;
      break;
    case 21: // やりきった エンジニア
      innerSVG = `
                <defs>
                    <filter id="grayscale"><feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" /></filter>
                </defs>
                ${pcDesk}
                <g filter="url(#grayscale)">
                    ${engineerBase}
                    <path d="M42,28 L46,28 M54,28 L58,28" fill="none" stroke="#333" stroke-width="1.5" />
                    <path d="M48,35 Q50,33 52,35" fill="none" stroke="#333" stroke-width="1.5" />
                    <path d="M50,15 Q55,5 60,10" fill="none" stroke="#E0E0E0" stroke-width="1.5" stroke-dasharray="2 2" />
                </g>
            `;
      break;
    case 23: // うたぐりぶかい エンジニア
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <path d="M41,25 L47,27 M59,25 L53,27" fill="none" stroke="#333" stroke-width="1.5" />
                <path d="M42,28 L46,28 M54,28 L58,28" fill="none" stroke="#333" stroke-width="1.5" />
                <path d="M46,34 L54,34" fill="none" stroke="#333" stroke-width="1.5" />
            `;
      break;
    case 24: // めをそらす エンジニア
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <circle cx="42" cy="27" r="1.5" fill="#333" /><circle cx="54" cy="27" r="1.5" fill="#333" />
                <circle cx="50" cy="34" r="1.5" fill="none" stroke="#333" stroke-width="1" />
                <!-- 汗 -->
                <path d="M62,20 Q65,27 60,27 Q57,27 60,20" fill="#81D4FA" stroke="#03A9F4" stroke-width="1" />
            `;
      break;
    case 26: // そわそわする エンジニア
      innerSVG = `
                ${pcDesk}
                <!-- 残像効果 -->
                <g opacity="0.4" transform="translate(-3, 0)">${engineerBase}</g>
                <g opacity="0.4" transform="translate(3, 0)">${engineerBase}</g>
                <g>
                    ${engineerBase}
                    <circle cx="44" cy="27" r="1.5" fill="#333" /><circle cx="56" cy="27" r="1.5" fill="#333" />
                    <path d="M46,35 Q48,33 50,35 T54,35" fill="none" stroke="#333" stroke-width="1.5" />
                </g>
            `;
      break;
    case 27: // えんじょう エンジニア (炎上タッグ風)
      innerSVG = `
                <!-- 燃え盛る背景炎 -->
                <path d="M0,100 Q10,70 20,85 T40,60 T60,80 T80,55 T100,100 Z" fill="#D32F2F" />
                <path d="M10,100 Q20,80 30,90 T50,70 T70,85 T90,65 T100,100 Z" fill="#FFC107" />
                <path d="M40,50 Q10,30 15,80 M60,50 Q90,30 85,80 M35,60 Q5,50 10,90 M65,60 Q95,50 90,90" fill="none" stroke="#B71C1C" stroke-width="4" stroke-linecap="round" />
                
                <!-- 燃える看板のようなもの -->
                <rect x="60" y="10" width="30" height="22" fill="#D32F2F" stroke="#333" stroke-width="1.5" />
                <rect x="63" y="13" width="24" height="16" fill="#212121" />
                <path d="M75,15 L70,26 L80,26 Z" fill="none" stroke="#FFEB3B" stroke-width="1.5" />
                <line x1="75" y1="18" x2="75" y2="23" stroke="#FFEB3B" stroke-width="1.5" />
                <circle cx="75" cy="25" r="0.5" fill="#FFEB3B" />
                
                ${pcDesk}
                <rect x="38" y="53" width="24" height="14" fill="#D32F2F" /> <!-- PCも赤い -->
                <path d="M35,60 Q45,40 50,55 Q55,40 65,60 Z" fill="#FFC107" /> <!-- PCからの炎 -->
                
                ${engineerBase}
                <path d="M42,26 L47,28 M58,26 L53,28" fill="none" stroke="#333" stroke-width="1.5" />
                <circle cx="44" cy="28" r="1.5" fill="#333" /><circle cx="56" cy="28" r="1.5" fill="#333" />
                <path d="M46,35 Q50,33 54,35" fill="none" stroke="#333" stroke-width="1.5" />
                <path d="M62,18 Q65,25 60,25 Q57,25 60,18" fill="#81D4FA" stroke="#03A9F4" stroke-width="1" />
            `;
      break;
    case 29: // あわてる エンジニア
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <!-- ばってん目 -->
                <path d="M42,25 L46,29 M46,25 L42,29 M54,25 L58,29 M58,25 L54,29" stroke="#333" stroke-width="1.5" />
                <!-- 大きく開いた口 -->
                <circle cx="50" cy="35" r="3" fill="none" stroke="#333" stroke-width="1.5" />
                <!-- 汗 -->
                <path d="M62,15 Q65,22 60,22 Q57,22 60,15 M38,18 Q41,25 36,25 Q33,25 36,18" fill="#81D4FA" stroke="#03A9F4" stroke-width="1" />
            `;
      break;
    default:
      innerSVG = `
                ${pcDesk}
                ${engineerBase}
                <circle cx="44" cy="27" r="1.5" fill="#333" /><circle cx="56" cy="27" r="1.5" fill="#333" />
                <path d="M47,34 Q50,36 53,34" fill="none" stroke="#333" stroke-width="1.5" />
            `;
  }

  // エンジニアは元々 viewBox="0 0 100 100" スケールで描画しているので、全体をそのまま囲みます
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" >
        <!-- 足元の影 -->
        <ellipse cx="50" cy="98" rx="20" ry="2" fill="rgba(0,0,0,0.1)" />
        ${innerSVG}
    </svg>`;
}

/**
 * 場面の 番号から 敵の 絵を 引く（旧アプリ `getEnemySvg` の 逐語移植）。
 */
export function enemySvg(phaseId: number): string {
  if ([1, 2, 3, 11].includes(phaseId)) return getYamadaSVG(phaseId);
  if ([13, 14, 18, 20, 21, 23, 24, 26, 27, 29].includes(phaseId)) return getEngineerSVG(phaseId);
  return getAngelSVG(phaseId);
}

/** 場面ごとの 背景（旧アプリ `getPhaseBackground` の 逐語移植）。 */
export function phaseBackground(phaseId: number): string {
  switch (phaseId) {
    case 1:
      return "bg-gradient-to-b from-blue-900/80 to-black";
    case 2:
      return "bg-gradient-to-b from-teal-900/80 to-black";
    case 3:
      return "bg-gradient-to-b from-amber-900/80 to-black";
    case 4:
      return "bg-gradient-to-b from-purple-900/80 to-black";
    case 5:
      return "bg-gradient-to-b from-red-950/80 to-black";
    case 6:
      return "bg-gradient-to-b from-slate-800/80 to-black";
    default:
      return "bg-black";
  }
}
