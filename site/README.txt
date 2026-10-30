YourView Tools — Bank Statement Analyzer (free, client-side)
============================================================

UPLOAD TO HOSTINGER  (e.g. www.yourview.in/ocr)
1. hPanel -> File Manager -> public_html -> create folder "ocr"
2. Upload these FIVE files into that folder:
      index.html
      style.css
      app.js
      engine.js
      xlsxout.js
3. Open https://www.yourview.in/ocr/  (no database, PHP or Node needed). Turn on SSL + Force HTTPS.

WHAT IT DOES
- Reads PDF (text and scanned), photos, Excel and CSV statements of any bank.
- Password-protected PDF: asks for the password in a pop-up (wrong password -> try again, or skip).
  Passwords stay in the browser and are reused on other files of the session. Password-protected
  Excel files cannot be opened (SheetJS limitation) and show an error.
- Several accounts/banks can be uploaded together (one file may even hold 2 accounts, e.g. ICICI PPF + savings).
  After upload pick the Account, the Bank (if not detected) and the analysis period (from/to month).
  Tick "Reject files from a different account" to get an error pop-up instead.
- Verifies every row against the running balance.
- Insights tab: behaviour score, findings, FOIR, net credits, OD/CC limit utilisation, charts.
- Reads PDF (text and scanned), photos, Excel (XLSX/XLSM/XLSB/XLS), LibreOffice (ODS), CSV/TSV/TXT and HTML-table statements.
- Overdraft / Cash Credit accounts: limit and drawing power are read from the statement header (or typed in the
  "OD / CC limit" box); the page shows average, peak and closing utilisation %, overdrawn days and interest.
- Excel download (real .xlsx with colours, live AVERAGE/TOTAL formulas) - 17 sheets with plain names:
  Summary, Ratios, Daily Balances, Own Transfers, Bounces & Penalties, Top Credits, Top Debits,
  Recurring Credits, Recurring Debits, All Transactions, Loans & EMIs, Files Used, Fraud Checks,
  Flagged Transactions, Insights, File Checks.
- Fraud Checks / Flagged Transactions are indicators only (PDF metadata, balance continuity, duplicates, near-50k cash,
  pass-through credits, bounces) - not proof of tampering.

NOTE
The Summary sheet keeps the familiar banker layout (Summary Info + Monthwise Details). Other sheets are
independent and best-effort. Always verify key figures against the original statements.

PRIVACY
Everything runs in the visitor's browser. Statements are never uploaded.
Libraries (pdf.js, SheetJS, Tesseract.js) load from public CDNs, so visitors need internet.
OCR downloads its language data (~10 MB) the first time a scanned file is read.

FILES
index.html  - page markup (same layout as YourView PDF Compressor)
style.css   - shared YourView front end (colours, fonts, header, drop zone, FAQ format) - reuse for every tool
app.js      - UI logic (PDF/OCR/Excel reading, selectors, charts, export)
engine.js   - parsing + analytics engine (no dependencies)
xlsxout.js  - Excel (.xlsx) writer with styling (no dependencies)
test*.js    - optional engine tests: node test.js ... node test6.js

VERSION 2.0 additions
- Parties tab + "Parties" Excel sheet (17 sheets): every counterparty with credits, debits, net, months active.
- Sortable Transactions / Parties tables, "/" focuses search, paste files with Ctrl+V.
- Copy summary (plain text for emails) and Print / PDF one-page summary.
- Remembers reading mode, OCR, high-value, strict-account and period settings in the browser.
- Offline / installable: manifest.webmanifest, sw.js, icon.svg (works on https or localhost only; upload all files together).
- Header recognition widened (Withdrawals/Deposits, Payments/Receipts, Dr/Cr Amount, Bal., etc.); two-line headers no longer create phantom columns.

VERSION 2.1 additions
- Hand correction: rows whose printed debit/credit side contradicts the running balance get "Swap Dr/Cr"; a one-click option appears when swapping would reconcile them. Corrected rows carry a MANUAL_FIX flag and a warning in the report.
- Combined view of all uploaded accounts (credits, debits, average daily balance summed day by day, transfers between the accounts matched and set aside) with its own Excel download (All Accounts, Combined Monthly, Transfers Between).
- The first row is now also checked against the stated opening balance.
- test9.js covers both features.

VERSION 2.2 (accuracy pass)
- Verified against 30 generated bank-style PDFs with known answers (SBI, PNB, BoB, Canara, Axis, IDFC, Yes, Indian Bank, Kotak-style two-line headers, single Amount column with Dr/Cr suffix or indicator, signed amounts, Paid out/Paid in, no balance column, header on first page only, newest-first, "0.00" / "-" placeholders, left-aligned amounts, time stamps, Rs. prefix, bracketed negatives, overdraft balances, narrations containing amounts, page-footer dates, totals rows, headerless statements) — all rows matched.
- New: statements that print the date only on the first entry of a day are read correctly (previously the following rows were dropped), also across page breaks.
- New: headerless statements no longer mistake an amount written inside a narration for a debit/credit.
- Bank recognition widened to 82 names (regional rural banks, cooperative banks, more small-finance and payments banks) by name or IFSC.

VERSION 2.3 (from real statements: PNB-style, BoB OD app statement, IDFC FIRST OD, Yes Bank, Canara e-passbook)
- Overdraft statements that print the balance without a minus sign (IDFC style) are read as debit balances; reconciles to the bank's own opening / closing figures.
- Narration lines that sit between two entries are split at the widest vertical gap, so "Return" / "CHQ Paid" text no longer sticks to the wrong entry (this removed false cheque-return flags).
- Holder name: "Primary Holder:" (Yes Bank) and plain "Name" (Canara e-passbook) are used; company names wrapped mid-word are joined; account type read from "(CURRENT)".
- Bank name from the document footer ("bob World") or the file name; account number from the file name when the pages carry none.
- test10.js covers these.
- PDFs created by "print to PDF" after unlocking contain only images (no text) and cannot be read; upload the original (locked) file and enter its password.

VERSION 2.4
- Holder name read from "Customer Name:" / "Account Name:" labels (PNB) and from the value printed under an "Account Name" label (BoB current-account layout); account type codes (CAA, SBA, ODA, CCA) translated.
- Verified on 18 real statements and 30 generated layouts.

VERSION 2.5 — internal / related-party credits
- Own name, probable sister concerns (company name starting with the holder's distinctive word, e.g. KENFRONT LLC for KENFRONT CONSULTING PVT LTD), parties typed in the "Sister concerns / related parties" box, and the holder name or account number of any other uploaded statement are treated as internal: listed with the reason in the Own Transfers sheet and excluded from net credits.
- "Auto-detect similar-named sister concerns" can be switched off. Tags: SELF, SISTER_CONCERN, RELATED_PARTY, OWN_OTHER_BANK.
- test11.js covers it.

VERSION 2.6 — Turnover
- Turnover = total credits − credits from the holder's own name (and sister concerns / related parties / your other uploaded accounts) − loan credits. Shown at the top of the results (with the bridge), in the Monthly tab, in Copy / Print summary, in the Summary sheet of the Excel report (monthly Turnover rows and Summary Info) and in the combined view. "Net credits" stays as the stricter figure (also removes refunds and interest).

VERSION 2.7
- PDF reading: OCR is used only when the whole file has no text layer; a short page of a normal statement is no longer sent to OCR. A failing page no longer stops the file. Files with no text show a clear message asking for the original bank PDF.

VERSION 2.8
- "Report a reading problem" button: saves a layout-only JSON (header words, counts, parse mode; digits masked; no names, account numbers, amounts or narrations) that can be sent to the developer to add support for a bank layout.

VERSION 2.9
- Optional GitHub-issues collector: set REPORT_REPO in app.js; "Report a reading problem" then opens a prefilled issue. Folder github/ holds the free triage workflow (see github/README.txt). Empty REPORT_REPO = file download.

VERSION 3.0
- Automatic anonymous layout reports (AUTO_REPORT_URL + github/server/report.php) and automatic deployment (github/.github/workflows/deploy.yml). See github/README.txt.
