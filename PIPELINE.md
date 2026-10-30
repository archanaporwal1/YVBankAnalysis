AUTOMATIC PIPELINE (free: Hostinger PHP + GitHub Actions)

A. Failed statement  ->  GitHub issue, no user action
  1. Upload server/report.php to your site (e.g. /analysis/report.php).
  2. Create a fine-grained GitHub token for ONE repo with only "Issues: read & write".
  3. Put it in yv-report-config.php one level above public_html (see report-config.sample.php). The token never appears in the page.
  4. In app.js set  var AUTO_REPORT_URL = '/analysis/report.php';  and redeploy.
  The tool then sends an anonymous layout note (headings, bank name, counts; digits masked) only when a file reads badly.
  The server accepts only those fields, masks digits, de-duplicates and rate-limits.
  Triage: copy .github/workflows/triage.yml + tools/triage.js (and engine.js) into the repo; each new issue gets an automatic comment.

B. Fix -> live site, no manual upload
  1. Keep the site files in the repo folder  site/  (index.html, style.css, app.js, engine.js, xlsxout.js, sw.js, manifest.webmanifest, icon.svg, test*.js, report.php).
  2. Add repo secrets FTP_SERVER, FTP_USERNAME, FTP_PASSWORD, FTP_DIR (Hostinger hPanel > Files > FTP accounts; FTP_DIR e.g. /public_html/analysis/).
  3. .github/workflows/deploy.yml runs the regression tests and, only if all pass, uploads the site automatically on every push to main.
  Bumping the cache name in sw.js (yv-siq-v..) on each release makes visitors pick up the new version.

What is NOT automatic: writing the fix. That needs a person or me in a session; a model that edits code unattended needs a paid API.
