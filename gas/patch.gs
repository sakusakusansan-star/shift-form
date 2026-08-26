/**
 * シフト入力フォーム GASパッチ
 * =====================================================================
 * index.html 側の修正（修正モードで original を送る／削除で年月・取引先を送る）に
 * 対応するためのサーバ側パッチ。
 *
 * 既存プロジェクトの submitShift / deleteShift をこの実装に差し替えて使う。
 * ヘルパーは全てこのファイル内で完結しているので、他の関数に依存しない。
 *
 * ── 前提としているシート構造（実データから確認） ─────────────────
 *   row1  A=年(2026)  B=月(9月)  C=タイトル
 *   row3  B=日付      C以降に 1,2,3... の日が並ぶ
 *   スタッフ block（1人5行）:
 *     r+0  A=名前（例: 山口）
 *     r+1  B=取引先
 *     r+2  B=キャリア／店舗
 *     r+3  B=開催場所
 *     r+4  B=ホテル
 *   月シートの判別は「シート名」ではなく A1(年)/B1(月) で行う。
 *   （「シフト表　9月」と「2026-07（保存）」が混在しているため）
 * =====================================================================
 */

var LOG_SHEET_NAME = '送信ログ';
var FIELD_LABELS = ['取引先', 'キャリア／店舗', '開催場所', 'ホテル'];

// ── 対象の月シートを取得する ─────────────────────────────────
// 年月が一致するシートを返す。見つからなければ null。
// 「（保存）」付きのアーカイブより通常シートを優先する。
function getMonthSheet_(year, month) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var archived = null;
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var a1 = String(sh.getRange(1, 1).getValue()).trim();
    var b1 = String(sh.getRange(1, 2).getValue()).trim();
    if (a1 !== String(year)) continue;
    if (parseInt(b1, 10) !== Number(month)) continue;
    if (sh.getName().indexOf('保存') !== -1) { archived = archived || sh; continue; }
    return sh;
  }
  return archived;
}

// ── 日 → 列番号 ──────────────────────────────────────────────
// 3行目（日付行）を実際に走査して列を決める。列位置がずれても壊れない。
function getDayCol_(sheet, day) {
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(3, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < header.length; c++) {
    if (Number(header[c]) === Number(day)) return c + 1;
  }
  return -1;
}

// ── 名前 → スタッフブロックの先頭行 ──────────────────────────
// A列を走査し、直下4行が想定のラベル並びであることも確認する。
function findStaffRow_(sheet, name) {
  var lastRow = sheet.getLastRow();
  var colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var r = 0; r < colA.length; r++) {
    if (String(colA[r][0]).trim() !== String(name).trim()) continue;
    var row = r + 1;
    if (row + 4 > lastRow) continue;
    var labels = sheet.getRange(row + 1, 2, 4, 1).getValues();
    var ok = true;
    for (var i = 0; i < 4; i++) {
      if (String(labels[i][0]).trim() !== FIELD_LABELS[i]) { ok = false; break; }
    }
    if (ok) return row;
  }
  return -1;
}

// ── 指定期間のセルを書き込む / 消す ──────────────────────────
// values に null を渡すとクリア（削除・修正前の後始末に使う）。
function writeRange_(sheet, staffRow, startDay, endDay, values) {
  var c1 = getDayCol_(sheet, startDay);
  var c2 = getDayCol_(sheet, endDay);
  if (c1 < 0 || c2 < 0) throw new Error('日付がシート上に見つかりません: ' + startDay + '〜' + endDay);
  if (c2 < c1) { var t = c1; c1 = c2; c2 = t; }
  var width = c2 - c1 + 1;

  var rows = [];
  for (var i = 0; i < 4; i++) {
    var line = [];
    for (var j = 0; j < width; j++) line.push(values ? values[i] : '');
    rows.push(line);
  }
  sheet.getRange(staffRow + 1, c1, 4, width).setValues(rows);
}

// ── 期間内に既に入っている取引先を読む（削除時の照合用）──────
function readTorihiki_(sheet, staffRow, startDay, endDay) {
  var c1 = getDayCol_(sheet, startDay);
  var c2 = getDayCol_(sheet, endDay);
  if (c1 < 0 || c2 < 0) return [];
  if (c2 < c1) { var t = c1; c1 = c2; c2 = t; }
  var vals = sheet.getRange(staffRow + 1, c1, 1, c2 - c1 + 1).getValues()[0];
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i]).trim();
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}

// ── 送信ログ ─────────────────────────────────────────────────
function appendLog_(op, d) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET_NAME);
  if (!sh) return;
  sh.appendRow([
    new Date(), op, d.name, d.year, d.month, d.startDay, d.endDay,
    d.torihiki || '', d.carrier || '', d.place || '', d.hotel || ''
  ]);
}

/**
 * 送信（新規／修正）
 * ---------------------------------------------------------------------
 * body.data     … 書き込む内容
 * body.original … 修正モードのとき、書き換え前のレコードのキー
 *                 （name/year/month/startDay/endDay/torihiki）
 *
 * original がある場合は「先に元の期間を消してから新しい期間を書く」。
 * これをやらないと、日付を変更した修正で古い期間が残り二重計上になる。
 */
function submitShift(body) {
  var d = body.data;
  var sheet = getMonthSheet_(d.year, d.month);
  if (!sheet) throw new Error(d.year + '年' + d.month + '月のシートが見つかりません');

  var staffRow = findStaffRow_(sheet, d.name);
  if (staffRow < 0) throw new Error(d.name + ' の行がシート上に見つかりません');

  // ① 修正モード: 元の期間をクリアする
  var org = body.original;
  if (org && org.name) {
    var orgSheet = getMonthSheet_(org.year, org.month);
    if (orgSheet) {
      var orgRow = findStaffRow_(orgSheet, org.name);
      if (orgRow >= 0) {
        // 別の予定を巻き込まないよう、取引先が一致するときだけ消す
        var found = readTorihiki_(orgSheet, orgRow, org.startDay, org.endDay);
        if (!org.torihiki || found.length === 0 || found.indexOf(org.torihiki) !== -1) {
          writeRange_(orgSheet, orgRow, org.startDay, org.endDay, null);
          appendLog_('修正前削除', {
            name: org.name, year: org.year, month: org.month,
            startDay: org.startDay, endDay: org.endDay, torihiki: org.torihiki
          });
        }
      }
    }
  }

  // ② 新しい内容を書き込む
  writeRange_(sheet, staffRow, d.startDay, d.endDay, [
    d.torihiki, d.carrier, d.place, d.hotel || ''
  ]);

  appendLog_(org ? '修正' : '送信', d);
  return { ok: true };
}

/**
 * 削除
 * ---------------------------------------------------------------------
 * 年・月でシートを特定し、取引先が一致する場合だけ消す。
 * 以前は名前と日だけで消していたため、別の月の同じ日程や
 * 同じ日程の別取引先まで巻き込む恐れがあった。
 */
function deleteShift(body) {
  var year  = body.year;
  var month = body.month;
  if (year === undefined || month === undefined) {
    throw new Error('削除には年と月が必要です（古いフォームからのリクエストです）');
  }

  var sheet = getMonthSheet_(year, month);
  if (!sheet) throw new Error(year + '年' + month + '月のシートが見つかりません');

  var staffRow = findStaffRow_(sheet, body.name);
  if (staffRow < 0) throw new Error(body.name + ' の行がシート上に見つかりません');

  if (body.torihiki) {
    var found = readTorihiki_(sheet, staffRow, body.startDay, body.endDay);
    if (found.length > 0 && found.indexOf(body.torihiki) === -1) {
      throw new Error('指定の予定が見つかりません（現在の内容: ' + found.join('・') + '）');
    }
  }

  writeRange_(sheet, staffRow, body.startDay, body.endDay, null);

  appendLog_('削除', {
    name: body.name, year: year, month: month,
    startDay: body.startDay, endDay: body.endDay, torihiki: body.torihiki
  });
  return { ok: true };
}
