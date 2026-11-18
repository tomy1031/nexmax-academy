/*
 * 相談の 練習問題 — 判定と 点の 決まり（画面を 持たない 純粋な 関数だけ）
 *
 * エンジン（soudan_renshu.html）と テスト（tests/soudan_renshu_tool.test.ts）の 両方が 読む。
 * ブラウザでは `window.SOUDAN_LOGIC` に 入る。
 *
 * ## Gemini は 判定だけ（5日間の 相談と 同じ 考え方）
 * Gemini が 返すのは 5つの 要素の あるなし・加点・自分の ことばか・選んだ 方法・失敗の 印 だけ。
 * **学生に 見せる 文は 1つも 作らせない**——ヘンディさんの 反応・お手本は データの 文。
 *
 * ## 合格は ここで 決める
 * 「その レベルで 要る 要素が ぜんぶ ある・勝手に 決めて いない・話が ずれて いない・
 * 聞き取れて いる」を ここで 数える。Gemini の さじ加減に しない。
 */
(function (root) {
  "use strict";

  var PART_KEYS = ["jokyo", "mondai", "kakunin", "kangae", "soudan"];

  /** Gemini の 返事の 形（responseSchema）。 */
  function judgeSchema(level) {
    var choiceKeys = Object.keys((level.ai && level.ai.choices) || {});
    var props = {};
    PART_KEYS.forEach(function (key) {
      props[key] = { type: "BOOLEAN" };
    });
    props.own_words = { type: "BOOLEAN" };
    props.bonus = { type: "ARRAY", items: { type: "STRING" } };
    props.choice = { type: "STRING", enum: choiceKeys.concat(["none"]) };
    props.decided_alone = { type: "BOOLEAN" };
    props.off_topic = { type: "BOOLEAN" };
    props.unclear = { type: "BOOLEAN" };
    return {
      type: "OBJECT",
      properties: props,
      required: PART_KEYS.concat([
        "own_words",
        "bonus",
        "choice",
        "decided_alone",
        "off_topic",
        "unclear",
      ]),
    };
  }

  /** ルビ記法 {表記|よみ} を はずす（Gemini に 渡す 文・先生の 記録の 文）。 */
  function plain(text) {
    return String(text == null ? "" : text).replace(/\{([^{}|]+)\|[^{}|]+\}/g, "$1");
  }

  /** 1回ぶんの 頼み。 */
  function buildJudgePrompt(level, utterance, opts) {
    var ai = level.ai || {};
    var parts = ai.parts || {};
    var labels = {
      jokyo: "状況",
      mondai: "問題",
      kakunin: "確認したこと",
      kangae: "自分の考え",
      soudan: "相談したいこと",
    };
    var bonus = ai.bonus || {};
    var choices = ai.choices || {};
    var hintsOpened = !!(opts && opts.hintsOpened);
    var lines = [
      "あなたは 日本語の 授業の 判定係です。学生（日本語 N4・IT専攻）が、職場で 上司の ヘンディさんに 相談する 練習を して います。",
      "学生の 相談を 読んで、決まった 形の JSON だけを 返します。学生に 話しかけません。",
      "意味が 伝われば よいです。助詞や 活用の まちがい・発音・敬語の レベル・語順・言いよどみは 見ません。お手本と 同じ ことばで なくても かまいません。",
      "学生の 文は 音声の 聞き取りなので、漢字・かな・同じ 音の まちがいが あっても、意味で 判断します。",
      "",
      "場面: " + plain(ai.scene),
      "",
      "相談の 5つの 要素（それぞれ true / false）:",
    ];
    PART_KEYS.forEach(function (key) {
      lines.push(
        "- " + key + "（" + labels[key] + "）: " + (parts[key] || "（このレベルでは見ない）"),
      );
    });
    lines.push("この レベルで 必ず 要る 要素: " + (ai.required || []).join(", "));
    lines.push("");
    lines.push(
      "decided_alone: " +
        (ai.decidedAlone && ai.decidedAlone.indexOf("false") < 0
          ? ai.decidedAlone
          : "このレベルでは 見ません。いつも false。"),
    );
    lines.push("off_topic: いまの 相談と 関係の ない 話だけを して いる。");
    lines.push("unclear: 文が 短すぎる・ほとんど 意味が とれない（相談に なって いない）。");
    lines.push("");
    lines.push("own_words（自分で 考えた 文か）:");
    lines.push(
      "学生には 次の ヒント（文の 型）を 見せる ことが あります: " +
        (level.hints || [])
          .map(function (hint) {
            return plain(hint.text);
          })
          .join(" "),
    );
    lines.push(
      "ヒントの 型の 空欄を 埋めた だけの 文なら false。ヒントに 無い 内容（理由・期限・数字・自分の 案・比べた こと・別の 言い方 など）を 自分で 1つ 以上 足して いれば true。",
    );
    lines.push(
      "（参考: 学生は この 相談の 前に ヒントを " +
        (hintsOpened ? "開きました" : "開いて いません") +
        "。）",
    );
    lines.push("");
    var bonusIds = Object.keys(bonus);
    if (bonusIds.length > 0) {
      lines.push("bonus（当てはまる id を すべて 入れる。無ければ 空の 配列）:");
      bonusIds.forEach(function (id) {
        lines.push("- " + id + ": " + bonus[id]);
      });
    } else {
      lines.push("bonus: いつも 空の 配列。");
    }
    var choiceIds = Object.keys(choices);
    if (choiceIds.length > 0) {
      lines.push(
        "choice（学生が いいと 言った 方法・先に する 仕事・選んだ API。当てはまらなければ none）:",
      );
      choiceIds.forEach(function (id) {
        lines.push("- " + id + ": " + choices[id]);
      });
    } else {
      lines.push("choice: いつも none。");
    }
    lines.push("");
    lines.push(
      "参考の お手本（同じ ことばで なくて よい）: " +
        (level.model || [])
          .map(function (one) {
            return plain(one.text);
          })
          .join(""),
    );
    lines.push("");
    lines.push("学生の 相談: 「" + String(utterance || "").trim() + "」");
    return lines.join("\n");
  }

  function asBool(value) {
    return value === true || value === "true";
  }

  /**
   * Gemini の 返事 → 判定。崩れて いたら null。
   * 合格は ここで 決める: 要る 要素が ぜんぶ true で、失敗の 印が 1つも ない とき だけ。
   */
  function settle(level, raw, utterance, opts) {
    if (!raw || typeof raw !== "object") return null;
    var ai = level.ai || {};
    var required = ai.required || [];
    var parts = {};
    PART_KEYS.forEach(function (key) {
      parts[key] = asBool(raw[key]);
    });
    var missing = required.filter(function (key) {
      return !parts[key];
    });
    var knownBonus = Object.keys(ai.bonus || {});
    var bonus = Array.isArray(raw.bonus)
      ? raw.bonus.filter(function (id, at, all) {
          return knownBonus.indexOf(id) >= 0 && all.indexOf(id) === at;
        })
      : [];
    var choiceKeys = Object.keys(ai.choices || {});
    var choice =
      typeof raw.choice === "string" && choiceKeys.indexOf(raw.choice) >= 0 ? raw.choice : "none";
    var decidedAlone =
      asBool(raw.decided_alone) && !!ai.decidedAlone && ai.decidedAlone.indexOf("false") < 0;
    var offTopic = asBool(raw.off_topic);
    var unclear = asBool(raw.unclear) || String(utterance || "").trim().length < 4;
    var failure = "none";
    if (unclear) failure = "unclear";
    else if (offTopic) failure = "off_topic";
    else if (decidedAlone) failure = "decided_alone";
    else if (missing.length > 0) failure = "missing";
    var hintsOpened = !!(opts && opts.hintsOpened);
    var geminiOwn = asBool(raw.own_words);
    return {
      pass: failure === "none",
      parts: parts,
      missing: missing,
      bonus: bonus,
      /** 自分の ことばで 話せた（ヒントを 見ないで 話した、または ヒントに 無い ことを 足した）。 */
      ownWords: !hintsOpened || geminiOwn,
      /** ヒントに 無い ことを 自分で 足したか（Gemini の 見立て）。 */
      addedOwn: geminiOwn,
      /** ヒントを 開いて、その 型を うめた だけ（「どう 伝えると よかったか」を 強く 出す）。 */
      templateOnly: hintsOpened && !geminiOwn,
      choice: choice,
      failure: failure,
      heard: String(utterance || "").trim(),
    };
  }

  /** やり直しの とき、ヘンディさんの 反応に 使う 鍵（足りない 要素なら その 要素の 鍵）。 */
  function reactionKey(judgment) {
    if (!judgment) return "unclear";
    if (judgment.failure === "missing") return judgment.missing[0] || "soudan";
    return judgment.failure;
  }

  /** 回数に 数える 失敗か（聞き取れない は 数えない）。 */
  function countsAsFail(judgment) {
    return !!judgment && !judgment.pass && judgment.failure !== "unclear";
  }

  /** 失敗の 回数 → 星（1回で 合格 3つ・ヒントを 見て 2つ・お手本を 読んで 1つ）。 */
  function starsForFails(fails) {
    if (fails <= 0) return 3;
    if (fails <= 2) return 2;
    return 1;
  }

  /** 失敗の 回数 → 支え（0=なし・1=反応と 光る 項目・2=ヒントを 開く・3=お手本）。 */
  function supportLevel(fails) {
    if (fails <= 0) return 0;
    if (fails === 1) return 1;
    if (fails === 2) return 2;
    return 3;
  }

  /** 加点（自分の ことば ＋ その レベルの 加点の 数）。 */
  function bonusPoints(judgment) {
    if (!judgment) return 0;
    return (judgment.ownWords ? 1 : 0) + judgment.bonus.length;
  }

  /** その レベルで 取れる 加点の 最大。 */
  function maxBonus(level) {
    return 1 + (level.bonus || []).length;
  }

  /* ---------------- お手本を 読んだか（5日間の readsExample と 同じ 見方） ---------------- */

  function fold(text) {
    return plain(text).replace(/[\s、。，．,.!?！？「」『』（）()・…〜~ー\-]/g, "");
  }

  function pairs(text) {
    var out = {};
    var count = 0;
    for (var i = 0; i + 1 < text.length; i += 1) {
      var pair = text.slice(i, i + 2);
      if (!out[pair]) {
        out[pair] = true;
        count += 1;
      }
    }
    return { set: out, size: count };
  }

  function overlap(said, model) {
    if (model.size === 0) return 0;
    var hit = 0;
    for (var pair in model.set) if (said.set[pair]) hit += 1;
    return hit / model.size;
  }

  /**
   * お手本を 声に 出して 読んだか。全体の 6割と、**最後の 文（相談したい こと）**の 6割の 両方。
   * ①②だけ 読んで お願いを 言わない 読み方では 通さない。
   */
  function readsModel(utterance, model) {
    var said = pairs(fold(utterance));
    if (said.size === 0) return false;
    var texts = (model || []).map(function (one) {
      return one.text;
    });
    var whole = texts.join("");
    var last = texts[texts.length - 1] || whole;
    return overlap(said, pairs(fold(whole))) >= 0.6 && overlap(said, pairs(fold(last))) >= 0.6;
  }

  /* ---------------- 席の 絵の 並び ---------------- */

  /**
   * 席の 絵の 並び（くり返す）。はじめは かならず 話しかけては いけない 状態。
   * 大丈夫そうに なる 時刻と、だめな 3つの 順は レベルごとに 変える（時間だけで 押せない）。
   * 乱数に しないのは、テストで 決まる ように。となり同士（さいごと はじめも）は 別の 状態。
   */
  function deskCycle(seed) {
    var waits = [
      ["phone", "busy", "talking"],
      ["busy", "talking", "phone"],
      ["talking", "phone", "busy"],
    ];
    var hash = 0;
    var text = String(seed);
    for (var i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    var w = waits[hash % waits.length];
    switch (Math.floor(hash / waits.length) % 3) {
      case 0:
        return [w[0], "ok", w[1], w[2], "ok"];
      case 1:
        return [w[0], w[1], "ok", w[2], "ok"];
      default:
        return [w[0], w[1], w[2], "ok", w[0], "ok"].filter(function (state, at, all) {
          return at === 0 || state !== all[at - 1];
        });
    }
  }

  /* ---------------- 進み具合（DB の position は 数だけ） ---------------- */

  /** 端末の 保存 → DB に 置く 数（`content_progress.position`）。 */
  function toPosition(save, levelCount) {
    var pos = { intro: save.introSeen ? 1 : 0, open: openLevelCount(save, levelCount) };
    for (var n = 1; n <= levelCount; n += 1) {
      var one = (save.levels && save.levels["l" + n]) || {};
      pos["s" + n] = clampInt(one.stars, 0, 3);
      pos["p" + n] = clampInt(one.bonus, 0, 9);
    }
    return pos;
  }

  /** DB の 数 → 端末の 保存に 足す（大きい ほうを 残す）。 */
  function mergePosition(save, position, levelCount) {
    var out = JSON.parse(JSON.stringify(save));
    if (!position || typeof position !== "object") return out;
    if (position.intro === 1) out.introSeen = true;
    out.levels = out.levels || {};
    for (var n = 1; n <= levelCount; n += 1) {
      var key = "l" + n;
      var one = out.levels[key] || {};
      var stars = clampInt(position["s" + n], 0, 3);
      var bonus = clampInt(position["p" + n], 0, 9);
      out.levels[key] = Object.assign({}, one, {
        stars: Math.max(clampInt(one.stars, 0, 3), stars),
        bonus: Math.max(clampInt(one.bonus, 0, 9), bonus),
      });
    }
    return out;
  }

  /** 開いて いる レベルの 数（クリアした つぎの レベルまで 開く）。 */
  function openLevelCount(save, levelCount) {
    var open = 1;
    for (var n = 1; n < levelCount; n += 1) {
      var one = (save.levels && save.levels["l" + n]) || {};
      if (clampInt(one.stars, 0, 3) > 0) open = n + 1;
      else break;
    }
    return open;
  }

  function allCleared(save, levelCount) {
    for (var n = 1; n <= levelCount; n += 1) {
      var one = (save.levels && save.levels["l" + n]) || {};
      if (clampInt(one.stars, 0, 3) <= 0) return false;
    }
    return true;
  }

  function clampInt(value, min, max) {
    if (typeof value !== "number" || !isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.floor(value)));
  }

  /* ---------------- 先生の 画面に 残す 文 ---------------- */

  /** 相談の 記録（何回目に 何と 言ったか・合否）。1000字で 切る。 */
  function attemptsText(attempts) {
    var text = (attempts || [])
      .map(function (one, at) {
        return at + 1 + "回目" + (one.pass ? "⭕" : "✖") + "：" + plain(one.heard).trim();
      })
      .join(" ／ ");
    return text.slice(0, 1000);
  }

  /** 調べ表の id（先生の 画面の 問いの id と 同じ 形）。 */
  function worksheetCellId(rowId, apiId) {
    return "ws_" + rowId + "_" + apiId;
  }

  function worksheetThoughtId(id) {
    return "ws_" + id;
  }

  /** 「調査結果を コピー」の 文。空欄は「未確認」と 書く。 */
  function worksheetText(worksheet, values) {
    var cells = (values && values.cells) || {};
    var thoughts = (values && values.thoughts) || {};
    var unchecked = plain(worksheet.unchecked || "未確認");
    var out = [];
    (worksheet.rows || []).forEach(function (row, at) {
      out.push(at + 1 + ". " + plain(row.label));
      (worksheet.apis || []).forEach(function (api) {
        var value = String(cells[worksheetCellId(row.id, api.id)] || "").trim();
        out.push("  " + api.name.split("（")[0] + "：" + (value || unchecked));
      });
    });
    out.push("");
    (worksheet.thoughts || []).forEach(function (one) {
      var value = String(thoughts[one.id] || "").trim();
      out.push("・" + plain(one.label) + "：" + (value || "—"));
    });
    return out.join("\n");
  }

  var api = {
    PART_KEYS: PART_KEYS,
    plain: plain,
    judgeSchema: judgeSchema,
    buildJudgePrompt: buildJudgePrompt,
    settle: settle,
    reactionKey: reactionKey,
    countsAsFail: countsAsFail,
    starsForFails: starsForFails,
    supportLevel: supportLevel,
    bonusPoints: bonusPoints,
    maxBonus: maxBonus,
    readsModel: readsModel,
    deskCycle: deskCycle,
    toPosition: toPosition,
    mergePosition: mergePosition,
    openLevelCount: openLevelCount,
    allCleared: allCleared,
    attemptsText: attemptsText,
    worksheetCellId: worksheetCellId,
    worksheetThoughtId: worksheetThoughtId,
    worksheetText: worksheetText,
  };
  root.SOUDAN_LOGIC = api;
})(typeof window !== "undefined" ? window : globalThis);
