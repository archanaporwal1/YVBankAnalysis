// Perfios-style feature tests: cheques, bounces+charges, loan credits, self transfers, OD limit, forensics — node test3.js
const E = require('./engine.js');
const CW = 5;
function mkPage(lines) {
  const words = [];
  lines.forEach((cells, i) => cells.forEach(([x, text, align]) => {
    let cx = align === 'R' ? x - text.length * CW : x;
    text.split(' ').forEach(p => { words.push({ t: p, x0: cx, x1: cx + p.length * CW, y: 40 + i * 14, h: 10 }); cx += (p.length + 1) * CW; });
  }));
  return E.groupWords(words, { charW: CW });
}
function money(v) { const s = Math.abs(v).toFixed(2); let [i, d] = s.split('.'); if (i.length > 3) { let h = i.slice(0, -3), t = i.slice(-3), p = []; while (h.length > 2) { p.unshift(h.slice(-2)); h = h.slice(0, -2); } if (h) p.unshift(h); i = p.join(',') + ',' + t; } return (v < 0 ? '-' : '') + i + '.' + d; }
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
function build(spec, headerExtra) {
  const lines = [[[10, 'HDFC BANK LTD']], [[10, 'Account No : 50100777788889   IFSC : HDFC0001234']], [[10, 'Branch : KORAMANGALA BANGALORE   MICR : 560240002']],
    [[10, 'Account Type : CURRENT ACCOUNT']]].concat(headerExtra || []).concat([[[10, 'Statement From : 01/01/2024 To : 30/04/2024']], [],
    [[10, 'Date'], [60, 'Narration'], [300, 'Chq./Ref.No.'], [400, 'Withdrawal Amt.'], [480, 'Deposit Amt.'], [560, 'Closing Balance']]]);
  let bal = spec.open;
  spec.tx.forEach(([d, text, side, amt, ref]) => {
    bal = side === 'C' ? bal + amt : bal - amt;
    const dd = d.split('-');
    lines.push([[10, `${dd[2]}/${dd[1]}/24`], [60, text], [300, ref || '0000'], side === 'D' ? [460, money(amt), 'R'] : [540, money(amt), 'R'], [640, money(bal), 'R']]);
  });
  return E.parseDocument([mkPage(lines)], { fileName: 'syn.pdf' });
}
const tx = [
  ['2024-01-02', 'CHQ DEP - CLG - ABC TRADERS', 'C', 50000, '123456'],
  ['2024-01-03', 'NEFT CR-LOAN DISBURSEMENT-BAJAJ FINANCE', 'C', 200000, 'N9'],
  ['2024-01-05', 'CHQ PAID - 000321 - RAMESH SUPPLIERS', 'D', 30000, '000321'],
  ['2024-01-07', 'FUND TRANSFER TO SELF OWN A/C', 'D', 40000, 'F1'],
  ['2024-01-07', 'FUND TRANSFER FROM SELF OWN A/C', 'C', 40000, 'F2'],
  ['2024-01-10', 'I/W CHQ RET INSUFFICIENT FUNDS - 000322', 'D', 15000, '000322'],
  ['2024-01-11', 'CHQ RET CHGS INSUFFICIENT FUNDS', 'D', 500, ''],
  ['2024-01-15', 'ECS RETURN - EMI BAJAJ FIN - UNPAID', 'D', 9000, ''],
  ['2024-01-16', 'RETURN CHARGES ECS', 'D', 350, ''],
  ['2024-01-20', 'NEFT DR-VENDOR TRADERS', 'D', 120000, 'N10'],
  ['2024-02-02', 'NEFT CR-ACME CORP-SALES', 'C', 90000, 'N11'],
  ['2024-02-06', 'INTEREST DEBIT OD', 'D', 1200, ''],
  ['2024-02-12', 'REFUND FROM AMAZON', 'C', 1999, ''],
  ['2024-02-25', 'CHQ PAID - 000330 - PAYEE TWO', 'D', 25000, '000330'],
];
const s = build({ open: 100000, tx });
console.log('txns', s.txns.length, '| chain', s.chainRatio, '| reconciled', s.reconciled, '| meta', JSON.stringify(s.meta));
ok(s.txns.length === tx.length, 'all rows read (' + s.txns.length + '/' + tx.length + ')');
ok(s.meta.accountType === 'Current', 'account type = ' + s.meta.accountType);
ok(s.meta.micr === '560240002', 'MICR = ' + s.meta.micr);
ok(/KORAMANGALA/.test(s.meta.branch), 'branch = ' + s.meta.branch);
const by = re => s.txns.filter(t => re.test(t.desc));

console.log('\n-- tags');
ok(by(/CHQ DEP - CLG/)[0].tags.includes('CHQ_DEP'), 'cheque deposit tagged');
ok(by(/CHQ PAID - 000321/)[0].tags.includes('CHQ_ISSUED'), 'issued cheque tagged');
ok(by(/LOAN DISBURSEMENT/)[0].tags.includes('LOAN_CR'), 'loan disbursement tagged LOAN_CR');
ok(by(/I\/W CHQ RET INSUFF/)[0].tags.includes('BOUNCE_INWARD'), 'inward bounce tagged');
ok(!by(/CHQ RET CHGS/)[0].tags.some(x => x.startsWith('BOUNCE')) && by(/CHQ RET CHGS/)[0].tags.includes('RETURN_CHARGE'), 'bounce charge is a RETURN_CHARGE, not a 2nd bounce');
ok(by(/ECS RETURN/)[0].tags.some(x => x.startsWith('BOUNCE')), 'ECS return is a bounce');
ok(by(/TRANSFER TO SELF/)[0].tags.includes('SELF'), 'self transfer tagged');

const rep = E.buildReport(s);
const sheet = n => rep.sheets.find(x => x.name === n);
const val = c => (c && c.v !== undefined) ? c.v : c;
const rowOf = (sh, label) => sheet(sh).aoa.find(r => String(r[0]).indexOf(label) === 0);

console.log('\n-- monthly details');
const jan = 1; // column index of Jan
const mrow = l => rowOf('Monthly Details', l);
ok(val(mrow('Cheque Deposits (No.)')[jan]) === 1 && val(mrow('Cheque Deposits (Amount)')[jan]) === 50000, 'Jan cheque deposits 1 / 50,000');
ok(val(mrow('Cheques Issued (No.)')[jan]) === 1 && val(mrow('Cheques Issued (Amount)')[jan]) === 30000, 'Jan cheques issued 1 / 30,000');
ok(val(mrow('Inward Returns (No.)')[jan]) === 1, 'Jan inward returns = 1');
ok(val(mrow('Cheque Bounces (No.)')[jan]) === 1 && val(mrow('ECS / NACH / EMI Bounces (No.)')[jan]) === 1, 'Jan: 1 cheque bounce + 1 ECS bounce (charges NOT double-counted)');
ok(val(mrow('Return / Bounce Charges (Amount)')[jan]) === 850, 'Jan return charges 850 (' + val(mrow('Return / Bounce Charges (Amount)')[jan]) + ')');
ok(val(mrow('Loan Credits / Disbursals (Amount)')[jan]) === 200000, 'Jan loan credit 2,00,000');
ok(val(mrow('Own Account Transfers - Credits')[jan]) === 40000 && val(mrow('Own Account Transfers - Debits')[jan]) === 40000, 'Jan own transfers 40,000 both ways');
// Jan credits: 50000 + 200000 + 40000 = 290000 ; net = 50000 only
ok(val(mrow('Total Amount of Credit Transactions')[jan]) === 290000, 'Jan gross credits 2,90,000');
ok(val(mrow('Net Credits (Amount)')[jan]) === 50000, 'Jan NET credits 50,000 = gross − loan − self (' + val(mrow('Net Credits (Amount)')[jan]) + ')');
ok(val(mrow('Interest Debited (Amount)')[2]) === 1200, 'Feb interest debited 1,200');
ok(val(mrow('Refunds / Reversals Credited (Amount)')[2]) === 1999, 'Feb refund 1,999 separated from net credits');
ok(val(mrow('Net Credits (Amount)')[2]) === 90000, 'Feb net credits 90,000 (refund excluded)');

console.log('\n-- bounce sheet');
const bn = sheet('Cheque & ECS Bounces').aoa;
const hdrIdx = bn.findIndex(r => r[0] === 'Date');
const brows = bn.slice(hdrIdx + 1).filter(r => r[1] && r[1] !== '');
console.log('  ', brows.map(r => [r[1], r[2], r[3], r[6], val(r[8])].join(' | ')).join('\n   '));
ok(brows.length === 2, '2 bounce rows');
ok(brows.some(r => r[1] === 'Inward' && r[2] === 'Cheque' && r[6] === 'Insufficient funds' && val(r[8]) === 500), 'cheque bounce: inward / insufficient funds / charge 500 linked');
ok(brows.some(r => r[2] === 'ECS / NACH / EMI' && val(r[8]) === 350), 'ECS bounce linked to its 350 charge');
ok(String(val(brows.find(r => r[2] === 'Cheque')[3])) === '000322', 'bounced cheque number 000322');

console.log('\n-- cheque sheets');
const ci = sheet('Cheque Issued').aoa.filter(r => /^\d{6}$/.test(String(r[1])));
ok(ci.map(r => r[1]).join(',') === '000321,000330', 'cheque numbers issued: ' + ci.map(r => r[1]).join(','));
const cd = sheet('Cheque Deposits').aoa.filter(r => /^\d{6}$/.test(String(r[1])));
ok(cd.length === 1 && cd[0][1] === '123456', 'cheque deposit number 123456');

console.log('\n-- fixed obligations / other sheets');
const fo = sheet('Fixed Obligations').aoa;
ok(fo.some(r => /BAJAJ/.test(String(r[0])) || /ESTIMATED/i.test(String(r[0]))) || fo.length > 5, 'fixed obligations sheet populated');
ok(rowOf('Self Transfers', 'TOTAL') && val(rowOf('Self Transfers', 'TOTAL')[4]) === 40000, 'self transfers sheet total debit 40,000');
ok(val(rowOf('Loan Credits', 'TOTAL')[5]) === 200000, 'loan credits sheet total 2,00,000');
ok(rep.sheets.length === 26, rep.sheets.length + ' sheets');

console.log('\n-- OD / CC limit utilisation');
const od = build({ open: 0, tx: [['2024-01-02', 'NEFT DR-SUPPLIER', 'D', 400000, 'a'], ['2024-01-20', 'NEFT CR-CUSTOMER', 'C', 300000, 'b'], ['2024-02-05', 'NEFT DR-SUPPLIER', 'D', 100000, 'c']] },
  [[[10, 'Sanctioned Limit : Rs. 5,00,000.00']]]);
console.log('  meta limit', od.meta.limit, '| opening', od.opening, '| closing', od.closing);
ok(od.meta.limit === 500000, 'limit read from header = ' + od.meta.limit);
const odRep = E.buildReport(od);
const util = rowOf; 
const um = odRep.sheets.find(x => x.name === 'Monthly Details').aoa;
const peak = um.find(r => r[0] === 'Peak Limit Utilisation (%)');
console.log('  peak util', peak.map(val).join(' | '));
ok(!!peak && val(peak[1]) === 80, 'Jan peak utilisation 80% (4,00,000 of 5,00,000)');
ok(odRep.insights.flags.some(f => f.title === 'Limit utilisation'), 'utilisation flag raised');
const override = E.buildReport(od, { limit: 1000000 }).sheets.find(x => x.name === 'Monthly Details').aoa.find(r => r[0] === 'Peak Limit Utilisation (%)');
ok(val(override[1]) === 40, 'user-entered limit overrides: peak 40% on 10,00,000');
ok(od.txns.filter(t => t.balance < 0).length >= 1 && um.find(r => r[0] === 'Days with Negative Balance'), 'negative-balance days reported');

console.log('\n-- document forensics');
const C = (info, last) => E.docChecks(info, last);
ok(C({ kind: 'pdf', producer: 'iText 5.5', creationRaw: "D:20240501120000+05'30'", modRaw: "D:20240501120000+05'30'" }, '2024-04-30').level === 'ok', 'normal bank-style PDF → OK');
ok(C({ kind: 'pdf', producer: 'Microsoft® Word 2016', creationRaw: 'D:20240501' }, '2024-04-30').level === 'med', 'Word-produced → REVIEW');
ok(C({ kind: 'pdf', producer: 'Skia/PDF m120', creationRaw: 'D:20240502' }, '2024-04-30').level === 'info', 'Chrome re-saved (our own unlock advice) → INFO only, not a warning');
ok(C({ kind: 'pdf', producer: 'iText', creationRaw: 'D:20240315' }, '2024-04-30').level === 'high', 'created before last transaction → HIGH');
ok(C({ kind: 'pdf', producer: 'iText', creationRaw: 'D:20240501', modRaw: 'D:20240520' }, '2024-04-30').level === 'med', 'modified 19 days after creation → REVIEW');
ok(C({ kind: 'image' }, '2024-04-30').level === 'info', 'photo → INFO');
s.docInfo = { kind: 'pdf', producer: 'Adobe Photoshop 25', creationRaw: 'D:20240601' };
const fxRep = E.buildReport(s);
ok(fxRep.insights.flags.some(f => f.title === 'Document authenticity' && f.level === 'med'), 'forensics flag appears in Insights');
ok(fxRep.sheets.find(x => x.name === 'Document Forensics').aoa.some(r => r[6] === 'REVIEW'), 'Document Forensics sheet shows REVIEW');
console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL PASSED');
