(function () {
'use strict';
var E = window.StatementEngine;
var $ = function (s) { return document.querySelector(s); };
var S = { sel: 0, bankOv: {}, groups: [], months: [], strict: false, pwds: [], files: [], seq: 1, worker: null, curEntry: null, busy: false, full: null, stmt: null, report: null, tab: 'ins', showAll: false, q: '', cat: '', dir: '' };
var SHEETS = [
  ['Summary', 'Account details and a month-by-month table: balances, credits, debits, cash, EMIs, bounces, OD/CC use. Latest month first, with average and total.'],
  ['Ratios', 'Month-by-month ratios such as net cash flow, cash share and EMI as a share of income.'],
  ['Daily Balances', 'Closing balance of every day of every month.'],
  ['Own Transfers', 'Money moved between your own accounts, sister concerns and related parties, each with the reason it was treated as internal.'],
  ['Bounces & Penalties', 'Returned cheques / ECS and penal charges.'],
  ['Top Credits', 'The 5 largest credits of each month.'],
  ['Top Debits', 'The 5 largest debits of each month.'],
  ['Recurring Credits', 'Credits that repeat from the same party or of the same kind.'],
  ['Recurring Debits', 'Debits that repeat from the same party or of the same kind.'],
  ['All Transactions', 'Every transaction with category, mode and a balance check.'],
  ['Loans & EMIs', 'Loan instalments by month, lender summary and loan credits.'],
  ['Files Used', 'Each uploaded file, its period, and whether it was verified.'],
  ['Fraud Checks', 'Ten quick checks for suspicious statements and behaviour (Yes / No with counts).'],
  ['Flagged Transactions', 'Individual transactions that deserve a second look.'],
  ['Insights', 'Behaviour score, key numbers and plain-language findings.'],
  ['Parties', 'Every counterparty with credits, debits, net flow, months active and first / last date.'],
  ['File Checks', 'PDF metadata checks and statement integrity checks.']
];
$('#sheetList').innerHTML = SHEETS.map(function (s, i) { return '<div><b>' + (i + 1) + '. ' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');

/* ---------- FAQ (also emitted as FAQPage JSON-LD for search engines) ---------- */
var FAQ = [
 ['What is the YourView Tools Bank Statement Analyzer?', 'It is a free online tool that reads bank statements (PDF, scanned PDF, photos, Excel, LibreOffice, CSV and more) from any bank, rebuilds the transaction table, checks it against the running balance and produces a multi-sheet Excel workbook: Summary (account details and a month-by-month table), Ratios, Daily Balances, Own Transfers, Bounces & Penalties, Top Credits and Top Debits, Recurring Credits and Debits, All Transactions, Loans & EMIs, Files Used, Fraud Checks, Flagged Transactions, Insights and File Checks.'],
 ['Does it spot credits from sister concerns or my other bank accounts?', 'Yes. Credits and debits under the account holder’s own name, from companies whose name starts with the same distinctive word as the holder (probable sister concerns), from parties you list in the “Sister concerns / related parties” box, and from the holder or account number of any other statement you uploaded are treated as internal. They are listed with the reason in the Own Transfers sheet and excluded from net credits. Turn off the auto-detection if a similar name is only a coincidence.'],
 ['The balance check flags a row — can I correct it?', 'Yes. Rows whose printed debit/credit side contradicts the running balance get a “Swap Dr/Cr” button in the Transactions tab, and a one-click option appears when swapping would make them reconcile. Corrected rows carry a MANUAL_FIX flag in the report so the change is always visible.'],
 ['I uploaded several accounts — can I see them together?', 'Yes. When more than one account is uploaded, use “Combined view of all accounts”. It totals credits, debits and average balance across the accounts, sets aside transfers between them, and downloads as its own Excel file.'],
 ['Does the tool send anything about my statements?', 'No statement content ever leaves your device. Only if a file cannot be read properly, an anonymous layout note — the column heading words, the bank name and a few counts, with digits masked and no names, account numbers, amounts or narrations — is sent to the developer so that bank format can be supported. The statement itself, its transactions and your passwords are never sent.'],
 ['A statement is not read properly — what can I do?', 'Use “Report a reading problem” above the results. It saves a small file with only the column headings and counts of that statement — no names, account numbers, amounts or narrations — which you can send to the developer so the bank layout can be supported. You can also fix single rows with “Swap Dr/Cr”.'],
 ['Does it work offline?', 'After your first visit the page and its reading libraries are cached by your browser, so the tool opens and analyses statements even without an internet connection. You can also install it from the browser menu (Install / Add to Home screen).'],
 ['Can I sort and search the tables?', 'Yes. Click any column heading in Transactions or Parties to sort, press / to jump to the search box, and use Copy summary or Print / PDF summary for a one-page overview you can paste into an email or save as PDF.'],
 ['Is it really free?', 'Yes. There is no sign-up, no limit on files and no charge for the Excel download.'],
 ['Are my bank statements uploaded to a server?', 'No. Reading, OCR and analysis all run inside your browser tab on your own device. Your statements are not sent to YourView Tools or anyone else, and everything is discarded when you close or refresh the tab. Only the open-source reading libraries (PDF, Excel and OCR) are downloaded from public CDNs when the page opens.'],
 ['Which banks and statement formats are supported?', 'Any bank, and these file types: PDF (text or scanned), photos (JPG, PNG, WEBP, TIFF), Excel (XLSX, XLSM, XLSB, XLS), LibreOffice / OpenOffice (ODS), CSV, TSV, TXT and HTML tables. The reader does not depend on a fixed template per bank: it detects the table, columns and date format from the document itself, including statements with separate Debit and Credit columns, a single Amount column with Dr/Cr, no header row at all, multi-line narrations and newest-first ordering. It has been designed around Indian bank formats (HDFC, ICICI, SBI, Axis, Kotak, PNB, Bank of Baroda, Canara, Union, IDFC FIRST, Yes, IndusInd, small finance and co-operative banks) as well as international statements.'],
 ['What happens if my PDF is password protected?', 'The tool asks for the password in a pop-up and opens the file inside your browser. The password is never sent anywhere or stored, and a password you enter is tried automatically on your other files in the same session. If the password is wrong you can try again, or skip the file. Password-protected Excel files cannot be opened here — remove the protection in Excel first. Banks usually mention the password format (often a mix of customer ID, date of birth or PAN) in the e-mail that carried the statement.'],
 ['Why did I get a "different account number" error?', 'All files in one report must belong to the same account. The first file sets the account; any later file with another account number (or another bank) is blocked so reports are never mixed. Click "Clear all" to start a fresh report for a different account.'],
 ['How many files can I upload, and in what order?', 'As many as you need for the same account — for example 12 monthly PDFs. Order does not matter; files are sorted by date, and transactions that appear in more than one overlapping file are counted once. If there is a gap between files, you will be told which period is missing.'],
 ['Can it read scanned or photographed statements?', 'Yes. Pages with no text layer are read with OCR inside your browser. For best accuracy use a flat, well-lit scan at 200–300 dpi with straight, uncropped pages. The first OCR run downloads about 10 MB of language data. Every row is verified against the running balance, so misread digits are highlighted instead of slipping through.'],
 ['What does the integrity check mean?', 'Each transaction should satisfy: previous balance + credit − debit = new balance. Rows that fail are highlighted and listed on the "File Checks" and "Flagged Transactions" sheets. A failure usually means a missing page, a misread figure from a poor scan or a column that was merged in the PDF. "Opening + credits − debits = closing" is checked for the whole statement as well.'],
 ['How are salary, EMI and cheque returns detected?', 'By keywords in the narration (for example SALARY, EMI, ECS/NACH, CHQ RETURN, INSUFFICIENT FUNDS) and by patterns: a credit of similar size from the same party every month is treated as probable salary, and a fixed debit repeating monthly through ECS/NACH or to a lender is treated as an EMI. These are intelligent estimates; probable items are marked "PROBABLE_SALARY" so you can check them.'],
 ['What is the behaviour score?', 'An indicative 0–100 score based on the statement alone: cheque/ECS returns, negative-balance days, obligation ratio (FOIR), cash-heavy inflows, balance retention, concentration of inflows, inactive months, two-way flows with the same party and trends. It comes with plain-language findings. It is a reading aid, not a credit decision or a bureau score.'],
 ['What is Turnover?', 'Turnover is total credits minus credits from the account holder’s own name (and sister concerns, related parties or your other uploaded accounts) and minus loan credits. It gives a clear view of the money actually earned through the account. It is shown at the top of the results, in the Monthly tab, in the printable summary and in the Summary sheet of the Excel report. Net credits is a stricter figure that also removes refunds and interest.'],
 ['What are net credits (adjusted turnover)?', 'Net credits are total credits minus money that is not genuine business or income inflow: transfers between your own accounts, loan credits and disbursals, refunds and reversals, and interest. Lenders usually assess turnover on this adjusted figure. It is shown on the Summary Info and Monthly Details sheets next to the gross totals.'],
 ['How are cheque and ECS bounces counted?', 'From the narration of each return entry. An inward return means a cheque drawn on this account came back unpaid; an outward return means a cheque deposited by the account holder came back. The reason (for example insufficient funds, signature mismatch, stale or post-dated) and the return charge debited within three days are shown on the "Cheque & ECS Bounces" sheet. The penalty fee itself is not counted as a second bounce.'],
 ['How do Overdraft and Cash Credit accounts work here?', 'If the statement header shows the sanctioned limit it is picked up automatically; otherwise enter it in the "OD / CC limit" box. The report then shows average and peak limit utilisation and the number of days with a negative balance for every month. Only negative (debit) balances are counted as utilisation, so check that the statement shows debit balances with a minus sign or Dr.'],
 ['What are the Fraud Checks and File Checks sheets?', 'It checks the PDF\'s own metadata for warning signs — for example a file edited with consumer software, created before its last transaction, or modified long after it was created — and repeats the running-balance and duplicate-row checks. These are indicators only and not proof of tampering. A statement you printed or re-saved (such as after removing a password) will show as a re-saved copy, which is informational only.'],
 ['Is this the same as commercial bank statement analyzers?', 'It covers the same kind of analysis — monthly turnover and balances, cash and cheque activity, bounces, obligations, salary, top parties, charges and checks — in a multi-sheet Excel report, but it is an independent free tool, so sheet layouts and some classifications will differ. Always verify key figures against the original statements before taking decisions.'],
 ['How is the average balance calculated?', 'As the average of the end-of-day balance for every calendar day in the period. On days with no transactions the previous day\'s closing balance is carried forward. Monthly averages use the days of that month inside the statement period; balances on the 5th, 10th, 15th, 20th and 25th are also listed.'],
 ['What is FOIR and how is it computed here?', 'FOIR (fixed obligations to income ratio) = monthly EMI/loan outflow ÷ monthly income. Income is the average salary if salary-like credits are found, otherwise the average monthly inflow. Because it is derived from this one account only, treat it as an estimate.'],
 ['Can I analyse only the last 3, 6 or 12 months?', 'Yes. After uploading, use the "Analysis period" selector above the tabs. All figures, charts and the Excel download then cover only that window.'],
 ['How are dates like 03/04/2024 interpreted?', 'As day/month/year, which is the convention used by Indian banks. Where a statement uses month names (03-Apr-2024) or year-first dates (2024-04-03) there is no ambiguity.'],
 ['Does it work on my phone?', 'Yes. The page is responsive and works in current versions of Chrome, Edge, Safari and Firefox. Large statements or OCR are faster on a laptop.'],
 ['Can I rely on it for loan or credit decisions?', 'Use it to save time, not to replace judgement. Always verify key figures against the original statements, especially for scanned files or rows flagged for review.']
];
(function renderFaq() {
  $('#faq').innerHTML = FAQ.map(function (f, i) { return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>'; }).join('');
  var ld = document.createElement('script'); ld.type = 'application/ld+json';
  ld.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(function (f) { return { '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } }; }) });
  document.head.appendChild(ld);
})();

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ---------- helpers ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ind(n) { var s = String(Math.floor(n)); if (s.length > 3) { var last = s.slice(-3), rest = s.slice(0, -3); s = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last; } return s; }
function inr(n) { if (n == null || n === '') return '—'; return (n < 0 ? '-' : '') + '₹' + plain(Math.abs(n)); }
function plain(n) { if (n == null) return ''; var a = Math.abs(n), f = a.toFixed(2).split('.'); return (n < 0 ? '-' : '') + ind(+f[0]) + '.' + f[1]; }
function cmp(n) { var a = Math.abs(n); if (a >= 1e7) return (n / 1e7).toFixed(1) + 'Cr'; if (a >= 1e5) return (n / 1e5).toFixed(1) + 'L'; if (a >= 1e3) return (n / 1e3).toFixed(0) + 'k'; return n.toFixed(0); }
function reportOpts(selfIdx) {
  var o = opts(), rel = ($('#optRelated').value || '').split(/[,\n;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  var other = (S.groups || []).filter(function (g, i) { return i !== (selfIdx == null ? S.sel : selfIdx); }).map(function (g) { var m = g.ref.meta || {}; return { holder: m.holder, accountNo: m.accountNo, bank: m.bank }; });
  return { highValue: o.hv, limit: o.limit, related: rel, sister: $('#optSister').checked, otherAccounts: other };
}
function opts() { return { mode: $('#optMode').value, ocr: $('#optOcr').value, hv: Math.max(0, +$('#optHV').value || 100000), limit: Math.max(0, +$('#optLimit').value || 0) }; }

/* ---------- dialogs (queued so several errors never fight each other) ---------- */
var dq = [];
function showError(title, html) { dq.push({ title: title, html: html }); if (!$('#dlgErr').open) nextDialog(); }
function nextDialog() { var d = dq.shift(); if (!d) return; $('#errTitle').textContent = d.title; $('#errBody').innerHTML = d.html; $('#dlgErr').showModal(); }
$('#errOk').addEventListener('click', function () { $('#dlgErr').close(); setTimeout(nextDialog, 60); });
$('#dlgErr').addEventListener('cancel', function () { setTimeout(nextDialog, 60); });

/* ---------- file intake ---------- */
var drop = $('#drop'), pick = $('#pick');
drop.addEventListener('click', function () { pick.click(); });
drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } });
['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
document.addEventListener('dragover', function (e) { e.preventDefault(); });
document.addEventListener('drop', function (e) { if (!drop.contains(e.target)) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); } });
pick.addEventListener('change', function () { addFiles(pick.files); pick.value = ''; });

function kindOf(name) {
  name = name.toLowerCase();
  if (/\.pdf$/.test(name)) return 'pdf';
  if (/\.(xlsx|xlsm|xlsb|xls|xml|ods|fods|csv|tsv|txt|prn|dif|slk|html?)$/.test(name)) return 'sheet';
  if (/\.(png|jpe?g|webp|bmp|tiff?)$/.test(name)) return 'image';
  return null;
}
var rejections = [], lockedFiles = [], newAccts = [];
function addFiles(list) {
  var skipped = [];
  Array.prototype.forEach.call(list, function (f) {
    var k = kindOf(f.name);
    if (!k) { skipped.push(f.name + ' (unsupported type)'); return; }
    if (S.files.some(function (x) { return x.file.name === f.name && x.file.size === f.size; })) { skipped.push(f.name + ' (already added)'); return; }
    S.files.push({ id: S.seq++, file: f, name: f.name, kind: k, status: 'queued', msg: 'Waiting…', pct: 0, stmt: null });
  });
  renderFiles();
  if (skipped.length) showError('Some files were skipped', '<ul>' + skipped.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>');
  runQueue();
}

async function runQueue() {
  if (S.busy) return;
  S.busy = true;
  try {
    var next;
    while ((next = S.files.filter(function (f) { return f.status === 'queued'; })[0])) await processEntry(next);
  } finally { S.busy = false; }
  refresh();
  if (lockedFiles.length) showLocked(lockedFiles.splice(0));
  if (newAccts.length) showNewAccts(newAccts.splice(0));
  if (rejections.length) showMismatch(rejections.splice(0));
}

async function processEntry(en) {
  S.curEntry = en;
  en.status = 'run'; en.msg = 'Reading…'; en.pct = 2; renderFiles();
  try {
    var stmts = await extractFile(en, false);
    var keep = [], warn = null;
    stmts.forEach(function (stmt) {
      var chk = checkAccount(stmt);
      if (chk.error) { rejections.push({ name: en.name, acct: stmt.meta.accountNo, bank: stmt.meta.bank, refAcct: chk.refAcct, refBank: chk.refBank, refFile: chk.refFile, why: chk.why }); return; }
      if (chk.isNew) newAccts.push({ name: en.name, acct: stmt.meta.accountNo, bank: stmt.meta.bank });
      warn = warn || chk.warn; keep.push(stmt);
    });
    if (stmts.length > 1 && keep.length > 1) newAccts.push({ name: en.name, multi: keep.length, accts: keep.map(function (k) { return k.meta.accountNo; }) });
    if (!keep.length) { S.files = S.files.filter(function (f) { return f.id !== en.id; }); renderFiles(); return; }
    en.stmts = keep; en.stmt = keep[0]; en.status = 'done'; en.pct = 100;
    var total = keep.reduce(function (n, k) { return n + k.txns.length; }, 0);
    var parts = [total + ' transactions'];
    if (keep.length > 1) parts.unshift(keep.length + ' accounts');
    else if (keep[0].from) parts.push(E.fmtDate(keep[0].from) + ' → ' + E.fmtDate(keep[0].to));
    if (keep[0].ocr) parts.push('OCR');
    en.msg = parts.join(' · ');
    en.warn = warn || null;
    if (!total) { en.status = 'error'; en.msg = 'No transactions found in this file'; }
  } catch (err) {
    if (err && err.locked) {
      lockedFiles.push(en.name);
      S.files = S.files.filter(function (f) { return f.id !== en.id; });
      renderFiles();
      return;
    }
    console.error(err);
    en.status = 'error'; en.msg = (err && err.message) || 'Could not read this file'; en.pct = 0;
  }
  renderFiles();
}
function lockedError(msg) { var e = new Error(msg || 'Password-protected file'); e.locked = true; return e; }

function sameGroup(a, b) {
  var x = a.meta || {}, y = b.meta || {};
  var same = E.sameAccount(x.accountNo, y.accountNo, { fuzzy: true });
  if (same === true) return true;
  if (same === false) return false;
  return !x.bank || !y.bank || x.bank === y.bank;
}
function groupsOf() {
  var gs = [];
  S.files.forEach(function (f) {
    if (f.status !== 'done' || !f.stmts) return;
    f.stmts.forEach(function (st) {
      var g = gs.filter(function (g) { return sameGroup(g.ref, st); })[0];
      if (!g) { g = { ref: st, stmts: [] }; gs.push(g); }
      g.stmts.push(st);
    });
  });
  return gs;
}
function checkAccount(stmt) {
  var gs = groupsOf(), m = stmt.meta || {}, warn = null;
  if (!gs.length) return { warn: null };
  var home = gs.filter(function (g) { return sameGroup(g.ref, stmt); })[0];
  if (!home) {
    var ref = gs[0].ref, rm = ref.meta || {};
    if (S.strict) {
      var same = E.sameAccount(rm.accountNo, m.accountNo, { fuzzy: true });
      return { error: true, why: same === false ? 'acct' : 'bank', refAcct: rm.accountNo, refBank: rm.bank, refFile: ref.fileName };
    }
    return { isNew: true };
  }
  var rm2 = home.ref.meta || {};
  if (E.sameAccount(rm2.accountNo, m.accountNo, { fuzzy: true }) === null) warn = 'Account number could not be verified against the other files.';
  return { warn: warn };
}

/* ---------- extraction ---------- */
async function extractFile(en, forceOcrRetry) {
  var o = opts(), f = en.file, pages = [], usedOcr = false, docInfo = null;
  if (en.kind === 'pdf') {
    if (!window.pdfjsLib) throw new Error('PDF engine failed to load. Check your internet connection and reload.');
    var r = await readPdf(en, o.ocr === 'force' || forceOcrRetry, o.ocr === 'off');
    pages = r.pages; usedOcr = r.usedOcr; docInfo = r.docInfo;
  } else if (en.kind === 'sheet') {
    if (!window.XLSX) throw new Error('Spreadsheet engine failed to load. Reload the page.');
    var sh = await readSheet(f); pages = sh.pages; docInfo = sh.docInfo;
  } else {
    pages = [await ocrImageFile(en)]; usedOcr = true; docInfo = { kind: 'image' };
  }
  var stmts = E.parseDocumentMulti(pages, { mode: o.mode, ocr: usedOcr, allowInt: en.kind === 'sheet', fileName: f.name });
  stmts.forEach(function (st) { st.docInfo = docInfo; });
  if (!stmts.some(function (st) { return st.txns.length; }) && en.kind === 'pdf' && !usedOcr && !forceOcrRetry && o.ocr !== 'off') {
    en.msg = 'No text layer found — running OCR…'; renderFiles();
    return extractFile(en, true);
  }
  return stmts;
}

async function readPdf(en, forceOcr, ocrOff) {
  var data = new Uint8Array(await en.file.arrayBuffer());
  var locked = false, tried = 0, pending = null, userTried = false, needed = false;
  var task = pdfjsLib.getDocument({ data: data });
  // Password-protected PDF: try passwords already used this session, then ask the user.
  task.onPassword = async function (update, reason) {
    needed = true;
    try {
      if (tried < S.pwds.length) { update(S.pwds[tried++]); return; }
      var pw = await askPassword(en.name, userTried && reason === 2);
      if (pw == null) { locked = true; task.destroy(); return; }
      userTried = true; pending = pw; update(pw);
    } catch (e) { locked = true; task.destroy(); }
  };
  var doc;
  try { doc = await task.promise; }
  catch (e) {
    if (locked || (e && e.name === 'PasswordException')) throw lockedError('Password-protected PDF — no valid password was provided');
    throw new Error((e && e.message) || 'Invalid or damaged PDF');
  }
  if (pending && S.pwds.indexOf(pending) < 0) S.pwds.push(pending);
  var pages = [], usedOcr = false;
  var docInfo = { kind: 'pdf', pages: doc.numPages, pwd: needed };
  try { var md = await doc.getMetadata(); var inf = (md && md.info) || {}; docInfo.producer = inf.Producer || ''; docInfo.creator = inf.Creator || ''; docInfo.creationRaw = inf.CreationDate || ''; docInfo.modRaw = inf.ModDate || ''; } catch (e) { /* metadata is optional */ }
  var raw = [], totalChars = 0;
  for (var p = 1; p <= doc.numPages; p++) {
    en.msg = 'Reading page ' + p + ' of ' + doc.numPages; en.pct = Math.round(p / doc.numPages * 60); renderFiles();
    var page = await doc.getPage(p), vp = page.getViewport({ scale: 1 }), items = [], chars = 0;
    try {
      var tc = await page.getTextContent();
      tc.items.forEach(function (i) {
        if (!i.str || !i.str.trim()) return;
        chars += i.str.length;
        items.push({ str: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) });
      });
    } catch (e) { items = []; chars = 0; }
    totalChars += chars; raw.push({ page: page, vp: vp, items: items, chars: chars });
  }
  // Statements are normally text PDFs. OCR is only used when the whole file has no text layer (a scan),
  // never for a short page of an otherwise readable statement.
  var scanned = forceOcr || totalChars < 40;
  for (var q = 0; q < raw.length; q++) {
    var r = raw[q];
    if (!scanned) { pages.push(E.groupWords(E.itemsToWords(r.items))); continue; }
    if (ocrOff) { pages.push({ rows: [], charW: 5 }); continue; }
    usedOcr = true;
    var scale = Math.min(3, Math.max(2, 2200 / r.vp.width)), vp2 = r.page.getViewport({ scale: scale });
    var cv = document.createElement('canvas'); cv.width = Math.ceil(vp2.width); cv.height = Math.ceil(vp2.height);
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    await r.page.render({ canvasContext: cx, viewport: vp2 }).promise;
    en.msg = 'OCR page ' + (q + 1) + ' of ' + raw.length + '…'; en.pct = 60 + Math.round((q + 1) / raw.length * 30); renderFiles();
    var words = await ocrCanvas(cv); cv.width = 0;
    pages.push(wordsToPage(words, scale));
  }
  return { pages: pages, usedOcr: usedOcr, docInfo: docInfo };
}

function wordsToPage(words, scale) {
  return E.groupWords(words.map(function (w) {
    return { t: w.text, x0: w.bbox.x0 / scale, x1: w.bbox.x1 / scale, y: (w.bbox.y0 + w.bbox.y1) / 2 / scale, h: (w.bbox.y1 - w.bbox.y0) / scale };
  }).filter(function (w) { return w.t && w.t.trim(); }));
}
async function getWorker() {
  if (S.worker) return S.worker;
  if (!window.Tesseract) throw new Error('OCR engine failed to load. Check your internet connection and reload.');
  S.worker = await Tesseract.createWorker('eng', 1, {
    logger: function (m) {
      var en = S.curEntry;
      if (en && m.status === 'recognizing text') { en.pct = Math.min(95, Math.round(m.progress * 100)); var b = document.querySelector('[data-bar="' + en.id + '"]'); if (b) b.style.width = en.pct + '%'; }
    }
  });
  await S.worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return S.worker;
}
async function ocrCanvas(cv) {
  var w = await getWorker();
  var res = await w.recognize(cv, {}, { blocks: true });
  var d = res.data, words = d.words;
  if (!words || !words.length) {
    words = [];
    (d.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { (l.words || []).forEach(function (x) { words.push(x); }); }); }); });
  }
  return words.filter(function (x) { return x.text && x.text.trim() && x.confidence > 15; });
}
async function ocrImageFile(en) {
  var url = URL.createObjectURL(en.file);
  try {
    var img = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('Could not open image')); }; i.src = url; });
    var scale = img.width < 1600 ? Math.min(3, 2000 / img.width) : 1;
    var cv = document.createElement('canvas'); cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
    en.msg = 'OCR in progress…'; renderFiles();
    return wordsToPage(await ocrCanvas(cv), scale);
  } finally { URL.revokeObjectURL(url); }
}

function cellStr(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) { var d = new Date(v.getTime() + 12 * 3600e3); return ('0' + d.getUTCDate()).slice(-2) + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + d.getUTCFullYear(); }
  if (typeof v === 'number') return String(Number(v.toFixed(2)));
  return String(v);
}
async function readSheet(file) {
  var wb, isText = /\.(csv|tsv|txt|prn)$/i.test(file.name);
  try {
    if (isText) { // text files: read as UTF-8 and keep every value as typed so 01/04/2024 is never re-interpreted
      var txt = await file.text(); if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
      wb = XLSX.read(txt, { type: 'string', raw: true, FS: /\.tsv$/i.test(file.name) ? '\t' : undefined });
    } else wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  }
  catch (e) { if (/password|encrypt/i.test((e && e.message) || '')) throw lockedError('Password-protected workbook'); throw e; }
  var pr = wb.Props || {};
  var pages = wb.SheetNames.map(function (n) {
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
    return E.rowsFromMatrix(rows.map(function (r) { return r.map(cellStr); }));
  });
  return { pages: pages, docInfo: { kind: 'sheet', producer: pr.Application || '', creator: pr.Author || '', creationRaw: pr.CreatedDate ? new Date(pr.CreatedDate).toISOString() : '', modRaw: pr.ModifiedDate ? new Date(pr.ModifiedDate).toISOString() : '' } };
}

/* ---------- file list ---------- */
function renderFiles() {
  var box = $('#files');
  if (!S.files.length) { box.style.display = 'none'; box.innerHTML = ''; $('#reprocess').style.display = 'none'; return; }
  box.style.display = 'block'; $('#reprocess').style.display = '';
  var gsel = S.groups && S.groups[S.sel], first = gsel ? { stmt: gsel.ref } : null;
  var acct = first ? '<div style="font-size:13px;color:var(--mut);margin-bottom:6px">Report account: <b style="color:var(--ink)">' + esc(first.stmt.meta.accountNo) + '</b>' + (first.stmt.meta.bank ? ' · ' + esc(first.stmt.meta.bank) : '') + (S.strict ? ' — only files from this account are accepted.' : '') + '</div>' : '';
  box.innerHTML = acct + S.files.map(function (f) {
    var b = f.status === 'done' ? (f.warn ? '<span class="badge b-warn">Check</span>' : '<span class="badge b-ok">Ready</span>') : f.status === 'error' ? '<span class="badge b-bad">Failed</span>' : f.status === 'run' ? '<span class="badge b-run">Working</span>' : '<span class="badge b-run">Queued</span>';
    return '<div class="frow"><div class="fname"><b>' + esc(f.name) + '</b><span>' + esc(f.msg) + (f.warn ? ' · ' + esc(f.warn) : '') + '</span>' +
      (f.status === 'run' ? '<div class="bar"><i data-bar="' + f.id + '" style="width:' + f.pct + '%"></i></div>' : '') + '</div>' + b +
      '<button class="x" title="Remove" data-rm="' + f.id + '">×</button></div>';
  }).join('');
}
$('#files').addEventListener('click', function (e) {
  var id = e.target.getAttribute && e.target.getAttribute('data-rm');
  if (!id) return;
  S.files = S.files.filter(function (f) { return f.id !== +id; });
  renderFiles(); refresh();
});
$('#reprocess').addEventListener('click', function () {
  S.files.forEach(function (f) { if (f.status !== 'run') { f.status = 'queued'; f.stmt = null; f.stmts = null; f.msg = 'Waiting…'; f.warn = null; } });
  renderFiles(); refresh(); runQueue();
});
$('#clearAll').addEventListener('click', function () { S.files = []; S.sel = 0; S.bankOv = {}; S.keepRange = false; $('#optWin').value = '0'; renderFiles(); refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

var pwdQueue = Promise.resolve();
function askPassword(name, wrong) {
  pwdQueue = pwdQueue.then(function () { return new Promise(function (res) {
    var d = $('#dlgPwd'), inp = $('#pwdIn'), done = false;
    $('#pwdMsg').innerHTML = '<b style="color:var(--ink)">' + esc(name) + '</b> is password protected. Enter its password to read it.';
    $('#pwdBad').style.display = wrong ? 'block' : 'none'; inp.value = '';
    function fin(v) { if (done) return; done = true; $('#pwdForm').removeEventListener('submit', onSub); $('#pwdSkip').removeEventListener('click', onSkip); d.removeEventListener('cancel', onSkip); if (d.open) d.close(); res(v); }
    function onSub(e) { e.preventDefault(); if (!inp.value) { inp.focus(); return; } fin(inp.value); }
    function onSkip(e) { if (e && e.preventDefault) e.preventDefault(); fin(null); }
    $('#pwdForm').addEventListener('submit', onSub); $('#pwdSkip').addEventListener('click', onSkip); d.addEventListener('cancel', onSkip);
    if (!d.open) d.showModal(); setTimeout(function () { inp.focus(); }, 50);
  }); });
  return pwdQueue;
}
function showLocked(names) {
  showError('Password-protected file' + (names.length > 1 ? 's' : ''),
    '<p style="margin:0 0 6px;color:var(--mut)">This file is password protected and was not added (no valid password was provided, or it is an Excel file, which must be unprotected first):</p><ul>' + names.map(function (n) { return '<li><b>' + esc(n) + '</b></li>'; }).join('') + '</ul>' +
    '<p style="margin:8px 0 4px;color:var(--mut)"><b style="color:var(--ink)">To fix it:</b> remove the password and upload again.</p>' +
    '<ol><li>Open the PDF with its password in Chrome or Adobe Reader.</li><li>Choose <b>Print → Save as PDF</b> and save the copy.</li><li>Upload the new copy here.</li></ol>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:14px">Your bank usually mentions the password format (often built from customer ID, date of birth or PAN) in the e-mail that carried the statement, or you can ask the bank for an unprotected copy.</p>');
}
function showNewAccts(list) {
  var html = '<p style="margin:0 0 6px;color:var(--mut)">These uploads contain a <b style="color:var(--ink)">different account or bank</b>. They were added as separate accounts — pick the one to analyse in the <b>Account / statement set</b> box. Each report covers one account.</p><ul>';
  list.forEach(function (r) {
    html += '<li><b>' + esc(r.name) + '</b><br>' + (r.multi ? 'Contains ' + r.multi + ' accounts: ' + esc(r.accts.join(', ')) : 'A/c ' + esc(r.acct || 'not detected') + (r.bank ? ' · ' + esc(r.bank) : '')) + '</li>';
  });
  html += '</ul><p style="margin:6px 0 0;color:var(--mut);font-size:14px">To block files from other accounts instead, tick “Reject files from a different account”.</p>';
  showError('Different accounts detected', html);
}
function showMismatch(list) {
  var html = '<p style="margin:0 0 6px;color:var(--mut)">These files belong to a <b style="color:var(--ink)">different account</b> and were not added. One report can contain statements of a single account only.</p><ul>';
  list.forEach(function (r) {
    html += '<li><b>' + esc(r.name) + '</b><br>' + (r.why === 'bank'
      ? 'Bank: ' + esc(r.bank || '—') + ' (report is for ' + esc(r.refBank) + ')'
      : 'A/c ' + esc(r.acct || '—') + ' · report account is ' + esc(r.refAcct || '—') + (r.refFile ? ' (from ' + esc(r.refFile) + ')' : '')) + '</li>';
  });
  html += '</ul><p style="margin:6px 0 0;color:var(--mut);font-size:14px">To analyse the other account, click “Clear all” and upload its statements separately.</p>';
  showError('Different account number detected', html);
}

/* ---------- merge + render ---------- */
function refresh() {
  var gs = groupsOf(); S.groups = gs;
  if (!gs.length) { S.full = S.stmt = S.report = null; $('#results').style.display = 'none'; $('#selPanel').style.display = 'none'; return; }
  if (S.sel >= gs.length) S.sel = 0;
  var g = gs[S.sel], stmts = g.stmts;
  var m = stmts.length === 1 ? stmts[0] : E.mergeStatements(stmts);
  if (stmts.length > 1) stmts.forEach(function (s) { s.warnings.forEach(function (w) { if (/No readable text/.test(w)) m.warnings.push(s.fileName + ': ' + w); }); });
  var key = g.ref.meta.accountNo || ('file:' + g.ref.fileName), ov = S.bankOv[key];
  if (ov) m = Object.assign({}, m, { meta: Object.assign({}, m.meta, { bank: ov }) });
  var fx = S.fixes[key]; if (fx && fx.length) m = E.applyFixes(m, fx);
  S.full = m; S.curKey = key;
  maybeAutoReport(m);
  renderSel(g);
  applyWindow();
}
function monthKeys(stm) { var seen = {}, out = []; stm.txns.forEach(function (t) { var k = t.date.slice(0, 7); if (!seen[k]) { seen[k] = 1; out.push(k); } }); return out; }
function monLabel(k) { return E.monthLabel(k); }
function renderSel(g) {
  var gs = S.groups;
  $('#selPanel').style.display = 'block';
  $('#selAcct').innerHTML = gs.map(function (x, i) {
    var me = x.ref.meta || {}, n = x.stmts.reduce(function (a, b) { return a + b.txns.length; }, 0);
    var lab = (me.bank || 'Bank not detected') + ' · A/c ' + (me.accountNo || 'not detected') + (me.holder ? ' · ' + me.holder : '') + ' · ' + n + ' txns';
    return '<option value="' + i + '"' + (i === S.sel ? ' selected' : '') + '>' + esc(lab) + '</option>';
  }).join('');
  var det = (g.ref.meta || {}).bank || '';
  var ov = S.bankOv[S.curKey] || '';
  $('#selBank').innerHTML = '<option value="">' + (det ? 'Auto-detected: ' + esc(det) : 'Not detected — choose bank') + '</option>' + E.bankNames.concat(['Other']).map(function (b) { return '<option' + (b === ov ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('');
  var ms = monthKeys(S.full); S.months = ms;
  var fo = $('#selFrom').value, to = $('#selTo').value;
  if (S.keepRange && ms.indexOf(fo) >= 0 && ms.indexOf(to) >= 0) { /* keep */ } else { fo = ms[0]; to = ms[ms.length - 1]; }
  var opt = function (sel) { return ms.map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + monLabel(k) + '</option>'; }).join(''); };
  $('#selFrom').innerHTML = opt(fo); $('#selTo').innerHTML = opt(to);
  S.keepRange = false;
  $('#btnCombo').style.display = gs.length > 1 ? '' : 'none'; if (gs.length < 2) $('#comboSec').style.display = 'none';
  $('#selHint').textContent = gs.length > 1 ? gs.length + ' accounts uploaded — the report and Excel cover the selected account and period only.' : 'Pick a bank or a custom period, or use “Analysis period” for the last 3 / 6 / 12 months.';
}
function applyWindow() {
  if (!S.full) return;
  var n = +$('#optWin').value || 0;
  var ms = S.months, fo = $('#selFrom').value, to = $('#selTo').value;
  if (fo && to && fo > to) { var tmp = fo; fo = to; to = tmp; }
  var custom = ms.length && fo && to && (fo !== ms[0] || to !== ms[ms.length - 1]);
  S.stmt = custom ? E.rangeStatement(S.full, fo, to) : E.windowStatement(S.full, n);
  S.report = E.buildReport(S.stmt, reportOpts());
  S.showAll = false;
  $('#results').style.display = 'block';
  var cats = {}; S.stmt.txns.forEach(function (t) { cats[t.cat] = 1; });
  if (S.cat && !cats[S.cat]) S.cat = '';
  $('#fcat').innerHTML = '<option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) { return '<option' + (c === S.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  renderResults();
}
['optRelated', 'optSister'].forEach(function (id) { $('#' + id).addEventListener('change', function () { if (S.full) applyWindow(); }); });
$('#optWin').addEventListener('change', function () { if (S.months.length) { $('#selFrom').value = S.months[0]; $('#selTo').value = S.months[S.months.length - 1]; } applyWindow(); });
$('#selFrom').addEventListener('change', function () { $('#optWin').value = '0'; applyWindow(); });
$('#selTo').addEventListener('change', function () { $('#optWin').value = '0'; applyWindow(); });
$('#selAcct').addEventListener('change', function () { S.sel = +this.value || 0; $('#optWin').value = '0'; S.keepRange = false; refresh(); renderFiles(); });
$('#selBank').addEventListener('change', function () { if (this.value) S.bankOv[S.curKey] = this.value; else delete S.bankOv[S.curKey]; S.keepRange = true; refresh(); });
$('#optStrict').addEventListener('change', function () { S.strict = this.checked; renderFiles(); });
$('#optLimit').addEventListener('change', applyWindow);
$('#optHV').addEventListener('change', applyWindow);

function renderResults() {
  var m = S.stmt, r = S.report, me = m.meta || {}, ins = r.insights;
  var fields = [['Account holder', me.holder], ['Bank', me.bank], ['Account no.', me.accountNo], ['Account type', me.accountType], ['IFSC', me.ifsc], ['Branch', me.branch], ['Limit (OD / CC)', r.limit ? inr(r.limit) : ''], ['Period', m.from ? E.fmtDate(m.from) + ' → ' + E.fmtDate(m.to) + (typeof m.windowed === 'number' ? ' (last ' + m.windowed + ' months)' : (m.windowed === 'range' ? ' (selected period)' : '')) : ''], ['Files', S.files.filter(function (f) { return f.status === 'done'; }).length + ' · ' + m.txns.length + ' transactions']];
  $('#acct').innerHTML = fields.map(function (f) { return '<div><small>' + f[0] + '</small><b>' + esc(f[1] || '—') + '</b></div>'; }).join('');
  var st = [
    ['Opening balance', inr(m.opening), ''], ['Total credits', inr(m.totalCredits), m.countCredits + ' entries'], ['Total debits', inr(m.totalDebits), m.countDebits + ' entries'], ['Closing balance', inr(m.closing), ''],
    ['Turnover', inr(r.turnover.amount), 'credits ' + inr(r.turnover.total) + ' − own / related ' + inr(r.turnover.internal) + ' − loan ' + inr(r.turnover.loan)],
    ['Average daily balance', inr(r.abb), 'min ' + inr(r.minBal)], ['Net credits', inr(r.netCr), 'excl. own transfers, loans, refunds, interest'], ['Cheque / ECS returns', String(r.bounces), ''], ['Behaviour score', ins.score + ' / 100', ins.grade], ['EMI / loan debits', String(r.emis), ins.foir == null ? '' : 'FOIR ' + Math.round(ins.foir * 100) + '%']
  ];
  var od = r.od;
  function utilBar(p) { var c = p > 100 ? 'var(--bad)' : (p > 90 ? 'var(--amber)' : 'var(--accent)'); return '<div class="bar"><i style="width:' + Math.min(100, Math.max(0, p)) + '%;background:' + c + '"></i></div>'; }
  if (od && od.limit > 0) {
    st.push(['OD / CC utilisation (average)', (od.avgPct || 0).toFixed(1) + '%', 'of ' + inr(od.limit) + ' limit · ' + od.overdrawnDays + ' overdrawn day' + (od.overdrawnDays === 1 ? '' : 's'), utilBar(od.avgPct || 0)]);
    st.push(['Peak utilisation', (od.peakPct || 0).toFixed(1) + '%', od.peakAmt > 0 ? inr(od.peakAmt) + ' on ' + E.fmtDate(od.peakDate) : 'never overdrawn', utilBar(od.peakPct || 0)]);
    st.push(['Utilisation at statement end', (od.currentPct || 0).toFixed(1) + '%', od.interest > 0 ? 'interest debited ' + inr(od.interest) : '', utilBar(od.currentPct || 0)]);
  }
  $('#stats').innerHTML = st.map(function (s) { return '<div class="stat"><small>' + s[0] + '</small><b>' + s[1] + '</b>' + (s[2] ? '<em>' + esc(s[2]) + '</em>' : '') + (s[3] || '') + '</div>'; }).join('');
  var q = '';
  if (m.reconciled === true && (m.chainRatio == null || m.chainRatio >= 0.99)) q += '<div class="note ok">✔ Integrity check passed — opening + credits − debits = closing, and every running balance reconciles.</div>';
  else if (m.reconciled === false || (m.chainRatio != null && m.chainRatio < 0.99)) q += '<div class="note warn">⚠ Some rows do not reconcile with the running balance' + (m.chainRatio != null ? ' (' + Math.round(m.chainRatio * 100) + '% verified)' : '') + '. Highlighted rows need review — see the “File Checks” and “Flagged Transactions” sheets.</div>';
  if (od && od.needLimit) q += '<div class="note warn">This looks like an overdraft / cash-credit account' + (od.overdrawnDays ? ' (balance was overdrawn on ' + od.overdrawnDays + ' day' + (od.overdrawnDays === 1 ? '' : 's') + ')' : '') + ', but no sanctioned limit was found in the statement. Enter it in the “OD / CC limit” box above to see the utilisation %.</div>';
  if (od && od.limit > 0 && od.limitFrom === 'narration') q += '<div class="note ok">The limit of ' + inr(od.limit) + ' was read from the statement entries. If it is different, type the correct limit in the “OD / CC limit” box above.</div>';
  if (od && od.overLimit) q += '<div class="note warn">⚠ The balance went beyond the sanctioned limit (peak overdrawn ' + inr(od.peakAmt) + ' vs limit ' + inr(od.limit) + ').</div>';
  var internal = m.txns.filter(function (t) { return t.rel && t.credit > 0; }), iA = internal.reduce(function (a, t) { return a + t.credit; }, 0), kinds = {};
  internal.forEach(function (t) { var k = t.tags.indexOf('SISTER_CONCERN') >= 0 ? 'probable sister concern' : t.tags.indexOf('RELATED_PARTY') >= 0 ? 'party you listed' : t.tags.indexOf('OWN_OTHER_BANK') >= 0 ? 'your other bank account' : 'own name'; kinds[k] = (kinds[k] || 0) + 1; });
  if (internal.length) q += '<div class="note ok">' + internal.length + ' credit' + (internal.length === 1 ? '' : 's') + ' worth ' + inr(iA) + ' came from your own name, sister concerns or your other accounts and ' + (internal.length === 1 ? 'is' : 'are') + ' treated as internal (' + Object.keys(kinds).map(function (k) { return kinds[k] + ' ' + k; }).join(', ') + '). They are listed with the reason in the “Own Transfers” sheet and left out of net credits.</div>';
  var cands = E.swapCandidates(m), nfix = (S.fixes[S.curKey] || []).length;
  if (cands.length) q += '<div class="note warn">' + cands.length + ' row' + (cands.length === 1 ? '' : 's') + ' would reconcile if debit and credit were swapped. <button class="btn alt sm" id="autoFix">Swap ' + (cands.length === 1 ? 'it' : 'them') + '</button> You can also swap single rows in the Transactions tab (filter “Balance mismatch”).</div>';
  if (nfix) q += '<div class="note ok">' + nfix + ' row' + (nfix === 1 ? ' was' : 's were') + ' corrected by hand and flagged MANUAL_FIX in the report. <button class="btn alt sm" id="undoFix">Undo all fixes</button></div>';
  m.warnings.forEach(function (w) { q += '<div class="note warn">' + esc(w) + '</div>'; });
  $('#quality').innerHTML = q;
  var tabs = [['ins', 'Insights'], ['txn', 'Transactions'], ['mon', 'Monthly'], ['cat', 'Categories'], ['cr', 'Top credits'], ['dr', 'Top debits'], ['par', 'Parties']];
  $('#tabs').innerHTML = tabs.map(function (t) { return '<button class="tab' + (S.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('');
  renderTab();
}
$('#tabs').addEventListener('click', function (e) { var t = e.target.getAttribute('data-t'); if (t) { S.tab = t; S.showAll = false; renderResults(); } });
function toggleFix(keys) {
  var arr = S.fixes[S.curKey] = S.fixes[S.curKey] || [];
  keys.forEach(function (k) { var i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); else arr.push(k); });
  S.keepRange = true; refresh();
}
$('#tabBody').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-fix]'); if (b) toggleFix([b.getAttribute('data-fix')]); });
$('#quality').addEventListener('click', function (e) {
  if (e.target.id === 'autoFix') toggleFix(E.swapCandidates(S.stmt));
  if (e.target.id === 'undoFix') { S.fixes[S.curKey] = []; S.keepRange = true; refresh(); }
});
$('#fq').addEventListener('input', function () { S.q = this.value; S.showAll = false; renderTab(); });
$('#fcat').addEventListener('change', function () { S.cat = this.value; S.showAll = false; renderTab(); });
$('#fdir').addEventListener('change', function () { S.dir = this.value; S.showAll = false; renderTab(); });

/* ---------- charts (inline SVG, themed with CSS variables) ---------- */
function barChart(months) {
  var W = 720, H = 250, L = 52, B = 30, T = 12, R = 8, pw = W - L - R, ph = H - T - B;
  var mx = Math.max.apply(null, months.map(function (x) { return Math.max(x.crA, x.drA); }).concat([1]));
  var g = '', i, gw = pw / months.length, bw = Math.min(26, gw / 2.6);
  for (i = 0; i <= 3; i++) { var y = T + ph - ph * i / 3; g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + cmp(mx * i / 3) + '</text>'; }
  months.forEach(function (x, k) {
    var cx = L + gw * k + gw / 2, hc = ph * x.crA / mx, hd = ph * x.drA / mx;
    g += '<rect class="c-cr" x="' + (cx - bw - 1) + '" y="' + (T + ph - hc) + '" width="' + bw + '" height="' + Math.max(hc, 0.5) + '" rx="3"><title>' + x.label + ' credits ' + inr(x.crA) + '</title></rect>';
    g += '<rect class="c-dr" x="' + (cx + 1) + '" y="' + (T + ph - hd) + '" width="' + bw + '" height="' + Math.max(hd, 0.5) + '" rx="3"><title>' + x.label + ' debits ' + inr(x.drA) + '</title></rect>';
    if (months.length <= 14 || k % 2 === 0) g += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle">' + x.label.replace('-20', ' ') + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Monthly credits and debits">' + g + '</svg><div class="legend"><span><i class="c-cr"></i>Credits</span><span><i class="c-dr"></i>Debits</span></div>';
}
function lineChart(daily) {
  if (daily.length < 2) return '<div class="empty">Not enough balance data for a chart.</div>';
  var W = 720, H = 230, L = 52, B = 28, T = 12, R = 8, pw = W - L - R, ph = H - T - B;
  var step = Math.max(1, Math.ceil(daily.length / 260)), pts = daily.filter(function (d, i) { return i % step === 0 || i === daily.length - 1; });
  var vals = pts.map(function (p) { return p[1]; }), mn = Math.min.apply(null, vals.concat([0])), mx = Math.max.apply(null, vals), span = (mx - mn) || 1;
  function X(i) { return L + pw * i / (pts.length - 1); }
  function Y(v) { return T + ph - ph * (v - mn) / span; }
  var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
  var g = '', i;
  for (i = 0; i <= 3; i++) { var v = mn + span * i / 3, y = Y(v); g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + cmp(v) + '</text>'; }
  g += '<path class="c-ar" d="' + d + ' L' + X(pts.length - 1) + ' ' + Y(mn) + ' L' + L + ' ' + Y(mn) + ' Z"/><path class="c-ln" d="' + d + '"/>';
  [0, .25, .5, .75, 1].forEach(function (f) { var k = Math.round((pts.length - 1) * f); g += '<text x="' + X(k) + '" y="' + (H - 8) + '" text-anchor="' + (f === 0 ? 'start' : f === 1 ? 'end' : 'middle') + '">' + E.fmtDate(pts[k][0]).slice(0, 6) + '</text>'; });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily balance">' + g + '</svg>';
}

function insightsHtml(r) {
  var ins = r.insights, cls = ins.score >= 80 ? 'ok' : (ins.score >= 60 ? 'warn' : 'bad'), C = 2 * Math.PI * 70;
  var LV = { high: 'HIGH', med: 'MEDIUM', low: 'LOW', info: 'INFO', good: 'POSITIVE' };
  var h = '<div class="ins-top"><div class="ring"><svg width="170" height="170" viewBox="0 0 170 170"><circle class="bg" cx="85" cy="85" r="70"/><circle class="fg ' + cls + '" cx="85" cy="85" r="70" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - ins.score / 100)).toFixed(1) + '"/></svg><div class="mid"><b>' + ins.score + '</b><span>' + esc(ins.grade) + '</span></div></div>' +
    '<div><h3 style="margin:0 0 6px;font-size:18px">Statement behaviour: ' + esc(ins.grade) + '</h3><div style="color:var(--mut);font-size:14.5px">An indicative reading of this account’s conduct — returns, overdrafts, obligations, cash dependence, balance retention and inflow quality. It is not a credit decision.</div></div></div>';
  h += '<h3 class="sec">Findings</h3>' + (ins.flags.length ? ins.flags.map(function (f) { return '<div class="flag"><span class="lvl l-' + f.level + '">' + LV[f.level] + '</span><div><b>' + esc(f.title) + '</b><span>' + esc(f.detail) + '</span></div></div>'; }).join('') : '<div class="empty">Nothing notable found.</div>');
  h += '<h3 class="sec">Key metrics</h3><div class="mgrid">' + ins.metrics.map(function (m) { var v = m[2] === 'inr' ? inr(m[1]) : (m[2] === 'n' ? String(m[1]) : esc(m[1])); return '<div><small>' + esc(m[0]) + '</small><b>' + v + '</b></div>'; }).join('') + '</div>';
  h += '<h3 class="sec">Monthly credits vs debits</h3><div class="chart">' + barChart(r.monthly) + '</div>';
  h += '<h3 class="sec">Daily balance</h3><div class="chart">' + lineChart(r.daily) + '</div>';
  if (ins.circ.length) h += '<h3 class="sec">Parties on both sides (for review)</h3><table><thead><tr><th>Party</th><th class="n">Credits</th><th class="n">Debits</th></tr></thead><tbody>' + ins.circ.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + plain(x.cr) + '</td><td class="n">' + plain(x.dr) + '</td></tr>'; }).join('') + '</tbody></table>';
  h += '<p class="disc">Scores and flags are produced automatically from the statement alone and may include estimates (for example probable salary). Verify against source documents.</p>';
  return h;
}


/* ---------- sortable tables ---------- */
S.sort = S.sort || {}; S.fixes = S.fixes || {};
function sortBy(tab, arr, getters) {
  var so = S.sort[tab]; if (!so || !getters[so.k]) return arr;
  var g = getters[so.k], d = so.d;
  return arr.slice().sort(function (a, b) { var x = g(a), y = g(b); if (x == null) x = ''; if (y == null) y = ''; return (x < y ? -1 : x > y ? 1 : 0) * d; });
}
function th(tab, key, label, cls) {
  var so = S.sort[tab], on = so && so.k === key;
  return '<th class="srt' + (cls ? ' ' + cls : '') + (on ? ' on' : '') + '" data-sort="' + tab + ':' + key + '" aria-sort="' + (on ? (so.d > 0 ? 'ascending' : 'descending') : 'none') + '" tabindex="0">' + label + '<i>' + (on ? (so.d > 0 ? '▲' : '▼') : '↕') + '</i></th>';
}
function toggleSort(spec) {
  var a = spec.split(':'), cur = S.sort[a[0]];
  S.sort[a[0]] = cur && cur.k === a[1] ? { k: a[1], d: -cur.d } : { k: a[1], d: (a[1] === 'name' || a[1] === 'date' || a[1] === 'n') ? 1 : -1 };
  S.showAll = false; renderTab();
}
$('#tabBody').addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-sort]'); if (t) toggleSort(t.getAttribute('data-sort')); });
$('#tabBody').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { var t = e.target.closest && e.target.closest('[data-sort]'); if (t) { e.preventDefault(); toggleSort(t.getAttribute('data-sort')); } } });
var TXG = { n: function (t) { return t.n; }, date: function (t) { return t.date + ' ' + String(t.n).padStart(7, '0'); }, desc: function (t) { return (t.desc || '').toLowerCase(); }, cat: function (t) { return t.cat || ''; }, debit: function (t) { return t.debit || 0; }, credit: function (t) { return t.credit || 0; }, bal: function (t) { return t.balance == null ? -1e15 : t.balance; } };
var PAG = { name: function (o) { return o.name; }, crA: function (o) { return o.crA; }, drA: function (o) { return o.drA; }, net: function (o) { return o.net; }, vol: function (o) { return o.vol; }, months: function (o) { return o.months; }, last: function (o) { return o.last; } };

function filtered() {
  var q = S.q.trim().toLowerCase();
  return S.stmt.txns.filter(function (t) {
    if (S.cat && t.cat !== S.cat) return false;
    if (S.dir === 'D' && !(t.debit > 0)) return false;
    if (S.dir === 'C' && !(t.credit > 0)) return false;
    if (S.dir === 'X' && !t.tags.length) return false;
    if (S.dir === 'M' && t.chainOk !== false) return false;
    if (q && (t.desc + ' ' + t.cpty + ' ' + t.ref + ' ' + t.cat).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
function renderTab() {
  var m = S.stmt, r = S.report, h = '', tb = $('#tabBody');
  $('#filters').style.display = (S.tab === 'txn' || S.tab === 'par') ? 'flex' : 'none';
  $('#fcat').style.display = $('#fdir').style.display = S.tab === 'txn' ? '' : 'none';
  tb.classList.toggle('free', S.tab === 'ins');
  if (S.tab === 'ins') h = insightsHtml(r);
  else if (S.tab === 'txn') {
    var list = sortBy('txn', filtered(), TXG), lim = S.showAll ? list.length : Math.min(300, list.length);
    $('#fcnt').textContent = list.length === m.txns.length ? m.txns.length + ' transactions' : list.length + ' of ' + m.txns.length;
    h = '<table><thead><tr>' + th('txn', 'n', '#') + th('txn', 'date', 'Date') + th('txn', 'desc', 'Narration') + th('txn', 'cat', 'Category') + th('txn', 'debit', 'Debit', 'n') + th('txn', 'credit', 'Credit', 'n') + th('txn', 'bal', 'Balance', 'n') + '<th></th></tr></thead><tbody>';
    for (var i = 0; i < lim; i++) {
      var t = list[i];
      h += '<tr' + (t.chainOk === false ? ' class="bad" title="Balance mismatch ' + t.diff + '"' : '') + '><td>' + t.n + '</td><td>' + E.fmtDate(t.date) + '</td><td class="d">' + esc(t.desc) + (t.tags.length ? '<br>' + t.tags.map(function (g) { return '<span class="tag">' + esc(g) + '</span>'; }).join('') : '') + '</td><td><span class="cat">' + esc(t.cat) + '</span><br><span class="cat">' + esc(t.mode) + '</span></td><td class="n">' + (t.debit > 0 ? plain(t.debit) : '') + '</td><td class="n">' + (t.credit > 0 ? plain(t.credit) : '') + '</td><td class="n">' + (t.balance == null ? '' : plain(t.balance)) + '</td><td class="fx">' + (t.tags.indexOf('MANUAL_FIX') >= 0 ? '<button class="btn alt sm" data-fix="' + esc(E.txnKey(t)) + '" title="Put this row back as printed">Undo fix</button>' : (t.chainOk === false ? '<button class="btn alt sm" data-fix="' + esc(E.txnKey(t)) + '" title="Debit and credit swapped — use if the printed side is wrong">Swap Dr/Cr</button>' : '')) + '</td></tr>';
    }
    h += '</tbody></table>';
    if (!list.length) h = '<div class="empty">No transactions match these filters.</div>';
    if (lim < list.length) h += '<div class="more"><button class="btn alt sm" id="showAll">Show all ' + list.length + ' rows</button></div>';
  } else if (S.tab === 'mon') {
    h = '<table><thead><tr><th>Month</th><th class="n">Txns</th><th class="n">Credits</th><th class="n">Turnover</th><th class="n">Debits</th><th class="n">Avg daily bal</th><th class="n">Min bal</th><th class="n">Closing</th><th class="n">Returns</th><th class="n">Cash dep.</th><th class="n">EMI</th></tr></thead><tbody>';
    r.monthly.forEach(function (x) { h += '<tr><td>' + x.label + '</td><td class="n">' + x.n + '</td><td class="n">' + plain(x.crA) + '</td><td class="n"><b>' + plain(x.turnA) + '</b></td><td class="n">' + plain(x.drA) + '</td><td class="n">' + (x.adb == null ? '' : plain(x.adb)) + '</td><td class="n">' + (x.minB == null ? '' : plain(x.minB)) + '</td><td class="n">' + (x.closeB == null ? '' : plain(x.closeB)) + '</td><td class="n">' + (x.inwN + x.outN + x.retN) + '</td><td class="n">' + plain(x.cashDepA) + '</td><td class="n">' + plain(x.emiA) + '</td></tr>'; });
    h += '</tbody></table>';
  } else if (S.tab === 'cat') {
    var maxD = Math.max.apply(null, r.cats.map(function (c) { return c.drA; }).concat([1])), maxC = Math.max.apply(null, r.cats.map(function (c) { return c.crA; }).concat([1]));
    h = '<table><thead><tr><th>Category</th><th class="n">Debits</th><th>Share</th><th class="n">Credits</th><th>Share</th></tr></thead><tbody>';
    r.cats.forEach(function (c) { h += '<tr><td>' + esc(c.name) + '</td><td class="n">' + (c.drA ? plain(c.drA) : '') + '</td><td style="width:18%">' + (c.drA ? '<span class="catbar" style="width:' + Math.max(2, Math.round(c.drA / maxD * 100)) + '%"></span>' : '') + '</td><td class="n">' + (c.crA ? plain(c.crA) : '') + '</td><td style="width:18%">' + (c.crA ? '<span class="catbar cr" style="width:' + Math.max(2, Math.round(c.crA / maxC * 100)) + '%"></span>' : '') + '</td></tr>'; });
    h += '</tbody></table>';
  } else if (S.tab === 'par') {
    var q2 = S.q.trim().toLowerCase(), pl = (r.parties || []).filter(function (o) { return !q2 || o.name.toLowerCase().indexOf(q2) >= 0; });
    pl = sortBy('par', pl, PAG);
    $('#fcnt').textContent = pl.length === (r.parties || []).length ? pl.length + ' parties' : pl.length + ' of ' + r.parties.length;
    var pm = S.showAll ? pl.length : Math.min(300, pl.length);
    h = '<table><thead><tr><th>#</th>' + th('par', 'name', 'Party') + th('par', 'crA', 'Credits', 'n') + th('par', 'drA', 'Debits', 'n') + th('par', 'net', 'Net', 'n') + th('par', 'months', 'Months', 'n') + th('par', 'last', 'Last', 'n') + '</tr></thead><tbody>';
    for (var pi = 0; pi < pm; pi++) { var o2 = pl[pi]; h += '<tr><td>' + (pi + 1) + '</td><td>' + esc(o2.name) + (o2.self ? ' <span class="tag">own</span>' : '') + '</td><td class="n">' + (o2.crA ? plain(o2.crA) + ' <small>×' + o2.crN + '</small>' : '') + '</td><td class="n">' + (o2.drA ? plain(o2.drA) + ' <small>×' + o2.drN + '</small>' : '') + '</td><td class="n">' + plain(o2.net) + '</td><td class="n">' + o2.months + '</td><td class="n">' + E.fmtDate(o2.last) + '</td></tr>'; }
    h += '</tbody></table>';
    if (!pl.length) h = '<div class="empty">No counterparties found.</div>';
    if (pm < pl.length) h += '<div class="more"><button class="btn alt sm" id="showAll">Show all ' + pl.length + ' parties</button></div>';
  } else {
    var arr = S.tab === 'cr' ? r.topC : r.topD;
    h = '<table><thead><tr><th>#</th><th>Counterparty</th><th class="n">Txns</th><th class="n">Amount</th><th class="n">First</th><th class="n">Last</th></tr></thead><tbody>';
    arr.forEach(function (o, i) { h += '<tr><td>' + (i + 1) + '</td><td>' + esc(o.name) + '</td><td class="n">' + o.n + '</td><td class="n">' + plain(o.amt) + '</td><td class="n">' + E.fmtDate(o.first) + '</td><td class="n">' + E.fmtDate(o.last) + '</td></tr>'; });
    if (!arr.length) h += '<tr><td colspan="6">No counterparties identified.</td></tr>';
    h += '</tbody></table>';
  }
  tb.innerHTML = h;
  var sa = $('#showAll'); if (sa) sa.addEventListener('click', function () { S.showAll = true; renderTab(); });
}

/* ---------- export ---------- */
function baseName() {
  var me = S.stmt.meta || {}, a = (me.accountNo || '').replace(/[^0-9A-Z]/gi, '').slice(-4);
  return ('YourViewTools_' + (me.bank || 'Bank').replace(/[^A-Za-z0-9]+/g, '') + (a ? '_' + a : '') + '_' + (S.stmt.from || '') + '_' + (S.stmt.to || '')).replace(/_+$/, '');
}
$('#dlXlsx').addEventListener('click', function () {
  if (!S.stmt) return;
  var rep = E.buildReport(S.stmt, reportOpts());
  var bytes = YVXlsx.build(rep.workbook.map(function (sh) { return { name: sh.name, rows: sh.rows, widths: sh.widths, merges: sh.merges, freeze: sh.freeze, filter: sh.filter, grid: sh.grid, tab: sh.tab }; }));
  var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = baseName() + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
});
$('#dlCsv').addEventListener('click', function () {
  if (!S.stmt) return;
  function q(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var lines = [['Sl', 'Date', 'Value Date', 'Ref', 'Narration', 'Mode', 'Category', 'Debit', 'Credit', 'Balance'].join(',')];
  S.stmt.txns.forEach(function (t) { lines.push([t.n, t.date, t.valueDate, q(t.ref), q(t.desc), t.mode, q(t.cat), t.debit || '', t.credit || '', t.balance == null ? '' : t.balance].join(',')); });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
  a.download = baseName() + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
});


/* ---------- v2: summary (copy / print) ---------- */
function summaryData() {
  var m = S.stmt, r = S.report, me = m.meta || {}, od = r.od, ins = r.insights;
  var rows = [['Account holder', me.holder], ['Bank', me.bank], ['Account no.', me.accountNo], ['Account type', me.accountType],
    ['Period', E.fmtDate(m.from) + ' to ' + E.fmtDate(m.to)], ['Opening balance', inr(m.opening)], ['Closing balance', inr(m.closing)],
    ['Total credits', inr(m.totalCredits) + ' (' + m.countCredits + ' entries)'], ['Total debits', inr(m.totalDebits) + ' (' + m.countDebits + ' entries)'],
    ['Average daily balance', inr(r.abb)], ['Minimum balance', inr(r.minBal)], ['Turnover (credits excl. own-name / related & loan)', inr(r.turnover.amount) + '  [' + inr(r.turnover.total) + ' − ' + inr(r.turnover.internal) + ' own/related − ' + inr(r.turnover.loan) + ' loan]'], ['Net credits (stricter)', inr(r.netCr)],
    ['Cheque / ECS returns', String(r.bounces)], ['Behaviour score', ins.score + ' / 100 — ' + ins.grade],
    ['Integrity check', m.reconciled === true ? 'Passed (opening + credits − debits = closing)' : (m.reconciled === false ? 'Does not reconcile — review flagged rows' : 'Not verifiable')]];
  if (od && od.limit > 0) rows.push(['OD / CC limit', inr(od.limit)], ['Average utilisation', (od.avgPct || 0).toFixed(1) + '%'], ['Peak utilisation', (od.peakPct || 0).toFixed(1) + '%']);
  return rows.filter(function (x) { return x[1] != null && x[1] !== '' && x[1] !== '—'; });
}
function summaryText() {
  var t = 'Bank statement summary (YourView Tools)\n' + summaryData().map(function (x) { return x[0] + ': ' + x[1]; }).join('\n') + '\n\nMonth-wise (credits / debits / avg balance):\n';
  S.report.monthly.forEach(function (x) { t += x.label + ': ' + plain(x.crA) + ' / ' + plain(x.drA) + ' / ' + (x.adb == null ? '—' : plain(x.adb)) + '\n'; });
  var fl = S.report.insights.flags.filter(function (f) { return f.level === 'high' || f.level === 'med'; });
  if (fl.length) t += '\nPoints to review:\n' + fl.map(function (f) { return '- ' + f.title; }).join('\n') + '\n';
  return t + '\nAutomated reading — verify against the original statement.';
}
function toast(msg) { var d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(function () { d.classList.add('out'); }, 1800); setTimeout(function () { d.remove(); }, 2300); }
$('#dlCopy').addEventListener('click', function () {
  if (!S.stmt) return; var t = summaryText();
  function fb() { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Summary copied'); } catch (e) { toast('Copy not allowed here'); } ta.remove(); }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Summary copied'); }, fb); else fb();
});
$('#dlPrint').addEventListener('click', function () {
  if (!S.stmt) return;
  var r = S.report, h = '<h1>Bank statement summary</h1><p class="ps-sub">YourView Tools · generated on this device · ' + new Date().toLocaleDateString('en-IN') + '</p><table class="ps-kv">' +
    summaryData().map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>' +
    '<h2>Month-wise</h2><table class="ps-m"><thead><tr><th>Month</th><th>Credits</th><th>Debits</th><th>Avg daily bal</th><th>Closing</th></tr></thead><tbody>' +
    r.monthly.map(function (x) { return '<tr><td>' + x.label + '</td><td>' + plain(x.crA) + '</td><td>' + plain(x.drA) + '</td><td>' + (x.adb == null ? '—' : plain(x.adb)) + '</td><td>' + (x.closeB == null ? '' : plain(x.closeB)) + '</td></tr>'; }).join('') + '</tbody></table>' +
    '<h2>Points to review</h2><ul>' + (r.insights.flags.filter(function (f) { return f.level !== 'good' && f.level !== 'info'; }).map(function (f) { return '<li><b>' + esc(f.title) + '</b> — ' + esc(f.detail) + '</li>'; }).join('') || '<li>Nothing significant flagged.</li>') + '</ul>' +
    '<p class="ps-foot">Automated reading of the uploaded statement; verify against the original. Scores are indicative, not a credit decision.</p>';
  $('#printSum').innerHTML = h; document.body.classList.add('printing');
  setTimeout(function () { window.print(); }, 60);
});
window.addEventListener('afterprint', function () { document.body.classList.remove('printing'); });

/* ---------- v2: remembered settings, paste, shortcuts, offline ---------- */
var KEEP = ['optMode', 'optOcr', 'optHV', 'optStrict', 'optWin', 'optSister'];
try {
  var saved = JSON.parse(localStorage.getItem('yv_siq_opts') || '{}');
  KEEP.forEach(function (id) { var el = $('#' + id); if (!el || saved[id] == null) return; if (el.type === 'checkbox') el.checked = !!saved[id]; else el.value = saved[id]; });
  KEEP.forEach(function (id) { var el = $('#' + id); if (el) el.addEventListener('change', function () { try { var o = JSON.parse(localStorage.getItem('yv_siq_opts') || '{}'); o[id] = el.type === 'checkbox' ? el.checked : el.value; localStorage.setItem('yv_siq_opts', JSON.stringify(o)); } catch (e) {} }); });
} catch (e) {}
document.addEventListener('paste', function (e) { var f = e.clipboardData && e.clipboardData.files; if (f && f.length) { e.preventDefault(); addFiles(f); } });
document.addEventListener('keydown', function (e) {
  if (e.key === '/' && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '') && $('#results').style.display !== 'none' && $('#filters').style.display !== 'none') { e.preventDefault(); $('#fq').focus(); }
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}


/* ---------- v2.1: combined view of all uploaded accounts ---------- */
S.cons = null;
function buildCombo() {
  var items = S.groups.map(function (g, gi) {
    var m = g.stmts.length === 1 ? g.stmts[0] : E.mergeStatements(g.stmts), key = g.ref.meta.accountNo || ('file:' + g.ref.fileName), fx = S.fixes[key];
    if (fx && fx.length) m = E.applyFixes(m, fx);
    return { stmt: m, report: E.buildReport(m, Object.assign(reportOpts(gi), { limit: 0 })) };
  });
  S.cons = E.consolidate(items); renderCombo();
}
function renderCombo() {
  var c = S.cons, T = c.totals, h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h3 style="margin:0">All accounts combined</h3><span><button class="btn dark sm" id="dlCombo">Download combined Excel</button> <button class="btn alt sm" id="closeCombo">Close</button></span></div>';
  h += '<div class="stats" style="margin-top:14px">' + [['Accounts', String(c.accounts.length), ''], ['Total credits', inr(T.cr), 'excl. transfers between them: ' + inr(T.crExInter)], ['Combined turnover', inr(T.turn), 'after own / related and loan credits'], ['Total debits', inr(T.dr), 'excl. transfers between them: ' + inr(T.drExInter)], ['Combined average daily balance', inr(c.combinedAbb), 'sum of all accounts, day by day'], ['Transfers between these accounts', String(c.inter.length), inr(c.interTotal) + ' moved'], ['Cheque / ECS returns', String(T.bounces), 'across all accounts']].map(function (x) { return '<div class="stat"><small>' + x[0] + '</small><b>' + x[1] + '</b>' + (x[2] ? '<em>' + esc(x[2]) + '</em>' : '') + '</div>'; }).join('') + '</div>';
  h += '<div class="tw" style="margin-top:14px"><table><thead><tr><th>Account</th><th>Period</th><th class="n">Opening</th><th class="n">Credits</th><th class="n">Debits</th><th class="n">Closing</th><th class="n">Avg balance</th><th class="n">Returns</th><th class="n">Score</th></tr></thead><tbody>' +
    c.accounts.map(function (a) { return '<tr><td>' + esc(a.label) + (a.holder ? '<br><small>' + esc(a.holder) + '</small>' : '') + '</td><td>' + E.fmtDate(a.from) + ' – ' + E.fmtDate(a.to) + '</td><td class="n">' + plain(a.opening) + '</td><td class="n">' + plain(a.cr) + '</td><td class="n">' + plain(a.dr) + '</td><td class="n">' + plain(a.closing) + '</td><td class="n">' + plain(a.abb) + '</td><td class="n">' + a.bounces + '</td><td class="n">' + (a.score == null ? '' : a.score) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  if (c.monthly.length) h += '<h3 class="sec" style="margin-top:18px">Combined credits vs debits</h3><div class="chart">' + barChart(c.monthly) + '</div>';
  $('#comboBody').innerHTML = h; $('#comboSec').style.display = 'block';
  $('#comboSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#btnCombo').addEventListener('click', function () { var b = this; b.disabled = true; b.textContent = 'Combining…'; setTimeout(function () { try { buildCombo(); } finally { b.disabled = false; b.textContent = 'Combined view of all accounts'; } }, 30); });
$('#comboBody').addEventListener('click', function (e) {
  if (e.target.id === 'closeCombo') $('#comboSec').style.display = 'none';
  if (e.target.id === 'dlCombo' && S.cons) {
    var bytes = YVXlsx.build(E.consolidatedSheets(S.cons));
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'YourViewTools_AllAccounts.xlsx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
});



/* ---------- v3.0: automatic anonymous layout reports (no user action) ---------- */
var AUTO_REPORT_URL = '';   // e.g. '/ocr/report.php' once report.php is installed; empty = off
var sentLayouts = {};
function layoutReport(m) {
  var me = m.meta || {}, safe = function (w) { return String(w).replace(/[0-9]/g, '#').slice(0, 60); };
  return { bank: me.bank || '', accountType: me.accountType || '', parseMode: m.parseMode, ocrUsed: !!m.ocr, rows: m.txns.length, chainRatio: m.chainRatio, reconciled: m.reconciled,
    mismatchRows: m.txns.filter(function (t) { return t.chainOk === false; }).length, headerColumns: (m.layout || []).map(safe), pdfjs: (window.pdfjsLib && pdfjsLib.version) || '' };
}
function maybeAutoReport(m) {
  if (!AUTO_REPORT_URL || !m || !m.txns) return;
  var bad = m.txns.length === 0 || (m.chainRatio != null && m.chainRatio < 0.95) || m.reconciled === false || !((m.meta || {}).bank) || m.parseMode === 'line-pattern';
  if (!bad || m.ocr) return;
  var rep = layoutReport(m), key = JSON.stringify([rep.bank, rep.headerColumns, rep.parseMode]);
  if (sentLayouts[key]) return; sentLayouts[key] = 1;
  try { fetch(AUTO_REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rep), keepalive: true }).catch(function () {}); } catch (e) {}
}

/* ---------- v2.8: privacy-safe problem report (layout only) ---------- */
var REPORT_REPO = '';   // set to 'your-github-user/your-repo' to send reports as GitHub issues; empty = download the file instead
$('#dlReport').addEventListener('click', function () {
  if (!S.full) return;
  var m = S.full, me = m.meta || {}, safe = function (w) { return String(w).replace(/[0-9]/g, '#').slice(0, 60); };
  var rep = {
    tool: 'YourView Bank Statement Analyzer', created: new Date().toISOString().slice(0, 10), pdfjs: (window.pdfjsLib && pdfjsLib.version) || '',
    bank: me.bank || '', accountType: me.accountType || '', parseMode: m.parseMode, ocrUsed: !!m.ocr, rows: m.txns.length, chainRatio: m.chainRatio, reconciled: m.reconciled,
    swappedDirections: !!m.swapped, newestFirst: !!m.reversed, mismatchRows: m.txns.filter(function (t) { return t.chainOk === false; }).length,
    headerColumns: (m.layout || []).map(safe), warnings: (m.warnings || []).map(function (w) { return w.replace(/^[^:]*\.(pdf|xlsx?|csv)\s*:\s*/i, '').replace(/[0-9]{4,}/g, '#'); }),
    note: 'Contains only column header words and counts. No names, account numbers, amounts or narrations.'
  };
  var json = JSON.stringify(rep, null, 2);
  if (REPORT_REPO) {   // opens a prefilled GitHub issue; the user reviews it and presses Submit (needs a free GitHub login)
    var url = 'https://github.com/' + REPORT_REPO + '/issues/new?labels=layout-report&title=' + encodeURIComponent('Layout report: ' + (rep.bank || 'unknown bank') + ' (' + rep.parseMode + ', ' + rep.rows + ' rows)') +
      '&body=' + encodeURIComponent('Layout-only report (no personal data). Please leave the JSON below unchanged.\n\n```json\n' + json + '\n```\n');
    if (url.length < 7500) { window.open(url, '_blank', 'noopener'); toast('Opening a prefilled GitHub issue — review it, then press Submit'); return; }
  }
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'yourview_layout_report.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  toast('Layout report saved — it contains no personal data');
});

window.__SIQ = { addFiles: addFiles, state: S, buildCombo: buildCombo };
})();
