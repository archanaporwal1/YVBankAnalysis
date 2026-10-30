// v2.1: manual corrections + consolidated view — node test9.js
const E = require('./engine.js');
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
const run = (rows, n) => E.parseDocument([E.rowsFromMatrix(rows.map(r => r.map(x => x == null ? '' : String(x))))], { fileName: n || 'x.xlsx', allowInt: true });
const H = ['Date', 'Narration', 'Debit', 'Credit', 'Balance'];
// 1. a row whose printed column contradicts the running balance: debit shown under Credit (source error)
const a = run([H, ['01-04-2024', 'OPENING BALANCE', '', '', 100000], ['02-04-2024', 'UPI ZOMATO', '', 500, 99500], ['03-04-2024', 'NEFT SALARY', '', 25000, 124500], ['04-04-2024', 'ATM CASH', 4500, '', 120000]]);
const bad = a.txns.filter(t => t.chainOk === false);
ok(bad.length >= 1, 'contradicting row is flagged (' + bad.length + ')');
const cand = E.swapCandidates(a);
ok(cand.length === 1, 'swap candidate found (' + cand.length + ')');
const f = E.applyFixes(a, cand);
ok(f.txns.every(t => t.chainOk !== false), 'after the swap every row reconciles');
ok(f.reconciled === true, 'statement reconciles after the swap');
ok(f.txns.some(t => t.tags.indexOf('MANUAL_FIX') >= 0), 'fixed row is tagged MANUAL_FIX');
ok(f.warnings.some(w => /corrected by hand/.test(w)), 'warning records the manual fix');
ok(Math.abs(f.totalDebits - (500 + 4500)) < 0.01, 'totals recomputed (' + f.totalDebits + ')');
ok(E.applyFixes(a, []) === a, 'no keys → statement untouched');
// 2. consolidated view with a transfer between two accounts
const A = run([H, ['01-04-2024', 'OPENING BALANCE', '', '', 100000], ['05-04-2024', 'NEFT TO SAVINGS', 20000, '', 80000], ['09-04-2024', 'ACH D EMI', 5000, '', 75000]], 'a.xlsx');
const B = run([H, ['01-04-2024', 'OPENING BALANCE', '', '', 10000], ['05-04-2024', 'NEFT FROM CURRENT', '', 20000, 30000], ['20-04-2024', 'UPI SHOP', 1000, '', 29000]], 'b.xlsx');
A.meta.accountNo = '111'; B.meta.accountNo = '222';
const items = [A, B].map(s => ({ stmt: s, report: E.buildReport(s, {}) }));
const c = E.consolidate(items);
ok(c.accounts.length === 2 && c.totals.cr === 20000 && c.totals.dr === 26000, 'combined totals (' + c.totals.cr + ' / ' + c.totals.dr + ')');
ok(c.inter.length === 1 && c.interTotal === 20000, 'transfer between the accounts matched (' + c.inter.length + ')');
ok(c.totals.crExInter === 0 && c.totals.drExInter === 6000, 'totals excluding inter-account transfers');
ok(c.monthly.length === 1 && c.monthly[0].crA === 20000, 'combined monthly row');
ok(c.combinedAbb > 0, 'combined average balance (' + c.combinedAbb + ')');
const sh = E.consolidatedSheets(c);
ok(sh.map(x => x.name).join() === 'All Accounts,Combined Monthly,Transfers Between', 'three sheets for the combined workbook');
console.log(fail ? fail + ' FAILURES' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
