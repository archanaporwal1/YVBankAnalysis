// Header-wording / layout variety test — node test8.js
const E = require('./engine.js');
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
const run = (m, n) => E.parseDocument([E.rowsFromMatrix(m.map(r => r.map(x => x == null ? '' : String(x))))], { fileName: n || 'x.xlsx', allowInt: true });
const body2 = [['01-04-2024', 'UPI/ZOMATO/1234', 500, '', 99500], ['03-04-2024', 'NEFT/CLIENT SALARY', '', 25000, 124500], ['05-04-2024', 'ATM WDL 22', 4500, '', 120000], ['09-04-2024', 'ACH D BAJAJ FINANCE EMI', 15500, '', 104500]];
const variants = {
  'Debit / Credit': ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
  'Withdrawal / Deposit': ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
  'Withdrawals / Deposits': ['Txn Date', 'Transaction Details', 'Withdrawals', 'Deposits', 'Closing Balance'],
  'Debits / Credits': ['Tran Date', 'Remarks', 'Debits', 'Credits', 'Bal.'],
  'Dr Amount / Cr Amount': ['Transaction Date', 'Description', 'Dr Amount', 'Cr Amount', 'Running Balance'],
  'Withdrawal Amt / Deposit Amt': ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
  'Amount(Dr) / Amount(Cr)': ['Post Date', 'Details', 'Amount (Dr)', 'Amount (Cr)', 'Balance (INR)'],
  'Paid out / Paid in': ['Date', 'Description', 'Paid Out', 'Paid In', 'Balance'],
  'Money Out / Money In': ['Date', 'Description', 'Money Out', 'Money In', 'Balance'],
  'Payments / Receipts': ['Date', 'Narration', 'Payments', 'Receipts', 'Balance'],
  'Withdrawal (Dr) / Deposit (Cr)': ['Date', 'Narration', 'Withdrawal (Dr)', 'Deposit (Cr)', 'Balance'],
};
Object.keys(variants).forEach(k => {
  const r = run([['Account Statement'], ['Account No', '12345678901'], [], variants[k]].concat([['', 'OPENING BALANCE', '', '', 100000]].concat(body2).map((x, i) => i === 0 ? [x[0] || '01-04-2024', x[1], '', '', x[4]] : x)));
  ok(r.txns.length === 4 && r.chainRatio === 1, k + ': 4 rows, chain 100% (' + r.txns.length + ', ' + r.chainRatio + ')');
  ok(r.txns[1] && r.txns[1].credit === 25000 && r.txns[0].debit === 500, k + ': debit/credit sides correct');
});
// signed amount with no balance column
const s1 = run([['Date', 'Narration', 'Amount'], ['01/04/2024', 'UPI ZOMATO', '-500.00'], ['02/04/2024', 'NEFT SALARY', '25000.00'], ['03/04/2024', 'ATM CASH', '-4500.00']]);
ok(s1.txns.length === 3 && s1.txns[0].debit === 500 && s1.txns[1].credit === 25000, 'Signed amount, no balance: sides from sign');
// Amount + Cr/Dr suffix
const s2 = run([['Date', 'Particulars', 'Amount', 'Balance'], ['01-Apr-2024', 'OPENING', '', '100000.00 Cr'], ['02-Apr-2024', 'UPI ZOMATO', '500.00 Dr', '99500.00 Cr'], ['03-Apr-2024', 'NEFT SALARY', '25000.00 Cr', '124500.00 Cr']]);
ok(s2.txns.length === 2 && s2.chainRatio === 1 && s2.txns[0].debit === 500, 'Amount with Dr/Cr suffix: 2 rows, chain 100%');
// date formats
['dd.mm.yyyy', 'dd/mm/yy', 'yyyy-mm-dd', 'dd Mon yyyy', 'dd-MMM-yy'].forEach(f => {
  const fm = { 'dd.mm.yyyy': ['05.04.2024', '09.04.2024'], 'dd/mm/yy': ['05/04/24', '09/04/24'], 'yyyy-mm-dd': ['2024-04-05', '2024-04-09'], 'dd Mon yyyy': ['05 Apr 2024', '09 Apr 2024'], 'dd-MMM-yy': ['05-Apr-24', '09-Apr-24'] }[f];
  const r = run([['Date', 'Narration', 'Debit', 'Credit', 'Balance'], [fm[0], 'UPI A', '500', '', '99500'], [fm[1], 'NEFT B', '', '1000', '100500']]);
  ok(r.txns.length === 2 && r.txns[0].date === '2024-04-05' && r.txns[1].date === '2024-04-09', 'Date format ' + f + ' -> ISO');
});

// bank recognition (name in the header, or only the IFSC)
[['Jana Small Finance Bank', 'JSFB0000123'], ['Telangana Grameena Bank', 'TGBL0000123'], ['Cosmos Co-operative Bank Ltd', 'COSB0000123'], ['Dhanlaxmi Bank', 'DLXB0000123'], ['Kerala Gramin Bank', 'KLGB0000123'], ['India Post Payments Bank', 'IPOS0000001']].forEach(([nm, ifsc]) => {
  const rows = [['Statement of Account'], ['Bank', nm], ['Account No', '12345678901'], [], ['Date', 'Narration', 'Debit', 'Credit', 'Balance'], ['01-04-2024', 'UPI A', '500', '', '99500'], ['02-04-2024', 'NEFT B', '', '1000', '100500'], ['03-04-2024', 'ATM', '200', '', '100300']];
  const r = run(rows); ok(new RegExp(nm.split(' ')[0], 'i').test(r.meta.bank || ''), 'bank by name: ' + nm + ' -> ' + r.meta.bank);
  const r2 = run([['IFSC', ifsc]].concat(rows.slice(2))); ok(!!r2.meta.bank && new RegExp(nm.split(' ')[0], 'i').test(r2.meta.bank), 'bank by IFSC ' + ifsc + ' -> ' + r2.meta.bank);
});
console.log(fail ? fail + ' FAILURES' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
