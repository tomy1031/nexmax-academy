#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 物語に声を付ける（Gemini TTS）。1人ずつ、まとめて読ませる。
//
//   GEMINI_API_KEY=… node scripts/make-voices.mjs --episodes miyoshi-prologue,miyoshi-kazurabashi --max-calls 10
//   … --dry-run                  何回の呼び出しになるか、だれの何行かを表示するだけ
//   … --only noritsune,narr      その人物だけ
//   … --nekmax-voice <声の名前>   ネクマックスの声（design/voice-cast.json が null のとき）
//   … --lines <json> --cast <json> --out <dir>
//                                 台本の行・配役・出し先をファイルで渡す（このリポジトリの外で動かすとき。
//                                 鍵のある別のリポジトリの Actions で作る：docs/sound.md）
//   … --index-only               声のファイルの一覧（index.json）だけを作りなおす
//
// しくみ（tomy1031/gemini-voice-tool と同じ）：
//   1. 話し手ごとに、行を「<long pause>」でつないで1回で読ませる（style に年齢・感情・息づかい）
//   2. 返ってきた音を、無音の長いところで1行ずつに切る
//   3. MP3 にして src/assets/audio/voice/<vid>.mp3 に置く（アプリは自動で鳴らす）
// TTS の無料枠は1日10回まで。--max-calls で、今日使う回数を決める。
// ─────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as core from './lib/gemini-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(`--${n}`);
const episodes = (opt('episodes') ?? 'miyoshi-prologue,miyoshi-kazurabashi').split(',');
const maxCalls = Number(opt('max-calls') ?? 10);
const only = opt('only')?.split(',');
const dry = flag('dry-run');
const PER_CALL = Number(opt('per-call') ?? 16); // 1回に読ませる行の数（多いと切り分けに失敗しやすい）

const cast = JSON.parse(readFileSync(resolve(opt('cast') ?? join(ROOT, 'design/voice-cast.json')), 'utf8'));
if (opt('nekmax-voice')) cast.cast.nekmax.voice = opt('nekmax-voice');
const model = opt('model') ?? cast.model;

// 台本から、声を付ける行を取り出す（--lines があれば、そのファイルを使う）
let linesFile = opt('lines') && resolve(opt('lines'));
if (!linesFile) {
  const b = spawnSync('npx', ['esbuild', 'scripts/voice-lines.ts', '--bundle', '--platform=node', '--format=esm', '--log-level=warning', '--outfile=.codex-out/voice-lines.mjs'], { cwd: ROOT, stdio: 'inherit' });
  if (b.status !== 0) process.exit(1);
  spawnSync('node', ['.codex-out/voice-lines.mjs'], { cwd: ROOT, stdio: 'inherit' });
  linesFile = join(ROOT, '.codex-out/voice-lines.json');
}
const all = JSON.parse(readFileSync(linesFile, 'utf8'));

const OUT = resolve(opt('out') ?? join(ROOT, 'src/assets/audio/voice'));
mkdirSync(OUT, { recursive: true });
const done = (vid) => existsSync(join(OUT, `${vid}.mp3`));
// どの行の声か（あとで確かめられるように）
const writeIndex = () => {
  const index = Object.fromEntries(all.filter((l) => done(l.vid)).map((l) => [l.vid, { episode: l.episode, speaker: l.speaker, text: l.text }]));
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  return Object.keys(index).length;
};
if (flag('index-only')) { console.log(`index.json：${writeIndex()}行`); process.exit(0); }

// 話し手ごとにまとめる（選んだ話をまたいで、1人ずつ。まだ無い行だけ）
const groups = [];
const lines = all.filter((l) => episodes.includes(l.episode) && !done(l.vid) && (!only || only.includes(l.speaker)))
  .sort((a, b) => episodes.indexOf(a.episode) - episodes.indexOf(b.episode));
const bySpeaker = new Map();
for (const l of lines) {
  if (!bySpeaker.has(l.speaker)) bySpeaker.set(l.speaker, []);
  bySpeaker.get(l.speaker).push(l);
}
for (const [speaker, ls] of bySpeaker) {
  const c = cast.cast[speaker];
  if (!c?.voice) { console.warn(`  ${speaker}：声が決まっていないので作りません（design/voice-cast.json）`); continue; }
  for (let i = 0; i < ls.length; i += PER_CALL) groups.push({ episode: [...new Set(ls.slice(i, i + PER_CALL).map((l) => l.episode))].join('+'), speaker, voice: c.voice, style: c.style, lines: ls.slice(i, i + PER_CALL) });
}
const planned = groups.slice(0, maxCalls);
console.log(`\n呼び出し：${groups.length}回（今回は ${planned.length}回まで）／行：${planned.reduce((n, g) => n + g.lines.length, 0)}`);
for (const g of planned) console.log(`  ${g.episode}　${g.speaker}（${g.voice}）${g.lines.length}行`);
if (dry) process.exit(0);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY がありません。環境の設定に入れてから、新しいセッションで実行してください。'); process.exit(1); }

/** 読み方の指示を、1行ずつの言い方（叫ぶ・ささやく）も足して作る */
const styleOf = (g) => `${g.style} 書かれた文だけを、書かれたとおりに読む。説明や返事を足さない。`;
const say = (l) => (l.style === 'shout' ? `${l.text}（叫ぶように）` : l.style === 'whisper' ? `${l.text}（ささやくように）` : l.text).replace(/^（小声）/, '');

const toMp3 = (pcm, file) => {
  const wav = join(tmpdir(), `ido-voice-${process.pid}.wav`);
  writeFileSync(wav, core.pcmToWav(core.fadeEdges(pcm)));
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '24000', '-b:a', '48k', file]);
  rmSync(wav, { force: true });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};

let calls = 0, made = 0;
const failed = [];
for (const g of planned) {
  calls++;
  console.log(`▶ (${calls}/${planned.length}) ${g.episode} ${g.speaker} ${g.lines.length}行`);
  try {
    const lines = g.lines.map((l, i) => ({ speaker: g.speaker, text: say(l) + (i < g.lines.length - 1 ? ` ${core.LONG_PAUSE}` : '') }));
    const pcm = await core.ttsSpeak(apiKey, model, { lines, voices: { [g.speaker]: g.voice }, style: styleOf(g) });
    const pieces = g.lines.length === 1 ? [core.trimSilence(pcm)]
      : core.splitDialogue(pcm, g.lines.map((l) => core.normalizeForCompare(l.text).length || 1)).pieces;
    if (!pieces) throw new Error('まとめて読んだ音を1行ずつに切れませんでした（--per-call を小さくして、もう一度）');
    g.lines.forEach((l, i) => toMp3(pieces[i], join(OUT, `${l.vid}.mp3`)));
    made += g.lines.length;
    console.log(`  ✓ ${g.lines.length}行`);
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed.push(`${g.episode}/${g.speaker}`);
    if (e.quota) { console.error('  今日の上限に達したようです。続きは明日。'); break; }
  }
  await new Promise((r) => setTimeout(r, 3000));
}
writeIndex();
console.log(`\n完了：${made}行${failed.length ? `／失敗：${failed.join(', ')}` : ''}`);
