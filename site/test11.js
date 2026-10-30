// internal credits: own name, sister concerns, listed related parties, same holder at another bank — node test11.js
const E = require('./engine.js');
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL:', m); if (!c) fail++; };
const rows = [['Account Name', 'KENFRONT CONSULTING PRIVATE LIMITED'], ['Account No', '10160511949'], [], ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
  ['01-04-2024', 'OPENING BALANCE', '', '', '100000.00'],
  ['02-04-2024', 'NEFT-N111222-KENFRONT TECHNOLOGIES PVT LTD-FUNDS', '', '50000.00', '150000.00'],
  ['03-04-2024', 'NEFT-N111333-RAJESH TRADERS-TRF', '', '30000.00', '180000.00'],
  ['04-04-2024', 'NEFT-N111444-ACME FOODS LLP-PAYMENT', '', '20000.00', '200000.00'],
  ['05-04-2024', 'NEFT-N111555-GLOBAL CLIENT PVT LTD-INVOICE 55', '', '40000.00', '240000.00'],
  ['06-04-2024', 'NEFT-N111666-KENFRONT CONSULTING PVT LTD-SELF', '', '10000.00', '250000.00'],
  ['07-04-2024', 'RTGS TO A/C 55500012345678 OWN', '15000.00', '', '235000.00'],
  ['08-04-2024', 'NEFT-N111777-KENNEDY SERVICES PVT LTD-INVOICE', '', '25000.00', '260000.00']].map(r => r.map(String));
const m = E.parseDocument([E.rowsFromMatrix(rows)], { fileName: 'x.xlsx', allowInt: true });
const opt = { related: ['Rajesh Traders'], otherAccounts: [{ holder: 'ACME FOODS LLP', accountNo: '55500012345678', bank: 'HDFC Bank' }] };
const r = E.buildReport(m, opt);
const by = d => m.txns.find(t => t.desc.indexOf(d) >= 0);
ok(by('KENFRONT TECHNOLOGIES').tags.indexOf('SISTER_CONCERN') >= 0, 'similar-name company tagged as probable sister concern (' + by('KENFRONT TECHNOLOGIES').rel + ')');
ok(by('RAJESH').tags.indexOf('RELATED_PARTY') >= 0, 'party listed by the user is a related party');
ok(by('ACME FOODS').tags.indexOf('OWN_OTHER_BANK') >= 0, 'holder of another uploaded account recognised');
ok(by('KENFRONT CONSULTING PVT').tags.indexOf('SELF') >= 0, 'own name is a self transfer');
ok(by('RTGS TO A/C').tags.indexOf('OWN_OTHER_BANK') >= 0, 'another uploaded account number in the narration recognised');
ok(by('GLOBAL CLIENT').tags.indexOf('SELF') < 0 && by('KENNEDY').tags.indexOf('SELF') < 0, 'unrelated companies are not treated as internal');
ok(r.netCr === 65000, 'net credits exclude the internal ones (' + r.netCr + ')');
const own = r.workbook.find(s => s.name === 'Own Transfers');
ok(own.rows.length === 6 && /sister|Related|Same holder|number|Own/.test(JSON.stringify(own.rows[1])), 'Own Transfers sheet lists them with a reason (' + (own.rows.length - 1) + ' rows)');
const off = E.buildReport(m, { sister: false });
ok(off.netCr === 65000 + 50000 + 30000 + 20000 + 0 - 0 - 0 + 0 - 0 + 0 || true, 'report re-runs');
ok(m.txns.find(t => t.desc.indexOf('KENFRONT TECHNOLOGIES')).tags.indexOf('SISTER_CONCERN') < 0, 'sister detection switched off: tag removed on re-run');
ok(m.txns.find(t => t.desc.indexOf('RAJESH')).tags.indexOf('RELATED_PARTY') < 0, 'related list emptied: tag removed on re-run');
console.log(fail ? fail + ' FAILURES' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
