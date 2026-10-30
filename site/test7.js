// Spreadsheet / CSV input test — node test7.js  (same path as the page: matrix -> rowsFromMatrix -> parseDocument)
const E = require('./engine.js');
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
function parseCsv(t) { const rows = []; let r = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i];
  if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
  else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; } else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (c !== '\r') f += c; }
  if (f || r.length) { r.push(f); rows.push(r); } return rows; }
const run = (csv, name) => E.parseDocument([E.rowsFromMatrix(parseCsv(csv))], { fileName: name, allowInt: true });
// 1. bank-portal CSV: title rows, separate Withdrawal / Deposit columns, quoted amounts with commas
const csv1 = `Account Statement\nAccount Name:,"RAVI KUMAR"\nAccount No:,50100123456789\nBank:,HDFC BANK\n\nDate,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/04/24,UPI-SWIGGY-swiggy@icici,0000412345,"1,200.00",,"98,800.00"\n02/04/24,NEFT CR-ACME LTD-SALARY,N1234,,"50,000.00","1,48,800.00"\n05/04/24,ATM WDL SBI ATM 1122,R9988,"10,000.00",,"1,38,800.00"\n09/04/24,ACH D- BAJAJ FINANCE EMI,A77,"15,500.00",,"1,23,300.00"\n`;
const a = run(csv1, 'portal.csv');
ok(a.txns.length === 4, 'CSV (separate debit/credit): 4 rows read (' + a.txns.length + ')');
ok(a.chainRatio === 1, 'CSV: running balance verified');
ok(a.txns[1].credit === 50000 && a.txns[0].debit === 1200, 'CSV: quoted amounts with commas parsed');
ok(a.meta.accountNo === '50100123456789', 'CSV: account number found in the title rows (' + a.meta.accountNo + ')');
ok(a.txns[0].date === '2024-04-01', 'CSV: dd/mm/yy date read correctly (' + a.txns[0].date + ')');
// 2. single Amount column with Dr/Cr indicator, dd-mm-yyyy
const csv2 = `Txn Date,Description,Amount,Dr/Cr,Balance\n01-04-2024,OPENING,,,100000.00\n02-04-2024,UPI-ZOMATO,500.00,DR,99500.00\n03-04-2024,NEFT CR-CLIENT,25000.00,CR,124500.00\n04-04-2024,CHQ PAID 000123,4500.00,DR,120000.00\n`;
const b = run(csv2, 'amt.csv');
ok(b.txns.length === 3 && b.chainRatio === 1, 'CSV (amount + Dr/Cr): 3 rows, chain 100% (' + b.txns.length + ', ' + b.chainRatio + ')');
// 3. Excel/ODS-like matrix: numbers are real numbers, dates already text dd-mm-yyyy (as readSheet produces)
const mat = [['STATEMENT OF ACCOUNT'], ['Name', 'ASHA TRADERS'], [], ['Date', 'Particulars', 'Debit', 'Credit', 'Balance'],
  ['01-05-2024', 'CASH DEPOSIT', '', 20000, 120000], ['03-05-2024', 'RTGS DR SUPPLIER', 50000, '', 70000], ['07-05-2024', 'NEFT CR CUSTOMER', '', 30000, 100000]];
const c = E.parseDocument([E.rowsFromMatrix(mat.map(r => r.map(x => x === '' ? '' : String(x))))], { fileName: 'x.ods', allowInt: true });
ok(c.txns.length === 3 && c.chainRatio === 1, 'Excel/ODS matrix: 3 rows, chain 100% (' + c.txns.length + ')');
ok(c.opening === 100000, 'Excel/ODS: opening balance derived (' + c.opening + ')');
// 4. newest-first export with Dr balances (OD) from a spreadsheet
const csv4 = `Date,Narration,Debit,Credit,Balance\n20/06/24,NEFT CR CUSTOMER,,300000.00,100000.00 Cr\n10/06/24,RTGS SUPPLIER,150000.00,,200000.00 Dr\n02/06/24,CASH DEPOSIT,,50000.00,50000.00 Dr\n`;
const d = run(csv4, 'od.csv');
ok(d.txns.length === 3 && d.chainRatio === 1 && d.txns[0].date < d.txns[2].date, 'CSV newest-first + Dr/Cr balances re-ordered, chain 100%');
ok(d.txns[1].balance === -200000, 'CSV: "Dr" balance read as overdrawn (' + d.txns[1].balance + ')');
console.log(fail ? fail + ' FAILURES' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
