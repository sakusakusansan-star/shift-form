# 【指示】Googleスプレッドシート「Siegシフト表」のApps Scriptを修正する

あなたはブラウザを操作できるエージェントです。以下の作業を順番に実行してください。
**「絶対に守ること」を必ず先に読んでから着手してください。**

---

## 絶対に守ること

1. **既存のデプロイURLを変えないこと。**
   このスクリプトはWebアプリとして公開されており、そのURLが別のWebページに
   ハードコードされています。URLが変わるとシフト入力フォームが動かなくなります。
   - 「**デプロイを管理**」から**既存のデプロイを編集**して「新バージョン」を出すこと
   - 「**新しいデプロイ**」を作ってはいけない（URLが変わります）

2. **作業前に既存コードを全文コピーして保管すること。**
   何かあったときに戻せるようにするためです。コピーした全文は最後の報告に含めてください。

3. **指示にない箇所を書き換えないこと。**
   差し替えるのは `submitShift` と `deleteShift` の2つの関数、および集計用の
   スタッフ名リストだけです。他の関数（doPost、getMyShifts、getMonthInfo、
   集計処理そのもの等）はそのまま残してください。

4. **判断に迷ったら止まって報告すること。**
   想定と違う構造だった場合、勝手に解釈して進めず、画面の内容を報告して指示を仰いでください。

---

## 対象

スプレッドシート:
https://docs.google.com/spreadsheets/d/1wRBlTC_U2Mek5xj1YDFUEuAdRRlcVGZGIy_3WmmJLsQ/edit

このスプレッドシートのメニュー **「拡張機能」→「Apps Script」** で開くスクリプトが対象です。

---

## 直したいこと（背景）

**① 修正が二重登録になる**
フォームの「修正」で日付を変えると、新しい日付の列に書き込まれるだけで、
元の日付の列が残ったままになります。結果、1件の予定が2件分として残ります。

**② 削除が別の月を巻き込む恐れがある**
削除リクエストに年・月が入っていなかったため、どの月のシートを消すか確定できません。
このスプレッドシートには「シフト表　9月」と「2026-07（保存）」のように
複数月のシートが同居しているため危険です。

**③ 集計に藤本が残っている**
9月のシフト表からは藤本の行が消えているのに、集計レポートには
「藤本 0日 0%」が出続けています。集計処理の中にスタッフ名のリストが
ハードコードされていて、そこに藤本が残っているためです。

なお、Web側（フォームのHTML）はすでに修正・公開済みで、
`original`（修正前レコードのキー）と、削除時の年・月・取引先を送るようになっています。
**今回はそれを受け取るサーバ側の対応です。**

---

## シート構造（確認用）

スクリプトを読むときの参考にしてください。1レコード＝1行ではなく、
**スタッフごとに5行 × 日付が列** のグリッドです。

```
row1   A=2026        B=9月        C=2026年9月 シフト表
row3   B=日付        C列以降に 1, 2, 3 … 30 が並ぶ
row25  A=山口                      ← スタッフ名（A列）
row26    B=取引先                  ← 日付の列に値が入る
row27    B=キャリア／店舗
row28    B=開催場所
row29    B=ホテル
row30  A=鈴木  …（以下同じ並びが続く）
```

---

## 手順

### 手順1. スクリプトを開く

1. 上のスプレッドシートURLを開く
2. メニュー「拡張機能」→「Apps Script」をクリック
3. 開いたスクリプトエディタで、**すべてのファイルの全コードをコピーして保管する**
   （複数ファイルある場合は全ファイル分）

### 手順2. 呼び出し方を確認する（重要）

`doPost` などのリクエスト受け口を読み、`submitShift` と `deleteShift` が
**どう呼ばれているか**を確認してください。

差し替え後の関数は、**リクエストのbody全体**を引数に取ります。

```js
// 期待する呼び方
submitShift(body)   // body = { action:'submitShift', data:{...}, original:{...} }
deleteShift(body)   // body = { action:'deleteShift', name, year, month, startDay, endDay, torihiki }
```

もし既存が `submitShift(body.data)` のように**一部だけ渡している**場合は、
**呼び出し側を `submitShift(body)` に直してください**。ここを間違えると動きません。

### 手順3. 関数を差し替える

既存の `submitShift` と `deleteShift` を削除し、
**下の「差し替えコード」を丸ごと貼り付けてください。**
ヘルパー関数（`getMonthSheet_` など末尾が `_` のもの）も一緒に貼ります。

すでに同名のヘルパーが存在する場合は、名前が衝突するのでその旨を報告して止まってください。

### 手順4. 集計から藤本を消す

集計処理の中にスタッフ名の配列（例: `['福岡','清田','福山','古川','山口','鈴木','毛利','藤本']`）が
あるはずです。**そこから `'藤本'` だけを削除**してください。

- 変数名は `STAFF` `STAFF_NAMES` `names` など、実際のコードによって異なります
- 配列が見つからない場合、または複数箇所にある場合は、
  **該当箇所のコードを報告して止まってください**（勝手に判断しない）

### 手順5. 保存する

エディタ上部の保存アイコン、または Ctrl+S で保存します。

### 手順6. デプロイする（URLを変えないこと）

1. 右上の「**デプロイ**」→「**デプロイを管理**」をクリック
2. 一覧にある**既存のデプロイ**の右上の**鉛筆アイコン（編集）**をクリック
3. 「バージョン」のプルダウンを「**新バージョン**」に変更
4. 「**デプロイ**」をクリック
5. 表示された**ウェブアプリのURL**を控える

**確認:** 控えたURLが以下と一致していることを確認してください。
一致していなければ新規デプロイを作ってしまっています。報告して止まってください。

```
https://script.google.com/macros/s/AKfycbwx4-wjr4Qmx6zeXDXZhht-65W7veveJvaXXmC9V5MQLipOLxLoWfz-XEUBau8NZ58h/exec
```

### 手順7. 動作確認

https://sakusakusansan-star.github.io/shift-form/ を開き、以下を確認してください。
**テストで作ったデータは必ず削除して元の状態に戻すこと。**

1. 名前が「山口・鈴木・毛利」の3つだけ表示される（藤本が無い）
2. 適当に1件送信 → スプレッドシートの該当日付の列に値が入る
3. 「確認・修正」タブ → その予定の「修正」→ **日付を別の日に変えて**送信
   → **元の日付の列が空になり、新しい日付の列にだけ値が入る**（これが①の修正点）
4. 「確認・修正」タブ →「削除」→ 該当の列が空になる
5. 他の月のシート、他のスタッフの行が変化していないこと

### 手順8. 報告する

以下を必ず報告してください。

- 手順1で保管した**既存コードの全文**
- 手順2で確認した `submitShift` / `deleteShift` の**元の呼ばれ方**、および直したかどうか
- 手順4で見つけた**スタッフ名の配列**（変数名とコードの該当部分、修正前と修正後）
- 手順6で控えた**デプロイURL**（上のURLと一致したか）
- 手順7の**各項目の結果**（特に3番の挙動）
- エラーが出た場合は**エラーメッセージの全文**

---

## 差し替えコード

以下を丸ごと貼り付けてください。

```javascript
var LOG_SHEET_NAME = '送信ログ';
var FIELD_LABELS = ['取引先', 'キャリア／店舗', '開催場所', 'ホテル'];

// 対象の月シートを取得する。
// シート名ではなく A1(年)/B1(月) で判別する（「（保存）」付きのアーカイブが混在するため）。
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

// 日 → 列番号。3行目（日付行）を走査して決める。
function getDayCol_(sheet, day) {
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(3, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < header.length; c++) {
    if (Number(header[c]) === Number(day)) return c + 1;
  }
  return -1;
}

// 名前 → スタッフブロックの先頭行。直下4行のラベル並びも確認する。
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

// 指定期間のセルを書き込む。values に null を渡すとクリアする。
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

// 期間内に入っている取引先を読む（削除・修正時の照合用）。
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
 * body.data     … 書き込む内容
 * body.original … 修正モードのとき、書き換え前のレコードのキー
 * original がある場合は「先に元の期間を消してから新しい期間を書く」。
 * これをやらないと日付を変更した修正で古い期間が残り二重計上になる。
 */
function submitShift(body) {
  var d = body.data;
  var sheet = getMonthSheet_(d.year, d.month);
  if (!sheet) throw new Error(d.year + '年' + d.month + '月のシートが見つかりません');

  var staffRow = findStaffRow_(sheet, d.name);
  if (staffRow < 0) throw new Error(d.name + ' の行がシート上に見つかりません');

  var org = body.original;
  if (org && org.name) {
    var orgSheet = getMonthSheet_(org.year, org.month);
    if (orgSheet) {
      var orgRow = findStaffRow_(orgSheet, org.name);
      if (orgRow >= 0) {
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

  writeRange_(sheet, staffRow, d.startDay, d.endDay, [
    d.torihiki, d.carrier, d.place, d.hotel || ''
  ]);

  appendLog_(org ? '修正' : '送信', d);
  return { ok: true };
}

/**
 * 削除
 * 年・月でシートを特定し、取引先が一致する場合だけ消す。
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
```
