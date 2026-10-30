// Centred headers + left-aligned wrapped narration + page footer (Equitas-style) — node test5.js
const E = require('./engine.js'); const CW = 5;
function mkPage(lines) { const words = []; lines.forEach((cells, i) => cells.forEach(([x, text, al, dy]) => { let cx = al === 'R' ? x - text.length * CW : x; text.split(' ').forEach(p => { words.push({ t: p, x0: cx, x1: cx + p.length * CW, y: 40 + i * 12 + (dy || 0), h: 10 }); cx += (p.length + 1) * CW; }); })); return E.groupWords(words, { charW: CW }); }
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
const L = [[[10, 'Equitas Small Finance Bank']], [[10, 'Statement for your account no.: 100044793059'], [250, 'Account Type : SAVING']], [[10, 'Account Title : Lakshmi H']], [[10, 'IFSC Code: ESFB0001001']], [],
  [[10, 'Transaction'], [70, 'Value Date'], [140, 'Reference or'], [300, 'Narration'], [420, 'Debit'], [470, 'Credit'], [520, 'Balance']],
  [[10, 'Date'], [140, 'cheque no']],
  [[300, 'OPENING BALANCE'], [560, '615.61', 'R']],
  [[10, '01/09/2026'], [70, '01/09/2026'], [300, 'UPI REF NO 214583796410'], [450, '10.00', 'R'], [560, '605.61', 'R']],
  [[300, 'P2P-SHAIK BIKKAN-SENT']], [[300, 'USING P-SBIN0012218- HEAD']], [[300, 'OFFICE']], [],
  [[10, '02/09/2026'], [70, '02/09/2026'], [300, 'SMS ALRT'], [450, '38.59', 'R'], [560, '567.02', 'R']], [[300, 'CHGS+GST:310826']],
  [[10, '03/09/2026'], [70, '03/09/2026'], [300, 'UPI REF NO 313804121959'], [510, '500.00', 'R'], [560, '1,067.02', 'R']], [[300, 'P2P-VISHAL PORWAL-SENT USING']], [[300, 'OFFICE']],
  [[0, '', '', 60]], [[10, 'Equitas Small Finance Bank never sends emails with embedded links', '', 40]], [[10, 'Page 2 of 14']]];
const s = E.parseDocument([mkPage(L)], { fileName: 'eq.pdf' });
console.log(s.txns.map(t => t.desc).join(' || '));
ok(s.txns.length === 3, '3 transactions (' + s.txns.length + ')');
ok(/^UPI REF NO 214583796410 P2P-SHAIK BIKKAN-SENT USING P-SBIN0012218- HEAD OFFICE$/.test(s.txns[0].desc), 'first word of every wrapped narration line kept');
ok(!/Finance|never sends/i.test(s.txns[1].desc + s.txns[2].desc), 'page footer text not appended to the last row');
ok(!s.txns[1].tags.includes('EMI') && s.txns[1].cat === 'Bank Charges', 'SMS charge row categorised as Bank Charges');
ok(s.chainRatio === 1 && s.opening === 615.61, 'balances chain, opening 615.61');
ok(s.meta.bank === 'Equitas Small Finance Bank' && s.meta.holder === 'Lakshmi H', 'bank + account title read (' + s.meta.bank + ' / ' + s.meta.holder + ')');
console.log(fail ? fail + ' FAILURES' : 'ALL PASSED');
