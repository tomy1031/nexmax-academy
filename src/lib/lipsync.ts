// かな文字列 → VRM表情プリセット（あ・い・う・え・お）の口パクタイムライン生成。
// 音素アライメント（Julius等）を使わない近似方式: モーラ等間隔割付＋音声全長スケール。
// パイロット用。精度を上げる場合はここを forced alignment の出力に差し替える。

export type Viseme = "aa" | "ih" | "ou" | "ee" | "oh";

export interface MoraEvent {
  start: number;
  end: number;
  /** null = 口を閉じる（ん・っ・句読点ポーズ） */
  viseme: Viseme | null;
}

const VOWEL_TABLE: Record<Viseme, string> = {
  aa: "あかさたなはまやらわがざだばぱぁゃ",
  ih: "いきしちにひみりぎじぢびぴぃ",
  ou: "うくすつぬふむゆるぐずづぶぷぅゅゔ",
  ee: "えけせてねへめれげぜでべぺぇ",
  oh: "おこそとのほもよろをごぞどぼぽぉょ",
};

const PAUSE_LONG = "。！？!?";
const PAUSE_SHORT = "、,.";

/** カタカナをひらがなに正規化（ァ U+30A1 〜 ヶ U+30F6） */
function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function kanaToViseme(ch: string): Viseme | null {
  for (const viseme of Object.keys(VOWEL_TABLE) as Viseme[]) {
    if (VOWEL_TABLE[viseme].includes(ch)) return viseme;
  }
  return null; // ん・っ・記号など → 口を閉じる
}

interface MoraUnit {
  viseme: Viseme | null;
  weight: number; // 相対的な長さ
}

const SMALL_KANA = "ぁぃぅぇぉゃゅょ";

/**
 * かな文字列をモーラ単位に分解し、各モーラの口形状と相対長を返す。
 * - 拗音（きゃ等）は直前のモーラに統合し、小書き文字の母音を採用
 * - 長音「ー」は直前の口形状を維持
 * - 句読点はポーズ（口を閉じる・長め）
 */
function splitMoras(kana: string): MoraUnit[] {
  const units: MoraUnit[] = [];
  for (const ch of toHiragana(kana)) {
    if (/\s/.test(ch)) continue;
    if (PAUSE_LONG.includes(ch)) {
      units.push({ viseme: null, weight: 2.2 });
      continue;
    }
    if (PAUSE_SHORT.includes(ch)) {
      units.push({ viseme: null, weight: 1.4 });
      continue;
    }
    if (ch === "ー") {
      const prev = units[units.length - 1];
      units.push({ viseme: prev ? prev.viseme : null, weight: 1 });
      continue;
    }
    if (SMALL_KANA.includes(ch)) {
      const prev = units[units.length - 1];
      if (prev) prev.viseme = kanaToViseme(ch);
      continue;
    }
    if (ch === "ん" || ch === "っ") {
      units.push({ viseme: null, weight: 0.8 });
      continue;
    }
    units.push({ viseme: kanaToViseme(ch), weight: 1 });
  }
  return units;
}

/** 1モーラの標準長（秒）。日本語の発話速度 約7〜8モーラ/秒。 */
const DEFAULT_MORA_SEC = 0.135;

/**
 * かな文字列から口パクタイムラインを作る。
 * @param totalDuration 音声の実長（秒）。与えるとタイムライン全体をその長さにスケールする。
 */
export function buildMoraTimeline(kana: string, totalDuration?: number): MoraEvent[] {
  const units = splitMoras(kana);
  const totalWeight = units.reduce((sum, u) => sum + u.weight, 0);
  if (totalWeight === 0) return [];

  const scale = totalDuration !== undefined ? totalDuration / totalWeight : DEFAULT_MORA_SEC;

  const events: MoraEvent[] = [];
  let t = 0;
  for (const unit of units) {
    const dur = unit.weight * scale;
    events.push({ start: t, end: t + dur, viseme: unit.viseme });
    t += dur;
  }
  return events;
}

/** タイムライン全長（秒） */
export function timelineDuration(events: MoraEvent[]): number {
  const last = events[events.length - 1];
  return last ? last.end : 0;
}

export const ALL_VISEMES: Viseme[] = ["aa", "ih", "ou", "ee", "oh"];
