// Tests for categories, recurring detection, insights, window — node test2.js
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

function build(spec, bank = 'HDFC BANK LTD') {
  const lines = [[[10, bank]], [[10, 'Account No : 50100555566667']], [[10, 'Statement From : 01/01/2024 To : 30/06/2024']], [],
    [[10, 'Date'], [60, 'Narration'], [300, 'Chq./Ref.No.'], [400, 'Withdrawal Amt.'], [480, 'Deposit Amt.'], [560, 'Closing Balance']]];
  let bal = spec.open;
  spec.tx.forEach(([d, text, side, amt]) => {
    bal = side === 'C' ? bal + amt : bal - amt;
    const dd = d.split('-'); const ds = `${dd[2]}/${dd[1]}/24`;
    lines.push([[10, ds], [60, text], [300, 'R' + Math.floor(Math.random() * 1e6)], side === 'D' ? [460, money(amt), 'R'] : [540, money(amt), 'R'], [640, money(bal), 'R']]);
  });
  return E.parseDocument([mkPage(lines)], { fileName: 'syn.pdf' });
}

// 6 months: probable salary (no keyword), fixed ACH EMI (no word 'emi'), shopping, utilities, one bounce, an overdraft-ish low balance
const tx = [];
for (let m = 1; m <= 6; m++) {
  const mm = String(m).padStart(2, '0');
  tx.push([`2024-${mm}-01`, 'NEFT CR-SBIN0004321-GLOBEX SOLUTIONS PVT LTD-TPT', 'C', 62000 + (m % 2) * 500]);
  tx.push([`2024-${mm}-03`, 'ACH D- TATA CAPITAL FIN SERV 9988', 'D', 14500]);
  tx.push([`2024-${mm}-05`, 'UPI-SWIGGY-swiggy@icici-ICIC0000001-1234', 'D', 650 + m * 10]);
  tx.push([`2024-${mm}-08`, 'BIL/BPAY/BESCOM ELECTRICITY BILL', 'D', 1800 + m * 20]);
  tx.push([`2024-${mm}-12`, 'UPI-AMAZON PAY-amazon@apl-UTIB0000001-8877', 'D', 3200]);
  tx.push([`2024-${mm}-15`, 'ATM WDL SBI ATM 112233', 'D', 10000]);
  tx.push([`2024-${mm}-20`, 'UPI-HDFC LIFE INSURANCE PREMIUM-5544', 'D', 2500]);
  tx.push([`2024-${mm}-26`, 'NEFT DR-HDFC0001234-RAHUL TRADERS-INV', 'D', 20000]);
  tx.push([`2024-${mm}-27`, 'IMPS-RAHUL TRADERS-REFUND-P2A', 'C', 12000]);
}
tx.splice(20, 0, ['2024-03-10', 'CHQ RETURN INWARD INSUFFICIENT FUND', 'D', 1000]);
tx.sort((a, b) => a[0].localeCompare(b[0]));
const s = build({ open: 100000, tx });
console.log('txns', s.txns.length, '| chain', s.chainRatio, '| reconciled', s.reconciled);
ok(s.txns.length === tx.length, 'all transactions read (' + s.txns.length + '/' + tx.length + ')');
const byDesc = (re) => s.txns.filter(t => re.test(t.desc));

console.log('\n-- categories');
ok(byDesc(/SWIGGY/).every(t => t.cat === 'Food & Shopping'), 'Swiggy → Food & Shopping');
ok(byDesc(/BESCOM/).every(t => t.cat === 'Utilities & Bills'), 'BESCOM → Utilities & Bills');
ok(byDesc(/INSURANCE/).every(t => t.cat === 'Insurance'), 'Insurance premium → Insurance');
ok(byDesc(/ATM WDL/).every(t => t.cat === 'Cash'), 'ATM → Cash');
ok(byDesc(/CHQ RETURN/).every(t => t.cat === 'Cheque / ECS Return'), 'bounce category');

console.log('\n-- recurring detection by pattern');
ok(byDesc(/TATA CAPITAL/).every(t => t.tags.includes('EMI') && t.cat === 'EMI / Loan'), 'fixed monthly ACH debit → EMI (no "emi" keyword) (' + byDesc(/TATA CAPITAL/).map(t => t.tags).join('|') + ')');
ok(byDesc(/GLOBEX/).every(t => t.tags.includes('SALARY') && t.tags.includes('PROBABLE_SALARY')), 'monthly credit from same party → probable salary');
ok(byDesc(/GLOBEX/).every(t => t.cat === 'Salary'), 'salary category');

console.log('\n-- insights');
const rep = E.buildReport(s);
const ins = rep.insights;
console.log('score', ins.score, ins.grade);
ins.flags.forEach(f => console.log('  [' + f.level + ']', f.title, '—', f.detail));
ok(ins.score >= 0 && ins.score <= 100, 'score in range');
ok(ins.flags.some(f => f.title === 'Cheque / ECS returns' && f.level === 'med'), 'bounce flagged');
ok(ins.flags.some(f => f.title === 'Regular salary-like credits'), 'regular salary positive flag');
ok(ins.flags.some(f => f.title === 'Obligation ratio (FOIR)'), 'FOIR flag present');
ok(Math.abs(ins.foir - 14500 / ((62000 * 3 + 62500 * 3) / 6)) < 0.01, 'FOIR ≈ ' + (ins.foir * 100).toFixed(1) + '%');
ok(ins.flags.some(f => /Two-way/.test(f.title)), 'two-way party (Rahul Traders credit & debit) flagged');
ok(rep.sheets.some(x => x.name === 'Insights & Risk') && rep.sheets.some(x => x.name === 'Category Summary'), 'new sheets exist');
console.log('sheets:', rep.sheets.length, rep.sheets.map(x => x.name).join(' | '));
ok(rep.sheets.length === 26, '26 sheets');
ok(rep.cats.length > 5 && rep.daily.length > 150, 'cats ' + rep.cats.length + ', daily points ' + rep.daily.length);
const xns = rep.sheets.find(x => x.name === 'Xns').aoa;
ok(xns[0].indexOf('Category') === 6 && xns[0].indexOf('Flags') === 7, 'Xns has Category + Flags columns');

console.log('\n-- window');
const w3 = E.windowStatement(s, 3);
ok(w3.from >= '2024-04-01' && w3.to === s.to, 'last-3-month window from ' + w3.from);
ok(w3.txns.length < s.txns.length && w3.chainRatio === 1, 'window txns ' + w3.txns.length + ', chain ' + w3.chainRatio);
const w3rep = E.buildReport(w3);
ok(w3rep.monthly.length === 3, '3 months in windowed report');
ok(E.windowStatement(s, 0) === s, 'window 0 = unchanged');

console.log('\n-- bad profile scores lower');
const badTx = [['2024-01-02', 'CASH DEPOSIT SELF', 'C', 49000], ['2024-01-03', 'CASH DEPOSIT SELF', 'C', 48000], ['2024-01-04', 'NEFT DR-VENDOR ONE', 'D', 150000],
  ['2024-02-01', 'CHQ RETURN INWARD INSUFFICIENT FUND', 'D', 500], ['2024-02-02', 'CHQ RETURN OUTWARD UNPAID', 'D', 500], ['2024-02-03', 'CHQ RETURN INWARD INSUFFICIENT FUND', 'D', 500]];
const bad = build({ open: 20000, tx: badTx });
const bi = E.buildReport(bad).insights;
console.log('bad score', bi.score, bi.grade, '| good score', ins.score);
ok(bi.score < ins.score && bi.score < 70, 'risky profile scores lower');
ok(bi.flags.some(f => f.title === 'Negative balance'), 'negative balance flagged');
console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL PASSED');
