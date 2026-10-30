/*!
 * StatementIQ engine — bank statement parser + Perfios-style analytics
 * 100% client-side. No dependencies. Works in browser (window.StatementEngine) and Node.
 */
(function (root) {
  'use strict';

  var TOL = 0.02;
  function r2(n) { return Math.round(n * 100) / 100; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.floor(s.length / 2)];
  }

  /* ───────────────────────── dates ───────────────────────── */
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function mkISO(y, m, d) {
    if (y < 100) y += y > 70 ? 1900 : 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  var DATE_PATTERNS = [
    { re: /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/, f: function (m) {
        var a = +m[1], b = +m[2], y = +m[3];
        if (b > 12 && a <= 12) { var t = a; a = b; b = t; }
        return mkISO(y, b, a);
      } },
    { re: /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/, f: function (m) { return mkISO(+m[1], +m[2], +m[3]); } },
    { re: /^(\d{1,2})[\s\-\/.]*([A-Za-z]{3,9})[\s\-\/.,]*(\d{4}|\d{2})(?!\d)/, f: function (m) {
        var mo = MON[m[2].slice(0, 3).toLowerCase()];
        return mo ? mkISO(+m[3], mo, +m[1]) : null;
      } },
    { re: /^([A-Za-z]{3,9})\.?[\s\-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-]+(\d{4}|\d{2})(?!\d)/, f: function (m) {
        var mo = MON[m[1].slice(0, 3).toLowerCase()];
        return mo ? mkISO(+m[3], mo, +m[2]) : null;
      } }
  ];
  function matchDate(s) {
    s = String(s).trim();
    for (var i = 0; i < DATE_PATTERNS.length; i++) {
      var m = s.match(DATE_PATTERNS[i].re);
      if (m) { var iso = DATE_PATTERNS[i].f(m); if (iso) return { iso: iso, len: m[0].length }; }
    }
    return null;
  }
  function fullDate(s) { var m = matchDate(s); return m && m.len === String(s).trim().length ? m.iso : null; }
  function leadingDate(words, allowSerial) {
    if (allowSerial && words.length > 1 && /^\d{1,5}$/.test(words[0].t)) {
      var d = leadingDate(words.slice(1), false);
      if (d) { d.n += 1; return d; }
    }
    for (var k = 1; k <= 3 && k <= words.length; k++) {
      var s = words.slice(0, k).map(function (w) { return w.t; }).join(' ');
      var m = matchDate(s);
      if (m && m.len === s.length) return { iso: m.iso, n: k };
    }
    return null;
  }
  function dayNum(iso) { var p = iso.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function isoFromDayNum(n) { var d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function excelSerial(iso) { return dayNum(iso) + 25569; }
  function monthKey(iso) { return iso.slice(0, 7); }
  function daysInMonth(key) { var p = key.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthLabel(key) { var p = key.split('-'); return MN[+p[1] - 1] + '-' + p[0]; }
  function fmtDate(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '-' + MN[+p[1] - 1] + '-' + p[0]; }

  /* ───────────────────────── amounts ───────────────────────── */
  var GROUP = /^(?:\d+|\d{1,3}(?:[,.]\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})$/;
  function parseAmt(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s || s.length > 26) return null;
    s = s.replace(/^(?:rs\.?|inr|usd|eur|gbp|aed|[₹$€£])\s*/i, '');
    var side = null, neg = false;
    var m = s.match(/^(.*?\d)\s*\(?\s*(cr|dr)\.?\s*\)?$/i);
    if (m) { side = m[2].toUpperCase() === 'CR' ? 'C' : 'D'; s = m[1]; }
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/^[-−–]/.test(s)) { neg = true; s = s.slice(1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    s = s.replace(/^\+/, '');
    if (!/^\d[\d,.]*$/.test(s)) return null;
    var intPart = s, dec = null;
    var li = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (li >= 0) {
      var after = s.length - li - 1, sep = s[li];
      if (after === 2 || (after === 1 && sep === '.')) { intPart = s.slice(0, li); dec = s.slice(li + 1); }
    }
    if (!GROUP.test(intPart)) return null;
    var v = parseFloat(intPart.replace(/[,.]/g, '') + (dec != null ? '.' + dec : ''));
    if (!isFinite(v)) return null;
    return { v: v, neg: neg, side: side, hasDec: dec != null };
  }
  function fixOcr(t) {
    var digits = (t.match(/\d/g) || []).length;
    if (!digits || digits / t.length < 0.55) return t;
    return t.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  }
  function numTok(t, ctx) {
    var pa = parseAmt(t);
    if (!pa && ctx.ocr) pa = parseAmt(fixOcr(t));
    if (pa && (pa.hasDec || ctx.allowInt)) return pa;
    return null;
  }

  /* ───────────────────────── row building ───────────────────────── */
  // pdf.js text items → words. item: {str,x,y,w,h}
  function itemsToWords(items) {
    var words = [];
    items.forEach(function (it) {
      var s = it.str;
      if (!s || !s.trim()) return;
      var cw = it.w > 0 ? it.w / s.length : (it.h || 10) * 0.5;
      var re = /\S+/g, m;
      while ((m = re.exec(s))) {
        words.push({ t: m[0], x0: it.x + m.index * cw, x1: it.x + (m.index + m[0].length) * cw, y: it.y, h: it.h || 10 });
      }
    });
    return words;
  }
  function groupWords(words, opts) {
    opts = opts || {};
    var ws = words.filter(function (w) { return w.t && String(w.t).trim(); })
      .map(function (w) { return { t: String(w.t).trim(), x0: w.x0, x1: w.x1, y: w.y, h: w.h }; });
    if (!ws.length) return { rows: [], charW: opts.charW || 5 };
    var charW = opts.charW || median(ws.filter(function (w) { return w.t.length >= 3; })
      .map(function (w) { return (w.x1 - w.x0) / w.t.length; })) || 5;
    var hMed = median(ws.map(function (w) { return w.h || charW * 2; }));
    var tol = opts.yTol != null ? opts.yTol : Math.max(1, 0.45 * hMed);
    ws.sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; });
    var rows = [];
    ws.forEach(function (w) {
      var last = rows[rows.length - 1];
      if (last && Math.abs(w.y - last.y) <= tol) {
        last.words.push(w);
        last.y = (last.y * (last.words.length - 1) + w.y) / last.words.length;
      } else rows.push({ y: w.y, words: [w] });
    });
    rows.forEach(function (r) {
      r.words.sort(function (a, b) { return a.x0 - b.x0; });
      var out = [];
      r.words.forEach(function (w) {
        var p = out[out.length - 1];
        if (p && w.x0 - p.x1 < 0.2 * charW && w.x0 - p.x1 > -charW) { p.t += w.t; p.x1 = Math.max(p.x1, w.x1); }
        else out.push(w);
      });
      r.words = out;
    });
    return { rows: rows, charW: charW };
  }
  function rowsFromMatrix(matrix) {
    var words = [];
    matrix.forEach(function (r, ri) {
      (r || []).forEach(function (c, ci) {
        if (c == null) return;
        var s = String(c).trim();
        if (!s) return;
        words.push({ t: s, x0: ci * 1000, x1: ci * 1000 + 500, y: ri * 240, h: 200 });
      });
    });
    var g = groupWords(words, { charW: 100, yTol: 60 });
    g.sheet = true;
    return g;
  }

  /* ───────────────────────── header detection ───────────────────────── */
  var RE_INDIC = /^(dr\s*[\/.\-]\s*cr|cr\s*[\/.\-]\s*dr|dr\/cr|cr\/dr|type|d\/c|c\/d|dr\s*cr)\.?$/i;
  var RE_VALDATE = /(value|val\.?)\s*(dt|date)?|vln/i;
  var RE_BAL = /balance|\bbal\b|\bbal\.|running\s*total/i;
  var RE_DEBIT = /withdraw|debit|\bdr\b|\bdr\.|paid\s*out|outflow|money\s*out|^payments?(\s*\(.*)?$|\bpayments?\s*(out|amt|amount)\b/i;
  var RE_CREDIT = /deposit|credit|\bcr\b|\bcr\.|paid\s*in|inflow|money\s*in|^receipts?(\s*\(.*)?$|\breceipts?\s*(in|amt|amount)\b/i;
  var RE_DESC = /narrat|description|particular|detail|remark|memo|payee|beneficiary|^transaction$|^tran(saction)?\s*(info|text)$/i;
  var RE_DATE = /\bdate\b|\bdt\b|posting/i;
  var RE_REF = /chq|cheque|check\b|ref|instrument|utr|\bno\b/i;
  var RE_AMT = /amount|\bamt\b/i;
  var RE_SERIAL = /^(s\.?\s*no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|serial(\s*(no\.?|number))?|#)$/i;

  function classify(text) {
    var t = text.replace(/\s+/g, ' ').trim();
    if (!t) return 'other';
    if (RE_SERIAL.test(t)) return 'other';
    if (RE_INDIC.test(t)) return 'indicator';
    if (RE_VALDATE.test(t) && /dt|date|^value/i.test(t)) return 'valuedate';
    if (RE_BAL.test(t)) return 'balance';
    var dr = RE_DEBIT.test(t), cr = RE_CREDIT.test(t);
    if (dr && cr) return 'amount';
    if (dr) return 'debit';
    if (cr) return 'credit';
    if (RE_DESC.test(t)) return 'desc';
    if (RE_DATE.test(t)) return 'date';
    if (RE_REF.test(t)) return 'ref';
    if (RE_AMT.test(t)) return 'amount';
    return 'other';
  }
  function isHeaderish(row, ctx) {
    if (row.words.length > 12) return false;
    for (var i = 0; i < row.words.length; i++) {
      var pa = parseAmt(row.words[i].t);
      if (pa && pa.hasDec) return false;
    }
    if (leadingDate(row.words, true)) return false;
    return true;
  }
  function buildLayout(slice, charW) {
    var words = [];
    slice.forEach(function (r, ri) { r.words.forEach(function (w) { words.push({ t: w.t, x0: w.x0, x1: w.x1, ri: ri }); }); });
    var p = words.map(function (_, i) { return i; });
    function find(i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
    function uni(a, b) { a = find(a); b = find(b); if (a !== b) p[a] = b; }
    for (var a = 0; a < words.length; a++) {
      for (var b = a + 1; b < words.length; b++) {
        var A = words[a], B = words[b];
        if (A.ri === B.ri) {
          var gap = B.x0 >= A.x0 ? B.x0 - A.x1 : A.x0 - B.x1;
          if (gap < 1.6 * charW) uni(a, b);
        } else if (Math.abs(A.ri - B.ri) === 1) {
          var ov = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
          if (ov > 0) uni(a, b);
        }
      }
    }
    var groups = {};
    words.forEach(function (w, i) { var r = find(i); (groups[r] = groups[r] || []).push(w); });
    var cols = Object.keys(groups).map(function (k) {
      var g = groups[k].sort(function (x, y) { return x.ri - y.ri || x.x0 - y.x0; });
      var text = g.map(function (w) { return w.t; }).join(' ');
      var x0 = Math.min.apply(null, g.map(function (w) { return w.x0; }));
      var x1 = Math.max.apply(null, g.map(function (w) { return w.x1; }));
      return { kind: classify(text), text: text, x0: x0, x1: x1, cx: (x0 + x1) / 2 };
    }).sort(function (x, y) { return x.x0 - y.x0; });
    // Two-line headers such as "Withdrawal / Amount (INR)" can leave a bare "Amount (INR)" fragment as its own column.
    // When real debit/credit/balance columns exist, fold such fragments into the nearest one instead of keeping a phantom column.
    var hasDC = cols.some(function (c) { return c.kind === 'debit' || c.kind === 'credit'; });
    if (hasDC) {
      var solid = cols.filter(function (c) { return c.kind === 'debit' || c.kind === 'credit' || c.kind === 'balance'; });
      cols = cols.filter(function (c) {
        if (c.kind !== 'amount' && !(c.kind === 'other' && /^\(?\s*(inr|rs\.?|₹)\s*\)?$/i.test(c.text))) return true;
        var best = null, bd = Infinity;
        solid.forEach(function (s) { var d = Math.min(Math.abs(c.cx - s.cx), Math.abs(c.x0 - s.x0), Math.abs(c.x1 - s.x1)); if (d < bd) { bd = d; best = s; } });
        if (best && bd <= 9 * charW) { best.x0 = Math.min(best.x0, c.x0); best.x1 = Math.max(best.x1, c.x1); best.cx = (best.x0 + best.x1) / 2; return false; }
        return c.kind !== 'amount';
      });
    }
    var dateSeen = false;
    cols.forEach(function (c) {
      if (c.kind === 'date') { if (dateSeen) c.kind = 'valuedate'; dateSeen = true; }
    });
    var kinds = {};
    cols.forEach(function (c) { if (c.kind !== 'other') kinds[c.kind] = true; });
    var distinct = Object.keys(kinds).length;
    if (!kinds.date || !(kinds.debit || kinds.credit || kinds.amount) || distinct < 3) return null;
    var others = cols.filter(function (c) { return c.kind === 'other'; }).length;
    return { cols: cols, kinds: kinds, score: distinct * 10 - others * 2 - slice.length };
  }
  function detectHeader(rows, i, charW) {
    var r0 = rows[i];
    if (!isHeaderish(r0)) return null;
    var hits = r0.words.filter(function (w) { return classify(w.t) !== 'other'; }).length;
    if (hits < 1) return null;
    var end = i;
    while (end - i < 2) {
      var nx = rows[end + 1];
      if (!nx || nx.page !== r0.page) break;
      if (nx.y - rows[end].y > charW * 4.6) break;
      if (!isHeaderish(nx)) break;
      var nh = nx.words.filter(function (w) { return classify(w.t) !== 'other'; }).length;
      if (nh < 1 && nx.words.length > 3) break;
      end++;
    }
    var best = null;
    for (var s = i; s <= end; s++) {
      for (var e = end; e >= s; e--) {
        var lay = buildLayout(rows.slice(s, e + 1), charW);
        if (lay && (!best || lay.score > best.layout.score)) best = { layout: lay, end: end, start: s };
      }
    }
    return best;
  }

  /* ───────────────────────── row parsing (header mode) ───────────────────────── */
  var END_RE = /(statement\s*summary|end\s*of\s*statement|\*{3,}|computer\s*generated|registered\s*office|unless\s*the\s*constituent|page\s*\d+\s*(of|\/)\s*\d+|closing\s*balance\s*[:\-]?\s*\d|^total\b|total\s*(debit|credit|withdrawal|deposit|dr|cr)|legends?\b|abbreviations?)/i;
  var SKIP_RE = /(brought\s*forward|carried\s*forward|\bb\/f\b|\bc\/f\b)/i;

  function mergeSuffix(words, charW) {
    var out = [];
    words.forEach(function (w) {
      if (/^\(?(cr|dr)\)?\.?$/i.test(w.t) && out.length) {
        var p = out[out.length - 1];
        if (parseAmt(p.t) && w.x0 - p.x1 < 3 * charW) { p.t = p.t + w.t; p.x1 = w.x1; return; }
      }
      out.push({ t: w.t, x0: w.x0, x1: w.x1 });
    });
    return out;
  }
  function textBounds(textCols) {
    // returns left bound for each text col
    var res = [];
    textCols.forEach(function (c, i) {
      var L;
      if (c.kind === 'desc') {
        var prev = textCols[i - 1];
        L = prev ? (prev.x1 + (c.x0 - prev.x1) / 2) : -Infinity;
        if (prev && L > c.x0) L = c.x0;
      } else L = c.x0 - 3 * (c._cw || 5);
      res.push(L);
    });
    return res;
  }
  function prepLayout(layout, charW) {
    layout.numCols = layout.cols.filter(function (c) { return c.kind === 'debit' || c.kind === 'credit' || c.kind === 'amount' || c.kind === 'balance'; });
    layout.textCols = layout.cols.filter(function (c) { return !(c.kind === 'debit' || c.kind === 'credit' || c.kind === 'amount' || c.kind === 'balance') && c.kind !== 'date' && c.kind !== 'valuedate'; });
    layout.textCols.forEach(function (c) { c._cw = charW; });
    layout.textBounds = textBounds(layout.textCols);
    layout.valCol = layout.cols.filter(function (c) { return c.kind === 'valuedate'; })[0] || null;
    layout.dateCols = layout.cols.filter(function (c) { return c.kind === 'date' || c.kind === 'valuedate'; });
    layout.prepped = true;
  }
  function parseRow(row, layout, charW, ctx) {
    if (!layout.prepped) prepLayout(layout, charW);
    var words = mergeSuffix(row.words, charW);
    var out = { date: null, valueDate: null, desc: [], ref: [], num: {}, ind: '', hasNum: false };
    var ld = leadingDate(words, true);
    var rest = words;
    if (ld) {
      out.date = ld.iso;
      rest = words.slice(ld.n);
      if (rest.length && /^\d{1,2}:\d{2}(:\d{2})?$/.test(rest[0].t)) rest = rest.slice(1);
      var ld2 = rest.length ? leadingDate(rest, false) : null;
      if (ld2 && layout.valCol) { out.valueDate = ld2.iso; rest = rest.slice(ld2.n); }
    }
    var firstText = layout.textCols[0];
    rest.forEach(function (w) {
      // value date located mid-row
      if (out.date && !out.valueDate && layout.valCol) {
        var fd = fullDate(w.t);
        if (fd && Math.abs((w.x0 + w.x1) / 2 - layout.valCol.cx) < 8 * charW) { out.valueDate = fd; return; }
      }
      var pa = layout.numCols.length ? numTok(w.t, ctx) : null;
      if (pa) {
        var best = null, bd = Infinity, cx = (w.x0 + w.x1) / 2;
        layout.numCols.forEach(function (c) {
          var d = Math.min(Math.abs(w.x1 - c.x1), Math.abs(cx - c.cx), Math.abs(w.x0 - c.x0));
          if (d < bd) { bd = d; best = c; }
        });
        if (best && bd <= 8 * charW && out.num[best.kind] === undefined) {
          out.num[best.kind] = pa; out.hasNum = true; return;
        }
      }
      // text assignment
      var tc = null, bl = -Infinity;
      layout.textCols.forEach(function (c, i) {
        var L = layout.textBounds[i];
        if (L <= w.x0 && L >= bl) { bl = L; tc = c; }
      });
      if (!tc) tc = layout.textCols.filter(function (c) { return c.kind === 'desc'; })[0] || firstText;
      if (!tc) return;
      if (tc.kind === 'desc') out.desc.push(w.t);
      else if (tc.kind === 'ref') out.ref.push(w.t);
      else if (tc.kind === 'indicator') out.ind += w.t;
    });
    return out;
  }
  function rawFromParsed(p) {
    var t = { date: p.date, valueDate: p.valueDate, desc: p.desc.join(' '), ref: p.ref.join(' '), debit: null, credit: null, amount: null, side: null, ind: p.ind, balance: null };
    if (p.num.debit) t.debit = p.num.debit.v;
    if (p.num.credit) t.credit = p.num.credit.v;
    if (p.num.amount) { t.amount = p.num.amount.v; t.side = p.num.amount.side; if (p.num.amount.neg) t.side = t.side || 'D'; }
    if (p.num.balance) {
      var b = p.num.balance;
      t.balance = (b.neg || b.side === 'D') ? -b.v : b.v;
    }
    return t;
  }
  // Headers are often centred while body text is left-aligned, so the header midpoint can fall inside the narration text.
  // Use where body words actually start to place the left edge of the narration column.
  function refineBounds(layout, rows, from, charW) {
    if (!layout.prepped) prepLayout(layout, charW);
    layout.textCols.forEach(function (c, i) {
      if (c.kind !== 'desc' || i === 0) return;
      var prev = layout.textCols[i - 1], xs = [];
      for (var r = from + 1; r < rows.length && r < from + 90; r++) {
        if (rows[r].page !== rows[from].page && xs.length > 12) break;
        rows[r].words.forEach(function (w) {
          if (fullDate(w.t) || (layout.numCols.length && numTok(w.t, {}) && w.x0 > c.x1)) return;
          if (w.x0 >= prev.x1 - 2 * charW && w.x0 <= c.x1) xs.push(w.x0);
        });
      }
      if (xs.length < 4) return;
      xs.sort(function (a, b) { return a - b; });
      var edge = xs[Math.floor(xs.length * 0.1)] - 1.5 * charW;
      if (edge < layout.textBounds[i] && edge > prev.x0) layout.textBounds[i] = edge;
    });
  }
  var RE_MODE_START = /^(UPI|NEFT|IMPS|RTGS|CMS|BIL|ACH|NACH|ECS|MMT|INF|IFT|ATM|NFS|POS|EBA|VPS|TPT|ONL|INB|BRN|CLG|CHQ|MB|IB)[A-Za-z0-9]{0,3}[\/\-:]/i;
  function dateRowDescStart(words) {
    var ld = leadingDate(words, true); if (!ld) return '';
    var rest = words.slice(ld.n), ld2 = rest.length ? leadingDate(rest, false) : null;
    if (ld2) rest = rest.slice(ld2.n);
    var out = [];
    for (var k = 0; k < rest.length; k++) { var pa = parseAmt(rest[k].t); if (pa && pa.hasDec) break; out.push(rest[k].t); }
    return out.join(' ');
  }
  // Some banks centre the narration around the date line, so its first line(s) sit ABOVE the row that carries the date and amounts.
  function findPreRows(rows, charW) {
    var pre = {}, isDate = rows.map(function (r) { return !!leadingDate(r.words, true); });
    var i = 0;
    while (i < rows.length) {
      if (isDate[i]) { i++; continue; }
      var k = i; while (k < rows.length && !isDate[k] && rows[k].page === rows[i].page) k++;
      if (k < rows.length && isDate[k] && rows[k].page === rows[i].page) {
        var m = -1;
        for (var q = i; q < k; q++) if (RE_MODE_START.test(rows[q].words.map(function (w) { return w.t; }).join(' '))) m = q;
        if (m >= 0 && !RE_MODE_START.test(dateRowDescStart(rows[k].words)) && rows[k].y - rows[m].y <= charW * 5.5) for (var z = m; z < k; z++) pre[z] = true;
        else if (m < 0 && k - i >= 2 && i > 0 && isDate[i - 1] && rows[i - 1].page === rows[i].page) {
          // no recognisable narration start: split the lines between two entries at the widest vertical gap
          // (lines of one entry sit evenly spaced; the gap between entries is larger)
          var ys = [rows[i - 1].y]; for (var yq = i; yq <= k; yq++) ys.push(rows[yq].y);
          var gaps = ys.slice(1).map(function (v, ix) { return v - ys[ix]; }), gmax = -1, gi = -1;
          gaps.forEach(function (g, ix) { if (g > gmax) { gmax = g; gi = ix; } });
          var others = gaps.filter(function (g, ix) { return ix !== gi; }).sort(function (a, b) { return a - b; }), med = others.length ? others[Math.floor(others.length / 2)] : 0;
          var firstPre = i + gi;                     // index of the first line after the widest gap
          if (gi > 0 && med > 0 && gmax >= med * 1.25 && firstPre < k && k - firstPre <= 3 && !isDate[firstPre]) for (var z2 = firstPre; z2 < k; z2++) pre[z2] = true;
        }
      }
      i = Math.max(k, i + 1);
    }
    return pre;
  }
  function parseHeaderMode(rows, charW, ctx) {
    var preRows = findPreRows(rows, charW), pend = [];
    var layout = null, inTable = false, txns = [], cur = null, lastRaw = null, lastPage = -1, headers = 0, layoutInfo = null, lastY = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.page !== lastPage) { lastPage = row.page; inTable = false; }
      var hd = detectHeader(rows, i, charW);
      if (hd) { layout = hd.layout; refineBounds(layout, rows, hd.end, charW); inTable = true; cur = null; headers++; i = hd.end; if (!layoutInfo) layoutInfo = layout.cols.map(function (c) { return c.kind + ':' + c.text; }); continue; }
      if (!layout) continue;
      var text = row.words.map(function (w) { return w.t; }).join(' ');
      var p = parseRow(row, layout, charW, ctx);
      if (!p.date && preRows[i] && inTable && !p.hasNum) { pend.push(p.desc.join(' ')); lastY = row.y; continue; }
      if (p.date) {
        if (END_RE.test(text) && !p.hasNum) { inTable = false; continue; }
        cur = rawFromParsed(p); lastRaw = cur; cur.page = row.page; if (pend.length) { cur.desc = pend.join(' ') + (cur.desc ? ' ' + cur.desc : ''); pend = []; } txns.push(cur); inTable = true; lastY = row.y; continue;
      }
      // Some banks print the date only on the first entry of a day. A row with no date but a full set of amounts
      // (a debit/credit value and, where the table has one, a balance) is a new entry on the same date.
      // The previous entry is remembered across a repeated page header, so a blank date at the top of a page still works.
      var rc = cur || lastRaw;
      if (inTable && rc && p.hasNum && rc.date && (rc.balance != null || rc.debit != null || rc.credit != null || rc.amount != null) &&
          (p.num.debit || p.num.credit || p.num.amount) && (!layout.numCols.some(function (c) { return c.kind === 'balance'; }) || p.num.balance) &&
          !SKIP_RE.test(text) && !END_RE.test(text) && !(cur && lastY != null && row.page === cur.page && row.y - lastY > charW * 5.6)) {
        var nt = rawFromParsed(p); nt.page = row.page; nt.date = rc.date; nt.dateInherited = true;
        txns.push(nt); cur = nt; lastRaw = nt; lastY = row.y; continue;
      }
      if (!inTable || !cur) continue;
      // a big vertical gap after the last row means the table has ended (page footer, notices, disclaimers)
      if (lastY != null && row.page === cur.page && row.y - lastY > charW * 5.6) { inTable = false; continue; }
      lastY = row.y;
      if (SKIP_RE.test(text)) continue;
      if (END_RE.test(text)) { inTable = false; continue; }
      if (p.hasNum) {
        if (cur.debit == null && cur.credit == null && cur.amount == null && cur.balance == null) {
          var f = rawFromParsed(p);
          ['debit', 'credit', 'amount', 'side', 'balance'].forEach(function (k) { if (f[k] != null) cur[k] = f[k]; });
        }
        if (p.desc.length) cur.desc += ' ' + p.desc.join(' ');
        continue;
      }
      if (p.desc.length) cur.desc += ' ' + p.desc.join(' ');
      if (p.ref.length) cur.ref += (cur.ref ? ' ' : '') + p.ref.join(' ');
    }
    return { raw: txns, headers: headers, layout: layoutInfo };
  }

  /* ───────────────────────── line mode (header-less fallback) ───────────────────────── */
  function parseLineMode(rows, charW, ctx) {
    var txns = [], cur = null, lastPage = -1, inTable = false;
    rows.forEach(function (row) {
      if (row.page !== lastPage) { lastPage = row.page; inTable = false; }
      var words = mergeSuffix(row.words, charW);
      var text = words.map(function (w) { return w.t; }).join(' ');
      var ld = leadingDate(words, true);
      if (!ld && cur && (inTable || cur.page !== row.page) && cur.date && cur.balance != null && !END_RE.test(text) && !SKIP_RE.test(text)) {
        // date printed only on the first entry of the day: two or more trailing amounts make this a new entry
        var tn = 0; for (var q = words.length - 1; q >= 1 && tn < 3; q--) { var qa = numTok(words[q].t, ctx); if (qa && qa.hasDec) tn++; else break; }
        if (tn >= 2) ld = { iso: cur.date, n: 0, inherited: true };
      }
      if (!ld) {
        if (!cur || !inTable) return;
        if (END_RE.test(text)) { inTable = false; return; }
        if (SKIP_RE.test(text)) return;
        var hasNum = words.some(function (w) { var pa = parseAmt(w.t); return pa && pa.hasDec; });
        if (hasNum || words.length > 14) return;
        cur.desc += ' ' + text;
        return;
      }
      var rest = words.slice(ld.n);
      if (rest.length && /^\d{1,2}:\d{2}(:\d{2})?$/.test(rest[0].t)) rest = rest.slice(1);
      var vd = rest.length ? leadingDate(rest, false) : null;
      var valueDate = null;
      if (vd) { valueDate = vd.iso; rest = rest.slice(vd.n); }
      var nums = [];
      for (var k = rest.length - 1; k >= 0 && nums.length < 3; k--) {
        var pa = numTok(rest[k].t, ctx);
        if (pa && pa.hasDec) { nums.unshift({ pa: pa, i: k }); } else break;
      }
      // A real row never has both a debit and a credit, so with three trailing amounts where the first two are non-zero,
      // the first one is a figure written inside the narration (e.g. "REVERSAL OF RS 1,200.50").
      if (nums.length === 3 && nums[0].pa.v > 0 && nums[1].pa.v > 0) nums.shift();
      var descWords = rest.slice(0, rest.length - nums.length).map(function (w) { return w.t; });
      var t = { date: ld.iso, valueDate: valueDate, desc: descWords.join(' '), ref: '', debit: null, credit: null, amount: null, side: null, balance: null, page: row.page };
      if (nums.length === 1) {
        if (/opening|b\/f|brought/i.test(t.desc)) t.balance = nums[0].pa.v; else t.amount = nums[0].pa.v;
        t.side = nums[0].pa.side;
      } else if (nums.length === 2) {
        t.amount = nums[0].pa.v; t.side = nums[0].pa.side || (nums[0].pa.neg ? 'D' : null);
        t.balance = (nums[1].pa.neg || nums[1].pa.side === 'D') ? -nums[1].pa.v : nums[1].pa.v;
      } else if (nums.length === 3) {
        t.debit = nums[0].pa.v; t.credit = nums[1].pa.v;
        t.balance = (nums[2].pa.neg || nums[2].pa.side === 'D') ? -nums[2].pa.v : nums[2].pa.v;
      }
      if (END_RE.test(text) && !nums.length) { inTable = false; return; }
      cur = t; txns.push(t); inTable = true;
    });
    return { raw: txns, headers: 0, layout: null };
  }

  /* ───────────────────────── metadata ───────────────────────── */
  var BANKS = [
    ['HDFC Bank', /hdfc\s*bank/i, 'HDFC'], ['ICICI Bank', /icici\s*bank/i, 'ICIC'], ['State Bank of India', /state\s*bank\s*of\s*india|\bsbi\b/i, 'SBIN'],
    ['Axis Bank', /axis\s*bank/i, 'UTIB'], ['Kotak Mahindra Bank', /kotak/i, 'KKBK'], ['Punjab National Bank', /punjab\s*national\s*bank|\bpnb\b/i, 'PUNB'],
    ['Bank of Baroda', /bank\s*of\s*baroda|bob\s*world|\bbob\s*(?:world|connect)/i, 'BARB'], ['Canara Bank', /canara\s*bank/i, 'CNRB'], ['City Union Bank', /city\s*union\s*bank/i, 'CIUB'], ['Union Bank of India', /union\s*bank/i, 'UBIN'],
    ['IDFC FIRST Bank', /idfc/i, 'IDFB'], ['Yes Bank', /yes\s*bank/i, 'YESB'], ['IndusInd Bank', /indusind/i, 'INDB'], ['Bank of India', /bank\s*of\s*india/i, 'BKID'],
    ['Indian Bank', /indian\s*bank/i, 'IDIB'], ['Indian Overseas Bank', /indian\s*overseas/i, 'IOBA'], ['Central Bank of India', /central\s*bank\s*of\s*india/i, 'CBIN'],
    ['UCO Bank', /uco\s*bank/i, 'UCBA'], ['Bank of Maharashtra', /bank\s*of\s*maharashtra/i, 'MAHB'], ['Federal Bank', /federal\s*bank/i, 'FDRL'],
    ['Karnataka Bank', /karnataka\s*bank/i, 'KARB'], ['South Indian Bank', /south\s*indian\s*bank/i, 'SIBL'], ['RBL Bank', /\brbl\b|ratnakar/i, 'RATN'],
    ['DBS Bank', /\bdbs\b/i, 'DBSS'], ['Standard Chartered', /standard\s*chartered/i, 'SCBL'], ['HSBC', /\bhsbc\b/i, 'HSBC'], ['Citibank', /citibank|\bciti\b/i, 'CITI'],
    ['DCB Bank', /dcb\s*bank/i, 'DCBL'], ['Tamilnad Mercantile Bank', /tamilnad\s*mercantile|\btmb\b/i, 'TMBL'], ['AU Small Finance Bank', /au\s*small\s*finance/i, 'AUBL'],
    ['ESAF Small Finance Bank', /esaf/i, 'ESMF'], ['J&K Bank', /jammu\s*(&|and)\s*kashmir/i, 'JAKA'], ['Karur Vysya Bank', /karur\s*vysya/i, 'KVBL'],
    ['CSB Bank', /catholic\s*syrian|\bcsb\b/i, 'CSBK'], ['Punjab & Sind Bank', /punjab\s*(&|and)\s*sind/i, 'PSIB'], ['IDBI Bank', /idbi/i, 'IBKL'],
    ['Bandhan Bank', /bandhan/i, 'BDBL'], ['Equitas Small Finance Bank', /equitas/i, 'ESFB'], ['Ujjivan Small Finance Bank', /ujjivan/i, 'USFB'],
    ['Paytm Payments Bank', /paytm\s*payments/i, 'PYTM'], ['Airtel Payments Bank', /airtel\s*payments/i, 'AIRP'], ['Saraswat Bank', /saraswat/i, 'SRCB'],
    ['Chase', /jpmorgan|chase\s*bank/i, ''], ['Bank of America', /bank\s*of\s*america/i, ''], ['Wells Fargo', /wells\s*fargo/i, ''], ['Barclays', /barclays/i, ''],
    ['Lloyds Bank', /lloyds/i, ''], ['Emirates NBD', /emirates\s*nbd/i, ''], ['Mashreq', /mashreq/i, ''],
    // more Indian banks: private, small finance, payments, regional rural and cooperative
    ['Dhanlaxmi Bank', /dhanlaxmi/i, 'DLXB'], ['Nainital Bank', /nainital\s*bank/i, 'NTBL'], ['Jana Small Finance Bank', /jana\s*small\s*finance/i, 'JSFB'],
    ['Suryoday Small Finance Bank', /suryoday/i, 'SURY'], ['Utkarsh Small Finance Bank', /utkarsh/i, 'UTKS'], ['Capital Small Finance Bank', /capital\s*small\s*finance/i, 'CLBL'],
    ['Fincare Small Finance Bank', /fincare/i, 'FSFB'], ['North East Small Finance Bank', /north\s*east\s*small\s*finance/i, 'NESF'], ['Shivalik Small Finance Bank', /shivalik/i, 'SMCB'],
    ['India Post Payments Bank', /india\s*post\s*payments/i, 'IPOS'], ['Fino Payments Bank', /fino\s*payments/i, 'FINO'], ['NSDL Payments Bank', /nsdl\s*payments/i, 'NSPB'],
    ['Jio Payments Bank', /jio\s*payments/i, 'JIOP'], ['Kerala Gramin Bank', /kerala\s*gramin/i, 'KLGB'], ['Andhra Pradesh Grameena Vikas Bank', /andhra\s*pradesh\s*grameena/i, 'APGB'],
    ['Telangana Grameena Bank', /telangana\s*grameena/i, 'TGBL'], ['Karnataka Grameena Bank', /karnataka\s*grameena|pragathi\s*krishna/i, 'KGBL'], ['Baroda UP Bank', /baroda\s*u\.?p\.?\s*bank/i, 'BARB'],
    ['Uttar Bihar Gramin Bank', /uttar\s*bihar\s*gramin/i, 'UBGB'], ['Madhya Bihar Gramin Bank', /madhya\s*bihar\s*gramin/i, 'MBGB'], ['Odisha Gramya Bank', /odisha\s*gramya|utkal\s*grameen/i, 'UGBX'],
    ['Cosmos Co-operative Bank', /cosmos\s*co/i, 'COSB'], ['Bharat Co-operative Bank', /bharat\s*co/i, 'BCBM'], ['Abhyudaya Co-operative Bank', /abhyudaya/i, 'ABHY'],
    ['TJSB Sahakari Bank', /tjsb/i, 'TJSB'], ['SVC Co-operative Bank', /\bsvc\s*co|shamrao\s*vithal/i, 'SVCB'], ['NKGSB Co-operative Bank', /nkgsb/i, 'NKGS'],
    ['Janata Sahakari Bank', /janata\s*sahakari/i, 'JSBP'], ['Apna Sahakari Bank', /apna\s*sahakari/i, 'ASBL'], ['Kerala Bank', /kerala\s*bank|kerala\s*state\s*co/i, 'KSBK'],
    ['Bank of Bahrain & Kuwait', /bahrain\s*(&|and)\s*kuwait/i, 'BBKM'], ['Deutsche Bank', /deutsche\s*bank/i, 'DEUT'], ['Bank of Ceylon', /bank\s*of\s*ceylon/i, 'BCEY']
  ];
  function findDates(text) {
    var out = [], re = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{1,2}[ \-][A-Za-z]{3,9}[ \-,]+\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g, m;
    while ((m = re.exec(text))) { var d = fullDate(m[0]); if (d) out.push(d); }
    return out;
  }
  function extractMeta(rows) {
    var lines = [], stop = false;
    rows.forEach(function (r) {
      if (stop || r.page > 0 || lines.length >= 160) return;
      // header area only: stop at the first transaction-looking row (leading date + a decimal amount),
      // otherwise IFSC codes / bank names inside narrations would be mistaken for account details
      var isTxn = leadingDate(r.words, true) && r.words.some(function (w) { var pa = parseAmt(w.t); return pa && pa.hasDec; });
      if (isTxn) { stop = true; return; }
      lines.push(r.words.map(function (w) { return w.t; }).join(' '));
    });
    var all = lines.join('\n');
    var meta = { bank: '', ifsc: '', accountNo: '', holder: '', from: '', to: '', accountType: '', limit: null, micr: '', branch: '', email: '', pan: '', mobile: '', address: '' };
    var im = all.match(/\b([A-Z]{4})0([A-Z0-9]{6})\b/);
    if (im) { meta.ifsc = im[0]; }
    var cnt = 0;
    BANKS.forEach(function (b) {
      if (meta.bank) return;
      if (meta.ifsc && b[2] && meta.ifsc.slice(0, 4) === b[2]) { meta.bank = b[0]; return; }
    });
    if (!meta.bank) {
      var bestIdx = 1e9;
      BANKS.forEach(function (b) { var m = all.match(b[1]); if (m && m.index < bestIdx) { bestIdx = m.index; meta.bank = b[0]; } });
    }
    var am = all.match(/(?:a\/c|acct?\.?|account)\s*(?:no\.?|number|num|#)?\s*(?:\([^)]{0,12}\))?\s*(?:[:\-.]|is)?\s*(?:[A-Za-z]{1,3}-)?([0-9Xx*]{6,20})/i);
    if (am && /\d/.test(am[1].replace(/[Xx*]/g, '')) ) meta.accountNo = am[1].toUpperCase().replace(/\*/g, 'X');
    if (!meta.accountNo) {
      for (var i = 0; i < lines.length - 1; i++) {
        if (/(account|a\/c)\s*(no|number)/i.test(lines[i]) && !/\d{6}/.test(lines[i])) {
          var nm = lines[i + 1].match(/([0-9Xx*]{8,20})/);
          if (nm) { meta.accountNo = nm[1].toUpperCase().replace(/\*/g, 'X'); break; }
        }
      }
    }
    var hm = all.match(/(?:account\s*(?:holder|name|title)|customer\s*(?:name|details)|a\/c\s*(?:holder|name))\s*[:\-]?\s*([A-Za-z][A-Za-z .&'\/]{2,70})/i) || all.match(/\bname\s*[:\-]\s*([A-Za-z][A-Za-z .&'\/]{2,70})/i);
    var lbl = all.match(/(?:customer\s*name|account\s*name|name\s*of\s*(?:the\s*)?account\s*holder)\s*[:\-]\s*([A-Za-z][A-Za-z .&'\/]{2,70}?)(?=\s{2,}|\s+(?:customer|address|branch|city|pin|ckyc|joint|account|ifsc|a\/c)\b|\n|$)/i);
    if (lbl && !hm) hm = lbl; else if (lbl && /^customer\s*(name|details)$/i.test((hm[1] || '').trim())) hm = lbl;
    var phm = all.match(/primary\s*(?:account\s*)?holder\s*[:\-]?\s*([A-Za-z][A-Za-z .&'\/]{2,70}?)(?=\s+(?:A\/C|Account|Nominee|Joint|Opening|Status|Customer|Cust)\b|\n|$)/i);
    if (phm) hm = phm;
    else if (!hm || /branch|address/i.test(all.slice(Math.max(0, hm.index - 20), hm.index + 2))) {
      var nm2 = all.match(/(?:^|\n)\s*Name\s+([A-Z][A-Z .&']{3,50}?)(?=\s+(?:Product|Branch|Address|IFSC|Phone|Customer|Mobile)\b|\s*(?:\n|$))/);
      if (nm2) hm = nm2;
    }
    function gridValue(labelRe) {
      for (var gi = 0; gi < rows.length - 1 && gi < 60; gi++) {
        var ws = rows[gi].words, txt = ws.map(function (w) { return w.t; }).join(' ');
        var m0 = txt.match(labelRe); if (!m0 || txt.replace(labelRe, '').replace(/\b(branch|ifsc|micr|account|number|type|code|name)\b/ig, '').replace(/[^A-Za-z0-9]/g, '').length) continue;
        var li = -1; for (var wi = 0; wi < ws.length; wi++) { if (labelRe.test(ws[wi].t + ' ' + (ws[wi + 1] ? ws[wi + 1].t : '')) || labelRe.test(ws[wi].t)) { li = wi; break; } }
        if (li < 0) continue;
        var x0 = ws[li].x0, nr = rows[gi + 1]; if (!nr) continue;
        var out = [], last = null;
        nr.words.forEach(function (w) { if (w.x0 < x0 - 4) return; if (last != null && w.x0 - last > 14) { if (out.length) return; } if (out.length === 0 && w.x0 > x0 + 40) return; out.push(w.t); last = w.x1; });
        var v = out.join(' ').trim(); if (v) return v;
      }
      return '';
    }
    if (!meta.holder) { var gv = gridValue(/^account\s*name\b/i); if (gv && /^[A-Za-z][A-Za-z .&'\/]{2,70}$/.test(gv) && (!hm || /^(branch|address|name|account|customer|details|number|no|type)\b/i.test((hm[1] || '').trim()))) hm = [gv, gv]; }
    if (!meta.accountType) {
      var at = gridValue(/^account\s*type\b/i);
      if (at) { var AT = { CAA: 'Current', CA: 'Current', CURRENT: 'Current', SBA: 'Savings', SB: 'Savings', SAVINGS: 'Savings', ODA: 'Overdraft', OD: 'Overdraft', CCA: 'Cash Credit', CC: 'Cash Credit' }; meta.accountType = AT[at.toUpperCase().trim()] || ''; }
    }
    var BADNAME = /^(limit|address|of|and|&|details|number|no|code|type|status|currency|branch)\b/i;
    if (hm) meta.holder = hm[1].replace(/\b(address|account|a\/c|customer|ifsc|branch|cif|pan|email|mobile|joint|nomination|currency|date|statement|period|from|id)\b.*$/i, '').replace(/[ .]+$/, '').trim();
    if (BADNAME.test(meta.holder)) meta.holder = '';
    if (meta.holder && !/(private\s+limited|pvt|limited|ltd|llp)\b/i.test(meta.holder)) {
      // a long company name that wraps mid-word onto the next line ("KENFRONT CONSULTIN" / "G PRIVATE LIMITED")
      for (var hl = 0; hl < lines.length - 1; hl++) {
        if (lines[hl].indexOf(meta.holder) < 0) continue;
        var wm = lines[hl + 1].match(/^([A-Z]{1,3})\s+((?:PRIVATE|PVT\.?)\s+(?:LIMITED|LTD\.?)|LIMITED|LTD\.?|LLP)\b/);
        if (wm) meta.holder = (meta.holder + wm[1] + ' ' + wm[2]).trim();
        break;
      }
    }
    if (!meta.holder) {
      var NOT = /\b(bank|branch|statement|account|address|details|india|telangana|hyderabad|balance|summary|page|customer|visit|dial|please|toll|date|period|ifsc|micr|nomination|currency|phone|email|limited\s+account|ground|floor|plot|flat|door|shop|road|street|colony|nagar|village|district|pin|code|savings|current)\b/i;
      var SUF = /^(.*?\b(?:private\s+limited|pvt\.?\s*ltd\.?|limited|ltd\.?|llp|opc|enterprises|traders|industries|dairy\s+farms?))\b/i;
      for (var li = 0; li < lines.length && !meta.holder; li++) {
        var raw = lines[li];
        var cut = raw.split(/\s+(?=(?:Your|Branch|Account|IFSC|Customer|CIF|Phone|MICR|Product|Date|Time|Pin|Cleared|Currency)\b)|\s:\s/i)[0].trim();
        var sm = cut.match(SUF); if (sm && !/\d/.test(sm[1])) cut = sm[1].trim();
        if (/^(MR|MRS|MS|SHRI|SMT|DR|M\/S|MESSRS)\b\.?/i.test(cut) && /^[A-Za-z.\/ ]{5,60}$/.test(cut) && !NOT.test(cut)) { meta.holder = cut.replace(/^(MR|MRS|MS|SHRI|SMT|DR|M\/S|MESSRS)\.?\s*/i, '').trim(); break; }
        if (/^[A-Z][A-Z .&']{3,60}$/.test(cut) && cut.split(/\s+/).length >= 2 && !NOT.test(cut)) { meta.holder = cut; break; }
        if (/^[A-Z]{5,20}$/.test(cut) && li > 2 && !NOT.test(cut) && /account\s*(no|number)/i.test(lines.slice(Math.max(0, li - 2), li).join(' '))) { meta.holder = cut; break; }
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (/(period|from|between|statement\s*for)/i.test(lines[j])) {
        var ds = findDates(lines[j]);
        if (ds.length >= 2) { meta.from = ds[0]; meta.to = ds[1]; break; }
      }
    }
    var atm = all.match(/account\s*number\s*\d+\s*\(\s*(current|savings?|overdraft|cash\s*credit|od|cc)\s*\)/i);
    if (atm && !meta.accountType) meta.accountType = /^sav/i.test(atm[1]) ? 'Savings' : (/^cur/i.test(atm[1]) ? 'Current' : (/^o/i.test(atm[1]) ? 'Overdraft' : 'Cash Credit'));
    if (/loan\s*account\s*statement|loan\s*a\/c\s*statement|term\s*loan|sanction\s*amount.*disbursed/i.test(all)) meta.accountType = 'Loan';
    else if (/cash\s*credit|\bCC\s*(?:a\/c|account)|\bCCA\b/i.test(all)) meta.accountType = 'Cash Credit';
    else if (/over\s*draft|\bOD\s*(?:a\/c|account)|\bODA\b/i.test(all)) meta.accountType = 'Overdraft';
    else if (/current\s*(?:a\/c|account|deposit)|business\s*(?:a\/c|account)|account\s*type\s*[:\-]?\s*(?:current|cagen|ca\b)|product\s*[:\-]?\s*ca[-\s]/i.test(all)) meta.accountType = 'Current';
    else if (/saving/i.test(all)) meta.accountType = 'Savings';
    var lm = all.match(/(?:sanction(?:ed)?\s*(?:limit|amount)|limit\s*sanction(?:ed)?|credit\s*limit|od\s*limit|cc\s*limit|(?:account|facility)\s*limit|\blimit)\s*(?:amount|amt)?\s*(?:\(\s*(?:inr|rs\.?)\s*\))?\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]{4,}(?:\.\d{1,2})?)/i);
    if (lm) { var lv = parseFloat(lm[1].replace(/,/g, '')); if (lv >= 1000) meta.limit = lv; }
    var dpm = all.match(/drawing\s*power(?:\s*(?:amount|amt|limit))?\s*(?:\(\s*(?:inr|rs\.?)\s*\))?\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]{4,}(?:\.\d{1,2})?)/i);
    if (dpm) { var dv = parseFloat(dpm[1].replace(/,/g, '')); if (dv >= 1000) { meta.dp = dv; if (!meta.limit) meta.limit = dv; } }
    var mi = all.match(/MICR\s*(?:code|no\.?|number)?\s*[:\-]?\s*(\d{9})/i);
    if (mi) meta.micr = mi[1];
    var bm = all.match(/branch(?:\s*name)?\s*[:\-]\s*([A-Za-z0-9 ,.&'\/\-]{3,40})/i);
    if (bm) meta.branch = bm[1].replace(/\b(ifsc|micr|code|a\/c|account|address|city|state)\b.*$/i, '').trim();
    var em = all.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/); meta.email = em ? em[0] : '';
    var pm = all.match(/\b[A-Z]{5}\d{4}[A-Z]\b/); meta.pan = pm ? pm[0] : '';
    var mb = all.match(/(?:mobile|mob|phone|contact)(?:\s*(?:no|number))?\s*[:\-.]?\s*(?:\+?91[\s-]*)?([6-9]\d{9})\b/i); meta.mobile = mb ? mb[1] : '';
    var ad = all.match(/address\s*[:\-]\s*([^\n]{6,140})/i); meta.address = ad ? ad[1].replace(/\b(ifsc|micr|branch|a\/c|account|cif|customer|pan|email|mobile)\b.*$/i, '').trim() : '';
    return meta;
  }
  function normAcct(s) { return String(s || '').toUpperCase().replace(/[^0-9X*]/g, '').replace(/\*/g, 'X'); }
  // true = same, false = different, null = cannot verify
  function sameAccount(a, b, opts) {
    a = normAcct(a); b = normAcct(b);
    if (!a || !b) return null;
    var n = Math.min(a.length, b.length), cmp = 0, bad = 0;
    for (var i = 1; i <= n; i++) {
      var x = a[a.length - i], y = b[b.length - i];
      if (x === 'X' || y === 'X') continue;
      cmp++;
      if (x !== y) bad++;
    }
    if (cmp < 3) return null;
    if (bad === 0) return true;
    if (opts && opts.fuzzy && bad === 1 && cmp >= 8) return true;
    return false;
  }

  /* ───────────────────────── classification ───────────────────────── */
  var MODES = [
    ['UPI', /\bupi\b|upi[\/\-]/i], ['NEFT', /\bneft\b/i], ['RTGS', /\brtgs\b/i], ['IMPS', /\bimps\b|\bimp\s*p2[ab]\b|\bp2a\b/i],
    ['ATM', /\batm\b|\bnwd\b|\batw\b|cash\s*(wdl|withdrawal)/i], ['CASH', /cash\s*dep|by\s*cash|\bcdm\b|cash\s*deposit|\bcash\b/i],
    ['ECS/NACH', /\bach\b|\bnach\b|\becs\b|mandate/i], ['CHEQUE', /\bchq\b|cheque|\bclg\b|clearing|\bchk\b/i],
    ['POS/CARD', /\bpos\b|\becom\b|swipe|\bpur\b|debit\s*card|card\s*txn/i], ['INTEREST', /int\.?\s*(pd|paid|cr|credit|coll)|interest/i],
    ['CHARGES', /chrg|charge|\bfee\b|sms\s*alert|\bamc\b|min(imum)?\s*bal|\bgst\b|cgst|sgst|igst|service\s*tax/i], ['TRANSFER', /\btrf\b|transfer|\bift\b|\bft\b|fund\s*transfer/i]
  ];
  var RE_BOUNCE = /(chq|cheque|check|chk|ecs|ach|nach|emi|clg|clearing|i\/?w|o\/?w|inward|outward)[^a-z]{0,12}[a-z\s\/.\-]{0,25}(return|retn|rtn|bounce|dishon|unpaid|ret\b)|return(ed)?\s*(chq|cheque)|insufficient\s*fund|dishonou?r|bounce|\bchq\s*ret|unpaid|rtn\s*chg|return\s*chg/i;
  var RE_EMI = /\bemi\b|loan|\bach\s*d\b|\bnach\b|instal|repay|\blan\b|\becs\b.*(emi|loan)|bajaj\s*fin|hdb\s*fin|tata\s*capital|finance|housing/i;
  var STOP = {}; ('UPI DR CR NEFT RTGS IMPS PAYMENT FROM TO TRANSFER BY TRF ATM POS CASH CHQ CHEQUE IFT INB MB NET BANKING ONLINE REF NO THE AND PAY PAID PYMT FUND FUNDS TXN TRANSACTION ACH NACH ECS CLG CLEARING INWARD OUTWARD DEPOSIT WITHDRAWAL SELF MOB MOBILE OK HDFC ICICI SBI AXIS KOTAK YES BANK LTD PVT LIMITED INT BHIM PHONEPE GPAY PAYTM WDL WDR WITHDRWAL DEBIT CREDIT CARD').split(' ').forEach(function (w) { STOP[w] = 1; });
  function counterparty(desc) {
    var segs = String(desc || '').split(/[\/\-:|;,@]+/);
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i].trim().replace(/\s+/g, ' ');
      if (s.length < 3) continue;
      var letters = (s.match(/[A-Za-z]/g) || []).length, digits = (s.match(/\d/g) || []).length;
      if (letters < 3 || digits > letters) continue;
      if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(s)) continue;
      if (/^[A-Za-z]+\d{5,}/.test(s)) continue;
      var up = s.toUpperCase();
      var ws = up.split(' ');
      if (ws.every(function (w) { return STOP[w]; })) continue;
      if (/\.(com|in)$/i.test(s) || s.indexOf('@') >= 0) continue;
      return up.slice(0, 40);
    }
    return '';
  }
  function detectMode(t) {
    var s = (t.desc || '') + ' ' + (t.ref || '');
    for (var i = 0; i < MODES.length; i++) if (MODES[i][1].test(s)) return MODES[i][0];
    return 'OTHER';
  }
  function detectTags(t) {
    var s = (t.desc || '') + ' ' + (t.ref || ''), tags = [], dr = t.debit > 0, cr = t.credit > 0;
    // the penalty fee a bank levies on a return is a charge, not a second bounce
    var retChgRe = /(return|rtn|retn|\bret\b|bounce|dishon|unpaid)[^a-z]{0,4}(chgs?|chrgs?|charges?|fees?)|(chgs?|chrgs?|charges?|fees?)[^a-z]{0,4}(for\s*)?(return|rtn|bounce|dishon)/i;
    if (dr && retChgRe.test(s)) tags.push('RETURN_CHARGE');
    else if (RE_BOUNCE.test(s)) {
      if (dr && /chrg|charge|\bchgs?\b|\bfees?\b/i.test(s)) tags.push('RETURN_CHARGE');
      else tags.push('BOUNCE_' + (/i\/?w|inward/i.test(s) ? 'INWARD' : (/o\/?w|outward/i.test(s) ? 'OUTWARD' : 'RETURN')));
    }
    if (dr && /\b(chq|cheque|chk)\b/i.test(s) && !/dep|\bret\b|return|rtn|retn|bounce|chrg|charge|\bchg\b|fee|unpaid|self|\bcash\b/i.test(s)) tags.push('CHQ_ISSUED');
    if (cr && (/\b(chq|cheque|chk)\b|\bclg\b|clearing/i.test(s)) && !/\bret\b|return|rtn|retn|bounce|unpaid/i.test(s)) tags.push('CHQ_DEP');
    if (cr && /loan\s*(disb|a\/c|credit|amount|proceed)|disburs|loan\s*cr/i.test(s)) tags.push('LOAN_CR');
    if (cr && /cash\s*dep|by\s*cash|\bcdm\b|cash\s*deposit|cash\s*dep/i.test(s)) tags.push('CASH_DEP');
    if (dr && /\batm\b|\bnwd\b|\batw\b|cash\s*(wdl|withdrawal)|self\s*chq|chq\s*self|by\s*cash/i.test(s) && !/chrg|charge|fee/i.test(s)) tags.push('CASH_WDL');
    if (dr && RE_EMI.test(s) && !/chrg|charge|fee|return|bounce/i.test(s)) tags.push('EMI');
    if (cr && /salary|\bsal\b|payroll|wages|stipend/i.test(s)) tags.push('SALARY');
    if (dr && /chrg|charge|\bchgs?\b|\bfees?\b|sms|\bamc\b|min(imum)?\s*bal|\bgst\b|cgst|sgst|igst|service\s*tax|pen(al|alty)/i.test(s)) tags.push('CHARGE');
    if (cr && /int\.?\s*(pd|paid|cr|credit)|interest|\bint\b/i.test(s)) tags.push('INTEREST_CR');
    if (dr && /int\.?\s*(debit|dr|coll)|od\s*interest|interest\s*debit/i.test(s)) tags.push('INTEREST_DR');
    if (cr && /refund|reversal|\brev\b|reversed/i.test(s)) tags.push('REFUND');
    if (/\bself\b|own\s*a\/c|to\s*self|from\s*self/i.test(s)) tags.push('SELF');
    if ((dr ? t.debit : t.credit) <= 10 && /account\s*verif|a\/c\s*verif|penny|bank\s*account\s*verif|verification/i.test(s)) tags.push('VERIF');
    return tags;
  }

  /* ───────────────────────── spend categories ───────────────────────── */
  var CAT_RULES = [
    ['Insurance', /insur|\blic\b|premium|hdfc\s*life|icici\s*pru|star\s*health|policybazaar|allianz|max\s*life/i],
    ['Investments', /mutual\s*fund|\bsip\b|zerodha|groww|upstox|\bnps\b|\bppf\b|\bcams\b|kfin|demat|securities|smallcase|angel\s*one|\bbse\b|\bnse\b|coin\s*by/i],
    ['Utilities & Bills', /electric|bescom|msedcl|tneb|tangedco|\bwater\b|\bgas\b|piped|broadband|airtel|\bjio\b|vodafone|bsnl|recharge|\bdth\b|tata\s*(play|sky)|bill\s*pay|billdesk|bbps|\bbil\/|postpaid/i],
    ['Food & Shopping', /swiggy|zomato|bigbasket|blinkit|zepto|amazon|flipkart|myntra|meesho|dmart|avenue\s*super|reliance\s*(retail|smart)|more\s*retail|grocer|restaurant|cafe|pizza|mcdonald|domino|starbucks|kirana|supermarket|mart\b/i],
    ['Travel & Fuel', /irctc|uber|\bola\b|redbus|makemytrip|goibibo|indigo|air\s*india|spicejet|fastag|petrol|fuel|\bhpcl\b|\bbpcl\b|\biocl\b|indian\s*oil|shell\s|metro\b/i],
    ['Tax & Government', /income\s*tax|\bitr\b|\btds\b|\btax\b|challan|epfo|\bpf\b|esic|gstn|\bgst\s*(pmt|payment)|cbdt|traces/i],
    ['Rent & Housing', /\brent\b|landlord|housing\s*society|maintenance|nobroker|nestaway/i],
    ['Education', /school|college|universit|tuition|byju|unacademy|\bfees?\b/i],
    ['Healthcare', /hospital|pharm|apollo|medplus|clinic|diagnostic|\blab\b|1mg|netmeds|doctor/i],
    ['Entertainment', /netflix|hotstar|spotify|prime\s*video|bookmyshow|youtube|sony\s*liv|zee5|gaming|dream11/i]
  ];
  function detectCategory(t) {
    var tg = t.tags || [], s = (t.desc || '') + ' ' + (t.ref || '');
    function has(x) { return tg.indexOf(x) >= 0; }
    if (tg.some(function (x) { return x.indexOf('BOUNCE') === 0; })) return 'Cheque / ECS Return';
    if (has('VERIF')) return 'Account Verification';
    if (has('SALARY')) return 'Salary';
    if (has('INTEREST_CR') || has('INTEREST_DR')) return 'Interest';
    if (has('CHARGE')) return 'Bank Charges';
    if (has('EMI')) return 'EMI / Loan';
    if (has('CASH_DEP') || has('CASH_WDL')) return 'Cash';
    if (has('REFUND')) return 'Refund / Reversal';
    if (has('SELF')) return 'Self Transfer';
    for (var i = 0; i < CAT_RULES.length; i++) if (CAT_RULES[i][1].test(s)) return CAT_RULES[i][0];
    if (t.debit > 0 && /\bp2m\b/i.test(s)) return 'UPI Merchant Payments';
    if (t.mode === 'POS/CARD') return 'Card Spend';
    if (t.mode === 'CHEQUE') return 'Cheque';
    if (t.mode === 'UPI' || t.mode === 'IMPS' || t.mode === 'NEFT' || t.mode === 'RTGS' || t.mode === 'TRANSFER') return t.credit > 0 ? 'Transfer In' : 'Transfer Out';
    return 'Others';
  }
  /* Report-style category (used on the Excel sheets): spend heads, loan heads and "Transfer to/from <party>". */
  var PF_RULES = [
    ['Alcohol', /spirits|liquor|\bwines?\b|brewer|\bbeer\b|\bbar\s*(&|and)\s*rest/i],
    ['Fuel', /petrol|\bfuel\b|\bhpcl\b|\bbpcl\b|\biocl\b|indian\s*oil|\bcng\b|bharat\s*petro|filling\s*st|\bhp\s*pay\b|\bpump\b/i],
    ['Travel', /irctc|\buber\b|\bola\b|rapido|redbus|abhibus|makemytrip|goibibo|yatra|cleartrip|indigo|air\s*india|spicejet|fastag|\bmetro\b|\bcab\b|railway|tsrtc|apsrtc|ksrtc|\bmsrtc\b|\bbus\s*(ticket|svc)/i],
    ['Entertainment', /netflix|hotstar|spotify|prime\s*video|bookmyshow|youtube|sony\s*liv|zee5|jiocinema|dream11|\bpvr\b|\binox\b|cinema|theatre|gaming/i],
    ['Medical', /hospital|pharm|apollo|medplus|clinic|diagnostic|\blab\b|1mg|netmeds|doctor|medical|dental|\bmedic/i],
    ['Groceries', /bigbasket|blinkit|zepto|kirana|supermarket|\bmart\b|grocer|vegetable|\bdairy\b|\bmilk\b|provision|dmart|chicken|mutton|\bmeat\b|fruits?\b/i],
    ['Food', /swiggy|zomato|restaurant|cafe|pizza|mcdonald|domino|starbucks|tiffin|tiff\b|\bhotel\b|\bfoods?\b|biryani|bakery|\btea\b|juice|sweets?\b|dhaba|kitchen|burger|bhavan|canteen|ice\s*cream|\bkfc\b|chai\b|\bmess\b|snacks?/i],
    ['Utilities', /recharge|electric|bescom|tneb|tangedco|msedcl|tsspdcl|apspdcl|\bgas\b|broadband|airtel|\bjio\b|vodafone|\bbsnl\b|\bdth\b|tata\s*(play|sky)|water\s*(bill|board)|postpaid|billdesk|bbps/i],
    ['Education', /school|college|universit|tuition|byju|unacademy|\bfees?\b/i],
    ['Insurance', /insur|\blic\b|premium|hdfc\s*life|icici\s*pru|star\s*health|policybazaar|allianz|max\s*life/i],
    ['Rent', /\brent\b|landlord|nobroker|nestaway/i],
    ['Tax', /income\s*tax|\bitr\b|\btds\b|challan|gstn|\bgst\s*(pmt|payment)|cbdt|traces/i],
    ['Clothing', /textile|clothing|fashion|garment|myntra|boutique|\bwear\b|tailor|saree|\btrends\b/i],
    ['Vehicle', /motors?\b|automobile|garage|\btyres?\b|\btires?\b|vehicle|\bbike\b|spares?\b|\bservice\s*cent/i],
    ['Household', /hardware|furniture|electronics|appliance|utensil|household|home\s*needs|plywood|paints?\b/i],
    ['Personal Care', /salon|\bhair\b|beauty|parlou?r|cosmetic|barber|\bspa\b/i],
    ['Logistics', /courier|logistic|cargo|dtdc|bluedart|delhivery|transport/i]
  ];
  var RE_CCPAY = /cc\s*bill|credit\s*card|\bcc\s*pay|cred\s*club|cred\.club|\bccpay|card\s*(bill|payment)/i;
  var RE_HOMELOAN = /home\s*(loan|ln)|housing\s*(loan|fin)|\bhfc\b|\bhfl\b|\bhl\s*emi/i;
  function nameKey(s) { return String(s || '').toUpperCase().replace(/\b(MR|MRS|MS|MISS|SHRI|SMT|SRI|DR|M\/S|MESSRS)\b\.?/g, ' ').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function isOwnName(holder, cpty) {
    var h = nameKey(holder).replace(/ /g, ''), k = nameKey(cpty).replace(/ /g, '');
    if (h.length < 6 || k.length < 8) return false;
    return h.indexOf(k) === 0 || k.indexOf(h) === 0;
  }

  // Internal-money detection: own name, sister concerns (similar name or listed by the user) and the same person / firm at
  // another bank (a holder name or account number from the other uploaded accounts).
  var ORG_WORDS = /\b(PRIVATE|PVT|LIMITED|LTD|LLP|OPC|ENTERPRISES?|INDUSTRIES|INDUSTRY|TRADERS?|TRADING|TECHNOLOGIES|TECHNOLOGY|TECH|SERVICES?|SOLUTIONS?|CONSULTING|CONSULTANTS?|INFRA|INFRASTRUCTURE|CONSTRUCTIONS?|ASSOCIATES|AGENCIES|AGENCY|DISTRIBUTORS?|DISTRIBUTION|PROJECTS?|VENTURES?|GLOBAL|EXPORTS?|IMPORTS?|FOODS?|PHARMA|LOGISTICS|MOTORS|MARKETING|COMPANY|CO|CORPORATION|CORP|FIRM|STORES?|MART|HOLDINGS?|CAPITAL|FINANCE|FINSERV|FARMS?|DAIRY|MEDIA|SYSTEMS|WORKS|PRODUCTS|SOFTWARE)\b/;
  var STEM_SKIP = {}; ('SRI SAI SHRI SREE SRINIVASA NEW THE GLOBAL INDIA INDIAN NATIONAL UNITED GENERAL ROYAL STAR SUPER MODERN PRIME FIRST GOLDEN SILVER GREEN BLUE SUN SKY VISION SMART PREMIER UNIVERSAL ALPHA OMEGA BHARAT HYDERABAD BANGALORE MUMBAI DELHI CHENNAI ANDHRA TELANGANA KARNATAKA').split(' ').forEach(function (w) { STEM_SKIP[w] = 1; });
  function nameStem(name) {
    var toks = nameKey(name).split(' ').filter(function (w) { return w && !ORG_WORDS.test(w) && !STEM_SKIP[w]; });
    return toks.length && toks[0].length >= 5 ? toks[0] : '';
  }
  function relation(holder, cpty, desc, o) {
    o = o || {};
    var ck = nameKey(cpty).replace(/ /g, '');
    if (cpty && holder && isOwnName(holder, cpty)) return { tag: 'SELF', why: 'Own name' };
    var i, rk;
    for (i = 0; ck && o.related && i < o.related.length; i++) {
      rk = nameKey(o.related[i]).replace(/ /g, '');
      if (rk.length >= 5 && (ck.indexOf(rk) >= 0 || (ck.length >= 6 && rk.indexOf(ck) === 0))) return { tag: 'RELATED_PARTY', why: 'Related party you listed (' + String(o.related[i]).trim() + ')' };
    }
    var dd = String(desc || '').replace(/[^0-9]/g, ' ');
    for (i = 0; o.otherAccounts && i < o.otherAccounts.length; i++) {
      var oa = o.otherAccounts[i], an = String(oa.accountNo || '').replace(/[^0-9]/g, '');
      if (cpty && oa.holder && isOwnName(oa.holder, cpty)) return { tag: 'OWN_OTHER_BANK', why: 'Same holder as another uploaded account' + (oa.bank ? ' (' + oa.bank + ')' : '') };
      if (an.length >= 9 && (' ' + dd + ' ').indexOf(an) >= 0) return { tag: 'OWN_OTHER_BANK', why: 'Narration carries the number of another uploaded account' };
    }
    if (o.sister !== false && cpty && holder) {
      var st = nameStem(holder);
      if (st && nameKey(cpty).split(' ')[0] === st && (ORG_WORDS.test(nameKey(holder)) || ORG_WORDS.test(nameKey(cpty)))) return { tag: 'SISTER_CONCERN', why: 'Probable sister concern (name starts with "' + st + '")' };
    }
    return null;
  }
  function pfCat(t) {
    var tg = t.tags || [], s = (t.desc || '') + ' ' + (t.ref || ''), dr = t.debit > 0, cr = t.credit > 0;
    function has(x) { return tg.indexOf(x) >= 0; }
    if (tg.some(function (x) { return x.indexOf('BOUNCE') === 0; })) return 'Cheque Bounce';
    if (has('SALARY')) return 'Salary';
    if (has('LOAN_CR')) return 'Loan Credit';
    if (has('INTEREST_CR') || has('INTEREST_DR')) return 'Interest';
    if (has('CHARGE') || has('RETURN_CHARGE')) return 'Bank Charges';
    if (has('CASH_WDL')) return 'Cash Withdrawal';
    if (has('CASH_DEP')) return 'Cash Deposit';
    if (has('REFUND')) return 'Reversal';
    if (dr && RE_CCPAY.test(s)) return 'Credit Card Payment';
    if (has('SELF')) return cr ? 'Transfer from Self' : 'Transfer To Self';
    if (has('EMI') && dr) return RE_HOMELOAN.test(s) ? 'Home Loan' : 'Loan';
    if (t.cat === 'Investments') return cr ? 'Investment Income' : 'Investment Expense';
    if (has('CHQ_DEP')) return 'Cheque Deposit';
    if (has('CHQ_ISSUED')) return 'Cheque Issued';
    if (dr) for (var i = 0; i < PF_RULES.length; i++) if (PF_RULES[i][1].test(s)) return PF_RULES[i][0];
    var xfer = ['UPI', 'IMPS', 'NEFT', 'RTGS', 'TRANSFER', 'CHEQUE'].indexOf(t.mode) >= 0;
    if (xfer && t.cpty) return (cr ? 'Transfer from ' : 'Transfer to ') + t.cpty;
    return 'Others';
  }
  // Pattern-based detection: a fixed debit that repeats monthly is an EMI/standing instruction;
  // a similar-sized credit from the same party each month is probably salary.
  function refineRecurring(txns) {
    var groups = {};
    txns.forEach(function (t) {
      if (!t.cpty) return;
      var side = t.debit > 0 ? 'D' : (t.credit > 0 ? 'C' : null);
      if (!side) return;
      var key = side + t.cpty.replace(/[^A-Z]/g, '');
      if (key.length < 5) return;
      var g = groups[key] || (groups[key] = { side: side, list: [] });
      g.list.push({ t: t, amt: side === 'D' ? t.debit : t.credit, m: monthKey(t.date) });
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], ms = {};
      g.list.forEach(function (x) { ms[x.m] = 1; });
      var nm = Object.keys(ms).length;
      if (nm < 3 || g.list.length > nm * 2) return;
      var amts = g.list.map(function (x) { return x.amt; }), med = median(amts);
      var spread = (Math.max.apply(null, amts) - Math.min.apply(null, amts)) / (med || 1);
      if (g.side === 'D') {
        if (spread > 0.02) return;
        g.list.forEach(function (x) {
          var t = x.t;
          if (t.tags.indexOf('CHARGE') >= 0 || t.tags.some(function (z) { return z.indexOf('BOUNCE') === 0; })) return;
          var emiLike = t.mode === 'ECS/NACH' || RE_EMI.test(t.desc);
          if (emiLike && t.tags.indexOf('EMI') < 0) t.tags.push('EMI');
          else if (!emiLike && t.tags.indexOf('RECURRING') < 0) t.tags.push('RECURRING');
        });
      } else {
        if (spread > 0.3 || med < 5000) return;
        g.list.forEach(function (x) {
          var t = x.t;
          if (t.tags.some(function (z) { return ['CASH_DEP', 'INTEREST_CR', 'REFUND', 'SELF'].indexOf(z) >= 0; })) return;
          if (t.tags.indexOf('SALARY') < 0) { t.tags.push('SALARY'); t.tags.push('PROBABLE_SALARY'); }
        });
      }
    });
  }

  /* ───────────────────────── chain resolution & analysis ───────────────────────── */
  var CR_WORDS = /\b(cr|credit|deposit|dep|refund|reversal|salary|received|by\s*transfer|int\.?\s*pd|interest\s*(paid|credit))\b/i;
  function normalizeRaw(t) {
    if (t.res) return Object.assign({}, t);
    var o = { date: t.date, valueDate: t.valueDate || '', desc: (t.desc || '').replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim(), ref: (t.ref || '').trim(), debit: 0, credit: 0, amt: null, balance: t.balance, dirKnown: false, page: t.page, src: t.src };
    if (t.debit != null || t.credit != null) {
      o.debit = t.debit || 0; o.credit = t.credit || 0; o.dirKnown = true;
    } else if (t.amount != null) {
      o.amt = t.amount;
      var ind = (t.ind || '').trim().toLowerCase();
      if (/^(cr|c|credit|deposit)\.?$/.test(ind) || t.side === 'C') { o.credit = t.amount; o.dirKnown = true; }
      else if (/^(dr|d|debit|withdrawal)\.?$/.test(ind) || t.side === 'D') { o.debit = t.amount; o.dirKnown = true; }
    }
    return o;
  }
  function chain(list, reverse, start) {
    var out = list.map(function (o) { return Object.assign({}, o); });
    if (reverse) out.reverse();
    var prev = (start != null && isFinite(start)) ? start : null, ok = 0, tot = 0;
    out.forEach(function (t) {
      if (!t.dirKnown && t.amt != null) {
        if (prev != null && t.balance != null) {
          var d = t.balance - prev;
          if (Math.abs(d - t.amt) <= TOL) { t.credit = t.amt; t.debit = 0; t.dirKnown = true; t.inferred = 'balance'; }
          else if (Math.abs(d + t.amt) <= TOL) { t.debit = t.amt; t.credit = 0; t.dirKnown = true; t.inferred = 'balance'; }
        }
        if (!t.dirKnown) {
          if (CR_WORDS.test(t.desc + ' ' + t.ref)) t.credit = t.amt; else t.debit = t.amt;
          t.dirKnown = true; t.inferred = 'keyword';
        }
      }
      t.chainOk = null; t.diff = null;
      if (t.balance != null) {
        if (prev != null) {
          tot++;
          var exp = prev + t.credit - t.debit;
          if (Math.abs(exp - t.balance) <= TOL) { ok++; t.chainOk = true; }
          else { t.chainOk = false; t.diff = r2(t.balance - exp); }
        }
        prev = t.balance;
      }
    });
    return { out: out, ok: ok, tot: tot, ratio: tot ? ok / tot : null };
  }
  function swapDirs(list) { return list.map(function (t) { var o = Object.assign({}, t); var x = o.debit; o.debit = o.credit; o.credit = x; return o; }); }

  var RE_OPEN = /^\s*b\/?f\s*$|^\s*opening\s*$|^\s*opening\s*(bal|balance)?\s*:?\s*$|opening\s*bal|balance\s*b\/?f|brought\s*forward|bal(ance)?\s*forward|opening\s*balance/i;
  var RE_CLOSE = /closing\s*bal|balance\s*c\/?f|carried\s*forward/i;

  function analyze(raw, ctx) {
    ctx = ctx || {};
    var warnings = (ctx.warnings || []).slice();
    var list = raw.filter(function (t) { return t.date && (t.res || t.debit != null || t.credit != null || t.amount != null || t.balance != null); }).map(normalizeRaw);
    var openingStated = null, closingStated = null;
    list = list.filter(function (t) {
      var noAmt = !t.debit && !t.credit && t.amt == null;
      if (noAmt && t.balance != null && RE_OPEN.test(t.desc)) { if (openingStated == null) openingStated = t.balance; return false; }
      if (noAmt && t.balance != null && RE_CLOSE.test(t.desc)) { closingStated = t.balance; return false; }
      if (noAmt && t.balance == null) return false;
      return true;
    });
    var fwd = chain(list, false, openingStated), chosen = fwd, reversed = false, swapped = false;
    if (ctx.reorder !== false && list.length > 2) {
      var rev = chain(list, true, openingStated);
      var rf = fwd.ratio, rr = rev.ratio;
      if (rf != null && rr != null) {
        if (rr > rf + 0.02) { chosen = rev; reversed = true; }
      } else if (list[0].date > list[list.length - 1].date) { chosen = rev; reversed = true; }
      if (reversed) warnings.push('Statement was in newest-first order; re-ordered chronologically.');
    }
    // Overdraft / cash-credit statements often print the balance without a minus sign although it is a debit balance
    // (credits make the printed figure smaller, debits larger). Try the same rows with every balance negated.
    if ((chosen.ratio == null || chosen.ratio < 0.9) && list.length > 4 && list.some(function (t) { return t.balance != null; })) {
      var negList = list.map(function (t) { var o = Object.assign({}, t); if (o.balance != null) o.balance = -o.balance; return o; });
      var nf = chain(negList, false, openingStated != null ? -openingStated : null), nr = ctx.reorder !== false ? chain(negList, true, openingStated != null ? -openingStated : null) : null;
      var nb = nr && nr.ratio != null && (nf.ratio == null || nr.ratio > nf.ratio) ? nr : nf, nrev = nb === nr;
      if (nb.ratio != null && nb.ratio >= 0.9 && nb.ratio > (chosen.ratio == null ? 0 : chosen.ratio) + 0.1) {
        chosen = nb; reversed = nrev; swapped = false;
        warnings.push('Balances were printed without a minus sign although the account is overdrawn; read as debit (overdrawn) balances.' + (nrev ? ' Statement was in newest-first order; re-ordered chronologically.' : ''));
      }
    }
    if (chosen.ratio != null && chosen.ratio < 0.5 && chosen.tot >= 5 && list.some(function (t) { return t.dirKnown && !t.inferred; })) {
      var base = chosen.out.map(function (t) { var o = Object.assign({}, t); if (o.inferred) { o.dirKnown = false; o.debit = 0; o.credit = 0; } return o; });
      var alt = chain(swapDirs(base), false, openingStated);
      if (alt.ratio != null && alt.ratio > chosen.ratio + 0.3) { chosen = alt; swapped = true; warnings.push('Debit and credit columns looked swapped; corrected using the running balance.'); }
    }
    var txns = chosen.out;
    txns.forEach(function (t, i) {
      t.n = i + 1; t.res = true;
      t.debit = r2(t.debit); t.credit = r2(t.credit);
      t.mode = detectMode(t); t.tags = detectTags(t); t.cpty = counterparty(t.desc);
    });
    refineRecurring(txns);
    txns.forEach(function (t) { t.cat = detectCategory(t); });
    // opening / closing
    var opening = null, closing = null, firstB = null;
    for (var i = 0; i < txns.length; i++) if (txns[i].balance != null) { firstB = txns[i]; break; }
    if (openingStated != null) opening = openingStated;
    else if (firstB) opening = r2(firstB.balance - firstB.credit + firstB.debit);
    for (var j = txns.length - 1; j >= 0; j--) if (txns[j].balance != null) { closing = txns[j].balance; break; }
    if (closing == null && closingStated != null) closing = closingStated;
    var tc = 0, td = 0, nc = 0, nd = 0;
    txns.forEach(function (t) { if (t.credit > 0) { tc += t.credit; nc++; } if (t.debit > 0) { td += t.debit; nd++; } });
    tc = r2(tc); td = r2(td);
    var reconciled = null;
    if (opening != null && closing != null) reconciled = Math.abs(opening + tc - td - closing) <= Math.max(0.05, txns.length * 0.005);
    var missingBal = txns.filter(function (t) { return t.balance == null; }).length;
    if (missingBal) warnings.push(missingBal + ' transaction(s) have no running balance; direction was inferred from keywords where needed.');
    if (chosen.ratio != null && chosen.ratio < 0.9) warnings.push('Running-balance check passed on ' + Math.round(chosen.ratio * 100) + '% of rows. Review rows flagged in the table (possible missing page or mis-read figures).');
    var dates = txns.map(function (t) { return t.date; }).sort();
    return {
      meta: ctx.meta || {}, txns: txns,
      from: dates[0] || '', to: dates[dates.length - 1] || '',
      opening: opening, closing: closing, totalCredits: tc, totalDebits: td, countCredits: nc, countDebits: nd,
      reconciled: reconciled, chainRatio: chosen.ratio, chainChecked: chosen.tot, reversed: reversed, swapped: swapped,
      warnings: warnings, parseMode: ctx.parseMode || '', layout: ctx.layout || null, ocr: !!ctx.ocr, fileName: ctx.fileName || ''
    };
  }

  /* ───────────────────────── document parse ───────────────────────── */
  // pages: [{rows, charW}]   opts: {mode:'auto'|'header'|'line', ocr:bool, allowInt:bool, fileName}
  function parseDocument(pages, opts) { return parseDocumentMulti(pages, opts)[0]; }
  // A file may hold several accounts (e.g. a PPF and a savings account in one ICICI download): returns one statement per account.
  function parseDocumentMulti(pages, opts) {
    opts = opts || {};
    var rows = [];
    pages.forEach(function (pg, pi) { pg.rows.forEach(function (r) { rows.push({ y: r.y, words: r.words, page: pi }); }); });
    if (!rows.length) {
      var e = analyze([], { meta: {}, fileName: opts.fileName, ocr: opts.ocr });
      e.warnings.push('No readable text found in this file. It looks like a scan or a re-printed copy. Please upload the original PDF downloaded from the bank (if it is locked, the tool will ask for the password).');
      return [e];
    }
    var charW = median(pages.map(function (p) { return p.charW; }).filter(Boolean)) || 5;
    var ctx = { ocr: !!opts.ocr, allowInt: !!opts.allowInt };
    var meta = extractMeta(rows);
    // pages that carry no account details (e.g. a statement saved without its first page): fall back to the file name
    if (opts.fileName) {
      var fnm = String(opts.fileName).replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');
      if (!meta.accountNo) { var an = fnm.match(/(?:[Xx*]{3,}\d{3,6}|\b\d{9,18}\b)/); if (an) meta.accountNo = an[0].toUpperCase().replace(/\*/g, 'X'); }
      if (!meta.bank) { for (var bi = 0; bi < BANKS.length; bi++) { if (BANKS[bi][1].test(fnm)) { meta.bank = BANKS[bi][0]; break; } } }
    }
    if (!meta.bank) {   // bank name only in the footer (e.g. "generated through bob World")
      var tail = rows.slice(-25).map(function (r) { return r.words.map(function (w) { return w.t; }).join(' '); }).join('\n');
      for (var bj = 0; bj < BANKS.length; bj++) { if (BANKS[bj][1].test(tail)) { meta.bank = BANKS[bj][0]; break; } }
    }
    var starts = [], seen = {};
    rows.forEach(function (r, i) {
      var tx = r.words.map(function (w) { return w.t; }).join(' ');
      var mm = tx.match(/statement\s+of\s+transactions\s+in\s+(?:(\w+)\s+)?account\s+number\s*[:\-]?\s*([0-9Xx*]{6,20})/i);
      if (mm) starts.push({ i: i, acct: mm[2].toUpperCase(), kind: mm[1] || '' });
    });
    var distinct = {}; starts.forEach(function (x) { distinct[x.acct] = 1; });
    if (Object.keys(distinct).length >= 2) {
      var allText = rows.map(function (r) { return r.words.map(function (w) { return w.t; }).join(' '); }).join('\n');
      var out = [];
      starts.forEach(function (st, k) {
        var seg = rows.slice(st.i, k + 1 < starts.length ? starts[k + 1].i : rows.length);
        var m2 = JSON.parse(JSON.stringify(meta)); m2.accountNo = st.acct;
        var ty = allText.match(new RegExp('(savings|current|ppf|fixed\\s*deposit|recurring)\\s*(?:a\\/c|account)\\s*' + st.acct, 'i')); 
        m2.accountType = ty ? ty[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : (st.kind ? st.kind.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : m2.accountType);
        var r1 = parseRows(seg, charW, ctx, m2, opts);
        if (r1.txns.length) {
          var prev = out.filter(function (o) { return o.meta.accountNo === st.acct; })[0];
          if (!prev) out.push(r1);
        }
      });
      if (out.length) return out;
    }
    return [parseRows(rows, charW, ctx, meta, opts)];
  }
  function parseRows(rows, charW, ctx, meta, opts) {
    var A = null, B = null, sa = null, sb = null;
    if (opts.mode !== 'line') { A = parseHeaderMode(rows, charW, ctx); sa = analyze(A.raw, { meta: meta, parseMode: 'table-header', layout: A.layout, ocr: opts.ocr, fileName: opts.fileName }); }
    if (opts.mode !== 'header') { B = parseLineMode(rows, charW, ctx); sb = analyze(B.raw, { meta: meta, parseMode: 'line-pattern', ocr: opts.ocr, fileName: opts.fileName }); }
    function score(s) {
      if (!s || !s.txns.length) return 0;
      var ratio = s.chainRatio == null ? 0.5 : s.chainRatio;
      return s.txns.length * (0.25 + 0.75 * ratio);
    }
    var pick;
    if (sa && sb) pick = score(sa) >= 0.85 * score(sb) ? sa : sb; else pick = sa || sb;
    if (!meta.from && pick.from) { meta.from = pick.from; meta.to = pick.to; }
    if (!pick.txns.length) pick.warnings.push('No transactions detected. Try "Line-pattern" parsing mode or enable OCR for scanned files.');
    return pick;
  }

  /* ───────────────────────── merge (same account only) ───────────────────────── */
  // keep only transactions between two months (keys 'YYYY-MM'), inclusive
  function rangeStatement(stm, fromKey, toKey) {
    if (!stm.txns.length || (!fromKey && !toKey)) return stm;
    var lo = fromKey ? fromKey + '-01' : '0000-00-00', hi = toKey ? toKey + '-31' : '9999-99-99';
    var tx = stm.txns.filter(function (t) { return t.date >= lo && t.date <= hi; });
    if (!tx.length || tx.length === stm.txns.length) return stm;
    var keep = stm.warnings.filter(function (w) { return /Gap between|overlapped|No readable|re-ordered|swapped/.test(w); });
    var out = analyze(tx, { meta: stm.meta, reorder: false, parseMode: stm.parseMode, layout: stm.layout, ocr: stm.ocr, fileName: stm.fileName, warnings: keep });
    out.files = stm.files; out.windowed = 'range'; out.rangeFrom = fromKey; out.rangeTo = toKey;
    return out;
  }
  function mergeStatements(stmts) {
    var sorted = stmts.slice().sort(function (a, b) { return (a.from || '9').localeCompare(b.from || '9'); });
    var merged = [], ranges = [], warnings = [];
    sorted.forEach(function (s) {
      var tx = s.txns;
      if (ranges.length) {
        var before = tx.length;
        tx = tx.filter(function (t) { return !ranges.some(function (r) { return t.date >= r.from && t.date <= r.to; }); });
        if (before - tx.length > 0) warnings.push(s.fileName + ': ' + (before - tx.length) + ' transaction(s) overlapped an earlier file and were skipped.');
      }
      if (s.from) ranges.push({ from: s.from, to: s.to });
      tx.forEach(function (t) { var o = Object.assign({}, t); o.src = s.fileName; merged.push(o); });
    });
    var meta = {};
    sorted.forEach(function (s) { ['bank', 'ifsc', 'accountNo', 'holder', 'accountType', 'limit', 'micr', 'branch'].forEach(function (k) { if (!meta[k] && s.meta && s.meta[k]) meta[k] = s.meta[k]; }); });
    var out = analyze(merged, { meta: meta, reorder: false, parseMode: 'merged', ocr: sorted.some(function (s) { return s.ocr; }), warnings: warnings });
    out.files = sorted.map(function (s) { return { name: s.fileName, txns: s.txns.length, from: s.from, to: s.to, mode: s.parseMode, ocr: s.ocr, ratio: s.chainRatio, docInfo: s.docInfo }; });
    var gaps = [];
    for (var i = 1; i < sorted.length; i++) {
      if (sorted[i - 1].to && sorted[i].from && dayNum(sorted[i].from) - dayNum(sorted[i - 1].to) > 35) gaps.push(fmtDate(sorted[i - 1].to) + ' → ' + fmtDate(sorted[i].from));
    }
    if (gaps.length) out.warnings.push('Gap between uploaded files: ' + gaps.join('; ') + '. Upload the missing period for a complete analysis.');
    return out;
  }
  // Restrict a statement to its last N calendar months (N = 0 → everything)
  function windowStatement(stm, nMonths) {
    if (!nMonths || !stm.txns.length || !stm.to) return stm;
    var p = stm.to.slice(0, 7).split('-'), y = +p[0], m = +p[1] - (nMonths - 1);
    while (m < 1) { m += 12; y--; }
    var cut = y + '-' + pad(m) + '-01';
    var tx = stm.txns.filter(function (t) { return t.date >= cut; });
    if (!tx.length || tx.length === stm.txns.length) return stm;
    var keep = stm.warnings.filter(function (w) { return /Gap between|overlapped|No readable|re-ordered|swapped/.test(w); });
    var out = analyze(tx, { meta: stm.meta, reorder: false, parseMode: stm.parseMode, layout: stm.layout, ocr: stm.ocr, fileName: stm.fileName, warnings: keep });
    out.files = stm.files;
    out.windowed = nMonths;
    return out;
  }
  function recompute(stm) {
    var out = analyze(stm.txns, { meta: stm.meta, reorder: false, parseMode: stm.parseMode, layout: stm.layout, ocr: stm.ocr, fileName: stm.fileName });
    out.files = stm.files;
    return out;
  }


  /* ───────────────────────── v2.1: manual corrections + consolidated (multi-account) view ───────────────────────── */
  // Identity of a transaction that does not depend on its direction, so a fix survives re-reading and re-windowing.
  function txnKey(t) { return [t.date, r2(t.debit > 0 ? t.debit : (t.credit || 0)), t.balance == null ? '' : t.balance, (t.desc || '').slice(0, 30)].join('|'); }
  // Swap debit/credit on the chosen rows and re-run the checks; the rows stay visibly marked.
  function applyFixes(stm, keys) {
    if (!keys || !keys.length) return stm;
    var set = {}; keys.forEach(function (k) { set[k] = 1; });
    var hit = 0, tx = stm.txns.map(function (t) {
      if (!set[txnKey(t)]) return t;
      hit++; var o = Object.assign({}, t), d = o.debit; o.debit = o.credit || 0; o.credit = d || 0; return o;
    });
    if (!hit) return stm;
    var out = recompute(Object.assign({}, stm, { txns: tx }));
    out.txns.forEach(function (t) { if (set[txnKey(t)] && t.tags.indexOf('MANUAL_FIX') < 0) t.tags.push('MANUAL_FIX'); });
    out.warnings = (stm.warnings || []).concat(out.warnings.filter(function (w) { return (stm.warnings || []).indexOf(w) < 0; }));
    out.warnings.push(hit + ' row(s) were corrected by hand (debit/credit swapped) and carry the MANUAL_FIX flag.');
    out.manualFixes = hit; out.files = stm.files; out.docInfo = stm.docInfo;
    return out;
  }
  // Rows where swapping debit and credit would make the running balance agree (difference = twice the amount).
  function swapCandidates(stm) {
    return stm.txns.filter(function (t) { var a = t.debit > 0 ? t.debit : t.credit; return t.chainOk === false && a > 0 && t.diff != null && Math.abs(Math.abs(t.diff) - 2 * a) < 0.02; }).map(txnKey);
  }
  // Combine several accounts (items = [{ stmt, report }]) into one view. Money moved between the uploaded accounts is matched and set aside.
  function consolidate(items) {
    var accts = items.map(function (it, i) {
      var m = it.stmt.meta || {}, r = it.report;
      return { idx: i, label: (m.bank || 'Bank') + ' · ' + (m.accountNo || 'a/c ' + (i + 1)), holder: m.holder || '', type: m.accountType || '', from: it.stmt.from, to: it.stmt.to,
        opening: it.stmt.opening, closing: it.stmt.closing, turn: r.turnover ? r.turnover.amount : null, cr: it.stmt.totalCredits, dr: it.stmt.totalDebits, nCr: it.stmt.countCredits, nDr: it.stmt.countDebits,
        abb: r.abb, minBal: r.minBal, bounces: r.bounces, score: r.insights ? r.insights.score : null, limit: r.limit || 0, od: r.od && r.od.limit > 0 ? r.od.avgPct : null };
    });
    // inter-account matching: same amount, opposite sides, within a day, each entry used once
    var crIdx = {}, inter = [];
    items.forEach(function (it, i) { it.stmt.txns.forEach(function (t, j) { if (t.credit > 0) (crIdx[Math.round(t.credit * 100)] = crIdx[Math.round(t.credit * 100)] || []).push({ a: i, j: j, t: t, used: false }); }); });
    items.forEach(function (it, i) {
      it.stmt.txns.forEach(function (t, j) {
        if (!(t.debit > 0)) return;
        var list = crIdx[Math.round(t.debit * 100)]; if (!list) return;
        for (var k = 0; k < list.length; k++) {
          var c = list[k]; if (c.used || c.a === i || Math.abs(dayNum(c.t.date) - dayNum(t.date)) > 1) continue;
          c.used = true; inter.push({ date: t.date, amount: t.debit, from: i, to: c.a, fromDesc: t.desc, toDesc: c.t.desc }); break;
        }
      });
    });
    inter.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var interTotal = r2(inter.reduce(function (s, x) { return s + x.amount; }, 0));
    // combined month table and combined daily balance
    var mon = {}, days = {};
    items.forEach(function (it, i) {
      it.report.monthly.forEach(function (x) { var o = mon[x.key] || (mon[x.key] = { key: x.key, label: x.label, crA: 0, drA: 0, adb: 0, n: 0, hasAdb: false }); o.crA += x.crA; o.drA += x.drA; o.n += x.n; if (x.adb != null) { o.adb += x.adb; o.hasAdb = true; } });
    });
    var monthly = Object.keys(mon).sort().map(function (k) { var o = mon[k]; o.crA = r2(o.crA); o.drA = r2(o.drA); o.net = r2(o.crA - o.drA); o.adb = o.hasAdb ? r2(o.adb) : null; return o; });
    var all = []; items.forEach(function (it) { it.report.daily.forEach(function (d) { all.push(d[0]); }); });
    var dmin = all.length ? all.reduce(function (a, b) { return a < b ? a : b; }) : null, dmax = all.length ? all.reduce(function (a, b) { return a > b ? a : b; }) : null;
    var combinedAbb = null;
    if (dmin) {
      var maps = items.map(function (it) { var m = {}; it.report.daily.forEach(function (d) { m[d[0]] = d[1]; }); return { m: m, last: null }; }), tot = 0, n = 0;
      for (var dn = dayNum(dmin); dn <= dayNum(dmax); dn++) {
        var iso = isoFromDayNum(dn), sum_ = 0;
        maps.forEach(function (mp) { if (mp.m[iso] != null) mp.last = mp.m[iso]; if (mp.last != null) sum_ += mp.last; });
        tot += sum_; n++;
      }
      combinedAbb = n ? r2(tot / n) : null;
    }
    var T = { cr: 0, dr: 0, opening: 0, closing: 0, bounces: 0, turn: 0 };
    accts.forEach(function (a) { T.cr += a.cr || 0; T.dr += a.dr || 0; T.opening += a.opening || 0; T.closing += a.closing || 0; T.bounces += a.bounces || 0; T.turn += a.turn || 0; });
    ['cr', 'dr', 'opening', 'closing', 'turn'].forEach(function (k) { T[k] = r2(T[k]); });
    T.crExInter = r2(T.cr - interTotal); T.drExInter = r2(T.dr - interTotal);
    return { accounts: accts, totals: T, inter: inter, interTotal: interTotal, monthly: monthly, combinedAbb: combinedAbb };
  }
  function consolidatedSheets(cons) {
    var cs = function (v, s) { return { v: v == null ? '' : v, t: 's', s: s || 'td' }; }, cn = function (v, s) { return { v: v == null || v === '' ? '' : v, s: s || 'tdn' }; };
    var cd = function (iso) { return iso ? { v: excelSerial(iso), s: 'tdd' } : cs(''); }, th = function (a) { return a.map(function (x) { return cs(x, 'th'); }); };
    var A = [[cs('ALL ACCOUNTS — combined view', 'title')], [], th(['Account', 'Holder', 'Type', 'From', 'To', 'Opening', 'Total Credits', 'Total Debits', 'Closing', 'Avg Daily Balance', 'Min Balance', 'Cheque / ECS Returns', 'Behaviour Score', 'OD/CC Avg Utilisation %'])];
    cons.accounts.forEach(function (a) { A.push([cs(a.label), cs(a.holder), cs(a.type), cd(a.from), cd(a.to), cn(a.opening), cn(a.cr), cn(a.dr), cn(a.closing), cn(a.abb), cn(a.minBal), cn(a.bounces, 'tdi'), cn(a.score, 'tdi'), cn(a.od == null ? '' : r2(a.od))]); });
    var T = cons.totals;
    A.push([cs('TOTAL', 'tot'), cs('', 'tot'), cs('', 'tot'), cs('', 'tot'), cs('', 'tot'), cn(T.opening, 'tot'), cn(T.cr, 'tot'), cn(T.dr, 'tot'), cn(T.closing, 'tot'), cn(cons.combinedAbb, 'tot'), cs('', 'tot'), cn(T.bounces, 'tot'), cs('', 'tot'), cs('', 'tot')]);
    A.push([]); A.push([cs('Transfers between these accounts', 'lbl'), cn(cons.inter.length, 'tdi')]); A.push([cs('Amount moved between them', 'lbl'), cn(cons.interTotal)]);
    A.push([cs('Credits excluding those transfers', 'lbl'), cn(T.crExInter)]); A.push([cs('Debits excluding those transfers', 'lbl'), cn(T.drExInter)]);
    var M = [th(['Month', 'Combined Credits', 'Combined Debits', 'Net', 'Combined Avg Daily Balance', 'Transactions'])];
    cons.monthly.forEach(function (x) { M.push([cs(x.label), cn(x.crA), cn(x.drA), cn(x.net), cn(x.adb), cn(x.n, 'tdi')]); });
    var X = [th(['Date', 'Amount', 'From account', 'To account', 'Debit narration', 'Credit narration'])];
    cons.inter.forEach(function (x) { X.push([cd(x.date), cn(x.amount), cs(cons.accounts[x.from].label), cs(cons.accounts[x.to].label), cs(x.fromDesc), cs(x.toDesc)]); });
    if (!cons.inter.length) X.push([cs('No matching transfers between the uploaded accounts', 'td')]);
    return [{ name: 'All Accounts', rows: A, widths: [34, 24, 14, 13, 13, 16, 18, 18, 16, 18, 16, 12, 12, 14] },
      { name: 'Combined Monthly', rows: M, widths: [12, 18, 18, 18, 22, 13], freeze: 'A2' },
      { name: 'Transfers Between', rows: X, widths: [13, 16, 34, 34, 60, 60], freeze: 'A2' }];
  }

  /* ───────────────────────── Perfios-style report ───────────────────────── */
  function N(v) { return v == null ? '' : { v: v, t: 'n', z: '#,##0.00' }; }
  function I(v) { return v == null ? '' : { v: v, t: 'n', z: '0' }; }
  function D(iso) { return iso ? { v: excelSerial(iso), t: 'n', z: 'dd-mmm-yyyy' } : ''; }
  function sum(a, f) { return r2(a.reduce(function (s, t) { return s + f(t); }, 0)); }

  /* ───────────────────────── document forensics (metadata indicators only — not proof) ───────────────────────── */
  var RE_EDITOR = /microsoft.{0,12}word|\bword\b|microsoft.{0,12}excel|photoshop|illustrator|canva|ilovepdf|sejda|smallpdf|pdfescape|pdf-?xchange|phantom|foxit|nitro|\bwps\b|pdfelement|wondershare|soda\s*pdf|pdf24|libreoffice|openoffice|google\s*docs|pdftk|pdfsam|pdf\s*editor|inkscape|gimp/i;
  // Printing / re-saving (e.g. Chrome "Print → Save as PDF" after removing a password) is legitimate, so only informational
  var RE_RESAVED = /skia\/pdf|quartz\s*pdfcontext|print\s*to\s*pdf|cairo|ghostscript|pdfwriter/i;
  function parsePdfDate(s) {
    if (!s) return '';
    s = String(s);
    var m = s.match(/(\d{4})(\d{2})(\d{2})/) || s.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? (mkISO(+m[1], +m[2], +m[3]) || '') : '';
  }
  function docChecks(info, lastTxn) {
    var out = { level: 'ok', result: 'OK', findings: [], created: '', modified: '', software: '' };
    if (!info) { out.level = 'info'; out.result = 'INFO'; out.findings.push('No document information available.'); return out; }
    if (info.kind === 'image') { out.level = 'info'; out.result = 'INFO'; out.findings.push('Photo / scan — there is no embedded metadata to check.'); return out; }
    out.created = parsePdfDate(info.creationRaw); out.modified = parsePdfDate(info.modRaw);
    out.software = [info.producer, info.creator].filter(Boolean).join(' / ');
    var sw = out.software, rank = { ok: 0, info: 1, med: 2, high: 3 };
    function raise(level, msg) { out.findings.push(msg); if (rank[level] > rank[out.level]) out.level = level; }
    if (!sw && !out.created) raise('info', 'The file carries no creation metadata, so its origin cannot be checked.');
    if (sw && RE_EDITOR.test(sw)) raise('med', 'Produced or edited with "' + sw + '", which is not typical software for bank-generated statements.');
    else if (sw && RE_RESAVED.test(sw)) raise('info', 'This looks like a printed / re-saved copy ("' + sw + '"), so the bank\'s original metadata is not available.');
    if (out.created && lastTxn && dayNum(out.created) < dayNum(lastTxn) - 1) raise('high', 'The file was created on ' + fmtDate(out.created) + ', before the last transaction it contains (' + fmtDate(lastTxn) + ').');
    if (out.created && out.modified && dayNum(out.modified) - dayNum(out.created) > 1) raise('med', 'Modified ' + (dayNum(out.modified) - dayNum(out.created)) + ' day(s) after it was created (' + fmtDate(out.created) + ' → ' + fmtDate(out.modified) + ').');
    out.result = { ok: 'OK', info: 'INFO', med: 'REVIEW', high: 'HIGH' }[out.level];
    if (out.level === 'ok') out.findings.push('No metadata irregularities found.');
    return out;
  }
  function forensics(stm) {
    var files = stm.files && stm.files.length ? stm.files : [{ name: stm.fileName, to: stm.to, docInfo: stm.docInfo }];
    var rows = files.map(function (f) { var c = docChecks(f.docInfo, f.to); c.name = f.name; c.info = f.docInfo || {}; return c; });
    var flags = [], resaved = 0;
    rows.forEach(function (r) {
      if (r.level === 'high') flags.push({ level: 'high', title: 'Document authenticity', detail: r.name + ': ' + r.findings.join(' ') });
      else if (r.level === 'med') flags.push({ level: 'med', title: 'Document authenticity', detail: r.name + ': ' + r.findings.join(' ') });
      else if (r.level === 'info' && /re-saved/.test(r.findings.join(' '))) resaved++;
    });
    if (resaved) flags.push({ level: 'info', title: 'Re-saved copies', detail: resaved + ' file(s) are printed / re-saved copies, so authenticity cannot be judged from file metadata. The running-balance check still applies.' });
    return { rows: rows, flags: flags };
  }

  function stdev(a) {
    if (a.length < 2) return 0;
    var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / a.length);
  }
  // Behaviour analysis: metrics + plain-language flags + indicative score. Not a credit decision.
  function buildInsights(stm, c) {
    var txns = stm.txns, months = c.monthly, nm = Math.max(1, months.length);
    var has = function (t, tag) { return t.tags.indexOf(tag) >= 0; };
    var flags = [], score = 100;
    function add(level, title, detail, pts) { flags.push({ level: level, title: title, detail: detail }); if (pts) score -= pts; }
    function inr(v) { return '₹' + Math.round(v).toLocaleString('en-IN'); }
    function pct(v) { return Math.round(v * 100) + '%'; }
    var crTx = txns.filter(function (t) { return t.credit > 0; });
    var avgCr = stm.totalCredits / nm, avgDr = stm.totalDebits / nm;
    var sal = txns.filter(function (t) { return has(t, 'SALARY'); }), salMonths = {};
    sal.forEach(function (t) { salMonths[monthKey(t.date)] = 1; });
    var nSalM = Object.keys(salMonths).length;
    var salAvg = nSalM ? sum(sal, function (t) { return t.credit; }) / nSalM : 0;
    var emi = txns.filter(function (t) { return has(t, 'EMI'); });
    var emiMonthly = sum(emi, function (t) { return t.debit; }) / nm;
    var income = salAvg > 0 ? salAvg : avgCr;
    var foir = income > 0 ? emiMonthly / income : null;
    var cashCr = sum(txns.filter(function (t) { return has(t, 'CASH_DEP'); }), function (t) { return t.credit; });
    var cashShare = stm.totalCredits > 0 ? cashCr / stm.totalCredits : 0;
    var bounces = txns.filter(function (t) { return t.tags.some(function (x) { return x.indexOf('BOUNCE') === 0; }); }).length;
    var od = c.allVals.filter(function (v) { return v < 0; }).length;
    var abb = c.abb, retention = avgCr > 0 && abb != null ? abb / avgCr : null;
    var vol = abb > 0 ? stdev(c.allVals) / abb : null;
    var inactive = months.filter(function (m) { return m.n === 0; }).length;
    var byP = {};
    // concentration is measured on non-salary inflow: a single employer is normal, a single customer is a risk
    var crNonSal = crTx.filter(function (t) { return !has(t, 'SALARY') && !has(t, 'SELF'); });
    var nonSalTotal = sum(crNonSal, function (t) { return t.credit; });
    crNonSal.forEach(function (t) { if (t.cpty) byP[t.cpty] = (byP[t.cpty] || 0) + t.credit; });
    var topP = Object.keys(byP).sort(function (a, b) { return byP[b] - byP[a]; })[0];
    var conc = topP && nonSalTotal > 0 ? byP[topP] / nonSalTotal : 0;
    var cr2 = {}, dr2 = {};
    txns.forEach(function (t) {
      if (!t.cpty || has(t, 'SELF') || has(t, 'SALARY') || has(t, 'EMI')) return;
      if (t.credit > 0) cr2[t.cpty] = (cr2[t.cpty] || 0) + t.credit;
      if (t.debit > 0) dr2[t.cpty] = (dr2[t.cpty] || 0) + t.debit;
    });
    var circ = Object.keys(cr2).filter(function (k) { return dr2[k] && Math.min(cr2[k], dr2[k]) >= 10000 && Math.min(cr2[k], dr2[k]) / Math.max(cr2[k], dr2[k]) >= 0.25; })
      .map(function (k) { return { name: k, cr: r2(cr2[k]), dr: r2(dr2[k]) }; }).sort(function (a, b) { return (b.cr + b.dr) - (a.cr + a.dr); }).slice(0, 10);
    var near50 = txns.filter(function (t) { return has(t, 'CASH_DEP') && t.credit >= 45000 && t.credit < 50000; }).length;
    var round = crTx.filter(function (t) { return t.credit >= 10000 && t.credit % 1000 === 0 && !has(t, 'SALARY'); }).length;
    var maxCr = crTx.reduce(function (m, t) { return Math.max(m, t.credit); }, 0);
    var maxShare = stm.totalCredits > 0 ? maxCr / stm.totalCredits : 0;

    // ---- flags
    if (stm.reconciled === false || (stm.chainRatio != null && stm.chainRatio < 0.9))
      add('high', 'Data quality', 'The statement did not fully reconcile with its running balance, so figures below may be incomplete. Review the highlighted rows.', 0);
    if (nm < 3) add('info', 'Short statement', 'Only ' + nm + ' month(s) were provided; the score is less reliable below 3 months.', 0);
    if (bounces > 0) add(bounces >= 3 ? 'high' : 'med', 'Cheque / ECS returns', bounces + ' returned or bounced instrument(s) found.', Math.min(32, 8 * bounces));
    else add('good', 'No cheque / ECS returns', 'No returned cheques, ECS or NACH debits were found.', 0);
    if (od > 0) add(od > 5 ? 'high' : 'med', 'Negative balance', 'Balance was below zero on ' + od + ' day(s). Minimum balance ' + inr(c.minBal) + '.', od > 5 ? 20 : 10);
    if (emi.length === 0) add('info', 'No EMI / loan debits detected', 'No recurring loan repayments were identified in this period.', 0);
    else if (foir != null) {
      var lvl = foir > 0.65 ? 'high' : (foir > 0.5 ? 'med' : (foir <= 0.4 ? 'good' : 'info'));
      add(lvl, 'Obligation ratio (FOIR)', 'Monthly EMI ≈ ' + inr(emiMonthly) + ' against ' + (salAvg > 0 ? 'salary' : 'average inflow') + ' of ' + inr(income) + ' → ' + pct(foir) + '.', foir > 0.65 ? 15 : (foir > 0.5 ? 10 : 0));
    }
    if (nSalM >= 3 && nSalM >= nm - 1) add('good', 'Regular salary-like credits', 'Salary or a steady monthly credit appeared in ' + nSalM + ' of ' + nm + ' months (avg ' + inr(salAvg) + ').', 0);
    else if (sal.length === 0) add('info', 'No salary identified', 'No salary-like credits were found; income basis is average monthly inflow.', 0);
    if (cashShare > 0.4 && cashCr > 0) add('med', 'Cash-heavy inflows', pct(cashShare) + ' of credits (' + inr(cashCr) + ') came as cash deposits.', 8);
    if (retention != null && retention < 0.1 && avgCr > 0) add('med', 'Low balance retention', 'Average balance is only ' + pct(retention) + ' of monthly inflow — money leaves almost as fast as it arrives.', 8);
    if (conc > 0.7 && crNonSal.length >= 5) add('med', 'Inflow concentration', pct(conc) + ' of non-salary credits come from one party (' + topP + ').', 6);
    else if (maxShare > 0.5 && crTx.length >= 6) add('info', 'One large credit', 'A single credit of ' + inr(maxCr) + ' is ' + pct(maxShare) + ' of all inflow.', 0);
    if (inactive > 0) add('low', 'Inactive months', inactive + ' month(s) in the period had no transactions.', Math.min(10, 5 * inactive));
    if (near50 >= 2) add('med', 'Cash deposits just below ₹50,000', near50 + ' deposits between ₹45,000 and ₹49,999 — for review.', 6);
    if (circ.length) add('med', 'Two-way flows with the same party', (circ.length > 1 ? circ.length + ' counterparties appear' : '1 counterparty appears') + ' on both the credit and debit side (e.g. ' + circ[0].name + ') — possible round-tripping, for review.', 6);
    if (round >= 3) add('low', 'Round-figure credits', round + ' non-salary credits of ₹10,000+ were exact multiples of ₹1,000.', 0);
    if (vol != null && vol > 1.0) add('low', 'Volatile balance', 'Daily balance swings widely (variation ' + pct(vol) + ' of average).', 3);
    if (nm >= 4) {
      var h = Math.floor(nm / 2), a = months.slice(0, h), b = months.slice(nm - h);
      var avgA = a.reduce(function (s, m) { return s + m.crA; }, 0) / h, avgB = b.reduce(function (s, m) { return s + m.crA; }, 0) / h;
      if (avgA > 0 && avgB < 0.6 * avgA) add('med', 'Inflows declining', 'Recent months bring in ' + pct(avgB / avgA) + ' of what early months did.', 4);
      var c0 = months[0].closeB, cn = months[nm - 1].closeB;
      if (c0 > 0 && cn != null && cn < 0.5 * c0) add('low', 'Declining balance', 'Closing balance fell from ' + inr(c0) + ' to ' + inr(cn) + '.', 3);
    }
    score = Math.max(0, Math.min(100, score));
    var grade = score >= 80 ? 'Low risk' : (score >= 60 ? 'Moderate' : 'Elevated');
    var order = { high: 0, med: 1, low: 2, info: 3, good: 4 };
    flags.sort(function (x, y) { return order[x.level] - order[y.level]; });
    // [label, value, kind]  kind: 'inr' money, 'n' count, 't' text
    var metrics = [
      ['Average monthly credits', r2(avgCr), 'inr'], ['Average monthly debits', r2(avgDr), 'inr'],
      ['Average salary / steady credit', r2(salAvg), 'inr'], ['Months with salary-like credit', nSalM + ' of ' + nm, 't'],
      ['Monthly EMI / loan outflow', r2(emiMonthly), 'inr'], ['Obligation ratio (FOIR)', foir == null ? 'n/a' : pct(foir), 't'],
      ['Average daily balance', abb, 'inr'], ['Balance retention (ADB ÷ monthly inflow)', retention == null ? 'n/a' : pct(retention), 't'],
      ['Minimum daily balance', c.minBal, 'inr'], ['Days with negative balance', od, 'n'],
      ['Cheque / ECS returns', bounces, 'n'], ['Cash share of inflows', pct(cashShare), 't'],
      ['Top non-salary credit party', topP ? pct(conc) + ' · ' + topP : 'n/a', 't'], ['Balance variation', vol == null ? 'n/a' : pct(vol), 't'],
      ['Inactive months', inactive, 'n'], ['Avg transactions per month', Math.round(txns.length / nm), 'n']
    ];
    return { score: Math.round(score), grade: grade, flags: flags, metrics: metrics, circ: circ, foir: foir, income: income, salAvg: salAvg, emiMonthly: emiMonthly };
  }

  function buildReport(stm, opts) {
    opts = opts || {};
    var HV = opts.highValue || 100000;
    var txns = stm.txns, m = stm.meta || {};
    var sheets = [];
    var from = stm.from, to = stm.to;
    // EOD balance series
    var eod = [], lastDate = null;
    txns.forEach(function (t) {
      if (t.balance == null) return;
      if (eod.length && eod[eod.length - 1][0] === t.date) eod[eod.length - 1][1] = t.balance; else eod.push([t.date, t.balance]);
    });
    function balOn(iso) {
      var lo = 0, hi = eod.length - 1, ans = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (eod[mid][0] <= iso) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
      return ans >= 0 ? eod[ans][1] : stm.opening;
    }
    // months
    var months = [];
    if (from) {
      var a = from.slice(0, 7), b = to.slice(0, 7), cy = +a.slice(0, 4), cm = +a.slice(5, 7);
      while (true) {
        var key = cy + '-' + pad(cm); months.push(key);
        if (key >= b) break;
        cm++; if (cm > 12) { cm = 1; cy++; }
      }
    }
    var has = function (t, tag) { return t.tags.indexOf(tag) >= 0; };
    // transfers to / from the account holder's own name (UPI/IMPS/NEFT name fields are often truncated) count as self transfers
    txns.forEach(function (t) {   // re-running with different options must not keep tags from an earlier run
      if (t.rel) { t.tags = t.tags.filter(function (g) { return ['SELF', 'SISTER_CONCERN', 'RELATED_PARTY', 'OWN_OTHER_BANK'].indexOf(g) < 0; }); delete t.rel; }
    });
    txns.forEach(function (t) {
      if (t.tags.indexOf('SELF') >= 0 || !t.cpty || ['UPI', 'IMPS', 'NEFT', 'RTGS', 'TRANSFER'].indexOf(t.mode) < 0) return;
      var rel = relation(m.holder, t.cpty, t.desc, { related: opts.related, otherAccounts: opts.otherAccounts, sister: opts.sister });
      if (rel) { t.tags.push('SELF'); if (rel.tag !== 'SELF') t.tags.push(rel.tag); t.rel = rel.why; }
    });
    // an entry can also name another uploaded account only in its narration (e.g. a cheque or an own-account transfer)
    if (opts.otherAccounts && opts.otherAccounts.length) txns.forEach(function (t) {
      if (t.tags.indexOf('SELF') >= 0) return;
      var rel = relation('', '', t.desc, { otherAccounts: opts.otherAccounts });
      if (rel) { t.tags.push('SELF'); t.tags.push(rel.tag); t.rel = rel.why; }
    });
    txns.forEach(function (t) { t.pcat = pfCat(t); });
    var bounce = function (t) { return t.tags.some(function (x) { return x.indexOf('BOUNCE') === 0; }); };
    var fromN = from ? dayNum(from) : 0, toN = to ? dayNum(to) : 0;
    var narrLimit = 0;   // some banks write "Limit 3000000" as the first entry of an OD / CC statement
    if (!(+opts.limit) && !(+m.limit) && m.accountType !== 'Loan') {
      for (var ni = 0; ni < Math.min(txns.length, 25) && !narrLimit; ni++) { var nlm = /\blimit\b\s*(?:of|rs\.?|inr|:)?\s*(\d[\d,]{5,})/i.exec(txns[ni].desc || ''); if (nlm) narrLimit = parseFloat(nlm[1].replace(/,/g, '')); }
    }
    var LIM = +opts.limit || (m.accountType === 'Loan' ? 0 : +m.limit) || narrLimit || 0;          // OD / CC sanctioned limit (user input wins; a loan's sanction amount is not an OD limit)
    var limitFrom = +opts.limit ? 'user' : (+m.limit && m.accountType !== 'Loan' ? 'header' : (narrLimit ? 'narration' : ''));
    var isBounceTx = function (t) { return t.tags.some(function (x) { return x.indexOf('BOUNCE') === 0; }); };
    var RE_ECS = /ecs|\bach\b|nach|mandate|auto\s*debit|\bemi\b/i;
    var RE_PEN = /penal|penalty|late\s*(fee|chg|charge|payment)|non[\s-]*maint|min(imum)?\s*(avg\.?|average|quarterly)?\s*(bal|balance)|\bmab\b|\bamb\b|\bqab\b|below\s*min/i;
    var isPenal = function (t) { return t.debit > 0 && (has(t, 'RETURN_CHARGE') || RE_PEN.test(t.desc)); };
    var monthly = months.map(function (key) {
      var tx = txns.filter(function (t) { return monthKey(t.date) === key; });
      var T = function (tag) { return tx.filter(function (t) { return has(t, tag); }); };
      var cr_ = function (t) { return t.credit; }, dr_ = function (t) { return t.debit; };
      var s = dayNum(key + '-01'), e = dayNum(key + '-' + pad(daysInMonth(key)));
      var ds = Math.max(s, fromN), de = Math.min(e, toN);
      var vals = [], mn = Infinity, mx = -Infinity;
      var mnDate = ''; for (var d = ds; d <= de; d++) { var bv = balOn(isoFromDayNum(d)); if (bv == null) continue; vals.push(bv); if (bv < mn) { mn = bv; mnDate = isoFromDayNum(d); } if (bv > mx) mx = bv; }
      var cr = tx.filter(function (t) { return t.credit > 0; }), dr = tx.filter(function (t) { return t.debit > 0; });
      var on = {};
      [2, 5, 10, 15, 20, 25].forEach(function (dd) { on[dd] = dd <= daysInMonth(key) && dayNum(key + '-' + pad(dd)) >= fromN && dayNum(key + '-' + pad(dd)) <= toN ? balOn(key + '-' + pad(dd)) : null; });
      return {
        key: key, label: monthLabel(key), n: tx.length,
        crN: cr.length, crA: sum(cr, function (t) { return t.credit; }), drN: dr.length, drA: sum(dr, function (t) { return t.debit; }),
        cashDepN: tx.filter(function (t) { return has(t, 'CASH_DEP'); }).length, cashDepA: sum(tx.filter(function (t) { return has(t, 'CASH_DEP'); }), function (t) { return t.credit; }),
        cashWdlN: tx.filter(function (t) { return has(t, 'CASH_WDL'); }).length, cashWdlA: sum(tx.filter(function (t) { return has(t, 'CASH_WDL'); }), function (t) { return t.debit; }),
        inwN: tx.filter(function (t) { return has(t, 'BOUNCE_INWARD'); }).length, outN: tx.filter(function (t) { return has(t, 'BOUNCE_OUTWARD'); }).length, retN: tx.filter(function (t) { return has(t, 'BOUNCE_RETURN'); }).length,
        emiN: tx.filter(function (t) { return has(t, 'EMI'); }).length, emiA: sum(tx.filter(function (t) { return has(t, 'EMI'); }), function (t) { return t.debit; }),
        salA: sum(tx.filter(function (t) { return has(t, 'SALARY'); }), function (t) { return t.credit; }),
        chgA: sum(tx.filter(function (t) { return has(t, 'CHARGE'); }), function (t) { return t.debit; }),
        intA: sum(tx.filter(function (t) { return has(t, 'INTEREST_CR'); }), function (t) { return t.credit; }),
        loanCrN: T('LOAN_CR').length, chqDepN: T('CHQ_DEP').length, chqDepA: sum(T('CHQ_DEP'), cr_), chqIssN: T('CHQ_ISSUED').length, chqIssA: sum(T('CHQ_ISSUED'), dr_),
        selfCrA: sum(T('SELF'), cr_), selfDrA: sum(T('SELF'), dr_), loanCrA: sum(T('LOAN_CR'), cr_), refundA: sum(T('REFUND'), cr_),
        intDrA: sum(T('INTEREST_DR'), dr_), retChgA: sum(T('RETURN_CHARGE'), dr_),
        ecsBounceN: tx.filter(function (t) { return isBounceTx(t) && RE_ECS.test(t.desc); }).length,
        chqBounceN: tx.filter(function (t) { return isBounceTx(t) && !RE_ECS.test(t.desc); }).length,
        netCrN: tx.filter(function (t) { return t.credit > 0 && !has(t, 'SELF') && !has(t, 'LOAN_CR') && !has(t, 'REFUND') && !has(t, 'INTEREST_CR') && !has(t, 'VERIF'); }).length,
        turnN: tx.filter(function (t) { return t.credit > 0 && !has(t, 'SELF') && !has(t, 'LOAN_CR'); }).length,
        turnA: sum(tx.filter(function (t) { return t.credit > 0 && !has(t, 'SELF') && !has(t, 'LOAN_CR'); }), cr_),
        netCrA: sum(tx.filter(function (t) { return t.credit > 0 && !has(t, 'SELF') && !has(t, 'LOAN_CR') && !has(t, 'REFUND') && !has(t, 'INTEREST_CR') && !has(t, 'VERIF'); }), cr_),
        netDrA: sum(tx.filter(function (t) { return t.debit > 0 && !has(t, 'SELF'); }), dr_),
        upiCrA: sum(tx.filter(function (t) { return t.mode === 'UPI'; }), cr_), upiDrA: sum(tx.filter(function (t) { return t.mode === 'UPI'; }), dr_),
        ntCrA: sum(tx.filter(function (t) { return /^(NEFT|RTGS|IMPS)$/.test(t.mode); }), cr_), ntDrA: sum(tx.filter(function (t) { return /^(NEFT|RTGS|IMPS)$/.test(t.mode); }), dr_),
        invA: sum(tx.filter(function (t) { return t.cat === 'Investments'; }), dr_), insA: sum(tx.filter(function (t) { return t.cat === 'Insurance'; }), dr_),
        invCrA: sum(tx.filter(function (t) { return t.cat === 'Investments'; }), cr_), minDate: mnDate,
        penN: tx.filter(isPenal).length, penA: sum(tx.filter(isPenal), dr_),
        odDays: vals.filter(function (v) { return v < 0; }).length, nDays: vals.length,
        utilAvg: LIM > 0 && vals.length ? r2(100 * vals.reduce(function (s, v) { return s + Math.max(0, -v); }, 0) / vals.length / LIM) : null,
        utilPeak: LIM > 0 && vals.length ? r2(100 * Math.max.apply(null, vals.map(function (v) { return Math.max(0, -v); })) / LIM) : null,
        openB: ds <= fromN ? stm.opening : balOn(isoFromDayNum(ds - 1)), closeB: de >= ds ? balOn(isoFromDayNum(de)) : null,
        minB: vals.length ? r2(mn) : null, maxB: vals.length ? r2(mx) : null, adb: vals.length ? r2(vals.reduce(function (x, y) { return x + y; }, 0) / vals.length) : null, on: on
      };
    });
    var allVals = [];
    var daily = [];
    for (var dd = fromN; dd <= toN && from; dd++) { var bb = balOn(isoFromDayNum(dd)); if (bb != null) { allVals.push(bb); daily.push([isoFromDayNum(dd), bb]); } }
    var abb = allVals.length ? r2(allVals.reduce(function (x, y) { return x + y; }, 0) / allVals.length) : null;
    var minBal = allVals.length ? r2(Math.min.apply(null, allVals)) : null, maxBal = allVals.length ? r2(Math.max.apply(null, allVals)) : null;
    var bounces = txns.filter(bounce), cashDep = txns.filter(function (t) { return has(t, 'CASH_DEP'); }), cashWdl = txns.filter(function (t) { return has(t, 'CASH_WDL'); });
    var emis = txns.filter(function (t) { return has(t, 'EMI'); }), sal = txns.filter(function (t) { return has(t, 'SALARY'); });
    var chg = txns.filter(function (t) { return has(t, 'CHARGE') || has(t, 'INTEREST_CR') || has(t, 'INTEREST_DR'); });

    var ins = buildInsights(stm, { monthly: monthly, abb: abb, minBal: minBal, allVals: allVals });
    var fx = forensics(stm);
    var lvOrder = { high: 0, med: 1, low: 2, info: 3, good: 4 };
    fx.flags.forEach(function (f) { ins.flags.push(f); });
    ins.flags.sort(function (x, y) { return lvOrder[x.level] - lvOrder[y.level]; });
    if (LIM > 0) {
      var pk = Math.max.apply(null, monthly.map(function (x) { return x.utilPeak || 0; }));
      var av = monthly.reduce(function (s, x) { return s + (x.utilAvg || 0) * (x.nDays || 0); }, 0) / Math.max(1, monthly.reduce(function (s, x) { return s + (x.nDays || 0); }, 0));
      ins.flags.push({ level: pk > 100 ? 'high' : (pk > 90 ? 'med' : (av > 75 ? 'low' : 'info')), title: 'Limit utilisation', detail: 'Average utilisation ' + av.toFixed(1) + '% of the ' + Math.round(LIM).toLocaleString('en-IN') + ' limit; peak ' + pk.toFixed(1) + '%. (Only negative / debit balances are counted as utilisation.)' });
      ins.flags.sort(function (x, y) { return lvOrder[x.level] - lvOrder[y.level]; });
    }
    // Overdraft / cash-credit summary (utilisation of the sanctioned limit)
    var overdrawnDays = monthly.reduce(function (s0, x) { return s0 + (x.odDays || 0); }, 0), odType = /overdraft|cash credit/i.test(m.accountType || ''), odInfo = null;
    if (m.accountType !== 'Loan' && (LIM > 0 || overdrawnDays > 0 || odType)) {
      var nd = monthly.reduce(function (s0, x) { return s0 + (x.nDays || 0); }, 0), wsum = monthly.reduce(function (s0, x) { return s0 + (x.utilAvg || 0) * (x.nDays || 0); }, 0);
      var pkM = monthly.reduce(function (b, x) { return x.minB != null && x.minB < (b ? b.minB : 0) ? x : b; }, null);
      var closeNow = stm.closing;
      odInfo = { limit: LIM, limitFrom: limitFrom, dp: +m.dp || LIM, needLimit: !(LIM > 0) && (odType || overdrawnDays > 0), overdrawnDays: overdrawnDays, daysTotal: nd,
        avgPct: LIM > 0 ? (nd ? r2(wsum / nd) : 0) : null, peakAmt: pkM ? r2(-pkM.minB) : 0, peakDate: pkM ? pkM.minDate : '',
        peakPct: LIM > 0 ? (pkM ? r2(-pkM.minB / LIM * 100) : 0) : null, currentPct: LIM > 0 ? (closeNow != null ? r2(Math.max(0, -closeNow) / LIM * 100) : 0) : null,
        overLimit: LIM > 0 && pkM ? (-pkM.minB > LIM) : false, interest: r2(monthly.reduce(function (s0, x) { return s0 + (x.intDrA || 0); }, 0)),
        monthly: monthly.map(function (x) { return { key: x.key, avg: x.utilAvg, peak: x.utilPeak, days: x.odDays }; }) };
    }
    var turnover = (function () {
      var cr = txns.filter(function (t) { return t.credit > 0; }), isIn = function (t) { return has(t, 'SELF'); }, isLn = function (t) { return has(t, 'LOAN_CR') && !isIn(t); };
      var o = { total: sum(cr, function (t) { return t.credit; }), totalN: cr.length };
      var a = cr.filter(isIn), b = cr.filter(isLn), c2 = cr.filter(function (t) { return !isIn(t) && !isLn(t); });
      o.internal = sum(a, function (t) { return t.credit; }); o.internalN = a.length; o.loan = sum(b, function (t) { return t.credit; }); o.loanN = b.length;
      o.amount = sum(c2, function (t) { return t.credit; }); o.n = c2.length; return o;
    })();
    var netCrTot = r2(monthly.reduce(function (s, x) { return s + x.netCrA; }, 0)), netDrTot = r2(monthly.reduce(function (s, x) { return s + x.netDrA; }, 0));
    /* 1. Summary Info */
    var S = [];
    S.push(['BANK STATEMENT ANALYSIS REPORT', '']); S.push(['Generated by YourView Tools · Bank Statement Analyzer', new Date().toISOString().slice(0, 10)]); S.push(['', '']);
    S.push(['ACCOUNT DETAILS', '']);
    S.push(['Account Holder', m.holder || '']); S.push(['Bank', m.bank || '']); S.push(['Account Number', m.accountNo || '']); S.push(['Account Type', m.accountType || '']);
    S.push(['IFSC', m.ifsc || '']); S.push(['MICR', m.micr || '']); S.push(['Branch', m.branch || '']); S.push(['Sanctioned Limit (OD / CC)', LIM > 0 ? N(LIM) : 'Not applicable / not provided']);
    S.push(['Statement Period (from transactions)', from ? fmtDate(from) + ' to ' + fmtDate(to) : '']); S.push(['Months Covered', months.length]);
    S.push(['Files Processed', (stm.files || []).length || 1]); S.push(['Total Transactions', txns.length]); S.push(['', '']);
    S.push(['BALANCE & FLOW', '']);
    S.push(['Opening Balance', N(stm.opening)]); S.push(['Closing Balance', N(stm.closing)]);
    S.push(['Total Credits (Amount)', N(stm.totalCredits)]); S.push(['Total Credits (Count)', stm.countCredits]);
    S.push(['Total Debits (Amount)', N(stm.totalDebits)]); S.push(['Total Debits (Count)', stm.countDebits]);
    S.push(['Net Cash Flow', N(r2(stm.totalCredits - stm.totalDebits))]);
    S.push(['Average Bank Balance (daily)', N(abb)]); S.push(['Minimum Daily Balance', N(minBal)]); S.push(['Maximum Daily Balance', N(maxBal)]);
    S.push(['Avg Monthly Credits', N(months.length ? r2(stm.totalCredits / months.length) : null)]); S.push(['Avg Monthly Debits', N(months.length ? r2(stm.totalDebits / months.length) : null)]);
    S.push(['Turnover (credits excl. own-name / related-party and loan credits)', N(turnover.amount)]); S.push(['Net Credits (excl. own transfers, loan credits, refunds, interest)', N(netCrTot)]); S.push(['Avg Monthly Net Credits', N(months.length ? r2(netCrTot / months.length) : null)]);
    S.push(['Net Debits (excl. own transfers)', N(netDrTot)]);
    S.push(['Own Account Transfers (credits / debits)', sum(txns.filter(function (t) { return has(t, 'SELF'); }), function (t) { return t.credit; }).toFixed(2) + ' / ' + sum(txns.filter(function (t) { return has(t, 'SELF'); }), function (t) { return t.debit; }).toFixed(2)]);
    S.push(['Loan Credits / Disbursals', N(sum(txns.filter(function (t) { return has(t, 'LOAN_CR'); }), function (t) { return t.credit; }))]);
    S.push(['Cheque Deposits (count / amount)', txns.filter(function (t) { return has(t, 'CHQ_DEP'); }).length + ' / ' + sum(txns.filter(function (t) { return has(t, 'CHQ_DEP'); }), function (t) { return t.credit; }).toFixed(2)]);
    S.push(['Cheques Issued (count / amount)', txns.filter(function (t) { return has(t, 'CHQ_ISSUED'); }).length + ' / ' + sum(txns.filter(function (t) { return has(t, 'CHQ_ISSUED'); }), function (t) { return t.debit; }).toFixed(2)]);
    S.push(['', '']); S.push(['RISK INDICATORS', '']);
    S.push(['Statement behaviour score (indicative, 0-100)', ins.score + ' — ' + ins.grade]);
    S.push(['Obligation ratio (FOIR)', ins.foir == null ? 'n/a' : Math.round(ins.foir * 100) + '%']);
    S.push(['Cheque / ECS Returns (count)', bounces.length]); S.push(['Cash Deposits (count / amount)', cashDep.length + ' / ' + sum(cashDep, function (t) { return t.credit; }).toFixed(2)]);
    S.push(['Cash Withdrawals (count / amount)', cashWdl.length + ' / ' + sum(cashWdl, function (t) { return t.debit; }).toFixed(2)]);
    S.push(['EMI / Loan Debits (count / amount)', emis.length + ' / ' + sum(emis, function (t) { return t.debit; }).toFixed(2)]);
    S.push(['Salary Credits (count / amount)', sal.length + ' / ' + sum(sal, function (t) { return t.credit; }).toFixed(2)]);
    S.push(['Bank Charges & Interest entries', chg.length]); S.push(['', '']);
    S.push(['DATA QUALITY', '']);
    S.push(['Opening + Credits − Debits = Closing', stm.reconciled == null ? 'Not verifiable' : (stm.reconciled ? 'PASS' : 'FAIL')]);
    S.push(['Running-balance check', stm.chainRatio == null ? 'No balances' : Math.round(stm.chainRatio * 100) + '% rows verified (' + stm.chainChecked + ' checked)']);
    S.push(['Parser', stm.parseMode + (stm.ocr ? ' + OCR' : '')]);
    S.push(['Document metadata check', fx.rows.some(function (r) { return r.level === 'high'; }) ? 'HIGH — see Document Forensics' : (fx.rows.some(function (r) { return r.level === 'med'; }) ? 'REVIEW — see Document Forensics' : 'No irregularities found')]);
    sheets.push({ name: 'Summary Info', aoa: S, widths: [44, 36] });

    /* 1b. Insights & Risk */
    var IR = [['STATEMENT BEHAVIOUR ANALYSIS', '', ''], ['Indicative score (0-100)', ins.score, ins.grade],
      ['This is an automated reading of the statement, not a credit decision. Verify against source documents.', '', ''], ['', '', ''], ['KEY METRICS', '', '']];
    ins.metrics.forEach(function (mm) { IR.push([mm[0], mm[2] === 'inr' ? N(mm[1]) : (mm[2] === 'n' ? I(mm[1]) : mm[1]), '']); });
    IR.push(['', '', '']); IR.push(['FINDINGS', '', '']); IR.push(['Level', 'Finding', 'Detail']);
    var LV = { high: 'HIGH', med: 'MEDIUM', low: 'LOW', info: 'INFO', good: 'POSITIVE' };
    ins.flags.forEach(function (f) { IR.push([LV[f.level], f.title, f.detail]); });
    if (ins.circ.length) {
      IR.push(['', '', '']); IR.push(['TWO-WAY PARTIES (credit and debit)', 'Credits', 'Debits']);
      ins.circ.forEach(function (x) { IR.push([x.name, N(x.cr), N(x.dr)]); });
    }
    sheets.push({ name: 'Insights & Risk', aoa: IR, widths: [46, 40, 90] });

    /* 2. Xns */
    var X = [['Sl No', 'Date', 'Value Date', 'Cheque / Ref', 'Narration', 'Mode', 'Category', 'Flags', 'Counterparty', 'Debit', 'Credit', 'Balance', 'Balance Check', 'Source File']];
    txns.forEach(function (t) {
      X.push([I(t.n), D(t.date), D(t.valueDate), t.ref, t.desc, t.mode, t.cat, t.tags.join(', '), t.cpty, t.debit > 0 ? N(t.debit) : '', t.credit > 0 ? N(t.credit) : '', N(t.balance),
        t.chainOk === false ? 'MISMATCH (' + t.diff + ')' : (t.chainOk ? 'OK' : ''), t.src || stm.fileName || '']);
    });
    sheets.push({ name: 'Xns', aoa: X, widths: [7, 12, 12, 16, 60, 11, 20, 22, 28, 15, 15, 16, 16, 24] });

    /* 3. Monthly Details */
    var hdr = ['Particulars'].concat(months.map(monthLabel)).concat(['Total / Avg']);
    var M = [hdr];
    function mrow(label, key, fmt, agg) {
      var vals = monthly.map(function (x) { return x[key]; });
      var row = [label].concat(vals.map(function (v) { return v == null ? '' : fmt(v); }));
      var nums = vals.filter(function (v) { return v != null; });
      var tot = agg === 'sum' ? r2(nums.reduce(function (a, b) { return a + b; }, 0)) : (agg === 'avg' ? (nums.length ? r2(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length) : null) : (agg === 'min' ? (nums.length ? Math.min.apply(null, nums) : null) : (agg === 'max' ? (nums.length ? Math.max.apply(null, nums) : null) : null)));
      row.push(tot == null ? '' : fmt(tot)); M.push(row);
    }
    function msec(label) { var r = [label]; for (var i = 0; i <= months.length; i++) r.push(''); M.push(r); }
    msec('TURNOVER');
    mrow('No. of Transactions', 'n', I, 'sum');
    mrow('Total No. of Credit Transactions', 'crN', I, 'sum'); mrow('Total Amount of Credit Transactions', 'crA', N, 'sum');
    mrow('Total No. of Debit Transactions', 'drN', I, 'sum'); mrow('Total Amount of Debit Transactions', 'drA', N, 'sum');
    mrow('Turnover (No.) - credits excl. own-name / related and loan credits', 'turnN', I, 'sum'); mrow('Turnover (Amount)', 'turnA', N, 'sum'); mrow('Net Credits (No.) - excl. own transfers, loan credits, refunds, interest', 'netCrN', I, 'sum'); mrow('Net Credits (Amount)', 'netCrA', N, 'sum');
    mrow('Net Debits (Amount) - excl. own transfers', 'netDrA', N, 'sum');
    mrow('Own Account Transfers - Credits', 'selfCrA', N, 'sum'); mrow('Own Account Transfers - Debits', 'selfDrA', N, 'sum');
    mrow('Loan Credits / Disbursals (Amount)', 'loanCrA', N, 'sum'); mrow('Refunds / Reversals Credited (Amount)', 'refundA', N, 'sum');
    msec('MODE OF PAYMENT');
    mrow('UPI Credits (Amount)', 'upiCrA', N, 'sum'); mrow('UPI Debits (Amount)', 'upiDrA', N, 'sum');
    mrow('NEFT / RTGS / IMPS Credits (Amount)', 'ntCrA', N, 'sum'); mrow('NEFT / RTGS / IMPS Debits (Amount)', 'ntDrA', N, 'sum');
    msec('CASH & CHEQUES');
    mrow('Cash Deposits (No.)', 'cashDepN', I, 'sum'); mrow('Cash Deposits (Amount)', 'cashDepA', N, 'sum');
    mrow('Cash Withdrawals (No.)', 'cashWdlN', I, 'sum'); mrow('Cash Withdrawals (Amount)', 'cashWdlA', N, 'sum');
    mrow('Cheque Deposits (No.)', 'chqDepN', I, 'sum'); mrow('Cheque Deposits (Amount)', 'chqDepA', N, 'sum');
    mrow('Cheques Issued (No.)', 'chqIssN', I, 'sum'); mrow('Cheques Issued (Amount)', 'chqIssA', N, 'sum');
    msec('RETURNS / BOUNCES');
    mrow('Inward Returns (No.)', 'inwN', I, 'sum'); mrow('Outward Returns (No.)', 'outN', I, 'sum'); mrow('Other / Unspecified Returns (No.)', 'retN', I, 'sum');
    mrow('Cheque Bounces (No.)', 'chqBounceN', I, 'sum'); mrow('ECS / NACH / EMI Bounces (No.)', 'ecsBounceN', I, 'sum');
    mrow('Return / Bounce Charges (Amount)', 'retChgA', N, 'sum');
    msec('OBLIGATIONS, INCOME & INVESTMENTS');
    mrow('EMI / Loan Debits (No.)', 'emiN', I, 'sum'); mrow('EMI / Loan Debits (Amount)', 'emiA', N, 'sum');
    mrow('Salary Credits (Amount)', 'salA', N, 'sum');
    mrow('Investments - SIP / MF / Trading (Amount)', 'invA', N, 'sum'); mrow('Insurance Premiums (Amount)', 'insA', N, 'sum');
    mrow('Bank Charges (Amount)', 'chgA', N, 'sum'); mrow('Interest Credited (Amount)', 'intA', N, 'sum'); mrow('Interest Debited (Amount)', 'intDrA', N, 'sum');
    msec('BALANCES');
    mrow('Opening Balance', 'openB', N, null); mrow('Closing Balance', 'closeB', N, null);
    mrow('Minimum Balance', 'minB', N, 'min'); mrow('Maximum Balance', 'maxB', N, 'max'); mrow('Average Daily Balance', 'adb', N, 'avg');
    mrow('Days with Negative Balance', 'odDays', I, 'sum');
    if (LIM > 0) { mrow('Average Limit Utilisation (%)', 'utilAvg', N, 'avg'); mrow('Peak Limit Utilisation (%)', 'utilPeak', N, 'max'); }
    [5, 10, 15, 20, 25].forEach(function (d) {
      var row = ['Balance on ' + d + 'th'];
      monthly.forEach(function (x) { row.push(x.on[d] == null ? '' : N(x.on[d])); });
      var nn = monthly.map(function (x) { return x.on[d]; }).filter(function (v) { return v != null; });
      row.push(nn.length ? N(r2(nn.reduce(function (a, b) { return a + b; }, 0) / nn.length)) : ''); M.push(row);
    });
    sheets.push({ name: 'Monthly Details', aoa: M, widths: [58].concat(months.map(function () { return 15; })).concat([16]) });

    /* 4. EOD Balances */
    var E = [['Day'].concat(months.map(monthLabel))];
    for (var day = 1; day <= 31; day++) {
      var row = [day];
      months.forEach(function (key) {
        if (day > daysInMonth(key)) { row.push(''); return; }
        var iso = key + '-' + pad(day), n = dayNum(iso);
        row.push(n < fromN || n > toN ? '' : N(balOn(iso)));
      });
      E.push(row);
    }
    E.push(['Average'].concat(monthly.map(function (x) { return N(x.adb); })));
    sheets.push({ name: 'EOD Balances', aoa: E, widths: [10].concat(months.map(function () { return 15; })) });

    /* 4b. Category summary */
    var catMap = {};
    txns.forEach(function (t) {
      var o = catMap[t.cat] || (catMap[t.cat] = { name: t.cat, drN: 0, drA: 0, crN: 0, crA: 0 });
      if (t.debit > 0) { o.drN++; o.drA += t.debit; }
      if (t.credit > 0) { o.crN++; o.crA += t.credit; }
    });
    var cats = Object.keys(catMap).map(function (k) { return catMap[k]; }).sort(function (a, b) { return (b.drA + b.crA) - (a.drA + a.crA); });
    var CS = [['Category', 'Debit Count', 'Debit Amount', '% of Debits', 'Credit Count', 'Credit Amount', '% of Credits']];
    cats.forEach(function (o) {
      CS.push([o.name, I(o.drN), N(r2(o.drA)), stm.totalDebits ? { v: o.drA / stm.totalDebits, t: 'n', z: '0.0%' } : '', I(o.crN), N(r2(o.crA)), stm.totalCredits ? { v: o.crA / stm.totalCredits, t: 'n', z: '0.0%' } : '']);
    });
    sheets.push({ name: 'Category Summary', aoa: CS, widths: [26, 13, 18, 12, 13, 18, 13] });

    /* 5/6. Top parties */
    function topParties(side, label) {
      var map = {};
      txns.forEach(function (t) {
        var amt = side === 'C' ? t.credit : t.debit;
        if (!(amt > 0) || !t.cpty) return;
        var k = t.cpty.replace(/[^A-Z]/g, '');
        if (!k) return;
        var o = map[k] || (map[k] = { name: t.cpty, n: 0, amt: 0, first: t.date, last: t.date, mon: {} });
        o.n++; o.amt += amt; if (t.date < o.first) o.first = t.date; if (t.date > o.last) o.last = t.date; o.mon[monthKey(t.date)] = 1;
      });
      var arr = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.amt - a.amt; });
      var tot = side === 'C' ? stm.totalCredits : stm.totalDebits;
      var A2 = [['Rank', 'Counterparty', 'No. of Txns', 'Total Amount', '% of Total', 'Months Active', 'First Txn', 'Last Txn']];
      arr.slice(0, 25).forEach(function (o, i) { A2.push([I(i + 1), o.name, I(o.n), N(r2(o.amt)), tot ? { v: o.amt / tot, t: 'n', z: '0.0%' } : '', I(Object.keys(o.mon).length), D(o.first), D(o.last)]); });
      sheets.push({ name: label, aoa: A2, widths: [7, 36, 12, 18, 11, 13, 13, 13] });
      return arr;
    }
    var topC = topParties('C', 'Top Funds Received');
    var topD = topParties('D', 'Top Funds Remitted');

    /* detail sheets */
    var BLANK9 = ['', '', '', '', '', '', '', '', ''];
    function listing(name, rows, pre) {
      var L = (pre || []).slice();
      L.push(['Date', 'Narration', 'Mode', 'Counterparty', 'Debit', 'Credit', 'Balance']);
      rows.forEach(function (t) { L.push([D(t.date), t.desc, t.mode, t.cpty, t.debit > 0 ? N(t.debit) : '', t.credit > 0 ? N(t.credit) : '', N(t.balance)]); });
      if (!rows.length) L.push(['No entries found', '', '', '', '', '', '']);
      else L.push(['TOTAL', rows.length + ' entries', '', '', N(sum(rows, function (t) { return t.debit; })), N(sum(rows, function (t) { return t.credit; })), '']);
      sheets.push({ name: name, aoa: L, widths: [30, 62, 16, 30, 15, 15, 16, 14, 14] });
    }
    function groupSummary(rows, side, head) {
      var map = {};
      rows.forEach(function (t) {
        var amt = side === 'C' ? t.credit : t.debit;
        if (!(amt > 0)) return;
        var k = t.cpty || 'UNIDENTIFIED';
        var o = map[k] || (map[k] = { name: k, a: [], mon: {}, first: t.date, last: t.date });
        o.a.push(amt); o.mon[monthKey(t.date)] = 1; if (t.date < o.first) o.first = t.date; if (t.date > o.last) o.last = t.date;
      });
      var tot = function (o) { return o.a.reduce(function (x, y) { return x + y; }, 0); };
      var arr = Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return tot(y) - tot(x); });
      var out = [[head, 'No. of Txns', 'Months Present', 'Avg Amount', 'Min Amount', 'Max Amount', 'Total', 'First', 'Last']];
      arr.forEach(function (o) { out.push([o.name, I(o.a.length), I(Object.keys(o.mon).length), N(r2(tot(o) / o.a.length)), N(Math.min.apply(null, o.a)), N(Math.max.apply(null, o.a)), N(r2(tot(o))), D(o.first), D(o.last)]); });
      if (!arr.length) out.push(['None found', '', '', '', '', '', '', '', '']);
      return out;
    }
    var loanCr = txns.filter(function (t) { return has(t, 'LOAN_CR'); });
    var selfTx = txns.filter(function (t) { return has(t, 'SELF'); });
    var invIns = txns.filter(function (t) { return t.cat === 'Investments' || t.cat === 'Insurance'; });
    var chqDep = txns.filter(function (t) { return has(t, 'CHQ_DEP'); }), chqIss = txns.filter(function (t) { return has(t, 'CHQ_ISSUED'); });
    var recurDr = txns.filter(function (t) { return has(t, 'RECURRING'); });

    listing('Cash Deposits', cashDep);
    listing('Cash Withdrawals', cashWdl);

    function chqNo(t) {
      var mm = (t.desc + ' ' + (t.ref || '')).match(/(?:chq|cheque|chk)\.?\s*(?:no\.?|number|#)?\s*[:\-]?\s*(\d{4,9})/i);
      if (mm) return mm[1];
      var rr = String(t.ref || '').replace(/\D/g, '');
      return rr.length >= 4 && rr.length <= 9 ? rr : '';
    }
    function chequeSheet(name, rows, side) {
      var amt = function (t) { return side === 'credit' ? t.credit : t.debit; };
      var tot = sum(rows, amt);
      var Q = [[side === 'credit' ? 'CHEQUES DEPOSITED' : 'CHEQUES ISSUED', '', '', '', '', ''], ['Number of cheques', I(rows.length), '', '', '', ''], ['Total amount', N(tot), '', '', '', ''], ['Average amount', N(rows.length ? r2(tot / rows.length) : 0), '', '', '', ''], ['', '', '', '', '', ''],
        ['Date', 'Cheque No.', 'Narration', side === 'credit' ? 'Drawer' : 'Payee', 'Amount', 'Balance']];
      rows.forEach(function (t) { Q.push([D(t.date), chqNo(t), t.desc, t.cpty, N(amt(t)), N(t.balance)]); });
      if (!rows.length) Q.push(['No entries found', '', '', '', '', '']);
      sheets.push({ name: name, aoa: Q, widths: [22, 14, 62, 30, 16, 16] });
    }
    chequeSheet('Cheque Deposits', chqDep, 'credit');
    chequeSheet('Cheque Issued', chqIss, 'debit');

    function bounceReason(d) {
      if (/insufficient|funds?\s*insuff|exceeds?\s*arrang|\bnsf\b|not\s*sufficient|\bi\/?f\b/i.test(d)) return 'Insufficient funds';
      if (/signature/i.test(d)) return 'Signature mismatch';
      if (/stale|out\s*of\s*date/i.test(d)) return 'Stale cheque';
      if (/post[\s-]*dated|\bpdc\b|not\s*due/i.test(d)) return 'Post-dated';
      if (/account\s*(closed|blocked|frozen)|a\/c\s*closed/i.test(d)) return 'Account closed / blocked';
      if (/stop\s*pay|payment\s*stopped/i.test(d)) return 'Payment stopped';
      if (/mandate|auth|not\s*honou?red/i.test(d)) return 'Mandate / authorisation';
      return 'Not specified';
    }
    var usedChg = {}, BN = [];
    bounces.forEach(function (t) {
      var cr = txns.filter(function (c) { var dd = dayNum(c.date) - dayNum(t.date); return has(c, 'RETURN_CHARGE') && !usedChg[c.n] && dd >= 0 && dd <= 3; });
      cr.forEach(function (c) { usedChg[c.n] = 1; });
      BN.push({ t: t, dir: has(t, 'BOUNCE_INWARD') ? 'Inward' : (has(t, 'BOUNCE_OUTWARD') ? 'Outward' : 'Unspecified'), inst: RE_ECS.test(t.desc) ? 'ECS / NACH / EMI' : 'Cheque', reason: bounceReason(t.desc), chg: sum(cr, function (c) { return c.debit; }) });
    });
    var allRetChg = sum(txns.filter(function (t) { return has(t, 'RETURN_CHARGE'); }), function (t) { return t.debit; });
    var BR = [['BOUNCE / RETURN SUMMARY', '', '', '', '', '', '', '', ''],
      ['Inward returns (No.)', I(BN.filter(function (x) { return x.dir === 'Inward'; }).length), '', '', '', '', '', '', ''],
      ['Outward returns (No.)', I(BN.filter(function (x) { return x.dir === 'Outward'; }).length), '', '', '', '', '', '', ''],
      ['Unspecified direction (No.)', I(BN.filter(function (x) { return x.dir === 'Unspecified'; }).length), '', '', '', '', '', '', ''],
      ['Cheque returns (No.)', I(BN.filter(function (x) { return x.inst === 'Cheque'; }).length), '', '', '', '', '', '', ''],
      ['ECS / NACH / EMI returns (No.)', I(BN.filter(function (x) { return x.inst !== 'Cheque'; }).length), '', '', '', '', '', '', ''],
      ['Insufficient-funds returns (No.)', I(BN.filter(function (x) { return x.reason === 'Insufficient funds'; }).length), '', '', '', '', '', '', ''],
      ['Total return / bounce charges', N(allRetChg), '', '', '', '', '', '', ''],
      ['Inward = instruments drawn on this account returned unpaid; Outward = instruments deposited by the account holder returned. Direction is read from the bank narration.', '', '', '', '', '', '', '', ''],
      BLANK9, ['Date', 'Direction', 'Instrument', 'Cheque / Ref No.', 'Debit', 'Credit', 'Reason', 'Narration', 'Return charges (±3 days)']];
    BN.forEach(function (x) { BR.push([D(x.t.date), x.dir, x.inst, chqNo(x.t) || x.t.ref, x.t.debit > 0 ? N(x.t.debit) : '', x.t.credit > 0 ? N(x.t.credit) : '', x.reason, x.t.desc, x.chg ? N(x.chg) : '']); });
    if (!BN.length) BR.push(['No cheque / ECS returns found', '', '', '', '', '', '', '', '']);
    sheets.push({ name: 'Cheque & ECS Bounces', aoa: BR, widths: [30, 14, 18, 18, 15, 15, 24, 62, 20] });

    // fixed obligations: lender-wise EMIs + other repeating payments
    var FO = [['FIXED OBLIGATIONS — EMI / LOAN DEBITS BY LENDER', '', '', '', '', '', '', '', '']].concat(groupSummary(emis, 'D', 'Lender / Party'));
    FO.push(BLANK9, ['OTHER REPEATING PAYMENTS (same amount, same party, ≥3 months — e.g. rent, SIP, subscriptions)', '', '', '', '', '', '', '', '']);
    FO = FO.concat(groupSummary(recurDr, 'D', 'Party'));
    FO.push(BLANK9, ['Estimated monthly EMI outflow', N(r2(ins.emiMonthly)), '', '', '', '', '', '', ''], ['Obligation ratio (FOIR)', ins.foir == null ? 'n/a' : { v: ins.foir, t: 'n', z: '0.0%' }, '', '', '', '', '', '', '']);
    sheets.push({ name: 'Fixed Obligations', aoa: FO, widths: [44, 14, 15, 16, 16, 16, 16, 14, 14] });
    listing('EMI & Loan Debits', emis);
    listing('Loan Credits', loanCr);
    listing('Salary Credits', sal, groupSummary(sal, 'C', 'Employer / Source').concat([BLANK9]));
    var gstA = sum(txns.filter(function (t) { return t.debit > 0 && /\bgst\b|cgst|sgst|igst/i.test(t.desc); }), function (t) { return t.debit; });
    listing('Charges & Interest', chg, [['CHARGES & INTEREST SUMMARY', '', '', '', '', '', '', '', ''],
      ['Bank charges (debits)', N(sum(txns.filter(function (t) { return has(t, 'CHARGE') && !has(t, 'RETURN_CHARGE'); }), function (t) { return t.debit; })), '', '', '', '', '', '', ''],
      ['Return / bounce charges', N(allRetChg), '', '', '', '', '', '', ''], ['of which GST', N(gstA), '', '', '', '', '', '', ''],
      ['Interest credited', N(sum(txns.filter(function (t) { return has(t, 'INTEREST_CR'); }), function (t) { return t.credit; })), '', '', '', '', '', '', ''],
      ['Interest debited (OD / CC / loan)', N(sum(txns.filter(function (t) { return has(t, 'INTEREST_DR'); }), function (t) { return t.debit; })), '', '', '', '', '', '', ''], BLANK9]);
    listing('Self Transfers', selfTx);
    listing('Investments & Insurance', invIns);

    /* High value */
    var HVc = txns.filter(function (t) { return t.credit >= HV; }).sort(function (a, b) { return b.credit - a.credit; }).slice(0, 30);
    var HVd = txns.filter(function (t) { return t.debit >= HV; }).sort(function (a, b) { return b.debit - a.debit; }).slice(0, 30);
    var H = [['HIGH VALUE CREDITS (≥ ' + HV + ')', '', '', '', ''], ['Date', 'Narration', 'Counterparty', 'Credit', 'Balance']];
    HVc.forEach(function (t) { H.push([D(t.date), t.desc, t.cpty, N(t.credit), N(t.balance)]); });
    H.push(['', '', '', '', '']); H.push(['HIGH VALUE DEBITS (≥ ' + HV + ')', '', '', '', '']); H.push(['Date', 'Narration', 'Counterparty', 'Debit', 'Balance']);
    HVd.forEach(function (t) { H.push([D(t.date), t.desc, t.cpty, N(t.debit), N(t.balance)]); });
    sheets.push({ name: 'High Value Txns', aoa: H, widths: [13, 62, 28, 16, 16] });

    /* Recurring */
    var rec = {};
    txns.forEach(function (t) {
      var amt = t.debit > 0 ? t.debit : t.credit;
      if (!(amt > 0) || !t.cpty) return;
      var k = (t.debit > 0 ? 'D' : 'C') + t.cpty.replace(/[^A-Z]/g, '');
      var o = rec[k] || (rec[k] = { side: t.debit > 0 ? 'Debit' : 'Credit', name: t.cpty, mon: {}, amts: [] });
      o.mon[monthKey(t.date)] = 1; o.amts.push(amt);
    });
    var R = [['Type', 'Counterparty', 'Months Present', 'No. of Txns', 'Avg Amount', 'Min Amount', 'Max Amount']];
    Object.keys(rec).map(function (k) { return rec[k]; }).filter(function (o) { return Object.keys(o.mon).length >= 3; })
      .sort(function (a, b) { return Object.keys(b.mon).length - Object.keys(a.mon).length || b.amts.length - a.amts.length; }).slice(0, 40)
      .forEach(function (o) { R.push([o.side, o.name, I(Object.keys(o.mon).length), I(o.amts.length), N(r2(o.amts.reduce(function (a, b) { return a + b; }, 0) / o.amts.length)), N(Math.min.apply(null, o.amts)), N(Math.max.apply(null, o.amts))]); });
    if (R.length === 1) R.push(['No recurring counterparties (≥3 months) detected', '', '', '', '', '', '']);
    sheets.push({ name: 'Recurring Txns', aoa: R, widths: [10, 36, 15, 12, 16, 16, 16] });

    /* Statement checks */
    var C = [['Check', 'Result', 'Details']];
    C.push(['Reconciliation (Opening + Credits − Debits = Closing)', stm.reconciled == null ? 'N/A' : (stm.reconciled ? 'PASS' : 'FAIL'), 'Opening ' + (stm.opening == null ? '-' : stm.opening) + ' | Credits ' + stm.totalCredits + ' | Debits ' + stm.totalDebits + ' | Closing ' + (stm.closing == null ? '-' : stm.closing)]);
    C.push(['Running-balance continuity', stm.chainRatio == null ? 'N/A' : (stm.chainRatio >= 0.99 ? 'PASS' : 'REVIEW'), stm.chainRatio == null ? '' : Math.round(stm.chainRatio * 1000) / 10 + '% of ' + stm.chainChecked + ' rows']);
    var mism = txns.filter(function (t) { return t.chainOk === false; });
    C.push(['Rows with balance mismatch', mism.length ? 'REVIEW' : 'PASS', mism.length + ' row(s)']);
    mism.slice(0, 60).forEach(function (t) { C.push(['   Mismatch at Sl ' + t.n, 'REVIEW', fmtDate(t.date) + ' | ' + t.desc.slice(0, 60) + ' | difference ' + t.diff]); });
    var nob = txns.filter(function (t) { return t.balance == null; }).length;
    C.push(['Rows missing running balance', nob ? 'REVIEW' : 'PASS', nob + ' row(s)']);
    var dup = 0, dupRows = [];
    for (var q = 1; q < txns.length; q++) { var a1 = txns[q - 1], b1 = txns[q]; if (a1.date === b1.date && a1.desc === b1.desc && a1.debit === b1.debit && a1.credit === b1.credit && a1.balance === b1.balance) { dup++; dupRows.push(b1.n); } }
    C.push(['Possible duplicate rows', dup ? 'REVIEW' : 'PASS', dup ? 'Sl: ' + dupRows.slice(0, 20).join(', ') : '0']);
    var gaps2 = [];
    for (var z = 1; z < txns.length; z++) { var gd = dayNum(txns[z].date) - dayNum(txns[z - 1].date); if (gd > 31) gaps2.push(fmtDate(txns[z - 1].date) + ' → ' + fmtDate(txns[z].date)); }
    C.push(['Large date gaps (>31 days)', gaps2.length ? 'REVIEW' : 'PASS', gaps2.join('; ') || 'None']);
    var ooo = 0; for (var y = 1; y < txns.length; y++) if (txns[y].date < txns[y - 1].date) ooo++;
    C.push(['Chronological order', ooo ? 'REVIEW' : 'PASS', ooo + ' out-of-order row(s)']);
    var empty = months.filter(function (k) { return !txns.some(function (t) { return monthKey(t.date) === k; }); });
    C.push(['Months without transactions', empty.length ? 'REVIEW' : 'PASS', empty.map(monthLabel).join(', ') || 'None']);
    stm.warnings.forEach(function (w) { C.push(['Note', 'INFO', w]); });
    sheets.push({ name: 'Statement Checks', aoa: C, widths: [52, 12, 90] });

    /* Mode summary */
    var modeMap = {};
    txns.forEach(function (t) {
      var o = modeMap[t.mode] || (modeMap[t.mode] = { name: t.mode, drN: 0, drA: 0, crN: 0, crA: 0 });
      if (t.debit > 0) { o.drN++; o.drA += t.debit; }
      if (t.credit > 0) { o.crN++; o.crA += t.credit; }
    });
    var modes = Object.keys(modeMap).map(function (k) { return modeMap[k]; }).sort(function (a, b) { return (b.drA + b.crA) - (a.drA + a.crA); });
    var MS = [['Mode of Payment', 'Debit Count', 'Debit Amount', '% of Debits', 'Credit Count', 'Credit Amount', '% of Credits']];
    modes.forEach(function (o) {
      MS.push([o.name, I(o.drN), N(r2(o.drA)), stm.totalDebits ? { v: o.drA / stm.totalDebits, t: 'n', z: '0.0%' } : '', I(o.crN), N(r2(o.crA)), stm.totalCredits ? { v: o.crA / stm.totalCredits, t: 'n', z: '0.0%' } : '']);
    });
    sheets.push({ name: 'Mode Summary', aoa: MS, widths: [20, 13, 18, 12, 13, 18, 13] });

    /* Document forensics */
    var DF = [['DOCUMENT FORENSICS — metadata and consistency indicators only. They are not proof of authenticity or of tampering.', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', ''],
      ['File', 'Type', 'Software (Producer / Creator)', 'Created', 'Modified', 'Pages', 'Result', 'Findings']];
    fx.rows.forEach(function (r) { DF.push([r.name, r.info.kind || '', r.software, D(r.created), D(r.modified), r.info.pages != null ? I(r.info.pages) : '', r.result, r.findings.join(' ')]); });
    DF.push(['', '', '', '', '', '', '', ''], ['STATEMENT-LEVEL CONSISTENCY', '', '', '', '', '', '', ''], ['Check', '', '', '', '', '', 'Result', 'Detail']);
    DF.push(['Opening + credits − debits = closing', '', '', '', '', '', stm.reconciled == null ? 'N/A' : (stm.reconciled ? 'OK' : 'HIGH'), 'A statement whose totals do not reconcile may have missing or altered rows.']);
    DF.push(['Running-balance continuity', '', '', '', '', '', stm.chainRatio == null ? 'N/A' : (stm.chainRatio >= 0.99 ? 'OK' : 'REVIEW'), mism.length + ' row(s) where previous balance + credit − debit ≠ balance shown.']);
    DF.push(['Possible duplicate rows', '', '', '', '', '', dup ? 'REVIEW' : 'OK', dup + ' row(s) identical to the one before.']);
    sheets.push({ name: 'Document Forensics', aoa: DF, widths: [44, 9, 34, 13, 13, 8, 10, 96] });

    /* Source files */
    var F = [['File', 'Transactions', 'From', 'To', 'Parser', 'OCR', 'Balance check %']];
    (stm.files || [{ name: stm.fileName, txns: txns.length, from: from, to: to, mode: stm.parseMode, ocr: stm.ocr, ratio: stm.chainRatio }]).forEach(function (f) {
      F.push([f.name, I(f.txns), D(f.from), D(f.to), f.mode, f.ocr ? 'Yes' : 'No', f.ratio == null ? '' : Math.round(f.ratio * 100)]);
    });
    sheets.push({ name: 'Source Files', aoa: F, widths: [44, 14, 13, 13, 16, 8, 16] });


    /* irregular transactions (FCU) */
    var irregular = [];
    var addIr = function (t, ind, sev, why) { irregular.push({ t: t, ind: ind, sev: sev, why: why }); };
    txns.forEach(function (t, i) {
      if (t.chainOk === false) addIr(t, 'Balance mismatch', 'HIGH', 'Previous balance + credit − debit does not equal the balance shown (difference ' + t.diff + ').');
      if (i > 0) { var p0 = txns[i - 1]; if (p0.date === t.date && p0.desc === t.desc && p0.debit === t.debit && p0.credit === t.credit && p0.balance === t.balance) addIr(t, 'Possible duplicate row', 'MEDIUM', 'Identical to the row before it.'); }
      if (has(t, 'CASH_DEP') && t.credit >= 40000 && t.credit < 50000) addIr(t, 'Cash deposit just below ₹50,000', 'MEDIUM', 'Cash deposits close to the ₹50,000 reporting threshold.');
      var amt = t.credit > 0 ? t.credit : t.debit;
      if (amt >= Math.max(HV, 100000) && amt % 100000 === 0 && !has(t, 'SELF') && !has(t, 'SALARY')) addIr(t, 'Round-figure high-value ' + (t.credit > 0 ? 'credit' : 'debit'), 'MEDIUM', 'Exact multiple of ₹1,00,000.');
      if (isBounceTx(t)) addIr(t, 'Cheque / ECS return', 'HIGH', 'Instrument returned unpaid.');
      if (t.credit >= Math.max(HV, 50000) && !has(t, 'SELF') && !has(t, 'LOAN_CR')) {
        var d0 = dayNum(t.date), out = 0;
        for (var j = i + 1; j < txns.length && dayNum(txns[j].date) - d0 <= 2; j++) if (txns[j].debit > 0 && !has(txns[j], 'SELF')) out += txns[j].debit;
        if (out >= 0.9 * t.credit) addIr(t, 'Pass-through credit', 'MEDIUM', 'At least 90% of this credit was debited within 2 days.');
      }
      if (t.balance == null) addIr(t, 'Missing running balance', 'MEDIUM', 'Row has no balance, so it cannot be verified.');
    });
    var legacy = {}; sheets.forEach(function (x) { legacy[x.name] = x.aoa; });
    var workbook = buildWorkbook({ stm: stm, m: m, txns: txns, monthly: monthly, LIM: LIM, has: has, ins: ins, fx: fx, balOn: balOn, fromN: fromN, toN: toN,
      selfTx: selfTx, BN: BN, isPenal: isPenal, chqNo: chqNo, emis: emis, loanCr: loanCr, legacy: legacy, dupRows: dupRows, irregular: irregular });
    return { workbook: workbook, turnover: turnover, parties: partyList(txns), od: odInfo, fx: fx, netCr: netCrTot, netDr: netDrTot, limit: LIM, modes: modes, insights: ins, cats: cats, daily: daily, sheets: sheets, monthly: monthly, abb: abb, minBal: minBal, maxBal: maxBal, topC: topC.slice(0, 10), topD: topD.slice(0, 10), bounces: bounces.length, cashDep: cashDep.length, emis: emis.length };
  }

  /* ================= Excel workbook (15 sheets, styled) ================= */
  // All counterparties with both sides, for the Parties tab / sheet. Own-account transfers are kept but marked.
  function partyList(txns) {
    var map = {};
    txns.forEach(function (t) {
      if (!t.cpty || !(t.credit > 0 || t.debit > 0)) return;
      var k = t.cpty.replace(/[^A-Z]/g, ''); if (!k) return;
      var o = map[k] || (map[k] = { name: t.cpty, crN: 0, crA: 0, drN: 0, drA: 0, first: t.date, last: t.date, mon: {}, self: false });
      if (t.credit > 0) { o.crN++; o.crA += t.credit; } if (t.debit > 0) { o.drN++; o.drA += t.debit; }
      if (t.date < o.first) o.first = t.date; if (t.date > o.last) o.last = t.date; o.mon[t.date.slice(0, 7)] = 1;
      if (t.tags && t.tags.indexOf('SELF') >= 0) o.self = true;
    });
    return Object.keys(map).map(function (k) { var o = map[k]; o.months = Object.keys(o.mon).length; o.net = o.crA - o.drA; o.vol = o.crA + o.drA; delete o.mon; return o; })
      .sort(function (a, b) { return b.vol - a.vol; });
  }
  function buildWorkbook(c) {
    var stm = c.stm, m = c.m || {}, txns = c.txns, monthly = c.monthly, LIM = c.LIM, has = c.has, ins = c.ins, fx = c.fx;
    var mdesc = monthly.slice().reverse();
    var ml = function (key) { var p = key.split('-'); return MN[+p[1] - 1] + '-' + p[0].slice(2); };
    var dstr = function (iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '-' + p[1] + '-' + p[0]; };
    var cs = function (v, s) { return { v: v == null ? '' : v, t: 's', s: s || 'td' }; };
    var cn = function (v, s) { return { v: v == null || v === '' ? '' : v, s: s || 'tdn' }; };
    var cd = function (iso) { return iso ? { v: excelSerial(iso), s: 'tdd' } : cs('', 'td'); };
    var blanks = function (n, s) { var a = []; for (var i = 0; i < n; i++) a.push({ v: '', s: s }); return a; };
    var mean = function (a) { return a.length ? r2(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : ''; };
    var sheets = [];
    var holder = m.holder || '';
    var thr = function (x) { return x.map(function (y) { return cs(y, 'th'); }); };

    /* ---------- 1. Analysis (same layout as the reference: Summary Info + Monthwise Details, live formulas) ---------- */
    var A = [], merges = [];
    var now = new Date(), tid = 'YV' + now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + String(Math.floor(Math.random() * 900 + 100));
    var facility = LIM > 0 ? (m.accountType === 'Cash Credit' ? 'CC' : 'OD') : ({ 'Overdraft': 'OD', 'Cash Credit': 'CC' }[m.accountType] || 'NONE');
    var colL = function (i) { var s = '', n = i + 1; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
    var monthCell = function (key, s) { return { v: excelSerial(key + '-01'), z: 'mmm-yy', s: s }; };
    var nM = mdesc.length, cF = colL(1), cLast = colL(nM), cAvg = colL(nM + 1), cTot = colL(nM + 2);
    A.push([cs('Summary Info', 'title')]);
    [['Name of the Entity/Individual', holder], ['Address', m.address || ''], ['Email', m.email || ''], ['PAN', m.pan || ''], ['Mobile Number', m.mobile || ''],
      ['Applicant ID', ''], ['Source Name', ''], ['Product Type', ''], ['Data source', 'Uploaded Statements'], ['Report / Transaction Id', tid]].forEach(function (p) {
      A.push([cs(p[0], 'lbl'), cs(p[1], 'val'), cs('', 'val'), cs('', 'val')]); merges.push('B' + A.length + ':D' + A.length);
    });
    A.push([]);
    A.push([cs('Summary Info', 'title')]);
    [['Name of the Bank', m.bank || ''], ['Account Number', m.accountNo || ''], ['Facility Type', facility], ['OD limit (if applicable)', '']].forEach(function (p) {
      A.push([cs(p[0], 'lbl'), cs(p[1], 'val'), cs('', 'val'), cs('', 'val')]); merges.push('B' + A.length + ':D' + A.length);
    });
    var odRow = A.length;
    A.push([]);
    A.push([cs('Monthwise Details', 'title')]);
    A.push([cs('Item', 'itemh')].concat(mdesc.map(function (x) { return monthCell(x.key, 'monthh'); }), [cs('AVERAGE', 'monthh'), cs('TOTAL', 'monthh')]));
    var P0 = function (a, b) { return b > 0 ? a / b : 0; };
    var violated = function (x) { return x.minB != null && x.minB < 0; };
    var defs = [
      ['Sanction Limit', function () { return LIM; }, 'bal', 'data'],
      ['Drawing power limit', function () { return +m.dp || LIM; }, 'bal', 'data'],
      ['Balance as on 2nd', function (x) { return x.on[2]; }, 'bal', 'data'],
      ['10th day balance for the Month', function (x) { return x.on[10]; }, 'bal', 'data'],
      ['20th day balance for the Month', function (x) { return x.on[20]; }, 'bal', 'data'],
      ['Month end balance for the Month', function (x) { return x.closeB; }, 'bal', 'data'],
      ['Debit Count for the month', function (x) { return x.drN; }, 'sum', 'datai'],
      ['Total Debit amount for the month', function (x) { return x.drA; }, 'sum', 'data'],
      ['Credit Count for the month', function (x) { return x.crN; }, 'sum', 'datai'],
      ['Total Credit amount for the month', function (x) { return x.crA; }, 'sum', 'data'],
      ['Inward Bounces for the month', function (x) { return x.inwN; }, 'sum', 'datai'],
      ['Outward Bounces for the month', function (x) { return x.outN; }, 'sum', 'datai'],
      ['% of inward bounces', function (x) { return P0(x.inwN, x.drN); }, 'pct', 'datap'],
      ['Monthly Average Balance', function (x) { return x.adb; }, 'bal', 'data'],
      ['Investment Income Credit', function (x) { return x.invCrA; }, 'sum', 'data'],
      ['Investment Payment Debit', function (x) { return x.invA; }, 'sum', 'data'],
      ['No of overdrawn days for Month', function (x) { return x.odDays; }, 'sum', 'datai'],
      ['OD/CC Utilization for the Month %', function (x) { return LIM > 0 && x.utilAvg != null ? x.utilAvg / 100 : 0; }, 'pct', 'datap'],
      ['Highest OD/CC utilization date', function (x) { return violated(x) ? dstr(x.minDate) : ''; }, 'date', 'datat'],
      ['Highest OD/CC utilization amount', function (x) { return violated(x) ? x.minB : 0; }, 'bal', 'data'],
      ['Total No. of Cash Deposits', function (x) { return x.cashDepN; }, 'sum', 'datai'],
      ['Total Amount of Cash Deposits', function (x) { return x.cashDepA; }, 'sum', 'data'],
      ['Total No. of Cash Withdrawals', function (x) { return x.cashWdlN; }, 'sum', 'datai'],
      ['Total Amount of Cash Withdrawals', function (x) { return x.cashWdlA; }, 'sum', 'data'],
      ['% of Cash withdrawals', function (x) { return P0(x.cashWdlN, x.drN); }, 'pct', 'datap'],
      ['% of Cash Deposit', function (x) { return P0(x.cashDepN, x.crN); }, 'pct', 'datap'],
      ['Self/sister company (Cr\'s)', function (x) { return x.selfCrA; }, 'sum', 'data'],
      ['Self/sister company (dr\'s)', function (x) { return x.selfDrA; }, 'sum', 'data'],
      ['Business Credits', function (x) { return r2(x.crA - (x.invCrA || 0) - (x.loanCrA || 0)); }, 'sum', 'data'],
      ['Turnover (credits excl. own-name / related & loan credits)', function (x) { return x.turnA; }, 'sum', 'data'],
      ['Total No of Penalty Charges', function (x) { return x.penN; }, 'sum', 'datai'],
      ['Total amount of Penalty Charges', function (x) { return x.penA; }, 'sum', 'data'],
      ['Total No of EMI or loan payments', function (x) { return x.emiN; }, 'sum', 'datai'],
      ['Total Amount of EMI or loan payments', function (x) { return x.emiA; }, 'sum', 'data'],
      ['Total Loan Credits Amount', function (x) { return x.loanCrA; }, 'sum', 'data'],
      ['Total Loan Credits Count', function (x) { return x.loanCrN; }, 'sum', 'datai']
    ];
    var rowOf = {}, startRow = A.length + 1, V = {};
    defs.forEach(function (d, i) { rowOf[d[0]] = startRow + i; V[d[0]] = mdesc.map(function (x) { return d[1](x); }); });
    var R = function (l) { return rowOf[l]; };
    var FM = {
      '% of inward bounces': function (c) { return 'IF(' + c + R('Debit Count for the month') + '>0,(' + c + R('Inward Bounces for the month') + '/' + c + R('Debit Count for the month') + '),0)'; },
      '% of Cash withdrawals': function (c) { return 'IF(' + c + R('Debit Count for the month') + '>0,' + c + R('Total No. of Cash Withdrawals') + '/' + c + R('Debit Count for the month') + ',0)'; },
      '% of Cash Deposit': function (c) { return 'IF(' + c + R('Credit Count for the month') + '>0,' + c + R('Total No. of Cash Deposits') + '/' + c + R('Credit Count for the month') + ',0)'; },
      'Business Credits': function (c) { return c + R('Total Credit amount for the month') + '-' + c + R('Investment Income Credit') + '-' + c + R('Total Loan Credits Amount'); }
    };
    var avgOf = {};
    defs.forEach(function (d) {
      var lab = d[0], vals = V[lab], nums = vals.filter(function (v) { return typeof v === 'number'; });
      var r = R(lab), sty = d[3], avg = (d[2] === 'date' || !nums.length) ? '' : mean(nums);
      var tot = (d[2] === 'sum' || d[2] === 'bal') && nums.length ? r2(nums.reduce(function (a, b) { return a + b; }, 0)) : '';
      avgOf[lab] = avg;
      var cells = vals.map(function (v, j) { var o = { v: v == null ? '' : v, s: sty }; if (FM[lab] && typeof v === 'number') o.f = FM[lab](colL(j + 1)); return o; });
      var rng = cF + r + ':' + cLast + r, avgS = d[2] === 'pct' ? 'datap' : (sty === 'datai' ? 'data' : sty);
      A.push([cs(lab, 'item')].concat(cells, [avg === '' ? { v: '', s: avgS } : { f: 'AVERAGE(' + rng + ')', v: avg, s: avgS }, tot === '' ? { v: '', s: sty } : { f: 'SUM(' + rng + ')', v: tot, s: sty }]));
    });
    A[odRow - 1][1] = { f: cAvg + R('Drawing power limit'), v: avgOf['Drawing power limit'] === '' ? 0 : avgOf['Drawing power limit'], s: 'valn' };
    A.push([]);
    A.push([cs('Notes', 'bold')]);
    ['Months are shown latest first. "Balance as on 2nd / 10th / 20th" are end-of-day balances rebuilt from the statement; month-end is the last balance of the month.',
      'Inward bounce % = inward cheque/ECS returns ÷ debit count. Cash withdrawal % = cash withdrawal count ÷ debit count. Cash deposit % = cash deposit count ÷ credit count. Business Credits = total credits − investment income − loan credits.',
      'Sanction / drawing power limit is taken from the OD/CC limit entered on the page (or read from the statement header). Utilisation counts only overdrawn (negative) balances. AVERAGE / TOTAL columns are live Excel formulas.',
      'Own-account / sister-company transfers are detected from the account-holder name and narration keywords; review the "Own Transfers" sheet.'
    ].forEach(function (t) { A.push([cs(t, 'note')]); });
    sheets.push({ name: 'Summary', rows: A, widths: [46].concat(mdesc.map(function () { return 17; }), [17, 17]), merges: merges, freeze: 'B1', grid: false, tab: 'F4B183' });

    /* ---------- 3. EOD Balances ---------- */
    var EO = [[cs('Day/Month', 'th')].concat(mdesc.map(function (x) { return monthCell(x.key, 'th'); }))];
    for (var day = 1; day <= 31; day++) {
      var row = [cs(day, 'tdi')];
      mdesc.forEach(function (x) {
        if (day > daysInMonth(x.key)) { row.push(cs('', 'td')); return; }
        var iso = x.key + '-' + pad(day), n = dayNum(iso);
        row.push(n < c.fromN || n > c.toN ? cs('', 'td') : cn(c.balOn(iso), 'tdn'));
      });
      EO.push(row);
    }
    sheets.push({ name: 'Daily Balances', rows: EO, widths: [12].concat(mdesc.map(function () { return 17; })), freeze: 'B2' });

    /* ---------- 4. Transfer from to self sister co ---------- */
    var selfTx = c.selfTx, chq = function (t) { return c.chqNo(t) || ''; };
    var HDR7 = ['Sl. No.', 'Date', 'Cheque No.', 'Description', 'Amount', 'Category', 'Balance'];
    var signed = function (t) { return t.credit > 0 ? t.credit : -t.debit; };
    var row7 = function (n, t) { return [cn(n, 'tdi'), cd(t.date), cs(chq(t)), cs(t.desc), cn(signed(t)), cs(t.pcat), cn(t.balance)]; };
    var SR = [thr(HDR7.concat(['Why treated as own / related']))];
    selfTx.forEach(function (t, i) { SR.push(row7(i + 1, t).concat([cs(t.rel || (t.tags.indexOf('SELF') >= 0 ? 'Own account / self transfer' : ''), 'tdw')])); });
    sheets.push({ name: 'Own Transfers', rows: SR, widths: [8, 13, 14, 70, 16, 24, 16, 46], freeze: 'A2' });

    /* ---------- 5. Bounced penal xns ---------- */
    var BP = [[cs('Cheque / ECS bounces and penal charges', 'title')],
      [cs('Inward bounces (instruments issued by the account holder returned)', 'lbl'), cn(c.BN.filter(function (x) { return x.dir === 'Inward'; }).length, 'tdi')],
      [cs('Outward bounces (instruments deposited by the account holder returned)', 'lbl'), cn(c.BN.filter(function (x) { return x.dir === 'Outward'; }).length, 'tdi')],
      [cs('Direction not stated by the bank', 'lbl'), cn(c.BN.filter(function (x) { return x.dir === 'Unspecified'; }).length, 'tdi')],
      [cs('Total return / bounce charges', 'lbl'), cn(sum(txns.filter(function (t) { return has(t, 'RETURN_CHARGE'); }), function (t) { return t.debit; }))],
      [cs('Other penal charges (min balance, late fee, etc.)', 'lbl'), cn(sum(txns.filter(function (t) { return c.isPenal(t) && !has(t, 'RETURN_CHARGE'); }), function (t) { return t.debit; }))], []];
    BP.push(thr(['Date', 'Type', 'Instrument', 'Cheque / Ref', 'Narration', 'Debit', 'Credit', 'Reason', 'Return charges linked (±3 days)', 'Balance']));
    var bpRows = [];
    c.BN.forEach(function (x) { bpRows.push({ d: x.t.date, r: [cd(x.t.date), cs(x.dir + ' bounce', 'high'), cs(x.inst), cs(c.chqNo(x.t) || x.t.ref), cs(x.t.desc, 'tdw'), cn(x.t.debit > 0 ? x.t.debit : ''), cn(x.t.credit > 0 ? x.t.credit : ''), cs(x.reason), cn(x.chg || ''), cn(x.t.balance)] }); });
    txns.filter(function (t) { return c.isPenal(t); }).forEach(function (t) { bpRows.push({ d: t.date, r: [cd(t.date), cs(has(t, 'RETURN_CHARGE') ? 'Return charge' : 'Penal charge', 'med'), cs(''), cs(t.ref), cs(t.desc, 'tdw'), cn(t.debit), cn(''), cs(''), cn(''), cn(t.balance)] }); });
    bpRows.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }).forEach(function (o) { BP.push(o.r); });
    if (!bpRows.length) BP.push([cs('No bounces or penal charges found', 'td')]);
    sheets.push({ name: 'Bounces & Penalties', rows: BP, widths: [64, 18, 16, 16, 62, 15, 15, 24, 20, 16] });

    /* ---------- 6/7. Top 5 high value credits / debits (top 5 of every month) ---------- */
    function top5(side, name) {
      var key = side === 'C' ? 'credit' : 'debit', T = [thr(HDR7)], n = 0;
      monthly.forEach(function (x) {
        txns.filter(function (t) { return monthKey(t.date) === x.key && t[key] > 0; }).sort(function (a, b) { return b[key] - a[key]; }).slice(0, 5)
          .forEach(function (t) { n++; T.push(row7(n, t)); });
      });
      if (!n) T.push([cs('No transactions', 'td')]);
      sheets.push({ name: name, rows: T, widths: [8, 13, 14, 70, 16, 34, 16], freeze: 'A2' });
    }
    top5('C', 'Top Credits'); top5('D', 'Top Debits');

    /* ---------- 8/9. Regular Credits / Regular Debits (grouped by category / party) ---------- */
    var HDR8 = ['Group', 'Sl. No.', 'Date', 'Cheque No.', 'Description', 'Amount', 'Category', 'Balance'];
    function regular(side, name) {
      var key = side === 'C' ? 'credit' : 'debit', groups = {}, order = [];
      txns.forEach(function (t) {
        if (!(t[key] > 0) || !t.pcat || t.pcat === 'Others' || t.pcat === 'Bank Charges') return;
        var g = groups[t.pcat]; if (!g) { g = groups[t.pcat] = []; order.push(t.pcat); } g.push(t);
      });
      var T = [thr(HDR8)], gi = 0;
      order.filter(function (k) { return groups[k].length >= 2; }).forEach(function (k) {
        gi++; groups[k].forEach(function (t, i) { T.push([cn(gi, 'tdi'), cn(i + 1, 'tdi'), cd(t.date), cs(chq(t)), cs(t.desc), cn(signed(t)), cs(t.pcat), cn(t.balance)]); });
      });
      if (!gi) T.push([cs('No regular ' + (side === 'C' ? 'credits' : 'debits') + ' found', 'td')]);
      sheets.push({ name: name, rows: T, widths: [8, 8, 13, 14, 70, 16, 34, 16], freeze: 'A2' });
    }
    regular('C', 'Recurring Credits'); regular('D', 'Recurring Debits');

    /* ---------- Parties (all counterparties) ---------- */
    var PL = partyList(txns), PT = [thr(['Rank', 'Counterparty', 'Credit Txns', 'Credit Amount', 'Debit Txns', 'Debit Amount', 'Net (Cr − Dr)', 'Months Active', 'First Txn', 'Last Txn', 'Own / Sister'])];
    PL.slice(0, 500).forEach(function (o, i) { PT.push([cn(i + 1, 'tdi'), cs(o.name), cn(o.crN, 'tdi'), cn(o.crA), cn(o.drN, 'tdi'), cn(o.drA), cn(o.net), cn(o.months, 'tdi'), cd(o.first), cd(o.last), cs(o.self ? 'Yes' : '')]); });
    if (!PL.length) PT.push([cs('No counterparties identified', 'td')]);
    sheets.push({ name: 'Parties', rows: PT, widths: [7, 40, 11, 18, 11, 18, 18, 12, 13, 13, 12], freeze: 'A2', filter: 'A1:K' + PT.length });

    /* ---------- 10. Xns all transactions ---------- */
    var X = [thr(HDR7.concat(['Mode', 'Flags', 'Counterparty', 'Value Date', 'Balance check', 'Source file']))];
    txns.forEach(function (t) {
      X.push(row7(t.n, t).concat([cs(t.mode), cs(t.tags.join(', ')), cs(t.cpty), cd(t.valueDate),
        cs(t.chainOk === false ? 'MISMATCH (' + t.diff + ')' : (t.chainOk ? 'OK' : ''), t.chainOk === false ? 'high' : 'td'), cs(t.src || stm.fileName || '')]));
    });
    sheets.push({ name: 'All Transactions', rows: X, widths: [8, 13, 14, 70, 16, 34, 16, 11, 24, 28, 13, 16, 24], freeze: 'A2', filter: 'A1:M' + X.length });

    /* ---------- 11. Loan track ---------- */
    var emis = c.emis, loanCr = c.loanCr;
    var LT = [[cs('LOAN TRACK', 'title')], [cs('Category', 'th'), cs('Month/Year', 'th')], [cs('', 'td')].concat(mdesc.map(function (x) { return monthCell(x.key, 'th'); }))];
    var streams = {}, sOrder = [];
    emis.forEach(function (t) {
      var k = (t.pcat || 'Loan') + '|' + Math.round(t.debit); var o = streams[k];
      if (!o) { o = streams[k] = { cat: t.pcat || 'Loan', amt: Math.round(t.debit), by: {} }; sOrder.push(k); }
      (o.by[monthKey(t.date)] = o.by[monthKey(t.date)] || []).push(dstr2(t.date));
    });
    function dstr2(iso) { var p = iso.split('-'); return p[2] + '-' + MN[+p[1] - 1] + '-' + p[0].slice(2); }
    var catRank = function (c0) { return c0 === 'Home Loan' ? 0 : (c0 === 'Loan' ? 1 : 2); };
    sOrder.map(function (k) { return streams[k]; }).sort(function (a, b) { return catRank(a.cat) - catRank(b.cat) || (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : 0) || a.amt - b.amt; }).forEach(function (o) {
      LT.push([cs(o.cat, 'item')].concat(mdesc.map(function (x) { return o.by[x.key] ? { v: o.by[x.key].join(', '), t: 's', s: 'td' } : cs('', 'td'); })));
      LT.push([cn(o.amt, 'tdi')]);
    });
    if (!sOrder.length) LT.push([cs('No EMI / loan debits detected', 'td')]);
    LT.push([]); LT.push([cs('Lender / party summary', 'h2')]);
    LT.push(thr(['Lender / party (EMI debits)', 'No. of txns', 'Months present', 'Avg EMI', 'Min', 'Max', 'Total paid']));
    var lm = {};
    emis.forEach(function (t) { var k = t.cpty || 'UNIDENTIFIED'; var o = lm[k] || (lm[k] = { n: k, a: [], mon: {} }); o.a.push(t.debit); o.mon[monthKey(t.date)] = 1; });
    Object.keys(lm).map(function (k) { return lm[k]; }).sort(function (a, b) { return b.a.reduce(function (x, y) { return x + y; }, 0) - a.a.reduce(function (x, y) { return x + y; }, 0); }).forEach(function (o) {
      var tot = o.a.reduce(function (a, b) { return a + b; }, 0);
      LT.push([cs(o.n), cn(o.a.length, 'tdi'), cn(Object.keys(o.mon).length, 'tdi'), cn(r2(tot / o.a.length)), cn(Math.min.apply(null, o.a)), cn(Math.max.apply(null, o.a)), cn(r2(tot))]);
    });
    LT.push([cs('Estimated monthly EMI outflow', 'lbl'), cn(r2(ins.emiMonthly || 0))]);
    LT.push([cs('Obligation ratio (FOIR)', 'lbl'), ins.foir == null ? cs('n/a') : cn(ins.foir, 'tdp')]);
    LT.push([]); LT.push([cs('Loan credits / disbursals', 'h2')]); LT.push(thr(['Date', 'Narration', 'Party', 'Mode', 'Credit', 'Balance']));
    loanCr.forEach(function (t) { LT.push([cd(t.date), cs(t.desc), cs(t.cpty), cs(t.mode), cn(t.credit), cn(t.balance)]); });
    if (!loanCr.length) LT.push([cs('No loan credits detected', 'td')]);
    sheets.push({ name: 'Loans & EMIs', rows: LT, widths: [34].concat(mdesc.map(function () { return 17; })), freeze: 'B4' });

    /* ---------- 12. Statements considered ---------- */
    var SC = [thr(['File Name', 'Institution', 'Account No', 'Transaction Start Date', 'Transaction End Date', 'Name as in Statement', 'Address as in Statement', 'Mobile as in Statement', 'Landline as in Statement', 'Email as in Statement', 'PAN as in Statement', 'Password Protected', 'Statement Status', 'Report / Transaction Id'])];
    (stm.files || [{ name: stm.fileName, txns: txns.length, from: stm.from, to: stm.to, ratio: stm.chainRatio, docInfo: stm.docInfo }]).forEach(function (f) {
      var st = f.ratio == null ? 'UNVERIFIED' : (f.ratio >= 0.99 && stm.reconciled !== false ? 'VERIFIED' : 'REVIEW');
      SC.push([cs(f.name), cs(m.bank || ''), cs(m.accountNo || ''), cd(f.from), cd(f.to), cs(holder), cs(m.address || ''), cs(m.mobile || ''), cs(''), cs(m.email || ''), cs(m.pan || ''),
        cs(f.docInfo && f.docInfo.pwd ? 'Yes' : 'No'), cs(st, st === 'VERIFIED' ? 'good' : 'med'), cs(tid)]);
    });
    sheets.push({ name: 'Files Used', rows: SC, widths: [34, 20, 18, 16, 16, 28, 40, 16, 16, 24, 14, 12, 14, 26], freeze: 'A2' });

    /* ---------- 13. FCU indicators (same two-block layout: fraud indicators, then behavioural indicators) ---------- */
    var isOdAcct = LIM > 0 || /overdraft|cash credit/i.test(m.accountType || '');
    var holidayHit = function (iso) { var d = new Date(iso + 'T00:00:00Z').getUTCDay(); return d === 0 || /-(01-26|08-15|10-02)$/.test(iso); };
    var f1 = txns.filter(function (t) { return t.debit > 0 && t.mode === 'ATM' && has(t, 'CASH_WDL') && t.debit % 100 !== 0; }).length;
    var f2 = txns.filter(function (t) { return t.mode === 'RTGS' && !has(t, 'CHARGE') && Math.max(t.debit, t.credit) > 0 && Math.max(t.debit, t.credit) < 200000; }).length;
    var f3 = txns.filter(function (t) { return has(t, 'CHQ_DEP') && holidayHit(t.date); }).length;
    var f4 = txns.filter(function (t) { return t.chainOk === false; }).length;
    var f5 = fx.rows.filter(function (r) { return r.level === 'high'; }).length;
    var totCrA = sum(txns, function (t) { return t.credit; }), totDrA = sum(txns, function (t) { return t.debit; });
    var nCr = txns.filter(function (t) { return t.credit > 0; }).length, nDr = txns.filter(function (t) { return t.debit > 0; }).length;
    var b6 = (totCrA > 0 && Math.abs(totCrA - totDrA) < 0.005 ? 1 : 0) + (nCr > 0 && nCr === nDr ? 1 : 0);
    var b7 = isOdAcct ? 0 : sum(monthly, function (x) { return x.odDays || 0; });
    var intM = {}; txns.forEach(function (t) { if (has(t, 'INTEREST_DR')) intM[monthKey(t.date)] = 1; });
    var intKeys = Object.keys(intM).sort(), b8 = 0;
    if (intKeys.length) monthly.forEach(function (x) { if (x.key >= intKeys[0] && x.key <= intKeys[intKeys.length - 1] && !intM[x.key]) b8++; });
    var b9 = txns.filter(function (t) { return t.debit > 0 && t.pcat === 'Tax' && t.debit % 100 === 0; }).length;
    var pm = {}; txns.forEach(function (t) { if (t.debit > 0 && /^Transfer to /.test(t.pcat || '') && !has(t, 'SELF')) { var o = pm[t.pcat] || (pm[t.pcat] = { n: 0, m: {} }); o.n++; o.m[monthKey(t.date)] = 1; } });
    var b10 = 0;
    Object.keys(pm).forEach(function (k) {
      var ks = Object.keys(pm[k].m).sort(); if (pm[k].n < 3 || ks.length < 3) return;
      var miss = monthly.filter(function (x) { return x.key >= ks[0] && x.key <= ks[ks.length - 1] && !pm[k].m[x.key]; }).length; if (miss > 0) b10++;
    });
    var YN = function (n) { return cs(n > 0 ? 'Y' : 'N', n > 0 ? 'high' : 'good'); };
    var fcuRow = function (no, txt, n) { return [cn(no, 'tdi'), cs(txt, 'tdw'), cs('', 'tdw'), cs('', 'tdw'), YN(n), cn(n, 'tdi')]; };
    var FI = [], fm = [], fh = [];
    FI.push([cs('#', 'th'), cs('Possible Fraud Indicators', 'th'), cs('', 'th'), cs('', 'th'), cs('Identified?', 'th'), cs('Count of Triggers', 'th')]); fm.push('B1:D1');
    [['Suspicious ATM Withdrawals\nATM Withdrawals having amount not being multiple of 100, or outside the permissible range.', f1, 32],
      ['Suspicious RTGS Transactions\nRTGS transactions have a minimum amount limit as prescribed by RBI (₹2,00,000).', f2, 32],
      ['Transactions on Bank holidays\nCheque deposit transactions cannot happen on Bank holidays (Sundays and national holidays are checked).', f3, 32],
      ['Amount-Balance Mismatches\nTransactions whose amount / balance do not match with the previous transaction (previous balance + credit − debit ≠ balance). May indicate rows that were added, deleted or edited.', f4, 46],
      ['Suspicious bank eStatement\nStatement files whose PDF metadata or structure look edited (see the File Checks sheet).', f5, 32]].forEach(function (d, i) {
      FI.push(fcuRow(i + 1, d[0], d[1])); fm.push('B' + FI.length + ':D' + FI.length); fh[FI.length - 1] = d[2];
    });
    FI.push([cs('', 'tot'), cs('Total number of types and count of Fraud indicators', 'tot'), cs('', 'tot'), cs('', 'tot'),
      { f: 'COUNTIF(E2:E6,"=Y")', v: [f1, f2, f3, f4, f5].filter(function (n) { return n > 0; }).length, s: 'totn' }, { f: 'SUM(F2:F6)', v: f1 + f2 + f3 + f4 + f5, s: 'totn' }]); fm.push('B7:D7');
    FI.push([]);
    FI.push([cs('#', 'th'), cs('Behavioural/Transactional Indicators', 'th'), cs('', 'th'), cs('', 'th'), cs('Identified?', 'th'), cs('Remarks', 'th')]); fm.push('B9:D9');
    [['Equal Credit Debit\nTotal amount of credit is exactly same as the total amount of debit, or total number of credit transactions is exactly same as the total number of debit transactions — both scenarios are extremely unlikely.', b6, 46],
      ['Negative EOD Balance\nEnd of day bank balance on any day in a Savings account is unlikely to be negative (not applied to OD / CC accounts).', b7, 32],
      ['Irregular Interest Charges\nInterest charges which are not in all months within a narrow date range.', b8, 32],
      ['Round figure Tax Payments\nTax paid amounts are usually not round figures, such as multiple of 100.', b9, 32],
      ['Irregular Transfers to Parties\nTransactions categorized as \'Transfer to ABC\' which are not in all months within a narrow date range (parties paid in 3+ months but skipping some).', b10, 46]].forEach(function (d, i) {
      FI.push(fcuRow(i + 6, d[0], d[1])); fm.push('B' + FI.length + ':D' + FI.length); fh[FI.length - 1] = d[2];
    });
    FI.push([cs('', 'tot'), cs('Total number of types and count of Behavioural/ transactional indicators', 'tot'), cs('', 'tot'), cs('', 'tot'),
      { f: 'COUNTIF(E10:E14,"=Y")', v: [b6, b7, b8, b9, b10].filter(function (n) { return n > 0; }).length, s: 'totn' }, { f: 'SUM(F10:F14)', v: b6 + b7 + b8 + b9 + b10, s: 'totn' }]); fm.push('B15:D15');
    FI.push([]);
    FI.push([cs('These are indicators only — a prompt for manual review, not proof of tampering or fraud.', 'note')]);
    sheets.push({ name: 'Fraud Checks', rows: FI, widths: [6, 14, 10, 72, 14, 18], merges: fm, heights: fh, grid: false });

    /* ---------- 14. FCU Irregular Xns ---------- */
    var IX = [[cs('FCU irregular transactions', 'title')], [cs('Transactions that match common review triggers. A flag is a prompt for a human check, not a finding of fraud.', 'note')], []];
    IX.push(thr(['Sl No', 'Date', 'Indicator', 'Severity', 'Narration', 'Debit', 'Credit', 'Balance', 'Why flagged']));
    c.irregular.forEach(function (o) {
      var t = o.t; IX.push([cn(t.n, 'tdi'), cd(t.date), cs(o.ind, 'tdw'), cs(o.sev, o.sev === 'HIGH' ? 'high' : 'med'), cs(t.desc, 'tdw'), cn(t.debit > 0 ? t.debit : ''), cn(t.credit > 0 ? t.credit : ''), cn(t.balance), cs(o.why, 'tdw')]);
    });
    if (!c.irregular.length) IX.push([cs('No irregular transactions identified', 'td')]);
    sheets.push({ name: 'Flagged Transactions', rows: IX, widths: [8, 13, 34, 11, 62, 15, 15, 16, 70] });

    /* ---------- extra sheets (beyond the standard 14) ---------- */
    // Insights: score, key metrics, findings
    var IN = [[cs('Insights', 'title')], [cs('Indicative only — not a credit decision.', 'note')], []];
    IN.push(thr(['Key metric', 'Value']));
    ins.metrics.forEach(function (mm) { IN.push([cs(mm[0], 'td'), mm[2] === 'inr' ? cn(mm[1], 'tdn') : (mm[2] === 'n' ? cn(mm[1], 'tdi') : cs(mm[1], 'td'))]); });
    IN.push([cs('Behaviour score (0-100)', 'td'), cs(ins.score + ' — ' + ins.grade, 'td')]);
    IN.push([cs('Obligation ratio (FOIR)', 'td'), ins.foir == null ? cs('n/a', 'td') : cn(ins.foir, 'tdp')]);
    IN.push([]); IN.push([cs('Findings', 'h2')]); IN.push(thr(['Level', 'Finding', 'Detail']));
    var LV = { high: 'HIGH', med: 'MEDIUM', low: 'LOW', info: 'INFO', good: 'POSITIVE' };
    ins.flags.forEach(function (f) { IN.push([cs(LV[f.level], f.level), cs(f.title, 'tdw'), cs(f.detail, 'tdw')]); });
    if (ins.circ && ins.circ.length) {
      IN.push([]); IN.push([cs('Two-way parties (both credits and debits)', 'h2')]); IN.push(thr(['Party', 'Credits', 'Debits']));
      ins.circ.forEach(function (x) { IN.push([cs(x.name, 'td'), cn(x.cr, 'tdn'), cn(x.dr, 'tdn')]); });
    }
    sheets.push({ name: 'Insights', rows: IN, widths: [58, 40, 70] });

    // Monthly ratios
    var MR = [[cs('Monthwise derived ratios', 'title')], []];
    MR.push([cs('Ratio', 'th')].concat(mdesc.map(function (x) { return cs(ml(x.key), 'th'); }), [cs('AVERAGE', 'th')]));
    [['Credit / Debit turnover (x)', function (x) { return x.drA > 0 ? r2(x.crA / x.drA) : ''; }, 'tdn'],
      ['Net credits (excl. own transfers, loans, refunds, interest)', function (x) { return x.netCrA; }, 'tdn'],
      ['Net debits (excl. own transfers)', function (x) { return x.netDrA; }, 'tdn'],
      ['Net cash flow (credits − debits)', function (x) { return r2(x.crA - x.drA); }, 'tdn'],
      ['EMI / net credits %', function (x) { return x.netCrA > 0 ? x.emiA / x.netCrA : ''; }, 'tdp'],
      ['Cash deposits % of credits', function (x) { return x.crA > 0 ? x.cashDepA / x.crA : ''; }, 'tdp'],
      ['Cash withdrawals % of debits', function (x) { return x.drA > 0 ? x.cashWdlA / x.drA : ''; }, 'tdp'],
      ['Own-account transfers % of credits', function (x) { return x.crA > 0 ? x.selfCrA / x.crA : ''; }, 'tdp'],
      ['Average balance / total debits (x)', function (x) { return x.drA > 0 && x.adb != null ? r2(x.adb / x.drA) : ''; }, 'tdn'],
      ['OD / CC utilisation % (average overdrawn ÷ limit)', function (x) { return LIM > 0 && x.utilAvg != null ? x.utilAvg / 100 : ''; }, 'tdp'],
      ['Minimum balance', function (x) { return x.minB; }, 'tdn'], ['Closing balance', function (x) { return x.closeB; }, 'tdn']].forEach(function (d) {
      var vals = mdesc.map(function (x) { return d[1](x); }), nums = vals.filter(function (v) { return typeof v === 'number'; });
      MR.push([cs(d[0], 'td')].concat(vals.map(function (v) { return cn(v, d[2]); }), [cn(nums.length ? (d[2] === 'tdp' ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : mean(nums)) : '', d[2])]));
    });
    sheets.push({ name: 'Ratios', rows: MR, widths: [52].concat(mdesc.map(function () { return 17; }), [17]), freeze: 'B4' });

    // Document checks: statement summary + file forensics + statement checks
    var SD = [[cs('Statement summary', 'title')],
      [cs('Statement period', 'lbl'), cs(stm.from ? fmtDate(stm.from) + ' to ' + fmtDate(stm.to) : '', 'val')],
      [cs('Months covered', 'lbl'), cn(monthly.length, 'tdi')],
      [cs('Months with no transactions', 'lbl'), cs(monthly.filter(function (x) { return !x.n; }).map(function (x) { return ml(x.key); }).join(', ') || 'None', 'val')],
      [cs('Files processed', 'lbl'), cn((stm.files || []).length || 1, 'tdi')], [cs('Total transactions', 'lbl'), cn(txns.length, 'tdi')],
      [cs('Opening balance', 'lbl'), cn(stm.opening)], [cs('Closing balance', 'lbl'), cn(stm.closing)],
      [cs('Opening + credits − debits = closing', 'lbl'), cs(stm.reconciled == null ? 'Not verifiable' : (stm.reconciled ? 'PASS' : 'FAIL'), stm.reconciled === false ? 'high' : 'good')],
      [cs('Running-balance check', 'lbl'), cs(stm.chainRatio == null ? 'No balances' : Math.round(stm.chainRatio * 100) + '% rows verified', 'val')], [],
      [cs('File checks', 'h2')], thr(['File', 'Type', 'Software (Producer / Creator)', 'Created', 'Modified', 'Pages', 'Result', 'Findings'])];
    fx.rows.forEach(function (r) { var lv = r.level === 'high' ? 'high' : (r.level === 'med' ? 'med' : (r.level === 'low' ? 'low' : 'good')); SD.push([cs(r.name, 'tdw'), cs(r.info.kind || ''), cs(r.software, 'tdw'), cd(r.created), cd(r.modified), cn(r.info.pages != null ? r.info.pages : '', 'tdi'), cs(r.result, lv), cs(r.findings.join(' '), 'tdw')]); });
    SD.push([]); SD.push([cs('Statement checks', 'h2')]); SD.push(thr(['Check', 'Result', 'Details']));
    (c.legacy['Statement Checks'] || []).slice(1).forEach(function (r) { var res = String(r[1]); SD.push([cs(r[0], 'tdw'), cs(res, res === 'PASS' ? 'good' : (res === 'REVIEW' || res === 'FAIL' ? 'med' : 'info')), cs(r[2], 'tdw')]); });
    sheets.push({ name: 'File Checks', rows: SD, widths: [52, 16, 34, 13, 13, 8, 12, 96] });
    var ORDER = ['Summary', 'Ratios', 'Daily Balances', 'Own Transfers', 'Bounces & Penalties', 'Top Credits', 'Top Debits', 'Recurring Credits', 'Recurring Debits', 'All Transactions', 'Loans & EMIs', 'Files Used', 'Fraud Checks', 'Flagged Transactions', 'Insights', 'Parties', 'File Checks'];
    return sheets.slice().sort(function (x, y) { return ORDER.indexOf(x.name) - ORDER.indexOf(y.name); });
  }

  var API = {
    buildWorkbook: buildWorkbook, rangeStatement: rangeStatement, bankNames: BANKS.map(function (b) { return b[0]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }), parseAmt: parseAmt, matchDate: matchDate, fullDate: fullDate, itemsToWords: itemsToWords, groupWords: groupWords, rowsFromMatrix: rowsFromMatrix,
    parseDocument: parseDocument, parseDocumentMulti: parseDocumentMulti, mergeStatements: mergeStatements, relation: relation, recompute: recompute, txnKey: txnKey, applyFixes: applyFixes, swapCandidates: swapCandidates, consolidate: consolidate, consolidatedSheets: consolidatedSheets, sameAccount: sameAccount, normAcct: normAcct,
    buildReport: buildReport, windowStatement: windowStatement, docChecks: docChecks, fmtDate: fmtDate, monthLabel: monthLabel, classify: classify
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.StatementEngine = API;
})(typeof window !== 'undefined' ? window : this);
