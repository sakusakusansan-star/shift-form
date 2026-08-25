// 実行: node gas/patch.test.js  （Node単体で動く。GASへのデプロイ前確認用）
// 実シート「Siegシフト表」と同じ構造のモックでGASパッチを検証する
const fs = require('fs');

function makeShiftSheet(name, year, month, days, staff) {
  const cols = 2 + days;
  const g = [];
  const row = () => new Array(cols).fill('');
  let r0 = row(); r0[0] = String(year); r0[1] = month + '月'; g.push(r0);
  let r1 = row(); r1[1] = '曜日'; g.push(r1);
  let r2 = row(); r2[1] = '日付';
  for (let d = 1; d <= days; d++) r2[d + 1] = d;
  g.push(r2);
  const fixed = ['福岡','清田','福山','古川'];
  fixed.forEach(n => { let a = row(); a[0] = n; g.push(a);
    ['取引先','キャリア／店舗','開催場所','ホテル'].forEach(l => { let x = row(); x[1] = l; g.push(x); }); });
  let m = row(); m[0] = '▼ 取引先担当者（フォーム入力）'; g.push(m);
  staff.forEach(n => { let a = row(); a[0] = n; g.push(a);
    ['取引先','キャリア／店舗','開催場所','ホテル'].forEach(l => { let x = row(); x[1] = l; g.push(x); }); });
  return { name, grid: g };
}

function Sheet(def) {
  const g = def.grid;
  return {
    getName: () => def.name,
    getLastRow: () => g.length,
    getLastColumn: () => g[0].length,
    appendRow: (vals) => g.push(vals),
    _grid: g,
    getRange: (r, c, nr, nc) => ({
      getValue: () => (g[r-1] && g[r-1][c-1] !== undefined) ? g[r-1][c-1] : '',
      getValues: () => {
        const rows = [];
        for (let i = 0; i < (nr || 1); i++) {
          const line = [];
          for (let j = 0; j < (nc || 1); j++) line.push(g[r-1+i] ? (g[r-1+i][c-1+j] ?? '') : '');
          rows.push(line);
        }
        return rows;
      },
      setValues: (vals) => {
        for (let i = 0; i < vals.length; i++)
          for (let j = 0; j < vals[i].length; j++) g[r-1+i][c-1+j] = vals[i][j];
      }
    })
  };
}

const sep = makeShiftSheet('シフト表　9月', 2026, 9, 30, ['山口','鈴木','毛利']);
const jul = makeShiftSheet('2026-07（保存）', 2026, 7, 31, ['山口','鈴木','毛利']);
const log = { name: '送信ログ', grid: [['日時','操作','名前','年','月','開始日','終了日','取引先','キャリア','開催場所','ホテル']] };
const sheets = [sep, jul, log].map(Sheet);

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheets: () => sheets,
    getSheetByName: (n) => sheets.find(s => s.getName() === n) || null
  })
};

eval(fs.readFileSync('/home/user/shift-form/gas/patch.gs', 'utf8'));

// ── 検証ヘルパー ───────────────────────────────────────────
let fail = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) fail++;
}
// 山口の取引先行を日ごとに読む（山口=行25 → 取引先=26）
function torihikiRow(sheetDef, staffName) {
  const g = sheetDef.grid;
  const r = g.findIndex(row => String(row[0]).trim() === staffName);
  return g[r + 1];
}
function daysWith(sheetDef, staffName) {
  const row = torihikiRow(sheetDef, staffName);
  const out = [];
  for (let c = 2; c < row.length; c++) if (row[c]) out.push({ day: c - 1, v: row[c] });
  return out;
}

// ── 1. 新規送信 ────────────────────────────────────────────
submitShift({ data: { name:'山口', year:2026, month:9, startDay:3, endDay:5,
  torihiki:'サンコミ', carrier:'au', place:'春日', hotel:'' } });
check('新規: 9/3-9/5 に書き込まれる',
  JSON.stringify(daysWith(sep,'山口').map(x=>x.day)) === '[3,4,5]', daysWith(sep,'山口'));
check('新規: 開催場所も入る',
  sep.grid[sep.grid.findIndex(r=>String(r[0]).trim()==='山口')+3][4] === '春日');

// ── 2. 修正（日付変更）: 元の期間が消えること ──────────────
submitShift({
  data: { name:'山口', year:2026, month:9, startDay:20, endDay:22,
    torihiki:'サンコミ', carrier:'au', place:'東合川', hotel:'ABCホテル' },
  original: { name:'山口', year:2026, month:9, startDay:3, endDay:5, torihiki:'サンコミ' }
});
check('修正: 古い 9/3-9/5 が消える',
  JSON.stringify(daysWith(sep,'山口').map(x=>x.day)) === '[20,21,22]', daysWith(sep,'山口'));
check('修正: ホテルも書き込まれる',
  sep.grid[sep.grid.findIndex(r=>String(r[0]).trim()==='山口')+4][21] === 'ABCホテル');

// ── 3. original 無しの修正だと二重になる（旧挙動の再現）────
submitShift({ data: { name:'鈴木', year:2026, month:9, startDay:1, endDay:2,
  torihiki:'ダル', carrier:'docomo', place:'X', hotel:'' } });
submitShift({ data: { name:'鈴木', year:2026, month:9, startDay:10, endDay:11,
  torihiki:'ダル', carrier:'docomo', place:'X', hotel:'' } });
check('旧挙動の確認: original 無しでは古い期間が残る（＝これが直したかったバグ）',
  JSON.stringify(daysWith(sep,'鈴木').map(x=>x.day)) === '[1,2,10,11]', daysWith(sep,'鈴木'));

// ── 4. 削除: 年月で正しいシートを選ぶ ──────────────────────
submitShift({ data: { name:'毛利', year:2026, month:7, startDay:20, endDay:22,
  torihiki:'ハイコム', carrier:'SoftBank', place:'下通', hotel:'' } });
submitShift({ data: { name:'毛利', year:2026, month:9, startDay:20, endDay:22,
  torihiki:'ハイコム', carrier:'SoftBank', place:'下通', hotel:'' } });
deleteShift({ name:'毛利', year:2026, month:7, startDay:20, endDay:22, torihiki:'ハイコム' });
check('削除: 指定した7月シートだけが消える',
  daysWith(jul,'毛利').length === 0, daysWith(jul,'毛利'));
check('削除: 同じ日程の9月シートは残る（誤爆しない）',
  JSON.stringify(daysWith(sep,'毛利').map(x=>x.day)) === '[20,21,22]', daysWith(sep,'毛利'));

// ── 5. 取引先が違う場合は消さない ──────────────────────────
let threw = null;
try { deleteShift({ name:'毛利', year:2026, month:9, startDay:20, endDay:22, torihiki:'ダル' }); }
catch (e) { threw = e.message; }
check('削除: 取引先が一致しないと拒否される', threw !== null, threw);
check('削除: 拒否時にデータは消えていない',
  JSON.stringify(daysWith(sep,'毛利').map(x=>x.day)) === '[20,21,22]');

// ── 6. 年月なしの削除は拒否 ────────────────────────────────
threw = null;
try { deleteShift({ name:'毛利', startDay:20, endDay:22 }); } catch (e) { threw = e.message; }
check('削除: 年月なしは拒否される（古いフォーム対策）', threw !== null, threw);

// ── 7. 存在しない名前 ──────────────────────────────────────
threw = null;
try { submitShift({ data:{ name:'藤本', year:2026, month:9, startDay:1, endDay:1,
  torihiki:'ハイコム', carrier:'SoftBank', place:'下通', hotel:'' } }); } catch (e) { threw = e.message; }
check('シートに居ない名前は拒否される', threw !== null, threw);

// ── 8. ログ ────────────────────────────────────────────────
const logRows = log.grid.slice(1);
check('送信ログが記録される', logRows.length > 0 && logRows.some(r => r[1] === '修正'),
  logRows.map(r => r[1]));

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
