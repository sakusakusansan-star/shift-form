# 【指示】Googleスプレッドシート「Siegシフト表」のApps Scriptを修正する（第2弾）

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
   変更するのは次の3か所だけです。
   - 関数 `getShiftSheet_`（丸ごと差し替え）
   - 関数 `submitShift` と `deleteShift` の中の `updateSummary();` という1行（各1か所）
   - 関数 `doGet`（丸ごと差し替え）

   `Form.html` ファイルは**削除しないでください**（戻すときに使います）。

4. **判断に迷ったら止まって報告すること。**
   想定と違うコードだった場合、勝手に解釈して進めず、画面の内容を報告して指示を仰いでください。

---

## 対象

スプレッドシート:
https://docs.google.com/spreadsheets/d/1wRBlTC_U2Mek5xj1YDFUEuAdRRlcVGZGIy_3WmmJLsQ/edit

このスプレッドシートのメニュー **「拡張機能」→「Apps Script」** で開くスクリプトが対象です。

---

## 直したいこと（背景）

**A. 月を切り替えたあと、シフト表を取り違える恐れがある**
メニューの「翌月へ切り替え」を実行すると、シフト表のタブ名が「シフト表 10月」のように変わります。
すると `getShiftSheet_` は「シフト表」という名前のタブを見つけられず、
**名前に「シフト」を含む最初のタブ**を使います。
「2026年8月シフト表」のような過去のタブが先に並んでいると、そちらを読んでしまいます。
→ 「シフト表」で**始まる**タブを優先するように直します。

**B. 送信・削除が遅い**
`submitShift` と `deleteShift` は、書き込みのたびに集計シートをグラフごと作り直しています（数秒かかる）。
フォームは15秒で通信を打ち切るので、遅いと「タイムアウト」と出たのに実際は書き込まれている、
ということが起こり得ます。
→ 集計は、すでにある `requestSummaryUpdate_()`（約30秒後にまとめて1回だけ集計する仕組み）に任せます。
  **集計シートへの反映が最大1分ほど遅れるようになります**が、送信はすぐ終わります。

**C. 古い入力フォームが残っている**
WebアプリのURLをブラウザで直接開くと、`Form.html`（古いフォーム）が表示されます。
古いフォームは削除時に年・月を送らないので、削除しようとするとエラーになります。
→ URLを開いたら、新しいフォーム（GitHub Pages）へ案内するページを出すようにします。

---

## 手順

### 手順1. スクリプトを開いてバックアップする

1. 上のスプレッドシートURLを開く
2. **シフト表のタブ名を控える**（例: 「シフト表 10月」）。他のタブ名もすべて控える
3. メニュー「拡張機能」→「Apps Script」をクリック
4. 開いたスクリプトエディタで、**すべてのファイルの全コードをコピーして保管する**
   （複数ファイルある場合は全ファイル分）

### 手順2. `getShiftSheet_` を差し替える（A）

既存の `function getShiftSheet_() { ... }` を**関数ごと削除**し、下のコードを貼り付けてください。

```javascript
function getShiftSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("スプレッドシートに接続できません。");

  var sheet = ss.getSheetByName(SHIFT_SHEET_NAME);
  if (sheet) return sheet;

  var sheets = ss.getSheets();
  // 月の切り替えで「シフト表 10月」のように名前が変わるので、
  // 「シフト表」で始まり、アーカイブ（保存）ではないタブを優先する。
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName().trim();
    if (name.indexOf(SHIFT_SHEET_NAME) === 0 && name.indexOf("保存") === -1) return sheets[i];
  }
  for (var j = 0; j < sheets.length; j++) {
    if (sheets[j].getName().indexOf("シフト") !== -1) return sheets[j];
  }
  var names = sheets.map(function(s) { return '「' + s.getName() + '」'; }).join('、');
  throw new Error('シート「' + SHIFT_SHEET_NAME + '」が見つかりません。現在のタブ: ' + names);
}
```

### 手順3. 送信・削除の集計を後回しにする（B）

1. 先に、関数 `requestSummaryUpdate_` と `runPendingSummary_` が**存在すること**を確認してください。
   どちらかが無ければ、この手順はやらずに報告して止まってください。
2. 関数 `submitShift` の中で、`return { ok: true };` の直前にある

   ```javascript
   updateSummary();
   ```

   を、次の1行に置き換えてください。

   ```javascript
   requestSummaryUpdate_();
   ```

3. 関数 `deleteShift` の中の同じ `updateSummary();`（`return { ok: true };` の直前）も、同様に置き換えてください。

**他の場所にある `updateSummary` は変更しないでください**（メニューや月切り替えで使っています）。

### 手順4. `doGet` を差し替える（C）

既存の `function doGet() { ... }` を**関数ごと削除**し、下のコードを貼り付けてください。

```javascript
// 古いフォーム（Form.html）は使わず、新しいフォームへ案内する。
// ?staff=山口 のようなパラメータは、スタッフ名のリストにある場合だけ引き継ぐ。
function doGet(e) {
  var url = 'https://sakusakusansan-star.github.io/shift-form/';
  var staff = e && e.parameter && e.parameter.staff;
  if (staff && ALL_STAFF.indexOf(staff) !== -1) url += '?staff=' + encodeURIComponent(staff);
  var html =
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<div style="font-family:sans-serif;text-align:center;padding:48px 16px;color:#26323D;">' +
    '<p style="font-size:16px;font-weight:bold;">シフト入力フォームは新しいページに移りました</p>' +
    '<p style="margin-top:24px;"><a href="' + url + '" target="_top" ' +
    'style="display:inline-block;padding:14px 28px;background:#2D5F8A;color:#fff;' +
    'border-radius:12px;text-decoration:none;font-weight:bold;">新しいフォームを開く</a></p>' +
    '<p style="margin-top:16px;font-size:13px;color:#6B7986;">ブックマークも新しいページに変更してください</p>' +
    '</div>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('シフト入力フォーム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

`Form.html` ファイルは**そのまま残してください**。

### 手順5. 保存する

エディタ上部の保存アイコン、または Ctrl+S で保存します。
保存時にエラー（赤いメッセージ）が出たら、全文を報告して止まってください。

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

**テストで作ったデータは必ず削除して元の状態に戻すこと。**

1. **C の確認:** 上のWebアプリURLをブラウザで開く
   → 「シフト入力フォームは新しいページに移りました」と「新しいフォームを開く」ボタンが出る
   → ボタンを押すと https://sakusakusansan-star.github.io/shift-form/ が開く
2. **A の確認:** https://sakusakusansan-star.github.io/shift-form/ を開く
   → カレンダーの見出し（例: 「2026年10月」）が、シフト表タブの A1（年）・B1（月）と一致する
3. **B の確認:** 名前を選び、適当な**空いている日**で1件送信する
   → 「✅ 送信完了しました！」が出るまでの**おおよその秒数**を控える
   → スプレッドシートの該当日付の列に値が入る
   → **1分ほど待ってから**「集計」シートを開き、その人の稼働日数が増えている
4. 「確認・修正」タブ →「削除」で今のテストデータを消す
   → 該当の列が空になる → 1分ほど待つと「集計」の稼働日数が元に戻る
5. 他の月のタブ、他のスタッフの行が変化していないこと

### 手順8. 報告する

以下を必ず報告してください。

- 手順1で控えた**タブ名の一覧**と、保管した**既存コードの全文**
- 手順3で `requestSummaryUpdate_` / `runPendingSummary_` が存在したか、置き換えた箇所（前後のコード）
- 手順6で控えた**デプロイURL**（上のURLと一致したか）
- 手順7の**各項目の結果**（3番の秒数と、集計が更新されたか）
- エラーが出た場合は**エラーメッセージの全文**

---

## うまくいかなかったときの戻し方

- 集計が1分以上たっても更新されない場合: 手順3で置き換えた2行を `updateSummary();` に戻し、
  手順6と同じ方法（既存デプロイの編集 → 新バージョン）でデプロイし直して報告してください。
- それ以外で動かなくなった場合: 手順1で保管したコードに全ファイルを戻し、同様にデプロイし直して報告してください。
