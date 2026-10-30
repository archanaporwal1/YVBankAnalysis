/* xlsxout.js — tiny dependency-free .xlsx writer with cell styling (fills, borders, number formats, merges, freeze panes, autofilter).
   API: YVXlsx.build([{ name, rows:[[cell,...]], widths:[..], merges:['A1:C1'], freeze:'A2', filter:'A1:K20', tab:'FF0000' }]) -> Uint8Array
   cell = string | number | null | { v, t:'n'|'s', z:'numFmt', s:'styleName' }  */
(function (root) {
  'use strict';
  var COL = { orange: 'F4B183', teal: 'B7E4E4', tan: 'F8D9A0', month: 'FFE699', blue: '4472C4', lblue: 'DDEBF7', itembg: 'E9DDB5', grey: 'F2F2F2', red: 'FCE4E4', green: 'E2F0D9', amber: 'FFF2CC' };
  var THIN = { l: 1, r: 1, t: 1, b: 1 };
  // named styles → spec
  var STY = {
    title: { b: 1, sz: 14 }, h2: { b: 1, sz: 12 }, bold: { b: 1 }, note: { i: 1, color: '595959' }, wrap: { wrap: 1 },
    lbl: { fill: COL.orange, border: THIN, b: 0 }, val: { fill: COL.teal, border: THIN },
    valn: { fill: COL.teal, border: THIN, z: '#,##0.00;[Red]-#,##0.00', al: 'left' },
    itemh: { fill: 'B4C6E7', border: THIN, b: 1, al: 'center' }, monthh: { fill: COL.month, border: THIN, b: 1, al: 'center' },
    item: { fill: COL.tan, border: THIN, indent: 1 },
    data: { fill: COL.lblue, border: THIN, z: '#,##0.00;[Red]-#,##0.00', al: 'right' },
    datai: { fill: COL.lblue, border: THIN, z: '#,##0', al: 'right' },
    datap: { fill: COL.lblue, border: THIN, z: '0.00%', al: 'right' },
    datat: { fill: COL.lblue, border: THIN, al: 'right' },
    th: { fill: COL.blue, color: 'FFFFFF', b: 1, border: THIN, al: 'center', wrap: 1 },
    td: { border: THIN }, tdn: { border: THIN, z: '#,##0.00;[Red]-#,##0.00', al: 'right' }, tdi: { border: THIN, z: '#,##0', al: 'right' },
    tdp: { border: THIN, z: '0.0%', al: 'right' }, tdd: { border: THIN, z: 'dd-mmm-yyyy', al: 'center' }, tdw: { border: THIN, wrap: 1 },
    tot: { b: 1, fill: COL.grey, border: THIN }, totn: { b: 1, fill: COL.grey, border: THIN, z: '#,##0.00;[Red]-#,##0.00', al: 'right' },
    sec: { b: 1, fill: COL.itembg, border: THIN },
    high: { b: 1, fill: 'F8CBAD', border: THIN }, med: { b: 1, fill: COL.amber, border: THIN }, low: { fill: COL.amber, border: THIN }, good: { fill: COL.green, border: THIN }, info: { fill: COL.grey, border: THIN }
  };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function crc32(buf) {
    var t = crc32.t; if (!t) { t = crc32.t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s); return new Uint8Array(Buffer.from(s, 'utf8')); }
  function zip(files) { // store only
    var parts = [], central = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; } function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      var h = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(h), name, data);
      central.push({ name: name, crc: crc, size: data.length, off: off });
      off += h.length + name.length + data.length;
    });
    var cdStart = off, cdSize = 0;
    central.forEach(function (c) {
      var h = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
      parts.push(new Uint8Array(h), c.name); cdSize += h.length + c.name.length;
    });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0))));
    var total = 0; parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), p = 0; parts.forEach(function (x) { out.set(x, p); p += x.length; }); return out;
  }
  function build(sheets) {
    var fonts = ['<font><sz val="10"/><name val="Arial"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
      borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    var fmap = {}, flmap = {}, bmap = {}, nmap = {}, xmap = {};
    function getFont(sp) {
      var k = [sp.b ? 1 : 0, sp.i ? 1 : 0, sp.sz || 10, sp.color || ''].join('|'); if (k === '0|0|10|') return 0; if (fmap[k] != null) return fmap[k];
      fonts.push('<font>' + (sp.b ? '<b/>' : '') + (sp.i ? '<i/>' : '') + '<sz val="' + (sp.sz || 10) + '"/>' + (sp.color ? '<color rgb="FF' + sp.color + '"/>' : '') + '<name val="Arial"/></font>'); return (fmap[k] = fonts.length - 1);
    }
    function getFill(c) { if (!c) return 0; if (flmap[c] != null) return flmap[c]; fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FF' + c + '"/><bgColor indexed="64"/></patternFill></fill>'); return (flmap[c] = fills.length - 1); }
    function getBorder(b) { if (!b) return 0; var k = 'thin'; if (bmap[k] != null) return bmap[k]; var e = function (n) { return '<' + n + ' style="thin"><color rgb="FFA6A6A6"/></' + n + '>'; }; borders.push('<border>' + e('left') + e('right') + e('top') + e('bottom') + '<diagonal/></border>'); return (bmap[k] = borders.length - 1); }
    function getNum(z) { if (!z) return 0; if (z === '0') return 1; if (z === '0.00') return 2; if (z === '#,##0') return 3; if (z === '#,##0.00') return 4; if (z === '0%') return 9; if (z === '0.00%') return 10; if (nmap[z] != null) return nmap[z]; numFmts.push(z); return (nmap[z] = 163 + numFmts.length); }
    function xf(sp) {
      sp = sp || {}; var k = JSON.stringify(sp); if (xmap[k] != null) return xmap[k];
      var al = (sp.al || sp.wrap || sp.indent) ? '<alignment' + (sp.al ? ' horizontal="' + sp.al + '"' : '') + ' vertical="' + (sp.wrap ? 'top' : 'center') + '"' + (sp.wrap ? ' wrapText="1"' : '') + (sp.indent ? ' indent="' + sp.indent + '"' : '') + '/>' : '';
      var s = '<xf numFmtId="' + getNum(sp.z) + '" fontId="' + getFont(sp) + '" fillId="' + getFill(sp.fill) + '" borderId="' + getBorder(sp.border) + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"' + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>');
      xfs.push(s); return (xmap[k] = xfs.length - 1);
    }
    var sheetXml = sheets.map(function (sh) {
      var rows = sh.rows || [], maxC = 0, x = [];
      rows.forEach(function (r) { if (r.length > maxC) maxC = r.length; });
      (sh.widths || []).forEach(function (w, i) { if (i + 1 > maxC) maxC = i + 1; });
      x.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
      x.push('<sheetPr>' + (sh.tab ? '<tabColor rgb="FF' + sh.tab + '"/>' : '') + '</sheetPr>');
      x.push('<dimension ref="A1:' + colName(Math.max(0, maxC - 1)) + Math.max(1, rows.length) + '"/>');
      x.push('<sheetViews><sheetView workbookViewId="0" showGridLines="' + (sh.grid === false ? 0 : 1) + '">');
      if (sh.freeze) { var m = /^([A-Z]+)(\d+)$/.exec(sh.freeze); var ci = 0; m[1].split('').forEach(function (ch) { ci = ci * 26 + ch.charCodeAt(0) - 64; }); ci -= 1; var ri = +m[2] - 1;
        x.push('<pane' + (ci ? ' xSplit="' + ci + '"' : '') + (ri ? ' ySplit="' + ri + '"' : '') + ' topLeftCell="' + sh.freeze + '" activePane="' + (ci && ri ? 'bottomRight' : (ri ? 'bottomLeft' : 'topRight')) + '" state="frozen"/>'); }
      x.push('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="14"/>');
      if (sh.widths && sh.widths.length) { x.push('<cols>'); sh.widths.forEach(function (w, i) { x.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'); }); x.push('</cols>'); }
      x.push('<sheetData>');
      rows.forEach(function (r, ri) {
        var cells = [];
        for (var ci = 0; ci < r.length; ci++) {
          var c = r[ci]; if (c == null) continue; var ref = colName(ci) + (ri + 1), sp = null, v, t;
          if (typeof c === 'object') { v = c.v; t = c.t; sp = {}; var base = c.s && STY[c.s] ? STY[c.s] : {}; for (var k in base) sp[k] = base[k]; if (c.z) sp.z = c.z; }
          else { v = c; }
          if (typeof c === 'object' && c.f) { // formula cell with cached value
            var fs = sp ? ' s="' + xf(sp) + '"' : '', fnum = typeof v === 'number' && isFinite(v);
            cells.push('<c r="' + ref + '"' + fs + (fnum || v === '' || v == null ? '' : ' t="str"') + '><f>' + esc(c.f) + '</f>' + (fnum ? '<v>' + v + '</v>' : (v === '' || v == null ? '' : '<v>' + esc(v) + '</v>')) + '</c>');
            continue;
          }
          if (v === '' && !sp) continue;
          if (v == null || (v === '' && sp && !sp.fill && !sp.border)) { if (sp && (sp.fill || sp.border)) cells.push('<c r="' + ref + '" s="' + xf(sp) + '"/>'); continue; }
          if (v === '') { cells.push('<c r="' + ref + '" s="' + xf(sp) + '"/>'); continue; }
          var isNum = typeof v === 'number' && isFinite(v) && t !== 's';
          var sa = sp ? ' s="' + xf(sp) + '"' : '';
          if (isNum) cells.push('<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>');
          else cells.push('<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
        }
        var ht = sh.heights && sh.heights[ri] ? ' ht="' + sh.heights[ri] + '" customHeight="1"' : '';
        x.push('<row r="' + (ri + 1) + '"' + ht + '>' + cells.join('') + '</row>');
      });
      x.push('</sheetData>');
      if (sh.filter) x.push('<autoFilter ref="' + sh.filter + '"/>');
      if (sh.merges && sh.merges.length) { x.push('<mergeCells count="' + sh.merges.length + '">'); sh.merges.forEach(function (m) { x.push('<mergeCell ref="' + m + '"/>'); }); x.push('</mergeCells>'); }
      x.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>');
      return x.join('');
    });
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.map(function (z, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(z) + '"/>'; }).join('') + '</numFmts>' : '') +
      '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    var names = sheets.map(function (s, i) { return esc(String(s.name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31)); });
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' + names.map(function (n, i) { return '<sheet name="' + n + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: styles }
    ];
    sheetXml.forEach(function (x, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: x }); });
    return zip(files);
  }
  var API = { build: build, STYLES: STY };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.YVXlsx = API;
})(typeof window !== 'undefined' ? window : this);
