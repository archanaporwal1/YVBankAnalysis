// v2.2 additions — node test10.js
const E = require('./engine.js');
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
const run = (m, n) => E.parseDocument([E.rowsFromMatrix(m.map(r => r.map(x => x == null ? '' : String(x))))], { fileName: n || 'x.xlsx', allowInt: true });
// 1. overdraft statement whose balances are printed WITHOUT a minus sign (credits lower the figure, debits raise it)
const od = run([['Date', 'Narration', 'Debit', 'Credit', 'Balance'], ['01-04-2024', 'NEFT CR CUSTOMER', '', '30000.00', '470000.00'], ['03-04-2024', 'RTGS SUPPLIER', '100000.00', '', '570000.00'], ['05-04-2024', 'UPI CR', '', '20000.00', '550000.00'], ['08-04-2024', 'CHQ PAID', '50000.00', '', '600000.00'], ['10-04-2024', 'NEFT CR', '', '200000.00', '400000.00']]);
ok(od.chainRatio === 1 && od.txns.length === 5, 'unsigned debit balances: all rows reconcile (' + od.chainRatio + ')');
ok(od.txns[0].credit === 30000 && od.txns[1].debit === 100000, 'directions kept as printed (not swapped)');
ok(od.txns[4].balance === -400000, 'balance read as overdrawn (' + od.txns[4].balance + ')');
ok(od.warnings.some(w => /without a minus sign/.test(w)), 'warning explains the reading');
// 2. ordinary statements are untouched by that rule
const nm = run([['Date', 'Narration', 'Debit', 'Credit', 'Balance'], ['01-04-2024', 'OPENING BALANCE', '', '', '100000.00'], ['02-04-2024', 'UPI A', '500.00', '', '99500.00'], ['03-04-2024', 'NEFT B', '', '25000.00', '124500.00'], ['04-04-2024', 'ATM', '4500.00', '', '120000.00']]);
ok(nm.txns.every(t => t.balance > 0) && !nm.warnings.some(w => /without a minus sign/.test(w)), 'normal statement keeps positive balances');
// 3. bank by footer / file name, account number from file name
const fn = E.parseDocument([E.rowsFromMatrix([['Date', 'Narration', 'Debit', 'Credit', 'Balance'], ['01-04-2024', 'A', '500.00', '', '99500.00'], ['02-04-2024', 'B', '', '1000.00', '100500.00'], ['03-04-2024', 'C', '200.00', '', '100300.00'], ['04-04-2024', 'generated through bob World mobile app', '', '', '']])], { fileName: 'Account_Statement_for_XXXXXXXXXX0340.xlsx', allowInt: true });
ok(fn.meta.accountNo === 'XXXXXXXXXX0340', 'account number taken from the file name when the pages have none (' + fn.meta.accountNo + ')');
console.log(fail ? fail + ' FAILURES' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
