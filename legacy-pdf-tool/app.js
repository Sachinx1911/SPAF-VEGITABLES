/* SPAF — sale report (.xls) -> delivery challan / matrix / quantity PDFs.
   Everything runs locally in the browser; no file ever leaves this machine. */
(function () {
  'use strict';

  var LS = 'spaf.masters.v1';
  var $ = function (s) { return document.querySelector(s); };

  // ---------------------------------------------------------------- masters

  var M = load();

  function defaults() {
    return {
      parties: JSON.parse(JSON.stringify(window.DEFAULT_PARTIES)),
      items: JSON.parse(JSON.stringify(window.DEFAULT_ITEMS)),
      wsheet: window.DEFAULT_ITEM_QTY_LIST.slice(),
      maxCols: window.DEFAULT_MAX_COLS
    };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS));
      if (s && s.parties && s.items) {
        if (!s.wsheet) s.wsheet = window.DEFAULT_ITEM_QTY_LIST.slice();
        if (!s.maxCols) s.maxCols = window.DEFAULT_MAX_COLS;
        return s;
      }
    } catch (e) { /* corrupt or unavailable storage -> fall back to defaults */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(M)); return true; }
    catch (e) { return false; }
  }

  // ------------------------------------------------------------ excel input

  var clean = function (v) {
    return String(v == null ? '' : v).replace(/​/g, '').replace(/\s+/g, ' ').trim();
  };

  function readWorkbook(buf) {
    var wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    var sh = wb.Sheets['Sale Items'];
    if (!sh) throw new Error('This file has no "Sale Items" sheet. Export the Sale Report with item details.');
    var g = XLSX.utils.sheet_to_json(sh, { header: 1, raw: true, defval: '' });

    var hr = -1;
    for (var i = 0; i < Math.min(g.length, 15); i++) {
      if (g[i].map(clean).indexOf('Item Name') > -1) { hr = i; break; }
    }
    if (hr < 0) throw new Error('Could not find the header row (no "Item Name" column).');

    var head = g[hr].map(clean);
    var col = function (n) { return head.indexOf(n); };
    var cP = col('Party Name'), cI = col('Item Name'),
        cQ = col('Quantity'), cU = col('Unit'), cD = col('Date');
    if (cP < 0 || cI < 0 || cQ < 0) throw new Error('Missing a Party Name / Item Name / Quantity column.');

    var rows = [], dates = {};
    for (var r = hr + 1; r < g.length; r++) {
      var p = clean(g[r][cP]), it = clean(g[r][cI]);
      if (!p || !it) continue;
      var q = g[r][cQ];
      q = typeof q === 'number' ? q : parseFloat(String(q).replace(/,/g, ''));
      if (!isFinite(q)) q = 0;
      rows.push({ party: p, item: it, qty: q, unit: cU < 0 ? '' : clean(g[r][cU]) });
      if (cD > -1) { var d = fmtDate(g[r][cD]); if (d) dates[d] = (dates[d] || 0) + 1; }
    }
    if (!rows.length) throw new Error('The "Sale Items" sheet has no order rows.');

    var best = '', n = 0;
    for (var k in dates) if (dates[k] > n) { n = dates[k]; best = k; }
    return { rows: rows, date: best || fmtDate(new Date()) };
  }

  function fmtDate(v) {
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    if (v instanceof Date && !isNaN(v)) return pad(v.getDate()) + '-' + pad(v.getMonth() + 1) + '-' + v.getFullYear();
    var s = clean(v), m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    return m ? pad(+m[1]) + '-' + pad(+m[2]) + '-' + m[3] : '';
  }

  // ------------------------------------------------------------ build model

  function build(src) {
    var qty = {}, seenP = {}, seenI = {};
    src.rows.forEach(function (r) {
      (qty[r.party] = qty[r.party] || {});
      qty[r.party][r.item] = (qty[r.party][r.item] || 0) + r.qty;
      seenP[r.party] = 1; seenI[r.item] = 1;
    });

    var byParty = {};
    M.parties.forEach(function (p) { byParty[p.party] = p; });
    var parties = M.parties.filter(function (p) { return seenP[p.party]; });
    var newParties = Object.keys(seenP).filter(function (p) { return !byParty[p]; }).sort();
    newParties.forEach(function (p) { parties.push({ code: '??', short: p.slice(0, 16), party: p }); });

    var byItem = {};
    M.items.forEach(function (it) { byItem[it.name] = it; });
    var items = M.items.filter(function (it) { return seenI[it.name]; });
    var newItems = Object.keys(seenI).filter(function (i) { return !byItem[i]; }).sort();
    newItems.forEach(function (i) { items.push({ name: i, type: 'Uncategorised' }); });

    var totals = {};
    items.forEach(function (it) {
      var t = 0;
      parties.forEach(function (p) { t += (qty[p.party] || {})[it.name] || 0; });
      totals[it.name] = t;
    });

    return {
      date: src.date, qty: qty, parties: parties, items: items, totals: totals,
      newParties: newParties, newItems: newItems, lines: src.rows.length
    };
  }

  var num = function (v) {
    if (!v) return '';
    return (Math.round(v * 1000) / 1000).toString();
  };

  // ---------------------------------------------------------- pdf utilities

  function doc(landscape) {
    return new window.jspdf.jsPDF({
      unit: 'pt', format: 'letter', orientation: landscape ? 'landscape' : 'portrait'
    });
  }
  // Shrink a string until it fits `w`, adding an ellipsis when it had to be cut.
  function fit(d, s, w, size) {
    d.setFontSize(size);
    if (d.getTextWidth(s) <= w) return s;
    while (s.length > 1 && d.getTextWidth(s + '…') > w) s = s.slice(0, -1);
    return s + '…';
  }
  function splitEven(list, maxCols) {
    var n = Math.max(1, Math.ceil(list.length / maxCols));
    var base = Math.floor(list.length / n), rem = list.length % n, out = [], i = 0;
    for (var k = 0; k < n; k++) {
      var take = base + (k < rem ? 1 : 0);
      out.push(list.slice(i, i + take)); i += take;
    }
    return out;
  }
  // Walk items in master order, emitting a category break before each new group.
  function grouped(items, keep) {
    var out = [], last = null;
    items.forEach(function (it) {
      if (keep && !keep(it)) return;
      out.push({ item: it, head: it.type !== last });
      last = it.type;
    });
    return out;
  }

  // ------------------------------------------------- 1. matrix sheets 1/2/3

  function genMatrix(m) {
    var chunks = splitEven(m.parties, M.maxCols), out = [];

    chunks.forEach(function (chunk, ci) {
      var d = doc(false), W = 612, H = 792, MG = 28;
      var nameW = 128, totW = 30;
      var colW = (W - 2 * MG - nameW - totW) / chunk.length;
      var headH = 96, rowH = 11, x0 = MG;
      var bodyTop = 0, y = 0;

      var rows = grouped(m.items, function (it) {
        return chunk.some(function (p) { return (m.qty[p.party] || {})[it.name]; });
      });

      function header(page, pages) {
        d.setFont('helvetica', 'normal').setFontSize(9);
        d.text('Date:-' + m.date, MG, MG + 4);
        d.setFontSize(8).setTextColor(110);
        d.text('Sheet ' + (ci + 1) + ' of ' + chunks.length + '   ·   page ' + page + '/' + pages,
               W - MG, MG + 4, { align: 'right' });
        d.setTextColor(0);

        var top = MG + 12;
        d.setLineWidth(0.5).setDrawColor(80);
        d.rect(x0, top, W - 2 * MG, headH);
        d.setFontSize(7.5).setFont('helvetica', 'bold');
        d.text('Item Name', x0 + 4, top + headH - 4);
        d.setFont('helvetica', 'normal').setFontSize(6);
        chunk.forEach(function (p, i) {
          var cx = x0 + nameW + i * colW;
          d.line(cx, top, cx, top + headH);
          var label = p.code + '_' + p.short;
          d.text(fit(d, label, headH - 8, 6), cx + colW / 2 + 2, top + headH - 4, { angle: 90 });
        });
        var tx = x0 + nameW + chunk.length * colW;
        d.line(tx, top, tx, top + headH);
        d.setFont('helvetica', 'bold').setFontSize(6);
        d.text('Total', tx + totW / 2 + 2, top + headH - 4, { angle: 90 });
        d.setFont('helvetica', 'normal');
        bodyTop = top + headH;
        y = bodyTop;
      }

      function verticals(to) {
        d.setLineWidth(0.4).setDrawColor(150);
        d.line(x0, bodyTop, x0, to);
        for (var i = 0; i <= chunk.length; i++) {
          var cx = x0 + nameW + i * colW;
          d.line(cx, bodyTop, cx, to);
        }
        var tx = x0 + nameW + chunk.length * colW;
        d.line(tx + totW, bodyTop, tx + totW, to);
        d.line(x0, to, x0 + nameW + chunk.length * colW + totW, to);
      }

      // Lay out once to count pages, then draw for real.
      var perPage = Math.floor((H - MG - (MG + 12 + headH)) / rowH);
      var pages = Math.max(1, Math.ceil(rows.length / perPage));

      var page = 1;
      header(page, pages);
      rows.forEach(function (row) {
        if (y + rowH > H - MG) {
          verticals(y); d.addPage(); page++; header(page, pages);
        }
        var it = row.item;
        d.setLineWidth(0.4).setDrawColor(150);
        if (row.head) {
          d.setFillColor(235, 240, 235);
          d.rect(x0, y, nameW + chunk.length * colW + totW, rowH, 'F');
          d.setFont('helvetica', 'bold').setFontSize(7);
          d.text(it.type, x0 + 3, y + rowH - 3);
          d.setFont('helvetica', 'normal');
          d.line(x0, y, x0 + nameW + chunk.length * colW + totW, y);
          y += rowH;
          if (y + rowH > H - MG) { verticals(y); d.addPage(); page++; header(page, pages); }
        }
        d.line(x0, y, x0 + nameW + chunk.length * colW + totW, y);
        d.setFontSize(6.5);
        d.text(fit(d, it.name, nameW - 6, 6.5), x0 + 3, y + rowH - 3);
        var tot = 0;
        chunk.forEach(function (p, i) {
          var v = (m.qty[p.party] || {})[it.name] || 0;
          if (!v) return;
          tot += v;
          d.setFontSize(6.5);
          d.text(num(v), x0 + nameW + i * colW + colW / 2, y + rowH - 3, { align: 'center' });
        });
        d.setFont('helvetica', 'bold').setFontSize(6.5);
        d.text(num(tot), x0 + nameW + chunk.length * colW + totW / 2, y + rowH - 3, { align: 'center' });
        d.setFont('helvetica', 'normal');
        y += rowH;
      });
      verticals(y);
      out.push({ name: (ci + 1) + ' SPAF.pdf', doc: d });
    });
    return out;
  }

  // ------------------------------------------------------ 2. total quantity

  function genTotal(m) {
    var d = doc(false), W = 612, H = 792, MG = 40;
    var typeW = 118, nameW = 250, totW = 70, rowH = 15;
    var y = 0;

    function header() {
      d.setFont('helvetica', 'bold').setFontSize(12);
      d.text(window.COMPANY, MG, MG + 6);
      d.setFont('helvetica', 'normal').setFontSize(10);
      d.text('Date:-' + m.date, MG, MG + 22);
      y = MG + 34;
      d.setFont('helvetica', 'bold').setFontSize(9).setDrawColor(80).setLineWidth(0.5);
      d.rect(MG, y, typeW + nameW + totW, rowH);
      d.text('Item Type', MG + 4, y + rowH - 4);
      d.text('Item Name', MG + typeW + 4, y + rowH - 4);
      d.text('Total', MG + typeW + nameW + totW - 4, y + rowH - 4, { align: 'right' });
      d.setFont('helvetica', 'normal');
      y += rowH;
    }

    header();
    var rows = grouped(m.items, function (it) { return m.totals[it.name]; });
    d.setDrawColor(150).setLineWidth(0.4);
    rows.forEach(function (row) {
      if (y + rowH > H - MG) { d.addPage(); header(); }
      var it = row.item;
      d.rect(MG, y, typeW, rowH);
      d.rect(MG + typeW, y, nameW, rowH);
      d.rect(MG + typeW + nameW, y, totW, rowH);
      d.setFontSize(9.5);
      if (row.head) { d.setFont('helvetica', 'bold'); d.text(fit(d, it.type, typeW - 6, 9), MG + 3, y + rowH - 4); d.setFont('helvetica', 'normal'); }
      d.setFontSize(9.5);
      d.text(fit(d, it.name, nameW - 6, 9.5), MG + typeW + 3, y + rowH - 4);
      d.setFont('helvetica', 'bold');
      d.text(num(m.totals[it.name]), MG + typeW + nameW + totW - 4, y + rowH - 4, { align: 'right' });
      d.setFont('helvetica', 'normal');
      y += rowH;
    });
    return [{ name: 'Total Quantity SPAF.pdf', doc: d }];
  }

  // ----------------------------------------------------- 3. delivery challan

  function genChallan(m) {
    var d = doc(false), W = 612, H = 792, MG = 40;
    var typeW = 118, nameW = 230, qtyW = 110, rowH = 15;
    var parties = m.parties.slice().sort(function (a, b) {
      return a.party < b.party ? -1 : a.party > b.party ? 1 : 0;
    });
    var first = true;

    parties.forEach(function (p) {
      var rows = grouped(m.items, function (it) { return (m.qty[p.party] || {})[it.name]; });
      if (!rows.length) return;
      if (!first) d.addPage();
      first = false;
      var y = 0;

      function header() {
        d.setFont('helvetica', 'bold').setFontSize(12);
        d.text(window.COMPANY, MG, MG + 6);
        d.setFont('helvetica', 'normal').setFontSize(10);
        d.text('Delivery Challan', MG, MG + 22);
        d.text('Date:-' + m.date, MG + typeW + nameW + qtyW, MG + 22, { align: 'right' });
        d.setFontSize(9).setTextColor(110);
        d.text('Party Name', MG, MG + 36);
        d.setTextColor(0);
        y = MG + 42;
        d.setFont('helvetica', 'bold').setFontSize(9).setDrawColor(80).setLineWidth(0.5);
        d.rect(MG, y, typeW + nameW + qtyW, rowH);
        d.text('Item Type', MG + 4, y + rowH - 4);
        d.text('Item Name', MG + typeW + 4, y + rowH - 4);
        d.text(fit(d, p.party, qtyW - 8, 9), MG + typeW + nameW + 4, y + rowH - 4);
        d.setFont('helvetica', 'normal');
        y += rowH;
      }

      header();
      d.setDrawColor(150).setLineWidth(0.4);
      rows.forEach(function (row) {
        if (y + rowH > H - MG) { d.addPage(); header(); d.setDrawColor(150).setLineWidth(0.4); }
        var it = row.item;
        d.rect(MG, y, typeW, rowH);
        d.rect(MG + typeW, y, nameW, rowH);
        d.rect(MG + typeW + nameW, y, qtyW, rowH);
        if (row.head) {
          d.setFont('helvetica', 'bold').setFontSize(9);
          d.text(fit(d, it.type, typeW - 6, 9), MG + 3, y + rowH - 4);
          d.setFont('helvetica', 'normal');
        }
        d.setFontSize(9.5);
        d.text(fit(d, it.name, nameW - 6, 9.5), MG + typeW + 3, y + rowH - 4);
        d.setFont('helvetica', 'bold');
        d.text(num((m.qty[p.party] || {})[it.name]), MG + typeW + nameW + 6, y + rowH - 4);
        d.setFont('helvetica', 'normal');
        y += rowH;
      });
    });
    return [{ name: 'Delivery Challan SPAF.pdf', doc: d }];
  }

  // ------------------------------------------------------- 4. item quantity

  function genItemQty(m) {
    var d = doc(true), W = 792, H = 612, MG = 36;
    var nameW = 150, boxW = 26, rowH = 26;
    var perLine = Math.floor((W - 2 * MG - nameW) / boxW);
    var y = 0;

    var wanted = M.wsheet.length
      ? M.wsheet.map(function (n) {
          return m.items.filter(function (it) { return it.name === n; })[0] || { name: n, type: '' };
        })
      : m.items.filter(function (it) { return m.totals[it.name]; });

    function header() {
      d.setFont('helvetica', 'bold').setFontSize(12);
      d.text(window.COMPANY, MG, MG + 6);
      d.setFont('helvetica', 'normal').setFontSize(10);
      d.text('Item Quantity   Date:-' + m.date, MG, MG + 21);
      y = MG + 32;
    }

    header();
    d.setDrawColor(120).setLineWidth(0.5);
    wanted.forEach(function (it) {
      var vals = [];
      m.parties.forEach(function (p) {
        var v = (m.qty[p.party] || {})[it.name];
        if (v) vals.push({ v: v, code: p.code });
      });
      if (!vals.length) return;

      for (var off = 0; off < vals.length; off += perLine) {
        if (y + rowH > H - MG) { d.addPage(); header(); d.setDrawColor(120).setLineWidth(0.5); }
        var slice = vals.slice(off, off + perLine);
        d.rect(MG, y, nameW, rowH);
        d.setFont('helvetica', 'bold').setFontSize(9);
        if (off === 0) d.text(fit(d, it.name, nameW - 8, 9), MG + 4, y + rowH / 2 + 3);
        else { d.setFont('helvetica', 'normal').setTextColor(140); d.text('…', MG + 4, y + rowH / 2 + 3); d.setTextColor(0); }
        d.setFont('helvetica', 'normal');
        slice.forEach(function (c, i) {
          var bx = MG + nameW + i * boxW;
          d.rect(bx, y, boxW, rowH);
          d.setFontSize(5).setTextColor(150);
          d.text(c.code, bx + boxW / 2, y + 6, { align: 'center' });
          d.setTextColor(0).setFontSize(9);
          d.text(num(c.v), bx + boxW / 2, y + rowH - 7, { align: 'center' });
        });
        y += rowH;
      }
    });
    return [{ name: 'Item Quantity SPAF.pdf', doc: d }];
  }

  // -------------------------------------------------------------------- ui

  var model = null;

  function show(msg, cls) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls; d.innerHTML = msg;
    $('#issues').appendChild(d);
  }

  function render() {
    $('#report').classList.remove('hide');
    $('#issues').innerHTML = '';
    var known = model.parties.length - model.newParties.length;
    $('#stats').innerHTML = [
      ['Date', model.date], ['Parties', model.parties.length],
      ['Items', model.items.length], ['Order lines', model.lines],
      ['Matrix sheets', splitEven(model.parties, M.maxCols).length]
    ].map(function (s) {
      return '<div class="stat"><b>' + s[1] + '</b><span>' + s[0] + '</span></div>';
    }).join('');

    if (model.newParties.length) {
      show('<b>' + model.newParties.length + ' party name(s) are not in the route master</b> — they got the ' +
        'code <code>??</code> and were printed last. Add them under <b>Masters</b> to fix their route position.<ul>' +
        model.newParties.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>', 'warn');
    }
    if (model.newItems.length) {
      show('<b>' + model.newItems.length + ' item(s) are not in the item master</b> — grouped under ' +
        '<i>Uncategorised</i> at the end. Add them under <b>Masters</b> to place them properly.<ul>' +
        model.newItems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>', 'warn');
    }
    if (!model.newParties.length && !model.newItems.length) {
      show('Every party and item matched the masters. Ready to print.', 'warn');
      $('#issues').lastChild.style.cssText = 'background:#eaf5ec;color:#245e39;border-color:#bcdfc6';
    }
    $('#genlog').textContent = '';
    if (known === 0) { /* nothing known: still allow, warnings already shown */ }
  }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function emit(list) {
    list.forEach(function (f) { f.doc.save(f.name); });
    var log = $('#genlog');
    log.textContent = 'Saved: ' + list.map(function (f) { return f.name; }).join(', ') +
      '  — check your Downloads folder.';
  }
  function guard(fn) {
    return function () {
      if (!model) return;
      try { emit(fn(model)); }
      catch (e) { show('PDF failed: ' + esc(e.message), 'err'); }
    };
  }

  function handle(file) {
    var fr = new FileReader();
    fr.onload = function () {
      $('#report').classList.remove('hide');
      $('#issues').innerHTML = '';
      try {
        model = build(readWorkbook(fr.result));
        render();
      } catch (e) {
        model = null;
        $('#stats').innerHTML = '';
        show('Could not read that file: ' + esc(e.message), 'err');
      }
    };
    fr.readAsArrayBuffer(file);
  }

  $('#drop').onclick = function () { $('#file').click(); };
  $('#file').onchange = function (e) { if (e.target.files[0]) handle(e.target.files[0]); };
  ['dragenter', 'dragover'].forEach(function (ev) {
    $('#drop').addEventListener(ev, function (e) { e.preventDefault(); $('#drop').classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    $('#drop').addEventListener(ev, function (e) { e.preventDefault(); $('#drop').classList.remove('over'); });
  });
  $('#drop').addEventListener('drop', function (e) {
    if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
  });

  $('#gMatrix').onclick = guard(genMatrix);
  $('#gChallan').onclick = guard(genChallan);
  $('#gTotal').onclick = guard(genTotal);
  $('#gItemQty').onclick = guard(genItemQty);
  $('#all').onclick = guard(function (m) {
    return genMatrix(m).concat(genChallan(m), genTotal(m), genItemQty(m));
  });

  // ------------------------------------------------------------ masters ui

  function partyRows() {
    var tb = $('#tblParties tbody');
    tb.innerHTML = '';
    M.parties.forEach(function (p, i) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><input value="' + esc(p.code) + '" data-f="code"></td>' +
        '<td><input value="' + esc(p.short) + '" data-f="short"></td>' +
        '<td><input value="' + esc(p.party) + '" data-f="party"></td>' +
        '<td><button title="Remove">×</button></td>';
      tr.querySelectorAll('input').forEach(function (inp) {
        inp.oninput = function () { M.parties[i][inp.dataset.f] = inp.value; };
      });
      tr.querySelector('button').onclick = function () { M.parties.splice(i, 1); partyRows(); };
      tb.appendChild(tr);
    });
  }
  function itemRows() {
    var tb = $('#tblItems tbody');
    tb.innerHTML = '';
    M.items.forEach(function (it, i) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><input value="' + esc(it.name) + '" data-f="name"></td>' +
        '<td><input value="' + esc(it.type) + '" data-f="type"></td>' +
        '<td><button title="Remove">×</button></td>';
      tr.querySelectorAll('input').forEach(function (inp) {
        inp.oninput = function () { M.items[i][inp.dataset.f] = inp.value; };
      });
      tr.querySelector('button').onclick = function () { M.items.splice(i, 1); itemRows(); };
      tb.appendChild(tr);
    });
  }
  function wsheetUi() {
    $('#wlist').value = M.wsheet.join('\n');
    $('#maxcols').value = M.maxCols;
  }

  function saved(btn) {
    var t = btn.textContent;
    btn.textContent = save() ? 'Saved ✓' : 'Could not save';
    setTimeout(function () { btn.textContent = t; }, 1400);
    if (model) render();
  }
  $('#saveP').onclick = function () { saved(this); };
  $('#saveI').onclick = function () { saved(this); };
  $('#saveW').onclick = function () {
    M.wsheet = $('#wlist').value.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s; });
    M.maxCols = Math.max(4, Math.min(30, parseInt($('#maxcols').value, 10) || 14));
    wsheetUi(); saved(this);
  };
  $('#addParty').onclick = function () { M.parties.push({ code: '', short: '', party: '' }); partyRows(); };
  $('#addItem').onclick = function () { M.items.push({ name: '', type: 'Indian Vegetables' }); itemRows(); };
  $('#resetP').onclick = $('#resetI').onclick = function () {
    if (!confirm('Discard your edits and go back to the built-in masters?')) return;
    M = defaults(); save(); partyRows(); itemRows(); wsheetUi();
  };

  function exportMasters() {
    var js = '// Master data - ' + window.COMPANY + '\n' +
      '// Exported from the app on ' + new Date().toLocaleString() + '\n\n' +
      'window.COMPANY = ' + JSON.stringify(window.COMPANY) + ';\n\n' +
      'window.DEFAULT_PARTIES = ' + JSON.stringify(M.parties, null, 1) + ';\n\n' +
      'window.DEFAULT_ITEMS = ' + JSON.stringify(M.items, null, 1) + ';\n\n' +
      'window.DEFAULT_ITEM_QTY_LIST = ' + JSON.stringify(M.wsheet, null, 1) + ';\n\n' +
      'window.DEFAULT_MAX_COLS = ' + M.maxCols + ';\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
    a.download = 'masters.js';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  $('#expP').onclick = $('#expI').onclick = exportMasters;

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      ['parties', 'items', 'wsheet'].forEach(function (t) {
        $('#tab-' + t).classList.toggle('hide', t !== b.dataset.tab);
      });
    };
  });

  partyRows(); itemRows(); wsheetUi();

  // Exposed so the layout can be previewed/verified without downloading:
  //   SPAF.preview(SPAF.gen.matrix)  -> opens the PDF in a new tab
  window.SPAF = {
    get model() { return model; },
    get masters() { return M; },
    gen: { matrix: genMatrix, challan: genChallan, total: genTotal, itemQty: genItemQty },
    load: handle,
    preview: function (fn, i) {
      return fn(model)[i || 0].doc.output('bloburl').toString();
    }
  };
})();
