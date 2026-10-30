// Perfios-style 15-sheet workbook test — node test4.js  (writes /tmp/yv_test.xlsx)
const E = require('./engine.js'), X = require('./xlsxout.js'), fs = require('fs');
const CW = 5;
function mkPage(lines) { const words = []; lines.forEach((cells, i) => cells.forEach(([x, text, al]) => { let cx = al === 'R' ? x - text.length * CW : x; text.split(' ').forEach(p => { words.push({ t: p, x0: cx, x1: cx + p.length * CW, y: 40 + i * 14, h: 10 }); cx += (p.length + 1) * CW; }); })); return E.groupWords(words, { charW: CW }); }
function money(v) { return Math.abs(v).toFixed(2); }
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
const lines = [[[10, 'AXIS BANK LTD']], [[10, 'Account No : 917020012345678']], [[10, 'Statement From : 01/01/2024 To : 30/06/2024']], [[10, 'Name : RAJESH KUMAR TRADERS']], [],
  [[10, 'Date'], [60, 'Narration'], [300, 'Chq./Ref.No.'], [400, 'Withdrawal Amt.'], [480, 'Deposit Amt.'], [560, 'Closing Balance']]];
let bal = 100000; const tx = [];
for (let m = 1; m <= 6; m++) { const mm = String(m).padStart(2, '0');
  tx.push([`${mm}`, '01', 'NEFT CR-GLOBEX SOLUTIONS PVT LTD-TPT', 'C', 62000]); tx.push([mm, '03', 'ACH D- TATA CAPITAL FIN SERV 9988', 'D', 14500]);
  tx.push([mm, '08', 'UPI-SWIGGY-swiggy@icici-ICIC0000001-1234', 'D', 800]); tx.push([mm, '15', 'ATM WDL SBI ATM 112233', 'D', 10000]);
  tx.push([mm, '20', 'TRANSFER TO OWN A/C RAJESH KUMAR TRADERS', 'D', 20000]); tx.push([mm, '21', 'TRANSFER FROM OWN A/C RAJESH KUMAR TRADERS', 'C', 20000]);
  tx.push([mm, '25', 'NEFT DR-HDFC0001234-RAHUL TRADERS-INV', 'D', 20000]); tx.push([mm, '27', 'IMPS-RAHUL TRADERS-REFUND-P2A', 'C', 12000]); }
tx.splice(10, 0, ['02', '10', 'CHQ RETURN INWARD INSUFFICIENT FUND', 'D', 1000]);
tx.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
tx.forEach(([m, d, text, side, amt]) => { bal = side === 'C' ? bal + amt : bal - amt; lines.push([[10, `${d}/${m}/24`], [60, text], [300, 'R' + Math.floor(Math.random() * 1e6)], side === 'D' ? [460, money(amt), 'R'] : [540, money(amt), 'R'], [640, money(bal), 'R']]); });
const s = E.parseDocument([mkPage(lines)], { fileName: 'axis.pdf' });
const rep = E.buildReport(s, { limit: 500000 });
const wb = rep.workbook;
const want = ['Summary', 'Ratios', 'Daily Balances', 'Own Transfers', 'Bounces & Penalties', 'Top Credits', 'Top Debits', 'Recurring Credits', 'Recurring Debits', 'All Transactions', 'Loans & EMIs', 'Files Used', 'Fraud Checks', 'Flagged Transactions'];
console.log(wb.map(x => x.name).join(' | '));
ok(JSON.stringify(wb.slice(0, 14).map(x => x.name)) === JSON.stringify(want), '14 requested sheet names/order first (' + wb.length + ' sheets incl. extras)');
ok(['Insights', 'Parties', 'File Checks'].every((n, i) => wb[14 + i] && wb[14 + i].name === n), 'extra sheets after the standard 14');
ok(wb.every(x => x.name.length <= 31), 'names ≤ 31 chars');
const an = wb[0].rows; const txt = r => r.map(c => c && c.v !== undefined ? c.v : c);
ok(an[0][0].v === 'Summary Info' && an[1][0].v === 'Name of the Entity/Individual', 'Analysis starts with Summary Info block');
ok(txt(an[19])[0] === "Item" && an[19][1].v > an[19][2].v && an[19][1].z === 'mmm-yy', 'Monthwise header: real dates, latest month first (' + txt(an[19]).slice(0, 3) + ')');
ok(an[20][8] && an[20][8].f && /^AVERAGE\(B21:G21\)$/.test(an[20][8].f) || an.slice(20, 55).some(r => r[r.length - 2] && /^AVERAGE\(/.test(r[r.length - 2].f || '')), 'AVERAGE / TOTAL are live formulas');
ok(an.some(r => r[0] && r[0].v === 'Business Credits' && r[1].f && /^B\d+-B\d+-B\d+$/.test(r[1].f)), 'Business Credits = credits - investment income - loan credits formula');
const row = n => an.find(r => r[0] && r[0].v === n);
ok(txt(row('Debit Count for the month')).slice(1, 3).every(v => typeof v === 'number'), 'debit count numeric');
ok(row('Sanction Limit')[1].v === 500000, 'sanction limit from option');
ok(txt(row('Inward Bounces for the month'))[5] === 1, 'Feb inward bounce counted (' + txt(row('Inward Bounces for the month')) + ')');
ok(txt(row('Total Amount of EMI or loan payments'))[1] === 14500, 'EMI amount');
ok(txt(row('Self/sister company (Cr\'s)'))[1] === 20000, 'self credits ' + txt(row('Self/sister company (Cr\'s)'))[1]);
ok(txt(row('Total Debit amount for the month')).length === 9, 'months+avg+total columns');
ok(wb[3].rows.length > 2 && wb[3].rows[0][4].v === 'Amount', 'self transfer sheet: flat 7-column table');
ok(wb[4].rows.some(r => r.some(c => c && c.v === 'Inward bounce')), 'bounce row listed');
// write + validate
const bytes = X.build(wb.map(sh => ({ name: sh.name, rows: sh.rows, widths: sh.widths, merges: sh.merges, freeze: sh.freeze, filter: sh.filter, grid: sh.grid, tab: sh.tab })));
fs.writeFileSync('/tmp/yv_test.xlsx', Buffer.from(bytes));
console.log('xlsx bytes', bytes.length);
console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL PASSED');
