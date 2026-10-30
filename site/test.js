const E = require('./engine.js');
const CW = 5;
function mkPage(lines) {
  // lines: array of arrays of [x, text]; y by index
  const words = [];
  lines.forEach((cells, i) => {
    cells.forEach(([x, text, align]) => {
      const parts = text.split(' ');
      let cx = x;
      if (align === 'R') cx = x - text.length * CW;
      parts.forEach(p => {
        words.push({ t: p, x0: cx, x1: cx + p.length * CW, y: 40 + i * 14, h: 10 });
        cx += (p.length + 1) * CW;
      });
    });
  });
  return E.groupWords(words, { charW: CW });
}
function show(name, s) {
  console.log('\n=== ' + name + ' ===');
  console.log('mode:', s.parseMode, '| txns:', s.txns.length, '| chain:', s.chainRatio, '| reconciled:', s.reconciled, '| opening:', s.opening, 'closing:', s.closing, '| reversed:', s.reversed, 'swapped:', s.swapped);
  console.log('meta:', JSON.stringify(s.meta));
  s.txns.slice(0, 4).forEach(t => console.log(' ', t.date, '|', t.desc.slice(0, 40), '| D', t.debit, 'C', t.credit, 'B', t.balance, '|', t.mode, t.tags.join(','), '|', t.cpty));
  if (s.warnings.length) console.log('warn:', s.warnings);
}
let fail = 0;
function expect(c, m) { if (!c) { console.log('  ✗ FAIL:', m); fail++; } else console.log('  ✓', m); }

// ---- 1. HDFC-style: Date | Narration | Chq/Ref | Value Dt | Withdrawal | Deposit | Closing Balance
const hdfc = [
  [[10, 'HDFC BANK LTD']],
  [[10, 'Account No : 50100123456789'], [250, 'IFSC : HDFC0001234']],
  [[10, 'Statement From : 01/04/2024 To : 30/04/2024']],
  [[10, 'Name : RAJESH KUMAR TRADERS']],
  [],
  [[10, 'Date'], [60, 'Narration'], [260, 'Chq./Ref.No.'], [340, 'Value Dt'], [400, 'Withdrawal Amt.'], [480, 'Deposit Amt.'], [560, 'Closing Balance']],
  [[10, '01/04/24'], [60, 'UPI-ZOMATO-zomato@hdfcbank-HDFC0000123-4123'], [260, '0000412345678'], [340, '01/04/24'], [460, '450.00', 'R'], [560, '99,550.00', 'R'], [640, '99,550.00', 'R']],
  [[60, '45678-UPI']],
  [[10, '02/04/24'], [60, 'NEFT CR-HDFC0001234-ACME PVT LTD-SALARY'], [260, 'N123456'], [340, '02/04/24'], [540, '50,000.00', 'R'], [640, '1,49,550.00', 'R']],
  [[10, '05/04/24'], [60, 'CHQ RETURN INWARD INSUFFICIENT FUND'], [260, '000123'], [340, '05/04/24'], [460, '1,000.00', 'R'], [640, '1,48,550.00', 'R']],
  [[10, '10/04/24'], [60, 'ATM WDL MUMBAI'], [260, '0000999'], [340, '10/04/24'], [460, '10,000.00', 'R'], [640, '1,38,550.00', 'R']],
  [[10, '15/04/24'], [60, 'ACH D- BAJAJ FINANCE EMI'], [260, '0000777'], [340, '15/04/24'], [460, '12,500.00', 'R'], [640, '1,26,050.00', 'R']],
  [[10, '28/04/24'], [60, 'CASH DEPOSIT BRANCH'], [260, '0000778'], [340, '28/04/24'], [540, '20,000.00', 'R'], [640, '1,46,050.00', 'R']],
  [[10, 'STATEMENT SUMMARY']],
  [[10, 'Opening Balance 1,00,000.00 Total Debits 23,950.00']],
];
let s1 = E.parseDocument([mkPage(hdfc)], { fileName: 'hdfc.pdf' });
show('HDFC-style', s1);
expect(s1.txns.length === 6, '6 transactions (got ' + s1.txns.length + ')');
expect(s1.parseMode === 'table-header', 'header mode chosen');
expect(s1.opening === 100000, 'opening 1,00,000 (got ' + s1.opening + ')');
expect(s1.closing === 146050, 'closing');
expect(s1.reconciled === true, 'reconciled');
expect(s1.meta.accountNo === '50100123456789', 'acct no (' + s1.meta.accountNo + ')');
expect(s1.meta.bank === 'HDFC Bank', 'bank');
expect(s1.txns[0].desc.indexOf('45678-UPI') > 0, 'multi-line narration joined');
expect(s1.txns[0].valueDate === '2024-04-01', 'value date');
expect(s1.txns[2].tags.some(x => x.indexOf('BOUNCE') === 0), 'bounce tag');
expect(s1.txns[4].tags.includes('EMI'), 'EMI tag');
expect(s1.txns[5].tags.includes('CASH_DEP'), 'cash dep tag');
expect(s1.txns[1].tags.includes('SALARY'), 'salary tag');
expect(s1.chainRatio === 1, 'chain 100%');

// ---- 2. Kotak style: single Amount col with Cr/Dr suffix, newest first
const kot = [
  [[10, 'Kotak Mahindra Bank']],
  [[10, 'Account No. 1234567890']],
  [[10, 'Date'], [70, 'Narration'], [300, 'Chq/Ref No'], [400, 'Withdrawal(Dr)/Deposit(Cr)'], [560, 'Balance']],
  [[10, '25-Jun-2024'], [70, 'UPI/DR/412345/SWIGGY/KKBK'], [300, 'UPI-123'], [520, '300.00(Dr)', 'R'], [620, '4,200.00(Cr)', 'R']],
  [[10, '20-Jun-2024'], [70, 'NEFT-SALARY ACME'], [300, 'N1'], [520, '1,000.00(Cr)', 'R'], [620, '4,500.00(Cr)', 'R']],
  [[10, '10-Jun-2024'], [70, 'ATM WDL'], [300, 'A1'], [520, '500.00(Dr)', 'R'], [620, '3,500.00(Cr)', 'R']],
  [[10, '01-Jun-2024'], [70, 'IMPS TO RAVI'], [300, 'I1'], [520, '500.00(Dr)', 'R'], [620, '4,000.00(Cr)', 'R']],
];
let s2 = E.parseDocument([mkPage(kot)], { fileName: 'kotak.pdf' });
show('Kotak-style newest-first single amount', s2);
expect(s2.txns.length === 4, '4 txns');
expect(s2.reversed === true, 'reversed to chronological');
expect(s2.txns[0].date === '2024-06-01', 'oldest first');
expect(s2.txns[0].debit === 500 && s2.txns[3].debit === 300, 'dr amounts');
expect(s2.txns[2].credit === 1000, 'credit amount');
expect(s2.chainRatio === 1, 'chain 100% (' + s2.chainRatio + ')');

// ---- 3. No header, line pattern, amount + balance only
const raw3 = [
  [[10, 'Some random bank statement']],
  [[10, '01/05/2024 POS PURCHASE AMAZON'], [450, '1,200.00', 'R'], [560, '8,800.00', 'R']],
  [[10, '03/05/2024 NEFT CR SALARY'], [450, '5,000.00', 'R'], [560, '13,800.00', 'R']],
  [[10, '04/05/2024 UPI/DR/55/SHOP'], [450, '800.00', 'R'], [560, '13,000.00', 'R']],
  [[40, 'continued narration line']],
];
let s3 = E.parseDocument([mkPage(raw3)], { fileName: 'plain.pdf' });
show('No header / line mode', s3);
expect(s3.txns.length === 3, '3 txns (got ' + s3.txns.length + ')');
expect(s3.txns[1].credit === 5000, 'inferred credit from balance delta');
expect(s3.txns[0].debit === 1200, 'inferred debit from balance delta');

// ---- 4. ICICI style with serial + two date cols + DR/CR cols
const ici = [
  [[10, 'ICICI Bank']], [[10, 'Account Number: XXXXXXXX4321']],
  [[10, 'S No.'], [50, 'Value Date'], [120, 'Transaction Date'], [210, 'Cheque Number'], [300, 'Transaction Remarks'], [480, 'Withdrawal Amount (INR)'], [600, 'Deposit Amount (INR)'], [700, 'Balance (INR)']],
  [[10, '1'], [50, '02/07/2024'], [120, '02/07/2024'], [300, 'UPI/412/PRIYA SHARMA/ICIC/x@icici'], [560, '2,000.00', 'R'], [790, '48,000.00', 'R']],
  [[10, '2'], [50, '03/07/2024'], [120, '03/07/2024'], [300, 'BIL/INFT/12345/ELECTRICITY'], [560, '1,500.00', 'R'], [790, '46,500.00', 'R']],
  [[10, '3'], [50, '04/07/2024'], [120, '04/07/2024'], [300, 'NEFT-REFUND-FLIPKART'], [670, '700.00', 'R'], [790, '47,200.00', 'R']],
];
let s4 = E.parseDocument([mkPage(ici)], { fileName: 'icici.pdf' });
show('ICICI-style', s4);
expect(s4.txns.length === 3, '3 txns (got ' + s4.txns.length + ')');
expect(s4.chainRatio === 1, 'chain ok');
expect(s4.meta.accountNo === 'XXXXXXXX4321', 'masked acct');

// ---- 5. Excel matrix
const mat = [
  ['Account Statement'], ['Account No', '9988776655'],
  ['Txn Date', 'Description', 'Ref No', 'Debit', 'Credit', 'Balance'],
  ['01-08-2024', 'NEFT IN FROM ABC', 'R1', '', '10000', '110000'],
  ['02-08-2024', 'UPI/XYZ', 'R2', '2500.50', '', '107499.50'],
];
const g = E.rowsFromMatrix(mat);
let s5 = E.parseDocument([g], { fileName: 'x.xlsx', allowInt: true });
show('Excel matrix', s5);
expect(s5.txns.length === 2, '2 txns (got ' + s5.txns.length + ')');
expect(s5.txns[1].debit === 2500.5, 'debit');

// ---- account matching
expect(E.sameAccount('50100123456789', 'XXXXXXXX456789') === true, 'masked match');
expect(E.sameAccount('50100123456789', '50100123450000') === false, 'different accounts rejected');
expect(E.sameAccount('1234', '') === null, 'unknown');

// ---- merge
const sA = E.parseDocument([mkPage(hdfc)], { fileName: 'a.pdf' });
const hdfc2 = hdfc.map(l => l.slice());
const merged = E.mergeStatements([sA, sA]);
expect(merged.txns.length === sA.txns.length, 'duplicate file skipped in merge (' + merged.txns.length + ')');
const rep = E.buildReport(sA);
console.log('\nSheets:', rep.sheets.map(s => s.name).join(' | '));
expect(rep.sheets.length >= 14, '≥14 sheets');
console.log('ABB', rep.abb, 'bounces', rep.bounces, 'emis', rep.emis, 'cashDep', rep.cashDep);
const mon = rep.sheets.find(s => s.name === 'Monthly Details').aoa;
console.log(mon.slice(0, 6).map(r => r.map(c => (c && c.v !== undefined) ? c.v : c).join(' | ')).join('\n'));
console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL PASSED');
