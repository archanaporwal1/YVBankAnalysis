// Reads a layout report (JSON from an issue body) and writes a markdown triage comment. No network, no paid APIs.
// usage: node tools/triage.js report.json > comment.md
const fs = require('fs'), E = require('../site/engine.js');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cols = (r.headerColumns || []).map(c => { const i = c.indexOf(':'); return { kind: c.slice(0, i), text: c.slice(i + 1) }; });
const has = k => cols.some(c => c.kind === k);
const out = [], fix = [];
out.push(`**Triage** — ${r.bank || 'bank not detected'} · mode \`${r.parseMode}\` · ${r.rows} rows · chain ${r.chainRatio == null ? 'n/a' : Math.round(r.chainRatio * 100) + '%'} · reconciled: ${r.reconciled}`);
out.push('', '| Header read as | Text |', '|---|---|'); cols.forEach(c => out.push(`| ${c.kind} | ${c.text} |`));
const unknown = cols.filter(c => c.kind === 'other');
if (!r.bank) fix.push('Bank name not detected — add its name pattern and IFSC prefix to `BANKS` in engine.js.');
if (r.parseMode !== 'table-header' && r.parseMode !== 'merged') fix.push('No column header was recognised (line-pattern mode). Check the header wording against `RE_DATE / RE_DEBIT / RE_CREDIT / RE_BAL / RE_DESC` in engine.js.');
if (!has('date')) fix.push('No date column recognised.');
if (!has('debit') && !has('credit') && !has('amount')) fix.push('No debit / credit / amount column recognised.');
if (!has('balance')) fix.push('No balance column recognised (direction then comes from keywords / signs, so errors are less likely to be caught).');
unknown.forEach(c => { const k = E.classify(c.text); fix.push(`Header "${c.text}" is unclassified (engine says: ${k}). Decide which column it is and add the wording to the matching regex.`); });
if (r.rows === 0) fix.push('0 rows read: the transaction table was not found at all (or the file has no text layer).');
if (r.chainRatio != null && r.chainRatio < 0.99 && r.rows > 0) fix.push(`Only ${Math.round(r.chainRatio * 100)}% of rows reconcile (${r.mismatchRows} mismatched). Likely wrapped narrations, a split header, or unsigned overdraft balances.`);
if (r.ocrUsed) fix.push('OCR was used — the file is probably a scan or re-print; ask for the original bank PDF.');
out.push('', fix.length ? '**Suggested next steps**' : '**No problem found in this report** — the layout looks recognised.', ...fix.map(f => '- ' + f));
out.push('', '_Automated triage. A person should review any change and run `node test.js … test11.js` before release._');
console.log(out.join('\n'));
