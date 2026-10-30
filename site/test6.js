// Overdraft / Cash-Credit statement test — node test6.js
const E = require('./engine.js');
const CW = 5;
function mkPage(lines) { const words = []; lines.forEach((cells, i) => cells.forEach(([x, text, al]) => { let cx = al === 'R' ? x - text.length * CW : x; text.split(' ').forEach(p => { words.push({ t: p, x0: cx, x1: cx + p.length * CW, y: 40 + i * 14, h: 10 }); cx += (p.length + 1) * CW; }); })); return E.groupWords(words, { charW: CW }); }
const inr = v => { const [a, b] = Math.abs(v).toFixed(2).split('.'); let h = a.slice(-3), r = a.slice(0, -3); if (r) h = r.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + h; return h + '.' + b; };
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
const LIMIT = 500000;
const lines = [[[10, 'STATE BANK OF INDIA']], [[10, 'Account No : 38123456789']], [[10, 'Account Type : CASH CREDIT']], [[10, 'Name : ASHA TRADERS']], [[10, 'Sanction Limit : Rs. 5,00,000.00']], [[10, 'Drawing Power : Rs. 4,50,000.00']],
  [[10, 'Statement From : 01/01/2024 To : 30/04/2024']], [],
  [[10, 'Date'], [60, 'Narration'], [300, 'Ref No'], [400, 'Debit'], [480, 'Credit'], [560, 'Balance']]];
// balance as signed number; negative = overdrawn, shown as "x Dr"
let bal = -100000;
const tx = [['01', '02', 'CASH DEPOSIT CDM', 'C', 50000], ['01', '10', 'NEFT DR-SUPPLIER ONE', 'D', 250000], ['01', '25', 'NEFT CR-CUSTOMER A', 'C', 150000],
  ['02', '05', 'RTGS DR-SUPPLIER TWO', 'D', 300000], ['02', '20', 'NEFT CR-CUSTOMER B', 'C', 200000], ['03', '04', 'INT DEBIT OD INTEREST', 'D', 9000], ['03', '15', 'NEFT CR-CUSTOMER C', 'C', 400000], ['04', '10', 'NEFT DR-SUPPLIER THREE', 'D', 100000]];
const bals = [];
tx.forEach(([m, d, text, side, amt]) => { bal = side === 'C' ? bal + amt : bal - amt; bals.push(bal);
  const bs = bal < 0 ? inr(bal) + ' Dr' : inr(bal) + ' Cr';
  lines.push([[10, `${d}/${m}/24`], [60, text], [300, 'R' + (1000 + d)], side === 'D' ? [460, inr(amt), 'R'] : [540, inr(amt), 'R'], [640, bs, 'R']]); });
const s = E.parseDocument([mkPage(lines)], { fileName: 'cc.pdf' });
const rep = E.buildReport(s, {});
console.log('type:', s.meta.accountType, 'limit:', s.meta.limit, 'dp:', s.meta.dp, 'rows:', s.txns.length, 'chain:', s.chainRatio);
ok(s.txns.length === 8, '8 transactions read');
ok(s.chainRatio === 1, 'running balance chain 100% with "Dr" balances');
ok(s.txns[0].balance === -50000 && s.txns[1].balance === -300000, 'Dr balances read as negative (' + s.txns[0].balance + ', ' + s.txns[1].balance + ')');
ok(s.meta.accountType === 'Cash Credit', 'account type Cash Credit');
ok(s.meta.limit === LIMIT, 'sanction limit read from header (' + s.meta.limit + ')');
ok(s.meta.dp === 450000, 'drawing power read separately (' + s.meta.dp + ')');
const od = rep.od;
ok(od && od.limit === LIMIT && od.needLimit === false, 'OD summary present with limit');
ok(od.peakAmt === 450000 && od.peakPct === 90 && od.overLimit === false, 'peak utilisation 90% (' + od.peakPct + '%, ' + od.peakAmt + ')');
ok(od.overdrawnDays > 0 && od.avgPct > 0 && od.avgPct < 100, 'average utilisation computed (' + od.avgPct + '%, ' + od.overdrawnDays + ' days)');
ok(od.currentPct === 0, 'closing balance is positive → 0% at end');
ok(od.interest === 9000, 'OD interest debited summed (' + od.interest + ')');
const an = rep.workbook[0].rows;
const row = l => an.find(r => r[0] && r[0].v === l);
ok(row('Sanction Limit')[1].v === LIMIT && row('Drawing power limit')[1].v === 450000, 'Analysis: sanction 5,00,000 and drawing power 4,50,000');
ok(row('OD/CC Utilization for the Month %').slice(1, 5).some(c => typeof c.v === 'number' && c.v > 0), 'Analysis: utilisation % row populated');
ok(row('No of overdrawn days for Month').slice(1, 5).some(c => c.v > 0), 'Analysis: overdrawn days > 0');
const fcu = rep.workbook.find(x => x.name === 'Fraud Checks').rows;
ok(fcu.find(r => r[1] && /Negative EOD/.test(r[1].v))[4].v === 'N', 'FCU: negative EOD is not flagged on an OD/CC account');
// same account without header limit → asks for it
const lines2 = lines.filter(l => !(l[0] && /Sanction|Drawing/.test(l[0][1])));
const s2 = E.parseDocument([mkPage(lines2)], { fileName: 'cc2.pdf' });
const r2 = E.buildReport(s2, {});
ok(r2.od && r2.od.needLimit === true, 'no limit in header → needLimit prompt');
const r3 = E.buildReport(s2, { limit: 400000 });
ok(r3.od.limit === 400000 && r3.od.peakPct === 112.5 && r3.od.overLimit === true, 'user-entered limit wins; breach detected (peak ' + r3.od.peakPct + '%)');
// narration-embedded limit and time-stamped interest narration (Union Bank style OD export)
const L3 = [...lines2.slice(0, 8), lines2[8]];
const ln = [[[10, 'UNION BANK OF INDIA']], [[10, 'Account No : 114515080000003']], [[10, 'Account Type : Cash Credit']], [[10, 'Name : SATYANI TECHNOLOGIES LLP']], [], [[10, 'Date'], [60, 'Narration'], [300, 'Ref No'], [400, 'Debit'], [480, 'Credit'], [560, 'Balance']],
  [[10, '27/05/26'], [60, 'Limit 3000000 13:45:38'], [300, 'X1'], [460, '6,195.00', 'R'], [640, '6,195.00 Dr', 'R']],
  [[10, '31/05/26'], [60, '114515080000003:Int. 03:38:45 Coll:27-05-2026 to 31-05-2026'], [300, 'X2'], [460, '1,133.00', 'R'], [640, '7,328.00 Dr', 'R']],
  [[10, '02/06/26'], [60, 'NEFT CR CUSTOMER'], [300, 'X3'], [540, '10,000.00', 'R'], [640, '2,672.00 Cr', 'R']]];
const s4 = E.parseDocument([mkPage(ln)], { fileName: 'ubi.pdf' });
const r4 = E.buildReport(s4, {});
ok(s4.txns[1].tags.indexOf('INTEREST_DR') >= 0 && !/\d\d:\d\d:\d\d/.test(s4.txns[1].desc), 'time stamp removed from narration; OD interest recognised');
ok(r4.od && r4.od.limit === 3000000 && r4.od.limitFrom === 'narration' && r4.od.interest === 1133, 'limit read from "Limit 3000000" entry; interest summed (' + (r4.od && r4.od.limit) + ')');
// savings account never overdrawn → no OD block
console.log(fail ? fail + ' FAILURES' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
